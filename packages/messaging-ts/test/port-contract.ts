import { describe, expect, it } from 'vitest';

import { createCloudEvent, type Inbox, type Outbox } from '../src';

export interface PortHarness<Tx> {
  inbox: Inbox<Tx>;
  outbox: Outbox<Tx>;
  /** Business write performed inside the transaction (Mongo doc, Dynamo item). */
  effect(tx: Tx, name: string): Promise<void>;
  effects(): Promise<string[]>;
  /** Standalone unit of work (use case driven by HTTP, not by a message). */
  unitOfWork<R>(work: (tx: Tx) => Promise<R>): Promise<R>;
  /** False for the in-memory adapter: it cannot make arbitrary effects transactional. */
  transactionalEffects: boolean;
}

const ev = (n: number, extra: object = {}) =>
  createCloudEvent({ type: 'bandada.ticketing.ticket-issued.v1', source: 'ticketing-service', data: { n }, traceparent: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01', ...extra });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Behaviour every inbox/outbox adapter must provide (idempotencia.md 3, eventos-y-mensajeria.md 5). */
export function portContract<Tx>(name: string, make: () => Promise<PortHarness<Tx>> | PortHarness<Tx>) {
  describe(`inbox contract: ${name}`, () => {
    it('runs the work once and returns its result', async () => {
      const h = await make();
      const r = await h.inbox.runOnce({ messageId: 'm1', consumer: 'q' }, async (tx) => {
        await h.effect(tx, 'e1');
        return 42;
      });
      expect(r).toEqual({ processed: true, result: 42 });
      if (h.transactionalEffects) expect(await h.effects()).toEqual(['e1']);
    });

    it('treats a redelivery as a duplicate: no work, no second effect', async () => {
      const h = await make();
      let runs = 0;
      const work = async (tx: Tx) => {
        runs += 1;
        await h.effect(tx, 'e1');
      };
      expect((await h.inbox.runOnce({ messageId: 'm1', consumer: 'q' }, work)).processed).toBe(true);
      expect(await h.inbox.runOnce({ messageId: 'm1', consumer: 'q' }, work)).toEqual({ processed: false });
      expect(runs).toBe(1);
      if (h.transactionalEffects) expect(await h.effects()).toEqual(['e1']);
    });

    it('does not record the message when the work fails (it can be retried)', async () => {
      const h = await make();
      await expect(
        h.inbox.runOnce({ messageId: 'm1', consumer: 'q' }, async (tx) => {
          await h.effect(tx, 'partial');
          await h.outbox.enqueue(tx, ev(1));
          throw new Error('boom');
        }),
      ).rejects.toThrow('boom');
      expect(await h.outbox.claimBatch(10, 1000)).toHaveLength(0);
      if (h.transactionalEffects) expect(await h.effects()).toEqual([]);
      const retry = await h.inbox.runOnce({ messageId: 'm1', consumer: 'q' }, async (tx) => {
        await h.effect(tx, 'ok');
      });
      expect(retry.processed).toBe(true);
    });

    it('commits the effect and the outbox row together', async () => {
      const h = await make();
      const event = ev(1);
      await h.inbox.runOnce({ messageId: 'm1', consumer: 'q' }, async (tx) => {
        await h.effect(tx, 'e1');
        await h.outbox.enqueue(tx, event);
      });
      const claimed = await h.outbox.claimBatch(10, 1000);
      expect(claimed.map((r) => r.id)).toEqual([event.id]);
    });

    it('lets exactly one of many simultaneous deliveries win', async () => {
      const h = await make();
      let runs = 0;
      const results = await Promise.allSettled(
        Array.from({ length: 5 }, () =>
          h.inbox.runOnce({ messageId: 'race', consumer: 'q' }, async (tx) => {
            runs += 1;
            await h.effect(tx, 'e');
          }),
        ),
      );
      const processed = results.filter((r) => r.status === 'fulfilled' && r.value.processed).length;
      expect(processed).toBe(1);
      if (h.transactionalEffects) expect(await h.effects()).toEqual(['e']);
      expect(runs).toBeGreaterThanOrEqual(1);
    });
  });

  describe(`outbox contract: ${name}`, () => {
    it('stores the CloudEvent with exchange, routing key and trace headers', async () => {
      const h = await make();
      const event = ev(1);
      await h.unitOfWork((tx) => h.outbox.enqueue(tx, event));
      const [record] = await h.outbox.claimBatch(10, 1000);
      expect(record).toMatchObject({ id: event.id, exchange: 'bandada.events', routingKey: event.type, attempts: 1 });
      expect(record?.payload).toEqual(event);
      expect(record?.headers).toEqual({ traceparent: event.traceparent });
    });

    it('routes commands to bandada.commands', async () => {
      const h = await make();
      const cmd = createCloudEvent({ type: 'bandada.ticketing.cmd.issue-ticket.v1', source: 'events-service', data: {} });
      await h.unitOfWork((tx) => h.outbox.enqueue(tx, cmd));
      expect((await h.outbox.claimBatch(1, 1000))[0]?.exchange).toBe('bandada.commands');
    });

    it('claims oldest first, honoring the limit', async () => {
      const h = await make();
      const events = [ev(1, { time: '2026-10-14T10:00:00.000Z' }), ev(2, { time: '2026-10-14T10:00:01.000Z' }), ev(3, { time: '2026-10-14T10:00:02.000Z' })];
      for (const e of events) {
        await h.unitOfWork((tx) => h.outbox.enqueue(tx, e));
        await sleep(5);
      }
      const batch = await h.outbox.claimBatch(2, 1000);
      expect(batch.map((r) => (r.payload.data as { n: number }).n)).toEqual([1, 2]);
    });

    it('leases claimed records and releases them after the lease expires', async () => {
      const h = await make();
      await h.unitOfWork((tx) => h.outbox.enqueue(tx, ev(1)));
      expect(await h.outbox.claimBatch(10, 80)).toHaveLength(1);
      expect(await h.outbox.claimBatch(10, 80)).toHaveLength(0);
      await sleep(120);
      const again = await h.outbox.claimBatch(10, 80);
      expect(again).toHaveLength(1);
      expect(again[0]?.attempts).toBe(2);
    });

    it('markPublished removes the record from the pending set (idempotently)', async () => {
      const h = await make();
      const event = ev(1);
      await h.unitOfWork((tx) => h.outbox.enqueue(tx, event));
      const [r] = await h.outbox.claimBatch(10, 1);
      await h.outbox.markPublished(r!.id);
      await h.outbox.markPublished(r!.id);
      await sleep(10);
      expect(await h.outbox.claimBatch(10, 1000)).toHaveLength(0);
    });

    it('markFailed releases the lease so the record is retried right away', async () => {
      const h = await make();
      await h.unitOfWork((tx) => h.outbox.enqueue(tx, ev(1)));
      const [r] = await h.outbox.claimBatch(10, 60_000);
      await h.outbox.markFailed(r!.id, 'unroutable');
      expect(await h.outbox.claimBatch(10, 1000)).toHaveLength(1);
    });
  });
}
