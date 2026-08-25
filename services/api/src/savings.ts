import { pool } from "./db.js";

/**
 * Promote elapsed ESTIMATED savings periods to VERIFIED.
 *
 * Verification requires:
 * - the estimated period has fully elapsed;
 * - the subscription is still PAUSED or CANCELLED;
 * - the current inactive state began no later than the estimated period;
 * - no VERIFIED event already exists for the action.
 *
 * The ESTIMATED row is intentionally retained as ledger history.
 */
export async function reconcileSavingsEvents() {
  const result = await pool.query(`
    INSERT INTO savings_events (
      user_id,
      subscription_id,
      action_id,
      amount_minor,
      currency,
      kind,
      period_start,
      period_end
    )
    SELECT
      e.user_id,
      e.subscription_id,
      e.action_id,
      e.amount_minor,
      e.currency,
      'VERIFIED',
      e.period_start,
      e.period_end
    FROM savings_events e
    JOIN subscriptions s
      ON s.id = e.subscription_id
     AND s.user_id = e.user_id
    WHERE e.kind = 'ESTIMATED'
      AND e.action_id IS NOT NULL
      AND e.period_start IS NOT NULL
      AND e.period_end IS NOT NULL

      -- The entire avoided billing period must have elapsed.
      AND e.period_end < CURRENT_DATE

      -- It must still be inactive.
      AND s.status IN ('PAUSED', 'CANCELLED')

      -- A later reactivation/re-pause must not verify an older estimate.
      AND s.status_effective_date IS NOT NULL
      AND s.status_effective_date::date <= e.period_start

      AND NOT EXISTS (
        SELECT 1
        FROM savings_events verified
        WHERE verified.action_id = e.action_id
          AND verified.kind = 'VERIFIED'
      )

    ON CONFLICT (action_id, kind)
    WHERE action_id IS NOT NULL
    DO NOTHING

    RETURNING id
  `);

  return {
    verified: result.rowCount ?? 0
  };
}
