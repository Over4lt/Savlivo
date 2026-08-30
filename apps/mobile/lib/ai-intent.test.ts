import assert from "node:assert/strict";
import test from "node:test";

import {
  assistantContains,
  classifySubscriptionIntent,
  normalizeAssistantText
} from "./ai-intent.js";

test("normalizes punctuation and plus", () => {
  assert.equal(
    normalizeAssistantText("Disney+!!!"),
    "disney plus"
  );
});

test("pause request is an action", () => {
  assert.deepEqual(
    classifySubscriptionIntent(
      "pause Netflix"
    ),
    {
      kind: "ACTION",
      action: "PAUSE"
    }
  );
});

test("pause typo is understood", () => {
  assert.deepEqual(
    classifySubscriptionIntent(
      "paus netlfix"
    ),
    {
      kind: "ACTION",
      action: "PAUSE"
    }
  );
});

test("cancel typo is understood", () => {
  assert.deepEqual(
    classifySubscriptionIntent(
      "cansel netflix"
    ),
    {
      kind: "ACTION",
      action: "CANCEL"
    }
  );
});

test("reactivate typo is understood", () => {
  assert.deepEqual(
    classifySubscriptionIntent(
      "reactivte max"
    ),
    {
      kind: "ACTION",
      action: "REACTIVATE"
    }
  );
});

test("resume means reactivate", () => {
  assert.deepEqual(
    classifySubscriptionIntent(
      "resume Max"
    ),
    {
      kind: "ACTION",
      action: "REACTIVATE"
    }
  );
});

test("renewal typo is understood", () => {
  assert.deepEqual(
    classifySubscriptionIntent(
      "when is my next renwal"
    ),
    {
      kind: "RENEWAL_INFO"
    }
  );
});

test("renew does not mean reactivate", () => {
  assert.deepEqual(
    classifySubscriptionIntent(
      "renew Netflix"
    ),
    {
      kind: "RENEWAL_INFO"
    }
  );
});

test("spending question is recognized", () => {
  assert.deepEqual(
    classifySubscriptionIntent(
      "how much am i speding?"
    ),
    {
      kind: "SPENDING_INFO"
    }
  );
});

test("savings question is recognized", () => {
  assert.deepEqual(
    classifySubscriptionIntent(
      "how much have i savd?"
    ),
    {
      kind: "SAVINGS_INFO"
    }
  );
});

test("autopilot help survives typo", () => {
  assert.deepEqual(
    classifySubscriptionIntent(
      "how does autpilot work?"
    ),
    {
      kind: "APP_HELP",
      topic: "autopilot"
    }
  );
});

test("settings navigation survives typo", () => {
  assert.deepEqual(
    classifySubscriptionIntent(
      "take me to setings"
    ),
    {
      kind: "NAVIGATION",
      screen: "settings"
    }
  );
});

test("subscriptions navigation works", () => {
  assert.deepEqual(
    classifySubscriptionIntent(
      "open subscriptions"
    ),
    {
      kind: "NAVIGATION",
      screen: "subscriptions"
    }
  );
});

test("multiword fuzzy matching works", () => {
  assert.equal(
    assistantContains(
      "how do i chnage cuntry",
      ["change country"]
    ),
    true
  );
});
