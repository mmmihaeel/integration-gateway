import { randomUUID } from 'node:crypto';
import { DependencyError, NotFoundError } from '../../domain/errors.js';
import { getConfig } from '../../infrastructure/config/env.js';
import { AuditEntriesRepository } from '../../infrastructure/db/repositories/audit-entries-repository.js';
import { EventsRepository } from '../../infrastructure/db/repositories/events-repository.js';
import { ReplayRequestsRepository } from '../../infrastructure/db/repositories/replay-requests-repository.js';
import type { ReplayEventMessage } from '../../infrastructure/queue/messages.js';
import { RabbitMqClient } from '../../infrastructure/queue/rabbitmq-client.js';

export interface RequestReplayInput {
  eventId: string;
  requestedBy: string;
  reason: string;
}

export class ReplayService {
  private readonly config = getConfig();

  constructor(
    private readonly eventsRepository: EventsRepository,
    private readonly replayRequestsRepository: ReplayRequestsRepository,
    private readonly auditEntriesRepository: AuditEntriesRepository,
    private readonly rabbitMqClient: RabbitMqClient,
  ) {}

  async requestReplay(
    input: RequestReplayInput,
  ): Promise<{ replayRequestId: string; eventId: string }> {
    const event = await this.eventsRepository.findById(input.eventId);
    if (!event) {
      throw new NotFoundError(`Event ${input.eventId} was not found`);
    }

    const replayRequest = await this.replayRequestsRepository.create({
      normalizedEventId: input.eventId,
      requestedBy: input.requestedBy,
      reason: input.reason,
    });

    const correlationId = randomUUID();

    await this.eventsRepository.createProcessingJob({
      normalizedEventId: input.eventId,
      queueName: this.config.RABBITMQ_REPLAY_QUEUE,
      triggeredBy: 'replay',
      status: 'queued',
      attemptNo: 1,
    });

    await this.auditEntriesRepository.create({
      entityType: 'replay_request',
      entityId: replayRequest.id,
      action: 'replay.requested',
      actor: input.requestedBy,
      details: {
        eventId: input.eventId,
        reason: input.reason,
        correlationId,
      },
    });

    try {
      await this.rabbitMqClient.publishReplayMessage({
        normalizedEventId: input.eventId,
        replayRequestId: replayRequest.id,
        requestedBy: input.requestedBy,
        correlationId,
      });
    } catch (error) {
      await this.replayRequestsRepository.updateStatus(replayRequest.id, 'failed');
      await this.auditEntriesRepository.create({
        entityType: 'replay_request',
        entityId: replayRequest.id,
        action: 'replay.queue_failed',
        actor: 'replay-service',
        details: {
          error: error instanceof Error ? error.message : 'Unknown queue error',
          correlationId,
        },
      });

      throw new DependencyError('Unable to queue replay request', {
        replayRequestId: replayRequest.id,
      });
    }

    return {
      replayRequestId: replayRequest.id,
      eventId: input.eventId,
    };
  }

  async dispatchReplay(message: ReplayEventMessage): Promise<void> {
    const eventDetail = await this.eventsRepository.findById(message.normalizedEventId);
    if (!eventDetail) {
      await this.replayRequestsRepository.updateStatus(message.replayRequestId, 'failed');
      return;
    }

    const nextAttempt = eventDetail.event.processingAttempts + 1;

    await this.replayRequestsRepository.updateStatus(message.replayRequestId, 'dispatched', true);

    await this.eventsRepository.updateEventState(message.normalizedEventId, {
      status: 'pending',
      incrementAttempts: false,
      lastError: null,
    });

    await this.eventsRepository.createProcessingJob({
      normalizedEventId: message.normalizedEventId,
      queueName: this.config.RABBITMQ_PROCESS_QUEUE,
      triggeredBy: 'replay',
      status: 'queued',
      attemptNo: nextAttempt,
    });

    await this.auditEntriesRepository.create({
      entityType: 'normalized_event',
      entityId: message.normalizedEventId,
      action: 'replay.dispatched',
      actor: message.requestedBy,
      details: {
        replayRequestId: message.replayRequestId,
        correlationId: message.correlationId,
      },
    });

    await this.rabbitMqClient.publishProcessMessage({
      normalizedEventId: message.normalizedEventId,
      attemptNo: nextAttempt,
      triggeredBy: 'replay',
      replayRequestId: message.replayRequestId,
      correlationId: message.correlationId,
    });
  }

  async markReplayCompleted(replayRequestId: string): Promise<void> {
    await this.replayRequestsRepository.updateStatus(replayRequestId, 'completed', true);
  }

  async markReplayFailed(replayRequestId: string): Promise<void> {
    await this.replayRequestsRepository.updateStatus(replayRequestId, 'failed');
  }
}
