import { privateDataPool as pool } from "./private-data-db.js";
import { expireAnalytics, retentionDays } from "./analytics.js";
import { countryCurrencies } from "../../../packages/contracts/src/markets.js";
import { serviceCatalog } from "../../../packages/contracts/src/catalog.js";

export async function observeVerifiedPrices() {
  const client=await pool.connect();
  try {
    await client.query("BEGIN");
    // Independent from the resolver/persistence transaction. A failed observation cannot roll back a price.
    const locked=await client.query("SELECT pg_try_advisory_xact_lock(8130914) AS acquired");
    if(!locked.rows[0].acquired){await client.query("ROLLBACK");return;}
    await client.query(`INSERT INTO verified_price_observations(service_slug,plan_slug,plan_name,
      billing_provider_slug,country_code,currency,monthly_price_minor,source,source_url,
      verification,source_count,verified_by_agreement,provider_verified_at)
      SELECT p.service_slug,p.plan_slug,p.plan_name,p.billing_provider_slug,p.country_code,p.currency,
      p.monthly_price_minor,p.source,p.source_url,p.verification,p.source_count,p.verified_by_agreement,p.verified_at
      FROM verified_provider_prices p
      JOIN jsonb_each_text($1::jsonb) market ON market.key=p.country_code AND market.value=p.currency
      LEFT JOIN LATERAL (SELECT h.monthly_price_minor,h.plan_name,h.verification FROM verified_price_observations h
        WHERE h.service_slug=p.service_slug AND h.plan_slug=p.plan_slug AND h.billing_provider_slug=p.billing_provider_slug
        AND h.country_code=p.country_code AND h.currency=p.currency ORDER BY h.id DESC LIMIT 1) previous ON true
      WHERE p.service_slug=ANY($2::text[]) AND p.monthly_price_minor>0
      AND (p.verification='authoritative-provider' OR (p.verification='multi-source' AND p.source_count>=2 AND p.verified_by_agreement))
      AND (previous.monthly_price_minor IS DISTINCT FROM p.monthly_price_minor OR previous.plan_name IS DISTINCT FROM p.plan_name
        OR previous.verification IS DISTINCT FROM p.verification)`,[JSON.stringify(countryCurrencies),serviceCatalog.map(s=>s.slug)]);
    await client.query("COMMIT");
  } catch(error){await client.query("ROLLBACK");throw error;}finally{client.release();}
}
let running=false;
export async function maintainPrivateData() {
  if(running)return;
  running=true;
  try {
    if(process.env.ANALYTICS_MAINTENANCE_ENABLED==="true") {
      const days=retentionDays(process.env.ADMIN_AUDIT_RETENTION_DAYS,30,365);
      if(days) {
        try {await pool.query("INSERT INTO admin_audit(action,expires_at) VALUES('retention',now()+$1*interval '1 day')",[days]);}
        catch {console.warn("Retention audit unavailable; expiry cleanup will still be attempted.");}
      }
      await expireAnalytics();
    }
  } catch {console.warn("Private data retention unavailable; operator attention required.");}
  try {if(process.env.PRICING_HISTORY_ENABLED==="true")await observeVerifiedPrices();}
  catch {console.warn("Verified price observation unavailable; current pricing remains unchanged.");}
  finally {running=false;}
}
