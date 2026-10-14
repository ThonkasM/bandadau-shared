import type { InMemoryOutbox, MemoryTx } from '../outbox/memory';
import type { Inbox, InboxKey, InboxResult } from './types';

/**
 * In-memory inbox: same observable semantics as the DB adapters (duplicate detection, effect and outbox
 * committed together, concurrent duplicates serialized), for unit tests of use cases and consumers.
 */
export class InMemoryInbox implements Inbox<MemoryTx> {
  private readonly processed = new Set<string>();
  private readonly inFlight = new Map<string, Promise<unknown>>();

  constructor(private readonly outbox?: InMemoryOutbox) {}

  async runOnce<R>(key: InboxKey, work: (tx: MemoryTx) => Promise<R>): Promise<InboxResult<R>> {
    const id = key.messageId;
    while (this.inFlight.has(id)) await this.inFlight.get(id)!.catch(() => undefined);
    if (this.processed.has(id)) return { processed: false };

    const tx: MemoryTx = { staged: [] };
    const run = work(tx);
    this.inFlight.set(id, run);
    try {
      const result = await run;
      this.processed.add(id);
      this.outbox?.commit(tx);
      return { processed: true, result };
    } finally {
      this.inFlight.delete(id);
    }
  }

  has(key: InboxKey): boolean {
    return this.processed.has(key.messageId);
  }
}
