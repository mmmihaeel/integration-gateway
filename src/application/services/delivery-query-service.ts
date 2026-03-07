import type { DeliveryStatus } from '../../domain/types.js';
import { parsePositiveInt } from '../../infrastructure/config/utils.js';
import { DeliveryAttemptsRepository } from '../../infrastructure/db/repositories/delivery-attempts-repository.js';

export interface DeliveryListQuery {
  page?: string;
  pageSize?: string;
  status?: DeliveryStatus;
  eventId?: string;
}

export class DeliveryQueryService {
  constructor(private readonly repository: DeliveryAttemptsRepository) {}

  async list(query: DeliveryListQuery) {
    const page = parsePositiveInt(query.page, 1);
    const pageSize = Math.min(parsePositiveInt(query.pageSize, 20), 100);

    const result = await this.repository.list({
      page,
      pageSize,
      status: query.status,
      eventId: query.eventId,
    });

    return {
      items: result.items,
      page,
      pageSize,
      total: result.total,
      totalPages: Math.max(Math.ceil(result.total / pageSize), 1),
    };
  }
}
