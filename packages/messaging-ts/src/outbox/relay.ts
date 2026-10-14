import { type Logger, noopLogger } from '../logger';
import type { RecordPublisher } from '../rabbit/publisher';
import type { Outbox } from './types';

export type RelayOutbox = Pick<Outbox<never>, 'claimBatch' | 'markPublished' | 'markFailed'>;

export interface OutboxRelayOptions {
  outbox: RelayOutbox;
  publisher: RecordPublisher;
  /** Default 500 ms (eventos-y-mensajeria.md 5.1). */
  pollIntervalMs?: number;
  batchSize?: number;
  /** Lease while a batch is being published. Default 30 s. */
  leaseMs?: number;
  logger?: Logger;
  onPublished?: (id: string) => void;
  onFailed?: (id: string, error: Error) => void;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Polling relay: claim a batch, publish with confirms, then mark published (or failed). At-least-once. */
export class OutboxRelay {
  private running = false;
  private loop?: Promise<void>;
  private readonly pollIntervalMs: number;
  private readonly batchSize: number;
  private readonly leaseMs: number;
  private readonly logger: Logger;

  constructor(private readonly options: OutboxRelayOptions) {
    this.pollIntervalMs = options.pollIntervalMs ?? 500;
    this.batchSize = options.batchSize ?? 100;
    this.leaseMs = options.leaseMs ?? 30_000;
    this.logger = options.logger ?? noopLogger;
  }

  /** Processes one batch. Returns how many records were published. */
  async tick(): Promise<number> {
    const records = await this.options.outbox.claimBatch(this.batchSize, this.leaseMs);
    let published = 0;
    for (const record of records) {
      try {
        await this.options.publisher.publishRecord(record);
      } catch (error) {
        const err = error as Error;
        this.logger.warn('outbox publish failed', { id: record.id, error: err.message });
        await this.options.outbox.markFailed(record.id, err.message).catch((e: Error) => this.logger.error('outbox markFailed failed', { id: record.id, error: e.message }));
        this.options.onFailed?.(record.id, err);
        continue;
      }
      // a crash here republishes the message: the consumer inbox absorbs it
      await this.options.outbox.markPublished(record.id);
      this.options.onPublished?.(record.id);
      published += 1;
    }
    return published;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.loop = this.run();
  }

  async stop(): Promise<void> {
    this.running = false;
    await this.loop;
  }

  private async run(): Promise<void> {
    while (this.running) {
      let handled = 0;
      try {
        handled = await this.tick();
      } catch (error) {
        this.logger.error('outbox relay tick failed', { error: (error as Error).message });
      }
      if (handled < this.batchSize && this.running) await sleep(this.pollIntervalMs);
    }
  }
}
