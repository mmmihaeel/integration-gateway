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

describe('Management endpoint auth', () => {
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

  it('rejects management endpoint access when key is missing', async () => {
    const response = await runtime.app.inject({
      method: 'GET',
      url: '/api/v1/events',
    });

    expect(response.statusCode).toBe(401);
    const body = response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('UNAUTHORIZED');
  });

  it('protects processing-status alias with management key', async () => {
    const response = await runtime.app.inject({
      method: 'GET',
      url: '/api/v1/processing-status/11111111-1111-1111-1111-111111111111',
    });

    expect(response.statusCode).toBe(401);
    const body = response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('UNAUTHORIZED');
  });

  it('rejects management endpoint access when key is incorrect', async () => {
    const response = await runtime.app.inject({
      method: 'GET',
      url: '/api/v1/events',
      headers: {
        'x-internal-api-key': 'invalid-management-key',
      },
    });

    expect(response.statusCode).toBe(401);
    const body = response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('UNAUTHORIZED');
  });

  it('allows management endpoint access with valid key', async () => {
    const response = await runtime.app.inject({
      method: 'GET',
      url: '/api/v1/integrations',
      headers: managementHeaders(),
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
  });

  it('keeps health endpoint accessible without management key', async () => {
    const response = await runtime.app.inject({
      method: 'GET',
      url: '/api/v1/health',
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.success).toBe(true);
  });

  it('does not require management key for webhook ingestion routes', async () => {
    const payload = buildAcmePayload({ eventId: 'evt-mgmt-auth-open-webhook' });
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
  });
});
