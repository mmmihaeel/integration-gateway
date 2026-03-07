import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import type { AppContainer } from '../../infrastructure/container.js';
import { sendSuccess } from '../response.js';

const querySchema = z.object({
  provider: z.string().optional(),
  activeOnly: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => value === 'true'),
});

export async function registerIntegrationRoutes(
  app: FastifyInstance,
  services: AppContainer['services'],
): Promise<void> {
  app.get('/integrations', async (request, reply) => {
    const query = querySchema.parse(request.query);
    const integrations = await services.integrationService.list({
      provider: query.provider,
      activeOnly: query.activeOnly,
    });

    return sendSuccess(reply, integrations, {
      meta: {
        total: integrations.length,
      },
    });
  });
}
