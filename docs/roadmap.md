# Roadmap

## Near Term

- Add dead-letter queue endpoint and replay-from-DLQ tooling
- Add structured metrics (queue lag, delivery latency, retry counts)
- Expand provider adapters with additional normalization modules

## Mid Term

- Add OpenAPI document generation from route schemas
- Add per-integration delivery policy overrides (timeouts, retry caps)
- Replace shared management key with service-to-service identity (mTLS or signed JWT)

## Longer Term

- Multi-tenant namespace support with tenant-scoped queues
- Outbox pattern for guaranteed queue publication semantics
- Dashboard UI for events, deliveries, retries, and replay operations
