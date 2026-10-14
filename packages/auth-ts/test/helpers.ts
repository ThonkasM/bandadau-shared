import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import { exportJWK, generateKeyPair, type JWK, SignJWT } from 'jose';

export const ISSUER = 'http://api.bandada.localhost';

export interface TestKey {
  kid: string;
  privateKey: Awaited<ReturnType<typeof generateKeyPair>>['privateKey'];
  publicJwk: JWK;
}

export async function makeKey(kid: string): Promise<TestKey> {
  const { privateKey, publicKey } = await generateKeyPair('RS256', { extractable: true });
  const publicJwk = await exportJWK(publicKey);
  return { kid, privateKey, publicJwk: { ...publicJwk, kid, alg: 'RS256', use: 'sig' } };
}

export interface ClaimsInput {
  sub?: string;
  typ?: 'user' | 'service';
  roles?: string[];
  scope?: string;
  aud?: string | string[];
  iss?: string;
  expiresIn?: string | number;
  extra?: Record<string, unknown>;
}

export async function signToken(key: TestKey, claims: ClaimsInput = {}): Promise<string> {
  const { sub = '0192b7c0-7c1e-7d55-9a1e-2f9d8c0b1a10', typ = 'user', roles = ['STUDENT'], scope = '', aud = 'bandada-app', iss = ISSUER, expiresIn = '15m', extra = {} } = claims;
  return new SignJWT({ typ, roles, uni: 'uni-1', locale: 'es', scope, ...extra })
    .setProtectedHeader({ alg: 'RS256', kid: key.kid, typ: 'JWT' })
    .setSubject(sub)
    .setIssuer(iss)
    .setAudience(aud)
    .setJti('jti-1')
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(key.privateKey);
}

export interface JwksServer {
  url: string;
  hits: () => number;
  setKeys: (keys: TestKey[]) => void;
  close: () => Promise<void>;
}

export async function startJwksServer(initial: TestKey[]): Promise<JwksServer> {
  let keys = initial;
  let hits = 0;
  const server: Server = createServer((_req, res) => {
    hits += 1;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ keys: keys.map((k) => k.publicJwk) }));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}/.well-known/jwks.json`,
    hits: () => hits,
    setKeys: (k) => {
      keys = k;
    },
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}
