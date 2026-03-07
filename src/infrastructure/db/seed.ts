import { closePool, getPool, withTransaction } from './pool.js';
import { IntegrationsRepository } from './repositories/integrations-repository.js';

async function seedIntegrations(): Promise<Record<string, string>> {
  const repo = new IntegrationsRepository(getPool());

  const acme = await repo.upsert({
    provider: 'acme',
    name: 'Acme Commerce',
    webhookSecret: 'acme-demo-secret',
    callbackUrl: 'http://api:3000/api/v1/internal/delivery-sink/acme',
    isActive: true,
  });

  const globex = await repo.upsert({
    provider: 'globex',
    name: 'Globex Billing',
    webhookSecret: 'globex-demo-secret',
    callbackUrl: 'http://api:3000/api/v1/internal/delivery-sink/globex',
    isActive: true,
  });

  return {
    acme: acme.id,
    globex: globex.id,
  };
}

async function seedEventFixtures(integrationIds: Record<string, string>): Promise<void> {
  const pool = getPool();

  const fixtures = [
    {
      provider: 'acme',
      integrationId: integrationIds.acme,
      idempotencyKey: 'seed:acme:evt-1000',
      externalEventId: 'evt-1000',
      eventType: 'order.created',
      subject: 'order-1000',
      occurredAt: '2026-02-10T12:00:00.000Z',
      eventStatus: 'processed',
      processingAttempts: 1,
      lastError: null,
      payload: {
        eventType: 'order.created',
        subject: 'order-1000',
        order: {
          id: 'order-1000',
          total: 129.99,
          currency: 'USD',
        },
      },
      delivery: {
        status: 'success',
        httpStatus: 202,
        errorMessage: null,
        responseBody: '{"accepted":true}',
      },
    },
    {
      provider: 'globex',
      integrationId: integrationIds.globex,
      idempotencyKey: 'seed:globex:evt-2000',
      externalEventId: 'evt-2000',
      eventType: 'invoice.failed',
      subject: 'invoice-2000',
      occurredAt: '2026-02-11T13:00:00.000Z',
      eventStatus: 'failed',
      processingAttempts: 3,
      lastError: 'Remote endpoint returned 500',
      payload: {
        eventType: 'invoice.failed',
        subject: 'invoice-2000',
        invoice: {
          id: 'invoice-2000',
          amountDue: 450,
          currency: 'USD',
        },
      },
      delivery: {
        status: 'failed',
        httpStatus: 500,
        errorMessage: 'Remote endpoint returned 500',
        responseBody: '{"error":"upstream"}',
      },
    },
    {
      provider: 'acme',
      integrationId: integrationIds.acme,
      idempotencyKey: 'seed:acme:evt-3000',
      externalEventId: 'evt-3000',
      eventType: 'subscription.updated',
      subject: 'sub-3000',
      occurredAt: '2026-02-12T10:00:00.000Z',
      eventStatus: 'pending',
      processingAttempts: 0,
      lastError: null,
      payload: {
        eventType: 'subscription.updated',
        subject: 'sub-3000',
        subscription: {
          id: 'sub-3000',
          plan: 'pro',
        },
      },
      delivery: null,
    },
  ] as const;

  for (const fixture of fixtures) {
    await withTransaction(async (client) => {
      const existingWebhook = await client.query<{ id: string }>(
        `SELECT id FROM webhook_events WHERE idempotency_key = $1;`,
        [fixture.idempotencyKey],
      );

      if (existingWebhook.rows.length > 0) {
        return;
      }

      const webhookInsert = await client.query<{ id: string }>(
        `
        INSERT INTO webhook_events (
          integration_id,
          provider,
          external_event_id,
          idempotency_key,
          signature_valid,
          request_headers,
          raw_payload,
          source_ip,
          received_at
        )
        VALUES ($1, $2, $3, $4, true, '{}'::jsonb, $5::jsonb, NULL, NOW() - INTERVAL '1 day')
        RETURNING id;
      `,
        [
          fixture.integrationId,
          fixture.provider,
          fixture.externalEventId,
          fixture.idempotencyKey,
          JSON.stringify(fixture.payload),
        ],
      );

      const normalizedInsert = await client.query<{ id: string }>(
        `
        INSERT INTO normalized_events (
          webhook_event_id,
          integration_id,
          provider,
          event_type,
          subject,
          occurred_at,
          normalized_payload,
          status,
          processing_attempts,
          last_error,
          last_processed_at
        )
        VALUES (
          $1,
          $2,
          $3,
          $4,
          $5,
          $6,
          $7::jsonb,
          $8::event_status,
          $9,
          $10,
          CASE
            WHEN $8::event_status = 'processed' OR $8::event_status = 'failed'
            THEN NOW()
            ELSE NULL
          END
        )
        RETURNING id;
      `,
        [
          webhookInsert.rows[0].id,
          fixture.integrationId,
          fixture.provider,
          fixture.eventType,
          fixture.subject,
          fixture.occurredAt,
          JSON.stringify(fixture.payload),
          fixture.eventStatus,
          fixture.processingAttempts,
          fixture.lastError,
        ],
      );

      const eventId = normalizedInsert.rows[0].id;

      await client.query(
        `
        INSERT INTO audit_entries (entity_type, entity_id, action, actor, details)
        VALUES
          ('normalized_event', $1, 'event.seeded', 'seed-script', $2::jsonb),
          ('normalized_event', $1, 'event.status.set', 'seed-script', $3::jsonb);
      `,
        [
          eventId,
          JSON.stringify({ provider: fixture.provider, externalEventId: fixture.externalEventId }),
          JSON.stringify({
            status: fixture.eventStatus,
            processingAttempts: fixture.processingAttempts,
          }),
        ],
      );

      if (fixture.delivery) {
        await client.query(
          `
          INSERT INTO delivery_attempts (
            normalized_event_id,
            integration_id,
            attempt_no,
            status,
            http_status,
            response_body,
            error_message,
            duration_ms,
            created_at
          )
          VALUES ($1, $2, 1, $3, $4, $5, $6, 132, NOW());
        `,
          [
            eventId,
            fixture.integrationId,
            fixture.delivery.status,
            fixture.delivery.httpStatus,
            fixture.delivery.responseBody,
            fixture.delivery.errorMessage,
          ],
        );
      }

      await client.query(
        `
        INSERT INTO processing_jobs (
          normalized_event_id,
          queue_name,
          triggered_by,
          status,
          attempt_no,
          started_at,
          completed_at,
          error_message
        )
        VALUES (
          $1,
          'seed',
          'seed',
          $2,
          GREATEST($3, 1),
          NOW() - INTERVAL '10 minutes',
          NOW() - INTERVAL '9 minutes',
          $4
        );
      `,
        [
          eventId,
          fixture.eventStatus === 'failed' ? 'failed' : 'succeeded',
          fixture.processingAttempts,
          fixture.lastError,
        ],
      );
    });
  }

  const summary = await pool.query<{ events: string; deliveries: string; replays: string }>(`
    SELECT
      (SELECT COUNT(*)::text FROM normalized_events) AS events,
      (SELECT COUNT(*)::text FROM delivery_attempts) AS deliveries,
      (SELECT COUNT(*)::text FROM replay_requests) AS replays;
  `);

  const row = summary.rows[0] ?? { events: '0', deliveries: '0', replays: '0' };
  console.log(
    `Seed complete: ${row.events} events, ${row.deliveries} deliveries, ${row.replays} replay requests.`,
  );
}

async function main(): Promise<void> {
  const integrationIds = await seedIntegrations();
  await seedEventFixtures(integrationIds);
}

main()
  .catch((error) => {
    console.error('Seed failed', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePool();
  });
