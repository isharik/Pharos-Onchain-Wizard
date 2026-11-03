-- Run once in Supabase Dashboard > SQL Editor.
-- The backend service-role key is the only credential permitted to access these tables.
CREATE TABLE IF NOT EXISTS pharos_executions (
  id text PRIMARY KEY, module text NOT NULL, status text NOT NULL, started text NOT NULL,
  ended text, input text NOT NULL, result text, error text, request_key text UNIQUE
);
CREATE TABLE IF NOT EXISTS pharos_state (
  key text PRIMARY KEY, value text NOT NULL
);
CREATE TABLE IF NOT EXISTS pharos_events (
  id text PRIMARY KEY, kind text NOT NULL, time text NOT NULL, payload text NOT NULL
);
CREATE TABLE IF NOT EXISTS pharos_jobs (
  id text PRIMARY KEY, module text NOT NULL, input text NOT NULL, interval_ms bigint NOT NULL,
  next_run bigint NOT NULL, enabled integer NOT NULL DEFAULT 1, error text
);

ALTER TABLE pharos_executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE pharos_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE pharos_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE pharos_jobs ENABLE ROW LEVEL SECURITY;
