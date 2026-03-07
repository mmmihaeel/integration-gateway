import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  bootstrapTestRuntime,
  shutdownTestRuntime,
  type TestRuntime,
} from '../helpers/test-context.js';

describe('GET /api/v1/health', () => {
  let runtime: TestRuntime;

  beforeAll(async () => {
    runtime = await bootstrapTestRuntime();
  });

  afterAll(async () => {
    await shutdownTestRuntime(runtime);
  });

  it('returns dependency health for postgres, redis, and rabbitmq', async () => {
    const response = await runtime.app.inject({
      method: 'GET',
      url: '/api/v1/health',
    });

    expect(response.statusCode).toBe(200);

    const payload = response.json();
    expect(payload.success).toBe(true);
    expect(payload.data.status).toBe('ok');
    expect(payload.data.checks.postgres.status).toBe('ok');
    expect(payload.data.checks.redis.status).toBe('ok');
    expect(payload.data.checks.rabbitmq.status).toBe('ok');
  });
});
