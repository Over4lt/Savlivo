-- One-time, operator-approved production retirement. Run only after the
-- adapter change is deployed and the exact preflight row still matches.
-- psql -v ON_ERROR_STOP=1 -f services/api/scripts/retire-disney-be-ads.sql
BEGIN;
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '30s';

CREATE TABLE verified_provider_price_retirements (
  retirement_key text PRIMARY KEY,
  retired_at timestamptz NOT NULL,
  reason text NOT NULL,
  original_row jsonb NOT NULL CHECK (jsonb_typeof(original_row) = 'object')
);

DO $retire$
DECLARE
  old_row verified_provider_prices%ROWTYPE;
  plan_count integer;
  deleted_count integer;
  v3_count integer;
BEGIN
  -- Ordinary Verified writes take the same service-market advisory lock.
  PERFORM pg_advisory_xact_lock(hashtext('disney-plus'),hashtext('BE'));
  PERFORM 1 FROM verified_provider_prices
    WHERE service_slug = 'disney-plus' AND country_code = 'BE' FOR UPDATE;

  SELECT count(*) INTO plan_count FROM verified_provider_prices
    WHERE service_slug = 'disney-plus' AND country_code = 'BE'
      AND plan_slug = 'standard-with-ads';
  IF plan_count <> 1 THEN RAISE EXCEPTION 'BE_ADS_ROW_COUNT_CHANGED: %',plan_count; END IF;

  SELECT * INTO old_row FROM verified_provider_prices
    WHERE service_slug = 'disney-plus'
      AND plan_slug = 'standard-with-ads'
      AND plan_name = 'Standard with Ads'
      AND plan_identity = 'catalog:disney-plus:be:standard-with-ads:direct:eur'
      AND history_series_id IS NULL
      AND billing_provider_slug = 'direct'
      AND country_code = 'BE'
      AND currency = 'EUR'
      AND monthly_price_minor = 699
      AND source = 'official-provider-adapter:disney-plus'
      AND source_url = 'https://www.disneyplus.com/nl-be'
      AND verification = 'authoritative-provider'
      AND source_count = 2
      AND verified_by_agreement = false
      AND verified_at = '2026-08-30T23:49:28.776834Z'::timestamptz
      AND last_checked_at = '2026-09-23T09:25:08.743517Z'::timestamptz;
  IF NOT FOUND THEN RAISE EXCEPTION 'BE_ADS_ROW_IDENTITY_CHANGED'; END IF;

  SELECT count(*) INTO v3_count FROM verified_provider_prices
    WHERE service_slug = 'disney-plus' AND country_code = 'BE'
      AND billing_provider_slug = 'direct' AND currency = 'EUR'
      AND source = 'v3-truth' AND verification = 'authoritative-provider'
      AND ((plan_slug = 'disney-standard' AND monthly_price_minor = 1099)
        OR (plan_slug = 'disney-premium' AND monthly_price_minor = 1599));
  IF v3_count <> 2 THEN RAISE EXCEPTION 'BE_V3_CONTROLS_CHANGED: %',v3_count; END IF;

  INSERT INTO verified_provider_price_retirements
    (retirement_key,retired_at,reason,original_row)
  VALUES ('disney-plus:BE:standard-with-ads:direct:EUR:699',clock_timestamp(),
    'Operator withdrew disputed legacy adapter price; not current V3 price evidence',
    to_jsonb(old_row));

  DELETE FROM verified_provider_prices
    WHERE service_slug = old_row.service_slug
      AND plan_slug = old_row.plan_slug
      AND billing_provider_slug = old_row.billing_provider_slug
      AND country_code = old_row.country_code
      AND currency = old_row.currency
      AND monthly_price_minor = old_row.monthly_price_minor
      AND source = old_row.source;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  IF deleted_count <> 1 THEN RAISE EXCEPTION 'BE_ADS_DELETE_COUNT_CHANGED: %',deleted_count; END IF;
END;
$retire$;

-- A rollback to older adapter code cannot recreate this one disputed plan.
-- Fresh V3 Truth for the same identity remains admissible.
ALTER TABLE verified_provider_prices
  ADD CONSTRAINT verified_provider_prices_disney_be_ads_adapter_retired
  CHECK (NOT (
    service_slug = 'disney-plus' AND country_code = 'BE'
    AND plan_slug = 'standard-with-ads' AND billing_provider_slug = 'direct'
    AND currency = 'EUR' AND source LIKE 'official-provider-adapter:%'
  ));
COMMIT;
