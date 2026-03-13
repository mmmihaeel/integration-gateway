# Deployment Notes

Related: [README](../README.md) | [Architecture](architecture.md) | [Security](security.md) | [Local Development](local-development.md)

These notes describe the runtime shape the repository is designed for. They are intentionally operational and implementation-grounded, not cloud-vendor specific.

## Deployment Shape

| Deployable     | Purpose                                                                               |
| -------------- | ------------------------------------------------------------------------------------- |
| API service    | Handles HTTP ingress, management queries, and replay initiation                       |
| Worker service | Consumes replay and process queues, performs delivery attempts, and schedules retries |
| PostgreSQL     | Durable state for integrations and event history                                      |
| Redis          | Ephemeral coordination state                                                          |
| RabbitMQ       | Async transport for process, retry, and replay messages                               |

The API and worker should be deployed as separate long-running processes that share the same PostgreSQL, Redis, and RabbitMQ dependencies.

## Container Build Model

The repository ships one Node-based container image and runs different commands per role:

| Role                                 | Runtime command              |
| ------------------------------------ | ---------------------------- |
| API                                  | `node dist/api/server.js`    |
| Worker                               | `node dist/worker/worker.js` |
| Migration job                        | `npm run db:migrate`         |
| Seed job for local/demo environments | `npm run db:seed`            |

The Dockerfile builds TypeScript during image creation and runs compiled output from `dist/`.

## Release Order

1. Provision or verify PostgreSQL, Redis, and RabbitMQ.
2. Run database migrations before deploying new API or worker revisions.
3. Start or roll the API service.
4. Start or roll the worker service.
5. Confirm health, queue connectivity, and callback reachability.

In local Compose, the `migrator` service runs before the API and worker start.

## Configuration Surface

| Configuration group | Examples                                                                                               |
| ------------------- | ------------------------------------------------------------------------------------------------------ |
| HTTP runtime        | `APP_HOST`, `APP_PORT`, `LOG_LEVEL`                                                                    |
| PostgreSQL          | `DATABASE_URL`, `DB_MIGRATIONS_TABLE`                                                                  |
| Redis               | `REDIS_URL`, `WEBHOOK_RATE_LIMIT_PER_MINUTE`, `IDEMPOTENCY_TTL_SECONDS`, `PROCESSING_LOCK_TTL_SECONDS` |
| RabbitMQ            | `RABBITMQ_URL`, `RABBITMQ_PROCESS_QUEUE`, `RABBITMQ_RETRY_QUEUE`, `RABBITMQ_REPLAY_QUEUE`              |
| Processing policy   | `MAX_PROCESSING_RETRIES`, `RETRY_BASE_DELAY_MS`                                                        |
| Management access   | `MANAGEMENT_API_KEY`                                                                                   |

## Operational Considerations

| Topic              | Current design note                                                                         |
| ------------------ | ------------------------------------------------------------------------------------------- |
| Horizontal scaling | API replicas are straightforward; worker replicas rely on Redis locks and queue competition |
| Retry behavior     | Queue-native delay through RabbitMQ TTL and dead-letter routing                             |
| Failure recovery   | Replay endpoint allows controlled reprocessing of persisted events                          |
| Backups            | PostgreSQL should be backed up as the source of truth for event history                     |
| Queue durability   | RabbitMQ queues are durable and messages are published as persistent                        |
| Health checks      | The health endpoint validates PostgreSQL, Redis, and RabbitMQ connectivity                  |

## Explicit Boundaries

- No Kubernetes manifests, Helm charts, or Terraform are included.
- No dead-letter inspection or queue-recovery tooling is implemented yet.
- No external scheduler is required for retries because delay is modeled inside RabbitMQ.
- The internal delivery sink is a local and test helper, not a production callback target.

Use these notes together with [architecture.md](architecture.md) and [security.md](security.md) when evaluating how the repository would evolve into a larger deployment.
