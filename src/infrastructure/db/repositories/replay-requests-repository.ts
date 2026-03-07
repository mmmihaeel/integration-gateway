import type { PaginatedResult, ReplayRequest, ReplayStatus } from '../../../domain/types.js';
import { getPool, type Queryable } from '../pool.js';

interface ReplayRow {
  id: string;
  normalized_event_id: string;
  requested_by: string;
  reason: string;
  status: ReplayStatus;
  created_at: string;
  processed_at: string | null;
}

function mapReplay(row: ReplayRow): ReplayRequest {
  return {
    id: row.id,
    normalizedEventId: row.normalized_event_id,
    requestedBy: row.requested_by,
    reason: row.reason,
    status: row.status,
    createdAt: row.created_at,
    processedAt: row.processed_at,
  };
}

export interface ReplayCreateInput {
  normalizedEventId: string;
  requestedBy: string;
  reason: string;
}

export class ReplayRequestsRepository {
  constructor(private readonly db: Queryable = getPool()) {}

  async create(input: ReplayCreateInput): Promise<ReplayRequest> {
    const result = await this.db.query<ReplayRow>(
      `
      INSERT INTO replay_requests (normalized_event_id, requested_by, reason, status)
      VALUES ($1, $2, $3, 'queued')
      RETURNING id, normalized_event_id, requested_by, reason, status, created_at, processed_at;
    `,
      [input.normalizedEventId, input.requestedBy, input.reason],
    );

    return mapReplay(result.rows[0]);
  }

  async updateStatus(id: string, status: ReplayStatus, setProcessedAt = false): Promise<void> {
    await this.db.query(
      `
      UPDATE replay_requests
      SET
        status = $2,
        processed_at = CASE WHEN $3::boolean THEN NOW() ELSE processed_at END
      WHERE id = $1;
    `,
      [id, status, setProcessedAt],
    );
  }

  async findById(id: string): Promise<ReplayRequest | null> {
    const result = await this.db.query<ReplayRow>(
      `
      SELECT id, normalized_event_id, requested_by, reason, status, created_at, processed_at
      FROM replay_requests
      WHERE id = $1;
    `,
      [id],
    );

    if (result.rowCount === 0) {
      return null;
    }

    return mapReplay(result.rows[0]);
  }

  async list(params: {
    page: number;
    pageSize: number;
    eventId?: string;
    status?: ReplayStatus;
  }): Promise<PaginatedResult<ReplayRequest>> {
    const values: unknown[] = [];
    const where: string[] = [];

    if (params.eventId) {
      values.push(params.eventId);
      where.push(`normalized_event_id = $${values.length}`);
    }

    if (params.status) {
      values.push(params.status);
      where.push(`status = $${values.length}`);
    }

    const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';

    const countResult = await this.db.query<{ total: string }>(
      `SELECT COUNT(*)::text AS total FROM replay_requests ${whereClause};`,
      values,
    );

    const offset = (params.page - 1) * params.pageSize;
    values.push(params.pageSize, offset);

    const rows = await this.db.query<ReplayRow>(
      `
      SELECT id, normalized_event_id, requested_by, reason, status, created_at, processed_at
      FROM replay_requests
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${values.length - 1} OFFSET $${values.length};
    `,
      values,
    );

    return {
      items: rows.rows.map(mapReplay),
      page: params.page,
      pageSize: params.pageSize,
      total: Number(countResult.rows[0].total),
    };
  }
}
