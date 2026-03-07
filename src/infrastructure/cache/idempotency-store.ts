import type { Redis } from 'ioredis';

export class IdempotencyStore {
  constructor(private readonly redis: Redis) {}

  async createMarker(idempotencyKey: string, ttlSeconds: number): Promise<boolean> {
    const key = `idempotency:${idempotencyKey}`;

    const result = await this.redis.set(key, '1', 'EX', ttlSeconds, 'NX');
    return result === 'OK';
  }
}
