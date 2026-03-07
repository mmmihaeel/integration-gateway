import { randomUUID } from 'node:crypto';
import { DependencyError } from '../../domain/errors.js';
import { getConfig } from '../../infrastructure/config/env.js';
import { IdempotencyStore } from '../../infrastructure/cache/idempotency-store.js';
import { RedisRateLimiter } from '../../infrastructure/cache/redis-rate-limiter.js';
import { AuditEntriesRepository } from '../../infrastructure/db/repositories/audit-entries-repository.js';
import { EventsRepository } from '../../infrastructure/db/repositories/events-repository.js';
import { withTransaction } from '../../infrastructure/db/pool.js';
import { RabbitMqClient } from '../../infrastructure/queue/rabbitmq-client.js';
import { buildIdempotencyKey } from './idempotency-key.js';
import { type NormalizedWebhookEvent } from '../normalizers/provider-normalizer.js';
import { NormalizerRegistry } from '../normalizers/normalizer-registry.js';
import { IntegrationService } from './integration-service.js';
import { SignatureVerifier } from './signature-verifier.js';

export interface IngestWebhookInput {
  provider: string;
  payload: unknown;
  rawBody: string;
  headers: Record<string, string | string[]>;
  sourceIp: string;
}

export interface IngestWebhookResult {
  eventId: string;
  status: 'queued' | 'duplicate';
  duplicate: boolean;
  correlationId: string;
}

export class WebhookIngestionService {
  private readonly config = getConfig();

  constructor(
    private readonly integrationService: IntegrationService,
    private readonly normalizerRegistry: NormalizerRegistry,
    private readonly signatureVerifier: SignatureVerifier,
    private readonly eventsRepository: EventsRepository,
    private readonly auditEntriesRepository: AuditEntriesRepository,
    private readonly idempotencyStore: IdempotencyStore,
    private readonly rateLimiter: RedisRateLimiter,
    private readonly rabbitMqClient: RabbitMqClient,
  ) {}

  async ingest(input: IngestWebhookInput): Promise<IngestWebhookResult> {
    await this.rateLimiter.assertWithinLimit(input.provider, input.sourceIp);

    const integration = await this.integrationService.getActiveIntegration(input.provider);
    this.signatureVerifier.verify(
      input.provider,
      integration.webhookSecret,
      input.rawBody,
      input.headers,
    );

    const normalized = this.normalizerRegistry.get(input.provider).normalize(input.payload);
    const idempotencyKey = buildIdempotencyKey(
      input.provider,
      normalized.externalEventId,
      normalized.normalizedPayload,
    );

    const duplicate = await this.tryHandleExistingEvent(idempotencyKey);
    if (duplicate) {
      return duplicate;
    }

    return this.persistAndQueueEvent({
      input,
      integrationId: integration.id,
      normalized,
      idempotencyKey,
    });
  }

  private async tryHandleExistingEvent(
    idempotencyKey: string,
  ): Promise<IngestWebhookResult | null> {
    try {
      const markerCreated = await this.idempotencyStore.createMarker(
        idempotencyKey,
        this.config.IDEMPOTENCY_TTL_SECONDS,
      );

      if (markerCreated) {
        return null;
      }

      const duplicate = await this.eventsRepository.findDuplicateByIdempotencyKey(idempotencyKey);
      if (!duplicate) {
        return null;
      }

      return {
        eventId: duplicate.normalizedEventId,
        status: 'duplicate',
        duplicate: true,
        correlationId: `duplicate:${duplicate.normalizedEventId}`,
      };
    } catch (error) {
      console.warn(
        'Idempotency marker operation failed. Falling back to database uniqueness.',
        error,
      );
      return null;
    }
  }

  private async persistAndQueueEvent(params: {
    input: IngestWebhookInput;
    integrationId: string;
    normalized: NormalizedWebhookEvent;
    idempotencyKey: string;
  }): Promise<IngestWebhookResult> {
    const correlationId = randomUUID();
    let normalizedEventId = '';

    try {
      await withTransaction(async (client) => {
        const eventsRepository = new EventsRepository(client);
        const auditRepository = new AuditEntriesRepository(client);

        const inserted = await eventsRepository.insertInboundEvent({
          integrationId: params.integrationId,
          provider: params.input.provider,
          externalEventId: params.normalized.externalEventId,
          idempotencyKey: params.idempotencyKey,
          signatureValid: true,
          requestHeaders: params.input.headers,
          rawPayload: params.input.payload,
          sourceIp: params.input.sourceIp,
          eventType: params.normalized.eventType,
          subject: params.normalized.subject,
          occurredAt: params.normalized.occurredAt,
          normalizedPayload: params.normalized.normalizedPayload,
        });

        normalizedEventId = inserted.normalizedEventId;

        await eventsRepository.createProcessingJob({
          normalizedEventId: inserted.normalizedEventId,
          queueName: this.config.RABBITMQ_PROCESS_QUEUE,
          triggeredBy: 'webhook',
          status: 'queued',
          attemptNo: 1,
        });

        await auditRepository.create({
          entityType: 'webhook_event',
          entityId: inserted.webhookEventId,
          action: 'webhook.received',
          actor: 'webhook-ingestion',
          details: {
            provider: params.input.provider,
            sourceIp: params.input.sourceIp,
            idempotencyKey: params.idempotencyKey,
          },
        });

        await auditRepository.create({
          entityType: 'normalized_event',
          entityId: inserted.normalizedEventId,
          action: 'event.normalized',
          actor: 'webhook-ingestion',
          details: {
            provider: params.input.provider,
            eventType: params.normalized.eventType,
            correlationId,
          },
        });
      });
    } catch (error) {
      const dbError = error as { code?: string };
      if (dbError.code === '23505') {
        const duplicate = await this.eventsRepository.findDuplicateByIdempotencyKey(
          params.idempotencyKey,
        );
        if (duplicate) {
          return {
            eventId: duplicate.normalizedEventId,
            status: 'duplicate',
            duplicate: true,
            correlationId: `duplicate:${duplicate.normalizedEventId}`,
          };
        }
      }

      throw error;
    }

    try {
      await this.rabbitMqClient.publishProcessMessage({
        normalizedEventId,
        attemptNo: 1,
        triggeredBy: 'webhook',
        correlationId,
      });

      await this.auditEntriesRepository.create({
        entityType: 'normalized_event',
        entityId: normalizedEventId,
        action: 'event.queued',
        actor: 'webhook-ingestion',
        details: {
          queue: this.config.RABBITMQ_PROCESS_QUEUE,
          correlationId,
        },
      });
    } catch (error) {
      await this.eventsRepository.updateEventState(normalizedEventId, {
        status: 'failed',
        incrementAttempts: false,
        lastError: 'Queue publish failed',
      });

      await this.eventsRepository.createProcessingJob({
        normalizedEventId,
        queueName: this.config.RABBITMQ_PROCESS_QUEUE,
        triggeredBy: 'webhook',
        status: 'failed',
        attemptNo: 1,
        errorMessage: 'Queue publish failed',
      });

      await this.auditEntriesRepository.create({
        entityType: 'normalized_event',
        entityId: normalizedEventId,
        action: 'event.queue_failed',
        actor: 'webhook-ingestion',
        details: {
          correlationId,
          reason: error instanceof Error ? error.message : 'Unknown queue error',
        },
      });

      throw new DependencyError('Unable to enqueue event for processing', {
        eventId: normalizedEventId,
      });
    }

    return {
      eventId: normalizedEventId,
      status: 'queued',
      duplicate: false,
      correlationId,
    };
  }
}
