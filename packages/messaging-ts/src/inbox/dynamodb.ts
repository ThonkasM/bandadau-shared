import { type DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';

import { cancellationCode, commitTransaction, DynamoTransaction } from '../dynamodb-tx';
import type { Inbox, InboxKey, InboxResult } from './types';

export interface DynamoInboxOptions {
  client: DynamoDBDocumentClient;
  tableName: string;
  /** TTL attribute name of the table. Default `expiresAt`. */
  ttlAttribute?: string;
  /** Default 14 days. */
  ttlSeconds?: number;
  now?: () => Date;
}

/**
 * idempotencia.md 3.3: item `INBOX#<messageId>`/`META` put with `attribute_not_exists(pk)` inside the same
 * `TransactWriteItems` as the effect. `work` must only stage writes on the transaction (no external side effects).
 */
export class DynamoInbox implements Inbox<DynamoTransaction> {
  private readonly now: () => Date;

  constructor(private readonly options: DynamoInboxOptions) {
    this.now = options.now ?? (() => new Date());
  }

  async runOnce<R>(key: InboxKey, work: (tx: DynamoTransaction) => Promise<R>): Promise<InboxResult<R>> {
    const { client, tableName, ttlAttribute = 'expiresAt', ttlSeconds = 1_209_600 } = this.options;
    const inboxKey = { pk: `INBOX#${key.messageId}`, sk: 'META' };

    // cheap duplicate check so redeliveries do not even run the handler; the transaction condition closes the race
    const existing = await client.send(new GetCommand({ TableName: tableName, Key: inboxKey, ConsistentRead: true }));
    if (existing.Item) return { processed: false };

    const tx = new DynamoTransaction(tableName);
    const result = await work(tx);
    const now = this.now();
    const marker = new DynamoTransaction(tableName).put(
      { ...inboxKey, consumer: key.consumer, processedAt: now.toISOString(), [ttlAttribute]: Math.floor(now.getTime() / 1000) + ttlSeconds },
      'attribute_not_exists(pk)',
    );
    try {
      await commitTransaction(client, [...marker.items, ...tx.items]);
    } catch (error) {
      if (cancellationCode(error, 0) === 'ConditionalCheckFailed') return { processed: false };
      throw error;
    }
    return { processed: true, result };
  }
}
