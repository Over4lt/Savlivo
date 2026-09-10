import assert from "node:assert/strict";
import test from "node:test";
import { askAssistant } from "./assistant.js";
import { parseAddSubscriptionIntent, validateAddSubscriptionIntent } from "../../../packages/contracts/src/discovery.js";
import { pool } from "./db.js";
import { addSubscription } from "./repositories.js";

test("assistant catalog navigation requires no model credential or subscription mutation",async(t)=>{
  t.mock.method(pool,"query",(()=>{throw new Error("AI MUST NOT WRITE");}) as any);
  for(const message of ["Legg til Spotify Premium.","Jeg har Netflix.","Legg til Viaplay Film & Serier.","Legg til LokalTV Premium."]){
    const extracted=parseAddSubscriptionIntent(message,"NO","NOK")!;
    const result=await askAssistant({message,context:{countryCode:"NO",currency:"NOK"}},async()=>JSON.stringify({
      answer:"Review before saving",language:"en",intent:"NAVIGATION",action:null,serviceNames:[],navigationTarget:null,needsExternalResearch:false,
      actionCandidate:{type:"ADD",serviceQuery:extracted.serviceQuery,planQuery:extracted.planQuery??null,billingProviderSlug:extracted.billingProviderSlug??null,managementAction:null}
    }));
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

test("actual mobile manual payload creates and edits Qatar records without canonical metadata",async(t)=>{
  const {readFileSync}=await import("node:fs");
  const ts=await import("typescript");
  const {validateManualSubscription}=await import("../../../packages/contracts/src/discovery.js");
  const {updateSubscription}=await import("./repositories.js");
  const source=readFileSync(new URL("../../../apps/mobile/app/index.tsx",import.meta.url),"utf8");
  const start=source.indexOf("    const body = {",source.indexOf("async function saveServiceForm"));
  const end=source.indexOf("    try {",start);
  const build=new Function("serviceSlugInput","customServiceName","billingProviderInput","selectedCountryCode","monthly","subscriptionCurrency","renewalDateInput","normalizeDateOnly","subscriptionPlanInput",ts.transpile(source.slice(start,end)+"return body;",{target:ts.ScriptTarget.ES2022}));
  let stored:any;
  t.mock.method(pool,"query",(async(sql:string,values:any[])=>{
    if(sql.startsWith("INSERT INTO subscriptions")){
      assert.match(sql,/SELECT \$1, NULL, \$2/);
      assert.doesNotMatch(sql,/FROM services|JOIN services/);
      stored={id:"manual-fixture",serviceSlug:"manual",customServiceName:values[1],serviceName:values[1],billingProviderSlug:values[2],countryCode:values[3],monthlyPriceMinor:values[4],currency:values[5],renewalDate:values[6],planName:values[7]};
      return {rows:[{id:stored.id}]};
    }
    if(sql.startsWith("UPDATE subscriptions s SET custom_service_name")){
      assert.match(sql,/s\.service_id IS NULL/);
      stored={...stored,customServiceName:values[7]?stored.customServiceName:values[2],monthlyPriceMinor:values[4]};
      return {rows:[{id:stored.id}]};
    }
    return {rows:[stored]};
  }) as any);
  for(const name of ["TOD","My independent subscription"]){
    const body=build("manual",name,"direct","QA",12.34,"QAR","2026-11-01",(v:string)=>v,"");
    assert.equal(validateManualSubscription(body),name);
    assert.deepEqual(body,{serviceSlug:"manual",customServiceName:name,billingProviderSlug:"direct",countryCode:"QA",currency:"QAR",monthlyPriceMinor:1234,renewalDate:"2026-11-01",planName:undefined});
    const created=await addSubscription({userId:"fixture",...body});
    assert.equal(created.serviceSlug,"manual");assert.equal(created.customServiceName,name);
    assert.equal(created.planName,null);
    const edited=await updateSubscription({userId:"fixture",subscriptionId:created.id,...body,monthlyPriceMinor:2000});
    assert.equal(edited.customServiceName,name);assert.equal(edited.monthlyPriceMinor,2000);
    const legacy=await updateSubscription({userId:"fixture",subscriptionId:created.id,...body,customServiceName:undefined,preserveManualIdentity:true,monthlyPriceMinor:2100});
    assert.equal(legacy.customServiceName,name);
  }
});
