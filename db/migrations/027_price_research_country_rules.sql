CREATE TABLE IF NOT EXISTS price_research_country_rules (
  service_id TEXT PRIMARY KEY,
  mode TEXT NOT NULL CHECK (mode IN ('OFFERED', 'NOT_OFFERED')),
  market_codes TEXT[] NOT NULL CHECK (cardinality(market_codes) BETWEEN 1 AND 46),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID NOT NULL
);
