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

describe('Replay flow', () => {
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

  it('creates replay request and publishes replay queue message', async () => {
    const payload = buildAcmePayload({ eventId: 'evt-replay-1' });
    const signature = buildAcmeSignature(payload);

    const ingest = await runtime.app.inject({
      method: 'POST',
      url: '/api/v1/webhooks/acme',
      headers: {
        'content-type': 'application/json',
        'x-acme-signature': signature,
      },
      payload,
    });

    const eventId = ingest.json().data.eventId as string;

    const replayResponse = await runtime.app.inject({
      method: 'POST',
      url: `/api/v1/events/${eventId}/replay`,
      headers: {
        'content-type': 'application/json',
        ...managementHeaders(),
      },
      payload: {
        requestedBy: 'test-user',
        reason: 'Re-run after downstream maintenance window',
      },
    });

    expect(replayResponse.statusCode).toBe(202);
    const replayBody = replayResponse.json();
    expect(replayBody.success).toBe(true);
    expect(typeof replayBody.data.replayRequestId).toBe('string');

    const message = await runtime.container.rabbitMqClient.pullOneMessage<{
      normalizedEventId: string;
      replayRequestId: string;
    }>('replayQueue');

    expect(message).not.toBeNull();
    expect(message?.normalizedEventId).toBe(eventId);
    expect(message?.replayRequestId).toBe(replayBody.data.replayRequestId);
  });

  it('returns validation error for replay with short reason', async () => {
    const payload = buildAcmePayload({ eventId: 'evt-replay-short-reason' });
    const signature = buildAcmeSignature(payload);

    const ingest = await runtime.app.inject({
      method: 'POST',
      url: '/api/v1/webhooks/acme',
      headers: {
        'content-type': 'application/json',
        'x-acme-signature': signature,
      },
      payload,
    });

    const eventId = ingest.json().data.eventId as string;

    const replayResponse = await runtime.app.inject({
      method: 'POST',
      url: `/api/v1/events/${eventId}/replay`,
      headers: {
        'content-type': 'application/json',
        ...managementHeaders(),
      },
      payload: {
        requestedBy: 'test-user',
        reason: 'bad',
      },
    });

    expect(replayResponse.statusCode).toBe(400);
    const body = replayResponse.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns not found for replay on unknown event', async () => {
    const replayResponse = await runtime.app.inject({
      method: 'POST',
      url: '/api/v1/events/11111111-1111-1111-1111-111111111111/replay',
      headers: {
        'content-type': 'application/json',
        ...managementHeaders(),
      },
      payload: {
        requestedBy: 'test-user',
        reason: 'Attempt replay for missing event id',
      },
    });

    expect(replayResponse.statusCode).toBe(404);
    const body = replayResponse.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('NOT_FOUND');
  });
});
