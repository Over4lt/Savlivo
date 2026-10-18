BEGIN;

-- Existing observations remain unchanged and unlinked. New series events are
-- written atomically by the authoritative Verified persistence boundary.
ALTER TABLE verified_provider_prices
  ADD COLUMN IF NOT EXISTS history_series_id TEXT;

ALTER TABLE verified_price_observations
  ADD COLUMN IF NOT EXISTS history_series_id TEXT,
  ADD COLUMN IF NOT EXISTS plan_identity TEXT,
  ADD COLUMN IF NOT EXISTS billing_interval TEXT,
  ADD COLUMN IF NOT EXISTS history_event_kind TEXT,
  ADD COLUMN IF NOT EXISTS provider_effective_at TIMESTAMPTZ;

ALTER TABLE verified_provider_prices
  ADD CONSTRAINT verified_provider_prices_history_series_format
  CHECK (history_series_id IS NULL OR history_series_id ~ '^vh:[0-9a-f]{64}$');

ALTER TABLE verified_price_observations
  ADD CONSTRAINT verified_price_observations_series_event_valid
  CHECK (history_series_id IS NULL OR
    (history_series_id ~ '^vh:[0-9a-f]{64}$' AND plan_identity IS NOT NULL
     AND billing_interval = 'MONTHLY_RECURRING'
     AND history_event_kind IN ('BASELINE','BOOTSTRAP_BASELINE','PRICE_CHANGE')));

CREATE UNIQUE INDEX IF NOT EXISTS verified_price_observations_series_time_unique
  ON verified_price_observations(history_series_id,provider_verified_at)
  WHERE history_series_id IS NOT NULL;

COMMIT;
