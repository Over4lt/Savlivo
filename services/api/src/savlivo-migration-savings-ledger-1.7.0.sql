-- Prevent duplicate savings rows for the same completed action/kind.
--
-- An action can create at most one ESTIMATED and one VERIFIED row.
CREATE UNIQUE INDEX IF NOT EXISTS
  savings_events_action_kind_idx
ON savings_events (action_id, kind)
WHERE action_id IS NOT NULL;
