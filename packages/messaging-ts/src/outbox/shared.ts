import { type CloudEvent, exchangeForType } from '../cloudevents';
import type { EnqueueOptions, OutboxRecord } from './types';

export function toOutboxRecord(event: CloudEvent, options: EnqueueOptions = {}, now: Date = new Date()): OutboxRecord {
  const headers: Record<string, string> = {};
  if (event.traceparent) headers.traceparent = event.traceparent;
  if (event.tracestate) headers.tracestate = event.tracestate;
  return {
    id: event.id,
    exchange: options.exchange ?? exchangeForType(event.type),
    routingKey: options.routingKey ?? event.type,
    payload: event,
    headers,
    createdAt: now,
    attempts: 0,
  };
}
