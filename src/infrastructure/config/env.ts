import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_HOST: z.string().default('0.0.0.0'),
  APP_PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.string().default('info'),

  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  RABBITMQ_URL: z.string().url(),

  RABBITMQ_PROCESS_QUEUE: z.string().default('ig.events.process'),
  RABBITMQ_RETRY_QUEUE: z.string().default('ig.events.retry'),
  RABBITMQ_REPLAY_QUEUE: z.string().default('ig.events.replay'),

  WEBHOOK_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(120),
  IDEMPOTENCY_TTL_SECONDS: z.coerce.number().int().positive().default(86400),
  PROCESSING_LOCK_TTL_SECONDS: z.coerce.number().int().positive().default(60),
  MAX_PROCESSING_RETRIES: z.coerce.number().int().positive().default(3),
  RETRY_BASE_DELAY_MS: z.coerce.number().int().positive().default(5000),

  DB_MIGRATIONS_TABLE: z.string().default('schema_migrations'),
  MANAGEMENT_API_KEY: z.string().min(16),
});

export type AppConfig = z.infer<typeof EnvSchema>;

let cachedConfig: AppConfig | null = null;

export function getConfig(): AppConfig {
  if (cachedConfig) {
    return cachedConfig;
  }

  cachedConfig = EnvSchema.parse(process.env);
  return cachedConfig;
}

export function resetConfigForTests(): void {
  cachedConfig = null;
}
