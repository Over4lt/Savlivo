import assert from "node:assert/strict";
import test from "node:test";

import {
  compareSubscriptions,
  parseScenarioMonths,
  rankSubscriptionsByCost,
  simulateSubscriptionRemoval,
  subscriptionsWithDataIssues,
  upcomingRenewalItems
} from "./ai-account-reasoning.js";

const netflix = {
  id: "netflix",
  serviceName: "Netflix",
  status: "ACTIVE",
  monthlyMinor: 1799,
  renewalDate: "2026-09-12"
};

const max = {
  id: "max",
  serviceName: "Max",
  status: "ACTIVE",
  monthlyMinor: 999,
  renewalDate: "2026-09-05"
};

const spotify = {
  id: "spotify",
  serviceName: "Spotify",
  status: "ACTIVE",
  monthlyMinor: 1199,
  renewalDate: "2026-10-01"
};

test("ranks active subscriptions by monthly cost", () => {
  const ranked =
    rankSubscriptionsByCost([
      max,
      netflix,
      spotify
    ]);

  assert.deepEqual(
    ranked.map(
      (item) => item.serviceName
    ),
    [
      "Netflix",
      "Spotify",
      "Max"
    ]
  );
});

test("does not rank paused subscriptions as active spend", () => {
  const ranked =
    rankSubscriptionsByCost([
      netflix,
      {
        ...max,
        status: "PAUSED",
        monthlyMinor: 5000
      }
    ]);

  assert.deepEqual(
    ranked.map(
      (item) => item.serviceName
    ),
    ["Netflix"]
  );
});

test("compares subscription prices", () => {
  const result =
    compareSubscriptions(
      netflix,
      max
    );

  assert.ok(result);
  assert.equal(
    result.differenceMinor,
    800
  );
});

test("simulates three month pause", () => {
  const result =
    simulateSubscriptionRemoval(
      netflix,
      4997,
      3
    );

  assert.ok(result);

  assert.equal(
    result.savingsMinor,
    5397
  );

  assert.equal(
    result.projectedMonthlySpendMinor,
    3198
  );
});

test("scenario does not simulate inactive subscription as new savings", () => {
  const result =
    simulateSubscriptionRemoval(
      {
        ...netflix,
        status: "PAUSED"
      },
      4997,
      3
    );

  assert.equal(
    result,
    null
  );
});

test("understands numeric month scenario", () => {
  assert.equal(
    parseScenarioMonths(
      "what if I pause Netflix for 4 months?"
    ),
    4
  );
});

test("understands a month", () => {
  assert.equal(
    parseScenarioMonths(
      "what if I pause Netflix for a month?"
    ),
    1
  );
});

test("understands written three months", () => {
  assert.equal(
    parseScenarioMonths(
      "pause Netflix for three months"
    ),
    3
  );
});

test("understands a year", () => {
  assert.equal(
    parseScenarioMonths(
      "what would I save over a year?"
    ),
    12
  );
});

test("sorts upcoming renewals", () => {
  const renewals =
    upcomingRenewalItems(
      [
        netflix,
        spotify,
        max
      ],
      "2026-08-25"
    );

  assert.deepEqual(
    renewals.map(
      (item) => item.serviceName
    ),
    [
      "Max",
      "Netflix",
      "Spotify"
    ]
  );
});

test("ignores past renewals", () => {
  const renewals =
    upcomingRenewalItems(
      [
        {
          ...max,
          renewalDate:
            "2026-08-20"
        },
        netflix
      ],
      "2026-08-25"
    );

  assert.deepEqual(
    renewals.map(
      (item) => item.serviceName
    ),
    ["Netflix"]
  );
});

test("finds subscriptions with data issues", () => {
  const result =
    subscriptionsWithDataIssues([
      netflix,
      {
        ...max,
        dataIssues: [
          "renewal date",
          "billing route"
        ]
      }
    ]);

  assert.deepEqual(
    result.map(
      (item) => item.serviceName
    ),
    ["Max"]
  );
});
