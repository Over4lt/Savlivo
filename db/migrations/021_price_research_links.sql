BEGIN;

CREATE TABLE IF NOT EXISTS price_research_links (
  id UUID PRIMARY KEY,
  service_id TEXT NOT NULL,
  url TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('DIRECT_SOURCE','INTERACTIVE_ROUTE')),
  market_scope TEXT NOT NULL CHECK (market_scope IN ('GLOBAL','MARKET_SPECIFIC')),
  market_code TEXT,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ,
  last_result TEXT,
  CHECK ((market_scope='GLOBAL' AND market_code IS NULL) OR
         (market_scope='MARKET_SPECIFIC' AND market_code ~ '^[A-Z]{2}$')),
  CHECK (length(service_id) BETWEEN 1 AND 160 AND length(url) BETWEEN 1 AND 2048)
);

CREATE UNIQUE INDEX IF NOT EXISTS price_research_links_unique_route
ON price_research_links(service_id,url,market_scope,coalesce(market_code,''));

CREATE INDEX IF NOT EXISTS price_research_links_service_enabled
ON price_research_links(service_id,enabled,market_scope,market_code);

ALTER TABLE admin_audit DROP CONSTRAINT IF EXISTS admin_audit_action_check;
ALTER TABLE admin_audit ADD CONSTRAINT admin_audit_action_check CHECK(action IN
 ('session_created','session_closed','dashboard_read','retention','bootstrap_issued','passkey_registered','sessions_revoked','role_granted','credential_revoked','research_link_changed'));

COMMIT;
