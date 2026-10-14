import type { ChannelWrapper } from 'amqp-connection-manager';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  type CloudEvent,
  createCloudEvent,
  dlqName,
  InMemoryInbox,
  InMemoryOutbox,
  type MemoryTx,
  MessageConsumer,
  OutboxRelay,
  PermanentError,
  RabbitMqClient,
  RabbitPublisher,
  TopologyMissingError,
  TransientError,
  UnroutableMessageError,
} from '../src';

// Runs against a real broker when RABBITMQ_URL is set (e.g. amqp://guest:guest@127.0.0.1:15690).
const url = process.env.RABBITMQ_URL;
const suite = url ? describe : describe.skip;

const RETRY = [{ suffix: '1s', ttlMs: 1000 }];
const uid = Math.random().toString(36).slice(2, 8);
const queueName = (n: string) => `bt-${uid}-${n}.events`;
const type = (n: string) => `bandada.bt${uid}.${n}.happened.v1`;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

suite('RabbitMQ (real broker)', () => {
  const client = new RabbitMqClient({ url: url as string });
  const publisher = new RabbitPublisher(client);
  const consumers: MessageConsumer<never>[] = [];
  const queues: string[] = [];
  let admin: ChannelWrapper;

  beforeAll(async () => {
    admin = client.consumerChannel('admin');
    await admin.waitForConnect();
  });
  afterAll(async () => {
    for (const c of consumers) await c.stop(1000).catch(() => undefined);
    for (const q of queues) {
      for (const name of [q, `${q}.retry.1s`, dlqName(q)]) await admin.deleteQueue(name).catch(() => undefined);
    }
    await client.close();
  });

  async function setup(n: string, handler: (e: CloudEvent, retryCount: number) => Promise<void>, extra: object = {}) {
    const queue = queueName(n);
    queues.push(queue);
    const consumer = new MessageConsumer({
      client,
      queue,
      handlers: { [type(n)]: (e: CloudEvent, ctx: { retryCount: number }) => handler(e, ctx.retryCount) },
      topology: 'declare',
      bindings: [{ exchange: 'bandada.events', routingKey: type(n) }],
      retryDelays: RETRY,
      ...extra,
    } as never);
    consumers.push(consumer as never);
    await consumer.start();
    return { queue, type: type(n) };
  }

  it('publishes with confirms and delivers to the consumer, acking after the handler', async () => {
    const received: CloudEvent[] = [];
    const { type: t } = await setup('basic', async (e) => { received.push(e); });
    const event = createCloudEvent({ type: t, source: 'test-service', data: { hello: 'world' }, correlationid: 'c-1', traceparent: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01' });
    await publisher.publish(event);
    await vi_waitFor(() => expect(received).toHaveLength(1));
    expect(received[0]).toEqual(event);
  });

  it('sets AMQP properties (message_id, type, persistent, headers)', async () => {
    const queue = queueName('props');
    queues.push(queue);
    await client.declareConsumerTopology({ queue, bindings: [{ exchange: 'bandada.events', routingKey: type('props') }], retryDelays: RETRY });
    const event = createCloudEvent({ type: type('props'), source: 'test-service', data: {}, traceparent: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01', correlationid: 'c-7' });
    await publisher.publish(event);
    const msg = await vi_waitForValue(async () => admin.get(queue, { noAck: true }));
    expect(msg.properties).toMatchObject({ messageId: event.id, type: event.type, contentType: 'application/cloudevents+json', deliveryMode: 2, correlationId: 'c-7' });
    expect(msg.properties.headers).toMatchObject({ traceparent: event.traceparent });
  });

  it('fails loudly when a message is not routable (mandatory)', async () => {
    const event = createCloudEvent({ type: type('nobody-listens'), source: 'test-service', data: {} });
    await expect(publisher.publish(event)).rejects.toBeInstanceOf(UnroutableMessageError);
  });

  it('retries transient failures through the retry queue and then succeeds', async () => {
    const attempts: number[] = [];
    const { type: t } = await setup('retry', async (_e, retryCount) => {
      attempts.push(retryCount);
      if (retryCount < 1) throw new TransientError('db down');
    });
    await publisher.publish(createCloudEvent({ type: t, source: 'test-service', data: {} }));
    await vi_waitFor(() => expect(attempts).toEqual([0, 1]), 8000);
  });

  it('dead-letters after the retries are exhausted, keeping the original body', async () => {
    let runs = 0;
    const { queue, type: t } = await setup('exhaust', async () => { runs += 1; throw new TransientError('always'); });
    const event = createCloudEvent({ type: t, source: 'test-service', data: { keep: 'me' } });
    await publisher.publish(event);
    const dead = await vi_waitForValue(async () => admin.get(dlqName(queue), { noAck: true }), 10_000);
    expect(JSON.parse(dead.content.toString())).toEqual(event);
    expect(runs).toBe(2); // first delivery + one retry (single retry delay configured)
  });

  it('dead-letters permanent errors immediately and unknown types', async () => {
    let runs = 0;
    const { queue, type: t } = await setup('perm', async () => { runs += 1; throw new PermanentError('invalid'); });
    await publisher.publish(createCloudEvent({ type: t, source: 'test-service', data: {} }));
    await vi_waitForValue(async () => admin.get(dlqName(queue), { noAck: true }));
    expect(runs).toBe(1);

    // unknown type routed to the same queue: bind another key that has no handler
    await admin.bindQueue(queue, 'bandada.events', `bandada.bt${uid}.unknown.#`);
    await publisher.publish(createCloudEvent({ type: `bandada.bt${uid}.unknown.thing.v9`, source: 'test-service', data: {} }));
    await vi_waitForValue(async () => admin.get(dlqName(queue), { noAck: true }));
  });

  it('deduplicates redeliveries with the inbox', async () => {
    let effects = 0;
    const inbox = new InMemoryInbox();
    const { type: t } = await setup('dedupe', async () => { effects += 1; }, { inbox });
    const event = createCloudEvent({ type: t, source: 'test-service', data: {} });
    await publisher.publish(event);
    await publisher.publish(event); // same CloudEvent id: at-least-once redelivery
    await vi_waitFor(() => expect(inbox.has({ messageId: event.id, consumer: '' })).toBe(true));
    await wait(300);
    expect(effects).toBe(1);
  });

  it('relays the outbox end to end', async () => {
    const received: CloudEvent[] = [];
    const { type: t } = await setup('relay', async (e) => { received.push(e); });
    const outbox = new InMemoryOutbox();
    const inbox = new InMemoryInbox(outbox);
    const event = createCloudEvent({ type: t, source: 'test-service', data: { n: 1 } });
    await inbox.runOnce({ messageId: 'cmd-1', consumer: 'x' }, async (tx: MemoryTx) => { await outbox.enqueue(tx, event); });
    const relay = new OutboxRelay({ outbox, publisher, pollIntervalMs: 20 });
    relay.start();
    await vi_waitFor(() => expect(received).toHaveLength(1));
    await relay.stop();
    expect(received[0]?.id).toBe(event.id);
    expect(outbox.pending()).toHaveLength(0);
  });

  it('keeps unroutable outbox records pending and reports the failure', async () => {
    const outbox = new InMemoryOutbox();
    await outbox.enqueue(undefined, createCloudEvent({ type: type('void'), source: 'test-service', data: {} }));
    const failures: string[] = [];
    const relay = new OutboxRelay({ outbox, publisher, onFailed: (_id, e) => failures.push(e.name) });
    expect(await relay.tick()).toBe(0);
    expect(failures).toEqual(['UnroutableMessageError']);
    expect(outbox.pending()).toHaveLength(1);
  });

  it('verifyTopology resolves for existing resources and rejects (after retrying) for missing ones', async () => {
    const queue = queueName('basic');
    await client.verifyTopology({ exchanges: ['bandada.events'], queues: [queue] }, { retries: 2, delayMs: 20 });
    await expect(client.verifyTopology({ queues: [`does-not-exist-${uid}`] }, { retries: 2, delayMs: 20 })).rejects.toBeInstanceOf(TopologyMissingError);
    await expect(client.verifyTopology({ exchanges: [`nope-${uid}`] }, { retries: 2, delayMs: 20 })).rejects.toBeInstanceOf(TopologyMissingError);
  });
});

async function vi_waitFor(assertion: () => void | Promise<void>, timeout = 5000) {
  const { vi } = await import('vitest');
  await vi.waitFor(assertion, { timeout, interval: 25 });
}

async function vi_waitForValue<T>(get: () => Promise<T | false>, timeout = 5000): Promise<T> {
  const start = Date.now();
  for (;;) {
    const v = await get();
    if (v) return v;
    if (Date.now() - start > timeout) throw new Error('timed out waiting for a message');
    await wait(50);
  }
}
