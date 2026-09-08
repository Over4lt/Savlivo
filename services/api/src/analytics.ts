import { parseAnalyticsEvent, type AnalyticsEvent } from "../../../packages/contracts/src/analytics.js";
import { privateDataPool as pool } from "./private-data-db.js";

export function retentionDays(value: string | undefined, min: number, max: number): number | null {
  if (!value || !/^\d+$/.test(value)) return null;
  const days = Number(value);
  return days >= min && days <= max ? days : null;
}
export function collectionPolicy(env: NodeJS.ProcessEnv = process.env): number | null {
  return env.ANALYTICS_COLLECTION_ENABLED === "true" && env.ANALYTICS_PRIVACY_REVIEWED === "true" && env.ANALYTICS_MAINTENANCE_ENABLED === "true"
    ? retentionDays(env.ANALYTICS_RAW_RETENTION_DAYS, 7, 90) : null;
}
// Bounded, non-blocking, one write at a time. Analytics failure never rejects a product action.
export function createEventRecorder(write: (userId: string, event: AnalyticsEvent, days: number) => Promise<void>, policy = collectionPolicy) {
  let pending = 0;
  let chain = Promise.resolve();
  return (userId: string, input: unknown): boolean => {
    const days = policy();
    if (!days || pending >= 128) return false;
    let event: AnalyticsEvent;
    try { event = parseAnalyticsEvent(input); } catch { return false; }
    pending++;
    chain = chain.then(() => write(userId, event, days)).catch(() => undefined).finally(() => {pending--;});
    return true;
  };
}
export const recordAnalytics = createEventRecorder(async (userId, event, days) => {
  // One statement prevents orphaned events; account deletion blocks/cascades association.
  await pool.query({text: `WITH actor AS (
    INSERT INTO analytics_actors(user_id) SELECT id FROM users WHERE id=$1 AND deletion_scheduled_for IS NULL
    ON CONFLICT(user_id) DO UPDATE SET user_id=EXCLUDED.user_id RETURNING id
  ) INSERT INTO analytics_events(actor_id,event,market,service,category,platform,expires_at)
    SELECT id,$2,$3,$4,$5,$6,now()+$7*interval '1 day' FROM actor`,
    values: [userId,event.event,event.market,event.service ?? null,event.category ?? null,event.platform,days], query_timeout: 1500} as import("pg").QueryConfig & {query_timeout: number});
});

// Run independently after migration, including when collection has subsequently been disabled.
export async function expireAnalytics() {
  await pool.query("DELETE FROM analytics_events WHERE id IN (SELECT id FROM analytics_events WHERE expires_at <= now() LIMIT 5000)");
  await pool.query("DELETE FROM admin_sessions WHERE token_hash IN (SELECT token_hash FROM admin_sessions WHERE expires_at <= now() LIMIT 5000)");
  await pool.query("DELETE FROM admin_audit WHERE id IN (SELECT id FROM admin_audit WHERE expires_at <= now() LIMIT 5000)");
  await pool.query("DELETE FROM analytics_actors WHERE id IN (SELECT a.id FROM analytics_actors a WHERE NOT EXISTS (SELECT 1 FROM analytics_events e WHERE e.actor_id=a.id) LIMIT 5000)");
}
