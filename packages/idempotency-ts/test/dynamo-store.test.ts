import { CreateTableCommand, DeleteTableCommand, DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { DynamoIdempotencyStore } from '../src';
import { storeContract } from './store-contract';

// Runs against DynamoDB Local when DYNAMODB_ENDPOINT is set (e.g. http://127.0.0.1:18000).
const endpoint = process.env.DYNAMODB_ENDPOINT;
const suite = endpoint ? describe : describe.skip;

suite('DynamoIdempotencyStore (DynamoDB Local)', () => {
  const table = `bandada-idempotency-test-${Date.now()}`;
  const raw = new DynamoDBClient({ endpoint, region: 'us-east-1', credentials: { accessKeyId: 'local', secretAccessKey: 'local' } });
  const doc = DynamoDBDocumentClient.from(raw);
  let now = 1_800_000_000_000;

  beforeAll(async () => {
    await raw.send(
      new CreateTableCommand({ TableName: table, AttributeDefinitions: [{ AttributeName: 'pk', AttributeType: 'S' }], KeySchema: [{ AttributeName: 'pk', KeyType: 'HASH' }], BillingMode: 'PAY_PER_REQUEST' }),
    );
  });
  afterAll(async () => {
    await raw.send(new DeleteTableCommand({ TableName: table }));
    raw.destroy();
  });

  storeContract('dynamodb', () => {
    // unique service prefix per test keeps contract tests independent inside the same table
    const service = `svc-${Math.random().toString(36).slice(2)}`;
    return { store: new DynamoIdempotencyStore({ client: doc, tableName: table, service, now: () => now }), advance: (s) => { now += s * 1000; } };
  });

  it('writes the documented item shape and isolates services by prefix', async () => {
    const a = new DynamoIdempotencyStore({ client: doc, tableName: table, service: 'events-service', now: () => now });
    const b = new DynamoIdempotencyStore({ client: doc, tableName: table, service: 'wallet-service', now: () => now });
    const key = '0192b7c0-7c1e-7d55-9a1e-2f9d8c0b1a99';
    const input = { key, requestHash: 'h', principal: 'u1', method: 'POST', path: '/api/v1/events/{eventId}/registrations' };
    await a.reserve(input);
    expect(await b.reserve(input)).toEqual({ kind: 'reserved', orphanTakeover: false });
    const { Item } = await doc.send(new GetCommand({ TableName: table, Key: { pk: `events-service#${key}` }, ConsistentRead: true }));
    expect(Item).toMatchObject({ status: 'IN_PROGRESS', requestHash: 'h', principal: 'u1', method: 'POST', path: input.path });
    expect(Item!.expiresAt).toBe(Math.floor(now / 1000) + 86_400);
    expect(Item!.lockExpiresAt).toBe(Math.floor(now / 1000) + 30);
    await a.complete(key, { status: 202, headers: { Location: '/x' }, body: '{"a":1}' });
    const done = await doc.send(new GetCommand({ TableName: table, Key: { pk: `events-service#${key}` }, ConsistentRead: true }));
    expect(done.Item).toMatchObject({ status: 'COMPLETED', responseStatus: 202, responseBody: '{"a":1}', responseHeaders: { Location: '/x' } });
  });
});
