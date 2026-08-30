import assert from "node:assert/strict";
import test from "node:test";

import {
  needsRenewalDateRefresh,
  willSubscriptionRenewOn
} from "./subscription-renewal.js";

test("active subscription will renew", () => {
  assert.equal(
    willSubscriptionRenewOn({
      status: "ACTIVE",
      renewalDate: "2026-09-22"
    }),
    true
  );
});

test("future cancellation after renewal still renews", () => {
  assert.equal(
    willSubscriptionRenewOn({
      status: "CANCELLED",
      statusEffectiveDate: "2026-10-01",
      renewalDate: "2026-09-22"
    }),
    true
  );
});

test("cancellation before renewal suppresses renewal", () => {
  assert.equal(
    willSubscriptionRenewOn({
      status: "CANCELLED",
      statusEffectiveDate: "2026-09-10",
      renewalDate: "2026-09-22"
    }),
    false
  );
});

test("cancellation on renewal date suppresses renewal", () => {
  assert.equal(
    willSubscriptionRenewOn({
      status: "CANCELLED",
      statusEffectiveDate: "2026-09-22",
      renewalDate: "2026-09-22"
    }),
    false
  );
});

test("future pause after renewal still renews", () => {
  assert.equal(
    willSubscriptionRenewOn({
      status: "PAUSED",
      statusEffectiveDate: "2026-10-01",
      renewalDate: "2026-09-22"
    }),
    true
  );
});

test("pause on renewal date suppresses renewal", () => {
  assert.equal(
    willSubscriptionRenewOn({
      status: "PAUSED",
      statusEffectiveDate: "2026-09-22",
      renewalDate: "2026-09-22"
    }),
    false
  );
});

test("inactive subscription without effective date does not renew", () => {
  assert.equal(
    willSubscriptionRenewOn({
      status: "CANCELLED",
      renewalDate: "2026-09-22"
    }),
    false
  );
});

test("active subscription with past renewal date needs renewal refresh", () => {
  assert.equal(
    needsRenewalDateRefresh({
      status: "ACTIVE",
      renewalDate: "2026-08-24",
      todayDateOnly: "2026-08-25"
    }),
    true
  );
});

test("active subscription with renewal today does not need refresh", () => {
  assert.equal(
    needsRenewalDateRefresh({
      status: "ACTIVE",
      renewalDate: "2026-08-25",
      todayDateOnly: "2026-08-25"
    }),
    false
  );
});

test("active subscription with future renewal does not need refresh", () => {
  assert.equal(
    needsRenewalDateRefresh({
      status: "ACTIVE",
      renewalDate: "2026-09-22",
      todayDateOnly: "2026-08-25"
    }),
    false
  );
});

test("cancelled subscription with past renewal does not need refresh", () => {
  assert.equal(
    needsRenewalDateRefresh({
      status: "CANCELLED",
      statusEffectiveDate: "2026-08-20",
      renewalDate: "2026-08-24",
      todayDateOnly: "2026-08-25"
    }),
    false
  );
});

test("future cancellation with past renewal needs renewal refresh", () => {
  assert.equal(
    needsRenewalDateRefresh({
      status: "CANCELLED",
      statusEffectiveDate: "2026-09-22",
      renewalDate: "2026-08-24",
      todayDateOnly: "2026-08-25"
    }),
    true
  );
});
