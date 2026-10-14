import { SignJWT } from 'jose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AuthError } from '../src/errors';
import { createJwtVerifier } from '../src/jwt-verifier';
import { hasAllScopes, hasAnyRole } from '../src/principal';
import { ISSUER, type JwksServer, makeKey, signToken, startJwksServer, type TestKey } from './helpers';

let k1: TestKey;
let k2: TestKey;
let server: JwksServer;

beforeAll(async () => {
  k1 = await makeKey('2026-10-a');
  k2 = await makeKey('2026-10-b');
  server = await startJwksServer([k1]);
});
afterAll(() => server.close());

const verifier = (extra: object = {}) =>
  createJwtVerifier({ jwksUrl: server.url, issuer: ISSUER, audience: ['bandada-app', 'bandada-admin'], jwksCooldownMs: 0, ...extra });

describe('createJwtVerifier', () => {
  it('accepts a valid token and maps claims', async () => {
    const p = await verifier().verify(await signToken(k1, { roles: ['STUDENT', 'ORGANIZER'], scope: 'a b' }));
    expect(p).toMatchObject({ typ: 'user', roles: ['STUDENT', 'ORGANIZER'], scopes: ['a', 'b'], universityId: 'uni-1', locale: 'es' });
    expect(hasAnyRole(p, ['ORGANIZER'])).toBe(true);
    expect(hasAnyRole(p, ['ADMIN'])).toBe(false);
    expect(hasAllScopes(p, ['a', 'b'])).toBe(true);
  });

  it('caches the JWKS across verifications', async () => {
    const v = verifier();
    const before = server.hits();
    for (let i = 0; i < 5; i += 1) await v.verify(await signToken(k1));
    expect(server.hits() - before).toBeLessThanOrEqual(1);
  });

  it('rejects wrong issuer, audience and expired tokens with 401', async () => {
    const v = verifier();
    for (const claims of [{ iss: 'http://evil' }, { aud: 'other' }, { expiresIn: Math.floor(Date.now() / 1000) - 3600 }]) {
      await expect(v.verify(await signToken(k1, claims))).rejects.toMatchObject({ status: 401, code: 'UNAUTHORIZED' });
    }
  });

  it('rejects non-RS256 algorithms (alg confusion) and garbage', async () => {
    const hs = await new SignJWT({ typ: 'user' })
      .setProtectedHeader({ alg: 'HS256', kid: k1.kid })
      .setSubject('x')
      .setIssuer(ISSUER)
      .setAudience('bandada-app')
      .setExpirationTime('5m')
      .sign(new TextEncoder().encode('secret-secret-secret-secret-secret!'));
    await expect(verifier().verify(hs)).rejects.toBeInstanceOf(AuthError);
    await expect(verifier().verify('not-a-jwt')).rejects.toMatchObject({ status: 401 });
  });

  it('rejects a token signed by an unknown key', async () => {
    const rogue = await makeKey(k1.kid);
    await expect(verifier().verify(await signToken(rogue))).rejects.toMatchObject({ status: 401 });
  });

  it('rejects service tokens unless allowed', async () => {
    const token = await signToken(k1, { typ: 'service', sub: 'service:admin-gateway', aud: 'bandada-app', roles: [] });
    await expect(verifier().verify(token)).rejects.toMatchObject({ status: 401 });
    const p = await verifier({ allowedTypes: ['service'] }).verify(token);
    expect(p.typ).toBe('service');
  });

  it('rejects tokens missing the typ claim', async () => {
    const token = await new SignJWT({ roles: [] })
      .setProtectedHeader({ alg: 'RS256', kid: k1.kid })
      .setSubject('x').setIssuer(ISSUER).setAudience('bandada-app').setExpirationTime('5m')
      .sign(k1.privateKey);
    await expect(verifier().verify(token)).rejects.toMatchObject({ status: 401 });
  });

  it('picks up a rotated key (new kid) by refetching the JWKS', async () => {
    const v = verifier();
    await v.verify(await signToken(k1));
    server.setKeys([k1, k2]);
    const p = await v.verify(await signToken(k2));
    expect(p.sub).toBeTruthy();
    server.setKeys([k1]);
  });

  it('throttles refetches for unknown kids (cooldown)', async () => {
    const v = verifier({ jwksCooldownMs: 60_000 });
    await v.verify(await signToken(k1));
    const before = server.hits();
    const rogue = await makeKey('unknown');
    for (let i = 0; i < 3; i += 1) await expect(v.verify(await signToken(rogue))).rejects.toMatchObject({ status: 401 });
    expect(server.hits() - before).toBeLessThanOrEqual(1);
  });

  it('answers 503 when the JWKS endpoint is unreachable', async () => {
    const v = createJwtVerifier({ jwksUrl: 'http://127.0.0.1:1/jwks.json', issuer: ISSUER, audience: 'bandada-app', jwksTimeoutMs: 500 });
    await expect(v.verify(await signToken(k1))).rejects.toMatchObject({ status: 503, code: 'SERVICE_UNAVAILABLE' });
  });
});
