import { type ClientSession, MongoClient } from 'mongodb';
import { afterAll, beforeAll, describe } from 'vitest';

import { MongoInbox, MongoOutbox } from '../src';
import { portContract } from './port-contract';

// Runs against a real MongoDB replica set when MONGO_URL is set (e.g. mongodb://127.0.0.1:17017/?directConnection=true).
const url = process.env.MONGO_URL;
const suite = url ? describe : describe.skip;

suite('Mongo adapters (replica set)', () => {
  let client: MongoClient;
  const dbName = `bandada_messaging_test_${Date.now()}`;

  beforeAll(async () => {
    client = await new MongoClient(url as string).connect();
  });
  afterAll(async () => {
    await client.db(dbName).dropDatabase();
    await client.close();
  });

  portContract<ClientSession>('mongo', async () => {
    const db = client.db(dbName);
    await db.dropDatabase();
    // collections must exist before they are used inside a transaction
    for (const name of ['outbox', 'processedMessages', 'effects']) await db.createCollection(name);
    const outbox = new MongoOutbox({ db });
    await outbox.ensureIndexes();
    const inbox = new MongoInbox({ client, db });
    await inbox.ensureIndexes();
    return {
      inbox,
      outbox: outbox as never,
      effect: async (session, name) => { await db.collection('effects').insertOne({ _id: name as never }, { session }); },
      effects: async () => (await db.collection('effects').find().toArray()).map((d) => String(d._id)),
      unitOfWork: async (work) => {
        const session = client.startSession();
        try {
          let result!: Awaited<ReturnType<typeof work>>;
          await session.withTransaction(async () => { result = await work(session); });
          return result;
        } finally {
          await session.endSession();
        }
      },
      transactionalEffects: true,
    };
  });
});
