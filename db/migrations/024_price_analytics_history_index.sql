BEGIN;

-- Price Analytics reads one service at a time. The existing series/time
-- uniqueness index cannot narrow a service-wide history query.
CREATE INDEX IF NOT EXISTS verified_price_observations_service_series_time_idx
  ON verified_price_observations(service_slug,history_series_id,provider_verified_at,id)
  WHERE history_series_id IS NOT NULL;

COMMIT;
