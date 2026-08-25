import assert from "node:assert/strict";
import test from "node:test";

import { pool } from "./db.js";

import {
  verifiedProviderRegistry,
  type AdapterPrice
} from "./pricing-adapters.js";

import {
  runPricingRefreshBatch
} from "./pricing.js";

import {
  persistVerifiedLivePrices
} from "./pricing-store.js";

const testPlanSlug =
  "scheduler-integration-plan";

async function cleanup() {
  await pool.query(
    `DELETE FROM verified_provider_prices
     WHERE plan_slug = $1`,
    [testPlanSlug]
  );
}

function verifiedPrice(
  countryCode: string,
  currency: string
): AdapterPrice {
  return {
    serviceSlug: "netflix",
    planSlug: testPlanSlug,
    planName:
      "Scheduler Integration Plan",
    billingProviderSlug: "direct",
    countryCode,
    currency,
    monthlyPriceMinor: 1499,
    updatedAt:
      new Date().toISOString(),
    source:
      "official-provider-adapter:netflix",
    sourceUrl:
      "https://www.netflix.com/",
    confidence:
      "official-provider-adapter",
    priceType: "exact",
    verification: "multi-source",
    sourceCount: 2,
    verifiedByAgreement: true
  };
}

test.before(async () => {
  await cleanup();
});

test.after(async () => {
  await cleanup();
  await pool.end();
});

test(
  "pricing refresh checks all registry countries and isolates one failure",
  async () => {
    const countries = Object.keys(
      verifiedProviderRegistry
    );

    // Current supported pricing target.
    assert.equal(
      countries.length,
      14
    );

    const seen: string[] = [];

    const intentionallyFailedCountry =
      "BE";

    const persistedCountry =
      "DE";

    const result =
      await runPricingRefreshBatch(
        countries,
        async (countryCode) => {
          seen.push(countryCode);

          if (
            countryCode ===
            intentionallyFailedCountry
          ) {
            throw new Error(
              "SIMULATED_PROVIDER_FAILURE"
            );
          }

          if (
            countryCode ===
            persistedCountry
          ) {
            const persisted =
              await persistVerifiedLivePrices([
                verifiedPrice(
                  "DE",
                  "EUR"
                )
              ]);

            assert.equal(
              persisted.persisted,
              1
            );
          }

          return {
            countryCode
          };
        }
      );

    assert.equal(
      result.checked,
      14
    );

    assert.equal(
      result.refreshed,
      13
    );

    assert.deepEqual(
      result.failed,
      ["BE"]
    );

    assert.equal(
      new Set(seen).size,
      14
    );

    for (const country of countries) {
      assert.equal(
        seen.includes(country),
        true,
        `${country} was not refreshed`
      );
    }

    // Failure in Belgium must not prevent Germany's
    // independently verified price from reaching Postgres.
    const stored = await pool.query(
      `SELECT
         country_code,
         monthly_price_minor,
         verification,
         source_count,
         verified_by_agreement
       FROM verified_provider_prices
       WHERE service_slug = 'netflix'
         AND plan_slug = $1
         AND country_code = 'DE'
         AND currency = 'EUR'`,
      [testPlanSlug]
    );

    assert.equal(
      stored.rows.length,
      1
    );

    assert.equal(
      stored.rows[0].country_code.trim(),
      "DE"
    );

    assert.equal(
      stored.rows[0].monthly_price_minor,
      1499
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
  }
);
