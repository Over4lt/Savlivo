import {pool} from "./db.js";
import type {ProductPlanPricing, ProductPriceEvidence} from "../../../packages/contracts/src/product-pricing.js";

export type SuggestedRow = {
  suggested_id: string;
  origin_suggested_id: string | null;
  plan_identity: string;
  service_slug: string;
  plan_name: string;
  billing_provider_slug: string;
  country_code: string;
  currency: string;
  monthly_price_minor: number;
  payment_cadence: "MONTHLY_RECURRING";
  provenance: string;
  source_url: string | null;
  researched_at: Date | string;
  warnings: unknown;
  active: boolean;
};

function evidence(row: SuggestedRow): ProductPriceEvidence {
  return {
    monthlyPriceMinor: Number(row.monthly_price_minor),
    currency: row.currency,
    paymentCadence: row.payment_cadence,
    ...(row.source_url ? {sourceUrl: row.source_url} : {}),
    observedAt: new Date(row.researched_at).toISOString(),
    warnings: Array.isArray(row.warnings)
      ? row.warnings.filter((value): value is string => typeof value === "string")
      : [],
    provenance: row.provenance,
    suggestedId: row.suggested_id,
    ...(row.origin_suggested_id ? {originSuggestedId: row.origin_suggested_id} : {})
  };
}

export function suggestedRowsToProductPlans(rows: SuggestedRow[]): ProductPlanPricing[] {
  const plans = new Map<string, ProductPlanPricing>();
  for (const row of rows) {
    const key = [
      row.plan_identity,
      row.service_slug,
      row.billing_provider_slug,
      row.country_code
    ].join("\u0000");
    let plan = plans.get(key);
    if (!plan) {
      plan = {
        planIdentity: row.plan_identity,
        serviceSlug: row.service_slug,
        planName: row.plan_name,
        billingProviderSlug: row.billing_provider_slug,
        countryCode: row.country_code,
        suggested: null,
        suggestedHistory: [],
        verified: []
      };
      plans.set(key, plan);
    }
    if (row.active) plan.suggested = evidence(row);
    else plan.suggestedHistory.push(evidence(row));
  }
  return [...plans.values()];
}

const selectSuggested = `SELECT suggested_id,origin_suggested_id,plan_identity,service_slug,plan_name,
  billing_provider_slug,country_code,currency,monthly_price_minor,payment_cadence,provenance,
  source_url,researched_at,warnings,active FROM suggested_provider_prices`;

export async function loadSuggestedProductPlans(countryCode: string, currency: string) {
  const result = await pool.query(`${selectSuggested}
    WHERE country_code=$1 AND currency=$2
    ORDER BY service_slug,plan_identity,active DESC,researched_at DESC`, [
    countryCode.toUpperCase(),
    currency.toUpperCase()
  ]);
  return suggestedRowsToProductPlans(result.rows as SuggestedRow[]);
}

function records(plan: ProductPlanPricing) {
  return [
    ...plan.suggestedHistory.map(value => ({value, active: false})),
    ...(plan.suggested ? [{value: plan.suggested, active: true}] : [])
  ];
}

export async function persistSuggestedProductPlans(plans: ProductPlanPricing[]) {
  const client = await pool.connect();
  let persisted = 0;
  try {
    await client.query("BEGIN");
    for (const plan of plans) {
      for (const {value, active} of records(plan)) {
        if (!value.suggestedId) throw new Error("SUGGESTED_ID_REQUIRED");
        if (active) await client.query(`UPDATE suggested_provider_prices SET active=false,updated_at=now()
          WHERE plan_identity=$1 AND billing_provider_slug=$2 AND country_code=$3 AND currency=$4
          AND active=true AND suggested_id<>$5`, [
          plan.planIdentity,
          plan.billingProviderSlug,
          plan.countryCode,
          value.currency,
          value.suggestedId
        ]);
        await client.query(`INSERT INTO suggested_provider_prices(
          suggested_id,origin_suggested_id,plan_identity,service_slug,plan_name,billing_provider_slug,
          country_code,currency,monthly_price_minor,payment_cadence,provenance,source_url,
          researched_at,warnings,active) VALUES(
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb,$15)
          ON CONFLICT(suggested_id) DO UPDATE SET
          plan_identity=EXCLUDED.plan_identity,plan_name=EXCLUDED.plan_name,provenance=EXCLUDED.provenance,source_url=EXCLUDED.source_url,
          researched_at=EXCLUDED.researched_at,warnings=EXCLUDED.warnings,active=EXCLUDED.active,
          updated_at=now()`, [
          value.suggestedId,
          value.originSuggestedId ?? null,
          plan.planIdentity,
          plan.serviceSlug,
          plan.planName,
          plan.billingProviderSlug,
          plan.countryCode,
          value.currency,
          value.monthlyPriceMinor,
          value.paymentCadence,
          value.provenance,
          value.sourceUrl ?? null,
          value.observedAt ?? new Date().toISOString(),
          JSON.stringify(value.warnings),
          active
        ]);
        persisted += 1;
      }
    }
    await client.query("COMMIT");
    return {receivedPlans: plans.length, persisted};
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
