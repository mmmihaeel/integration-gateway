import { createHmac } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/api/app.js';
import { closeRedis } from '../../src/infrastructure/cache/redis-client.js';
import {
  createContainer,
  resetContainerForTests,
  type AppContainer,
} from '../../src/infrastructure/container.js';
import { runMigrations } from '../../src/infrastructure/db/migration-runner.js';
import { closePool, getPool } from '../../src/infrastructure/db/pool.js';
import { IntegrationsRepository } from '../../src/infrastructure/db/repositories/integrations-repository.js';

export interface TestRuntime {
  app: FastifyInstance;
  container: AppContainer;
}

export async function bootstrapTestRuntime(): Promise<TestRuntime> {
  await runMigrations();
  const container = await createContainer();
  const app = await buildApp(container);

  await ensureBaseIntegrations();
  await resetTestData(container);

  return {
    app,
    container,
  };
}

export async function resetTestData(container: AppContainer): Promise<void> {
  const pool = getPool();
  await pool.query(`
    TRUNCATE TABLE
      audit_entries,
      replay_requests,
      delivery_attempts,
      processing_jobs,
      normalized_events,
      webhook_events
    RESTART IDENTITY CASCADE;
  `);

  await container.rabbitMqClient.purgeQueues();
}

export async function shutdownTestRuntime(runtime?: TestRuntime): Promise<void> {
  if (!runtime) {
    await resetContainerForTests();
    await closeRedis();
    await closePool();
    return;
  }
  await runtime.app.close();
  await runtime.container.rabbitMqClient.close();
  await resetContainerForTests();
  await closeRedis();
  await closePool();
}

export async function ensureBaseIntegrations(): Promise<void> {
  const repository = new IntegrationsRepository(getPool());
  await repository.upsert({
    provider: 'acme',
    name: 'Acme Test Integration',
    webhookSecret: 'acme-demo-secret',
    callbackUrl: 'http://127.0.0.1:9/unreachable',
    isActive: true,
  });

  await repository.upsert({
    provider: 'globex',
    name: 'Globex Test Integration',
    webhookSecret: 'globex-demo-secret',
    callbackUrl: 'http://127.0.0.1:9/unreachable',
    isActive: true,
  });
}

export async function setIntegrationCallback(provider: string, callbackUrl: string): Promise<void> {
  const pool = getPool();
  await pool.query(
    `UPDATE integrations SET callback_url = $2, updated_at = NOW() WHERE provider = $1;`,
    [provider, callbackUrl],
  );
}

export function buildAcmeSignature(body: object, secret = 'acme-demo-secret'): string {
  const rawBody = JSON.stringify(body);
  return createHmac('sha256', secret).update(rawBody).digest('hex');
}

export function managementHeaders(): Record<string, string> {
  return {
    'x-internal-api-key': process.env.MANAGEMENT_API_KEY ?? 'test-management-api-key',
  };
}
