import crypto from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { UnauthorizedError } from '../../domain/errors.js';
import { getConfig } from '../../infrastructure/config/env.js';

const MANAGEMENT_HEADER = 'x-internal-api-key';
const PROTECTED_PREFIXES = [
  '/api/v1/integrations',
  '/api/v1/events',
  '/api/v1/deliveries',
  '/api/v1/audit-entries',
  '/api/v1/processing-status',
];

function isManagementPath(pathname: string): boolean {
  return PROTECTED_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

function getRequestPath(request: FastifyRequest): string {
  const rawUrl = request.raw.url ?? request.url;
  return rawUrl.split('?')[0];
}

function safeEquals(provided: string, expected: string): boolean {
  const providedBuffer = Buffer.from(provided);
  const expectedBuffer = Buffer.from(expected);

  if (providedBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(providedBuffer, expectedBuffer);
}

export function registerManagementAuth(app: FastifyInstance): void {
  const config = getConfig();

  app.addHook('onRequest', async (request) => {
    const path = getRequestPath(request);
    if (!isManagementPath(path)) {
      return;
    }

    const headerValue = request.headers[MANAGEMENT_HEADER];
    const apiKey = Array.isArray(headerValue) ? headerValue[0] : headerValue;

    if (typeof apiKey !== 'string' || !safeEquals(apiKey, config.MANAGEMENT_API_KEY)) {
      throw new UnauthorizedError('Invalid management API key');
    }
  });
}
