import { type DynamicModule, Inject, Injectable, Module, type ModuleMetadata, type OnApplicationBootstrap, type OnApplicationShutdown, type Provider } from '@nestjs/common';
import { DiscoveryModule, DiscoveryService, MetadataScanner } from '@nestjs/core';

import type { Inbox } from '../inbox/types';
import { type Logger, noopLogger } from '../logger';
import { OutboxRelay, type OutboxRelayOptions } from '../outbox/relay';
import { RabbitMqClient, type RabbitMqClientOptions } from '../rabbit/connection';
import { MessageConsumer, type MessageContext } from '../rabbit/consumer';
import { RabbitPublisher } from '../rabbit/publisher';
import type { ConsumeMessageOptions } from './decorators';
import { CONSUME_MESSAGE_KEY, MESSAGING_OPTIONS, RABBIT_CLIENT, RABBIT_PUBLISHER } from './tokens';

export interface QueueOptions {
  prefetch?: number;
  /** `verify` (default, phase 1) | `declare` | `none`. */
  topology?: 'verify' | 'declare' | 'none';
  /** Required for `declare`. */
  bindings?: ReadonlyArray<{ exchange: string; routingKey: string }>;
  /** Inbox of the service database (Mongo/DynamoDB/in-memory). Handlers receive its transaction in `ctx.tx`. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  inbox?: Inbox<any>;
}

export interface MessagingModuleOptions {
  rabbit: RabbitMqClientOptions;
  /** Per-queue settings; queues found through `@ConsumeMessage` without an entry use the defaults. */
  queues?: Record<string, QueueOptions>;
  /** Start an outbox relay with the module (not needed in services that run it as a separate process). */
  relay?: Omit<OutboxRelayOptions, 'publisher' | 'logger'>;
  logger?: Logger;
}

export interface MessagingModuleAsyncOptions extends Pick<ModuleMetadata, 'imports'> {
  inject?: unknown[];
  useFactory: (...args: never[]) => MessagingModuleOptions | Promise<MessagingModuleOptions>;
}

@Injectable()
class MessagingLifecycle implements OnApplicationBootstrap, OnApplicationShutdown {
  private consumers: MessageConsumer<never>[] = [];
  private relay?: OutboxRelay;

  constructor(
    @Inject(MESSAGING_OPTIONS) private readonly options: MessagingModuleOptions,
    @Inject(RABBIT_CLIENT) private readonly client: RabbitMqClient,
    @Inject(RABBIT_PUBLISHER) private readonly publisher: RabbitPublisher,
    @Inject(DiscoveryService) private readonly discovery: DiscoveryService,
    @Inject(MetadataScanner) private readonly scanner: MetadataScanner,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const logger = this.options.logger ?? noopLogger;
    const byQueue = new Map<string, Record<string, (event: never, ctx: MessageContext<never>) => Promise<void>>>();
    for (const wrapper of this.discovery.getProviders()) {
      const { instance } = wrapper;
      if (!instance || typeof instance !== 'object') continue;
      const prototype = Object.getPrototypeOf(instance) as object | null;
      for (const name of this.scanner.getAllMethodNames(prototype)) {
        const method = (instance as Record<string, unknown>)[name];
        if (typeof method !== 'function') continue;
        const meta = Reflect.getMetadata(CONSUME_MESSAGE_KEY, method) as ConsumeMessageOptions | undefined;
        if (!meta) continue;
        const handlers = byQueue.get(meta.queue) ?? {};
        if (handlers[meta.type]) throw new Error(`Duplicate @ConsumeMessage handler for ${meta.queue} / ${meta.type}`);
        handlers[meta.type] = (event, ctx) => method.call(instance, event, ctx) as Promise<void>;
        byQueue.set(meta.queue, handlers);
      }
    }
    for (const [queue, handlers] of byQueue) {
      const q = this.options.queues?.[queue] ?? {};
      const consumer = new MessageConsumer<never>({ client: this.client, queue, handlers, logger, ...q } as never);
      await consumer.start();
      this.consumers.push(consumer);
      logger.info('consumer started', { queue, types: Object.keys(handlers) });
    }
    if (this.options.relay) {
      this.relay = new OutboxRelay({ ...this.options.relay, publisher: this.publisher, logger });
      this.relay.start();
    }
  }

  async onApplicationShutdown(): Promise<void> {
    await this.relay?.stop();
    for (const c of this.consumers) await c.stop();
    await this.client.close();
  }
}

const coreProviders: Provider[] = [
  {
    provide: RABBIT_CLIENT,
    inject: [MESSAGING_OPTIONS],
    useFactory: (options: MessagingModuleOptions) => new RabbitMqClient({ logger: options.logger, ...options.rabbit }),
  },
  { provide: RABBIT_PUBLISHER, inject: [RABBIT_CLIENT], useFactory: (client: RabbitMqClient) => new RabbitPublisher(client) },
  MessagingLifecycle,
];

@Module({})
export class MessagingModule {
  static forRoot(options: MessagingModuleOptions): DynamicModule {
    return {
      module: MessagingModule,
      global: true,
      imports: [DiscoveryModule],
      providers: [{ provide: MESSAGING_OPTIONS, useValue: options }, ...coreProviders],
      exports: [RABBIT_CLIENT, RABBIT_PUBLISHER],
    };
  }

  static forRootAsync(options: MessagingModuleAsyncOptions): DynamicModule {
    return {
      module: MessagingModule,
      global: true,
      imports: [DiscoveryModule, ...(options.imports ?? [])],
      providers: [{ provide: MESSAGING_OPTIONS, useFactory: options.useFactory, inject: (options.inject ?? []) as never[] }, ...coreProviders],
      exports: [RABBIT_CLIENT, RABBIT_PUBLISHER],
    };
  }
}
