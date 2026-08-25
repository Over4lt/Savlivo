-- Track the effective date of the subscription's current status.
-- Existing development databases may already have this column.
ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS status_effective_date DATE;

-- Preserve every real subscription status transition independently
-- from subscription_actions / Premium action features.
CREATE TABLE IF NOT EXISTS subscription_status_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  subscription_id UUID NOT NULL
    REFERENCES subscriptions(id) ON DELETE CASCADE,

  user_id UUID NOT NULL
    REFERENCES users(id) ON DELETE CASCADE,

  previous_status subscription_status NOT NULL,
  new_status subscription_status NOT NULL,

  effective_date DATE NOT NULL,

  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS subscription_status_history_subscription_idx
  ON subscription_status_history (
    subscription_id,
    effective_date,
    recorded_at
  );

CREATE INDEX IF NOT EXISTS subscription_status_history_user_idx
  ON subscription_status_history (
    user_id,
    effective_date
  );
