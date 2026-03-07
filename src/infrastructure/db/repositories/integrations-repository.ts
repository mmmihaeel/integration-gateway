import type { Integration } from '../../../domain/types.js';
import { getPool, type Queryable } from '../pool.js';

interface IntegrationRow {
  id: string;
  provider: string;
  name: string;
  webhook_secret: string;
  callback_url: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

function mapIntegration(row: IntegrationRow): Integration {
  return {
    id: row.id,
    provider: row.provider,
    name: row.name,
    webhookSecret: row.webhook_secret,
    callbackUrl: row.callback_url,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface IntegrationListParams {
  provider?: string;
  activeOnly?: boolean;
}

export interface UpsertIntegrationInput {
  provider: string;
  name: string;
  webhookSecret: string;
  callbackUrl: string;
  isActive?: boolean;
}

export class IntegrationsRepository {
  constructor(private readonly db: Queryable = getPool()) {}

  async list(params: IntegrationListParams = {}): Promise<Integration[]> {
    const values: unknown[] = [];
    const where: string[] = [];

    if (params.provider) {
      values.push(params.provider);
      where.push(`provider = $${values.length}`);
    }

    if (params.activeOnly) {
      where.push('is_active = true');
    }

    const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';

    const result = await this.db.query<IntegrationRow>(
      `
      SELECT id, provider, name, webhook_secret, callback_url, is_active, created_at, updated_at
      FROM integrations
      ${whereClause}
      ORDER BY provider ASC;
    `,
      values,
    );

    return result.rows.map(mapIntegration);
  }

  async findActiveByProvider(provider: string): Promise<Integration | null> {
    const result = await this.db.query<IntegrationRow>(
      `
      SELECT id, provider, name, webhook_secret, callback_url, is_active, created_at, updated_at
      FROM integrations
      WHERE provider = $1 AND is_active = true;
    `,
      [provider],
    );

    if (result.rowCount === 0) {
      return null;
    }

    return mapIntegration(result.rows[0]);
  }

  async findById(id: string): Promise<Integration | null> {
    const result = await this.db.query<IntegrationRow>(
      `
      SELECT id, provider, name, webhook_secret, callback_url, is_active, created_at, updated_at
      FROM integrations
      WHERE id = $1;
    `,
      [id],
    );

    if (result.rowCount === 0) {
      return null;
    }

    return mapIntegration(result.rows[0]);
  }

  async upsert(input: UpsertIntegrationInput): Promise<Integration> {
    const result = await this.db.query<IntegrationRow>(
      `
      INSERT INTO integrations (provider, name, webhook_secret, callback_url, is_active, updated_at)
      VALUES ($1, $2, $3, $4, COALESCE($5, true), NOW())
      ON CONFLICT (provider)
      DO UPDATE SET
        name = EXCLUDED.name,
        webhook_secret = EXCLUDED.webhook_secret,
        callback_url = EXCLUDED.callback_url,
        is_active = EXCLUDED.is_active,
        updated_at = NOW()
      RETURNING id, provider, name, webhook_secret, callback_url, is_active, created_at, updated_at;
    `,
      [input.provider, input.name, input.webhookSecret, input.callbackUrl, input.isActive ?? true],
    );

    return mapIntegration(result.rows[0]);
  }
}
