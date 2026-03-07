import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import type { AppContainer } from '../../infrastructure/container.js';
import { sendSuccess } from '../response.js';

const eventsQuerySchema = z.object({
  page: z.string().optional(),
  pageSize: z.string().optional(),
  provider: z.string().optional(),
  status: z.enum(['pending', 'processing', 'processed', 'retrying', 'failed']).optional(),
  eventType: z.string().optional(),
  subject: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  sortBy: z.enum(['createdAt', 'occurredAt', 'status', 'receivedAt']).optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
});

const eventIdParamsSchema = z.object({
  id: z.string().uuid(),
});

const replaySchema = z.object({
  requestedBy: z.string().min(2).max(120).default('api-user'),
  reason: z.string().min(5).max(500),
});

export async function registerEventRoutes(
  app: FastifyInstance,
  services: AppContainer['services'],
): Promise<void> {
  app.get('/events', async (request, reply) => {
    const query = eventsQuerySchema.parse(request.query);
    const result = await services.eventQueryService.list(query);

    return sendSuccess(reply, result.items, {
      meta: {
        page: result.page,
        pageSize: result.pageSize,
        total: result.total,
        totalPages: result.totalPages,
      },
    });
  });

  app.get('/events/:id', async (request, reply) => {
    const params = eventIdParamsSchema.parse(request.params);
    const event = await services.eventQueryService.getById(params.id);
    return sendSuccess(reply, event);
  });

  app.get('/events/:id/status', async (request, reply) => {
    const params = eventIdParamsSchema.parse(request.params);
    const status = await services.eventQueryService.getStatus(params.id);
    return sendSuccess(reply, status);
  });

  app.post('/events/:id/replay', async (request, reply) => {
    const params = eventIdParamsSchema.parse(request.params);
    const body = replaySchema.parse(request.body);

    const result = await services.replayService.requestReplay({
      eventId: params.id,
      requestedBy: body.requestedBy,
      reason: body.reason,
    });

    return sendSuccess(reply, result, {
      statusCode: 202,
    });
  });
}
