import { DeleteCommand, type DynamoDBDocumentClient, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';

import type { CloudEvent } from '../cloudevents';
import { type DynamoTransaction, isConditionalCheckFailed } from '../dynamodb-tx';
import { toOutboxRecord } from './shared';
import type { EnqueueOptions, Outbox, OutboxRecord } from './types';

export interface DynamoOutboxOptions {
  client: DynamoDBDocumentClient;
  /** The service table (`bandada-ticketing`, ...). */
  tableName: string;
  /** Default `GSI1` (attributes `gsi1pk`/`gsi1sk`). */
  indexName?: string;
  now?: () => Date;
}

const PENDING = 'OUTBOX#PENDING';

/**
 * eventos-y-mensajeria.md 5.3: item `OUTBOX#<id>`/`META` in the service table, pending ones listed through
 * GSI1 (`gsi1pk = OUTBOX#PENDING`), claimed with a lease, deleted once published.
 */
export class DynamoOutbox implements Outbox<DynamoTransaction> {
  private readonly now: () => Date;

  constructor(private readonly options: DynamoOutboxOptions) {
    this.now = options.now ?? (() => new Date());
  }

  /** Adds the outbox item to the caller's transaction (same TransactWriteItems as the effect). */
  async enqueue(tx: DynamoTransaction, event: CloudEvent, options?: EnqueueOptions): Promise<void> {
    const r = toOutboxRecord(event, options, this.now());
    tx.put({
      pk: `OUTBOX#${r.id}`,
      sk: 'META',
      gsi1pk: PENDING,
      gsi1sk: `${r.createdAt.toISOString()}#${r.id}`,
      exchange: r.exchange,
      routingKey: r.routingKey,
      payload: JSON.stringify(r.payload),
      headers: r.headers,
      createdAt: r.createdAt.toISOString(),
      attempts: 0,
    });
  }

  async claimBatch(limit: number, leaseMs: number): Promise<OutboxRecord[]> {
    const { client, tableName, indexName = 'GSI1' } = this.options;
    const nowMs = this.now().getTime();
    const { Items = [] } = await client.send(
      new QueryCommand({
        TableName: tableName,
        IndexName: indexName,
        KeyConditionExpression: 'gsi1pk = :p',
        ExpressionAttributeValues: { ':p': PENDING },
        ScanIndexForward: true,
        Limit: limit,
      }),
    );
    const claimed: OutboxRecord[] = [];
    for (const item of Items) {
      try {
        await client.send(
          new UpdateCommand({
            TableName: tableName,
            Key: { pk: item.pk, sk: 'META' },
            UpdateExpression: 'SET leaseUntil = :lease ADD attempts :one',
            ConditionExpression: 'attribute_exists(pk) AND (attribute_not_exists(leaseUntil) OR leaseUntil < :now)',
            ExpressionAttributeValues: { ':lease': nowMs + leaseMs, ':now': nowMs, ':one': 1 },
          }),
        );
      } catch (error) {
        if (isConditionalCheckFailed(error)) continue; // leased by another relay, or already published
        throw error;
      }
      claimed.push({
        id: String(item.pk).slice('OUTBOX#'.length),
        exchange: item.exchange as string,
        routingKey: item.routingKey as string,
        payload: JSON.parse(item.payload as string) as CloudEvent,
        headers: (item.headers ?? {}) as Record<string, string>,
        createdAt: new Date(item.createdAt as string),
        attempts: (item.attempts as number) + 1,
      });
    }
    return claimed;
  }

  async markPublished(id: string): Promise<void> {
    try {
      await this.options.client.send(
        new DeleteCommand({ TableName: this.options.tableName, Key: { pk: `OUTBOX#${id}`, sk: 'META' }, ConditionExpression: 'attribute_exists(pk)' }),
      );
    } catch (error) {
      if (!isConditionalCheckFailed(error)) throw error;
    }
  }

  async markFailed(id: string, error: string): Promise<void> {
    try {
      await this.options.client.send(
        new UpdateCommand({
          TableName: this.options.tableName,
          Key: { pk: `OUTBOX#${id}`, sk: 'META' },
          UpdateExpression: 'SET lastError = :e REMOVE leaseUntil',
          ConditionExpression: 'attribute_exists(pk)',
          ExpressionAttributeValues: { ':e': error.slice(0, 500) },
        }),
      );
    } catch (e) {
      if (!isConditionalCheckFailed(e)) throw e;
    }
  }
}
