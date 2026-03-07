# Domain Model

## Core Entities

### Integration

Represents a configured provider integration.

- `provider`: provider key (`acme`, `globex`, ...)
- `webhook_secret`: shared secret or token
- `callback_url`: outbound delivery destination
- `is_active`: controls whether ingestion/processing should proceed

### Webhook Event

Raw inbound webhook record.

- Original payload (`raw_payload`)
- Headers (`request_headers`)
- Signature validation result
- Source IP
- Idempotency key
- Provider and optional external event id

### Normalized Event

Internal canonical event used by processing and querying.

- Event type and subject
- Normalized payload object
- Processing status (`pending`, `processing`, `processed`, `retrying`, `failed`)
- Processing attempts, last error, and timing metadata

### Processing Job

Operational job trace for queue-driven work.

- Queue name and trigger source (`webhook`, `retry`, `replay`)
- Attempt number
- Status (`queued`, `running`, `succeeded`, `failed`)
- Error details and timestamps

### Delivery Attempt

Represents one outbound delivery attempt.

- Attempt number per normalized event
- Status (`success`, `failed`)
- Response code/body or network error
- Latency (`duration_ms`)

### Replay Request

Explicit reprocessing request for an existing event.

- Requested by + reason
- Status (`queued`, `dispatched`, `completed`, `failed`)
- Processed timestamp

### Audit Entry

Immutable audit log for critical actions.

- Entity type/id
- Action name
- Actor
- Structured details payload
- Timestamp

## Status Lifecycle

`pending -> processing -> processed`

Failure path:

`processing -> retrying -> processing ... -> failed`

Replay path:

`processed|failed -> replay requested -> replay dispatched -> processing`

## Key Constraints

- `webhook_events.idempotency_key` unique
- `normalized_events.webhook_event_id` unique (1:1 with webhook event)
- `delivery_attempts(normalized_event_id, attempt_no)` unique
- Foreign keys enforce ownership chain from integration to lifecycle artifacts

## Query Patterns

Designed for typical operational access:

- Filter events by `provider`, `status`, `event_type`, time range
- Fetch event details with related deliveries/jobs
- List deliveries by status/event
- List audits by entity/action
