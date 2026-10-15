import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";
import type {ProductPlanPricing} from "../../../packages/contracts/src/product-pricing.js";
import {pool} from "./db.js";
import {mergeProductPlans, projectCatalogProductPlans} from "./product-pricing.js";
import {loadPersistedVerifiedPrices, persistVerifiedLivePrices} from "./pricing-store.js";
import {loadSuggestedProductPlans, persistSuggestedProductPlans} from "./suggested-pricing-store.js";
import {productPriceStatus} from "../../../packages/contracts/src/product-pricing.js";

const enabled = process.env.SAVLIVO_DISPOSABLE_DB_TEST === "1";

test("Suggested history remains available while Verified price stays authoritative", {skip: !enabled}, async () => {
  assert.equal(process.env.DATABASE_URL, "postgresql://postgres@127.0.0.1:55439/savlivo_test");
  const sql = (path: string) => readFileSync(new URL(`../../../${path}`, import.meta.url), "utf8");
  const plan: ProductPlanPricing = {
    planIdentity: "fixture:de:premium",
    serviceSlug: "fixture-service",
    planName: "Premium",
    billingProviderSlug: "direct",
    countryCode: "DE",
    suggested: {
      suggestedId: "v3:fixture:premium",
      originSuggestedId: "v4:fixture:premium",
      monthlyPriceMinor: 1299,
      currency: "EUR",
      paymentCadence: "MONTHLY_RECURRING",
      sourceUrl: "https://provider.example/pricing",
      observedAt: "2026-10-13T11:00:00Z",
      warnings: [],
      provenance: "V3_SOURCE_RESEARCH"
    },
    suggestedHistory: [{
      suggestedId: "v4:fixture:premium",
      monthlyPriceMinor: 1399,
      currency: "EUR",
      paymentCadence: "MONTHLY_RECURRING",
      observedAt: "2026-10-13T10:00:00Z",
      warnings: ["BILLING_ROUTE_UNRESOLVED"],
      provenance: "GOOGLE_AI_V4"
    }],
    verified: []
  };

  try {
    await pool.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public");
    await pool.query(sql("db/schema.sql"));
    await pool.query(sql("db/migrations/019_suggested_provider_prices.sql"));
    await pool.query(sql("db/migrations/019_suggested_provider_prices.sql"));

    assert.deepEqual(await persistSuggestedProductPlans([plan]), {receivedPlans: 1, persisted: 2});
    assert.deepEqual(await persistSuggestedProductPlans([plan]), {receivedPlans: 1, persisted: 2});

    const [stored] = await loadSuggestedProductPlans("DE", "EUR");
    assert.equal(stored.suggested?.monthlyPriceMinor, 1299);
    assert.equal(stored.suggestedHistory[0]?.monthlyPriceMinor, 1399);
    assert.deepEqual(stored.suggestedHistory[0]?.warnings, ["BILLING_ROUTE_UNRESOLVED"]);
    assert.equal((await pool.query("SELECT count(*)::int n FROM suggested_provider_prices")).rows[0].n, 2);
    assert.equal((await pool.query("SELECT count(*)::int n FROM suggested_provider_prices WHERE active")).rows[0].n, 1);

    await persistVerifiedLivePrices([{
      planIdentity: plan.planIdentity,
      serviceSlug: plan.serviceSlug,
      planSlug: "premium",
      planName: plan.planName,
      billingProviderSlug: "direct",
      countryCode: plan.countryCode,
      currency: "EUR",
      monthlyPriceMinor: 1199,
      updatedAt: "2026-10-13T12:00:00Z",
      source: "fixture",
      sourceUrl: "https://provider.example/pricing",
      confidence: "official-provider-adapter",
      priceType: "exact",
      verification: "authoritative-provider",
      sourceCount: 1,
      verifiedByAgreement: false
    }]);

    const merged = mergeProductPlans(
      await loadSuggestedProductPlans("DE", "EUR"),
      projectCatalogProductPlans(await loadPersistedVerifiedPrices("DE", "EUR"))
    );
    assert.equal(merged.length, 1);
    assert.equal(productPriceStatus(merged[0]), "VERIFIED_ONLY");
    assert.equal(merged[0].suggested?.monthlyPriceMinor, 1299);
    assert.equal(merged[0].verified[0]?.monthlyPriceMinor, 1199);
    assert.equal(merged[0].suggestedHistory[0]?.monthlyPriceMinor, 1399);
  } finally {
    await pool.end();
  }
});
