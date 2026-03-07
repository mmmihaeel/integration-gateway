import { NotFoundError } from '../../domain/errors.js';
import type { Integration } from '../../domain/types.js';
import { RedisJsonCache } from '../../infrastructure/cache/redis-json-cache.js';
import {
  IntegrationsRepository,
  type IntegrationListParams,
} from '../../infrastructure/db/repositories/integrations-repository.js';

export class IntegrationService {
  constructor(
    private readonly integrationsRepository: IntegrationsRepository,
    private readonly cache: RedisJsonCache,
  ) {}

  async list(params: IntegrationListParams): Promise<Integration[]> {
    const cacheKey = `integrations:list:${params.provider ?? 'all'}:${params.activeOnly ? 'active' : 'any'}`;
    const cached = await this.cache.get<Integration[]>(cacheKey);
    if (cached) {
      return cached;
    }

    const integrations = await this.integrationsRepository.list(params);
    await this.cache.set(cacheKey, integrations, 30);
    return integrations;
  }

  async getActiveIntegration(provider: string): Promise<Integration> {
    const cacheKey = `integrations:active:${provider}`;
    const cached = await this.cache.get<Integration>(cacheKey);
    if (cached) {
      return cached;
    }

    const integration = await this.integrationsRepository.findActiveByProvider(provider);
    if (!integration) {
      throw new NotFoundError(`No active integration configured for provider: ${provider}`);
    }

    await this.cache.set(cacheKey, integration, 30);
    return integration;
  }
}
