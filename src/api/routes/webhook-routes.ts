import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import { ValidationError } from '../../domain/errors.js';
import type { AppContainer } from '../../infrastructure/container.js';
import { sendSuccess, sanitizeHeaders } from '../response.js';

const providerParamsSchema = z.object({
  provider: z.string().min(2).max(50),
});

export async function registerWebhookRoutes(
  app: FastifyInstance,
  services: AppContainer['services'],
): Promise<void> {
  app.post(
    '/webhooks/:provider',
    {
      config: {
        rawBody: true,
      },
    },
    async (request, reply) => {
      const params = providerParamsSchema.parse(request.params);
      const body = request.body;

      if (!body || typeof body !== 'object') {
        throw new ValidationError('Request body must be a JSON object');
      }

      const headers = sanitizeHeaders(request.headers);
      const rawBodyValue = request.rawBody ?? JSON.stringify(body);
      const rawBody =
        typeof rawBodyValue === 'string' ? rawBodyValue : rawBodyValue.toString('utf8');

      const result = await services.webhookIngestionService.ingest({
        provider: params.provider.toLowerCase(),
        payload: body,
        rawBody,
        headers,
        sourceIp: request.ip,
      });

      const statusCode = result.duplicate ? 200 : 202;
      return sendSuccess(reply, result, { statusCode });
    },
  );
}
