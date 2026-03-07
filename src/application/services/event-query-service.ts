import { NotFoundError } from '../../domain/errors.js';
import type { EventStatus } from '../../domain/types.js';
import { parsePositiveInt } from '../../infrastructure/config/utils.js';
import { DeliveryAttemptsRepository } from '../../infrastructure/db/repositories/delivery-attempts-repository.js';
import { EventsRepository } from '../../infrastructure/db/repositories/events-repository.js';

export interface EventListQuery {
  page?: string;
  pageSize?: string;
  provider?: string;
  status?: EventStatus;
  eventType?: string;
  subject?: string;
  from?: string;
  to?: string;
  sortBy?: 'createdAt' | 'occurredAt' | 'status' | 'receivedAt';
  sortOrder?: 'asc' | 'desc';
}

export class EventQueryService {
  constructor(
    private readonly eventsRepository: EventsRepository,
    private readonly deliveryAttemptsRepository: DeliveryAttemptsRepository,
  ) {}

  async list(query: EventListQuery) {
    const page = parsePositiveInt(query.page, 1);
    const pageSize = Math.min(parsePositiveInt(query.pageSize, 20), 100);

    const result = await this.eventsRepository.list({
      page,
      pageSize,
      provider: query.provider,
      status: query.status,
      eventType: query.eventType,
      subject: query.subject,
      from: query.from,
      to: query.to,
      sortBy: query.sortBy ?? 'receivedAt',
      sortOrder: query.sortOrder ?? 'desc',
    });

    return {
      items: result.items,
      page,
      pageSize,
      total: result.total,
      totalPages: Math.max(Math.ceil(result.total / pageSize), 1),
    };
  }

  async getById(eventId: string) {
    const detail = await this.eventsRepository.findById(eventId);
    if (!detail) {
      throw new NotFoundError(`Event ${eventId} was not found`);
    }

    const deliveryAttempts = await this.deliveryAttemptsRepository.listByEventId(eventId);
    const processingJobs = await this.eventsRepository.listProcessingJobs(eventId, 20);

    return {
      event: detail.event,
      webhook: detail.webhook,
      deliveryAttempts,
      processingJobs,
    };
  }

  async getStatus(eventId: string) {
    const detail = await this.eventsRepository.findById(eventId);
    if (!detail) {
      throw new NotFoundError(`Event ${eventId} was not found`);
    }

    const processingJobs = await this.eventsRepository.listProcessingJobs(eventId, 10);

    return {
      eventId: detail.event.id,
      status: detail.event.status,
      processingAttempts: detail.event.processingAttempts,
      lastError: detail.event.lastError,
      lastProcessedAt: detail.event.lastProcessedAt,
      jobs: processingJobs,
    };
  }
}
