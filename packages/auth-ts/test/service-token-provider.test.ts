import { describe, expect, it, vi } from 'vitest';

import { ServiceTokenProvider } from '../src/service-token-provider';

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const base = { tokenUrl: 'http://identity/api/v1/auth/service-token', clientId: 'admin-gateway', clientSecret: 's3cret', scopes: ['internal:read'] };

describe('ServiceTokenProvider', () => {
  it('requests a token with client credentials and caches it', async () => {
    const fetchMock = vi.fn(async () => json(200, { accessToken: 't1', tokenType: 'Bearer', expiresIn: 300 }));
    let now = 1_000_000;
    const p = new ServiceTokenProvider({ ...base, fetch: fetchMock as never, now: () => now });
    expect(await p.getToken()).toBe('t1');
    now += 200_000;
    expect(await p.getToken()).toBe('t1');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({ clientId: 'admin-gateway', clientSecret: 's3cret', scopes: ['internal:read'] });
  });

  it('refreshes 30 s before expiry', async () => {
    let n = 0;
    const fetchMock = vi.fn(async () => json(200, { accessToken: `t${++n}`, expiresIn: 300 }));
    let now = 0;
    const p = new ServiceTokenProvider({ ...base, fetch: fetchMock as never, now: () => now });
    expect(await p.getToken()).toBe('t1');
    now = 271_000;
    expect(await p.getToken()).toBe('t2');
  });

  it('is single-flight under concurrency', async () => {
    const fetchMock = vi.fn(async () => {
      await new Promise((r) => setTimeout(r, 10));
      return json(200, { access_token: 'x', expires_in: 300 });
    });
    const p = new ServiceTokenProvider({ ...base, fetch: fetchMock as never });
    const tokens = await Promise.all([p.getToken(), p.getToken(), p.getToken()]);
    expect(tokens).toEqual(['x', 'x', 'x']);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('maps failures and supports invalidate()', async () => {
    const bad = new ServiceTokenProvider({ ...base, fetch: (async () => json(401, {})) as never });
    await expect(bad.getToken()).rejects.toMatchObject({ code: 'INVALID_CLIENT', status: 401 });
    const down = new ServiceTokenProvider({ ...base, fetch: (async () => { throw new Error('ECONNREFUSED'); }) as never });
    await expect(down.getToken()).rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE' });
    let n = 0;
    const p = new ServiceTokenProvider({ ...base, fetch: (async () => json(200, { accessToken: `t${++n}`, expiresIn: 300 })) as never });
    await p.getToken();
    p.invalidate();
    expect(await p.getToken()).toBe('t2');
  });

  it('builds auth headers with actor and correlation id', async () => {
    const p = new ServiceTokenProvider({ ...base, fetch: (async () => json(200, { accessToken: 'tok', expiresIn: 300 })) as never });
    expect(await p.authHeaders({ actorId: 'u1', correlationId: 'c1' })).toEqual({ Authorization: 'Bearer tok', 'X-Actor-Id': 'u1', 'X-Correlation-Id': 'c1' });
  });
});
