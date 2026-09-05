ALTER TABLE users
  ADD COLUMN IF NOT EXISTS deletion_requested_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deletion_scheduled_for TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS users_deletion_scheduled_idx
  ON users (deletion_scheduled_for)
  WHERE deletion_scheduled_for IS NOT NULL;
