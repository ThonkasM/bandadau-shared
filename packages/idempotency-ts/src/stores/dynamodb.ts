import { DeleteCommand, type DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';

import {
  byteLength,
  DEFAULT_LOCK_SECONDS,
  DEFAULT_TTL_SECONDS,
  type IdempotencyStore,
  MAX_RESPONSE_BODY_BYTES,
  type ReserveInput,
  type ReserveOutcome,
  type StoredResponse,
} from '../types';

export interface DynamoIdempotencyStoreOptions {
  client: DynamoDBDocumentClient;
  /** Service prefix: items are keyed `<service>#<idempotency-key>`. */
  service: string;
  /** Default `bandada-idempotency`. */
  tableName?: string;
  ttlSeconds?: number;
  lockSeconds?: number;
  now?: () => number;
}

const isConditionalFailure = (e: unknown): boolean => (e as { name?: string })?.name === 'ConditionalCheckFailedException';

/** DynamoDB adapter following idempotencia.md section 2.2 (conditional PutItem, consistent reads, orphan takeover). */
export class DynamoIdempotencyStore implements IdempotencyStore {
  private readonly table: string;
  private readonly ttl: number;
  private readonly lock: number;
  private readonly now: () => number;

  constructor(private readonly options: DynamoIdempotencyStoreOptions) {
    this.table = options.tableName ?? 'bandada-idempotency';
    this.ttl = options.ttlSeconds ?? DEFAULT_TTL_SECONDS;
    this.lock = options.lockSeconds ?? DEFAULT_LOCK_SECONDS;
    this.now = options.now ?? Date.now;
  }

  private pk(key: string): string {
    return `${this.options.service}#${key}`;
  }

  async reserve(input: ReserveInput): Promise<ReserveOutcome> {
    const pk = this.pk(input.key);
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const nowS = Math.floor(this.now() / 1000);
      try {
        await this.options.client.send(
          new PutCommand({
            TableName: this.table,
            Item: {
              pk,
              status: 'IN_PROGRESS',
              requestHash: input.requestHash,
              principal: input.principal,
              method: input.method,
              path: input.path,
              lockExpiresAt: nowS + this.lock,
              createdAt: new Date(nowS * 1000).toISOString(),
              expiresAt: nowS + this.ttl,
            },
            ConditionExpression: 'attribute_not_exists(pk) OR expiresAt < :now',
            ExpressionAttributeValues: { ':now': nowS },
          }),
        );
        return { kind: 'reserved', orphanTakeover: false };
      } catch (error) {
        if (!isConditionalFailure(error)) throw error;
      }

      const { Item: item } = await this.options.client.send(new GetCommand({ TableName: this.table, Key: { pk }, ConsistentRead: true }));
      if (!item) continue; // deleted between the failed put and the read: reserve again
      if (item.requestHash !== input.requestHash || item.principal !== input.principal) return { kind: 'key_reused' };
      if (item.status === 'COMPLETED') {
        if (item.responseTooLarge) return { kind: 'response_unavailable' };
        return {
          kind: 'replay',
          response: {
            status: item.responseStatus as number,
            headers: (item.responseHeaders ?? {}) as Record<string, string>,
            body: item.responseBody as string | undefined,
          },
        };
      }
      if ((item.lockExpiresAt as number) < nowS) {
        try {
          await this.options.client.send(
            new UpdateCommand({
              TableName: this.table,
              Key: { pk },
              UpdateExpression: 'SET lockExpiresAt = :newLock',
              ConditionExpression: '#s = :inProgress AND lockExpiresAt < :now AND requestHash = :h',
              ExpressionAttributeNames: { '#s': 'status' },
              ExpressionAttributeValues: { ':newLock': nowS + this.lock, ':inProgress': 'IN_PROGRESS', ':now': nowS, ':h': input.requestHash },
            }),
          );
          return { kind: 'reserved', orphanTakeover: true };
        } catch (error) {
          if (!isConditionalFailure(error)) throw error;
        }
      }
      return { kind: 'in_progress' };
    }
    return { kind: 'in_progress' };
  }

  async complete(key: string, response: StoredResponse): Promise<void> {
    const tooLarge = response.body !== undefined && byteLength(response.body) > MAX_RESPONSE_BODY_BYTES;
    const sets = ['#s = :completed', 'responseStatus = :st', 'responseHeaders = :hd', 'completedAt = :t'];
    const values: Record<string, unknown> = {
      ':completed': 'COMPLETED',
      ':inProgress': 'IN_PROGRESS',
      ':st': response.status,
      ':hd': response.headers,
      ':t': new Date(this.now()).toISOString(),
    };
    if (tooLarge) {
      sets.push('responseTooLarge = :big');
      values[':big'] = true;
    } else if (response.body !== undefined) {
      sets.push('responseBody = :b');
      values[':b'] = response.body;
    }
    try {
      await this.options.client.send(
        new UpdateCommand({
          TableName: this.table,
          Key: { pk: this.pk(key) },
          UpdateExpression: `SET ${sets.join(', ')}`,
          ConditionExpression: '#s = :inProgress',
          ExpressionAttributeNames: { '#s': 'status' },
          ExpressionAttributeValues: values,
        }),
      );
    } catch (error) {
      if (!isConditionalFailure(error)) throw error;
    }
  }

  async release(key: string): Promise<void> {
    try {
      await this.options.client.send(
        new DeleteCommand({
          TableName: this.table,
          Key: { pk: this.pk(key) },
          ConditionExpression: '#s = :inProgress',
          ExpressionAttributeNames: { '#s': 'status' },
          ExpressionAttributeValues: { ':inProgress': 'IN_PROGRESS' },
        }),
      );
    } catch (error) {
      if (!isConditionalFailure(error)) throw error;
    }
  }
}
