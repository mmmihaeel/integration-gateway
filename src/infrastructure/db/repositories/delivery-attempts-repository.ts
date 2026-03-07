import type { DeliveryAttempt, DeliveryStatus, PaginatedResult } from '../../../domain/types.js';
import { getPool, type Queryable } from '../pool.js';

interface DeliveryAttemptRow {
  id: string;
  normalized_event_id: string;
  integration_id: string;
  attempt_no: number;
  status: DeliveryStatus;
  http_status: number | null;
  response_body: string | null;
  error_message: string | null;
  duration_ms: number;
  created_at: string;
}

function mapDelivery(row: DeliveryAttemptRow): DeliveryAttempt {
  return {
    id: row.id,
    normalizedEventId: row.normalized_event_id,
    integrationId: row.integration_id,
    attemptNo: row.attempt_no,
    status: row.status,
    httpStatus: row.http_status,
    responseBody: row.response_body,
    errorMessage: row.error_message,
    durationMs: row.duration_ms,
    createdAt: row.created_at,
  };
}

export interface DeliveryCreateInput {
  normalizedEventId: string;
  integrationId: string;
  attemptNo: number;
  status: DeliveryStatus;
  httpStatus: number | null;
  responseBody: string | null;
  errorMessage: string | null;
  durationMs: number;
}

export interface DeliveryListParams {
  page: number;
  pageSize: number;
  status?: DeliveryStatus;
  eventId?: string;
}

export class DeliveryAttemptsRepository {
  constructor(private readonly db: Queryable = getPool()) {}

  async create(input: DeliveryCreateInput): Promise<DeliveryAttempt> {
    const result = await this.db.query<DeliveryAttemptRow>(
      `
      INSERT INTO delivery_attempts (
        normalized_event_id,
        integration_id,
        attempt_no,
        status,
        http_status,
        response_body,
        error_message,
        duration_ms
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING
        id,
        normalized_event_id,
        integration_id,
        attempt_no,
        status,
        http_status,
        response_body,
        error_message,
        duration_ms,
        created_at;
    `,
      [
        input.normalizedEventId,
        input.integrationId,
        input.attemptNo,
        input.status,
        input.httpStatus,
        input.responseBody,
        input.errorMessage,
        input.durationMs,
      ],
    );

    return mapDelivery(result.rows[0]);
  }

  async list(params: DeliveryListParams): Promise<PaginatedResult<DeliveryAttempt>> {
    const values: unknown[] = [];
    const where: string[] = [];

    if (params.status) {
      values.push(params.status);
      where.push(`status = $${values.length}`);
    }

    if (params.eventId) {
      values.push(params.eventId);
      where.push(`normalized_event_id = $${values.length}`);
    }

    const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';

    const countResult = await this.db.query<{ total: string }>(
      `SELECT COUNT(*)::text AS total FROM delivery_attempts ${whereClause};`,
      values,
    );

    const offset = (params.page - 1) * params.pageSize;
    values.push(params.pageSize, offset);

    const listResult = await this.db.query<DeliveryAttemptRow>(
      `
      SELECT
        id,
        normalized_event_id,
        integration_id,
        attempt_no,
        status,
        http_status,
        response_body,
        error_message,
        duration_ms,
        created_at
      FROM delivery_attempts
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${values.length - 1} OFFSET $${values.length};
    `,
      values,
    );

    return {
      items: listResult.rows.map(mapDelivery),
      page: params.page,
      pageSize: params.pageSize,
      total: Number(countResult.rows[0].total),
    };
  }

  async listByEventId(eventId: string): Promise<DeliveryAttempt[]> {
    const result = await this.db.query<DeliveryAttemptRow>(
      `
      SELECT
        id,
        normalized_event_id,
        integration_id,
        attempt_no,
        status,
        http_status,
        response_body,
        error_message,
        duration_ms,
        created_at
      FROM delivery_attempts
      WHERE normalized_event_id = $1
      ORDER BY attempt_no ASC;
    `,
      [eventId],
    );

    return result.rows.map(mapDelivery);
  }
}
