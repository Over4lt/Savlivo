import assert from "node:assert/strict";
import test from "node:test";
import { subscriptionsForMarket, formatMarketMinor } from "../../../packages/contracts/src/markets.js";
import { rankSubscriptionsByCost, simulateSubscriptionRemoval } from "./ai-account-reasoning.js";

test("next-wave savings reasoning retains cents and excludes subscriptions in other countries",()=>{
  const markets=[["CH","CHF"],["PL","PLN"],["BR","BRL"],["CZ","CZK"],["MY","MYR"]];
  const subscriptions=markets.flatMap(([countryCode,currency])=>[
    {id:countryCode+"-music",countryCode,currency,serviceName:"Apple Music",status:"ACTIVE",monthlyMinor:1790},
    {id:countryCode+"-tv",countryCode,currency,serviceName:"Apple TV",status:"ACTIVE",monthlyMinor:2990}
  ]);
  const before=structuredClone(subscriptions);
  for(const [cc,currency] of markets){
    const selected=subscriptionsForMarket(subscriptions,cc);
    const ranked=rankSubscriptionsByCost(selected);
    assert.deepEqual(ranked.map(p=>p.id),[cc+"-tv",cc+"-music"]);
    const result=simulateSubscriptionRemoval(ranked[0],selected.reduce((sum,p)=>sum+p.monthlyMinor,0),3)!;
    assert.equal(result.currentMonthlySpendMinor,4780);
    assert.equal(result.savingsMinor,8970);
    assert.equal(result.projectedMonthlySpendMinor,1790);
    assert.match(formatMarketMinor(result.savingsMinor,currency,"en-US"),/89\.70/);
  }
  assert.deepEqual(subscriptions,before);
});

test("international market switching keeps selected AI savings and report amounts separate without rounding cents",()=>{
  const markets=[["IN","INR"],["SG","SGD"],["HK","HKD"],["TW","TWD"],["AE","AED"],["TH","THB"],["PH","PHP"],["NO","NOK"]];
  const items=markets.flatMap(([countryCode,currency])=>[
    {id:countryCode+"-music",countryCode,currency,serviceName:"Apple Music",status:"ACTIVE",monthlyMinor:1198},
    {id:countryCode+"-tv",countryCode,currency,serviceName:"Apple TV",status:"ACTIVE",monthlyMinor:1398}
  ]);
  const before=structuredClone(items);
  for(const[cc,currency]of [...markets,...markets]){
    const selected=subscriptionsForMarket(items,cc);
    assert.deepEqual(selected.map(p=>p.id),[cc+"-music",cc+"-tv"]);
    const ranked=rankSubscriptionsByCost(selected);
    assert.equal(ranked[0].id,cc+"-tv");
    const result=simulateSubscriptionRemoval(ranked[0],selected.reduce((sum,p)=>sum+p.monthlyMinor,0),12)!;
    assert.equal(result.currentMonthlySpendMinor,2596);
    assert.equal(result.projectedMonthlySpendMinor,1198);
    assert.equal(result.savingsMinor,16776);
    assert.match(formatMarketMinor(result.savingsMinor,currency,"en-US"),/167\.76/);
  }
  assert.deepEqual(items,before);
});
