export type InboxResult<R> = { processed: true; result: R } | { processed: false };

export interface InboxKey {
  /** CloudEvent id. */
  messageId: string;
  /** Consumer (queue) name. */
  consumer: string;
}

/**
 * Inbox port (idempotencia.md section 3). `runOnce` registers the message id and runs `work` in the
 * same transaction: either both happen or none. A duplicate returns `{ processed: false }` and `work` is not run.
 * `work` may be invoked more than once if the engine retries a transient transaction failure.
 */
export interface Inbox<Tx> {
  runOnce<R>(key: InboxKey, work: (tx: Tx) => Promise<R>): Promise<InboxResult<R>>;
}
