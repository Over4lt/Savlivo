import test from "node:test";
import assert from "node:assert/strict";
import type { ProductPlanPricing, ProductPriceEvidence } from "../../../packages/contracts/src/product-pricing";
import { automaticPlanPrice, matchingRegionalProductPlan, regionalProductPlanOptions } from "./regional-product-pricing";

const evidence = (minor: number, currency = "NOK"): ProductPriceEvidence => ({
  monthlyPriceMinor: minor, currency, paymentCadence: "MONTHLY_RECURRING",
  warnings: [], provenance: "test"
});
const plan = (name: string, changes: Partial<ProductPlanPricing> = {}): ProductPlanPricing => ({
  planIdentity: `catalog:max:no:${name.toLowerCase().replace(/\W+/g, "-")}:direct:nok`,
  serviceSlug: "max", planName: name, billingProviderSlug: "direct", countryCode: "NO",
  suggested: null, suggestedHistory: [], verified: [], oldVerified: [], ...changes
});
const selection = { serviceSlug: "max", billingProviderSlug: "direct", countryCode: "NO", currency: "NOK" };
const options = (plans: ProductPlanPricing[]) => regionalProductPlanOptions(plans, selection);

test("active price priority is Verified, Suggested, then Old Verified for one plan identity", () => {
  const all = options([plan("Standard", { verified: [evidence(12900)], suggested: evidence(13900), oldVerified: [evidence(11900)] })]);
  assert.deepEqual([all[0].priceStatus, all[0].monthlyPriceMinor], ["VERIFIED", 12900]);
  const suggested = options([plan("Standard", { suggested: evidence(13900), oldVerified: [evidence(11900)] })]);
  assert.deepEqual([suggested[0].priceStatus, suggested[0].monthlyPriceMinor], ["SUGGESTED", 13900]);
  const old = options([plan("Standard", { oldVerified: [evidence(11900)] })]);
  assert.deepEqual([old[0].priceStatus, old[0].monthlyPriceMinor], ["OLD_VERIFIED", 11900]);
  assert.deepEqual([options([plan("Standard", { suggested: evidence(13900) })])[0].priceStatus], ["SUGGESTED"]);
});

test("ad supported and ad free base tiers remain separate; an ad free add-on is excluded", () => {
  const plans = options([
    plan("Basic With Ads", { suggested: evidence(7900) }),
    plan("Standard", { suggested: evidence(12900) }),
    plan("Premium Ad Free", { verified: [evidence(16900)] })
  ]);
  assert.equal(plans.length, 3);
  assert.equal(matchingRegionalProductPlan(plans, "Basic With Ads")?.monthlyPriceMinor, 7900);
  assert.equal(matchingRegionalProductPlan(plans, "Premium Ad Free")?.monthlyPriceMinor, 16900);
  assert.equal(regionalProductPlanOptions([
    plan("Ad Free", { serviceSlug: "prime-video", suggested: evidence(2900) }),
    plan("Amazon Prime", { serviceSlug: "prime-video", suggested: evidence(7900) }),
    plan("Prime Video", { serviceSlug: "prime-video", suggested: evidence(6900) })
  ], { ...selection, serviceSlug: "prime-video" }).map(option => option.planName).join(","), "Prime Video");
});

test("market, service, provider and currency are isolated without matching by amount", () => {
  const rows = options([
    plan("Standard", { suggested: evidence(12900) }),
    plan("Standard", { billingProviderSlug: "apple", suggested: evidence(12900) }),
    plan("Standard", { countryCode: "SE", suggested: evidence(12900) }),
    plan("Standard", { serviceSlug: "netflix", suggested: evidence(12900) }),
    plan("Premium", { suggested: evidence(12900, "SEK") })
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].planName, "Standard");
  const mixedCurrency = options([plan("Standard", { verified: [evidence(999, "USD")], suggested: evidence(12900) })]);
  assert.equal(mixedCurrency[0].priceStatus, "SUGGESTED");
});

test("conflicting Verified and unresolved identities never produce automatic prices", () => {
  assert.equal(options([plan("Standard", { verified: [evidence(12900), evidence(13900)], suggested: evidence(11900) })]).length, 0);
  const sameName = options([
    plan("Standard", { planIdentity: "one", suggested: evidence(12900) }),
    plan("Standard", { planIdentity: "two", suggested: evidence(13900) })
  ]);
  assert.equal(matchingRegionalProductPlan(sameName, "Standard"), null);
  assert.equal(options([plan("Standard", { suggested: evidence(12900) }), plan("Standard", { suggested: evidence(12900) })]).length, 0);
  assert.equal(options([plan("a".repeat(64), { suggested: evidence(12900) })]).length, 0);
});

test("saved user price is preserved when editing; explicit automatic price stays available", () => {
  const selected = options([plan("Basic With Ads", { suggested: evidence(7900) })])[0];
  assert.equal(automaticPlanPrice(selected, false), 7900);
  assert.equal(automaticPlanPrice(selected, true), null);
  assert.equal(matchingRegionalProductPlan([selected], "Basic With Ads")?.priceStatus, "SUGGESTED");
  assert.equal(automaticPlanPrice(null, false), null);
});
