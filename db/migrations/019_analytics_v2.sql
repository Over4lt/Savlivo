-- Forward-only Analytics v2. No activation, historical backfill or operational changes.
BEGIN;
CREATE TABLE IF NOT EXISTS analytics_v2_actors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS analytics_v2_signals (
  id UUID PRIMARY KEY,
  actor_id UUID NOT NULL REFERENCES analytics_v2_actors(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('new_account','service_added','ai_success','ai_failure','ai_fallback','no_result','plan_transition')),
  service TEXT REFERENCES services(slug),
  old_plan TEXT CHECK (old_plan IN ('VIEWER','MANUAL','PREMIUM')),
  new_plan TEXT CHECK (new_plan IN ('VIEWER','MANUAL','PREMIUM')),
  occurred_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  CHECK (expires_at > occurred_at),
  CHECK ((kind='service_added') = (service IS NOT NULL)),
  CHECK ((kind='plan_transition' AND old_plan IS NOT NULL AND new_plan IS NOT NULL AND old_plan<>new_plan)
    OR (kind<>'plan_transition' AND old_plan IS NULL AND new_plan IS NULL))
);
CREATE INDEX IF NOT EXISTS analytics_v2_signals_expiry_idx ON analytics_v2_signals(expires_at);
CREATE INDEX IF NOT EXISTS analytics_v2_signals_period_idx ON analytics_v2_signals(occurred_at,kind);
CREATE INDEX IF NOT EXISTS analytics_v2_signals_actor_idx ON analytics_v2_signals(actor_id);
CREATE TABLE IF NOT EXISTS analytics_v2_snapshots (
  day DATE PRIMARY KEY,
  observed_at TIMESTAMPTZ NOT NULL,
  total BIGINT NOT NULL CHECK(total>=0),
  preview BIGINT NOT NULL CHECK(preview>=0),
  manual BIGINT NOT NULL CHECK(manual>=0),
  premium BIGINT NOT NULL CHECK(premium>=0),
  invalid BIGINT NOT NULL CHECK(invalid>=0),
  expires_at TIMESTAMPTZ NOT NULL,
  CHECK (total=preview+manual+premium+invalid),
  CHECK (day=(observed_at AT TIME ZONE 'UTC')::date)
);
CREATE INDEX IF NOT EXISTS analytics_v2_snapshots_expiry_idx ON analytics_v2_snapshots(expires_at);
CREATE TABLE IF NOT EXISTS analytics_v2_flows (
  day DATE NOT NULL,
  metric TEXT NOT NULL CHECK(metric IN ('new_account','service_added','ai_success','ai_failure','ai_fallback','no_result',
    'VIEWER_MANUAL','VIEWER_PREMIUM','MANUAL_PREMIUM','PREMIUM_MANUAL','MANUAL_VIEWER','PREMIUM_VIEWER')),
  count BIGINT NOT NULL CHECK(count>=0),
  expires_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY(day,metric)
);
CREATE INDEX IF NOT EXISTS analytics_v2_flows_expiry_idx ON analytics_v2_flows(expires_at);
-- Only released cells are persisted, never actor lists or an exact suppressed remainder.
CREATE TABLE IF NOT EXISTS analytics_v2_service_months (
  month DATE PRIMARY KEY CHECK (extract(day FROM month)=1),
  cells JSONB NOT NULL CHECK(jsonb_typeof(cells)='array'),
  finalized_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS analytics_v2_service_months_expiry_idx ON analytics_v2_service_months(expires_at);
COMMIT;
