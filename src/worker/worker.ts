import { createContainer } from '../infrastructure/container.js';
import { closeRedis } from '../infrastructure/cache/redis-client.js';
import { closePool } from '../infrastructure/db/pool.js';

async function main(): Promise<void> {
  const container = await createContainer();

  await container.rabbitMqClient.consumeReplayMessages(async (message) => {
    await container.services.replayService.dispatchReplay(message);
  });

  await container.rabbitMqClient.consumeProcessMessages(async (message) => {
    await container.services.processingService.processMessage(message);
  });

  console.log('Worker is consuming replay and processing queues.');

  const shutdown = async (signal: string): Promise<void> => {
    console.log(`Worker received ${signal}, shutting down.`);
    await container.rabbitMqClient.close();
    await closeRedis();
    await closePool();
    process.exit(0);
  };

  process.on('SIGINT', () => {
    void shutdown('SIGINT');
  });

  process.on('SIGTERM', () => {
    void shutdown('SIGTERM');
  });
}

main().catch((error) => {
  console.error('Worker startup failed', error);
  process.exit(1);
});
