import type {
  EventStatus,
  NormalizedEvent,
  PaginatedResult,
  ProcessingJobStatus,
} from '../../../domain/types.js';
import { getPool, type Queryable } from '../pool.js';

interface NormalizedEventRow {
  id: string;
  webhook_event_id: string;
  integration_id: string;
  provider: string;
  event_type: string;
  subject: string | null;
  occurred_at: string;
  normalized_payload: unknown;
  status: EventStatus;
  processing_attempts: number;
  last_error: string | null;
  last_processed_at: string | null;
  created_at: string;
  updated_at: string;
}

interface EventListRow extends NormalizedEventRow {
  external_event_id: string | null;
  received_at: string;
}

interface EventDetailRow extends EventListRow {
  idempotency_key: string;
  signature_valid: boolean;
  request_headers: Record<string, string | string[]>;
  raw_payload: unknown;
  source_ip: string | null;
}

interface ProcessingJobRow {
  id: string;
  normalized_event_id: string;
  queue_name: string;
  triggered_by: string;
  status: ProcessingJobStatus;
  attempt_no: number;
  scheduled_at: string;
  started_at: string | null;
  completed_at: string | null;
  error_message: string | null;
  created_at: string;
}

function mapNormalizedEvent(row: NormalizedEventRow): NormalizedEvent {
  return {
    id: row.id,
    webhookEventId: row.webhook_event_id,
    integrationId: row.integration_id,
    provider: row.provider,
    eventType: row.event_type,
    subject: row.subject,
    occurredAt: row.occurred_at,
    normalizedPayload: row.normalized_payload,
    status: row.status,
    processingAttempts: row.processing_attempts,
    lastError: row.last_error,
    lastProcessedAt: row.last_processed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface InboundEventCreateInput {
  integrationId: string;
  provider: string;
  externalEventId: string | null;
  idempotencyKey: string;
  signatureValid: boolean;
  requestHeaders: Record<string, string | string[]>;
  rawPayload: unknown;
  sourceIp: string | null;
  eventType: string;
  subject: string | null;
  occurredAt: string;
  normalizedPayload: unknown;
}

export interface DuplicateEventMatch {
  normalizedEventId: string;
  status: EventStatus;
  processingAttempts: number;
}

export interface EventListParams {
  page: number;
  pageSize: number;
  provider?: string;
  status?: EventStatus;
  eventType?: string;
  subject?: string;
  from?: string;
  to?: string;
  sortBy: 'createdAt' | 'occurredAt' | 'status' | 'receivedAt';
  sortOrder: 'asc' | 'desc';
}

export interface EventListItem extends NormalizedEvent {
  externalEventId: string | null;
  receivedAt: string;
}

export interface EventDetail {
  event: NormalizedEvent;
  webhook: {
    externalEventId: string | null;
    idempotencyKey: string;
    signatureValid: boolean;
    requestHeaders: Record<string, string | string[]>;
    rawPayload: unknown;
    sourceIp: string | null;
    receivedAt: string;
  };
}

export interface ProcessableEvent {
  event: NormalizedEvent;
  integration: {
    id: string;
    provider: string;
    name: string;
    callbackUrl: string;
    isActive: boolean;
  };
}

export interface ProcessingJob {
  id: string;
  normalizedEventId: string;
  queueName: string;
  triggeredBy: string;
  status: ProcessingJobStatus;
  attemptNo: number;
  scheduledAt: string;
  startedAt: string | null;
  completedAt: string | null;
  errorMessage: string | null;
  createdAt: string;
}

function mapProcessingJob(row: ProcessingJobRow): ProcessingJob {
  return {
    id: row.id,
    normalizedEventId: row.normalized_event_id,
    queueName: row.queue_name,
    triggeredBy: row.triggered_by,
    status: row.status,
    attemptNo: row.attempt_no,
    scheduledAt: row.scheduled_at,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    errorMessage: row.error_message,
    createdAt: row.created_at,
  };
}

export interface ProcessingJobCreateInput {
  normalizedEventId: string;
  queueName: string;
  triggeredBy: string;
  status: ProcessingJobStatus;
  attemptNo: number;
  errorMessage?: string | null;
}

export class EventsRepository {
  constructor(private readonly db: Queryable = getPool()) {}

  async insertInboundEvent(
    input: InboundEventCreateInput,
  ): Promise<{ webhookEventId: string; normalizedEventId: string }> {
    const webhookInsert = await this.db.query<{ id: string }>(
      `
      INSERT INTO webhook_events (
        integration_id,
        provider,
        external_event_id,
        idempotency_key,
        signature_valid,
        request_headers,
        raw_payload,
        source_ip
      )
      VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8)
      RETURNING id;
    `,
      [
        input.integrationId,
        input.provider,
        input.externalEventId,
        input.idempotencyKey,
        input.signatureValid,
        JSON.stringify(input.requestHeaders),
        JSON.stringify(input.rawPayload),
        input.sourceIp,
      ],
    );

    const webhookEventId = webhookInsert.rows[0].id;

    const normalizedInsert = await this.db.query<{ id: string }>(
      `
      INSERT INTO normalized_events (
        webhook_event_id,
        integration_id,
        provider,
        event_type,
        subject,
        occurred_at,
        normalized_payload,
        status
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, 'pending')
      RETURNING id;
    `,
      [
        webhookEventId,
        input.integrationId,
        input.provider,
        input.eventType,
        input.subject,
        input.occurredAt,
        JSON.stringify(input.normalizedPayload),
      ],
    );

    return {
      webhookEventId,
      normalizedEventId: normalizedInsert.rows[0].id,
    };
  }

  async findDuplicateByIdempotencyKey(idempotencyKey: string): Promise<DuplicateEventMatch | null> {
    const result = await this.db.query<{
      normalized_event_id: string;
      status: EventStatus;
      processing_attempts: number;
    }>(
      `
      SELECT ne.id AS normalized_event_id, ne.status, ne.processing_attempts
      FROM webhook_events we
      INNER JOIN normalized_events ne ON ne.webhook_event_id = we.id
      WHERE we.idempotency_key = $1;
    `,
      [idempotencyKey],
    );

    if (result.rowCount === 0) {
      return null;
    }

    return {
      normalizedEventId: result.rows[0].normalized_event_id,
      status: result.rows[0].status,
      processingAttempts: result.rows[0].processing_attempts,
    };
  }

  async list(params: EventListParams): Promise<PaginatedResult<EventListItem>> {
    const values: unknown[] = [];
    const where: string[] = [];

    if (params.provider) {
      values.push(params.provider);
      where.push(`ne.provider = $${values.length}`);
    }

    if (params.status) {
      values.push(params.status);
      where.push(`ne.status = $${values.length}`);
    }

    if (params.eventType) {
      values.push(params.eventType);
      where.push(`ne.event_type = $${values.length}`);
    }

    if (params.subject) {
      values.push(`%${params.subject}%`);
      where.push(`COALESCE(ne.subject, '') ILIKE $${values.length}`);
    }

    if (params.from) {
      values.push(params.from);
      where.push(`ne.occurred_at >= $${values.length}`);
    }

    if (params.to) {
      values.push(params.to);
      where.push(`ne.occurred_at <= $${values.length}`);
    }

    const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
    const sortColumnMap: Record<EventListParams['sortBy'], string> = {
      createdAt: 'ne.created_at',
      occurredAt: 'ne.occurred_at',
      status: 'ne.status',
      receivedAt: 'we.received_at',
    };
    const sortColumn = sortColumnMap[params.sortBy];
    const sortOrder = params.sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    const countResult = await this.db.query<{ total: string }>(
      `
      SELECT COUNT(*)::text AS total
      FROM normalized_events ne
      INNER JOIN webhook_events we ON we.id = ne.webhook_event_id
      ${whereClause};
    `,
      values,
    );

    const offset = (params.page - 1) * params.pageSize;
    values.push(params.pageSize, offset);

    const listResult = await this.db.query<EventListRow>(
      `
      SELECT
        ne.id,
        ne.webhook_event_id,
        ne.integration_id,
        ne.provider,
        ne.event_type,
        ne.subject,
        ne.occurred_at,
        ne.normalized_payload,
        ne.status,
        ne.processing_attempts,
        ne.last_error,
        ne.last_processed_at,
        ne.created_at,
        ne.updated_at,
        we.external_event_id,
        we.received_at
      FROM normalized_events ne
      INNER JOIN webhook_events we ON we.id = ne.webhook_event_id
      ${whereClause}
      ORDER BY ${sortColumn} ${sortOrder}
      LIMIT $${values.length - 1} OFFSET $${values.length};
    `,
      values,
    );

    return {
      items: listResult.rows.map((row) => ({
        ...mapNormalizedEvent(row),
        externalEventId: row.external_event_id,
        receivedAt: row.received_at,
      })),
      page: params.page,
      pageSize: params.pageSize,
      total: Number(countResult.rows[0].total),
    };
  }

  async findById(eventId: string): Promise<EventDetail | null> {
    const result = await this.db.query<EventDetailRow>(
      `
      SELECT
        ne.id,
        ne.webhook_event_id,
        ne.integration_id,
        ne.provider,
        ne.event_type,
        ne.subject,
        ne.occurred_at,
        ne.normalized_payload,
        ne.status,
        ne.processing_attempts,
        ne.last_error,
        ne.last_processed_at,
        ne.created_at,
        ne.updated_at,
        we.external_event_id,
        we.received_at,
        we.idempotency_key,
        we.signature_valid,
        we.request_headers,
        we.raw_payload,
        host(we.source_ip) AS source_ip
      FROM normalized_events ne
      INNER JOIN webhook_events we ON we.id = ne.webhook_event_id
      WHERE ne.id = $1;
    `,
      [eventId],
    );

    if (result.rowCount === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      event: mapNormalizedEvent(row),
      webhook: {
        externalEventId: row.external_event_id,
        idempotencyKey: row.idempotency_key,
        signatureValid: row.signature_valid,
        requestHeaders: row.request_headers,
        rawPayload: row.raw_payload,
        sourceIp: row.source_ip,
        receivedAt: row.received_at,
      },
    };
  }

  async findProcessableById(eventId: string): Promise<ProcessableEvent | null> {
    const result = await this.db.query<
      NormalizedEventRow & {
        integration_provider: string;
        integration_name: string;
        callback_url: string;
        integration_is_active: boolean;
      }
    >(
      `
      SELECT
        ne.id,
        ne.webhook_event_id,
        ne.integration_id,
        ne.provider,
        ne.event_type,
        ne.subject,
        ne.occurred_at,
        ne.normalized_payload,
        ne.status,
        ne.processing_attempts,
        ne.last_error,
        ne.last_processed_at,
        ne.created_at,
        ne.updated_at,
        i.provider AS integration_provider,
        i.name AS integration_name,
        i.callback_url,
        i.is_active AS integration_is_active
      FROM normalized_events ne
      INNER JOIN integrations i ON i.id = ne.integration_id
      WHERE ne.id = $1;
    `,
      [eventId],
    );

    if (result.rowCount === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      event: mapNormalizedEvent(row),
      integration: {
        id: row.integration_id,
        provider: row.integration_provider,
        name: row.integration_name,
        callbackUrl: row.callback_url,
        isActive: row.integration_is_active,
      },
    };
  }

  async updateEventState(
    eventId: string,
    params: {
      status: EventStatus;
      incrementAttempts?: boolean;
      lastError?: string | null;
      setLastProcessedAt?: boolean;
    },
  ): Promise<void> {
    await this.db.query(
      `
      UPDATE normalized_events
      SET
        status = $2,
        processing_attempts = processing_attempts + CASE WHEN $3::boolean THEN 1 ELSE 0 END,
        last_error = $4,
        last_processed_at = CASE WHEN $5::boolean THEN NOW() ELSE last_processed_at END,
        updated_at = NOW()
      WHERE id = $1;
    `,
      [
        eventId,
        params.status,
        params.incrementAttempts ?? false,
        params.lastError ?? null,
        params.setLastProcessedAt ?? false,
      ],
    );
  }

  async createProcessingJob(input: ProcessingJobCreateInput): Promise<ProcessingJob> {
    const result = await this.db.query<ProcessingJobRow>(
      `
      INSERT INTO processing_jobs (
        normalized_event_id,
        queue_name,
        triggered_by,
        status,
        attempt_no,
        error_message
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING
        id,
        normalized_event_id,
        queue_name,
        triggered_by,
        status,
        attempt_no,
        scheduled_at,
        started_at,
        completed_at,
        error_message,
        created_at;
    `,
      [
        input.normalizedEventId,
        input.queueName,
        input.triggeredBy,
        input.status,
        input.attemptNo,
        input.errorMessage ?? null,
      ],
    );

    return mapProcessingJob(result.rows[0]);
  }

  async markProcessingJobRunning(jobId: string): Promise<void> {
    await this.db.query(
      `
      UPDATE processing_jobs
      SET status = 'running', started_at = NOW()
      WHERE id = $1;
    `,
      [jobId],
    );
  }

  async markProcessingJobComplete(jobId: string): Promise<void> {
    await this.db.query(
      `
      UPDATE processing_jobs
      SET status = 'succeeded', completed_at = NOW(), error_message = NULL
      WHERE id = $1;
    `,
      [jobId],
    );
  }

  async markProcessingJobFailed(jobId: string, errorMessage: string): Promise<void> {
    await this.db.query(
      `
      UPDATE processing_jobs
      SET status = 'failed', completed_at = NOW(), error_message = $2
      WHERE id = $1;
    `,
      [jobId, errorMessage],
    );
  }

  async listProcessingJobs(eventId: string, limit = 20): Promise<ProcessingJob[]> {
    const result = await this.db.query<ProcessingJobRow>(
      `
      SELECT
        id,
        normalized_event_id,
        queue_name,
        triggered_by,
        status,
        attempt_no,
        scheduled_at,
        started_at,
        completed_at,
        error_message,
        created_at
      FROM processing_jobs
      WHERE normalized_event_id = $1
      ORDER BY created_at DESC
      LIMIT $2;
    `,
      [eventId, limit],
    );

    return result.rows.map(mapProcessingJob);
  }
}
