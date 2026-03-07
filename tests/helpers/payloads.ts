import { randomUUID } from 'node:crypto';

export function buildAcmePayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    eventId: overrides.eventId ?? `evt-${randomUUID()}`,
    eventType: overrides.eventType ?? 'order.created',
    occurredAt: overrides.occurredAt ?? new Date().toISOString(),
    subject: overrides.subject ?? 'order-001',
    data: (overrides.data as Record<string, unknown> | undefined) ?? {
      id: 'order-001',
      total: 99.5,
    },
  };
}
