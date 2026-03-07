export type EventStatus = 'pending' | 'processing' | 'processed' | 'retrying' | 'failed';
export type DeliveryStatus = 'success' | 'failed';
export type ProcessingJobStatus = 'queued' | 'running' | 'succeeded' | 'failed';
export type ReplayStatus = 'queued' | 'dispatched' | 'completed' | 'failed';

export interface Integration {
  id: string;
  provider: string;
  name: string;
  webhookSecret: string;
  callbackUrl: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface WebhookEvent {
  id: string;
  integrationId: string;
  provider: string;
  externalEventId: string | null;
  idempotencyKey: string;
  signatureValid: boolean;
  requestHeaders: Record<string, string | string[]>;
  rawPayload: unknown;
  sourceIp: string | null;
  receivedAt: string;
}

export interface NormalizedEvent {
  id: string;
  webhookEventId: string;
  integrationId: string;
  provider: string;
  eventType: string;
  subject: string | null;
  occurredAt: string;
  normalizedPayload: unknown;
  status: EventStatus;
  processingAttempts: number;
  lastError: string | null;
  lastProcessedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DeliveryAttempt {
  id: string;
  normalizedEventId: string;
  integrationId: string;
  attemptNo: number;
  status: DeliveryStatus;
  httpStatus: number | null;
  responseBody: string | null;
  errorMessage: string | null;
  durationMs: number;
  createdAt: string;
}

export interface ReplayRequest {
  id: string;
  normalizedEventId: string;
  requestedBy: string;
  reason: string;
  status: ReplayStatus;
  createdAt: string;
  processedAt: string | null;
}

export interface AuditEntry {
  id: number;
  entityType: string;
  entityId: string;
  action: string;
  actor: string;
  details: Record<string, unknown>;
  createdAt: string;
}

export interface PaginatedResult<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}
