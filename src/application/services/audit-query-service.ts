import { parsePositiveInt } from '../../infrastructure/config/utils.js';
import { AuditEntriesRepository } from '../../infrastructure/db/repositories/audit-entries-repository.js';

export interface AuditListQuery {
  page?: string;
  pageSize?: string;
  entityType?: string;
  entityId?: string;
  action?: string;
}

export class AuditQueryService {
  constructor(private readonly repository: AuditEntriesRepository) {}

  async list(query: AuditListQuery) {
    const page = parsePositiveInt(query.page, 1);
    const pageSize = Math.min(parsePositiveInt(query.pageSize, 20), 100);

    const result = await this.repository.list({
      page,
      pageSize,
      entityType: query.entityType,
      entityId: query.entityId,
      action: query.action,
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
