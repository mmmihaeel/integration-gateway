import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import type { AppContainer } from '../../infrastructure/container.js';
import { sendSuccess } from '../response.js';

const querySchema = z.object({
  page: z.string().optional(),
  pageSize: z.string().optional(),
  entityType: z.string().optional(),
  entityId: z.string().uuid().optional(),
  action: z.string().optional(),
});

export async function registerAuditRoutes(
  app: FastifyInstance,
  services: AppContainer['services'],
): Promise<void> {
  app.get('/audit-entries', async (request, reply) => {
    const query = querySchema.parse(request.query);
    const result = await services.auditQueryService.list(query);

    return sendSuccess(reply, result.items, {
      meta: {
        page: result.page,
        pageSize: result.pageSize,
        total: result.total,
        totalPages: result.totalPages,
      },
    });
  });
}
