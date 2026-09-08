-- Additive and disabled until explicit application configuration/privacy review.
BEGIN;
CREATE TABLE IF NOT EXISTS analytics_actors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS analytics_events (
  id BIGSERIAL PRIMARY KEY,
  actor_id UUID NOT NULL REFERENCES analytics_actors(id) ON DELETE CASCADE,
  event TEXT NOT NULL CHECK (event IN ('app_active','catalog_search','catalog_result_selected',
    'catalog_no_result','manual_service_fallback_selected','category_filter_used',
    'subscription_add_started','subscription_add_cancelled','ai_add_form_opened',
    'ai_add_cancelled','management_flow_opened','management_browser_returned','report_generated')),
  market CHAR(2) NOT NULL, service TEXT, category TEXT,
  platform TEXT NOT NULL CHECK (platform IN ('ios','android','web')),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(), expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS analytics_events_time_market_idx ON analytics_events(occurred_at,market,event);
CREATE INDEX IF NOT EXISTS analytics_events_actor_idx ON analytics_events(actor_id);
CREATE INDEX IF NOT EXISTS analytics_events_expiry_idx ON analytics_events(expires_at);
CREATE TABLE IF NOT EXISTS admin_roles (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role = 'analytics_reader')
);
CREATE TABLE IF NOT EXISTS admin_sessions (
  token_hash TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES admin_roles(user_id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS admin_sessions_expiry_idx ON admin_sessions(expires_at);
CREATE TABLE IF NOT EXISTS admin_audit (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL CHECK (action IN ('session_created','session_closed','dashboard_read','retention')),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(), expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS admin_audit_expiry_idx ON admin_audit(expires_at);
COMMIT;
