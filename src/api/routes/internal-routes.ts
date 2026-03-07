import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import { getConfig } from '../../infrastructure/config/env.js';
import { sendSuccess } from '../response.js';

const paramsSchema = z.object({
  provider: z.string().min(2).max(50),
});

export async function registerInternalRoutes(app: FastifyInstance): Promise<void> {
  const config = getConfig();

  if (config.NODE_ENV === 'production') {
    return;
  }

  app.post('/internal/delivery-sink/:provider', async (request, reply) => {
    const params = paramsSchema.parse(request.params);

    const bodyRecord =
      request.body && typeof request.body === 'object' && !Array.isArray(request.body)
        ? (request.body as Record<string, unknown>)
        : {};

    const shouldFail =
      bodyRecord.simulateFailure === true ||
      (typeof bodyRecord.data === 'object' &&
        bodyRecord.data !== null &&
        'simulateFailure' in bodyRecord.data &&
        bodyRecord.data.simulateFailure === true);

    if (shouldFail) {
      return reply.code(500).send({
        accepted: false,
        reason: 'simulateFailure flag requested error response',
      });
    }

    return sendSuccess(
      reply,
      {
        accepted: true,
        provider: params.provider,
        receivedAt: new Date().toISOString(),
      },
      { statusCode: 202 },
    );
  });
}
