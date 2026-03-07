import { ValidationError } from '../../domain/errors.js';

export interface NormalizedWebhookEvent {
  externalEventId: string | null;
  eventType: string;
  subject: string | null;
  occurredAt: string;
  normalizedPayload: Record<string, unknown>;
}

export interface ProviderNormalizer {
  provider: string;
  normalize(payload: unknown): NormalizedWebhookEvent;
}

export function ensureRecord(value: unknown, context: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ValidationError(`${context} must be an object`);
  }

  return value as Record<string, unknown>;
}

export function ensureString(value: unknown, fieldName: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new ValidationError(`${fieldName} is required and must be a non-empty string`);
  }

  return value;
}

export function toIsoDate(value: unknown, fieldName: string): string {
  if (typeof value !== 'string') {
    throw new ValidationError(`${fieldName} must be an ISO datetime string`);
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new ValidationError(`${fieldName} must be a valid ISO datetime string`);
  }

  return parsed.toISOString();
}
