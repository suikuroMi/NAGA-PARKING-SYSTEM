CREATE TABLE IF NOT EXISTS parking_config (
  id integer PRIMARY KEY CHECK (id = 1),
  data jsonb NOT NULL,
  revision bigint NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS parking_slots (
  id text PRIMARY KEY, category text NOT NULL, status text NOT NULL, data jsonb NOT NULL
);
CREATE TABLE IF NOT EXISTS parking_sessions (
  id text PRIMARY KEY, slot_id text NOT NULL REFERENCES parking_slots(id),
  status text NOT NULL, data jsonb NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS one_active_session_per_slot ON parking_sessions(slot_id) WHERE status = 'active';
CREATE TABLE IF NOT EXISTS parking_payments (
  id text PRIMARY KEY, ticket_id text NOT NULL REFERENCES parking_sessions(id), data jsonb NOT NULL
);
CREATE TABLE IF NOT EXISTS parking_staff (id text PRIMARY KEY, data jsonb NOT NULL);
CREATE TABLE IF NOT EXISTS parking_audit (
  id text PRIMARY KEY, at bigint NOT NULL, data jsonb NOT NULL
);
CREATE TABLE IF NOT EXISTS parking_auth (
  token_hash text PRIMARY KEY, role text NOT NULL CHECK(role IN ('admin','attendant')),
  actor text NOT NULL, expires_at bigint NOT NULL, created_at bigint NOT NULL
);
CREATE TABLE IF NOT EXISTS parking_requests (
  device text NOT NULL, id text NOT NULL, command text NOT NULL, args_hash text NOT NULL,
  result jsonb, at bigint NOT NULL, PRIMARY KEY(device,id)
);
CREATE TABLE IF NOT EXISTS parking_rate_limits (
  key text PRIMARY KEY, count integer NOT NULL, reset_at bigint NOT NULL
);
