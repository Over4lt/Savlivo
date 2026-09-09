import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import ts from "typescript";
import { subscriptionForClient, subscriptionEditIdentity, supportsManualSubscriptions } from "./subscription-format.js";

// Execute actual Build 12 candidate code, not a rewrite of its deduplication.
const source = execFileSync("git", ["show", "202c09f25f3d3ef4a1f88268c8c15f18f5b42227:apps/mobile/app/index.tsx"], { encoding: "utf8" });
const start = source.indexOf("    const deduped = new Map");
const end = source.indexOf("    setUserId(me.user.id);", start);
assert.ok(start >= 0 && end > start);
const refresh = new Function("subs", ts.transpile(source.slice(start, end) + "\nreturn [...deduped.values()];", { target: ts.ScriptTarget.ES2022 }));
const row = (id: string, serviceSlug = "manual", countryCode = "NO") => ({ id, serviceSlug, countryCode, serviceName: `User name ${id}`, customServiceName: serviceSlug === "manual" ? `User name ${id}` : null, billingProviderSlug: "direct", currency: "NOK", monthlyPriceMinor: 12345, savedSoFarMinor: 500, status: "ACTIVE", planName: "My plan" });

for (const count of [0, 1, 2, 3]) test(`actual Build 12 refresh preserves ${count} same-route manual records`, () => {
  const original = Array.from({ length: count }, (_, i) => row(String(i)));
  const received = refresh({ items: original.map(item => subscriptionForClient(item, false)) });
  assert.equal(received.length, count);
  assert.deepEqual(received.map((item: any) => item.id), original.map(item => item.id));
  assert.equal(received.reduce((sum: number, item: any) => sum + item.monthlyPriceMinor, 0), count * 12345);
  assert.equal(received.reduce((sum: number, item: any) => sum + item.savedSoFarMinor, 0), count * 500);
});

test("mixed catalog/manual lists preserve selected-market PDF inputs", () => {
  const known = row("catalog", "netflix");
  const input = [known, row("one"), row("two"), row("other", "manual", "US")];
  const output = refresh({ items: input.map(item => subscriptionForClient(item, false)) });
  assert.equal(output.length, 4);
  assert.equal(subscriptionForClient(known, false), known);
  const a = source.indexOf("const reportItems = items.filter(");
  const b = source.indexOf(";", a);
  assert.ok(a >= 0 && b > a);
  const filter = new Function("items", "selectedCountryCode", ts.transpile(source.slice(a, b + 1) + "return reportItems;", { target: ts.ScriptTarget.ES2022 }));
  assert.equal(filter(output, "NO").length, 3);
  assert.equal(filter(output, "US").length, 1);
  assert.deepEqual(output.map((item: any) => item.serviceName), input.map(item => item.serviceName));
});

test("modern records and internal AI identity never gain transport aliases", () => {
  const manual = row("one");
  assert.equal(subscriptionForClient(manual, true), manual);
  const legacy = subscriptionForClient(manual, false);
  assert.equal(legacy.serviceSlug, "manual:one");
  assert.equal(manual.serviceSlug, "manual");
  assert.equal(legacy.customServiceName, manual.customServiceName);
  assert.equal(Object.keys(legacy).length, Object.keys(manual).length);
});

test("explicit capability selects format, not version or role claims", () => {
  assert.equal(supportsManualSubscriptions({}), false);
  assert.equal(supportsManualSubscriptions({ "x-app-version": "13", role: "admin" }), false);
  assert.equal(supportsManualSubscriptions({ "x-savlivo-subscription-format": "manual-v1" }), true);
  assert.equal(supportsManualSubscriptions({ "x-savlivo-subscription-format": ["manual-v1"] }), false);
});

test("legacy edit requires matching URL identity; modern aliases and mismatches rejected", () => {
  assert.deepEqual(subscriptionEditIdentity("manual:one", "one", false), { serviceSlug: "manual", preserveManualIdentity: true });
  assert.throws(() => subscriptionEditIdentity("manual:two", "one", false));
  assert.throws(() => subscriptionEditIdentity("manual:one", "one", true));
  assert.deepEqual(subscriptionEditIdentity("manual", "one", true), { serviceSlug: "manual", preserveManualIdentity: false });
  assert.deepEqual(subscriptionEditIdentity("netflix", "one", false), { serviceSlug: "netflix", preserveManualIdentity: false });
});

test("actual Build 12 edit body round-trips the alias without inventing a custom name", () => {
  const a = source.indexOf("    const body = {", source.indexOf("async function saveServiceForm"));
  const b = source.indexOf("    try {", a);
  assert.ok(a >= 0 && b > a);
  const body = new Function("serviceSlugInput", "billingProviderInput", "selectedCountryCode", "monthly", "subscriptionCurrency", "renewalDateInput", "normalizeDateOnly", "subscriptionPlanInput",
    ts.transpile(source.slice(a, b) + "return body;", { target: ts.ScriptTarget.ES2022 }))(
      "manual:one", "carrier", "NO", 123.45, "NOK", "2026-10-01", (x: string) => x, "My plan");
  assert.equal(body.serviceSlug, "manual:one");
  assert.equal(body.monthlyPriceMinor, 12345);
  assert.equal(body.customServiceName, undefined);
  assert.deepEqual(subscriptionEditIdentity(body.serviceSlug, "one", false), { serviceSlug: "manual", preserveManualIdentity: true });
});
