import type { Redis } from 'ioredis';

export class LockManager {
  constructor(private readonly redis: Redis) {}

  async acquireLock(resourceKey: string, ttlSeconds: number): Promise<boolean> {
    const result = await this.redis.set(resourceKey, '1', 'EX', ttlSeconds, 'NX');
    return result === 'OK';
  }

  async releaseLock(resourceKey: string): Promise<void> {
    await this.redis.del(resourceKey);
  }
}
