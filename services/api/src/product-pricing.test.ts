import assert from "node:assert/strict";
import test from "node:test";
import {
  productPriceRows,
  productPriceStatus,
  summarizeProductPricing,
  type ProductPlanPricing
} from "../../../packages/contracts/src/product-pricing.js";
import type {AdapterPrice} from "./pricing-adapters.js";
import {
  mergeProductPlans,
  projectCatalogProductPlans,
  projectCombinedResearchProductPlans
} from "./product-pricing.js";

const suggested = (amount: number, extra: Record<string, unknown> = {}) => ({
  suggestedId: `suggested:${amount}:${String(extra.provenance ?? "v3")}`,
  plan: "Premium",
  amount,
  currency: "EUR",
  paymentCadence: "MONTHLY_RECURRING",
  sourceUrl: "https://provider.example/pricing",
  researchedAt: "2026-10-13T10:00:00Z",
  warnings: [],
  provenance: "V3_SOURCE_RESEARCH",
  ...extra
});
const verified = (amount: number) => ({
  plan: "Premium",
  amount,
  currency: "EUR",
  sourceUrl: "https://provider.example/pricing",
  verifiedAt: "2026-10-13T11:00:00Z",
  provenance: "V3_VERIFIED"
});
const combined = (plan: Record<string, unknown>) => ({
  kind: "CombinedResearchResult",
  plans: [{
    planIdentity: "provider:de:premium",
    activeSuggested: null,
    suggestedHistory: [],
    verified: [],
    ...plan
  }]
});
const project = (plan: Record<string, unknown>) =>
  projectCombinedResearchProductPlans({
    serviceSlug: "provider",
    billingProviderSlug: "direct",
    countryCode: "DE",
    combined: combined(plan)
  })[0];

test("A Suggested only", () => {
  const plan = project({activeSuggested: suggested(13.99)});
  assert.equal(productPriceStatus(plan), "SUGGESTED_ONLY");
  assert.equal(plan.verified.length, 0);
});

test("B Verified only", () => {
  const plan = project({verified: [verified(12.99)]});
  assert.equal(productPriceStatus(plan), "VERIFIED_ONLY");
  assert.equal(plan.suggested, null);
});

test("C Suggested equals Verified", () => {
  const plan = project({activeSuggested: suggested(12.99), verified: [verified(12.99)]});
  assert.equal(productPriceStatus(plan), "SUGGESTED_AND_VERIFIED_MATCH");
  assert.equal(productPriceRows(plan).rows.length, 2);
});

test("D Suggested differs from Verified", () => {
  const plan = project({activeSuggested: suggested(13.99), verified: [verified(12.99)]});
  assert.equal(productPriceStatus(plan), "SUGGESTED_AND_VERIFIED_CONFLICT");
  assert.deepEqual(productPriceRows(plan).rows.map(row => row.monthlyPriceMinor), [1399, 1299]);
});

test("E Suggested, Verified and User Override all remain available", () => {
  const plan = project({activeSuggested: suggested(13.99), verified: [verified(12.99)]});
  const result = productPriceRows(plan, 1199, "EUR");
  assert.deepEqual(result.rows.map(row => row.monthlyPriceMinor), [1399, 1299, 1199]);
  assert.equal(result.effectivePersonalMonthlyPriceMinor, 1199);
});

test("F V4 history, V3 active and Verified use one exact logical plan", () => {
  const plan = project({
    activeSuggested: suggested(12.99, {originSuggestedId: "v4:premium"}),
    suggestedHistory: [suggested(13.99, {
      suggestedId: "v4:premium",
      provenance: "GOOGLE_AI_V4",
      plan: "Provider Premium Monthly"
    })],
    verified: [verified(12.99)]
  });
  assert.equal(plan.planIdentity, "provider:de:premium");
  assert.equal(plan.suggestedHistory.length, 1);
  assert.equal(plan.verified.length, 1);
  assert.equal(projectCombinedResearchProductPlans({
    serviceSlug: "provider",
    billingProviderSlug: "direct",
    countryCode: "DE",
    combined: combined({
      activeSuggested: suggested(12.99),
      suggestedHistory: [suggested(13.99)],
      verified: [verified(12.99)]
    })
  }).length, 1);
});

test("G Suggested warning and provenance remain internal", () => {
  const plan = project({activeSuggested: suggested(13.99, {
    warnings: ["BILLING_ROUTE_UNRESOLVED"],
    provenance: "V3_SOURCE_RESEARCH"
  })});
  assert.deepEqual(plan.suggested?.warnings, ["BILLING_ROUTE_UNRESOLVED"]);
  assert.equal(plan.suggested?.provenance, "V3_SOURCE_RESEARCH");
  assert.equal(plan.suggested?.sourceUrl, "https://provider.example/pricing");
});

test("H No price", () => {
  const empty: ProductPlanPricing = {
    planIdentity: "provider:de:empty",
    serviceSlug: "provider",
    planName: "Empty",
    billingProviderSlug: "direct",
    countryCode: "DE",
    suggested: null,
    suggestedHistory: [],
    verified: []
  };
  assert.equal(productPriceStatus(empty), "NO_PRICE");
  assert.deepEqual(projectCombinedResearchProductPlans({
    serviceSlug: "provider",
    billingProviderSlug: "direct",
    countryCode: "DE",
    combined: combined({})
  }), []);
});

test("I Suggested conflict cannot overwrite Verified", () => {
  const suggestedPlan = project({activeSuggested: suggested(21.99)});
  const verifiedPlan = project({verified: [verified(19.99)]});
  const [merged] = mergeProductPlans([suggestedPlan], [verifiedPlan]);
  assert.equal(merged.suggested?.monthlyPriceMinor, 2199);
  assert.equal(merged.verified[0].monthlyPriceMinor, 1999);
  assert.equal(productPriceStatus(merged), "SUGGESTED_AND_VERIFIED_CONFLICT");
});

test("J User Override remains effective with Suggested and Verified", () => {
  const plan = project({activeSuggested: suggested(13.99), verified: [verified(12.99)]});
  assert.equal(productPriceRows(plan, 1199, "EUR").effectivePersonalMonthlyPriceMinor, 1199);
});

test("Admin coverage reports all five observational states", () => {
  const plans = [
    project({activeSuggested: suggested(13.99)}),
    project({verified: [verified(12.99)]}),
    project({activeSuggested: suggested(12.99), verified: [verified(12.99)]}),
    project({activeSuggested: suggested(13.99), verified: [verified(12.99)]})
  ].map((plan, index) => ({...plan, planIdentity: `${plan.planIdentity}:${index}`, planName: `Plan ${index}`}));
  const coverage = summarizeProductPricing(plans, ["provider", "missing-provider"]);
  assert.deepEqual(coverage.statusCounts, {
    SUGGESTED_ONLY: 1,
    VERIFIED_ONLY: 1,
    SUGGESTED_AND_VERIFIED_MATCH: 1,
    SUGGESTED_AND_VERIFIED_CONFLICT: 1,
    NO_PRICE: 1
  });
  assert.equal(coverage.providersWithSuggested, 1);
  assert.equal(coverage.plansWithSuggested, 3);
  assert.equal(coverage.providersWithVerified, 1);
  assert.equal(coverage.plansWithVerified, 3);
  assert.equal(coverage.suggestedVerifiedOverlap, 2);
  assert.equal(coverage.suggestedVerifiedConflicts, 1);
});

const catalogPrice = (
  serviceSlug: string,
  planSlug: string,
  planName: string,
  monthlyPriceMinor: number
): AdapterPrice => ({
  serviceSlug,
  planSlug,
  planName,
  billingProviderSlug: "direct",
  countryCode: "DE",
  currency: "EUR",
  monthlyPriceMinor,
  updatedAt: "2026-10-13T00:00:00Z",
  source: "oracle-fixture",
  sourceUrl: "https://provider.example/pricing",
  confidence: "official-provider-adapter",
  priceType: "exact",
  verification: "authoritative-provider"
});

test("Wahoo DE Verified oracle remains Core 4.99 and Pro 17.99", () => {
  const plans = projectCatalogProductPlans([
    catalogPrice("wahoo", "core", "Core", 499),
    catalogPrice("wahoo", "pro", "Pro", 1799)
  ]);
  assert.deepEqual(plans.map(plan => plan.verified[0].monthlyPriceMinor), [499, 1799]);
});

test("Chess.com DE Verified oracle remains Gold 6.99, Platinum 11.00 and Diamond 17.99", () => {
  const plans = projectCatalogProductPlans([
    catalogPrice("chess-com", "gold", "Gold", 699),
    catalogPrice("chess-com", "platinum", "Platinum", 1100),
    catalogPrice("chess-com", "diamond", "Diamond", 1799)
  ]);
  assert.deepEqual(plans.map(plan => plan.verified[0].monthlyPriceMinor), [699, 1100, 1799]);
});
