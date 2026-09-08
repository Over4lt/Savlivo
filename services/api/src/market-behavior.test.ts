import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  countryCurrencies, countryCurrencyData, subscriptionsForMarket,
  subscriptionCountry, isCurrentMarketPricing, formatMarketMinor
} from "../../../packages/contracts/src/markets.js";
import { pool } from "./db.js";
import { addSubscription } from "./repositories.js";
import { reminderInstantForRenewal } from "./notification-logic.js";
import { mergeFreshAndPersistedPricing } from "./pricing.js";
import type { AdapterPrice } from "./pricing-adapters.js";

const audit = JSON.parse(readFileSync(new URL("../../../docs/markets/readiness-before.json", import.meta.url), "utf8"));

test("shared definitions preserve every baseline mobile country and API currency", () => {
  for (const code of audit.mobileMarkets) assert.ok(countryCurrencyData.some(([cc]) => cc === code));
  assert.deepEqual(countryCurrencies, audit.apiCurrencies);
  assert.equal(new Set(countryCurrencyData.map(([cc]) => cc)).size, countryCurrencyData.length);
  for (const [cc, , currency] of countryCurrencyData) assert.equal(countryCurrencies[cc], currency);
});

test("switching views preserves a multi-country account, saved amounts and shared-currency separation", () => {
  const items = [
    { id: "no", countryCode: "NO", currency: "NOK", monthlyPriceMinor: 12900 },
    { id: "gb", countryCode: "GB", currency: "GBP", monthlyPriceMinor: 1199 },
    { id: "au", countryCode: "AU", currency: "AUD", monthlyPriceMinor: 1499 },
    { id: "nz", countryCode: "NZ", currency: "NZD", monthlyPriceMinor: 1849 },
    { id: "de", countryCode: "DE", currency: "EUR", monthlyPriceMinor: 999 },
    { id: "fr", countryCode: "FR", currency: "EUR", monthlyPriceMinor: 1099 },
    { id: "legacy-no", currency: "NOK", monthlyPriceMinor: 9900 },
    { id: "ambiguous-eur", currency: "EUR", monthlyPriceMinor: 500 }
  ];
  const before = structuredClone(items);
  for (const country of ["GB", "AU", "NZ", "DE", "FR", "GB"]) {
    assert.deepEqual(subscriptionsForMarket(items, country).map(s => s.id), [country.toLowerCase()]);
  }
  assert.deepEqual(subscriptionsForMarket(items, "NO").map(s => s.id), ["no", "legacy-no"]);
  assert.deepEqual(items, before);
  assert.equal(subscriptionCountry(" gb ", "GBP"), "GB");
  assert.equal(subscriptionCountry("", "NOK"), "NO");
  assert.equal(subscriptionCountry("", "EUR"), undefined);
  assert.equal(subscriptionCountry("AU", "USD"), "AU"); // Saved country is never inferred over.
});

test("late pricing responses and mismatched currency cannot replace the active market snapshot", () => {
  assert.equal(isCurrentMarketPricing({countryCode:"GB",currency:"GBP"},"GB","GB"), true);
  assert.equal(isCurrentMarketPricing({countryCode:"GB",currency:"GBP"},"GB","AU"), false);
  assert.equal(isCurrentMarketPricing({countryCode:"AU",currency:"USD"},"AU","AU"), false);
  assert.equal(isCurrentMarketPricing({countryCode:"DE",currency:"EUR"},"FR","FR"), false);
  assert.equal(isCurrentMarketPricing(null,"NZ","NZ"), false);
});

test("new market currencies and Norway format stored minor amounts without FX", () => {
  assert.equal(formatMarketMinor(1299,"GBP","en-GB"), "£12.99");
  assert.equal(formatMarketMinor(1499,"AUD","en-AU"), "$14.99");
  assert.equal(formatMarketMinor(1849,"NZD","en-NZ"), "$18.49");
  assert.match(formatMarketMinor(12900,"NOK","nb-NO"), /129,00/);
});

test("subscription repository preserves one user and distinct market/currency identities on creation", async (t) => {
  const created: any[] = [];
  t.mock.method(pool, "query", (async (sql: string, params: any[]) => {
    if (sql.includes("INSERT INTO subscriptions")) {
      const item = {id: String(created.length + 1), userId: params[0], countryCode: params[3], monthlyPriceMinor: params[4], currency: params[5]};
      created.push(item);
      return {rows:[{id:item.id}]};
    }
    return {rows:[created.find(item => item.id === params[1])]};
  }) as any);
  for (const [countryCode,currency] of [["GB","GBP"],["AU","AUD"],["NZ","NZD"],["NO","NOK"]]) {
    await addSubscription({userId:"same-account",serviceSlug:"icloud-plus",billingProviderSlug:"apple",countryCode,currency,monthlyPriceMinor:199,planName:"50 GB"});
  }
  assert.equal(created.length, 4);
  assert.ok(created.every(item => item.userId === "same-account" && item.monthlyPriceMinor === 199));
  assert.deepEqual(created.map(item => [item.countryCode,item.currency]), [["GB","GBP"],["AU","AUD"],["NZ","NZD"],["NO","NOK"]]);
});

test("verified persisted market prices survive empty and weaker refreshes without crossing countries", () => {
  const price = {serviceSlug:"icloud-plus",planSlug:"50-gb",planName:"50 GB",billingProviderSlug:"apple",countryCode:"AU",currency:"AUD",monthlyPriceMinor:149,updatedAt:"2026-09-08",source:"official-provider-adapter:icloud-plus",sourceUrl:"https://support.apple.com/en-us/108047",confidence:"official-provider-adapter",priceType:"exact",verification:"authoritative-provider"} as AdapterPrice;
  assert.deepEqual(mergeFreshAndPersistedPricing([], [price]), [price]);
  assert.deepEqual(mergeFreshAndPersistedPricing([{...price, monthlyPriceMinor:1, verification:"single-source"}], [price]), [price]);
});

test("notifications retain user timezone independently of the subscription market", () => {
  for (const timeZone of ["Europe/Oslo","Europe/London","Australia/Sydney","Pacific/Auckland"]) {
    const instant = reminderInstantForRenewal("2026-10-15", timeZone);
    assert.equal(new Intl.DateTimeFormat("en-GB", {timeZone,hour:"2-digit",hourCycle:"h23"}).format(new Date(instant)), "09");
  }
});
