process.env.NODE_ENV = 'test';
process.env.APP_HOST = process.env.APP_HOST ?? '127.0.0.1';
process.env.APP_PORT = process.env.APP_PORT ?? '3100';
process.env.LOG_LEVEL = process.env.LOG_LEVEL ?? 'warn';
process.env.DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgres://app:app@127.0.0.1:5434/integration_gateway';
process.env.REDIS_URL = process.env.REDIS_URL ?? 'redis://127.0.0.1:6381';
process.env.RABBITMQ_URL = process.env.RABBITMQ_URL ?? 'amqp://guest:guest@127.0.0.1:5672';
process.env.RABBITMQ_PROCESS_QUEUE = process.env.RABBITMQ_PROCESS_QUEUE ?? 'ig.test.events.process';
process.env.RABBITMQ_RETRY_QUEUE = process.env.RABBITMQ_RETRY_QUEUE ?? 'ig.test.events.retry';
process.env.RABBITMQ_REPLAY_QUEUE = process.env.RABBITMQ_REPLAY_QUEUE ?? 'ig.test.events.replay';
process.env.WEBHOOK_RATE_LIMIT_PER_MINUTE = process.env.WEBHOOK_RATE_LIMIT_PER_MINUTE ?? '120';
process.env.IDEMPOTENCY_TTL_SECONDS = process.env.IDEMPOTENCY_TTL_SECONDS ?? '86400';
process.env.PROCESSING_LOCK_TTL_SECONDS = process.env.PROCESSING_LOCK_TTL_SECONDS ?? '60';
process.env.MAX_PROCESSING_RETRIES = process.env.MAX_PROCESSING_RETRIES ?? '3';
process.env.RETRY_BASE_DELAY_MS = process.env.RETRY_BASE_DELAY_MS ?? '50';
process.env.DB_MIGRATIONS_TABLE = process.env.DB_MIGRATIONS_TABLE ?? 'schema_migrations';
process.env.MANAGEMENT_API_KEY = process.env.MANAGEMENT_API_KEY ?? 'test-management-api-key';
