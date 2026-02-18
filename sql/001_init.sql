CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE absence_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id TEXT NOT NULL,
  absent_from TIMESTAMPTZ NOT NULL,
  absent_to TIMESTAMPTZ NOT NULL,
  reason TEXT NOT NULL,
  note TEXT,
  reported_by TEXT,
  idempotency_key TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT absence_events_reason_check
    CHECK (reason IN ('sick', 'vacation', 'other')),

  CONSTRAINT absence_events_time_range_check
    CHECK (absent_to > absent_from)
);

CREATE INDEX absence_events_student_time_idx
  ON absence_events (student_id, absent_from);

CREATE UNIQUE INDEX absence_events_idempotency_unique_idx
  ON absence_events (student_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
