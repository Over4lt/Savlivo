import test from "node:test";
import assert from "node:assert/strict";
import {matchesRegionalPlan} from "./regional-plan-match";

test("saved canonical Max plan resolves to a localized current V3 tier",()=>{
  const no={planSlug:"basic-with-ads",planName:"Basis med reklame"};
  const se={planSlug:"basic-with-ads",planName:"Basic med reklam"};
  const dk={planSlug:"basic-with-ads",planName:"Basic With Ads"};
  for(const row of [no,se,dk])assert.equal(matchesRegionalPlan(row,"Basic With Ads"),true);
  assert.equal(matchesRegionalPlan(no,"Premium"),false);
  assert.equal(matchesRegionalPlan(no,""),false);
  assert.equal(matchesRegionalPlan(no,"Basic With Ads","max"),true);
  assert.equal(matchesRegionalPlan(no,"Basic med reklam","netflix"),false);
  assert.equal(matchesRegionalPlan(se,"Premium","max"),false);
});
