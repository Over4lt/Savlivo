import assert from "node:assert/strict";
import test from "node:test";

import { pool } from "./db.js";
import { persistVerifiedLivePrices } from "./pricing-store.js";
import type { AdapterPrice } from "./pricing-adapters.js";

const key = {
  serviceSlug: "netflix",
  planSlug: "integration-test-plan",
  billingProviderSlug: "direct" as const,
  countryCode: "DE",
  currency: "EUR"
};

async function cleanup() {
  await pool.query(
    `DELETE FROM verified_provider_prices
     WHERE service_slug = $1
       AND plan_slug = $2
       AND billing_provider_slug = $3
       AND country_code = $4
       AND currency = $5`,
    [
      key.serviceSlug,
      key.planSlug,
      key.billingProviderSlug,
      key.countryCode,
      key.currency
    ]
  );
}

function price(
  overrides: Partial<AdapterPrice> = {}
): AdapterPrice {
  return {
    serviceSlug: key.serviceSlug,
    planSlug: key.planSlug,
    planName: "Integration Test Plan",
    billingProviderSlug: key.billingProviderSlug,
    countryCode: key.countryCode,
    currency: key.currency,
    monthlyPriceMinor: 1399,
    updatedAt: new Date().toISOString(),
    source: "official-provider-adapter:netflix",
    sourceUrl: "https://www.netflix.com/de/",
    confidence: "official-provider-adapter",
    priceType: "exact",
    verification: "multi-source",
    sourceCount: 2,
    verifiedByAgreement: true,
    ...overrides
  };
}

test.beforeEach(async () => {
  await cleanup();
});

test.afterEach(async () => {
  await cleanup();
});

test(
  "persists multi-source verified live price",
  async () => {
    const result = await persistVerifiedLivePrices([
      price()
    ]);

    assert.equal(result.persisted, 1);

    const stored = await pool.query(
      `SELECT
         monthly_price_minor,
         verification,
         source_count,
         verified_by_agreement,
         verified_at,
         last_checked_at
       FROM verified_provider_prices
       WHERE service_slug = $1
         AND plan_slug = $2
         AND billing_provider_slug = $3
         AND country_code = $4
         AND currency = $5`,
      [
        key.serviceSlug,
        key.planSlug,
        key.billingProviderSlug,
        key.countryCode,
        key.currency
      ]
    );

    assert.equal(stored.rows.length, 1);
    assert.equal(
      stored.rows[0].monthly_price_minor,
      1399
    );
    assert.equal(
      stored.rows[0].verification,
      "multi-source"
    );
    assert.equal(
      stored.rows[0].source_count,
      2
    );
    assert.equal(
      stored.rows[0].verified_by_agreement,
      true
    );
    assert.ok(stored.rows[0].verified_at);
    assert.ok(stored.rows[0].last_checked_at);
  }
);

test(
  "persists authoritative provider price",
  async () => {
    const result = await persistVerifiedLivePrices([
      price({
        monthlyPriceMinor: 1499,
        verification: "authoritative-provider",
        sourceCount: 1,
        verifiedByAgreement: false
      })
    ]);

    assert.equal(result.persisted, 1);

    const stored = await pool.query(
      `SELECT
         monthly_price_minor,
         verification,
         source_count,
         verified_by_agreement
       FROM verified_provider_prices
       WHERE service_slug = $1
         AND plan_slug = $2
         AND billing_provider_slug = $3
         AND country_code = $4
         AND currency = $5`,
      [
        key.serviceSlug,
        key.planSlug,
        key.billingProviderSlug,
        key.countryCode,
        key.currency
      ]
    );

    assert.equal(stored.rows.length, 1);

    assert.equal(
      stored.rows[0].monthly_price_minor,
      1499
    );

    assert.equal(
      stored.rows[0].verification,
      "authoritative-provider"
    );

    assert.equal(
      stored.rows[0].source_count,
      1
    );

    assert.equal(
      stored.rows[0].verified_by_agreement,
      false
    );
  }
);

test(
  "does not persist single-source price",
  async () => {
    const result = await persistVerifiedLivePrices([
      price({
        verification: "single-source",
        sourceCount: 1,
        verifiedByAgreement: false
      })
    ]);

    assert.equal(result.persisted, 0);

    const stored = await pool.query(
      `SELECT count(*)::integer AS count
       FROM verified_provider_prices
       WHERE service_slug = $1
         AND plan_slug = $2
         AND billing_provider_slug = $3
         AND country_code = $4
         AND currency = $5`,
      [
        key.serviceSlug,
        key.planSlug,
        key.billingProviderSlug,
        key.countryCode,
        key.currency
      ]
    );

    assert.equal(stored.rows[0].count, 0);
  }
);

test(
  "verified price update replaces amount and keeps one row",
  async () => {
    await persistVerifiedLivePrices([
      price({
        monthlyPriceMinor: 1399
      })
    ]);

    await persistVerifiedLivePrices([
      price({
        monthlyPriceMinor: 1499
      })
    ]);

    const stored = await pool.query(
      `SELECT
         count(*)::integer AS count,
         max(monthly_price_minor)::integer AS amount
       FROM verified_provider_prices
       WHERE service_slug = $1
         AND plan_slug = $2
         AND billing_provider_slug = $3
         AND country_code = $4
         AND currency = $5`,
      [
        key.serviceSlug,
        key.planSlug,
        key.billingProviderSlug,
        key.countryCode,
        key.currency
      ]
    );

    assert.equal(stored.rows[0].count, 1);
    assert.equal(stored.rows[0].amount, 1499);
  }
);

test.after(async () => {
  await cleanup();
  await pool.end();
});
