import { pool } from "./db.js";
import type { AdapterPrice } from "./pricing-adapters.js";
import { catalogPlanIdentity } from "../../../packages/contracts/src/product-pricing.js";
import { serviceCatalog } from "../../../packages/contracts/src/catalog.js";
import { equivalentVerifiedPlan, semanticVerifiedAlias } from "./verified-price-reconciliation.mjs";

const currentRow = (row: any) => ({
  serviceSlug: row.service_slug, planSlug: row.plan_slug, planName: row.plan_name,
  billingProviderSlug: row.billing_provider_slug, countryCode: row.country_code,
  currency: row.currency, monthlyPriceMinor: row.monthly_price_minor,
  source: row.source, sourceUrl: row.source_url, verification: row.verification,
  sourceCount: row.source_count, verifiedByAgreement: row.verified_by_agreement,
  verifiedAt: row.verified_at_exact ?? new Date(row.verified_at).toISOString(),
  lastCheckedAt: row.last_checked_at_exact ?? new Date(row.last_checked_at).toISOString()
});

async function preserveObservation(client: any, row: ReturnType<typeof currentRow>) {
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

export async function persistVerifiedLivePrices(
  items: AdapterPrice[]
) {
  const verified = items.filter(
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

  let persisted = 0;

  for (const item of verified) {
    const observedAt = Date.parse(item.updatedAt);
    if (!Number.isFinite(observedAt)) throw new Error("VERIFIED_PRICE_TIMESTAMP_INVALID");
    const serviceName = serviceCatalog.find(service => service.slug === item.serviceSlug)?.name ?? item.serviceName;
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1),hashtext($2))", [item.serviceSlug,`${item.billingProviderSlug}:${item.countryCode}:${item.currency}`]);
      const scoped = await client.query(`SELECT *,verified_at::text AS verified_at_exact,
        last_checked_at::text AS last_checked_at_exact FROM verified_provider_prices WHERE service_slug=$1
        AND billing_provider_slug=$2 AND country_code=$3 AND currency=$4 FOR UPDATE`,
        [item.serviceSlug,item.billingProviderSlug,item.countryCode,item.currency]);
      const current = scoped.rows.map(currentRow);
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
        await client.query("COMMIT");
        continue;
      }
      if (alias) await preserveObservation(client,alias);
      if (exact && exact.verification !== "registry" && (exact.monthlyPriceMinor !== item.monthlyPriceMinor || exact.planName !== item.planName)) await preserveObservation(client,exact);
      if (alias) await client.query(`DELETE FROM verified_provider_prices WHERE service_slug=$1 AND plan_slug=$2
        AND billing_provider_slug=$3 AND country_code=$4 AND currency=$5`,
        [alias.serviceSlug,alias.planSlug,alias.billingProviderSlug,alias.countryCode,alias.currency]);
      await client.query(
      `
        INSERT INTO verified_provider_prices (
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
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7,
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
        item.updatedAt
      ]
    );
      if (alias || exact && (exact.monthlyPriceMinor !== item.monthlyPriceMinor || exact.planName !== item.planName))
        await preserveObservation(client,{serviceSlug:item.serviceSlug,planSlug:item.planSlug,planName:item.planName,
          billingProviderSlug:item.billingProviderSlug,countryCode:item.countryCode,currency:item.currency,
          monthlyPriceMinor:item.monthlyPriceMinor,source:item.source,sourceUrl:item.sourceUrl,
          verification:item.verification,sourceCount:item.sourceCount,verifiedByAgreement:item.verifiedByAgreement,
          verifiedAt:item.updatedAt,lastCheckedAt:item.updatedAt});
      await client.query("COMMIT");
      persisted += 1;
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
