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

describe('Processing retries and status transitions', () => {
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

  it('marks events as failed after max retry attempts and records deliveries', async () => {
    const payload = buildAcmePayload({
      eventId: 'evt-retry-1',
      data: {
        id: 'order-retry-1',
        simulateFailure: true,
      },
    });
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

    await runtime.container.rabbitMqClient.purgeQueues();

    await runtime.container.services.processingService.processMessage({
      normalizedEventId: eventId,
      attemptNo: 1,
      triggeredBy: 'webhook',
      correlationId: 'corr-retry-1',
    });

    const scheduledRetry = await runtime.container.rabbitMqClient.pullOneMessage<{
      normalizedEventId: string;
      attemptNo: number;
      triggeredBy: 'webhook' | 'retry' | 'replay';
      correlationId: string;
    }>('retryQueue');

    expect(scheduledRetry).not.toBeNull();
    expect(scheduledRetry?.normalizedEventId).toBe(eventId);
    expect(scheduledRetry?.attemptNo).toBe(2);
    expect(scheduledRetry?.triggeredBy).toBe('retry');

    await runtime.container.services.processingService.processMessage({
      normalizedEventId: scheduledRetry!.normalizedEventId,
      attemptNo: scheduledRetry!.attemptNo,
      triggeredBy: scheduledRetry!.triggeredBy,
      correlationId: scheduledRetry!.correlationId,
    });

    const finalRetry = await runtime.container.rabbitMqClient.pullOneMessage<{
      normalizedEventId: string;
      attemptNo: number;
      triggeredBy: 'webhook' | 'retry' | 'replay';
      correlationId: string;
    }>('retryQueue');

    expect(finalRetry).not.toBeNull();
    expect(finalRetry?.normalizedEventId).toBe(eventId);
    expect(finalRetry?.attemptNo).toBe(3);
    expect(finalRetry?.triggeredBy).toBe('retry');

    await runtime.container.services.processingService.processMessage({
      normalizedEventId: finalRetry!.normalizedEventId,
      attemptNo: finalRetry!.attemptNo,
      triggeredBy: finalRetry!.triggeredBy,
      correlationId: finalRetry!.correlationId,
    });

    const statusResponse = await runtime.app.inject({
      method: 'GET',
      url: `/api/v1/events/${eventId}/status`,
      headers: managementHeaders(),
    });

    expect(statusResponse.statusCode).toBe(200);
    const statusBody = statusResponse.json();
    expect(statusBody.success).toBe(true);
    expect(statusBody.data.status).toBe('failed');
    expect(statusBody.data.processingAttempts).toBe(3);

    const deliveriesResponse = await runtime.app.inject({
      method: 'GET',
      url: `/api/v1/deliveries?eventId=${eventId}`,
      headers: managementHeaders(),
    });

    const deliveriesBody = deliveriesResponse.json();
    expect(deliveriesBody.success).toBe(true);
    expect(deliveriesBody.meta.total).toBe(3);
    expect(
      deliveriesBody.data.every((attempt: { status: string }) => attempt.status === 'failed'),
    ).toBe(true);

    const retryDepth = await runtime.container.rabbitMqClient.getQueueDepth('retryQueue');
    expect(retryDepth).toBe(0);
  });
});
