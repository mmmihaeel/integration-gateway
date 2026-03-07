# Architecture

## Overview

`integration-gateway` follows a layered architecture to keep HTTP transport, business orchestration, domain contracts, and infrastructure concerns clearly separated.

- API layer (`src/api`): routing, request validation, response and error shaping
- Application layer (`src/application`): ingestion, normalization, idempotency, replay, retry, and query use cases
- Domain layer (`src/domain`): shared types and domain-specific error contracts
- Infrastructure layer (`src/infrastructure`): PostgreSQL repositories, RabbitMQ queue adapter, Redis utilities, outbound delivery adapter
- Worker process (`src/worker`): queue consumers for replay dispatch and event processing

## Runtime Components

- API service (Fastify): webhook ingress and management/query APIs
- Worker service: async processing and retry scheduling
- PostgreSQL: durable state for integrations, events, jobs, deliveries, replay requests, audits
- RabbitMQ: asynchronous workflow queues
- Redis: idempotency marker store, short-lived lock and rate-limit state
- Nginx (optional local reverse proxy): simplified local entrypoint

## Access Boundaries

- Public endpoints: webhook ingestion and health checks
- Internal management endpoints: event, delivery, integration, replay, and audit queries
- Internal endpoints are protected by `x-internal-api-key` (`MANAGEMENT_API_KEY`)

## Processing Topology

Queues:

- `ig.events.process`: primary event processing queue
- `ig.events.retry`: delayed retry queue with dead-letter routing back to process queue
- `ig.events.replay`: replay request dispatch queue

Flow:

1. API validates and stores webhook payload.
2. API emits process message.
3. Worker consumes process message and attempts delivery.
4. Failure path schedules retry message with TTL.
5. Retry queue dead-letters back to process queue.
6. Replay path emits replay message, then dispatches another process message.

## Data Ownership

- API owns webhook ingress and replay initiation
- Worker owns event execution and delivery outcomes
- PostgreSQL stores lifecycle source of truth
- RabbitMQ carries command-style async messages
- Redis supports fast ephemeral control state

## Reliability Notes

- Durable queues and persistent messages are enabled.
- Duplicate processing is constrained by idempotency + DB uniqueness.
- Worker uses Redis lock keys to avoid concurrent handling of the same event.
- Delivery attempts and processing jobs are persisted for observability.

## Trade-offs

- The project prioritizes readability and explicitness over heavy framework abstractions.
- Queue and persistence interactions are intentionally direct SQL + adapter code to keep logic reviewable.
- Retry scheduling relies on queue TTL/dead-letter patterns rather than external schedulers.
