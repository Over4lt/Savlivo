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
    await pool.query(sql("db/migrations/014_verified_price_observations.sql"));
    await pool.query(sql("db/migrations/019_suggested_provider_prices.sql"));
    await pool.query(sql("db/migrations/019_suggested_provider_prices.sql"));
    await pool.query(sql("db/migrations/026_suggested_price_calculation.sql"));
    await pool.query(sql("db/migrations/026_suggested_price_calculation.sql"));
    await pool.query(sql("db/migrations/023_durable_verified_price_history.sql"));

    assert.deepEqual(await persistSuggestedProductPlans([plan]), {receivedPlans: 1, persisted: 2});
    assert.deepEqual(await persistSuggestedProductPlans([plan]), {receivedPlans: 1, persisted: 2});

    const [stored] = await loadSuggestedProductPlans("DE", "EUR");
    assert.equal(stored.suggested?.monthlyPriceMinor, 1299);
    assert.equal(stored.suggestedHistory[0]?.monthlyPriceMinor, 1399);
    assert.deepEqual(stored.suggestedHistory[0]?.warnings, ["BILLING_ROUTE_UNRESOLVED"]);
    assert.equal((await pool.query("SELECT count(*)::int n FROM suggested_provider_prices")).rows[0].n, 2);
    assert.equal((await pool.query("SELECT count(*)::int n FROM suggested_provider_prices WHERE active")).rows[0].n, 1);

    const canonicalPlan={...plan,planIdentity:"catalog:fixture-service:de:premium:direct:eur"};
    await persistSuggestedProductPlans([canonicalPlan]);
    const rekeyed=await loadSuggestedProductPlans("DE","EUR");
    assert.equal(rekeyed.length,1);
    assert.equal(rekeyed[0]?.planIdentity,canonicalPlan.planIdentity);
    assert.equal((await pool.query("SELECT count(*)::int n FROM suggested_provider_prices")).rows[0].n,2);

    await persistVerifiedLivePrices([{
      planIdentity: canonicalPlan.planIdentity,
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

    const calculation={schemaVersion:1 as const,method:"MONTHLY_BASE_PLUS_AD_FREE_ADD_ON" as const,currency:"NOK",
      components:[{role:"BASE" as const,planName:"Prime Video",monthlyPriceMinor:7900,sourceUrl:"https://www.primevideo.com/no",aiExcerptSha256:"a".repeat(64)},
        {role:"AD_FREE_ADD_ON" as const,planName:"Prime Video Ad Free add-on",monthlyPriceMinor:2900,sourceUrl:"https://www.primevideo.com/help/ad-free",aiExcerptSha256:"b".repeat(64)}],
      compatibilityAiExcerptSha256:"c".repeat(64)};
    const composed:ProductPlanPricing={...plan,planIdentity:"catalog:prime-video:no:prime-video-without-ads-calculated-total:direct:nok",
      serviceSlug:"prime-video",planName:"Prime Video Without Ads (Calculated Total)",countryCode:"NO",
      suggested:{...plan.suggested!,suggestedId:"v4:composed",monthlyPriceMinor:10800,currency:"NOK",provenance:"GOOGLE_AI_V4",calculation,offerScope:"CALCULATED_TOTAL",
        warnings:["CALCULATED_TOTAL_UNVERIFIED"]},suggestedHistory:[]};
    const addon:ProductPlanPricing={...composed,planIdentity:"catalog:prime-video:no:prime-video-ad-free-add-on:direct:nok",
      planName:"Prime Video Ad Free (Add-On)",suggested:{...composed.suggested!,suggestedId:"v4:historical-addon",monthlyPriceMinor:2900,calculation:undefined,
        warnings:["OFFICIAL_SOURCE_NOT_ACQUIRED"]}};
    await persistSuggestedProductPlans([composed,addon]);
    await persistSuggestedProductPlans([composed,addon]);
    const norway=await loadSuggestedProductPlans("NO","NOK");
    assert.equal(norway.find(row=>row.planIdentity===composed.planIdentity)?.suggested?.monthlyPriceMinor,10800);
    assert.deepEqual(norway.find(row=>row.planIdentity===composed.planIdentity)?.suggested?.calculation,calculation);
    assert.equal(norway.find(row=>row.planIdentity===composed.planIdentity)?.suggested?.offerScope,"CALCULATED_TOTAL");
    const historical=norway.find(row=>row.planIdentity===addon.planIdentity);
    assert.equal(historical?.suggested,null);
    assert.equal(historical?.suggestedHistory[0]?.monthlyPriceMinor,2900);
    assert.equal((await pool.query("SELECT count(*)::int n FROM suggested_provider_prices WHERE suggested_id='v4:historical-addon' AND active")).rows[0].n,1);
    const generic:ProductPlanPricing={...composed,
      serviceSlug:"stream-one",countryCode:"SE",planIdentity:"catalog:stream-one:se:ad-free-total:direct:sek",
      planName:"Stream One Without Ads (Calculated Total)",
      suggested:{...composed.suggested!,suggestedId:"v4:generic-total",currency:"SEK",monthlyPriceMinor:12900,
        calculation:{...calculation,currency:"SEK",billingProvider:"Stream One",
          compatibleBasePlan:"Stream One Basic"}},suggestedHistory:[]};
    await persistSuggestedProductPlans([generic]);
    await persistSuggestedProductPlans([generic]);
    const [reloadedGeneric]=await loadSuggestedProductPlans("SE","SEK");
    assert.equal(reloadedGeneric?.suggested?.monthlyPriceMinor,12900);
    assert.equal(reloadedGeneric?.suggested?.calculation?.billingProvider,"Stream One");
    assert.equal(reloadedGeneric?.suggested?.offerScope,"CALCULATED_TOTAL");
    assert.equal((await pool.query("SELECT count(*)::int n FROM suggested_provider_prices WHERE suggested_id='v4:generic-total'")).rows[0].n,1);
  } finally {
    await pool.end();
  }
});
