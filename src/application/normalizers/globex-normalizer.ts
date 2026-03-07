import {
  ensureRecord,
  ensureString,
  toIsoDate,
  type NormalizedWebhookEvent,
  type ProviderNormalizer,
} from './provider-normalizer.js';

export class GlobexNormalizer implements ProviderNormalizer {
  readonly provider = 'globex';

  normalize(payload: unknown): NormalizedWebhookEvent {
    const record = ensureRecord(payload, 'globex payload');

    const externalEventId = ensureString(record.id, 'id');
    const eventType = ensureString(record.type, 'type');
    const occurredAt = toIsoDate(record.timestamp, 'timestamp');
    const resource = ensureRecord(record.resource, 'resource');
    const subject = typeof resource.id === 'string' ? resource.id : null;

    return {
      externalEventId,
      eventType,
      occurredAt,
      subject,
      normalizedPayload: {
        provider: this.provider,
        eventType,
        externalEventId,
        resource,
      },
    };
  }
}
