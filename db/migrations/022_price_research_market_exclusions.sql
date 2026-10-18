BEGIN;

CREATE TABLE IF NOT EXISTS price_research_market_exclusions (
  service_id TEXT NOT NULL,
  market_code TEXT NOT NULL,
  reason TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID,
  PRIMARY KEY (service_id,market_code),
  CHECK (length(service_id) BETWEEN 1 AND 160),
  CHECK (market_code ~ '^[A-Z]{2}$'),
  CHECK (reason IS NULL OR reason IN ('SERVICE_NOT_AVAILABLE','TEMPORARILY_EXCLUDED','OTHER'))
);

CREATE INDEX IF NOT EXISTS price_research_market_exclusions_market_idx
  ON price_research_market_exclusions (market_code,service_id);

ALTER TABLE admin_audit DROP CONSTRAINT IF EXISTS admin_audit_action_check;
ALTER TABLE admin_audit ADD CONSTRAINT admin_audit_action_check CHECK(action IN
 ('session_created','session_closed','dashboard_read','retention','bootstrap_issued','passkey_registered','sessions_revoked','role_granted','credential_revoked','research_link_changed','market_exclusion_changed'));

COMMIT;
