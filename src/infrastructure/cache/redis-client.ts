import { Redis } from 'ioredis';
import { getConfig } from '../config/env.js';

let redisClient: Redis | null = null;

export function getRedis(): Redis {
  if (redisClient) {
    return redisClient;
  }

  const config = getConfig();
  redisClient = new Redis(config.REDIS_URL, {
    lazyConnect: true,
    maxRetriesPerRequest: 2,
    enableReadyCheck: true,
  });

  redisClient.on('error', (error: unknown) => {
    console.error('Redis client error', error);
  });

  return redisClient;
}

export async function ensureRedisConnected(): Promise<void> {
  const redis = getRedis();
  if (redis.status !== 'ready' && redis.status !== 'connecting') {
    await redis.connect();
  }
}

export async function closeRedis(): Promise<void> {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
  }
}
