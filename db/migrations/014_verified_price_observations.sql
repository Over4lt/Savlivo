BEGIN;
-- Public provider-price observations, never user subscription spending. No trigger on pricing persistence.
CREATE TABLE IF NOT EXISTS verified_price_observations (
  id BIGSERIAL PRIMARY KEY, observed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  service_slug TEXT NOT NULL, plan_slug TEXT NOT NULL, plan_name TEXT NOT NULL,
  billing_provider_slug TEXT NOT NULL, country_code CHAR(2) NOT NULL, currency CHAR(3) NOT NULL,
  monthly_price_minor INTEGER NOT NULL CHECK(monthly_price_minor>0),
  source TEXT NOT NULL, source_url TEXT NOT NULL,
  verification TEXT NOT NULL CHECK(verification IN ('authoritative-provider','multi-source')),
  source_count INTEGER NOT NULL CHECK(source_count>0),
  verified_by_agreement BOOLEAN NOT NULL,
  provider_verified_at TIMESTAMPTZ NOT NULL,
  CHECK(verification='authoritative-provider' OR (source_count>=2 AND verified_by_agreement))
);
CREATE INDEX IF NOT EXISTS verified_price_observations_identity_idx ON verified_price_observations
  (service_slug,plan_slug,billing_provider_slug,country_code,currency,id DESC);
COMMIT;
