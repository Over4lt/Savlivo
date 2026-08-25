import assert from "node:assert/strict";
import test from "node:test";

import { pool } from "./db.js";

import {
  loadPersistedVerifiedPrices,
  persistVerifiedLivePrices
} from "./pricing-store.js";

import {
  mergeFreshAndPersistedPricing
} from "./pricing.js";

import type {
  AdapterPrice
} from "./pricing-adapters.js";

const identity = {
  serviceSlug: "netflix",
  planSlug: "restart-integration-plan",
  planName: "Restart Integration Plan",
  billingProviderSlug: "direct" as const,
  countryCode: "DE",
  currency: "EUR"
};

function makePrice(
  amount: number,
  overrides: Partial<AdapterPrice> = {}
): AdapterPrice {
  return {
    ...identity,
    monthlyPriceMinor: amount,
    updatedAt: new Date().toISOString(),
    source: "official-provider-adapter:netflix",
    sourceUrl: "https://www.netflix.com/de/",
    confidence: "official-provider-adapter",
    priceType: "exact",
    ...overrides
  };
}

async function cleanup() {
  await pool.query(
    `DELETE FROM verified_provider_prices
     WHERE service_slug = $1
       AND plan_slug = $2
       AND billing_provider_slug = $3
       AND country_code = $4
       AND currency = $5`,
    [
      identity.serviceSlug,
      identity.planSlug,
      identity.billingProviderSlug,
      identity.countryCode,
      identity.currency
    ]
  );
}

test.before(async () => {
  await cleanup();
});

test.after(async () => {
  await cleanup();
  await pool.end();
});

test(
  "persisted verified price survives restart and beats registry baseline",
  async () => {
    const registryBaseline = makePrice(
      1399,
      {
        verification: "registry",
        sourceCount: 1,
        verifiedByAgreement: false
      }
    );

    const verifiedLive = makePrice(
      1499,
      {
        verification: "multi-source",
        sourceCount: 2,
        verifiedByAgreement: true
      }
    );

    const persisted =
      await persistVerifiedLivePrices([
        verifiedLive
      ]);

    assert.equal(
      persisted.persisted,
      1
    );

    const reloaded =
      await loadPersistedVerifiedPrices(
        "DE",
        "EUR"
      );

    const stored = reloaded.find(
      (row) =>
        row.serviceSlug === identity.serviceSlug &&
        row.planSlug === identity.planSlug
    );

    assert.ok(stored);

    assert.equal(
      stored.monthlyPriceMinor,
      1499
    );

    assert.equal(
      stored.verification,
      "multi-source"
    );

    assert.equal(
      stored.verifiedByAgreement,
      true
    );

    const merged =
      mergeFreshAndPersistedPricing(
        [registryBaseline],
        reloaded
      );

    const resolved = merged.find(
      (row) =>
        row.serviceSlug === identity.serviceSlug &&
        row.planSlug === identity.planSlug
    );

    assert.ok(resolved);

    assert.equal(
      resolved.monthlyPriceMinor,
      1499
    );

    assert.equal(
      resolved.verification,
      "multi-source"
    );
  }
);

test(
  "new strong live verification beats older persisted price",
  async () => {
    await cleanup();

    await persistVerifiedLivePrices([
      makePrice(
        1499,
        {
          verification: "multi-source",
          sourceCount: 2,
          verifiedByAgreement: true
        }
      )
    ]);

    const persisted =
      await loadPersistedVerifiedPrices(
        "DE",
        "EUR"
      );

    const freshStrong = makePrice(
      1599,
      {
        verification: "multi-source",
        sourceCount: 2,
        verifiedByAgreement: true
      }
    );

    const merged =
      mergeFreshAndPersistedPricing(
        [freshStrong],
        persisted
      );

    const resolved = merged.find(
      (row) =>
        row.serviceSlug === identity.serviceSlug &&
        row.planSlug === identity.planSlug
    );

    assert.ok(resolved);

    assert.equal(
      resolved.monthlyPriceMinor,
      1599
    );
  }
);
