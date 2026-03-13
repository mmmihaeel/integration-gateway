# API Overview

Related: [README](../README.md) | [Architecture](architecture.md) | [Webhook Flow](webhook-flow.md) | [Security](security.md)

Base path: `/api/v1`

The API surface is deliberately small. The public side accepts health checks and inbound webhooks, while the management side exposes event, delivery, and audit views for operators.

## Response Contract

All success responses use:

```json
{
  "success": true,
  "data": {},
  "meta": {}
}
```

All error responses use:

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable message",
    "details": {}
  }
}
```

## Authentication and Access Model

| Route family           | Access model                           | Notes                                                                   |
| ---------------------- | -------------------------------------- | ----------------------------------------------------------------------- |
| Health                 | Public                                 | Returns `200` when all dependencies are healthy and `503` when degraded |
| Webhook ingress        | Provider-specific verification headers | `acme` uses HMAC, `globex` uses shared token verification               |
| Management routes      | `x-internal-api-key`                   | Compared with `MANAGEMENT_API_KEY` using constant-time equality         |
| Internal delivery sink | No management key, non-production only | Disabled entirely when `NODE_ENV=production`                            |

Protected routes:

- `GET /integrations`
- `GET /events`
- `GET /events/:id`
- `GET /events/:id/status`
- `GET /processing-status/:id`
- `POST /events/:id/replay`
- `GET /deliveries`
- `GET /audit-entries`

## Endpoint Families

| Method and path                          | Purpose                                                                             |
| ---------------------------------------- | ----------------------------------------------------------------------------------- |
| `GET /health`                            | Report PostgreSQL, Redis, and RabbitMQ health                                       |
| `POST /webhooks/:provider`               | Authenticate, normalize, persist, and enqueue an inbound provider event             |
| `GET /integrations`                      | List configured integrations, optionally filtered by provider or active state       |
| `GET /events`                            | Paginated event search over normalized events                                       |
| `GET /events/:id`                        | Event detail including raw webhook snapshot, delivery attempts, and processing jobs |
| `GET /events/:id/status`                 | Current event status, attempt count, last error, and recent jobs                    |
| `GET /processing-status/:id`             | Alias for the status view, useful for polling clients                               |
| `POST /events/:id/replay`                | Create a replay request and queue replay dispatch                                   |
| `GET /deliveries`                        | Paginated delivery-attempt listing                                                  |
| `GET /audit-entries`                     | Paginated audit history listing                                                     |
| `POST /internal/delivery-sink/:provider` | Local helper endpoint used by seeded integrations to validate worker deliveries     |

## Webhook Provider Contracts

| Provider | Verification header | Expected payload shape                                           |
| -------- | ------------------- | ---------------------------------------------------------------- |
| `acme`   | `x-acme-signature`  | `eventId`, `eventType`, `occurredAt`, optional `subject`, `data` |
| `globex` | `x-globex-token`    | `id`, `type`, `timestamp`, `resource`                            |

Webhook ingress behavior:

- Returns `202` when a new event is accepted and queued.
- Returns `200` when the request resolves to an existing event via idempotency.
- Rejects invalid provider credentials with `401`.
- Rejects malformed or non-object payloads with `400`.

## Query and Filter Surface

### `GET /integrations`

| Query parameter                         | Meaning                         |
| --------------------------------------- | ------------------------------- |
| `provider`                              | Filter by provider key          |
| `activeOnly=true` or `activeOnly=false` | Restrict to active integrations |

### `GET /events`

| Query parameter    | Meaning                                                           |
| ------------------ | ----------------------------------------------------------------- |
| `page`, `pageSize` | Pagination                                                        |
| `provider`         | Filter by provider key                                            |
| `status`           | One of `pending`, `processing`, `processed`, `retrying`, `failed` |
| `eventType`        | Filter by normalized event type                                   |
| `subject`          | Partial subject match                                             |
| `from`, `to`       | Time-range filter against `occurredAt`                            |
| `sortBy`           | `createdAt`, `occurredAt`, `status`, `receivedAt`                 |
| `sortOrder`        | `asc` or `desc`                                                   |

### `GET /deliveries`

| Query parameter    | Meaning                               |
| ------------------ | ------------------------------------- |
| `page`, `pageSize` | Pagination                            |
| `status`           | `success` or `failed`                 |
| `eventId`          | Restrict to a single normalized event |

### `GET /audit-entries`

| Query parameter    | Meaning                |
| ------------------ | ---------------------- |
| `page`, `pageSize` | Pagination             |
| `entityType`       | Filter by entity group |
| `entityId`         | Filter by entity id    |
| `action`           | Filter by action name  |

## Replay Semantics

`POST /events/:id/replay` accepts:

```json
{
  "requestedBy": "ops-user",
  "reason": "Replay after downstream outage"
}
```

Replay behavior:

- Returns `202` with `replayRequestId` and `eventId`.
- Persists the replay request before queue publication.
- Writes audit history for replay initiation and dispatch.
- Does not currently expose a standalone replay-request query route.

## Local Delivery Sink

The internal delivery sink exists only to keep the worker path testable in local and test environments. Seeded integrations point their callback URLs at:

- `/api/v1/internal/delivery-sink/acme`
- `/api/v1/internal/delivery-sink/globex`

If the payload or nested payload data contains `simulateFailure: true`, the sink returns a `500` response so retry behavior can be exercised intentionally.

For lifecycle detail beyond the route surface, see [webhook-flow.md](webhook-flow.md).
