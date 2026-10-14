import { InMemoryInbox, InMemoryOutbox, type MemoryTx } from '../src';
import { portContract } from './port-contract';

portContract<MemoryTx | undefined>('in-memory', () => {
  const outbox = new InMemoryOutbox();
  const inbox = new InMemoryInbox(outbox);
  const effects: string[] = [];
  return {
    inbox: inbox as never,
    outbox,
    effect: async (_tx, name) => { effects.push(name); },
    effects: async () => effects,
    unitOfWork: async (work) => {
      const tx: MemoryTx = { staged: [] };
      const r = await work(tx);
      outbox.commit(tx);
      return r;
    },
    transactionalEffects: false,
  };
});
