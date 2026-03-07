import { buildApp } from './app.js';
import { getConfig } from '../infrastructure/config/env.js';
import { closeRedis } from '../infrastructure/cache/redis-client.js';
import { closePool } from '../infrastructure/db/pool.js';
import { createContainer } from '../infrastructure/container.js';

async function main(): Promise<void> {
  const config = getConfig();
  const container = await createContainer();
  const app = await buildApp(container);

  const close = async (signal: string): Promise<void> => {
    app.log.info({ signal }, 'Shutting down API service');

    await app.close();
    await container.rabbitMqClient.close();
    await closeRedis();
    await closePool();
    process.exit(0);
  };

  process.on('SIGINT', () => {
    void close('SIGINT');
  });

  process.on('SIGTERM', () => {
    void close('SIGTERM');
  });

  await app.listen({
    host: config.APP_HOST,
    port: config.APP_PORT,
  });
}

main().catch((error) => {
  console.error('Failed to start API service', error);
  process.exit(1);
});
