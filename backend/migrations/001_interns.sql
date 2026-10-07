-- SynapseBridge interns table (optional Postgres adapter).
-- Apply with: psql "$DATABASE_URL" -f migrations/001_interns.sql

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS interns (
  id         UUID PRIMARY KEY,
  name       TEXT NOT NULL CHECK (char_length(name) BETWEEN 2 AND 60),
  email      TEXT NOT NULL UNIQUE,
  phone      TEXT,
  track      TEXT NOT NULL CHECK (track IN ('full-stack', 'frontend', 'backend', 'data', 'ui-ux', 'cloud')),
  status     TEXT NOT NULL CHECK (status IN ('applied', 'active', 'completed', 'withdrawn')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS interns_track_idx ON interns (track);
CREATE INDEX IF NOT EXISTS interns_status_idx ON interns (status);
CREATE INDEX IF NOT EXISTS interns_created_at_idx ON interns (created_at);
