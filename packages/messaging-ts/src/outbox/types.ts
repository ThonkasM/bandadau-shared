import type { CloudEvent } from '../cloudevents';

export interface OutboxRecord {
  /** = CloudEvent id. */
  id: string;
  exchange: string;
  routingKey: string;
  payload: CloudEvent;
  /** AMQP headers saved with the row (traceparent/tracestate) so the relay can restore the trace context. */
  headers: Record<string, string>;
  createdAt: Date;
  attempts: number;
}

export interface EnqueueOptions {
  exchange?: string;
  routingKey?: string;
}

/**
 * Transactional outbox port. `Tx` is the unit of work of the adapter (Mongo `ClientSession`,
 * `DynamoTransaction`, `MemoryTx`): `enqueue` must write in the same transaction as the business effect.
 */
export interface Outbox<Tx> {
  enqueue(tx: Tx, event: CloudEvent, options?: EnqueueOptions): Promise<void>;
  /** Claims up to `limit` pending records for `leaseMs` so concurrent relays do not publish the same batch. */
  claimBatch(limit: number, leaseMs: number): Promise<OutboxRecord[]>;
  markPublished(id: string): Promise<void>;
  /** Records a failed publish attempt and releases the lease so the record is retried. */
  markFailed(id: string, error: string): Promise<void>;
}
