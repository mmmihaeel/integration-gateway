import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import type { AppContainer } from '../../infrastructure/container.js';
import { sendSuccess } from '../response.js';

export async function registerHealthRoutes(
  app: FastifyInstance,
  services: AppContainer['services'],
): Promise<void> {
  app.get('/health', async (request, reply) => {
    const health = await services.healthService.getHealth();
    const code = health.status === 'ok' ? 200 : 503;

    request.log.debug({ health }, 'Health check completed');
    return sendSuccess(reply, health, { statusCode: code });
  });

  app.get('/processing-status/:id', async (request, reply) => {
    const params = z.object({ id: z.string().uuid() }).parse(request.params);
    const status = await services.eventQueryService.getStatus(params.id);
    return sendSuccess(reply, status);
  });
}
