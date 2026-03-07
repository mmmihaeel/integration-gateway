import Fastify, { type FastifyInstance } from 'fastify';
import fastifyRawBody from 'fastify-raw-body';
import { getConfig } from '../infrastructure/config/env.js';
import { createContainer, type AppContainer } from '../infrastructure/container.js';
import { registerErrorHandler } from './plugins/error-handler.js';
import { registerManagementAuth } from './plugins/management-auth.js';
import { registerAuditRoutes } from './routes/audit-routes.js';
import { registerDeliveryRoutes } from './routes/delivery-routes.js';
import { registerEventRoutes } from './routes/event-routes.js';
import { registerHealthRoutes } from './routes/health-routes.js';
import { registerIntegrationRoutes } from './routes/integration-routes.js';
import { registerInternalRoutes } from './routes/internal-routes.js';
import { registerWebhookRoutes } from './routes/webhook-routes.js';

export async function buildApp(existingContainer?: AppContainer): Promise<FastifyInstance> {
  const config = getConfig();
  const app = Fastify({
    logger: {
      level: config.LOG_LEVEL,
    },
    trustProxy: true,
  });

  await app.register(fastifyRawBody, {
    field: 'rawBody',
    global: false,
    encoding: 'utf8',
    runFirst: true,
  });

  registerErrorHandler(app);
  registerManagementAuth(app);

  const container = existingContainer ?? (await createContainer());

  await app.register(
    async (v1) => {
      await registerHealthRoutes(v1, container.services);
      await registerWebhookRoutes(v1, container.services);
      await registerIntegrationRoutes(v1, container.services);
      await registerEventRoutes(v1, container.services);
      await registerDeliveryRoutes(v1, container.services);
      await registerAuditRoutes(v1, container.services);
      await registerInternalRoutes(v1);
    },
    { prefix: '/api/v1' },
  );

  return app;
}
