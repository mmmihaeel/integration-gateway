# Security

Related: [README](../README.md) | [API Overview](api-overview.md) | [Webhook Flow](webhook-flow.md) | [Deployment Notes](deployment-notes.md)

The repository is not presented as a complete production security platform, but the implemented controls are deliberate and backend-focused: authenticate webhook ingress, protect the management surface, validate all inputs, constrain duplicate processing, and keep an operational audit trail.

## Implemented Controls

| Concern                    | Control                        | Implementation detail                                                                      |
| -------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------ |
| Provider authenticity      | Provider-specific verification | `acme` uses HMAC SHA256 over the raw body; `globex` uses a shared token header             |
| Management surface         | Internal API key               | `x-internal-api-key` is compared against `MANAGEMENT_API_KEY` using constant-time equality |
| Payload validation         | Schema-driven validation       | Route params, query params, and request bodies are validated with `zod`                    |
| Duplicate ingestion        | Layered idempotency            | Redis marker plus PostgreSQL uniqueness                                                    |
| Concurrent processing      | Event lock                     | Worker acquires a Redis lock before handling a normalized event                            |
| Abuse resistance           | Rate limiting                  | Redis bucketed limits by provider and source IP                                            |
| Operational accountability | Append-only history            | Audit entries, delivery attempts, processing jobs, and replay requests                     |

## Webhook Verification Model

### `acme`

- Requires `x-acme-signature`.
- The signature is the HMAC SHA256 of the raw JSON request body using the integration secret.
- Verification happens before persistence.

### `globex`

- Requires `x-globex-token`.
- The provided token must equal the configured integration secret.
- Verification happens before persistence.

The project intentionally verifies the raw request body rather than a reserialized object so the HMAC check stays aligned with the transport payload.

## Management Route Protection

Protected prefixes:

- `/api/v1/integrations`
- `/api/v1/events`
- `/api/v1/deliveries`
- `/api/v1/audit-entries`
- `/api/v1/processing-status`

Public routes:

- `/api/v1/health`
- `/api/v1/webhooks/:provider`
- `/api/v1/internal/delivery-sink/:provider` in non-production environments only

This management model is intentionally narrow: one shared key for private operational APIs. It is not positioned as user-level or tenant-level access control.

## Integrity and Abuse Controls

| Control area                 | What happens                                                                       |
| ---------------------------- | ---------------------------------------------------------------------------------- |
| Non-object payload rejection | Webhook requests that are not JSON objects return validation errors                |
| Replay request validation    | `requestedBy` and `reason` length constraints are enforced                         |
| Query validation             | Pagination, filters, and sort values are constrained to expected inputs            |
| Rate limiting                | Excess webhook traffic returns `429 RATE_LIMITED`                                  |
| Duplicate suppression        | Duplicate requests resolve to the existing event instead of creating parallel work |
| Worker concurrency           | Redis lock prevents concurrent handling of the same event id                       |

## Secrets and Data Handling

- Provider secrets and management keys are loaded from environment variables.
- Response contracts do not expose secrets.
- Raw webhook bodies are persisted because the repository values auditability and replayability, so database access must be treated as sensitive.
- Callback delivery includes correlation headers for traceability but does not propagate provider secrets downstream.

## Current Boundaries

| Boundary                   | Current position                                                               |
| -------------------------- | ------------------------------------------------------------------------------ |
| TLS termination            | Expected at the ingress or proxy layer, not implemented inside the application |
| Management auth            | Shared internal key only                                                       |
| Secret rotation            | Manual and environment-driven                                                  |
| Fine-grained authorization | Not implemented                                                                |
| Security telemetry         | Audit history is implemented; centralized SIEM-style export is not             |

## Hardening Steps for a Deeper Production Posture

- Put management routes behind private networking or VPN access.
- Terminate TLS ahead of the API and enforce secure ingress headers.
- Rotate webhook secrets and management keys on a schedule.
- Add centralized log shipping and metrics around auth failures, retries, and queue depth.
- Replace the shared management key with stronger service-to-service identity if the control surface grows.
