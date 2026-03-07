export interface DeliveryResult {
  success: boolean;
  statusCode: number | null;
  responseBody: string | null;
  errorMessage: string | null;
  durationMs: number;
}

export class DeliveryHttpClient {
  constructor(private readonly timeoutMs = 5000) {}

  async postJson(
    url: string,
    payload: unknown,
    headers?: Record<string, string>,
  ): Promise<DeliveryResult> {
    const start = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...headers,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      const responseBody = await response.text();
      const durationMs = Date.now() - start;

      return {
        success: response.ok,
        statusCode: response.status,
        responseBody,
        errorMessage: response.ok ? null : `Remote endpoint returned ${response.status}`,
        durationMs,
      };
    } catch (error) {
      const durationMs = Date.now() - start;
      const message = error instanceof Error ? error.message : 'Unknown delivery error';

      return {
        success: false,
        statusCode: null,
        responseBody: null,
        errorMessage: message,
        durationMs,
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}
