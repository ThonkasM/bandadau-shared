import 'reflect-metadata';

import { Injectable } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { describe, expect, it, vi } from 'vitest';

import { type CloudEvent, createCloudEvent, InMemoryInbox, InMemoryOutbox, type MessageContext, type RabbitPublisher } from '../src';
import { ConsumeMessage, MessagingModule, RABBIT_PUBLISHER } from '../src/nest';

const url = process.env.RABBITMQ_URL;
const suite = url ? describe : describe.skip;

const uid = Math.random().toString(36).slice(2, 8);
const QUEUE = `bt-nest-${uid}.commands`;
const TYPE = `bandada.btn${uid}.cmd.issue-ticket.v1`;
const received: Array<{ event: CloudEvent; queue: string }> = [];

@Injectable()
class IssueTicketConsumer {
  @ConsumeMessage({ queue: QUEUE, type: TYPE })
  async handle(event: CloudEvent, ctx: MessageContext<never>) {
    received.push({ event, queue: ctx.queue });
  }
}

suite('MessagingModule (Nest, real broker)', () => {
  it('discovers @ConsumeMessage handlers, starts consumers and the outbox relay', async () => {
    const outbox = new InMemoryOutbox();
    const moduleRef = await Test.createTestingModule({
      imports: [
        MessagingModule.forRoot({
          rabbit: { url: url as string },
          queues: { [QUEUE]: { topology: 'declare', bindings: [{ exchange: 'bandada.commands', routingKey: TYPE }], inbox: new InMemoryInbox(outbox) as never } },
          relay: { outbox, pollIntervalMs: 20 },
        }),
      ],
      providers: [IssueTicketConsumer],
    }).compile();
    const app = moduleRef.createNestApplication();
    await app.init();
    try {
      const publisher = app.get<RabbitPublisher>(RABBIT_PUBLISHER);
      const event = createCloudEvent({ type: TYPE, source: 'events-service', data: { registrationId: 'r1' } });
      await publisher.publish(event);
      await vi.waitFor(() => expect(received).toHaveLength(1), { timeout: 5000 });
      expect(received[0]).toMatchObject({ queue: QUEUE, event: { id: event.id, data: { registrationId: 'r1' } } });

      // the relay started by the module publishes what is in the outbox
      await outbox.enqueue(undefined, createCloudEvent({ type: TYPE, source: 'events-service', data: { registrationId: 'r2' } }));
      await vi.waitFor(() => expect(received).toHaveLength(2), { timeout: 5000 });
    } finally {
      await app.close();
    }
  });
});
