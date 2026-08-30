import assert from "node:assert/strict";
import test from "node:test";

import {
  emptyAssistantConversationContext,
  isComparisonFollowUp,
  isRenewalFollowUp,
  rememberComparison,
  rememberScenario,
  resolveReferencedSubscriptionId,
  resolveScenarioMonths
} from "./ai-conversation.js";

test("remembers two compared subscriptions", () => {
  const context =
    rememberComparison(
      emptyAssistantConversationContext,
      ["netflix", "max"]
    );

  assert.deepEqual(
    context.comparedSubscriptionIds,
    ["netflix", "max"]
  );

  assert.equal(
    context.lastSubscriptionId,
    "max"
  );
});

test("first one resolves to first comparison item", () => {
  const context =
    rememberComparison(
      emptyAssistantConversationContext,
      ["netflix", "max"]
    );

  assert.equal(
    resolveReferencedSubscriptionId(
      "what if I pause the first one?",
      context
    ),
    "netflix"
  );
});

test("second one resolves to second comparison item", () => {
  const context =
    rememberComparison(
      emptyAssistantConversationContext,
      ["netflix", "max"]
    );

  assert.equal(
    resolveReferencedSubscriptionId(
      "what about the second one?",
      context
    ),
    "max"
  );
});

test("it resolves to last subscription", () => {
  const context =
    rememberScenario(
      emptyAssistantConversationContext,
      "netflix",
      3
    );

  assert.equal(
    resolveReferencedSubscriptionId(
      "when does it renew?",
      context
    ),
    "netflix"
  );
});

test("scenario duration carries forward", () => {
  const context =
    rememberScenario(
      emptyAssistantConversationContext,
      "netflix",
      3
    );

  assert.equal(
    resolveScenarioMonths(
      null,
      context
    ),
    3
  );
});

test("explicit scenario duration overrides memory", () => {
  const context =
    rememberScenario(
      emptyAssistantConversationContext,
      "netflix",
      3
    );

  assert.equal(
    resolveScenarioMonths(
      6,
      context
    ),
    6
  );
});

test("recognizes renewal follow-up", () => {
  assert.equal(
    isRenewalFollowUp(
      "and when does that renew?"
    ),
    true
  );
});

test("recognizes comparison follow-up", () => {
  assert.equal(
    isComparisonFollowUp(
      "which one costs more?"
    ),
    true
  );
});
