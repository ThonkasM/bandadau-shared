import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, expectTypeOf, it } from 'vitest';
import { parse } from 'yaml';

import type { EventData, EventType } from '../src/generated/events';
import { eventMeta, eventTypes } from '../src/generated/events';
import type { Role } from '../src/generated/graphql/admin';
import type { components as Social } from '../src/generated/openapi/social';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const asyncapi = path.resolve(root, '../../../bandadau-docs/contracts/asyncapi/bandada-events.yaml');

describe('generated output', () => {
  it('exposes event types with exchange metadata', () => {
    expect(eventTypes).toContain('bandada.identity.user.registered.v1');
    expect(eventMeta['bandada.wallet.cmd.debit-credits.v1'].exchange).toBe('bandada.commands');
    expect(eventMeta['bandada.identity.user.registered.v1'].exchange).toBe('bandada.events');
  });

  it('types event data', () => {
    expectTypeOf<EventData<'bandada.identity.user.registered.v1'>>().toHaveProperty('userId');
    expectTypeOf<'bandada.identity.user.registered.v1'>().toExtend<EventType>();
  });

  it('types OpenAPI schemas and GraphQL enums', () => {
    expectTypeOf<Social['schemas']['Problem']>().toHaveProperty('code');
    expectTypeOf<Role>().toEqualTypeOf<'STUDENT' | 'ORGANIZER' | 'MODERATOR' | 'ADMIN'>();
  });

  it.skipIf(!fs.existsSync(asyncapi))('covers every message of the AsyncAPI contract', () => {
    const doc = parse(fs.readFileSync(asyncapi, 'utf8'));
    const n = Object.keys(doc.components.messages).length;
    expect(eventTypes.length).toBe(n);
  });
});
