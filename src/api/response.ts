import type { FastifyReply } from 'fastify';

export function sendSuccess(
  reply: FastifyReply,
  data: unknown,
  options?: { statusCode?: number; meta?: Record<string, unknown> },
): FastifyReply {
  const payload: Record<string, unknown> = {
    success: true,
    data,
  };

  if (options?.meta) {
    payload.meta = options.meta;
  }

  if (options?.statusCode) {
    reply.code(options.statusCode);
  }

  return reply.send(payload);
}

export function sanitizeHeaders(
  headers: Record<string, string | string[] | undefined>,
): Record<string, string | string[]> {
  const sanitized: Record<string, string | string[]> = {};

  for (const [key, value] of Object.entries(headers)) {
    if (typeof value === 'undefined') {
      continue;
    }
    sanitized[key.toLowerCase()] = value;
  }

  return sanitized;
}
