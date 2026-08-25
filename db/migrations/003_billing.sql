CREATE TABLE IF NOT EXISTS purchase_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN ('IOS', 'ANDROID')),
  product_id TEXT NOT NULL,
  external_transaction_id TEXT NOT NULL,
  valid BOOLEAN NOT NULL,
  expires_at TIMESTAMPTZ,
  raw_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS purchase_events_platform_tx_idx
ON purchase_events(platform, external_transaction_id);
