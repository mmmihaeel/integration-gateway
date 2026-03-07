# integration-gateway

`integration-gateway` is a backend service for ingesting third-party webhooks, normalizing payloads into a canonical event model, processing events asynchronously, and tracking delivery outcomes with retry and replay controls.

The project is intentionally scoped as a realistic portfolio backend: clear architecture, practical reliability patterns, testable domain logic, and a Docker-first developer workflow.

## Business Context

External webhook providers differ in payload shape, signature model, and delivery guarantees. This service centralizes those concerns so downstream systems consume a consistent integration contract.

## Feature Highlights

- Multi-provider webhook ingestion with provider-specific verification
- Raw webhook persistence plus normalized event storage
- Layered idempotency controls (Redis marker + PostgreSQL uniqueness)
- Asynchronous processing with RabbitMQ process/retry/replay queues
- Delivery attempt tracking with status, HTTP metadata, and latency
- Replay requests with explicit actor and reason
- Processing status and audit-history query endpoints
- Search/filter/sort/paginated operational APIs
- Docker Compose stack for API, worker, migrator, PostgreSQL, Redis, RabbitMQ, and Nginx

## Supported Providers

| Provider | Verification model             | Required headers   | Expected payload keys                        |
| -------- | ------------------------------ | ------------------ | -------------------------------------------- |
| `acme`   | HMAC SHA256 over raw JSON body | `x-acme-signature` | `eventId`, `eventType`, `occurredAt`, `data` |
| `globex` | Shared-token check             | `x-globex-token`   | `id`, `type`, `timestamp`, `resource`        |

Seeded local secrets:

- `acme`: `acme-demo-secret`
- `globex`: `globex-demo-secret`

## Technology Stack

- Node.js 20 + TypeScript
- Fastify
- PostgreSQL 16
- RabbitMQ 3.13
- Redis 7
- Docker + Docker Compose
- Vitest + ESLint + Prettier
- GitHub Actions CI

## Architecture Summary

- `src/api`: routes, request parsing/validation, response/error contracts
- `src/application`: ingestion, replay, query, and processing orchestration services
- `src/domain`: domain errors and shared contracts
- `src/infrastructure`: PostgreSQL repositories, Redis adapters, RabbitMQ adapter, outbound HTTP delivery client
- `src/worker`: queue consumers for replay dispatch and event processing

Detailed design notes:

- [Architecture](docs/architecture.md)
- [Domain Model](docs/domain-model.md)
- [API Overview](docs/api-overview.md)
- [Webhook Flow](docs/webhook-flow.md)
- [Security](docs/security.md)

## Webhook Ingestion Flow

1. `POST /api/v1/webhooks/:provider` receives JSON payload and provider headers.
2. Provider verification runs (`x-acme-signature` or `x-globex-token`).
3. Provider normalizer maps payload into internal event shape.
4. Idempotency key is built from `provider + external_event_id` (or payload hash fallback).
5. Raw webhook and normalized event are persisted in PostgreSQL.
6. Event is published to RabbitMQ process queue.
7. Worker processes outbound delivery and records attempts/jobs/audit entries.
8. Failures schedule retries until max retry count is reached.

## Idempotency Strategy

- First-pass deduplication: Redis `SET NX EX` marker keyed by idempotency key
- Durable deduplication: PostgreSQL unique constraint on `webhook_events.idempotency_key`
- Key strategy:
  - preferred: `provider + external_event_id`
  - fallback: stable hash of normalized payload

This handles high-frequency duplicates and race conditions consistently.

## Replay and Retry Flow

- Worker marks processing transitions (`pending -> processing -> processed/failed`)
- On failure with remaining attempts:
  - event status becomes `retrying`
  - retry processing job is recorded
  - message is published to retry queue with delay
- Retry queue dead-letters back to process queue for another attempt
- `POST /api/v1/events/:id/replay` creates a replay request and enqueues replay dispatch
- Replay request lifecycle is tracked in `replay_requests` and `audit_entries`

## Internal Management Authentication

Management/query endpoints are protected with a lightweight internal API key check suitable for local or private-network environments.

- Header: `x-internal-api-key`
- Env var: `MANAGEMENT_API_KEY`
- Protected endpoint groups:
  - `/api/v1/integrations`
  - `/api/v1/events`
  - `/api/v1/deliveries`
  - `/api/v1/audit-entries`
  - `/api/v1/processing-status`

Public endpoints that remain accessible without this header:

- `/api/v1/health`
- `/api/v1/webhooks/:provider`
- `/api/v1/internal/delivery-sink/:provider` (non-production helper)

## API Overview

Base path: `/api/v1`

- `GET /health`
- `POST /webhooks/:provider`
- `GET /integrations` (requires `x-internal-api-key`)
- `GET /events` (requires `x-internal-api-key`)
- `GET /events/:id` (requires `x-internal-api-key`)
- `GET /events/:id/status` (requires `x-internal-api-key`)
- `POST /events/:id/replay` (requires `x-internal-api-key`)
- `GET /deliveries` (requires `x-internal-api-key`)
- `GET /audit-entries` (requires `x-internal-api-key`)
- `GET /processing-status/:id` (requires `x-internal-api-key`)

Response contracts:

- Success: `{ "success": true, "data": ..., "meta": ... }`
- Error: `{ "success": false, "error": { "code", "message", "details" } }`

Full request/response examples: [docs/api-overview.md](docs/api-overview.md)

## Local Development (Docker)

### Prerequisites

- Docker Desktop or Docker Engine with Compose support

### Start

```bash
docker compose up --build -d
```

### Logs

```bash
docker compose logs -f migrator api worker
```

### Stop

```bash
docker compose down
```

Service endpoints:

- API: `http://localhost:3000`
- Nginx proxy: `http://localhost:8082`
- PostgreSQL: `localhost:5434`
- Redis: `localhost:6381`
- RabbitMQ AMQP: `localhost:5672`
- RabbitMQ UI: `http://localhost:15672` (`guest` / `guest`)

## Local Demo Walkthrough

The following demo uses the seeded `acme` integration.

1. Set a shell variable for management access:

```bash
MGMT_KEY=local-internal-management-key
```

2. Verify health:

```bash
curl -s http://localhost:3000/api/v1/health | jq
```

3. Build payload and signature:

```bash
PAYLOAD='{"eventId":"evt-demo-1001","eventType":"order.created","occurredAt":"2026-03-07T10:00:00.000Z","subject":"order-1001","data":{"id":"order-1001","total":149.5,"currency":"USD"}}'
SIG=$(node -e "const crypto=require('crypto');const payload=process.argv[1];process.stdout.write(crypto.createHmac('sha256','acme-demo-secret').update(payload).digest('hex'))" "$PAYLOAD")
```

4. Ingest webhook:

```bash
curl -s -X POST http://localhost:3000/api/v1/webhooks/acme \
  -H "content-type: application/json" \
  -H "x-acme-signature: $SIG" \
  --data "$PAYLOAD" | jq
```

5. Query events:

```bash
curl -s "http://localhost:3000/api/v1/events?page=1&pageSize=5&sortBy=receivedAt&sortOrder=desc" \
  -H "x-internal-api-key: $MGMT_KEY" | jq
```

6. Replay an event (replace `<event-id>` with a value from step 5):

```bash
curl -s -X POST "http://localhost:3000/api/v1/events/<event-id>/replay" \
  -H "content-type: application/json" \
  -H "x-internal-api-key: $MGMT_KEY" \
  --data '{"requestedBy":"local-demo","reason":"Manual replay validation"}' | jq
```

7. Inspect status, deliveries, and audit entries:

```bash
curl -s "http://localhost:3000/api/v1/events/<event-id>/status" -H "x-internal-api-key: $MGMT_KEY" | jq
curl -s "http://localhost:3000/api/v1/deliveries?eventId=<event-id>" -H "x-internal-api-key: $MGMT_KEY" | jq
curl -s "http://localhost:3000/api/v1/audit-entries?entityId=<event-id>" -H "x-internal-api-key: $MGMT_KEY" | jq
```

## Non-Docker Commands

Use this only when intentionally running dependencies outside Docker.

```bash
cp .env.example .env
npm install
npm run db:migrate
npm run db:seed
npm run dev
npm run worker:dev
```

## Testing and Quality Checks

```bash
npm run lint
npm run format
npm run typecheck
npm test
npm run build
```

## Seed Data Notes

Seeder initializes:

- Integrations: `acme`, `globex`
- Sample events across `processed`, `failed`, and `pending`
- Representative processing jobs, delivery attempts, and audit entries

## Repository Structure

```text
src/
  api/
  application/
  domain/
  infrastructure/
  worker/
docs/
tests/
docker/
.github/workflows/
```

## Security Notes

- Provider verification before persistence
- Validation for route params, bodies, and query inputs
- Redis-backed webhook rate limiting per provider/source IP
- Redis + PostgreSQL idempotency safeguards
- Internal API key protection for management/query routes
- Structured audit logging for lifecycle actions

See [docs/security.md](docs/security.md) for details.

## CI

The GitHub Actions workflow runs:

- dependency install (`npm ci`)
- lint
- format check
- typecheck
- tests
- build
- Docker Compose config validation

## Future Improvements

- Dead-letter queue inspection and recovery tooling
- OpenTelemetry traces for API, queue, and worker boundaries
- Per-integration secret rotation workflow
- Production deployment manifests and scaling guidance
