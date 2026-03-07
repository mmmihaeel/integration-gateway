import { createHmac } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  bootstrapTestRuntime,
  buildAcmeSignature,
  managementHeaders,
  resetTestData,
  shutdownTestRuntime,
  type TestRuntime,
} from '../helpers/test-context.js';
import { buildAcmePayload } from '../helpers/payloads.js';

describe('Webhook ingestion', () => {
  let runtime: TestRuntime;

  beforeAll(async () => {
    runtime = await bootstrapTestRuntime();
  });

  beforeEach(async () => {
    await resetTestData(runtime.container);
  });

  afterAll(async () => {
    await shutdownTestRuntime(runtime);
  });

  it('accepts valid acme webhook and queues the event', async () => {
    const payload = buildAcmePayload({ eventId: 'evt-acme-1' });
    const signature = buildAcmeSignature(payload);

    const response = await runtime.app.inject({
      method: 'POST',
      url: '/api/v1/webhooks/acme',
      headers: {
        'content-type': 'application/json',
        'x-acme-signature': signature,
      },
      payload,
    });

    expect(response.statusCode).toBe(202);

    const body = response.json();
    expect(body.success).toBe(true);
    expect(body.data.duplicate).toBe(false);
    expect(typeof body.data.eventId).toBe('string');

    const queueDepth = await runtime.container.rabbitMqClient.getQueueDepth('processQueue');
    expect(queueDepth).toBe(1);
  });

  it('returns duplicate response for repeated idempotency key', async () => {
    const payload = buildAcmePayload({ eventId: 'evt-acme-dup' });
    const signature = buildAcmeSignature(payload);

    await runtime.app.inject({
      method: 'POST',
      url: '/api/v1/webhooks/acme',
      headers: {
        'content-type': 'application/json',
        'x-acme-signature': signature,
      },
      payload,
    });

    const duplicateResponse = await runtime.app.inject({
      method: 'POST',
      url: '/api/v1/webhooks/acme',
      headers: {
        'content-type': 'application/json',
        'x-acme-signature': signature,
      },
      payload,
    });

    expect(duplicateResponse.statusCode).toBe(200);
    const duplicateBody = duplicateResponse.json();
    expect(duplicateBody.success).toBe(true);
    expect(duplicateBody.data.duplicate).toBe(true);

    const listResponse = await runtime.app.inject({
      method: 'GET',
      url: '/api/v1/events',
      headers: managementHeaders(),
    });

    const listBody = listResponse.json();
    expect(listBody.meta.total).toBe(1);
  });

  it('rejects webhook with invalid signature', async () => {
    const payload = buildAcmePayload({ eventId: 'evt-acme-invalid' });

    const response = await runtime.app.inject({
      method: 'POST',
      url: '/api/v1/webhooks/acme',
      headers: {
        'content-type': 'application/json',
        'x-acme-signature': 'bad-signature',
      },
      payload,
    });

    expect(response.statusCode).toBe(401);

    const body = response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('UNAUTHORIZED');
  });

  it('rejects webhook with missing acme signature header', async () => {
    const payload = buildAcmePayload({ eventId: 'evt-acme-no-signature' });

    const response = await runtime.app.inject({
      method: 'POST',
      url: '/api/v1/webhooks/acme',
      headers: {
        'content-type': 'application/json',
      },
      payload,
    });

    expect(response.statusCode).toBe(401);
    const body = response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('UNAUTHORIZED');
  });

  it('rejects non-object payloads', async () => {
    const signature = createHmac('sha256', 'acme-demo-secret').update('null').digest('hex');

    const response = await runtime.app.inject({
      method: 'POST',
      url: '/api/v1/webhooks/acme',
      headers: {
        'content-type': 'application/json',
        'x-acme-signature': signature,
      },
      payload: 'null',
    });

    expect(response.statusCode).toBe(400);
    const body = response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('accepts globex provider with token verification', async () => {
    const payload = {
      id: 'globex-evt-1',
      type: 'invoice.created',
      timestamp: new Date().toISOString(),
      resource: {
        id: 'invoice-01',
      },
    };

    const response = await runtime.app.inject({
      method: 'POST',
      url: '/api/v1/webhooks/globex',
      headers: {
        'content-type': 'application/json',
        'x-globex-token': 'globex-demo-secret',
      },
      payload,
    });

    expect(response.statusCode).toBe(202);
    const body = response.json();
    expect(body.success).toBe(true);
    expect(body.data.duplicate).toBe(false);
  });

  it('rejects globex webhook with invalid token', async () => {
    const payload = {
      id: 'globex-evt-invalid-token',
      type: 'invoice.created',
      timestamp: new Date().toISOString(),
      resource: {
        id: 'invoice-02',
      },
    };

    const response = await runtime.app.inject({
      method: 'POST',
      url: '/api/v1/webhooks/globex',
      headers: {
        'content-type': 'application/json',
        'x-globex-token': 'incorrect-token',
      },
      payload,
    });

    expect(response.statusCode).toBe(401);
    const body = response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('UNAUTHORIZED');
  });

  it('rejects malformed acme payloads', async () => {
    const payload = {
      eventId: 'evt-acme-malformed',
      occurredAt: new Date().toISOString(),
      subject: 'order-malformed',
      data: {
        id: 'order-malformed',
      },
    };
    const signature = buildAcmeSignature(payload);

    const response = await runtime.app.inject({
      method: 'POST',
      url: '/api/v1/webhooks/acme',
      headers: {
        'content-type': 'application/json',
        'x-acme-signature': signature,
      },
      payload,
    });

    expect(response.statusCode).toBe(400);
    const body = response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects malformed globex payloads', async () => {
    const payload = {
      id: 'globex-evt-malformed',
      type: 'invoice.created',
      timestamp: 'not-a-valid-date',
      resource: {
        id: 'invoice-03',
      },
    };

    const response = await runtime.app.inject({
      method: 'POST',
      url: '/api/v1/webhooks/globex',
      headers: {
        'content-type': 'application/json',
        'x-globex-token': 'globex-demo-secret',
      },
      payload,
    });

    expect(response.statusCode).toBe(400);
    const body = response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });
});
