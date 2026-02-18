# DESIGN

## Idempotency

`POST /v1/students/:studentId/absence-events` supports idempotency primarily via `idempotencyKey`.

Implementation strategy:

- DB has a unique partial index on `(student_id, idempotency_key)` where key is not null.
- Insert uses `ON CONFLICT ... DO NOTHING` and then fetches existing row for retries.
- If no `idempotencyKey` is provided, service applies a pragmatic fallback dedup strategy by checking an existing event with same key fields (`student_id`, `from_at`, `to_at`, `reason`, `note`, `reported_by`) before insert.

This gives safe retries while keeping implementation compact for the assignment.

## Schema & indexes

Table: `absence_events`

Key choices:

- `from_at` / `to_at` as `TIMESTAMPTZ`
- `reason` constrained by DB check (`sick`, `vacation`, `other`)
- Range integrity constraint `to_at > from_at`
- Unique index for idempotency key per student
- Index `(student_id, from_at)` to support list query filter/sort path

Reasoning:

- Important invariants are enforced in DB, not only API validation.
- Indexes align with query shape for `GET /absence-events?from=&to=`.
- Validation is done in both API and DB (defense in depth): API gives clear client errors, DB guarantees integrity.

## Docker / Linux choices

- Service is designed to run with `docker compose up --build` from a clean environment.
- `docker-compose.yml` starts both app and PostgreSQL, including DB health checks.
- Dockerfile uses a multi-stage build to keep runtime image focused on production dependencies.
- Runtime container runs as non-root (`node`) for safer defaults.
- SQL schema is initialized automatically by mounting `./sql` into Postgres init directory.

This setup prioritizes reproducibility and simple local debugging while staying close to production-minded container workflows.

## Production considerations

Before production, I would add:

- Proper migration tooling/versioned migrations
- Integration tests (DB + API) in CI
- Better request logging/trace IDs and metrics
- More explicit idempotency response metadata (`replayed` flag, status distinction)
- Graceful shutdown + DB pool lifecycle wiring
- Security layer (authn/authz, rate limiting, input size limits)

## Tradeoff chosen

I intentionally kept the service in a compact file structure and used a single SQL init file instead of a full migration framework. This keeps the assignment easy to review and fast to iterate on, at the cost of less migration/history tooling.

## Change readiness

To support likely follow-up changes, responsibilities are already separated at a practical level:

- Request parsing/validation in API layer (`server.ts`)
- Persistence logic in DB layer (`db.ts`)
- Runtime/app configuration in `app.ts`

This keeps future requirement updates (new fields, response adjustments, query tweaks) localized and easier to apply.
