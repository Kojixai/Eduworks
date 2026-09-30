-- 001 Registry: licences, sources, raw files, ingest runs and logs.
-- Portable SQL: runs unchanged on SQLite 3.35+ and PostgreSQL 13+.
-- Conventions: TEXT ids, INTEGER 0/1 booleans, ISO-8601 TEXT timestamps, JSON stored as TEXT.

CREATE TABLE IF NOT EXISTS schema_migrations (
  id TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS licences (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  url TEXT,
  attribution_template TEXT,
  allows_commercial INTEGER NOT NULL DEFAULT 1,
  allows_derivatives INTEGER NOT NULL DEFAULT 1,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS sources (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  publisher TEXT,
  home_url TEXT,
  licence_id TEXT REFERENCES licences(id),
  licence_evidence TEXT,
  licence_evidence_url TEXT,
  access_status TEXT NOT NULL DEFAULT 'unknown',
  access_notes TEXT,
  kind TEXT,
  attribution_text TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS raw_files (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES sources(id),
  url TEXT NOT NULL,
  local_path TEXT,
  checksum_sha256 TEXT,
  bytes INTEGER,
  content_type TEXT,
  retrieved_at TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  error TEXT,
  meta_json TEXT
);
CREATE INDEX IF NOT EXISTS ix_raw_files_source ON raw_files(source_id);

CREATE TABLE IF NOT EXISTS ingest_runs (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES sources(id),
  started_at TEXT NOT NULL,
  finished_at TEXT,
  status TEXT NOT NULL DEFAULT 'running',
  stats_json TEXT,
  error TEXT
);
CREATE INDEX IF NOT EXISTS ix_ingest_runs_source ON ingest_runs(source_id);

CREATE TABLE IF NOT EXISTS ingest_logs (
  id TEXT PRIMARY KEY,
  run_id TEXT REFERENCES ingest_runs(id),
  source_id TEXT,
  level TEXT NOT NULL,
  code TEXT,
  message TEXT NOT NULL,
  context_json TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_ingest_logs_run ON ingest_logs(run_id);
CREATE INDEX IF NOT EXISTS ix_ingest_logs_level ON ingest_logs(level);

CREATE TABLE IF NOT EXISTS ingest_checkpoints (
  source_id TEXT NOT NULL,
  key TEXT NOT NULL,
  value TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (source_id, key)
);
