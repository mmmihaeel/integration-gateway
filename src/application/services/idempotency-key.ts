import crypto from 'node:crypto';
import stableStringify from 'fast-json-stable-stringify';

export function buildIdempotencyKey(
  provider: string,
  externalEventId: string | null,
  payload: unknown,
): string {
  if (externalEventId && externalEventId.trim().length > 0) {
    return `${provider}:${externalEventId}`;
  }

  const payloadHash = crypto
    .createHash('sha256')
    .update(stableStringify(payload ?? {}), 'utf8')
    .digest('hex');

  return `${provider}:payload:${payloadHash}`;
}
