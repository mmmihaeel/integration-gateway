import { Pool, type PoolClient } from 'pg';
import { getConfig } from '../config/env.js';

export type Queryable = Pick<Pool, 'query'> | Pick<PoolClient, 'query'>;

let pool: Pool | null = null;

export function getPool(): Pool {
  if (pool) {
    return pool;
  }

  const config = getConfig();
  pool = new Pool({
    connectionString: config.DATABASE_URL,
    max: config.NODE_ENV === 'test' ? 5 : 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  });

  pool.on('error', (error) => {
    console.error('PostgreSQL pool error', error);
  });

  return pool;
}

export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const activePool = getPool();
  const client = await activePool.connect();

  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
