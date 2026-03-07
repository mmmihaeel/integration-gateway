# Webhook Processing Flow

## 1) Receive and Authenticate

Endpoint: `POST /api/v1/webhooks/:provider`

- Request body is parsed as JSON object
- Raw body is preserved for signature validation
- Provider-specific checks run before persistence

Provider checks:

- `acme`: validate `x-acme-signature` HMAC SHA256 over raw body
- `globex`: validate `x-globex-token` equals integration secret

## 2) Normalize and Build Idempotency Key

- Provider normalizer maps payload into canonical internal format
- Idempotency key strategy:
  - preferred: `provider + external_event_id`
  - fallback: stable hash of normalized payload

## 3) Deduplicate and Persist

- Redis marker (`SET NX`) blocks duplicate bursts quickly
- PostgreSQL unique key on `webhook_events.idempotency_key` guarantees final consistency
- Raw webhook and normalized event rows are written in a transaction
- Initial processing job and audit entries are created

## 4) Queue for Async Processing

- API publishes process message to `ig.events.process`
- Message includes event id, attempt number, trigger source, and correlation id

## 5) Process and Deliver

Worker flow:

- Acquire Redis lock for event id
- Mark event state as `processing`
- Deliver normalized payload to integration callback URL
- Record delivery attempt with status, response, and latency

## 6) Retry on Failure

- On failed attempt with retries remaining:
  - mark event `retrying`
  - persist retry processing job
  - publish delayed message to retry queue
- Retry queue uses message TTL and dead-letter routing back to process queue
- When max attempts are exhausted, event transitions to `failed`

## 7) Replay Support

- `POST /api/v1/events/:id/replay` creates replay request and audit record
- Replay request is enqueued on `ig.events.replay`
- Replay consumer marks request `dispatched` and republishes to process queue
- Completion/failure updates replay request status

## 8) Operational Visibility

Management/query endpoints (require `x-internal-api-key`):

- `/api/v1/events`
- `/api/v1/events/:id`
- `/api/v1/events/:id/status`
- `/api/v1/deliveries`
- `/api/v1/audit-entries`
- `/api/v1/processing-status/:id`

Public operational endpoint:

- `/api/v1/health`
