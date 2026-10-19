import { pool } from "./db.js";
import { createHash } from "node:crypto";
import type { AdapterPrice } from "./pricing-adapters.js";
import { catalogPlanIdentity } from "../../../packages/contracts/src/product-pricing.js";
import { serviceCatalog } from "../../../packages/contracts/src/catalog.js";
import { equivalentVerifiedPlan, semanticVerifiedAlias } from "./verified-price-reconciliation.mjs";

export const currentRow = (row: any) => ({
  planIdentity: row.plan_identity, historySeriesId: row.history_series_id ?? null,
  serviceSlug: row.service_slug, planSlug: row.plan_slug, planName: row.plan_name,
  billingProviderSlug: row.billing_provider_slug, countryCode: row.country_code,
  currency: row.currency, monthlyPriceMinor: row.monthly_price_minor,
  source: row.source, sourceUrl: row.source_url, verification: row.verification,
  sourceCount: row.source_count, verifiedByAgreement: row.verified_by_agreement,
  verifiedAt: row.verified_at_exact ?? new Date(row.verified_at).toISOString(),
  lastCheckedAt: row.last_checked_at_exact ?? new Date(row.last_checked_at).toISOString()
});

type HistoryRow = ReturnType<typeof currentRow>;
const strong = (row: HistoryRow) => row.verification === "authoritative-provider" ||
  row.verification === "multi-source" && row.verifiedByAgreement === true && row.sourceCount >= 2;
export const verifiedHistorySeriesId = (row: HistoryRow, restartAt?: string) => "vh:" + createHash("sha256").update(JSON.stringify([
  row.serviceSlug,row.countryCode,row.billingProviderSlug,row.currency,"MONTHLY_RECURRING",
  row.planIdentity ?? catalogPlanIdentity(row),row.planSlug,restartAt??null
])).digest("hex");

async function latestHistory(client: any, id: string) {
  const result = await client.query(`SELECT monthly_price_minor,provider_verified_at
    FROM verified_price_observations WHERE history_series_id=$1
    ORDER BY provider_verified_at DESC LIMIT 1`,[id]);
  return result.rows[0] ?? null;
}

async function appendHistory(client: any, row: HistoryRow, id: string,
  kind: "BASELINE" | "BOOTSTRAP_BASELINE" | "PRICE_CHANGE") {
  const args=[id,kind,row.planIdentity ?? catalogPlanIdentity(row),row.serviceSlug,row.planSlug,
    row.planName,row.billingProviderSlug,row.countryCode,row.currency,row.monthlyPriceMinor,
    row.source,row.sourceUrl,row.verification,row.sourceCount,row.verifiedByAgreement,row.verifiedAt];
  const inserted=await client.query(`INSERT INTO verified_price_observations
    (history_series_id,history_event_kind,plan_identity,billing_interval,
     service_slug,plan_slug,plan_name,billing_provider_slug,country_code,currency,
     monthly_price_minor,source,source_url,verification,source_count,verified_by_agreement,provider_verified_at)
    VALUES($1,$2,$3,'MONTHLY_RECURRING',$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16::timestamptz)
    ON CONFLICT (history_series_id,provider_verified_at) WHERE history_series_id IS NOT NULL DO NOTHING
    RETURNING id`,args);
  if(inserted.rowCount)return;
  const existing=await client.query(`SELECT monthly_price_minor,currency,history_event_kind
    FROM verified_price_observations WHERE history_series_id=$1 AND provider_verified_at=$2::timestamptz`,
    [id,row.verifiedAt]);
  if(existing.rows.length!==1 || existing.rows[0].monthly_price_minor!==row.monthlyPriceMinor ||
    existing.rows[0].currency!==row.currency || existing.rows[0].history_event_kind!==kind)
    throw new Error("VERIFIED_HISTORY_EVENT_CONFLICT");
}

// A pre-migration dual-current alias can have an older, separate price. Keep
// that original evidence without assigning it to a series by guesswork.
async function preserveLegacyAlias(client: any, row: HistoryRow) {
  await client.query(`INSERT INTO verified_price_observations
    (service_slug,plan_slug,plan_name,billing_provider_slug,country_code,currency,
     monthly_price_minor,source,source_url,verification,source_count,verified_by_agreement,provider_verified_at)
    SELECT $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::timestamptz
    WHERE NOT EXISTS (SELECT 1 FROM verified_price_observations WHERE
      service_slug=$1 AND plan_slug=$2 AND billing_provider_slug=$4 AND country_code=$5
      AND currency=$6 AND monthly_price_minor=$7 AND verification=$10 AND provider_verified_at=$13::timestamptz)`,
    [row.serviceSlug,row.planSlug,row.planName,row.billingProviderSlug,row.countryCode,row.currency,
      row.monthlyPriceMinor,row.source,row.sourceUrl,row.verification,row.sourceCount,row.verifiedByAgreement,row.verifiedAt]);
}

const acceptedVerifiedPrices = (items: AdapterPrice[]) => items.filter(
    (item) =>
      item.priceType === "exact" &&
      (
        item.verification ===
          "authoritative-provider" ||
        (
          item.verification === "multi-source" &&
          item.verifiedByAgreement === true &&
          typeof item.sourceCount === "number" &&
          item.sourceCount >= 2
        )
      ) &&
      item.monthlyPriceMinor > 0
  );

async function persistVerifiedPriceInClient(item: AdapterPrice, client: any) {
    if(item.billingInterval && item.billingInterval!=="MONTHLY_RECURRING")
      throw new Error("VERIFIED_PRICE_BILLING_INTERVAL_UNSUPPORTED");
    const observedAt = Date.parse(item.updatedAt);
    if (!Number.isFinite(observedAt)) throw new Error("VERIFIED_PRICE_TIMESTAMP_INVALID");
    const serviceName = serviceCatalog.find(service => service.slug === item.serviceSlug)?.name ?? item.serviceName;
      // Every ordinary Verified write takes the service-market lock before
      // the narrower plan/currency lock. Reconciliation uses the same order.
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1),hashtext($2))", [item.serviceSlug,item.countryCode]);
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1),hashtext($2))", [item.serviceSlug,`${item.billingProviderSlug}:${item.countryCode}:${item.currency}`]);
      const scoped = await client.query(`SELECT *,verified_at::text AS verified_at_exact,
        last_checked_at::text AS last_checked_at_exact FROM verified_provider_prices WHERE service_slug=$1
        AND billing_provider_slug=$2 AND country_code=$3 AND currency=$4 FOR UPDATE`,
        [item.serviceSlug,item.billingProviderSlug,item.countryCode,item.currency]);
      const current: HistoryRow[] = scoped.rows.map(currentRow);
      const exact = current.find(row => row.planSlug === item.planSlug);
      const aliases = serviceName ? current.filter(row => equivalentVerifiedPlan(row,item,serviceName)) : [];
      if (serviceName && current.some(row => semanticVerifiedAlias(row,item,serviceName) && !equivalentVerifiedPlan(row,item,serviceName)))
        throw new Error("VERIFIED_PLAN_AUTHORITY_AMBIGUOUS");
      if (aliases.length > 1) throw new Error("VERIFIED_PLAN_EQUIVALENCE_AMBIGUOUS");
      const alias = aliases[0];
      if (alias && exact && Date.parse(alias.verifiedAt) >= Math.max(Date.parse(exact.verifiedAt),observedAt))
        throw new Error("VERIFIED_PLAN_FRESHNESS_AMBIGUOUS");
      if (alias && !exact && observedAt === Date.parse(alias.lastCheckedAt))
        throw new Error("VERIFIED_PLAN_FRESHNESS_AMBIGUOUS");
      if (current.some(row => row !== exact && row !== alias && serviceName && equivalentVerifiedPlan(row,item,serviceName)))
        throw new Error("VERIFIED_PLAN_EQUIVALENCE_AMBIGUOUS");
      if (exact && observedAt < Date.parse(exact.lastCheckedAt) || alias && observedAt < Date.parse(alias.lastCheckedAt)) {
        return 0;
      }
      const existingIds=[...new Set([exact?.historySeriesId,alias?.historySeriesId].filter(Boolean))];
      if(existingIds.length>1)throw new Error("VERIFIED_HISTORY_SERIES_AMBIGUOUS");
      const predecessor=exact&&strong(exact)?exact:alias??null;
      const incoming:HistoryRow={planIdentity:item.planIdentity??catalogPlanIdentity(item),historySeriesId:null,
        serviceSlug:item.serviceSlug,planSlug:item.planSlug,planName:item.planName,
        billingProviderSlug:item.billingProviderSlug,countryCode:item.countryCode,currency:item.currency,
        monthlyPriceMinor:item.monthlyPriceMinor,source:item.source,sourceUrl:item.sourceUrl,
        verification:item.verification,sourceCount:item.sourceCount,verifiedByAgreement:item.verifiedByAgreement,
        verifiedAt:item.updatedAt,lastCheckedAt:item.updatedAt};
      let historySeriesId=existingIds[0]??verifiedHistorySeriesId(alias??predecessor??incoming);
      let prior=await latestHistory(client,historySeriesId);
      // A current row can have been explicitly removed while its immutable
      // history remains. A later fresh admission starts a new series.
      if(!predecessor&&prior){historySeriesId=verifiedHistorySeriesId(incoming,item.updatedAt);prior=await latestHistory(client,historySeriesId);}
      if(predecessor){
        if(!prior&&alias&&exact&&strong(exact)){
          if(Date.parse(alias.verifiedAt)>=Date.parse(exact.verifiedAt))
            throw new Error("VERIFIED_HISTORY_DUAL_CURRENT_ORDER_AMBIGUOUS");
          await appendHistory(client,alias,historySeriesId,"BOOTSTRAP_BASELINE");
          if(alias.monthlyPriceMinor!==exact.monthlyPriceMinor)
            await appendHistory(client,exact,historySeriesId,"PRICE_CHANGE");
        } else if(!prior)await appendHistory(client,predecessor,historySeriesId,"BOOTSTRAP_BASELINE");
        else if(prior.monthly_price_minor!==predecessor.monthlyPriceMinor)
          throw new Error("VERIFIED_HISTORY_CURRENT_MISMATCH");
      } else if(prior)throw new Error("VERIFIED_HISTORY_ORPHAN_SERIES");
      if(alias&&exact&&prior)await preserveLegacyAlias(client,alias);
      if (alias) await client.query(`DELETE FROM verified_provider_prices WHERE service_slug=$1 AND plan_slug=$2
        AND billing_provider_slug=$3 AND country_code=$4 AND currency=$5`,
        [alias.serviceSlug,alias.planSlug,alias.billingProviderSlug,alias.countryCode,alias.currency]);
      await client.query(
      `
        INSERT INTO verified_provider_prices (
          plan_identity,
          history_series_id,
          service_slug,
          plan_slug,
          plan_name,
          billing_provider_slug,
          country_code,
          currency,
          monthly_price_minor,
          source,
          source_url,
          verification,
          source_count,
          verified_by_agreement,
          verified_at,
          last_checked_at
        )
        VALUES (
          $1, $15, $2, $3, $4, $5, $6, $7,
          $8, $9, $10, $11, $12, $13,
          $14::timestamptz, $14::timestamptz
        )
        ON CONFLICT (
          service_slug,
          plan_slug,
          billing_provider_slug,
          country_code,
          currency
        )
        DO UPDATE SET
          plan_identity = CASE
            WHEN verified_provider_prices.plan_identity LIKE 'catalog:%'
            THEN EXCLUDED.plan_identity
            ELSE verified_provider_prices.plan_identity
          END,
          history_series_id = EXCLUDED.history_series_id,
          plan_name = EXCLUDED.plan_name,
          monthly_price_minor =
            EXCLUDED.monthly_price_minor,
          source = EXCLUDED.source,
          source_url = EXCLUDED.source_url,
          verification = EXCLUDED.verification,
          source_count = EXCLUDED.source_count,
          verified_by_agreement =
            EXCLUDED.verified_by_agreement,
          verified_at =
            CASE
              WHEN verified_provider_prices.monthly_price_minor
                   IS DISTINCT FROM EXCLUDED.monthly_price_minor
                OR verified_provider_prices.plan_name IS DISTINCT FROM EXCLUDED.plan_name
              THEN EXCLUDED.verified_at
              ELSE verified_provider_prices.verified_at
            END,
          last_checked_at = EXCLUDED.last_checked_at
      `,
      [
        item.planIdentity ?? catalogPlanIdentity(item),
        item.serviceSlug,
        item.planSlug,
        item.planName,
        item.billingProviderSlug,
        item.countryCode,
        item.currency,
        item.monthlyPriceMinor,
        item.source,
        item.sourceUrl,
        item.verification,
        item.sourceCount,
        item.verifiedByAgreement,
        item.updatedAt,
        historySeriesId
      ]
    );
      if(!predecessor)await appendHistory(client,incoming,historySeriesId,"BASELINE");
      else if(predecessor.monthlyPriceMinor!==item.monthlyPriceMinor)
        await appendHistory(client,incoming,historySeriesId,"PRICE_CHANGE");
      return 1;
}

// Only callers that already own a transaction may use this path. It shares
// the ordinary identity, alias, history and source rules with live research.
export async function persistVerifiedLivePricesInTransaction(items: AdapterPrice[], client: any) {
  if (!items.length || !client?.query) throw new Error("VERIFIED_TRANSACTION_INPUT_INVALID");
  const verified = acceptedVerifiedPrices(items);
  if (verified.length !== items.length ||
      verified.some(item => item.serviceSlug !== items[0].serviceSlug || item.countryCode !== items[0].countryCode))
    throw new Error("VERIFIED_TRANSACTION_INPUT_INVALID");
  let persisted = 0;
  for (const item of verified) persisted += await persistVerifiedPriceInClient(item,client);
  return {received:items.length,persisted};
}

export async function persistVerifiedLivePrices(items: AdapterPrice[]) {
  const verified = acceptedVerifiedPrices(items);
  let persisted = 0;
  for (const item of verified) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      persisted += await persistVerifiedPriceInClient(item,client);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally { client.release(); }
  }

  return {
    received: items.length,
    persisted
  };
}

export async function loadPersistedVerifiedPrices(
  countryCode: string,
  currency: string
): Promise<AdapterPrice[]> {
  const result = await pool.query(
    `
      SELECT
        plan_identity,
        service_slug,
        plan_slug,
        plan_name,
        billing_provider_slug,
        country_code,
        currency,
        monthly_price_minor,
        source,
        source_url,
        verification,
        source_count,
        verified_by_agreement,
        verified_at,
        last_checked_at
      FROM verified_provider_prices
      WHERE country_code = $1
        AND currency = $2
      ORDER BY
        service_slug,
        plan_slug,
        billing_provider_slug
    `,
    [
      countryCode.toUpperCase(),
      currency.toUpperCase()
    ]
  );

  return result.rows.map((row: any) => ({
    planIdentity: row.plan_identity,
    serviceSlug: row.service_slug,
    planSlug: row.plan_slug,
    planName: row.plan_name,
    billingProviderSlug:
      row.billing_provider_slug,
    countryCode: row.country_code,
    currency: row.currency,
    monthlyPriceMinor:
      row.monthly_price_minor,
    updatedAt: new Date(
      row.last_checked_at
    ).toISOString(),
    source: row.source,
    sourceUrl: row.source_url,
    confidence: "official-provider-adapter",
    priceType: "exact",
    verification: row.verification,
    sourceCount: row.source_count,
    verifiedByAgreement:
      row.verified_by_agreement
  }));
}
