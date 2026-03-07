import { AuditQueryService } from '../application/services/audit-query-service.js';
import { DeliveryQueryService } from '../application/services/delivery-query-service.js';
import { EventQueryService } from '../application/services/event-query-service.js';
import { HealthService } from '../application/services/health-service.js';
import { IntegrationService } from '../application/services/integration-service.js';
import { ProcessingService } from '../application/services/processing-service.js';
import { ReplayService } from '../application/services/replay-service.js';
import { SignatureVerifier } from '../application/services/signature-verifier.js';
import { WebhookIngestionService } from '../application/services/webhook-ingestion-service.js';
import { NormalizerRegistry } from '../application/normalizers/normalizer-registry.js';
import { getConfig } from './config/env.js';
import { IdempotencyStore } from './cache/idempotency-store.js';
import { LockManager } from './cache/lock-manager.js';
import { getRedis } from './cache/redis-client.js';
import { RedisJsonCache } from './cache/redis-json-cache.js';
import { RedisRateLimiter } from './cache/redis-rate-limiter.js';
import { AuditEntriesRepository } from './db/repositories/audit-entries-repository.js';
import { DeliveryAttemptsRepository } from './db/repositories/delivery-attempts-repository.js';
import { EventsRepository } from './db/repositories/events-repository.js';
import { IntegrationsRepository } from './db/repositories/integrations-repository.js';
import { ReplayRequestsRepository } from './db/repositories/replay-requests-repository.js';
import { DeliveryHttpClient } from './http/delivery-client.js';
import { RabbitMqClient } from './queue/rabbitmq-client.js';

export interface AppContainer {
  rabbitMqClient: RabbitMqClient;
  services: {
    integrationService: IntegrationService;
    webhookIngestionService: WebhookIngestionService;
    eventQueryService: EventQueryService;
    replayService: ReplayService;
    deliveryQueryService: DeliveryQueryService;
    auditQueryService: AuditQueryService;
    healthService: HealthService;
    processingService: ProcessingService;
  };
}

let container: AppContainer | null = null;

export async function createContainer(): Promise<AppContainer> {
  if (container) {
    return container;
  }

  const config = getConfig();

  const redis = getRedis();
  if (redis.status !== 'ready') {
    await redis.connect();
  }

  const rabbitMqClient = new RabbitMqClient(config.RABBITMQ_URL);
  await rabbitMqClient.connect();

  const integrationsRepository = new IntegrationsRepository();
  const eventsRepository = new EventsRepository();
  const deliveryAttemptsRepository = new DeliveryAttemptsRepository();
  const replayRequestsRepository = new ReplayRequestsRepository();
  const auditEntriesRepository = new AuditEntriesRepository();

  const redisJsonCache = new RedisJsonCache(redis);
  const idempotencyStore = new IdempotencyStore(redis);
  const lockManager = new LockManager(redis);
  const rateLimiter = new RedisRateLimiter(redis, config.WEBHOOK_RATE_LIMIT_PER_MINUTE);

  const integrationService = new IntegrationService(integrationsRepository, redisJsonCache);
  const replayService = new ReplayService(
    eventsRepository,
    replayRequestsRepository,
    auditEntriesRepository,
    rabbitMqClient,
  );

  const services = {
    integrationService,
    webhookIngestionService: new WebhookIngestionService(
      integrationService,
      new NormalizerRegistry(),
      new SignatureVerifier(),
      eventsRepository,
      auditEntriesRepository,
      idempotencyStore,
      rateLimiter,
      rabbitMqClient,
    ),
    eventQueryService: new EventQueryService(eventsRepository, deliveryAttemptsRepository),
    replayService,
    deliveryQueryService: new DeliveryQueryService(deliveryAttemptsRepository),
    auditQueryService: new AuditQueryService(auditEntriesRepository),
    healthService: new HealthService(rabbitMqClient),
    processingService: new ProcessingService(
      eventsRepository,
      deliveryAttemptsRepository,
      auditEntriesRepository,
      lockManager,
      rabbitMqClient,
      new DeliveryHttpClient(),
      replayService,
    ),
  };

  container = {
    rabbitMqClient,
    services,
  };

  return container;
}

export async function resetContainerForTests(): Promise<void> {
  if (container) {
    await container.rabbitMqClient.close();
    container = null;
  }
}
