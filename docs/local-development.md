# Local Development

## Prerequisites

- Docker with Compose
- Node.js 20+ (only needed for non-container execution)

## Recommended Workflow (Docker)

### 1. Start stack

```bash
docker compose up --build -d
```

### 2. Watch startup logs

```bash
docker compose logs -f migrator api worker
```

### 3. Verify health

```bash
curl -s http://localhost:3000/api/v1/health | jq
```

### 4. Set management key for query endpoints

```bash
MGMT_KEY=local-internal-management-key
```

### 5. Example management query

```bash
curl -s "http://localhost:3000/api/v1/events?page=1&pageSize=10" \
  -H "x-internal-api-key: $MGMT_KEY" | jq
```

### 6. Stop stack

```bash
docker compose down
```

## Service Endpoints

- API: `http://localhost:3000`
- Nginx proxy: `http://localhost:8082`
- PostgreSQL: `localhost:5434`
- Redis: `localhost:6381`
- RabbitMQ: `localhost:5672`
- RabbitMQ management UI: `http://localhost:15672`

## Non-Container Workflow

Use this only if you are intentionally running dependencies outside Docker.

```bash
cp .env.example .env
npm install
npm run db:migrate
npm run db:seed
npm run dev
npm run worker:dev
```

## Quality Commands

```bash
npm run lint
npm run format
npm run typecheck
npm test
npm run build
```
