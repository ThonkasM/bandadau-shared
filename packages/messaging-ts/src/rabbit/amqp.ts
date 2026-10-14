import type { CloudEvent } from '../cloudevents';
import { CLOUDEVENTS_CONTENT_TYPE } from '../cloudevents';

export interface AmqpPublishOptions {
  messageId?: string;
  type?: string;
  contentType?: string;
  contentEncoding?: string;
  correlationId?: string;
  timestamp?: number;
  persistent?: boolean;
  mandatory?: boolean;
  headers?: Record<string, unknown>;
  [key: string]: unknown;
}

/** Binary body and AMQP properties for a structured-mode CloudEvent (section 3). */
export function toAmqpMessage(event: CloudEvent, extraHeaders: Record<string, string> = {}): { content: Buffer; options: AmqpPublishOptions } {
  const headers: Record<string, string> = { ...extraHeaders };
  if (event.traceparent) headers.traceparent ??= event.traceparent;
  if (event.tracestate) headers.tracestate ??= event.tracestate;
  return {
    content: Buffer.from(JSON.stringify(event), 'utf8'),
    options: {
      messageId: event.id,
      type: event.type,
      contentType: CLOUDEVENTS_CONTENT_TYPE,
      correlationId: event.correlationid,
      timestamp: Math.floor(new Date(event.time).getTime() / 1000),
      persistent: true,
      mandatory: true,
      headers,
    },
  };
}
