-- A status-history row must represent a real transition.
-- ACTIVE -> ACTIVE, PAUSED -> PAUSED, etc. are invalid.

ALTER TABLE subscription_status_history
  DROP CONSTRAINT IF EXISTS
    subscription_status_history_real_transition_check;

ALTER TABLE subscription_status_history
  ADD CONSTRAINT
    subscription_status_history_real_transition_check
  CHECK (previous_status <> new_status);
