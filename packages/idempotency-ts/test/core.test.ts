import { describe, expect, it } from 'vitest';

import { canonicalJson, canonicalParams, hashRequest, InMemoryIdempotencyStore, isStorableStatus, parseIdempotencyKey } from '../src';
import { storeContract } from './store-contract';

describe('parseIdempotencyKey', () => {
  it('accepts UUID v4 and v7', () => {
    expect(parseIdempotencyKey('0192b7c0-7c1e-7d55-9a1e-2f9d8c0b1a10')).toEqual({ ok: true, key: '0192b7c0-7c1e-7d55-9a1e-2f9d8c0b1a10' });
    expect(parseIdempotencyKey('F47AC10B-58CC-4372-A567-0E02B2C3D479')).toMatchObject({ ok: true, key: 'f47ac10b-58cc-4372-a567-0e02b2c3d479' });
  });
  it('flags missing and invalid keys', () => {
    expect(parseIdempotencyKey(undefined)).toEqual({ ok: false, code: 'IDEMPOTENCY_KEY_MISSING' });
    expect(parseIdempotencyKey('  ')).toEqual({ ok: false, code: 'IDEMPOTENCY_KEY_MISSING' });
    expect(parseIdempotencyKey('not-a-uuid')).toEqual({ ok: false, code: 'IDEMPOTENCY_KEY_INVALID' });
    expect(parseIdempotencyKey('0192b7c0-7c1e-1d55-9a1e-2f9d8c0b1a10')).toEqual({ ok: false, code: 'IDEMPOTENCY_KEY_INVALID' }); // v1
  });
});

describe('canonical hashing', () => {
  it('sorts keys recursively, keeps array order, no spaces', () => {
    expect(canonicalJson({ b: 1, a: { d: [3, 1, 2], c: 'x/y' } })).toBe('{"a":{"c":"x/y","d":[3,1,2]},"b":1}');
  });
  it('sorts by code point and keeps unicode unescaped', () => {
    expect(canonicalJson({ 'é': 1, z: 2, '😀': 3 })).toBe('{"z":2,"é":1,"😀":3}');
    expect(canonicalJson({ t: 'ñandú' })).toBe('{"t":"ñandú"}');
  });
  it('drops undefined object members', () => {
    expect(canonicalJson({ a: undefined, b: 1 })).toBe('{"b":1}');
  });
  it('is insensitive to key order and whitespace of the original body', () => {
    const base = { method: 'POST', routeTemplate: '/api/v1/posts', principal: 'u1' };
    expect(hashRequest({ ...base, body: { text: 'hi', clientId: 'c1' } })).toBe(hashRequest({ ...base, body: { clientId: 'c1', text: 'hi' } }));
  });
  it('changes with method, route, params, principal or body', () => {
    const base = { method: 'POST', routeTemplate: '/api/v1/events/{eventId}/registrations', params: { eventId: 'e1' }, principal: 'u1', body: { a: 1 } };
    const h = hashRequest(base);
    for (const change of [{ method: 'PUT' }, { routeTemplate: '/x' }, { params: { eventId: 'e2' } }, { principal: 'u2' }, { body: { a: 2 } }]) {
      expect(hashRequest({ ...base, ...change })).not.toBe(h);
    }
  });
  it('has stable test vectors (SHA-256 hex, computed independently with shasum)', () => {
    expect(
      hashRequest({ method: 'post', routeTemplate: '/api/v1/events/{eventId}/registrations', params: { eventId: '0192' }, principal: 'u1', body: { b: 2, a: 1 } }),
    ).toBe('fd5c1bf4654dc8f486bf72f97d6174dfddd36b7fd5d3bbcb5c6c4824815eccb9');
    expect(hashRequest({ method: 'POST', routeTemplate: '/api/v1/posts', principal: 'anonymous' })).toBe('18d79942698cf4edb044ce19baccd973893216bf67c92fd1ad3e7a26a2eff8dc');
    expect(canonicalParams({ b: 2, a: 1 })).toBe('a=1&b=2');
  });
  it('treats empty bodies as the empty string', () => {
    const base = { method: 'POST', routeTemplate: '/x', principal: 'u' };
    expect(hashRequest({ ...base, body: undefined })).toBe(hashRequest({ ...base, body: '' }));
    expect(hashRequest({ ...base, body: null })).toBe(hashRequest({ ...base }));
  });
});

describe('isStorableStatus', () => {
  it('stores 2xx and deterministic 4xx; releases auth, throttling and 5xx', () => {
    for (const s of [200, 201, 202, 204, 400, 404, 409, 422]) expect(isStorableStatus(s)).toBe(true);
    for (const s of [401, 403, 429, 500, 502, 503]) expect(isStorableStatus(s)).toBe(false);
  });
});

storeContract('in-memory', () => {
  let now = 1_800_000_000_000;
  return { store: new InMemoryIdempotencyStore({ service: 'social-service', now: () => now }), advance: (s) => { now += s * 1000; } };
});
