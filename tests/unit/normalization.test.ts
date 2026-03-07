import { describe, expect, it } from 'vitest';
import { AcmeNormalizer } from '../../src/application/normalizers/acme-normalizer.js';
import { GlobexNormalizer } from '../../src/application/normalizers/globex-normalizer.js';
import { buildIdempotencyKey } from '../../src/application/services/idempotency-key.js';

describe('Normalization and idempotency helpers', () => {
  it('normalizes acme payload into internal format', () => {
    const normalizer = new AcmeNormalizer();

    const result = normalizer.normalize({
      eventId: 'evt-100',
      eventType: 'order.created',
      occurredAt: '2026-02-10T12:00:00.000Z',
      subject: 'order-100',
      data: {
        id: 'order-100',
        total: 199,
      },
    });

    expect(result.externalEventId).toBe('evt-100');
    expect(result.eventType).toBe('order.created');
    expect(result.subject).toBe('order-100');
    expect(result.normalizedPayload.provider).toBe('acme');
  });

  it('normalizes globex payload into internal format', () => {
    const normalizer = new GlobexNormalizer();

    const result = normalizer.normalize({
      id: 'evt-200',
      type: 'invoice.failed',
      timestamp: '2026-02-11T10:00:00.000Z',
      resource: {
        id: 'invoice-200',
      },
    });

    expect(result.externalEventId).toBe('evt-200');
    expect(result.eventType).toBe('invoice.failed');
    expect(result.subject).toBe('invoice-200');
  });

  it('builds payload hash idempotency keys when external id is absent', () => {
    const payload = {
      foo: 'bar',
      nested: {
        count: 2,
      },
    };

    const key1 = buildIdempotencyKey('acme', null, payload);
    const key2 = buildIdempotencyKey('acme', null, {
      nested: { count: 2 },
      foo: 'bar',
    });

    expect(key1).toMatch(/^acme:payload:/);
    expect(key1).toBe(key2);
  });
});
