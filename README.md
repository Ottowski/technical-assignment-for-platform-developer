# Absence Events Service

Small production-minded TypeScript service for creating and listing student absence events.

## Tech stack

- Node.js + TypeScript
- PostgreSQL
- Docker Compose

## Run locally (Docker)

```powershell
docker compose up --build
```

Service endpoints:

- API: `http://localhost:3000`
- Postgres: `localhost:5432`

Environment variables (set in `docker-compose.yml`):

- `PORT=3000`
- `DATABASE_URL=postgres://postgres:postgres@db:5432/absence_service`

Stop stack:

```powershell
docker compose down
```

Reset DB (fresh init from SQL):

```powershell
docker compose down -v
docker compose up --build
```

## Docker notes

- One-command local run is `docker compose up --build`.
- App image uses a multi-stage Docker build (build stage + runtime stage).
- Runtime container runs as non-root user (`node`).
- SQL init is mounted from `./sql` to `/docker-entrypoint-initdb.d`.
- App container waits for DB health check before startup.

## Database schema/init

Schema file: `sql/init.sql`

The DB is initialized automatically by Postgres container startup via mounted `./sql` folder.

## API examples

### Health

```powershell
curl.exe -i http://localhost:3000/health
```

### Create event

```powershell
$body = '{"from":"2026-02-10T08:30:00.000Z","to":"2026-02-10T12:00:00.000Z","reason":"sick","note":"fever","reportedBy":"user:test","idempotencyKey":"demo-1"}'
curl.exe -i -X POST "http://localhost:3000/v1/students/student-demo/absence-events" -H "Content-Type: application/json" -d "$body"
```

### List events

```powershell
curl.exe -i "http://localhost:3000/v1/students/student-demo/absence-events?from=2026-02-01T00:00:00.000Z&to=2026-02-28T23:59:59.000Z"
```

More test cases (validation, 404, etc.) are in `API_TEST_EXAMPLES.md`.

## Endpoint overview

| Endpoint | Method | Success | Common errors |
| --- | --- | --- | --- |
| `/health` | `GET` | `200` | - |
| `/v1/students/:studentId/absence-events` | `POST` | `201` | `400`, `500` |
| `/v1/students/:studentId/absence-events?from=...&to=...` | `GET` | `200` | `400`, `500` |

Idempotency behavior: repeating the same create request with the same `idempotencyKey` returns the same event data.

## NPM scripts

- `npm run dev` – run service in dev mode
- `npm run build` – compile TypeScript
- `npm run start` – run compiled app
- `npm run smoke:test` – PowerShell smoke test for health/create/list

## Assumptions / shortcuts

- Single service instance (no distributed idempotency store beyond DB constraints/queries)
- No authentication/authorization layer
- Basic structured JSON error responses (no centralized error middleware)
- Manual SQL file initialization (no migration framework yet)

## Troubleshooting

- Port conflict on `3000`/`5432`: stop conflicting processes or change host port mapping in `docker-compose.yml`.
- Need a clean DB state: run `docker compose down -v` and start again.

## Before submit

- `npm run build`
- `npm run smoke:test`
- `docker compose up --build`
- Verify `GET /health` responds with `{"status":"ok"}`

## AI usage note

AI was used only for limited support tasks: quick syntax checks, boilerplate snippets, and cleanup in documentation. Core implementation, architecture decisions, API/data-model choices, debugging, and final verification were done manually.
