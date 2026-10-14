import type { ChannelWrapper } from 'amqp-connection-manager';
import type { ConsumeMessage } from 'amqplib';

import { type CloudEvent, parseCloudEvent } from '../cloudevents';
import { PermanentError } from '../errors';
import type { Inbox } from '../inbox/types';
import { type Logger, noopLogger } from '../logger';
import { DEFAULT_RETRY_DELAYS, type RetryDelay, retryQueueName } from '../topology';
import type { RabbitMqClient } from './connection';

export interface MessageContext<Tx = undefined> {
  /** Transaction of the inbox adapter (Mongo session, DynamoTransaction...). `undefined` without inbox. */
  tx: Tx;
  message: ConsumeMessage;
  queue: string;
  /** How many times this message already went through a retry queue. */
  retryCount: number;
}

export type MessageHandler<T = unknown, Tx = undefined> = (event: CloudEvent<T>, context: MessageContext<Tx>) => Promise<void>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type HandlerMap<Tx = undefined> = Record<string, MessageHandler<any, Tx>>;

export type ErrorClass = 'transient' | 'permanent';
export type ConsumerMetric = 'processed' | 'duplicate' | 'retried' | 'dead_lettered' | 'unknown_type' | 'malformed';

/** What the processor needs from the broker channel (lets the logic be unit tested without RabbitMQ). */
export interface DeliveryTransport {
  ack(message: ConsumeMessage): void;
  nack(message: ConsumeMessage, requeue: boolean): void;
  /** Publishes a copy to the default exchange (retry queue) and resolves after the broker confirm. */
  publishRetry(routingKey: string, message: ConsumeMessage, headers: Record<string, unknown>): Promise<void>;
}

export interface DeliveryProcessorOptions<Tx> {
  queue: string;
  handlers: HandlerMap<Tx>;
  /** Defaults to `queue`; used as the inbox consumer name. */
  consumerName?: string;
  inbox?: Inbox<Tx>;
  retryDelays?: readonly RetryDelay[];
  classifyError?: (error: unknown) => ErrorClass;
  logger?: Logger;
  onMetric?: (metric: ConsumerMetric, labels: { queue: string; type?: string }) => void;
}

const defaultClassify = (error: unknown): ErrorClass => (error instanceof PermanentError ? 'permanent' : 'transient');

function summarize(error: unknown): string {
  const text = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  return text.slice(0, 500);
}

/**
 * Implements eventos-y-mensajeria.md 2.3: ack after the handler commits; transient failures go to
 * `<q>.retry.<delay>` (max 3) and are acked; permanent failures, unknown types and exhausted retries are
 * `nack(requeue=false)` so RabbitMQ dead-letters them to `<q>.dlq`.
 */
export class DeliveryProcessor<Tx = undefined> {
  private readonly retryDelays: readonly RetryDelay[];
  private readonly logger: Logger;
  private readonly classify: (error: unknown) => ErrorClass;

  constructor(private readonly options: DeliveryProcessorOptions<Tx>) {
    this.retryDelays = options.retryDelays ?? DEFAULT_RETRY_DELAYS;
    this.logger = options.logger ?? noopLogger;
    this.classify = options.classifyError ?? defaultClassify;
  }

  async process(message: ConsumeMessage, transport: DeliveryTransport): Promise<void> {
    const { queue } = this.options;
    const metric = (m: ConsumerMetric, type?: string) => this.options.onMetric?.(m, { queue, type });
    let event: CloudEvent;
    try {
      event = parseCloudEvent(message.content);
    } catch (error) {
      this.logger.error('malformed message, dead-lettering', { queue, error: summarize(error) });
      metric('malformed');
      transport.nack(message, false);
      return;
    }

    const handler = this.options.handlers[event.type] as MessageHandler<unknown, Tx> | undefined;
    if (!handler) {
      this.logger.error('no handler for message type, dead-lettering', { queue, type: event.type, id: event.id });
      metric('unknown_type', event.type);
      transport.nack(message, false);
      return;
    }

    const retryCount = Number(message.properties.headers?.['x-retry-count'] ?? 0);
    try {
      const run = (tx: Tx) => handler(event, { tx, message, queue, retryCount });
      if (this.options.inbox) {
        const outcome = await this.options.inbox.runOnce({ messageId: event.id, consumer: this.options.consumerName ?? queue }, run);
        metric(outcome.processed ? 'processed' : 'duplicate', event.type);
      } else {
        await run(undefined as Tx);
        metric('processed', event.type);
      }
      transport.ack(message);
    } catch (error) {
      await this.fail(message, transport, event, error, retryCount, metric);
    }
  }

  private async fail(
    message: ConsumeMessage,
    transport: DeliveryTransport,
    event: CloudEvent,
    error: unknown,
    retryCount: number,
    metric: (m: ConsumerMetric, type?: string) => void,
  ): Promise<void> {
    const { queue } = this.options;
    const kind = this.classify(error);
    const context = { queue, type: event.type, id: event.id, retryCount, error: summarize(error) };
    if (kind === 'permanent') {
      this.logger.error('permanent failure, dead-lettering', context);
      metric('dead_lettered', event.type);
      transport.nack(message, false);
      return;
    }
    const delay = this.retryDelays[retryCount];
    if (!delay) {
      this.logger.error('retries exhausted, dead-lettering', context);
      metric('dead_lettered', event.type);
      transport.nack(message, false);
      return;
    }
    try {
      await transport.publishRetry(retryQueueName(queue, delay), message, {
        'x-retry-count': retryCount + 1,
        'x-last-error': summarize(error),
      });
      this.logger.warn('transient failure, scheduled retry', { ...context, delay: delay.suffix });
      metric('retried', event.type);
      transport.ack(message);
    } catch (publishError) {
      // cannot schedule the retry (broker trouble): give the message back instead of losing it
      this.logger.error('could not publish to retry queue', { ...context, publishError: summarize(publishError) });
      transport.nack(message, true);
    }
  }
}

export interface MessageConsumerOptions<Tx = undefined> extends DeliveryProcessorOptions<Tx> {
  client: RabbitMqClient;
  /** Default 10 (SAGA queues: 20). */
  prefetch?: number;
  /**
   * `verify` (default, phase 1): check that exchanges/queues exist, retrying while the broker boots.
   * `declare`: create them (needs `bindings`). `none`: skip.
   */
  topology?: 'verify' | 'declare' | 'none';
  bindings?: ReadonlyArray<{ exchange: string; routingKey: string }>;
  verifyRetries?: number;
  verifyDelayMs?: number;
}

export class MessageConsumer<Tx = undefined> {
  private channel?: ChannelWrapper;
  private readonly processor: DeliveryProcessor<Tx>;
  private inFlight = 0;
  private idle?: () => void;

  constructor(private readonly options: MessageConsumerOptions<Tx>) {
    this.processor = new DeliveryProcessor<Tx>(options);
  }

  async start(): Promise<void> {
    const { client, queue, topology = 'verify' } = this.options;
    const delays = this.options.retryDelays ?? DEFAULT_RETRY_DELAYS;
    if (topology === 'declare') {
      if (!this.options.bindings) throw new Error('topology "declare" requires bindings');
      await client.declareConsumerTopology({ queue, bindings: this.options.bindings, retryDelays: delays });
    } else if (topology === 'verify') {
      await client.verifyConsumerTopology(queue, delays, { retries: this.options.verifyRetries, delayMs: this.options.verifyDelayMs });
    }
    const channel = client.consumerChannel(`consumer:${queue}`);
    this.channel = channel;
    const transport: DeliveryTransport = {
      ack: (m) => channel.ack(m),
      nack: (m, requeue) => channel.nack(m, false, requeue),
      publishRetry: async (routingKey, m, headers) => {
        const { headers: original, ...props } = m.properties;
        const { 'x-death': _xDeath, ...rest } = (original ?? {}) as Record<string, unknown>;
        await channel.publish('', routingKey, m.content, {
          contentType: props.contentType,
          contentEncoding: props.contentEncoding,
          correlationId: props.correlationId,
          messageId: props.messageId,
          type: props.type,
          timestamp: props.timestamp,
          persistent: true,
          mandatory: true,
          headers: { ...rest, ...headers },
        } as never);
      },
    };
    await channel.consume(
      queue,
      (message) => {
        if (!message) return;
        this.inFlight += 1;
        void this.processor
          .process(message, transport)
          .catch((error) => {
            (this.options.logger ?? noopLogger).error('unexpected consumer failure', { queue, error: summarize(error) });
            transport.nack(message, true);
          })
          .finally(() => {
            this.inFlight -= 1;
            if (this.inFlight === 0) this.idle?.();
          });
      },
      { prefetch: this.options.prefetch ?? 10, noAck: false },
    );
  }

  /** Stops consuming and waits for in-flight messages. */
  async stop(timeoutMs = 10_000): Promise<void> {
    await this.channel?.cancelAll();
    if (this.inFlight > 0) {
      await Promise.race([new Promise<void>((resolve) => (this.idle = resolve)), new Promise<void>((resolve) => setTimeout(resolve, timeoutMs))]);
    }
    await this.channel?.close();
    this.channel = undefined;
  }
}
