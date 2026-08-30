import assert from "node:assert/strict";
import test from "node:test";

import {
  buildSavingsGoalPlan,
  emptyAssistantPreferences,
  isProtectionRequest,
  parseSavingsGoalAmount,
  protectSubscription,
  rankAllowedRecommendations,
  setMonthlySavingsGoal
} from "./ai-preferences.js";

test("parses monthly savings goal", () => {
  assert.equal(
    parseSavingsGoalAmount(
      "I want to save kr 500 a month"
    ),
    50000
  );
});

test("parses cut goal", () => {
  assert.equal(
    parseSavingsGoalAmount(
      "I need to cut 300 kr per month"
    ),
    30000
  );
});

test("detects protection request", () => {
  assert.equal(
    isProtectionRequest(
      "never cancel Spotify"
    ),
    true
  );
});

test("protects subscription once", () => {
  let preferences =
    protectSubscription(
      emptyAssistantPreferences,
      "spotify"
    );

  preferences =
    protectSubscription(
      preferences,
      "spotify"
    );

  assert.deepEqual(
    preferences
      .protectedSubscriptionIds,
    ["spotify"]
  );
});

test("protected subscriptions are excluded from recommendations", () => {
  const preferences =
    protectSubscription(
      emptyAssistantPreferences,
      "netflix"
    );

  const ranked =
    rankAllowedRecommendations(
      [
        {
          id: "netflix",
          serviceName: "Netflix",
          monthlyMinor: 17900,
          status: "ACTIVE"
        },
        {
          id: "max",
          serviceName: "Max",
          monthlyMinor: 12900,
          status: "ACTIVE"
        }
      ],
      preferences
    );

  assert.deepEqual(
    ranked.map(
      (item) => item.id
    ),
    ["max"]
  );
});

test("builds savings goal plan", () => {
  const preferences =
    setMonthlySavingsGoal(
      emptyAssistantPreferences,
      25000
    );

  const result =
    buildSavingsGoalPlan(
      [
        {
          id: "netflix",
          serviceName: "Netflix",
          monthlyMinor: 17900,
          status: "ACTIVE"
        },
        {
          id: "max",
          serviceName: "Max",
          monthlyMinor: 12900,
          status: "ACTIVE"
        },
        {
          id: "prime",
          serviceName: "Prime Video",
          monthlyMinor: 7900,
          status: "ACTIVE"
        }
      ],
      preferences
    );

  assert.ok(result);

  assert.equal(
    result.reachesGoal,
    true
  );

  assert.deepEqual(
    result.selected.map(
      (item) => item.id
    ),
    [
      "netflix",
      "max"
    ]
  );

  assert.equal(
    result.monthlyReductionMinor,
    30800
  );
});

test("goal plan respects protected service", () => {
  let preferences =
    setMonthlySavingsGoal(
      emptyAssistantPreferences,
      20000
    );

  preferences =
    protectSubscription(
      preferences,
      "netflix"
    );

  const result =
    buildSavingsGoalPlan(
      [
        {
          id: "netflix",
          serviceName: "Netflix",
          monthlyMinor: 17900,
          status: "ACTIVE"
        },
        {
          id: "max",
          serviceName: "Max",
          monthlyMinor: 12900,
          status: "ACTIVE"
        },
        {
          id: "prime",
          serviceName: "Prime Video",
          monthlyMinor: 7900,
          status: "ACTIVE"
        }
      ],
      preferences
    );

  assert.ok(result);

  assert.deepEqual(
    result.selected.map(
      (item) => item.id
    ),
    ["max", "prime"]
  );
});
