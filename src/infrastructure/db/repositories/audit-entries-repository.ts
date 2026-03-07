import type { AuditEntry, PaginatedResult } from '../../../domain/types.js';
import { getPool, type Queryable } from '../pool.js';

interface AuditEntryRow {
  id: number;
  entity_type: string;
  entity_id: string;
  action: string;
  actor: string;
  details: Record<string, unknown>;
  created_at: string;
}

function mapAuditEntry(row: AuditEntryRow): AuditEntry {
  return {
    id: row.id,
    entityType: row.entity_type,
    entityId: row.entity_id,
    action: row.action,
    actor: row.actor,
    details: row.details,
    createdAt: row.created_at,
  };
}

export interface AuditEntryCreateInput {
  entityType: string;
  entityId: string;
  action: string;
  actor: string;
  details?: Record<string, unknown>;
}

export interface AuditEntryListParams {
  page: number;
  pageSize: number;
  entityType?: string;
  entityId?: string;
  action?: string;
}

export class AuditEntriesRepository {
  constructor(private readonly db: Queryable = getPool()) {}

  async create(input: AuditEntryCreateInput): Promise<AuditEntry> {
    const result = await this.db.query<AuditEntryRow>(
      `
      INSERT INTO audit_entries (entity_type, entity_id, action, actor, details)
      VALUES ($1, $2, $3, $4, $5::jsonb)
      RETURNING id, entity_type, entity_id, action, actor, details, created_at;
    `,
      [
        input.entityType,
        input.entityId,
        input.action,
        input.actor,
        JSON.stringify(input.details ?? {}),
      ],
    );

    return mapAuditEntry(result.rows[0]);
  }

  async list(params: AuditEntryListParams): Promise<PaginatedResult<AuditEntry>> {
    const values: unknown[] = [];
    const where: string[] = [];

    if (params.entityType) {
      values.push(params.entityType);
      where.push(`entity_type = $${values.length}`);
    }

    if (params.entityId) {
      values.push(params.entityId);
      where.push(`entity_id = $${values.length}`);
    }

    if (params.action) {
      values.push(params.action);
      where.push(`action = $${values.length}`);
    }

    const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';

    const countResult = await this.db.query<{ total: string }>(
      `SELECT COUNT(*)::text AS total FROM audit_entries ${whereClause};`,
      values,
    );

    const offset = (params.page - 1) * params.pageSize;
    values.push(params.pageSize, offset);

    const listResult = await this.db.query<AuditEntryRow>(
      `
      SELECT id, entity_type, entity_id, action, actor, details, created_at
      FROM audit_entries
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${values.length - 1} OFFSET $${values.length};
    `,
      values,
    );

    return {
      items: listResult.rows.map(mapAuditEntry),
      page: params.page,
      pageSize: params.pageSize,
      total: Number(countResult.rows[0].total),
    };
  }
}
