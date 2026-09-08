BEGIN;
-- No roles, credentials or grants are seeded. Old sessions cannot authenticate without a credential.
ALTER TABLE admin_roles ADD COLUMN IF NOT EXISTS webauthn_user_id UUID NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE admin_roles ADD COLUMN IF NOT EXISTS enrollment_version UUID NOT NULL DEFAULT gen_random_uuid();
CREATE UNIQUE INDEX IF NOT EXISTS admin_roles_webauthn_user_idx ON admin_roles(webauthn_user_id);
CREATE TABLE IF NOT EXISTS admin_passkeys (
  id TEXT PRIMARY KEY CHECK(length(id) BETWEEN 1 AND 2048 AND id ~ '^[A-Za-z0-9_-]+$'),
  user_id UUID NOT NULL REFERENCES admin_roles(user_id) ON DELETE CASCADE,
  rp_id TEXT NOT NULL,
  public_key BYTEA NOT NULL CHECK(octet_length(public_key) BETWEEN 1 AND 4096),
  counter BIGINT NOT NULL CHECK(counter BETWEEN 0 AND 4294967295),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS admin_passkeys_user_idx ON admin_passkeys(user_id);
ALTER TABLE admin_sessions ADD COLUMN IF NOT EXISTS credential_id TEXT REFERENCES admin_passkeys(id) ON DELETE CASCADE;
ALTER TABLE admin_sessions ADD COLUMN IF NOT EXISTS enrollment_origin TEXT;
ALTER TABLE admin_sessions ADD COLUMN IF NOT EXISTS enrollment_only BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS admin_sessions_credential_idx ON admin_sessions(credential_id);
CREATE TABLE IF NOT EXISTS admin_passkey_challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  challenge TEXT NOT NULL UNIQUE,
  purpose TEXT NOT NULL CHECK(purpose IN ('registration','authentication')),
  user_id UUID REFERENCES admin_roles(user_id) ON DELETE CASCADE,
  authorizing_session_hash TEXT REFERENCES admin_sessions(token_hash) ON DELETE CASCADE,
  rp_id TEXT NOT NULL, origin TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  CHECK((purpose='registration' AND user_id IS NOT NULL) OR (purpose='authentication' AND user_id IS NULL))
);
ALTER TABLE admin_passkey_challenges ADD COLUMN IF NOT EXISTS enrollment_version UUID;
CREATE INDEX IF NOT EXISTS admin_passkey_challenges_expiry_idx ON admin_passkey_challenges(expires_at);
ALTER TABLE admin_audit DROP CONSTRAINT IF EXISTS admin_audit_action_check;
ALTER TABLE admin_audit ADD CONSTRAINT admin_audit_action_check CHECK(action IN
 ('session_created','session_closed','dashboard_read','retention','bootstrap_issued','passkey_registered','sessions_revoked','role_granted','credential_revoked'));
-- Key replacement revokes sessions; ordinary signature-counter updates do not.
CREATE OR REPLACE FUNCTION revoke_replaced_admin_passkey() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.public_key IS DISTINCT FROM NEW.public_key OR OLD.user_id IS DISTINCT FROM NEW.user_id OR OLD.rp_id IS DISTINCT FROM NEW.rp_id THEN
    DELETE FROM admin_sessions WHERE credential_id=OLD.id;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS admin_passkey_replacement ON admin_passkeys;
CREATE TRIGGER admin_passkey_replacement BEFORE UPDATE ON admin_passkeys FOR EACH ROW EXECUTE FUNCTION revoke_replaced_admin_passkey();
COMMIT;
