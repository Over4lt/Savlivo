BEGIN;

-- A semantic series can have only one as-of initialization, even when two
-- attempts use different original verification timestamps.
CREATE UNIQUE INDEX IF NOT EXISTS verified_price_observations_one_bootstrap_per_series
  ON verified_price_observations(history_series_id)
  WHERE history_series_id IS NOT NULL AND history_event_kind='BOOTSTRAP_BASELINE';

-- Price Analytics places as-of bootstraps at their recording time while
-- ordinary Verified events retain their verification-time position.
CREATE INDEX IF NOT EXISTS verified_price_observations_service_series_event_time_idx
  ON verified_price_observations(service_slug,history_series_id,
    (CASE WHEN history_event_kind='BOOTSTRAP_BASELINE' THEN observed_at ELSE provider_verified_at END),id)
  WHERE history_series_id IS NOT NULL;

COMMIT;
