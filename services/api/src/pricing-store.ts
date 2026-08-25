import { pool } from "./db.js";
import type { AdapterPrice } from "./pricing-adapters.js";

export async function persistVerifiedLivePrices(
  items: AdapterPrice[]
) {
  const verified = items.filter(
    (item) =>
      item.priceType === "exact" &&
      item.verification === "multi-source" &&
      item.verifiedByAgreement === true &&
      typeof item.sourceCount === "number" &&
      item.sourceCount >= 2 &&
      item.monthlyPriceMinor > 0
  );

  let persisted = 0;

  for (const item of verified) {
    await pool.query(
      `
        INSERT INTO verified_provider_prices (
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
          $8, $9, $10, $11, $12,
          now(), now()
        )
        ON CONFLICT (
          service_slug,
          plan_slug,
          billing_provider_slug,
          country_code,
          currency
        )
        DO UPDATE SET
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
              THEN now()
              ELSE verified_provider_prices.verified_at
            END,
          last_checked_at = now()
      `,
      [
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
        item.verifiedByAgreement
      ]
    );

    persisted += 1;
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
