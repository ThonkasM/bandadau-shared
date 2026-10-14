import { CreateTableCommand, DeleteTableCommand, DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createCloudEvent, DynamoInbox, DynamoOutbox, type DynamoTransaction, DynamoUnitOfWork } from '../src';
import { portContract } from './port-contract';

// Runs against DynamoDB Local when DYNAMODB_ENDPOINT is set (e.g. http://127.0.0.1:18000).
const endpoint = process.env.DYNAMODB_ENDPOINT;
const suite = endpoint ? describe : describe.skip;

suite('DynamoDB adapters (DynamoDB Local)', () => {
  const raw = new DynamoDBClient({ endpoint, region: 'us-east-1', credentials: { accessKeyId: 'local', secretAccessKey: 'local' } });
  const doc = DynamoDBDocumentClient.from(raw);
  const tables: string[] = [];

  async function createTable(): Promise<string> {
    const name = `bandada-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    await raw.send(
      new CreateTableCommand({
        TableName: name,
        AttributeDefinitions: [
          { AttributeName: 'pk', AttributeType: 'S' },
          { AttributeName: 'sk', AttributeType: 'S' },
          { AttributeName: 'gsi1pk', AttributeType: 'S' },
          { AttributeName: 'gsi1sk', AttributeType: 'S' },
        ],
        KeySchema: [{ AttributeName: 'pk', KeyType: 'HASH' }, { AttributeName: 'sk', KeyType: 'RANGE' }],
        GlobalSecondaryIndexes: [
          { IndexName: 'GSI1', KeySchema: [{ AttributeName: 'gsi1pk', KeyType: 'HASH' }, { AttributeName: 'gsi1sk', KeyType: 'RANGE' }], Projection: { ProjectionType: 'ALL' } },
        ],
        BillingMode: 'PAY_PER_REQUEST',
      }),
    );
    tables.push(name);
    return name;
  }

  afterAll(async () => {
    for (const t of tables) await raw.send(new DeleteTableCommand({ TableName: t }));
    raw.destroy();
  });

  portContract<DynamoTransaction>('dynamodb', async () => {
    const tableName = await createTable();
    const outbox = new DynamoOutbox({ client: doc, tableName });
    return {
      inbox: new DynamoInbox({ client: doc, tableName }),
      outbox,
      effect: async (tx, name) => { tx.put({ pk: `EFFECT#${name}`, sk: 'META' }, 'attribute_not_exists(pk)'); },
      effects: async () => {
        const { Items = [] } = await doc.send(new ScanCommand({ TableName: tableName, FilterExpression: 'begins_with(pk, :p)', ExpressionAttributeValues: { ':p': 'EFFECT#' } }));
        return Items.map((i) => String(i.pk).slice('EFFECT#'.length));
      },
      unitOfWork: (work) => new DynamoUnitOfWork(doc, tableName).run(work),
      transactionalEffects: true,
    };
  });

  describe('item layout (eventos-y-mensajeria.md 5.3, idempotencia.md 3.3)', () => {
    let tableName: string;
    beforeAll(async () => {
      tableName = await createTable();
    });

    it('writes OUTBOX#<id>/META with the GSI1 pending key, and INBOX#<id>/META', async () => {
      const outbox = new DynamoOutbox({ client: doc, tableName });
      const inbox = new DynamoInbox({ client: doc, tableName });
      const event = createCloudEvent({ type: 'bandada.ticketing.ticket-issued.v1', source: 'ticketing-service', data: { a: 1 } });
      await inbox.runOnce({ messageId: 'msg-1', consumer: 'ticketing-service.commands' }, async (tx) => {
        tx.put({ pk: 'REG#r1', sk: 'LOCK' }, 'attribute_not_exists(pk)');
        await outbox.enqueue(tx, event);
      });
      const out = await doc.send(new GetCommand({ TableName: tableName, Key: { pk: `OUTBOX#${event.id}`, sk: 'META' } }));
      expect(out.Item).toMatchObject({ gsi1pk: 'OUTBOX#PENDING', exchange: 'bandada.events', routingKey: event.type, attempts: 0 });
      expect(String(out.Item?.gsi1sk)).toMatch(new RegExp(`#${event.id}$`));
      const inb = await doc.send(new GetCommand({ TableName: tableName, Key: { pk: 'INBOX#msg-1', sk: 'META' } }));
      expect(inb.Item).toMatchObject({ consumer: 'ticketing-service.commands' });
      expect(typeof inb.Item?.expiresAt).toBe('number');
    });

    it('a business conflict (UNIQUE lock) cancels the whole transaction, including the inbox marker', async () => {
      const inbox = new DynamoInbox({ client: doc, tableName });
      await inbox.runOnce({ messageId: 'msg-a', consumer: 'q' }, async (tx) => { tx.put({ pk: 'REG#same', sk: 'LOCK' }, 'attribute_not_exists(pk)'); });
      await expect(
        inbox.runOnce({ messageId: 'msg-b', consumer: 'q' }, async (tx) => { tx.put({ pk: 'REG#same', sk: 'LOCK' }, 'attribute_not_exists(pk)'); }),
      ).rejects.toMatchObject({ name: 'TransactionCanceledException' });
      const inb = await doc.send(new GetCommand({ TableName: tableName, Key: { pk: 'INBOX#msg-b', sk: 'META' } }));
      expect(inb.Item).toBeUndefined();
    });

    it('rejects transactions above 100 items', async () => {
      const inbox = new DynamoInbox({ client: doc, tableName });
      await expect(
        inbox.runOnce({ messageId: 'big', consumer: 'q' }, async (tx) => { for (let i = 0; i < 100; i += 1) tx.put({ pk: `X#${i}`, sk: 'META' }); }),
      ).rejects.toThrow(RangeError);
    });
  });
});
