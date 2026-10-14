/** Failure that may succeed later (DB down, timeout, 503): the message goes to a retry queue. */
export class TransientError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'TransientError';
  }
}

/** Failure that will never succeed (bad schema, unknown type/version): straight to the DLQ. */
export class PermanentError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'PermanentError';
  }
}

/** The broker could not route a mandatory message (topology misconfiguration). */
export class UnroutableMessageError extends Error {
  constructor(
    readonly exchange: string,
    readonly routingKey: string,
    readonly messageId?: string,
  ) {
    super(`Message ${messageId ?? ''} was not routable: exchange=${exchange} routingKey=${routingKey}`);
    this.name = 'UnroutableMessageError';
  }
}

export class TopologyMissingError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'TopologyMissingError';
  }
}
