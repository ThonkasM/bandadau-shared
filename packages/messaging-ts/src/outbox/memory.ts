import type { CloudEvent } from '../cloudevents';
import { toOutboxRecord } from './shared';
import type { EnqueueOptions, Outbox, OutboxRecord } from './types';

/** Unit of work of the in-memory adapters: staged outbox records are flushed when the work succeeds. */
export interface MemoryTx {
  staged: OutboxRecord[];
}

interface Entry {
  record: OutboxRecord;
  published: boolean;
  leaseUntil: number;
  lastError?: string;
}

export class InMemoryOutbox implements Outbox<MemoryTx | undefined> {
  private readonly entries = new Map<string, Entry>();

  constructor(private readonly now: () => number = Date.now) {}

  async enqueue(tx: MemoryTx | undefined, event: CloudEvent, options?: EnqueueOptions): Promise<void> {
    const record = toOutboxRecord(event, options, new Date(this.now()));
    if (tx) tx.staged.push(record);
    else this.insert(record);
  }

  /** Called by the in-memory inbox when the unit of work commits. */
  commit(tx: MemoryTx): void {
    for (const record of tx.staged) this.insert(record);
    tx.staged = [];
  }

  private insert(record: OutboxRecord): void {
    if (!this.entries.has(record.id)) this.entries.set(record.id, { record, published: false, leaseUntil: 0 });
  }

  async claimBatch(limit: number, leaseMs: number): Promise<OutboxRecord[]> {
    const now = this.now();
    const claimed: OutboxRecord[] = [];
    const pending = [...this.entries.values()]
      .filter((e) => !e.published && e.leaseUntil < now)
      .sort((a, b) => a.record.createdAt.getTime() - b.record.createdAt.getTime() || a.record.id.localeCompare(b.record.id));
    for (const entry of pending.slice(0, limit)) {
      entry.leaseUntil = now + leaseMs;
      entry.record.attempts += 1;
      claimed.push(structuredClone(entry.record));
    }
    return claimed;
  }

  async markPublished(id: string): Promise<void> {
    const entry = this.entries.get(id);
    if (entry) entry.published = true;
  }

  async markFailed(id: string, error: string): Promise<void> {
    const entry = this.entries.get(id);
    if (entry) {
      entry.leaseUntil = 0;
      entry.lastError = error;
    }
  }

  /** Test helpers. */
  all(): OutboxRecord[] {
    return [...this.entries.values()].map((e) => e.record);
  }

  pending(): OutboxRecord[] {
    return [...this.entries.values()].filter((e) => !e.published).map((e) => e.record);
  }
}
