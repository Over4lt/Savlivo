CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE savlivo_plan AS ENUM ('VIEWER', 'MANUAL', 'PREMIUM');
CREATE TYPE subscription_status AS ENUM ('ACTIVE', 'PAUSED', 'CANCELLED', 'UNKNOWN');
CREATE TYPE action_type AS ENUM ('PAUSE', 'CANCEL', 'REACTIVATE');
CREATE TYPE execution_type AS ENUM ('DIRECT', 'PROVIDER_REDIRECT', 'GUIDED', 'UNSUPPORTED');
CREATE TYPE action_status AS ENUM (
  'REQUESTED',
  'AWAITING_CONFIRMATION',
  'AWAITING_USER_ACTION',
  'SCHEDULED',
  'EXECUTING',
  'COMPLETED',
  'FAILED',
  'CANCELLED'
);

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  country_code CHAR(2),
  currency CHAR(3) DEFAULT 'USD',
  timezone TEXT DEFAULT 'UTC',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE entitlements (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  plan savlivo_plan NOT NULL DEFAULT 'VIEWER',
  platform TEXT,
  external_product_id TEXT,
  external_transaction_id TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  expires_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE billing_providers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  provider_type TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  service_id UUID NOT NULL REFERENCES services(id),
  billing_provider_id UUID NOT NULL REFERENCES billing_providers(id),
  status subscription_status NOT NULL DEFAULT 'UNKNOWN',
  plan_name TEXT,
  monthly_price_minor INTEGER CHECK (monthly_price_minor IS NULL OR monthly_price_minor >= 0),
  currency CHAR(3),
  renewal_date DATE,
  discovered_via TEXT NOT NULL DEFAULT 'manual',
  external_reference TEXT,
  last_verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX subscriptions_user_idx ON subscriptions(user_id);
CREATE INDEX subscriptions_renewal_idx ON subscriptions(renewal_date);

CREATE TABLE subscription_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id UUID NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action action_type NOT NULL,
  execution execution_type NOT NULL,
  status action_status NOT NULL DEFAULT 'REQUESTED',
  provider_slug TEXT NOT NULL,
  requires_confirmation BOOLEAN NOT NULL DEFAULT TRUE,
  redirect_url TEXT,
  scheduled_for TIMESTAMPTZ,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  confirmed_at TIMESTAMPTZ,
  executed_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  failure_code TEXT,
  failure_message TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX subscription_actions_user_idx ON subscription_actions(user_id, requested_at DESC);
CREATE INDEX subscription_actions_subscription_idx ON subscription_actions(subscription_id, requested_at DESC);

CREATE TABLE autopilot_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subscription_id UUID REFERENCES subscriptions(id) ON DELETE CASCADE,
  rule_type TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  conditions JSONB NOT NULL,
  action action_type NOT NULL,
  approval_mode TEXT NOT NULL CHECK (approval_mode IN ('ALWAYS_APPROVE', 'ASK', 'AUTO_WHEN_SUPPORTED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE savings_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subscription_id UUID REFERENCES subscriptions(id) ON DELETE SET NULL,
  action_id UUID REFERENCES subscription_actions(id) ON DELETE SET NULL,
  amount_minor INTEGER NOT NULL CHECK (amount_minor >= 0),
  currency CHAR(3) NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('ESTIMATED', 'VERIFIED')),
  period_start DATE,
  period_end DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO services (slug, name) VALUES
  ('netflix', 'Netflix'),
  ('disney-plus', 'Disney+'),
  ('max', 'Max'),
  ('prime-video', 'Prime Video'),
  ('amazon-prime', 'Amazon Prime'),
  ('apple-tv-plus', 'Apple TV+'),
  ('youtube-premium', 'YouTube Premium'),
  ('hulu', 'Hulu'),
  ('paramount-plus', 'Paramount+'),
  ('peacock', 'Peacock'),
  ('crunchyroll', 'Crunchyroll'),

  ('spotify', 'Spotify'),
  ('apple-music', 'Apple Music'),
  ('amazon-music-unlimited', 'Amazon Music Unlimited'),
  ('tidal', 'TIDAL'),
  ('audible', 'Audible'),

  ('xbox-game-pass', 'Xbox Game Pass'),
  ('playstation-plus', 'PlayStation Plus'),
  ('ea-play', 'EA Play'),
  ('ubisoft-plus', 'Ubisoft+'),
  ('geforce-now', 'GeForce NOW'),

  ('chatgpt', 'ChatGPT'),
  ('claude', 'Claude'),
  ('microsoft-365', 'Microsoft 365'),
  ('adobe-creative-cloud', 'Adobe Creative Cloud'),
  ('canva', 'Canva'),
  ('dropbox', 'Dropbox'),
  ('google-one', 'Google One'),
  ('icloud-plus', 'iCloud+'),

  ('strava', 'Strava'),
  ('calm', 'Calm'),
  ('headspace', 'Headspace')
ON CONFLICT (slug)
DO UPDATE SET
  name = EXCLUDED.name;

INSERT INTO billing_providers (slug, name, provider_type) VALUES
  ('direct', 'Direct billing', 'DIRECT'),
  ('apple', 'Apple', 'PLATFORM'),
  ('google-play', 'Google Play', 'PLATFORM'),
  ('amazon', 'Amazon', 'PLATFORM'),
  ('carrier', 'Carrier / TV provider', 'PARTNER')
ON CONFLICT DO NOTHING;

-- Persisted provider pricing that has passed Savlivo's
-- verification boundary. Ordinary single-source observations
-- must not be stored here.
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
        'registry',
        'multi-source',
        'authoritative-provider'
      )
    ),
  source_count INTEGER NOT NULL DEFAULT 1
    CHECK (source_count >= 1),
  verified_by_agreement BOOLEAN NOT NULL DEFAULT FALSE,
  verified_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

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
