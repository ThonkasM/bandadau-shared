import 'reflect-metadata';

import { Body, ConflictException, Controller, Get, Header, HttpCode, type INestApplication, InternalServerErrorException, Param, Post, Put } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { hashRequest, InMemoryIdempotencyStore } from '../src';
import { type IdempotencyMetric,IdempotencyModule, Idempotent } from '../src/nest';

const K1 = '0192b7c0-7c1e-7d55-9a1e-2f9d8c0b1a10';
const K2 = '0192b7c0-7c1e-7d55-9a1e-2f9d8c0b1a11';
const K3 = '0192b7c0-7c1e-7d55-9a1e-2f9d8c0b1a12';

const state = { runs: 0, mode: 'ok' as 'ok' | 'boom' | 'conflict' | 'slow' };

@Controller('api/v1')
class DemoController {
  @Post('posts')
  @Idempotent()
  @Header('Location', '/api/v1/posts/1')
  async create(@Body() body: { text: string }) {
    state.runs += 1;
    if (state.mode === 'slow') await new Promise((r) => setTimeout(r, 150));
    if (state.mode === 'boom') throw new InternalServerErrorException('boom');
    if (state.mode === 'conflict') throw new ConflictException({ type: 'x', title: 'Conflict', status: 409, code: 'ALREADY_REGISTERED' });
    return { id: String(state.runs), text: body.text };
  }

  @Post('events/:eventId/registrations')
  @Idempotent()
  @HttpCode(202)
  register(@Param('eventId') eventId: string) {
    state.runs += 1;
    return { eventId, status: 'PENDING' };
  }

  @Put('things/:id')
  @Idempotent()
  @HttpCode(204)
  put() {
    state.runs += 1;
  }

  @Get('posts')
  @Idempotent()
  list() {
    state.runs += 1;
    return { items: [] };
  }
}

let app: INestApplication;
let base: string;
const metrics: IdempotencyMetric[] = [];
let now = 1_800_000_000_000;
let store: InMemoryIdempotencyStore;

beforeAll(async () => {
  store = new InMemoryIdempotencyStore({ service: 'social-service', now: () => now });
  const moduleRef = await Test.createTestingModule({
    imports: [IdempotencyModule.forRoot({ service: 'social-service', store, onOutcome: (m) => metrics.push(m), getPrincipal: (r) => (r.headers['x-user'] as string | undefined) })],
    controllers: [DemoController],
  }).compile();
  app = moduleRef.createNestApplication();
  await app.listen(0, '127.0.0.1');
  base = (await app.getUrl()).replace('[::1]', '127.0.0.1');
});
afterAll(() => app.close());
beforeEach(() => {
  state.runs = 0;
  state.mode = 'ok';
  metrics.length = 0;
  store.clear();
});

const post = (path: string, key: string | undefined, body: unknown, extra: Record<string, string> = {}, method = 'POST') =>
  fetch(`${base}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(key ? { 'Idempotency-Key': key } : {}), 'X-User': 'u1', ...extra },
    body: JSON.stringify(body),
  });

describe('IdempotencyInterceptor', () => {
  it('400 IDEMPOTENCY_KEY_MISSING / INVALID', async () => {
    const missing = await post('/api/v1/posts', undefined, { text: 'a' });
    expect(missing.status).toBe(400);
    expect(await missing.json()).toMatchObject({ code: 'IDEMPOTENCY_KEY_MISSING', status: 400 });
    const invalid = await post('/api/v1/posts', 'nope', { text: 'a' });
    expect(await invalid.json()).toMatchObject({ code: 'IDEMPOTENCY_KEY_INVALID' });
    expect(state.runs).toBe(0);
  });

  it('executes once and replays the stored response with Idempotent-Replayed', async () => {
    const first = await post('/api/v1/posts', K1, { text: 'hola' });
    expect(first.status).toBe(201);
    expect(first.headers.get('idempotent-replayed')).toBeNull();
    const firstBody = await first.json();

    const second = await post('/api/v1/posts', K1, { text: 'hola' });
    expect(second.status).toBe(201);
    expect(second.headers.get('idempotent-replayed')).toBe('true');
    expect(second.headers.get('location')).toBe('/api/v1/posts/1');
    expect(await second.json()).toEqual(firstBody);
    expect(state.runs).toBe(1);
    expect(metrics).toEqual(['reserved', 'replayed']);
  });

  it('is insensitive to JSON key order but 422 on a different body', async () => {
    await post('/api/v1/posts', K1, { text: 'a', extra: 1 });
    const same = await fetch(`${base}/api/v1/posts`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': K1, 'X-User': 'u1' }, body: '{ "extra":1, "text":"a" }' });
    expect(same.headers.get('idempotent-replayed')).toBe('true');
    const other = await post('/api/v1/posts', K1, { text: 'b', extra: 1 });
    expect(other.status).toBe(422);
    expect(await other.json()).toMatchObject({ code: 'IDEMPOTENCY_KEY_REUSED' });
    expect(state.runs).toBe(1);
  });

  it('422 when another user reuses the key', async () => {
    await post('/api/v1/posts', K1, { text: 'a' });
    const res = await post('/api/v1/posts', K1, { text: 'a' }, { 'X-User': 'u2' });
    expect(res.status).toBe(422);
  });

  it('409 IDEMPOTENCY_IN_PROGRESS with Retry-After while the first request runs', async () => {
    state.mode = 'slow';
    const [a, b] = await Promise.all([post('/api/v1/posts', K2, { text: 'a' }), (async () => { await new Promise((r) => setTimeout(r, 30)); return post('/api/v1/posts', K2, { text: 'a' }); })()]);
    expect(a.status).toBe(201);
    expect(b.status).toBe(409);
    expect(b.headers.get('retry-after')).toBe('1');
    expect(await b.json()).toMatchObject({ code: 'IDEMPOTENCY_IN_PROGRESS' });
    expect(state.runs).toBe(1);
    const retry = await post('/api/v1/posts', K2, { text: 'a' });
    expect(retry.headers.get('idempotent-replayed')).toBe('true');
  });

  it('releases the key on 5xx so the same key can be retried', async () => {
    state.mode = 'boom';
    expect((await post('/api/v1/posts', K3, { text: 'a' })).status).toBe(500);
    state.mode = 'ok';
    const retry = await post('/api/v1/posts', K3, { text: 'a' });
    expect(retry.status).toBe(201);
    expect(retry.headers.get('idempotent-replayed')).toBeNull();
    expect(state.runs).toBe(2);
  });

  it('stores deterministic 4xx errors and replays them', async () => {
    state.mode = 'conflict';
    const first = await post('/api/v1/posts', K3, { text: 'a' });
    expect(first.status).toBe(409);
    state.mode = 'ok';
    const replay = await post('/api/v1/posts', K3, { text: 'a' });
    expect(replay.status).toBe(409);
    expect(replay.headers.get('idempotent-replayed')).toBe('true');
    expect(await replay.json()).toMatchObject({ code: 'ALREADY_REGISTERED' });
    expect(state.runs).toBe(1);
  });

  it('uses the route template and params in the hash', async () => {
    const a = await post('/api/v1/events/e1/registrations', K1, {});
    expect(a.status).toBe(202);
    const b = await post('/api/v1/events/e2/registrations', K1, {});
    expect(b.status).toBe(422);
  });

  it('replays 204 responses', async () => {
    const first = await post('/api/v1/things/1', K1, {}, {}, 'PUT');
    expect(first.status).toBe(204);
    const again = await post('/api/v1/things/1', K1, {}, {}, 'PUT');
    expect(again.status).toBe(204);
    expect(again.headers.get('idempotent-replayed')).toBe('true');
    expect(state.runs).toBe(1);
  });

  it('never wraps GET handlers', async () => {
    const res = await fetch(`${base}/api/v1/posts`);
    expect(res.status).toBe(200);
    expect(state.runs).toBe(1);
  });

  it('takes over an orphaned IN_PROGRESS record after the lock expires', async () => {
    const requestHash = hashRequest({ method: 'POST', routeTemplate: '/api/v1/posts', params: {}, principal: 'u1', body: { text: 'a' } });
    await store.reserve({ key: K2, requestHash, principal: 'u1', method: 'POST', path: '/api/v1/posts' }); // process died mid-request
    expect((await post('/api/v1/posts', K2, { text: 'a' })).status).toBe(409);
    now += 40_000;
    const res = await post('/api/v1/posts', K2, { text: 'a' });
    expect(res.status).toBe(201);
    expect(metrics.at(-1)).toBe('orphan_takeover');
  });
});
