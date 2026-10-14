import { describe, expect, it, vi } from 'vitest';

import { createCloudEvent, InMemoryOutbox, type OutboxRecord,OutboxRelay } from '../src';

const ev = (n: number) => createCloudEvent({ type: 'bandada.social.post.created.v1', source: 'social-service', data: { n }, traceparent: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01' });

describe('OutboxRelay', () => {
  it('publishes pending records in order and marks them published', async () => {
    const outbox = new InMemoryOutbox();
    const events = [ev(1), ev(2), ev(3)];
    for (const e of events) await outbox.enqueue(undefined, e);
    const published: OutboxRecord[] = [];
    const relay = new OutboxRelay({ outbox, publisher: { publishRecord: async (r) => { published.push(r); } } });
    expect(await relay.tick()).toBe(3);
    expect(published.map((r) => r.payload.id).sort()).toEqual(events.map((e) => e.id).sort());
    expect(published[0]?.headers.traceparent).toBeDefined();
    expect(published[0]).toMatchObject({ exchange: 'bandada.events', routingKey: 'bandada.social.post.created.v1' });
    expect(outbox.pending()).toHaveLength(0);
    expect(await relay.tick()).toBe(0);
  });

  it('keeps failed records pending and retries them on the next tick', async () => {
    const outbox = new InMemoryOutbox();
    await outbox.enqueue(undefined, ev(1));
    const publish = vi.fn().mockRejectedValueOnce(new Error('unroutable')).mockResolvedValue(undefined);
    const failures: string[] = [];
    const relay = new OutboxRelay({ outbox, publisher: { publishRecord: publish }, onFailed: (_id, e) => failures.push(e.message) });
    expect(await relay.tick()).toBe(0);
    expect(outbox.pending()).toHaveLength(1);
    expect(failures).toEqual(['unroutable']);
    expect(await relay.tick()).toBe(1);
    expect(outbox.pending()).toHaveLength(0);
    expect(outbox.all()[0]?.attempts).toBe(2);
  });

  it('does not publish a leased batch twice across relays', async () => {
    const outbox = new InMemoryOutbox();
    await outbox.enqueue(undefined, ev(1));
    const publish = vi.fn(async () => { await new Promise((r) => setTimeout(r, 20)); });
    const a = new OutboxRelay({ outbox, publisher: { publishRecord: publish } });
    const b = new OutboxRelay({ outbox, publisher: { publishRecord: publish } });
    const [x, y] = await Promise.all([a.tick(), b.tick()]);
    expect(x + y).toBe(1);
    expect(publish).toHaveBeenCalledOnce();
  });

  it('polls in the background until stopped', async () => {
    const outbox = new InMemoryOutbox();
    const publish = vi.fn(async () => undefined);
    const relay = new OutboxRelay({ outbox, publisher: { publishRecord: publish }, pollIntervalMs: 10 });
    relay.start();
    await outbox.enqueue(undefined, ev(1));
    await vi.waitFor(() => expect(publish).toHaveBeenCalledOnce());
    await relay.stop();
    await outbox.enqueue(undefined, ev(2));
    await new Promise((r) => setTimeout(r, 40));
    expect(publish).toHaveBeenCalledOnce();
  });
});
