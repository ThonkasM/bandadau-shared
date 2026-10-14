import type { ClientSession, Db, MongoClient } from 'mongodb';

import type { Inbox, InboxKey, InboxResult } from './types';

export interface MongoInboxOptions {
  client: MongoClient;
  db: Db;
  /** Default `processedMessages`. */
  collection?: string;
}

/**
 * idempotencia.md 3.2: `{ _id: <messageId>, consumer, processedAt }` written inside the same transaction
 * as the effect (replica set required). `work` can run more than once if MongoDB asks to retry the transaction.
 */
export class MongoInbox implements Inbox<ClientSession> {
  constructor(private readonly options: MongoInboxOptions) {}

  private get collection() {
    return this.options.db.collection<{ _id: string; consumer: string; processedAt: Date }>(this.options.collection ?? 'processedMessages');
  }

  /** Optional TTL index on `processedAt` (default 14 days). */
  async ensureIndexes(options: { ttlSeconds?: number } = {}): Promise<void> {
    await this.collection.createIndex({ processedAt: 1 }, { name: 'processedAt_ttl', expireAfterSeconds: options.ttlSeconds ?? 1_209_600 });
  }

  async runOnce<R>(key: InboxKey, work: (tx: ClientSession) => Promise<R>): Promise<InboxResult<R>> {
    const session = this.options.client.startSession();
    try {
      let outcome: InboxResult<R> = { processed: false };
      await session.withTransaction(async () => {
        // upsert instead of insert: a duplicate key error would abort the transaction on the server
        const res = await this.collection.updateOne(
          { _id: key.messageId },
          { $setOnInsert: { consumer: key.consumer, processedAt: new Date() } },
          { upsert: true, session },
        );
        if (res.upsertedCount === 0) {
          outcome = { processed: false };
          return;
        }
        outcome = { processed: true, result: await work(session) };
      });
      return outcome;
    } finally {
      await session.endSession();
    }
  }
}
