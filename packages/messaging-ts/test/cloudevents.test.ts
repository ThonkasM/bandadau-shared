import { describe, expect, it } from 'vitest';

import { CLOUDEVENTS_CONTENT_TYPE, createCausedEvent, createCloudEvent, exchangeForType, isValidEventType, parseCloudEvent, PermanentError, toAmqpMessage, uuidv7 } from '../src';

const TRACE = '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01';

describe('uuidv7', () => {
  it('is a version 7 UUID with a sortable timestamp prefix', () => {
    const a = uuidv7(1_800_000_000_000);
    const b = uuidv7(1_800_000_001_000);
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(a < b).toBe(true);
    expect(new Set(Array.from({ length: 100 }, () => uuidv7())).size).toBe(100);
  });
});

describe('createCloudEvent', () => {
  it('builds a CloudEvents 1.0 envelope with Bandada extensions', () => {
    const event = createCloudEvent({
      type: 'bandada.wallet.cmd.debit-credits.v1',
      source: 'events-service',
      subject: 'registration/r1',
      data: { amountCredits: 50 },
      correlationid: 'c-1',
      causationid: 'p-1',
      sagaid: 's-1',
      traceparent: TRACE,
    });
    expect(event).toMatchObject({
      specversion: '1.0',
      source: '/services/events-service',
      type: 'bandada.wallet.cmd.debit-credits.v1',
      subject: 'registration/r1',
      datacontenttype: 'application/json',
      correlationid: 'c-1',
      causationid: 'p-1',
      sagaid: 's-1',
      traceparent: TRACE,
      data: { amountCredits: 50 },
    });
    expect(event.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(new Date(event.time).toString()).not.toBe('Invalid Date');
  });

  it('omits unset optional attributes', () => {
    const event = createCloudEvent({ type: 'bandada.identity.user.registered.v1', source: '/services/identity-service', data: {} });
    expect(Object.keys(event).sort()).toEqual(['data', 'datacontenttype', 'id', 'source', 'specversion', 'time', 'type']);
  });

  it('validates type, data and traceparent', () => {
    const base = { source: 's', data: {} };
    expect(() => createCloudEvent({ ...base, type: 'wrong' })).toThrow(TypeError);
    expect(() => createCloudEvent({ ...base, type: 'bandada.x.y.v1', traceparent: 'nope' })).toThrow(TypeError);
    expect(() => createCloudEvent({ type: 'bandada.x.y.v1', source: 's', data: undefined })).toThrow(TypeError);
    expect(isValidEventType('bandada.events.registration.confirmed.v1')).toBe(true);
    expect(isValidEventType('bandada.social.post.created')).toBe(false);
  });

  it('createCausedEvent propagates correlation, saga and trace and sets causationid', () => {
    const cause = createCloudEvent({ type: 'bandada.events.registration.requested.v1', source: 'events-service', data: {}, correlationid: 'c-1', sagaid: 's-1', traceparent: TRACE });
    const next = createCausedEvent(cause, { type: 'bandada.wallet.credits-debited.v1', source: 'wallet-service', data: { ok: true } });
    expect(next).toMatchObject({ correlationid: 'c-1', sagaid: 's-1', traceparent: TRACE, causationid: cause.id });
    expect(next.id).not.toBe(cause.id);
  });

  it('chooses the exchange by type', () => {
    expect(exchangeForType('bandada.wallet.cmd.debit-credits.v1')).toBe('bandada.commands');
    expect(exchangeForType('bandada.wallet.credits-debited.v1')).toBe('bandada.events');
  });
});

describe('AMQP mapping and parsing', () => {
  it('sets message_id, type, persistence, content type and trace headers', () => {
    const event = createCloudEvent({ type: 'bandada.social.post.created.v1', source: 'social-service', data: { postId: 'p' }, correlationid: 'c-9', traceparent: TRACE });
    const { content, options } = toAmqpMessage(event);
    expect(JSON.parse(content.toString())).toEqual(event);
    expect(options).toMatchObject({ messageId: event.id, type: event.type, contentType: CLOUDEVENTS_CONTENT_TYPE, correlationId: 'c-9', persistent: true, mandatory: true });
    expect(options.headers).toEqual({ traceparent: TRACE });
    expect(options.timestamp).toBe(Math.floor(new Date(event.time).getTime() / 1000));
  });

  it('round-trips through parseCloudEvent', () => {
    const event = createCloudEvent({ type: 'bandada.social.post.created.v1', source: 'social-service', data: { a: 1 } });
    expect(parseCloudEvent(toAmqpMessage(event).content)).toEqual(event);
  });

  it('rejects malformed bodies with PermanentError', () => {
    for (const body of ['not json', '[]', '{"specversion":"0.3"}', '{"specversion":"1.0","id":"1","source":"s","type":"t"}', '{"specversion":"1.0","source":"s","type":"t","data":{}}']) {
      expect(() => parseCloudEvent(body)).toThrow(PermanentError);
    }
  });
});
