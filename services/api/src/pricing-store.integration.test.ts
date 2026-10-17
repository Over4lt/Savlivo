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

test("service-prefixed Verified successor keeps one current row and two historical prices", async () => {
  const slugs=["integration-test-standard","integration-test-netflix-standard"];
  const clear=async()=>{
    await pool.query("DELETE FROM verified_provider_prices WHERE service_slug='netflix' AND country_code='DE' AND plan_slug=ANY($1::text[])",[slugs]);
    await pool.query("DELETE FROM verified_price_observations WHERE service_slug='netflix' AND country_code='DE' AND plan_slug=ANY($1::text[])",[slugs]);
  };
  await clear();
  try {
    const old=price({planSlug:slugs[0],planName:"Standard",monthlyPriceMinor:1399,
      updatedAt:"2026-08-30T13:39:54.000Z",verification:"authoritative-provider",sourceCount:1,verifiedByAgreement:false});
    const current=price({planSlug:slugs[1],planName:"Netflix Standard",monthlyPriceMinor:1499,
      updatedAt:"2026-10-16T23:33:45.000Z",verification:"authoritative-provider",sourceCount:1,verifiedByAgreement:false});
    await persistVerifiedLivePrices([old]);
    await persistVerifiedLivePrices([current]);
    await persistVerifiedLivePrices([current]);
    const rows=(await pool.query("SELECT plan_slug,monthly_price_minor FROM verified_provider_prices WHERE service_slug='netflix' AND country_code='DE' AND plan_slug=ANY($1::text[])",[slugs])).rows;
    const observations=(await pool.query("SELECT plan_slug,monthly_price_minor,provider_verified_at FROM verified_price_observations WHERE service_slug='netflix' AND country_code='DE' AND plan_slug=ANY($1::text[]) ORDER BY id",[slugs])).rows;
    assert.deepEqual(rows.map(row=>[row.plan_slug,row.monthly_price_minor]),[[slugs[1],1499]]);
    assert.deepEqual(observations.map(row=>[row.plan_slug,row.monthly_price_minor]),[[slugs[0],1399],[slugs[1],1499]]);
    assert.equal(new Date(observations[0].provider_verified_at).toISOString(),old.updatedAt);
  } finally { await clear(); }
});

test.after(async () => {
  await cleanup();
  await pool.end();
});
