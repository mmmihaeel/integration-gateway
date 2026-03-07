# Security

## Implemented Controls

### Provider Verification

- `acme` webhooks require valid `x-acme-signature` HMAC SHA256 over the raw JSON body.
- `globex` webhooks require `x-globex-token` matching the integration secret.
- Invalid or missing provider credentials are rejected before persistence.

### Management Endpoint Protection

- Management/query endpoints require `x-internal-api-key`.
- The key is configured through `MANAGEMENT_API_KEY`.
- Comparison uses constant-time byte equality to reduce key comparison leakage.

Protected groups:

- `/api/v1/integrations`
- `/api/v1/events`
- `/api/v1/deliveries`
- `/api/v1/audit-entries`
- `/api/v1/processing-status`

### Input Validation

- Route params, query params, and JSON bodies are validated with schema boundaries.
- Non-object webhook payloads are rejected.
- Replay input enforces actor/reason constraints.
- Pagination and filter inputs are constrained to expected values.

### Idempotency and Duplicate Safety

- Redis idempotency markers suppress duplicate bursts.
- PostgreSQL unique idempotency key protects against race conditions.

### Rate Limiting

- Redis-backed per-provider/per-source-IP limits for webhook ingestion.
- Exceeded limits return `429 RATE_LIMITED`.

### Secret and Error Handling

- Secrets are environment-configured only.
- Response payloads do not expose provider secrets.
- Errors are returned through structured error contracts.

### Auditability

- Ingestion, queueing, processing, retries, and replay actions write audit entries.
- Replay requests include explicit actor and reason.

## Remaining Practical Limits

- Management auth is a single shared internal key, not user-level authentication.
- API transport security (TLS termination) is expected at ingress/proxy level.
- Secret rotation is manual and environment-driven.

## Operational Hardening Recommendations

- Restrict management endpoints to private networks or VPN-access paths.
- Rotate provider secrets and management keys on a fixed schedule.
- Enforce TLS and secure headers at ingress.
- Centralize logs and audit streams into an observability platform.
