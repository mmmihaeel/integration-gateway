# Deployment Notes

## Deployment Shape

The project is designed for split-process deployment:

- API deployment (Fastify HTTP service)
- Worker deployment (RabbitMQ consumers)
- Shared dependencies: PostgreSQL, Redis, RabbitMQ

## Container Build

The Docker image compiles TypeScript during build and runs compiled output:

- API entrypoint: `node dist/api/server.js`
- Worker entrypoint: `node dist/worker/worker.js`

## Startup Ordering

In local Compose:

1. Infrastructure dependencies become healthy
2. Migrator runs migrations and seed
3. API and worker start
4. Nginx starts after API health check

## Environment Configuration

Use environment variables for runtime config:

- DB, Redis, RabbitMQ connection strings
- Queue names
- Retry and lock settings
- Rate limit thresholds
- `MANAGEMENT_API_KEY` for internal management/query endpoints

## Production Considerations

- Run migrations as an explicit job before rolling API/worker updates
- Configure message queue and DB credentials per environment
- Add external load balancing and HTTPS termination
- Set resource limits and autoscaling policies for worker replicas
- Monitor queue depth, processing latency, and failure rates

## Backups and Recovery

- PostgreSQL backup policy should include point-in-time restore capability
- RabbitMQ persistence policy should align with acceptable message durability
- Replay endpoint enables controlled reprocessing of stored events
