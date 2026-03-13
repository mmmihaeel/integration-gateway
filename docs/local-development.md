# Local Development

Related: [README](../README.md) | [API Overview](api-overview.md) | [Webhook Flow](webhook-flow.md) | [Deployment Notes](deployment-notes.md)

The recommended local workflow is Docker-first. That keeps the API, worker, PostgreSQL, Redis, RabbitMQ, migrations, and seed data aligned with the same runtime assumptions used in CI.

## Prerequisites

| Requirement                 | Why it matters                                                           |
| --------------------------- | ------------------------------------------------------------------------ |
| Docker with Compose support | Starts the full local stack in one command                               |
| Node.js 20+                 | Needed only for non-container execution or local script runs             |
| `jq`                        | Optional, but useful for reading JSON responses in the walkthrough below |

## Recommended Docker Workflow

### 1. Start the stack

```bash
docker compose up --build -d
```

### 2. Watch startup progress

```bash
docker compose logs -f migrator api worker
```

The `migrator` service runs `npm run db:migrate && npm run db:seed` before the API and worker come online.

### 3. Verify health

```bash
curl -s http://localhost:3000/api/v1/health | jq
```

### 4. Set a management key for protected routes

```bash
MGMT_KEY=local-internal-management-key
```

### 5. Inspect seeded integrations

```bash
curl -s http://localhost:3000/api/v1/integrations \
  -H "x-internal-api-key: $MGMT_KEY" | jq
```

### 6. Stop the stack

```bash
docker compose down
```

## Local Validation Flow

The seed data makes the worker path usable immediately because both local integrations point their callback URLs at the non-production internal delivery sink.

### Ingest a webhook

```bash
PAYLOAD='{"eventId":"evt-demo-1001","eventType":"order.created","occurredAt":"2026-03-07T10:00:00.000Z","subject":"order-1001","data":{"id":"order-1001","total":149.5,"currency":"USD"}}'
SIG=$(node -e "const crypto=require('crypto');const payload=process.argv[1];process.stdout.write(crypto.createHmac('sha256','acme-demo-secret').update(payload).digest('hex'))" "$PAYLOAD")

curl -s -X POST http://localhost:3000/api/v1/webhooks/acme \
  -H "content-type: application/json" \
  -H "x-acme-signature: $SIG" \
  --data "$PAYLOAD" | jq
```

### Query the event list

```bash
curl -s "http://localhost:3000/api/v1/events?page=1&pageSize=5&sortBy=receivedAt&sortOrder=desc" \
  -H "x-internal-api-key: $MGMT_KEY" | jq
```

### Replay an event

```bash
curl -s -X POST "http://localhost:3000/api/v1/events/<event-id>/replay" \
  -H "content-type: application/json" \
  -H "x-internal-api-key: $MGMT_KEY" \
  --data '{"requestedBy":"local-demo","reason":"Manual replay validation"}' | jq
```

### Inspect status and audit history

```bash
curl -s "http://localhost:3000/api/v1/events/<event-id>/status" \
  -H "x-internal-api-key: $MGMT_KEY" | jq

curl -s "http://localhost:3000/api/v1/deliveries?eventId=<event-id>" \
  -H "x-internal-api-key: $MGMT_KEY" | jq

curl -s "http://localhost:3000/api/v1/audit-entries?entityId=<event-id>" \
  -H "x-internal-api-key: $MGMT_KEY" | jq
```

### Simulate delivery failure

To exercise retries, include `simulateFailure: true` in the payload or in `payload.data`. The local internal delivery sink will return `500`, which causes the worker to schedule retries.

## Service Endpoints

| Service       | Address                  |
| ------------- | ------------------------ |
| API           | `http://localhost:3000`  |
| Nginx proxy   | `http://localhost:8082`  |
| PostgreSQL    | `localhost:5434`         |
| Redis         | `localhost:6381`         |
| RabbitMQ AMQP | `localhost:5672`         |
| RabbitMQ UI   | `http://localhost:15672` |

RabbitMQ UI credentials: `guest` / `guest`

## Non-Container Workflow

Use this path only when PostgreSQL, Redis, and RabbitMQ already exist outside Docker.

```bash
cp .env.example .env
npm install
npm run db:migrate
npm run db:seed
npm run dev
npm run worker:dev
```

## Validation Commands

| Command                             | Purpose                       |
| ----------------------------------- | ----------------------------- |
| `npm run lint`                      | ESLint                        |
| `npm run format`                    | Prettier check                |
| `npm run typecheck`                 | TypeScript validation         |
| `npm test`                          | Unit and integration coverage |
| `npm run build`                     | Compile API and worker output |
| `docker compose config > /dev/null` | Validate Compose wiring       |
