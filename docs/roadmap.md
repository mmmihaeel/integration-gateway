# Roadmap

Related: [README](../README.md) | [Architecture](architecture.md) | [Deployment Notes](deployment-notes.md)

This roadmap stays close to the current implementation. The goal is to show where the repository can grow next without implying that those capabilities already exist.

## Current Baseline

Already implemented in the repository:

- Provider-specific verification for `acme` and `globex`
- Raw webhook persistence and canonical event normalization
- Layered idempotency with Redis and PostgreSQL
- RabbitMQ-backed process, retry, and replay queues
- Worker-driven delivery tracking and retry scheduling
- Replay requests with actor, reason, and status transitions
- Management APIs for events, deliveries, and audit history
- Docker Compose workflow and GitHub Actions quality gates

## Near-Term Improvements

| Improvement                                                           | Why it is next                                                                         |
| --------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Dead-letter inspection and recovery tooling                           | Completes the operational loop around failed queue traffic                             |
| Metrics and tracing for queue lag, delivery latency, and retry volume | Makes runtime behavior measurable without reading raw tables                           |
| Additional provider adapters                                          | Expands the normalization pattern beyond the two example integrations                  |
| Dedicated replay-request query surface                                | Makes replay activity easier to review without inferring it from event and audit views |

## Medium-Term Improvements

| Improvement                               | Value                                                                   |
| ----------------------------------------- | ----------------------------------------------------------------------- |
| Per-integration delivery policy overrides | Lets integrations define their own timeout and retry behavior           |
| OpenAPI generation from route schemas     | Improves API discoverability without hand-maintained endpoint dumps     |
| Stronger management-plane auth            | Replaces the shared internal key with service identity or signed tokens |

## Longer-Horizon Options

| Improvement                               | Why it is deferred                                                          |
| ----------------------------------------- | --------------------------------------------------------------------------- |
| Outbox-style queue publication guarantees | Useful when publication atomicity becomes a primary concern                 |
| Multi-tenant namespace support            | Adds significant routing and data-isolation complexity                      |
| Operator dashboard UI                     | Valuable once the backend control plane is broader than a small API surface |

The repository is intentionally strongest today in webhook ingestion, worker processing, idempotency, retries, and replay. Future work should preserve that clarity instead of diluting it.
