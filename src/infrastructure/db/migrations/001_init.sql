CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'event_status') THEN
    CREATE TYPE event_status AS ENUM ('pending', 'processing', 'processed', 'retrying', 'failed');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'delivery_status') THEN
    CREATE TYPE delivery_status AS ENUM ('success', 'failed');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'processing_job_status') THEN
    CREATE TYPE processing_job_status AS ENUM ('queued', 'running', 'succeeded', 'failed');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'replay_status') THEN
    CREATE TYPE replay_status AS ENUM ('queued', 'dispatched', 'completed', 'failed');
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  webhook_secret TEXT NOT NULL,
  callback_url TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id UUID NOT NULL REFERENCES integrations(id) ON DELETE RESTRICT,
  provider TEXT NOT NULL,
  external_event_id TEXT,
  idempotency_key TEXT NOT NULL UNIQUE,
  signature_valid BOOLEAN NOT NULL,
  request_headers JSONB NOT NULL,
  raw_payload JSONB NOT NULL,
  source_ip INET,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_webhook_events_provider_received_at
  ON webhook_events (provider, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_webhook_events_external_event_id
  ON webhook_events (external_event_id);

CREATE TABLE IF NOT EXISTS normalized_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_event_id UUID NOT NULL UNIQUE REFERENCES webhook_events(id) ON DELETE CASCADE,
  integration_id UUID NOT NULL REFERENCES integrations(id) ON DELETE RESTRICT,
  provider TEXT NOT NULL,
  event_type TEXT NOT NULL,
  subject TEXT,
  occurred_at TIMESTAMPTZ NOT NULL,
  normalized_payload JSONB NOT NULL,
  status event_status NOT NULL DEFAULT 'pending',
  processing_attempts INTEGER NOT NULL DEFAULT 0 CHECK (processing_attempts >= 0),
  last_error TEXT,
  last_processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_normalized_events_provider_status_created
  ON normalized_events (provider, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_normalized_events_event_type
  ON normalized_events (event_type);
CREATE INDEX IF NOT EXISTS idx_normalized_events_occurred_at
  ON normalized_events (occurred_at DESC);

CREATE TABLE IF NOT EXISTS processing_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  normalized_event_id UUID NOT NULL REFERENCES normalized_events(id) ON DELETE CASCADE,
  queue_name TEXT NOT NULL,
  triggered_by TEXT NOT NULL,
  status processing_job_status NOT NULL,
  attempt_no INTEGER NOT NULL CHECK (attempt_no > 0),
  scheduled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_processing_jobs_event_status
  ON processing_jobs (normalized_event_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS delivery_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  normalized_event_id UUID NOT NULL REFERENCES normalized_events(id) ON DELETE CASCADE,
  integration_id UUID NOT NULL REFERENCES integrations(id) ON DELETE RESTRICT,
  attempt_no INTEGER NOT NULL CHECK (attempt_no > 0),
  status delivery_status NOT NULL,
  http_status INTEGER,
  response_body TEXT,
  error_message TEXT,
  duration_ms INTEGER NOT NULL CHECK (duration_ms >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (normalized_event_id, attempt_no)
);

CREATE INDEX IF NOT EXISTS idx_delivery_attempts_status_created
  ON delivery_attempts (status, created_at DESC);

CREATE TABLE IF NOT EXISTS replay_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  normalized_event_id UUID NOT NULL REFERENCES normalized_events(id) ON DELETE CASCADE,
  requested_by TEXT NOT NULL,
  reason TEXT NOT NULL,
  status replay_status NOT NULL DEFAULT 'queued',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_replay_requests_event_created
  ON replay_requests (normalized_event_id, created_at DESC);

CREATE TABLE IF NOT EXISTS audit_entries (
  id BIGSERIAL PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  action TEXT NOT NULL,
  actor TEXT NOT NULL,
  details JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_entries_entity_created
  ON audit_entries (entity_type, entity_id, created_at DESC);
