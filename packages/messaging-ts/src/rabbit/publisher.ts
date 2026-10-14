import type { Channel, ChannelWrapper } from 'amqp-connection-manager';
import type { Message } from 'amqplib';

import { type CloudEvent, exchangeForType } from '../cloudevents';
import { UnroutableMessageError } from '../errors';
import type { OutboxRecord } from '../outbox/types';
import { toAmqpMessage } from './amqp';
import type { RabbitMqClient } from './connection';

export interface PublishOptions {
  /** Defaults to `bandada.commands` for `.cmd.` types and `bandada.events` otherwise. */
  exchange?: string;
  /** Defaults to the event `type`. */
  routingKey?: string;
  headers?: Record<string, string>;
  timeoutMs?: number;
}

/** Minimal port the outbox relay needs. */
export interface RecordPublisher {
  publishRecord(record: OutboxRecord): Promise<void>;
}

/** Publishes with publisher confirms and `mandatory`; unroutable messages are an error (configuration problem). */
export class RabbitPublisher implements RecordPublisher {
  private readonly returned = new Set<string>();
  private wired?: ChannelWrapper;

  constructor(private readonly client: RabbitMqClient) {}

  private channel(): ChannelWrapper {
    const channel = this.client.publisherChannel();
    if (this.wired !== channel) {
      this.wired = channel;
      void channel.addSetup((ch: Channel) => {
        ch.on('return', (msg: Message) => {
          const id = msg.properties.messageId;
          if (typeof id === 'string') this.returned.add(id);
        });
        return Promise.resolve();
      });
    }
    return channel;
  }

  /** Not for use inside a use case: go through the outbox. Resolves after the broker confirm. */
  async publish(event: CloudEvent, options: PublishOptions = {}): Promise<void> {
    const exchange = options.exchange ?? exchangeForType(event.type);
    const routingKey = options.routingKey ?? event.type;
    const { content, options: amqp } = toAmqpMessage(event, options.headers);
    await this.send(exchange, routingKey, content, amqp, options.timeoutMs);
  }

  async publishRecord(record: OutboxRecord): Promise<void> {
    const { content, options } = toAmqpMessage(record.payload, record.headers);
    await this.send(record.exchange, record.routingKey, content, options);
  }

  private async send(exchange: string, routingKey: string, content: Buffer, options: ReturnType<typeof toAmqpMessage>['options'], timeoutMs = 5000): Promise<void> {
    const channel = this.channel();
    const id = options.messageId as string;
    this.returned.delete(id);
    await channel.publish(exchange, routingKey, content, { ...options, timeout: timeoutMs } as never);
    if (this.returned.delete(id)) throw new UnroutableMessageError(exchange, routingKey, id);
  }
}
