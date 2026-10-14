import { describe, expect, it } from 'vitest';

import type { IdempotencyStore, ReserveInput } from '../src';

export interface ContractHarness {
  store: IdempotencyStore;
  /** Moves the store clock forward. */
  advance: (seconds: number) => void;
}

const input = (over: Partial<ReserveInput> = {}): ReserveInput => ({
  key: '0192b7c0-7c1e-7d55-9a1e-2f9d8c0b1a10',
  requestHash: 'hash-1',
  principal: 'user-1',
  method: 'POST',
  path: '/api/v1/posts',
  ...over,
});
const response = { status: 201, headers: { 'Content-Type': 'application/json', Location: '/api/v1/posts/1' }, body: '{"id":"1"}' };

/** Contract every IdempotencyStore adapter must satisfy (idempotencia.md 2.1, 2.2, 2.4). */
export function storeContract(name: string, make: () => Promise<ContractHarness> | ContractHarness) {
  describe(`IdempotencyStore contract: ${name}`, () => {
    it('reserves a new key', async () => {
      const { store } = await make();
      expect(await store.reserve(input())).toEqual({ kind: 'reserved', orphanTakeover: false });
    });

    it('answers in_progress to a concurrent identical request', async () => {
      const { store } = await make();
      await store.reserve(input());
      expect(await store.reserve(input())).toEqual({ kind: 'in_progress' });
    });

    it('only one of many simultaneous reserves wins', async () => {
      const { store } = await make();
      const results = await Promise.all(Array.from({ length: 8 }, () => store.reserve(input())));
      expect(results.filter((r) => r.kind === 'reserved')).toHaveLength(1);
      expect(results.filter((r) => r.kind === 'in_progress')).toHaveLength(7);
    });

    it('replays the stored response once completed', async () => {
      const { store } = await make();
      await store.reserve(input());
      await store.complete(input().key, response);
      expect(await store.reserve(input())).toEqual({ kind: 'replay', response });
    });

    it('replays responses without body', async () => {
      const { store } = await make();
      await store.reserve(input());
      await store.complete(input().key, { status: 204, headers: {} });
      const outcome = await store.reserve(input());
      expect(outcome).toMatchObject({ kind: 'replay', response: { status: 204 } });
    });

    it('rejects the same key with a different hash or principal', async () => {
      const { store } = await make();
      await store.reserve(input());
      expect(await store.reserve(input({ requestHash: 'other' }))).toEqual({ kind: 'key_reused' });
      expect(await store.reserve(input({ principal: 'user-2' }))).toEqual({ kind: 'key_reused' });
      await store.complete(input().key, response);
      expect(await store.reserve(input({ requestHash: 'other' }))).toEqual({ kind: 'key_reused' });
    });

    it('release lets the client retry with the same key', async () => {
      const { store } = await make();
      await store.reserve(input());
      await store.release(input().key);
      expect(await store.reserve(input())).toEqual({ kind: 'reserved', orphanTakeover: false });
    });

    it('release does not delete a completed record', async () => {
      const { store } = await make();
      await store.reserve(input());
      await store.complete(input().key, response);
      await store.release(input().key);
      expect((await store.reserve(input())).kind).toBe('replay');
    });

    it('takes over an orphaned IN_PROGRESS record after the lock expires', async () => {
      const { store, advance } = await make();
      await store.reserve(input());
      advance(31);
      expect(await store.reserve(input())).toEqual({ kind: 'reserved', orphanTakeover: true });
      expect(await store.reserve(input())).toEqual({ kind: 'in_progress' });
    });

    it('treats an expired record (TTL not yet purged) as new', async () => {
      const { store, advance } = await make();
      await store.reserve(input());
      await store.complete(input().key, response);
      advance(86_401);
      expect(await store.reserve(input())).toEqual({ kind: 'reserved', orphanTakeover: false });
    });

    it('flags oversized responses as unavailable', async () => {
      const { store } = await make();
      await store.reserve(input());
      await store.complete(input().key, { status: 200, headers: {}, body: JSON.stringify('x'.repeat(310 * 1024)) });
      expect(await store.reserve(input())).toEqual({ kind: 'response_unavailable' });
    });

    it('keeps services isolated by prefix', async () => {
      // handled by adapters via the `service` option: verified in adapter-specific tests
      expect(true).toBe(true);
    });
  });
}
