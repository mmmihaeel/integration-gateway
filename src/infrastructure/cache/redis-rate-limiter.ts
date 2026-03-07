import type { Redis } from 'ioredis';
import { RateLimitError } from '../../domain/errors.js';

export class RedisRateLimiter {
  constructor(
    private readonly redis: Redis,
    private readonly limitPerMinute: number,
  ) {}

  async assertWithinLimit(provider: string, sourceIp: string): Promise<void> {
    const bucket = new Date().toISOString().slice(0, 16);
    const key = `ratelimit:${provider}:${sourceIp}:${bucket}`;

    try {
      const current = await this.redis.incr(key);
      if (current === 1) {
        await this.redis.expire(key, 70);
      }

      if (current > this.limitPerMinute) {
        throw new RateLimitError('Webhook rate limit exceeded', {
          provider,
          sourceIp,
          limitPerMinute: this.limitPerMinute,
        });
      }
    } catch (error) {
      if (error instanceof RateLimitError) {
        throw error;
      }

      console.warn('Rate limit check unavailable, allowing request', {
        provider,
        sourceIp,
        error,
      });
    }
  }
}
