import type { ConsumeMessage } from 'amqplib';
import { describe, expect, it, vi } from 'vitest';

import { createCloudEvent, DeliveryProcessor, type DeliveryTransport, InMemoryInbox, InMemoryOutbox, type MemoryTx, PermanentError, TransientError } from '../src';

const TYPE = 'bandada.wallet.cmd.debit-credits.v1';

function message(event: unknown | string, headers: Record<string, unknown> = {}): ConsumeMessage {
  return {
    content: Buffer.from(typeof event === 'string' ? event : JSON.stringify(event)),
    fields: { deliveryTag: 1, redelivered: false, exchange: 'bandada.commands', routingKey: TYPE, consumerTag: 'c' },
    properties: { headers, messageId: 'm', contentType: 'application/cloudevents+json' },
  } as unknown as ConsumeMessage;
}

function transport() {
  const t = { ack: vi.fn(), nack: vi.fn(), publishRetry: vi.fn(async () => undefined) };
  return t satisfies DeliveryTransport;
}

const event = () => createCloudEvent({ type: TYPE, source: 'events-service', data: { n: 1 } });

describe('DeliveryProcessor', () => {
  it('acks after the handler succeeds', async () => {
    const handler = vi.fn(async () => undefined);
    const t = transport();
    await new DeliveryProcessor({ queue: 'wallet-service.commands', handlers: { [TYPE]: handler } }).process(message(event()), t);
    expect(handler).toHaveBeenCalledOnce();
    expect(t.ack).toHaveBeenCalledOnce();
    expect(t.nack).not.toHaveBeenCalled();
  });

  it('schedules transient failures on the retry queues (5s, 30s, 5m) and acks the original', async () => {
    const processor = new DeliveryProcessor({ queue: 'q', handlers: { [TYPE]: async () => { throw new TransientError('db down'); } } });
    for (const [n, suffix] of [[0, '5s'], [1, '30s'], [2, '5m']] as const) {
      const t = transport();
      await processor.process(message(event(), n === 0 ? {} : { 'x-retry-count': n }), t);
      expect(t.publishRetry).toHaveBeenCalledWith(`q.retry.${suffix}`, expect.anything(), expect.objectContaining({ 'x-retry-count': n + 1, 'x-last-error': expect.stringContaining('db down') }));
      expect(t.ack).toHaveBeenCalledOnce();
      expect(t.nack).not.toHaveBeenCalled();
    }
  });

  it('dead-letters (nack requeue=false) once retries are exhausted', async () => {
    const t = transport();
    await new DeliveryProcessor({ queue: 'q', handlers: { [TYPE]: async () => { throw new Error('still down'); } } }).process(message(event(), { 'x-retry-count': 3 }), t);
    expect(t.nack).toHaveBeenCalledWith(expect.anything(), false);
    expect(t.publishRetry).not.toHaveBeenCalled();
    expect(t.ack).not.toHaveBeenCalled();
  });

  it('dead-letters permanent errors immediately', async () => {
    const t = transport();
    await new DeliveryProcessor({ queue: 'q', handlers: { [TYPE]: async () => { throw new PermanentError('bad data'); } } }).process(message(event()), t);
    expect(t.nack).toHaveBeenCalledWith(expect.anything(), false);
    expect(t.publishRetry).not.toHaveBeenCalled();
  });

  it('dead-letters malformed messages and unknown types (never silent)', async () => {
    const metrics: string[] = [];
    const processor = new DeliveryProcessor({ queue: 'q', handlers: { [TYPE]: async () => undefined }, onMetric: (m) => metrics.push(m) });
    const t1 = transport();
    await processor.process(message('garbage'), t1);
    const t2 = transport();
    await processor.process(message(createCloudEvent({ type: 'bandada.other.thing.happened.v2', source: 's', data: {} })), t2);
    expect(t1.nack).toHaveBeenCalledWith(expect.anything(), false);
    expect(t2.nack).toHaveBeenCalledWith(expect.anything(), false);
    expect(metrics).toEqual(['malformed', 'unknown_type']);
  });

  it('requeues as a last resort if the retry copy cannot be published', async () => {
    const t = transport();
    t.publishRetry.mockRejectedValueOnce(new Error('broker down'));
    await new DeliveryProcessor({ queue: 'q', handlers: { [TYPE]: async () => { throw new Error('x'); } } }).process(message(event()), t);
    expect(t.nack).toHaveBeenCalledWith(expect.anything(), true);
  });

  it('supports custom error classification', async () => {
    const t = transport();
    await new DeliveryProcessor({
      queue: 'q',
      handlers: { [TYPE]: async () => { throw new RangeError('validation'); } },
      classifyError: (e) => (e instanceof RangeError ? 'permanent' : 'transient'),
    }).process(message(event()), t);
    expect(t.nack).toHaveBeenCalledWith(expect.anything(), false);
  });

  describe('with an inbox', () => {
    it('runs the handler once per message id and acks duplicates without effect', async () => {
      const outbox = new InMemoryOutbox();
      const inbox = new InMemoryInbox(outbox);
      let effects = 0;
      const metrics: string[] = [];
      const processor = new DeliveryProcessor<MemoryTx>({
        queue: 'q',
        inbox,
        onMetric: (m) => metrics.push(m),
        handlers: {
          [TYPE]: async (e, { tx }) => {
            effects += 1;
            await outbox.enqueue(tx, createCloudEvent({ type: 'bandada.wallet.credits-debited.v1', source: 'wallet-service', data: {}, causationid: e.id }));
          },
        },
      });
      const msg = message(event());
      const t = transport();
      await processor.process(msg, t);
      await processor.process(msg, t);
      expect(effects).toBe(1);
      expect(outbox.pending()).toHaveLength(1);
      expect(t.ack).toHaveBeenCalledTimes(2);
      expect(metrics).toEqual(['processed', 'duplicate']);
    });

    it('does not mark the message processed when the handler fails, so the retry runs it again', async () => {
      const outbox = new InMemoryOutbox();
      const inbox = new InMemoryInbox(outbox);
      let attempts = 0;
      const processor = new DeliveryProcessor<MemoryTx>({
        queue: 'q',
        inbox,
        handlers: {
          [TYPE]: async (_e, { tx }) => {
            attempts += 1;
            await outbox.enqueue(tx, createCloudEvent({ type: 'bandada.wallet.credits-debited.v1', source: 'w', data: {} }));
            if (attempts === 1) throw new TransientError('boom');
          },
        },
      });
      const e = event();
      await processor.process(message(e), transport());
      expect(outbox.pending()).toHaveLength(0); // staged outbox row discarded with the failed unit of work
      await processor.process(message(e, { 'x-retry-count': 1 }), transport());
      expect(attempts).toBe(2);
      expect(outbox.pending()).toHaveLength(1);
    });
  });
});
