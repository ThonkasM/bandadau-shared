import type { ClientSession, Db, Document } from 'mongodb';

import type { CloudEvent } from '../cloudevents';
import { toOutboxRecord } from './shared';
import type { EnqueueOptions, Outbox, OutboxRecord } from './types';

export interface MongoOutboxOptions {
  db: Db;
  /** Default `outbox`. */
  collection?: string;
  now?: () => Date;
}

interface OutboxDoc extends Document {
  _id: string;
  exchange: string;
  routingKey: string;
  payload: CloudEvent;
  headers: Record<string, string>;
  createdAt: Date;
  publishedAt: Date | null;
  lockedUntil: Date | null;
  attempts: number;
  lastError?: string;
}

/** eventos-y-mensajeria.md 5.2: collection `outbox`, claimed one document at a time with findOneAndUpdate. */
export class MongoOutbox implements Outbox<ClientSession | undefined> {
  private readonly now: () => Date;

  constructor(private readonly options: MongoOutboxOptions) {
    this.now = options.now ?? (() => new Date());
  }

  private get collection() {
    return this.options.db.collection<OutboxDoc>(this.options.collection ?? 'outbox');
  }

  /** Idempotent. TTL on `publishedAt` cleans published rows (default 7 days). */
  async ensureIndexes(options: { ttlSeconds?: number } = {}): Promise<void> {
    await this.collection.createIndex({ publishedAt: 1, createdAt: 1 }, { name: 'publishedAt_createdAt' });
    await this.collection.createIndex({ publishedAt: 1 }, { name: 'publishedAt_ttl', expireAfterSeconds: options.ttlSeconds ?? 604_800 });
  }

  /** Pass the same `session` as the business write so both commit atomically. */
  async enqueue(session: ClientSession | undefined, event: CloudEvent, options?: EnqueueOptions): Promise<void> {
    const r = toOutboxRecord(event, options, this.now());
    await this.collection.insertOne(
      { _id: r.id, exchange: r.exchange, routingKey: r.routingKey, payload: r.payload, headers: r.headers, createdAt: r.createdAt, publishedAt: null, lockedUntil: null, attempts: 0 },
      { session },
    );
  }

  async claimBatch(limit: number, leaseMs: number): Promise<OutboxRecord[]> {
    const claimed: OutboxRecord[] = [];
    for (let i = 0; i < limit; i += 1) {
      const now = this.now();
      const doc = await this.collection.findOneAndUpdate(
        { publishedAt: null, $or: [{ lockedUntil: null }, { lockedUntil: { $lt: now } }] },
        { $set: { lockedUntil: new Date(now.getTime() + leaseMs) }, $inc: { attempts: 1 } },
        { sort: { createdAt: 1, _id: 1 }, returnDocument: 'after' },
      );
      if (!doc) break;
      claimed.push({ id: doc._id, exchange: doc.exchange, routingKey: doc.routingKey, payload: doc.payload, headers: doc.headers ?? {}, createdAt: doc.createdAt, attempts: doc.attempts });
    }
    return claimed;
  }

  async markPublished(id: string): Promise<void> {
    await this.collection.updateOne({ _id: id }, { $set: { publishedAt: this.now() }, $unset: { lockedUntil: '' } });
  }

  async markFailed(id: string, error: string): Promise<void> {
    await this.collection.updateOne({ _id: id }, { $set: { lockedUntil: null, lastError: error.slice(0, 500) } });
  }
}
