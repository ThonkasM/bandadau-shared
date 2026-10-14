import { PermanentError } from './errors';
import { uuidv7 } from './uuid';

export const CLOUDEVENTS_CONTENT_TYPE = 'application/cloudevents+json';

/** CloudEvents 1.0 (structured mode) with Bandada extensions (eventos-y-mensajeria.md section 3). */
export interface CloudEvent<T = unknown> {
  specversion: '1.0';
  /** UUIDv7; also the outbox id and the inbox key. */
  id: string;
  /** `/services/<service>` */
  source: string;
  /** Routing key, e.g. `bandada.wallet.cmd.debit-credits.v1`. */
  type: string;
  time: string;
  /** `<entity>/<id>` of the aggregate. */
  subject?: string;
  datacontenttype: 'application/json';
  data: T;
  correlationid?: string;
  causationid?: string;
  sagaid?: string;
  traceparent?: string;
  tracestate?: string;
}

export interface CreateCloudEventInput<T> {
  type: string;
  /** Service name (`events-service`) or full source (`/services/events-service`). */
  source: string;
  data: T;
  subject?: string;
  id?: string;
  time?: Date | string;
  correlationid?: string;
  causationid?: string;
  sagaid?: string;
  traceparent?: string;
  tracestate?: string;
}

const TYPE_RE = /^bandada(\.[a-z0-9][a-z0-9-]*)+\.v\d+$/;
const TRACEPARENT_RE = /^[0-9a-f]{2}-[0-9a-f]{32}-[0-9a-f]{16}-[0-9a-f]{2}$/;

export function isValidEventType(type: string): boolean {
  return TYPE_RE.test(type);
}

export function createCloudEvent<T>(input: CreateCloudEventInput<T>): CloudEvent<T> {
  if (!isValidEventType(input.type)) throw new TypeError(`Invalid event type: ${input.type}`);
  if (input.data === undefined) throw new TypeError('CloudEvent data is required');
  if (input.traceparent !== undefined && !TRACEPARENT_RE.test(input.traceparent)) {
    throw new TypeError(`Invalid traceparent: ${input.traceparent}`);
  }
  const time = input.time instanceof Date ? input.time.toISOString() : (input.time ?? new Date().toISOString());
  const event: CloudEvent<T> = {
    specversion: '1.0',
    id: input.id ?? uuidv7(),
    source: input.source.startsWith('/') ? input.source : `/services/${input.source}`,
    type: input.type,
    time,
    datacontenttype: 'application/json',
    data: input.data,
  };
  for (const key of ['subject', 'correlationid', 'causationid', 'sagaid', 'traceparent', 'tracestate'] as const) {
    if (input[key] !== undefined) event[key] = input[key];
  }
  return event;
}

/** New event caused by `cause`: carries over correlationid, sagaid and traceparent; sets causationid. */
export function createCausedEvent<T>(
  cause: CloudEvent,
  input: Omit<CreateCloudEventInput<T>, 'causationid'>,
): CloudEvent<T> {
  return createCloudEvent({
    correlationid: cause.correlationid,
    sagaid: cause.sagaid,
    traceparent: cause.traceparent,
    tracestate: cause.tracestate,
    ...input,
    causationid: cause.id,
  });
}

/** Parses and validates a structured-mode CloudEvent body. Throws PermanentError when malformed. */
export function parseCloudEvent(body: Buffer | string): CloudEvent {
  let json: unknown;
  try {
    json = JSON.parse(typeof body === 'string' ? body : body.toString('utf8'));
  } catch (cause) {
    throw new PermanentError('Message body is not valid JSON', { cause });
  }
  if (typeof json !== 'object' || json === null) throw new PermanentError('CloudEvent must be a JSON object');
  const e = json as Record<string, unknown>;
  if (e.specversion !== '1.0') throw new PermanentError(`Unsupported specversion: ${String(e.specversion)}`);
  for (const field of ['id', 'source', 'type'] as const) {
    if (typeof e[field] !== 'string' || e[field] === '') throw new PermanentError(`CloudEvent ${field} is required`);
  }
  if (!('data' in e)) throw new PermanentError('CloudEvent data is required');
  return e as unknown as CloudEvent;
}

/** `bandada.<ctx>.cmd.*` commands go to `bandada.commands`, everything else to `bandada.events`. */
export function exchangeForType(type: string): string {
  return /^bandada\.[a-z0-9-]+\.cmd\./.test(type) ? 'bandada.commands' : 'bandada.events';
}
