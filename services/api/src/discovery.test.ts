import assert from "node:assert/strict";
import test from "node:test";
import { askAssistant } from "./assistant.js";
import { validateAddSubscriptionIntent } from "../../../packages/contracts/src/discovery.js";
import { pool } from "./db.js";
import { addSubscription } from "./repositories.js";

test("assistant catalog navigation requires no model credential or subscription mutation",async(t)=>{
  t.mock.method(pool,"query",(()=>{throw new Error("AI MUST NOT WRITE");}) as any);
  for(const message of ["Legg til Spotify Premium.","Jeg har Netflix.","Legg til Viaplay Film & Serier.","Legg til LokalTV Premium."]){
    const result=await askAssistant({message,context:{countryCode:"NO",currency:"NOK"}});
    assert.equal(result.action,null);assert.equal(result.catalogAction?.requiresConfirmation,true);
    assert.ok(validateAddSubscriptionIntent(result.catalogAction,"NO","NOK",[]));
    assert.equal(validateAddSubscriptionIntent(result.catalogAction,"US","USD",[]),null);
  }
});

test("manual repository rejects malformed or masquerading catalog records before SQL",async(t)=>{
  t.mock.method(pool,"query",(()=>{throw new Error("should not query");}) as any);
  const valid={userId:"owner",serviceSlug:"manual",customServiceName:"Local",billingProviderSlug:"direct",countryCode:"NO",currency:"NOK",monthlyPriceMinor:100};
  for(const change of [{monthlyPriceMinor:0},{currency:"USD"},{customServiceName:""},{billingProviderSlug:"fake"},{serviceSlug:"netflix"}])await assert.rejects(addSubscription({...valid,...change}),/INVALID_MANUAL_SUBSCRIPTION/);
});
