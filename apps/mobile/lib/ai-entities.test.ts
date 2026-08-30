import assert from "node:assert/strict";
import test from "node:test";

import {
  resolveBestSubscriptionEntity,
  resolveSubscriptionEntities
} from "./ai-entities.js";

const items = [
  {
    id: "netflix",
    serviceName: "Netflix",
    serviceSlug: "netflix"
  },
  {
    id: "max",
    serviceName: "Max",
    serviceSlug: "max"
  },
  {
    id: "youtube",
    serviceName: "YouTube Premium",
    serviceSlug: "youtube-premium"
  },
  {
    id: "prime",
    serviceName: "Prime Video",
    serviceSlug: "prime-video"
  }
];

test("resolves exact subscription", () => {
  assert.equal(
    resolveBestSubscriptionEntity(
      "tell me about Netflix",
      items
    )?.id,
    "netflix"
  );
});

test("resolves Netflix typo", () => {
  assert.equal(
    resolveBestSubscriptionEntity(
      "what about netlfix",
      items
    )?.id,
    "netflix"
  );
});

test("resolves short Max typo", () => {
  assert.equal(
    resolveBestSubscriptionEntity(
      "what about mx",
      items
    )?.id,
    "max"
  );
});

test("resolves YouTube shorthand", () => {
  assert.equal(
    resolveBestSubscriptionEntity(
      "what about yt",
      items
    )?.id,
    "youtube"
  );
});

test("finds two subscriptions in comparison", () => {
  const resolved =
    resolveSubscriptionEntities(
      "compare netlfix and mx",
      items
    );

  assert.deepEqual(
    resolved
      .slice(0, 2)
      .map(
        (result) =>
          result.item.id
      )
      .sort(),
    ["max", "netflix"]
  );
});

test("does not invent service from unrelated question", () => {
  assert.equal(
    resolveBestSubscriptionEntity(
      "how much am i spending",
      items
    ),
    undefined
  );
});
