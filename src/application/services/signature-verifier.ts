import crypto from 'node:crypto';
import { UnauthorizedError } from '../../domain/errors.js';

export class SignatureVerifier {
  verify(
    provider: string,
    secret: string,
    rawBody: string,
    headers: Record<string, string | string[]>,
  ): void {
    if (provider === 'acme') {
      this.verifyAcme(secret, rawBody, headers);
      return;
    }

    if (provider === 'globex') {
      this.verifyGlobex(secret, headers);
      return;
    }

    throw new UnauthorizedError(`No signature verifier configured for provider: ${provider}`);
  }

  private verifyAcme(
    secret: string,
    rawBody: string,
    headers: Record<string, string | string[]>,
  ): void {
    const headerValue = headers['x-acme-signature'];
    const signature = Array.isArray(headerValue) ? headerValue[0] : headerValue;

    if (!signature || typeof signature !== 'string') {
      throw new UnauthorizedError('Missing x-acme-signature header');
    }

    const expectedSignature = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
    const providedBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expectedSignature);
    const isValid =
      providedBuffer.length === expectedBuffer.length &&
      crypto.timingSafeEqual(providedBuffer, expectedBuffer);

    if (!isValid) {
      throw new UnauthorizedError('Invalid acme webhook signature');
    }
  }

  private verifyGlobex(secret: string, headers: Record<string, string | string[]>): void {
    const tokenHeader = headers['x-globex-token'];
    const token = Array.isArray(tokenHeader) ? tokenHeader[0] : tokenHeader;

    if (!token || token !== secret) {
      throw new UnauthorizedError('Invalid globex token');
    }
  }
}
