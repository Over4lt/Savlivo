import assert from "node:assert/strict";
import test from "node:test";
import {URL} from "node:url";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";
import ts from "typescript";
import * as catalog from "../../../packages/contracts/src/catalog";
import {modelActionCandidate,resolveSavedManagement,managementActions} from "../../../packages/contracts/src/assistant-actions";
import {discoveryRequestIsCurrent} from "../../../packages/contracts/src/discovery";
import {openSubscriptionManagementBrowser} from "./subscription-management-browser";

// Exercise the actual routing module; mock only React Native's native Linking boundary.
const module={exports:{}};
runInNewContext(ts.transpileModule(readFileSync(new URL("../src/providerRouting.ts",import.meta.url),"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{
  exports:module.exports,module,require:(name:string)=>{
    if(name==="react-native")return {Linking:{canOpenURL:async()=>false,openURL:async()=>{}}};
    if(name.endsWith("/catalog"))return catalog;
    throw new Error(`Unexpected routing dependency ${name}`);
  }
});
const routing=module.exports as typeof import("../src/providerRouting");
const bill={id:"a",serviceSlug:"netflix",serviceName:"Netflix",countryCode:"NO",currency:"NOK",billingProviderSlug:"direct",status:"ACTIVE"};
const intent=(serviceQuery="Netflix",managementAction="CANCEL")=>modelActionCandidate({type:"MANAGEMENT",serviceQuery,managementAction},"NO","NOK");

test("all 6300 baseline management destinations and Viaplay instructions remain unchanged",()=>{
  const baseline=JSON.parse(readFileSync(new URL("../../../docs/catalog/baseline-60362c6.json",import.meta.url),"utf8"));let count=0;
  for(const market of baseline.markets)for(const service of baseline.managementProfiles[market.managementProfile])for(const[billingProviderSlug,url]of Object.entries(service.routes)){
    assert.equal(routing.getSubscriptionManagementUrl({serviceSlug:service.service,billingProviderSlug,countryCode:market.country,action:"CANCEL"}),url);count++;
  }
  assert.equal(count,6300);
  assert.equal(routing.getSubscriptionManagementUrl({serviceSlug:"viaplay",billingProviderSlug:"direct",countryCode:"NO",action:"MANAGE"}),"https://help.viaplay.com/nb/cancel-package/");
});

test("saved direct cancel and store routes use existing metadata, never model URLs or billing",()=>{
  for(const [route,expected]of [["direct","https://www.netflix.com/cancelplan"],["apple","https://apps.apple.com/account/subscriptions"],["google-play","https://play.google.com/store/account/subscriptions"],["carrier",null]]){
    const resolved=resolveSavedManagement({...intent(),url:"https://evil.invalid",billingProviderSlug:"direct"},[{...bill,billingProviderSlug:route!}],"NO","NOK");
    if(resolved.kind!=="subscription")assert.fail();
    assert.equal(routing.getSubscriptionManagementUrl({...resolved.subscription,action:resolved.action}),expected);
  }
});

test("manage change-plan and payment use general metadata without pretending action-specific support",()=>{
  for(const action of ["MANAGE","CHANGE_PLAN","BILLING"] as const)assert.equal(routing.getSubscriptionManagementUrl({...bill,action}),"https://www.netflix.com/account");
  assert.equal(routing.supportsSubscriptionAction("spotify","direct","PAUSE"),false);
  assert.equal(routing.getSubscriptionManagementUrl({...bill,serviceSlug:"spotify",action:"PAUSE"}),"https://www.spotify.com/account/");
  assert.equal(routing.getSubscriptionManagementUrl({...bill,serviceSlug:"unknown-provider",action:"MANAGE"}),null);
  assert.equal(routing.getSubscriptionManagementUrl({...bill,serviceSlug:"manual",action:"BILLING"}),null);
});

test("ambiguous records, arbitrary IDs, missing records and foreign-market bills cannot be guessed",()=>{
  const second={...bill,id:"b",billingProviderSlug:"apple"};
  assert.equal(resolveSavedManagement({...intent(),subscriptionId:"a"},[bill,second],"NO","NOK").kind,"ambiguous");
  assert.equal(resolveSavedManagement(intent(""),[bill,second],"NO","NOK").kind,"ambiguous");
  assert.equal(resolveSavedManagement(intent(),[{...bill,countryCode:"BR",currency:"BRL"}],"NO","NOK").kind,"missing");
  assert.equal(resolveSavedManagement(intent(),[bill],"BR","BRL").kind,"invalid");
  assert.equal(resolveSavedManagement(intent("Netflx"),[bill],"NO","NOK").kind,"missing");
  assert.equal(resolveSavedManagement(intent(),[{...bill,billingProviderSlug:"unknown"}],"NO","NOK").kind,"invalid");
});

test("manual subscriptions match actual saved names without gaining provider metadata",()=>{
  const manual={...bill,serviceSlug:"manual",serviceName:"LokalTV"};
  const resolved=resolveSavedManagement(intent("LokalTV"),[manual],"NO","NOK");
  if(resolved.kind!=="subscription")assert.fail();
  assert.equal(routing.getSubscriptionManagementUrl({...resolved.subscription,action:resolved.action}),null);
  assert.equal(resolveSavedManagement(intent("manual"),[manual],"NO","NOK").kind,"missing");
});

test("management candidates cannot mutate a subscription, browser cancel/dismiss only return navigation success",async()=>{
  const before=structuredClone(bill);
  for(const action of managementActions){
    const resolved=resolveSavedManagement(intent("Netflix",action),[bill],"NO","NOK");
    assert.equal(resolved.kind,"subscription");assert.equal("url" in resolved,false);assert.equal("save" in resolved,false);
  }
  for(const type of ["cancel","dismiss"]){
    let external=0;
    assert.equal(await openSubscriptionManagementBrowser("https://www.netflix.com/account",{platform:"ios",openSystemBrowser:async()=>({type}),openExternal:async()=>{external++;return true;}}),true);
    assert.equal(external,0);
  }
  assert.deepEqual(bill,before);
  assert.equal(discoveryRequestIsCurrent({countryCode:"NO",epoch:1},{countryCode:"NO",epoch:2}),false);
});
