CREATE TABLE IF NOT EXISTS verified_provider_prices (
  service_slug TEXT NOT NULL,
  plan_slug TEXT NOT NULL,
  plan_name TEXT NOT NULL,
  billing_provider_slug TEXT NOT NULL,
  country_code CHAR(2) NOT NULL,
  currency CHAR(3) NOT NULL,

  monthly_price_minor INTEGER NOT NULL
    CHECK (monthly_price_minor > 0),

  source TEXT NOT NULL,
  source_url TEXT NOT NULL,

  verification TEXT NOT NULL
    CHECK (
      verification IN (
        'multi-source',
        'registry'
      )
    ),

  source_count INTEGER NOT NULL DEFAULT 1
    CHECK (source_count >= 1),

  verified_by_agreement BOOLEAN NOT NULL DEFAULT FALSE,

  verified_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_checked_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  PRIMARY KEY (
    service_slug,
    plan_slug,
    billing_provider_slug,
    country_code,
    currency
  )
);

CREATE INDEX IF NOT EXISTS
  verified_provider_prices_country_idx
ON verified_provider_prices (
  country_code,
  currency
);
