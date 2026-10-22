BEGIN;

-- A calculated Suggested total keeps its component sources and arithmetic
-- separate from the single source_url used by ordinary price observations.
ALTER TABLE suggested_provider_prices
  ADD COLUMN IF NOT EXISTS calculation JSONB
  CHECK (calculation IS NULL OR jsonb_typeof(calculation) = 'object');

ALTER TABLE suggested_provider_prices
  ADD COLUMN IF NOT EXISTS offer_scope TEXT
  CHECK (offer_scope IS NULL OR offer_scope IN ('COMPLETE_SUBSCRIPTION','CALCULATED_TOTAL'));

COMMIT;
