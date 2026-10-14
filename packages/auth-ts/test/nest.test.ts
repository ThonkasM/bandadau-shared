import 'reflect-metadata';

import { Controller, Get, type INestApplication } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { AuthPrincipal } from '../src';
import { AuthModule, CurrentUser, Internal, JwtAuthGuard, Public, Roles, RolesGuard } from '../src/nest';
import { ISSUER, type JwksServer, makeKey, signToken, startJwksServer, type TestKey } from './helpers';

@Controller()
class DemoController {
  @Public()
  @Get('public')
  open() {
    return { ok: true };
  }

  @Get('me')
  me(@CurrentUser() user: AuthPrincipal) {
    return { sub: user.sub, roles: user.roles };
  }

  @Get('uni')
  uni(@CurrentUser('universityId') uni: string) {
    return { uni };
  }

  @Roles('ADMIN', 'MODERATOR')
  @Get('admin')
  admin() {
    return { admin: true };
  }

  @Internal('internal:write')
  @Get('internal/write')
  internal() {
    return { internal: true };
  }
}

let app: INestApplication;
let base: string;
let key: TestKey;
let jwks: JwksServer;

beforeAll(async () => {
  key = await makeKey('k1');
  jwks = await startJwksServer([key]);
  const moduleRef = await Test.createTestingModule({
    imports: [AuthModule.forRoot({ jwksUrl: jwks.url, issuer: ISSUER, jwksCooldownMs: 0 })],
    controllers: [DemoController],
    providers: [
      { provide: APP_GUARD, useExisting: JwtAuthGuard },
      { provide: APP_GUARD, useExisting: RolesGuard },
    ],
  }).compile();
  app = moduleRef.createNestApplication();
  await app.listen(0, '127.0.0.1');
  base = (await app.getUrl()).replace('[::1]', '127.0.0.1');
});
afterAll(async () => {
  await app.close();
  await jwks.close();
});

const get = (path: string, token?: string) => fetch(`${base}${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });

describe('Nest adapter', () => {
  it('lets @Public() through without a token', async () => {
    expect((await get('/public')).status).toBe(200);
  });

  it('401 Problem Details without or with an invalid token', async () => {
    const res = await get('/me');
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ status: 401, code: 'UNAUTHORIZED' });
    expect((await get('/me', 'garbage')).status).toBe(401);
  });

  it('injects @CurrentUser()', async () => {
    const res = await get('/me', await signToken(key, { roles: ['STUDENT', 'ORGANIZER'] }));
    expect(await res.json()).toEqual({ sub: '0192b7c0-7c1e-7d55-9a1e-2f9d8c0b1a10', roles: ['STUDENT', 'ORGANIZER'] });
    expect(await (await get('/uni', await signToken(key))).json()).toEqual({ uni: 'uni-1' });
  });

  it('enforces @Roles with 403', async () => {
    const student = await get('/admin', await signToken(key));
    expect(student.status).toBe(403);
    expect(await student.json()).toMatchObject({ code: 'FORBIDDEN' });
    const mod = await get('/admin', await signToken(key, { roles: ['MODERATOR'], aud: 'bandada-admin' }));
    expect(mod.status).toBe(200);
  });

  it('ServiceAuthGuard needs a service token with audience bandada-internal and the scope', async () => {
    const svc = (scope: string, extra: object = {}) =>
      signToken(key, { typ: 'service', sub: 'service:admin-gateway', roles: [], aud: 'bandada-internal', scope, ...extra });
    expect((await get('/internal/write', await svc('internal:write internal:read'))).status).toBe(200);
    const noScope = await get('/internal/write', await svc('internal:read'));
    expect(noScope.status).toBe(403);
    expect((await get('/internal/write', await svc('internal:write', { aud: 'bandada-app' }))).status).toBe(401);
    expect((await get('/internal/write', await signToken(key, { aud: 'bandada-internal' }))).status).toBe(401);
    expect((await get('/internal/write')).status).toBe(401);
  });
});
