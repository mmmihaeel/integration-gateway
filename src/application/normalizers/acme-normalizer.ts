import {
  ensureRecord,
  ensureString,
  toIsoDate,
  type NormalizedWebhookEvent,
  type ProviderNormalizer,
} from './provider-normalizer.js';

export class AcmeNormalizer implements ProviderNormalizer {
  readonly provider = 'acme';

  normalize(payload: unknown): NormalizedWebhookEvent {
    const record = ensureRecord(payload, 'acme payload');

    const externalEventId = ensureString(record.eventId, 'eventId');
    const eventType = ensureString(record.eventType, 'eventType');
    const occurredAt = toIsoDate(record.occurredAt, 'occurredAt');

    const data = ensureRecord(record.data, 'data');
    const subjectFromPayload = typeof record.subject === 'string' ? record.subject : null;
    const subjectFromData = typeof data.id === 'string' ? data.id : null;

    return {
      externalEventId,
      eventType,
      occurredAt,
      subject: subjectFromPayload ?? subjectFromData,
      normalizedPayload: {
        provider: this.provider,
        eventType,
        externalEventId,
        data,
      },
    };
  }
}
