import { type AmqpConnectionManager, type AmqpConnectionManagerOptions, type ChannelWrapper, connect } from 'amqp-connection-manager';
import * as amqplib from 'amqplib';

import { TopologyMissingError } from '../errors';
import { type Logger, noopLogger } from '../logger';
import {
  consumerTopology,
  DEFAULT_RETRY_DELAYS,
  dlqName,
  EXCHANGES,
  type RetryDelay,
  retryQueueName,
  type TopologySpec,
} from '../topology';

export interface RabbitMqClientOptions {
  /** `RABBITMQ_URL`, e.g. `amqp://user:pass@rabbitmq:5672`. Passed in by the service: this package never reads env vars. */
  url: string | string[];
  heartbeatIntervalInSeconds?: number;
  reconnectTimeInSeconds?: number;
  connectionOptions?: AmqpConnectionManagerOptions['connectionOptions'];
  logger?: Logger;
}

export interface VerifyTopologyOptions {
  /** Attempts before giving up. Default 30. */
  retries?: number;
  /** Delay between attempts. Default 2000 ms. */
  delayMs?: number;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * One connection to publish (confirm channel) and another to consume, as required by
 * eventos-y-mensajeria.md 2.4. Connections are lazy and reconnect automatically.
 */
export class RabbitMqClient {
  private publishConnection?: AmqpConnectionManager;
  private consumeConnection?: AmqpConnectionManager;
  private publisher?: ChannelWrapper;
  private readonly channels = new Set<ChannelWrapper>();
  readonly logger: Logger;

  constructor(private readonly options: RabbitMqClientOptions) {
    this.logger = options.logger ?? noopLogger;
  }

  private open(name: string): AmqpConnectionManager {
    const manager = connect(this.options.url, {
      heartbeatIntervalInSeconds: this.options.heartbeatIntervalInSeconds ?? 10,
      reconnectTimeInSeconds: this.options.reconnectTimeInSeconds ?? 2,
      connectionOptions: {
        ...this.options.connectionOptions,
        clientProperties: { connection_name: name, ...(this.options.connectionOptions?.clientProperties ?? {}) },
      },
    });
    manager.on('connect', () => this.logger.info('rabbitmq connected', { connection: name }));
    manager.on('disconnect', ({ err }) => this.logger.warn('rabbitmq disconnected', { connection: name, error: err?.message }));
    manager.on('connectFailed', ({ err }) => this.logger.warn('rabbitmq connect failed', { connection: name, error: err?.message }));
    return manager;
  }

  /** Confirm channel shared by all publishers of this process. */
  publisherChannel(): ChannelWrapper {
    this.publishConnection ??= this.open('bandada-publisher');
    this.publisher ??= this.track(this.publishConnection.createChannel({ name: 'publisher', confirm: true }));
    return this.publisher;
  }

  /** Dedicated channel for one consumer (prefetch is applied by the consumer). */
  consumerChannel(name: string): ChannelWrapper {
    this.consumeConnection ??= this.open('bandada-consumer');
    return this.track(this.consumeConnection.createChannel({ name, confirm: true }));
  }

  private track(channel: ChannelWrapper): ChannelWrapper {
    this.channels.add(channel);
    channel.on('error', (err, info) => this.logger.error('rabbitmq channel error', { channel: info.name, error: err.message }));
    return channel;
  }

  /**
   * Phase 1 contract: the services do not create topology, they verify it exists (bandadau-infra
   * definitions.json) and retry while the broker boots.
   */
  async verifyTopology(spec: TopologySpec, options: VerifyTopologyOptions = {}): Promise<void> {
    const { retries = 30, delayMs = 2000 } = options;
    const urls = Array.isArray(this.options.url) ? this.options.url : [this.options.url];
    let lastError: unknown;
    for (let attempt = 1; attempt <= retries; attempt += 1) {
      try {
        await this.checkOnce(urls[(attempt - 1) % urls.length] as string, spec);
        return;
      } catch (error) {
        lastError = error;
        this.logger.warn('rabbitmq topology not ready', { attempt, error: (error as Error).message });
        if (attempt < retries) await sleep(delayMs);
      }
    }
    throw new TopologyMissingError(`RabbitMQ topology is missing after ${retries} attempts: ${(lastError as Error)?.message}`, { cause: lastError });
  }

  // checkExchange/checkQueue close the channel on 404, so each check gets a fresh channel
  private async checkOnce(url: string, spec: TopologySpec): Promise<void> {
    const connection = await amqplib.connect(url, this.options.connectionOptions as never);
    connection.on('error', () => undefined);
    try {
      for (const exchange of spec.exchanges ?? []) {
        const channel = await connection.createChannel();
        channel.on('error', () => undefined);
        try {
          await channel.checkExchange(exchange);
        } finally {
          await channel.close().catch(() => undefined);
        }
      }
      for (const queue of spec.queues ?? []) {
        const channel = await connection.createChannel();
        channel.on('error', () => undefined);
        try {
          await channel.checkQueue(queue);
        } finally {
          await channel.close().catch(() => undefined);
        }
      }
    } finally {
      await connection.close().catch(() => undefined);
    }
  }

  /** Declares exchanges, a quorum queue with DLX, retry queues and DLQ (eventos-y-mensajeria.md 2.2). Idempotent. */
  async declareConsumerTopology(input: {
    queue: string;
    bindings: ReadonlyArray<{ exchange: string; routingKey: string }>;
    retryDelays?: readonly RetryDelay[];
    deliveryLimit?: number;
  }): Promise<void> {
    const { queue, bindings, retryDelays = DEFAULT_RETRY_DELAYS, deliveryLimit = 10 } = input;
    this.publishConnection ??= this.open('bandada-publisher');
    const channel = this.publishConnection.createChannel({ name: 'topology-declare', confirm: false });
    try {
      await channel.waitForConnect();
      for (const exchange of Object.values(EXCHANGES)) await channel.assertExchange(exchange, 'topic', { durable: true });
      await channel.assertQueue(dlqName(queue), { durable: true, arguments: { 'x-queue-type': 'quorum' } });
      await channel.bindQueue(dlqName(queue), EXCHANGES.dlx, queue);
      for (const delay of retryDelays) {
        await channel.assertQueue(retryQueueName(queue, delay), {
          durable: true,
          arguments: { 'x-message-ttl': delay.ttlMs, 'x-dead-letter-exchange': '', 'x-dead-letter-routing-key': queue },
        });
      }
      await channel.assertQueue(queue, {
        durable: true,
        arguments: {
          'x-queue-type': 'quorum',
          'x-dead-letter-exchange': EXCHANGES.dlx,
          'x-dead-letter-routing-key': queue,
          'x-delivery-limit': deliveryLimit,
        },
      });
      for (const b of bindings) await channel.bindQueue(queue, b.exchange, b.routingKey);
    } finally {
      await channel.close();
    }
  }

  async verifyConsumerTopology(queue: string, retryDelays: readonly RetryDelay[] = DEFAULT_RETRY_DELAYS, options?: VerifyTopologyOptions) {
    return this.verifyTopology(consumerTopology(queue, retryDelays), options);
  }

  async close(): Promise<void> {
    for (const channel of this.channels) await channel.close().catch(() => undefined);
    this.channels.clear();
    await this.publishConnection?.close().catch(() => undefined);
    await this.consumeConnection?.close().catch(() => undefined);
    this.publishConnection = undefined;
    this.consumeConnection = undefined;
    this.publisher = undefined;
  }
}
