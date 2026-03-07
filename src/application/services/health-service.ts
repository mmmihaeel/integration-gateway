import { getPool } from '../../infrastructure/db/pool.js';
import { getRedis } from '../../infrastructure/cache/redis-client.js';
import { RabbitMqClient } from '../../infrastructure/queue/rabbitmq-client.js';

export interface HealthStatus {
  status: 'ok' | 'degraded';
  timestamp: string;
  checks: {
    postgres: { status: 'ok' | 'error'; detail?: string };
    redis: { status: 'ok' | 'error'; detail?: string };
    rabbitmq: { status: 'ok' | 'error'; detail?: string };
  };
}

export class HealthService {
  constructor(private readonly rabbitMqClient: RabbitMqClient) {}

  async getHealth(): Promise<HealthStatus> {
    const checks: HealthStatus['checks'] = {
      postgres: { status: 'ok' },
      redis: { status: 'ok' },
      rabbitmq: { status: 'ok' },
    };

    await Promise.all([
      this.checkPostgres(checks),
      this.checkRedis(checks),
      this.checkRabbitMq(checks),
    ]);

    const status: HealthStatus['status'] = Object.values(checks).some(
      (item) => item.status === 'error',
    )
      ? 'degraded'
      : 'ok';

    return {
      status,
      timestamp: new Date().toISOString(),
      checks,
    };
  }

  private async checkPostgres(checks: HealthStatus['checks']): Promise<void> {
    try {
      const pool = getPool();
      await pool.query('SELECT 1;');
    } catch (error) {
      checks.postgres = {
        status: 'error',
        detail: error instanceof Error ? error.message : 'Unknown database error',
      };
    }
  }

  private async checkRedis(checks: HealthStatus['checks']): Promise<void> {
    try {
      const redis = getRedis();
      if (redis.status !== 'ready') {
        await redis.connect();
      }
      await redis.ping();
    } catch (error) {
      checks.redis = {
        status: 'error',
        detail: error instanceof Error ? error.message : 'Unknown redis error',
      };
    }
  }

  private async checkRabbitMq(checks: HealthStatus['checks']): Promise<void> {
    try {
      await this.rabbitMqClient.getQueueDepth('processQueue');
    } catch (error) {
      checks.rabbitmq = {
        status: 'error',
        detail: error instanceof Error ? error.message : 'Unknown rabbitmq error',
      };
    }
  }
}
