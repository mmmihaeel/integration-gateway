# API Overview

Base path: `/api/v1`

All success responses:

```json
{
  "success": true,
  "data": {},
  "meta": {}
}
```

All error responses:

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

## Authentication Model

- Webhook endpoints use provider-specific verification headers.
- Management/query endpoints require `x-internal-api-key` matching `MANAGEMENT_API_KEY`.

Protected routes:

- `GET /integrations`
- `GET /events`
- `GET /events/:id`
- `GET /events/:id/status`
- `POST /events/:id/replay`
- `GET /deliveries`
- `GET /audit-entries`
- `GET /processing-status/:id`

Public routes:

- `GET /health`
- `POST /webhooks/:provider`

## Health

### `GET /health`

Returns dependency status for PostgreSQL, Redis, and RabbitMQ.

## Integrations

### `GET /integrations` (management key required)

Query params:

- `provider` (optional)
- `activeOnly=true|false` (optional)

## Webhooks

### `POST /webhooks/:provider`

Ingests provider payload, verifies authenticity, normalizes data, persists records, and enqueues async processing.

Provider headers:

- `acme`: `x-acme-signature` (hex HMAC SHA256 of raw JSON body)
- `globex`: `x-globex-token` (shared token)

Behavior:

- `202` for newly queued events
- `200` for duplicate events (idempotency hit)

## Events

### `GET /events` (management key required)

Query params:

- Pagination: `page`, `pageSize`
- Filters: `provider`, `status`, `eventType`, `subject`, `from`, `to`
- Sorting: `sortBy=createdAt|occurredAt|status|receivedAt`, `sortOrder=asc|desc`

### `GET /events/:id` (management key required)

Returns event details with raw webhook snapshot, delivery attempts, and processing jobs.

### `GET /events/:id/status` (management key required)

Returns current status, attempts, last error, and recent processing jobs.

### `POST /events/:id/replay` (management key required)

Body:

```json
{
  "requestedBy": "ops-user",
  "reason": "Replay after downstream outage"
}
```

Returns replay request id and target event id.

## Deliveries

### `GET /deliveries` (management key required)

Query params:

- `page`, `pageSize`
- `status=success|failed`
- `eventId`

## Audit Entries

### `GET /audit-entries` (management key required)

Query params:

- `page`, `pageSize`
- `entityType`
- `entityId`
- `action`

## Processing Status Alias

### `GET /processing-status/:id` (management key required)

Alias for event status view, useful for operational polling clients.
