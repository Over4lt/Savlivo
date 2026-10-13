BEGIN;

ALTER TABLE verified_provider_prices
  ADD COLUMN IF NOT EXISTS plan_identity TEXT;

UPDATE verified_provider_prices
SET plan_identity = lower(concat(
  'catalog:', service_slug, ':', country_code, ':', plan_slug, ':',
  billing_provider_slug, ':', currency
))
WHERE plan_identity IS NULL;

ALTER TABLE verified_provider_prices
  ALTER COLUMN plan_identity SET NOT NULL;

CREATE INDEX IF NOT EXISTS verified_provider_prices_plan_identity_idx
ON verified_provider_prices(plan_identity,country_code,currency);

CREATE TABLE IF NOT EXISTS suggested_provider_prices (
  suggested_id TEXT PRIMARY KEY,
  origin_suggested_id TEXT,
  plan_identity TEXT NOT NULL,
  service_slug TEXT NOT NULL,
  plan_name TEXT NOT NULL,
  billing_provider_slug TEXT NOT NULL,
  country_code CHAR(2) NOT NULL,
  currency CHAR(3) NOT NULL,
  monthly_price_minor INTEGER NOT NULL CHECK(monthly_price_minor>0),
  payment_cadence TEXT NOT NULL CHECK(payment_cadence='MONTHLY_RECURRING'),
  provenance TEXT NOT NULL,
  source_url TEXT,
  researched_at TIMESTAMPTZ NOT NULL,
  warnings JSONB NOT NULL DEFAULT '[]'::jsonb CHECK(jsonb_typeof(warnings)='array'),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS suggested_provider_prices_active_scope_idx
ON suggested_provider_prices(plan_identity,billing_provider_slug,country_code,currency)
WHERE active;

CREATE INDEX IF NOT EXISTS suggested_provider_prices_market_idx
ON suggested_provider_prices(country_code,currency,service_slug);

COMMIT;
