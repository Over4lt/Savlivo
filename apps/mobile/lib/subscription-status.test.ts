import assert from "node:assert/strict";
import test from "node:test";

import {
  effectiveSubscriptionStatus
} from "./subscription-status.js";

const today = "2026-08-25";

test("future cancellation remains effectively active", () => {
  assert.equal(
    effectiveSubscriptionStatus({
      status: "CANCELLED",
      statusEffectiveDate: "2026-09-22",
      todayDateOnly: today
    }),
    "ACTIVE"
  );
});

test("cancellation effective today is cancelled", () => {
  assert.equal(
    effectiveSubscriptionStatus({
      status: "CANCELLED",
      statusEffectiveDate: "2026-08-25",
      todayDateOnly: today
    }),
    "CANCELLED"
  );
});

test("past cancellation is cancelled", () => {
  assert.equal(
    effectiveSubscriptionStatus({
      status: "CANCELLED",
      statusEffectiveDate: "2026-08-20",
      todayDateOnly: today
    }),
    "CANCELLED"
  );
});

test("future pause remains effectively active", () => {
  assert.equal(
    effectiveSubscriptionStatus({
      status: "PAUSED",
      statusEffectiveDate: "2026-09-01",
      todayDateOnly: today
    }),
    "ACTIVE"
  );
});

test("pause effective today is paused", () => {
  assert.equal(
    effectiveSubscriptionStatus({
      status: "PAUSED",
      statusEffectiveDate: "2026-08-25",
      todayDateOnly: today
    }),
    "PAUSED"
  );
});

test("active subscription remains active", () => {
  assert.equal(
    effectiveSubscriptionStatus({
      status: "ACTIVE",
      statusEffectiveDate: "2026-01-01",
      todayDateOnly: today
    }),
    "ACTIVE"
  );
});
