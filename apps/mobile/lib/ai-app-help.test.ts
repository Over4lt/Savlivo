import assert from "node:assert/strict";
import test from "node:test";

import {
  findSavlivoHelpTopic,
  getSavlivoHelp
} from "./ai-app-help.js";

test("understands Autopilot typo", () => {
  assert.equal(
    findSavlivoHelpTopic(
      "what does autpilot do"
    ),
    "autopilot"
  );
});

test("understands renewal typo", () => {
  assert.equal(
    findSavlivoHelpTopic(
      "explain my renwal date"
    ),
    "renewals"
  );
});

test("understands country typo", () => {
  assert.equal(
    findSavlivoHelpTopic(
      "how do i chnage cuntry"
    ),
    "region"
  );
});

test("explains reviewable spend", () => {
  const answer =
    getSavlivoHelp(
      "what is reviewable spend"
    );

  assert.match(
    answer,
    /not the same as guaranteed savings/i
  );
});

test("explains saved so far as recorded", () => {
  const answer =
    getSavlivoHelp(
      "what does saved so far mean"
    );

  assert.match(
    answer,
    /already recorded/i
  );
});

test("does not claim Autopilot silently changes subscriptions", () => {
  const answer =
    getSavlivoHelp(
      "how does autopilot work"
    );

  assert.match(
    answer,
    /asks before/i
  );
});
