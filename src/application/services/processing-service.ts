import { getConfig } from '../../infrastructure/config/env.js';
import { LockManager } from '../../infrastructure/cache/lock-manager.js';
import { AuditEntriesRepository } from '../../infrastructure/db/repositories/audit-entries-repository.js';
import { DeliveryAttemptsRepository } from '../../infrastructure/db/repositories/delivery-attempts-repository.js';
import { EventsRepository } from '../../infrastructure/db/repositories/events-repository.js';
import { DeliveryHttpClient } from '../../infrastructure/http/delivery-client.js';
import type { ProcessEventMessage } from '../../infrastructure/queue/messages.js';
import { RabbitMqClient } from '../../infrastructure/queue/rabbitmq-client.js';
import { ReplayService } from './replay-service.js';

export class ProcessingService {
  private readonly config = getConfig();

  constructor(
    private readonly eventsRepository: EventsRepository,
    private readonly deliveryAttemptsRepository: DeliveryAttemptsRepository,
    private readonly auditEntriesRepository: AuditEntriesRepository,
    private readonly lockManager: LockManager,
    private readonly rabbitMqClient: RabbitMqClient,
    private readonly deliveryHttpClient: DeliveryHttpClient,
    private readonly replayService: ReplayService,
  ) {}

  async processMessage(message: ProcessEventMessage): Promise<void> {
    const lockKey = `lock:normalized-event:${message.normalizedEventId}`;
    const hasLock = await this.lockManager.acquireLock(
      lockKey,
      this.config.PROCESSING_LOCK_TTL_SECONDS,
    );

    if (!hasLock) {
      return;
    }

    try {
      await this.handleProcessMessage(message);
    } finally {
      await this.lockManager.releaseLock(lockKey);
    }
  }

  private async handleProcessMessage(message: ProcessEventMessage): Promise<void> {
    const processable = await this.eventsRepository.findProcessableById(message.normalizedEventId);
    if (!processable) {
      return;
    }

    const job = await this.eventsRepository.createProcessingJob({
      normalizedEventId: message.normalizedEventId,
      queueName: this.config.RABBITMQ_PROCESS_QUEUE,
      triggeredBy: message.triggeredBy,
      status: 'running',
      attemptNo: message.attemptNo,
    });

    await this.eventsRepository.markProcessingJobRunning(job.id);
    await this.eventsRepository.updateEventState(message.normalizedEventId, {
      status: 'processing',
      incrementAttempts: false,
    });

    if (!processable.integration.isActive) {
      await this.failEvent(message, job.id, 'Integration is inactive');
      return;
    }

    const deliveryResult = await this.deliveryHttpClient.postJson(
      processable.integration.callbackUrl,
      processable.event.normalizedPayload,
      {
        'x-integration-provider': processable.integration.provider,
        'x-event-id': processable.event.id,
        'x-correlation-id': message.correlationId,
      },
    );

    await this.deliveryAttemptsRepository.create({
      normalizedEventId: processable.event.id,
      integrationId: processable.integration.id,
      attemptNo: message.attemptNo,
      status: deliveryResult.success ? 'success' : 'failed',
      httpStatus: deliveryResult.statusCode,
      responseBody: deliveryResult.responseBody,
      errorMessage: deliveryResult.errorMessage,
      durationMs: deliveryResult.durationMs,
    });

    if (deliveryResult.success) {
      await this.eventsRepository.markProcessingJobComplete(job.id);
      await this.eventsRepository.updateEventState(message.normalizedEventId, {
        status: 'processed',
        incrementAttempts: true,
        lastError: null,
        setLastProcessedAt: true,
      });

      await this.auditEntriesRepository.create({
        entityType: 'normalized_event',
        entityId: message.normalizedEventId,
        action: 'event.processed',
        actor: 'worker',
        details: {
          attemptNo: message.attemptNo,
          correlationId: message.correlationId,
          httpStatus: deliveryResult.statusCode,
        },
      });

      if (message.replayRequestId) {
        await this.replayService.markReplayCompleted(message.replayRequestId);
      }

      return;
    }

    const errorMessage = deliveryResult.errorMessage ?? 'Delivery failed';
    await this.eventsRepository.markProcessingJobFailed(job.id, errorMessage);

    if (message.attemptNo < this.config.MAX_PROCESSING_RETRIES) {
      const nextAttempt = message.attemptNo + 1;
      const delayMs = this.calculateRetryDelay(nextAttempt);

      await this.eventsRepository.updateEventState(message.normalizedEventId, {
        status: 'retrying',
        incrementAttempts: true,
        lastError: errorMessage,
      });

      await this.eventsRepository.createProcessingJob({
        normalizedEventId: message.normalizedEventId,
        queueName: this.config.RABBITMQ_RETRY_QUEUE,
        triggeredBy: 'retry',
        status: 'queued',
        attemptNo: nextAttempt,
      });

      await this.rabbitMqClient.publishRetryMessage(
        {
          normalizedEventId: message.normalizedEventId,
          attemptNo: nextAttempt,
          triggeredBy: 'retry',
          replayRequestId: message.replayRequestId,
          correlationId: message.correlationId,
        },
        delayMs,
      );

      await this.auditEntriesRepository.create({
        entityType: 'normalized_event',
        entityId: message.normalizedEventId,
        action: 'event.retry_scheduled',
        actor: 'worker',
        details: {
          attemptNo: nextAttempt,
          delayMs,
          correlationId: message.correlationId,
          reason: errorMessage,
        },
      });

      return;
    }

    await this.failEvent(message, job.id, errorMessage);
  }

  private async failEvent(
    message: ProcessEventMessage,
    jobId: string,
    reason: string,
  ): Promise<void> {
    await this.eventsRepository.markProcessingJobFailed(jobId, reason);
    await this.eventsRepository.updateEventState(message.normalizedEventId, {
      status: 'failed',
      incrementAttempts: true,
      lastError: reason,
      setLastProcessedAt: true,
    });

    await this.auditEntriesRepository.create({
      entityType: 'normalized_event',
      entityId: message.normalizedEventId,
      action: 'event.failed',
      actor: 'worker',
      details: {
        attemptNo: message.attemptNo,
        correlationId: message.correlationId,
        reason,
      },
    });

    if (message.replayRequestId) {
      await this.replayService.markReplayFailed(message.replayRequestId);
    }
  }

  private calculateRetryDelay(attemptNo: number): number {
    const factor = Math.pow(2, Math.max(attemptNo - 1, 0));
    return this.config.RETRY_BASE_DELAY_MS * factor;
  }
}
