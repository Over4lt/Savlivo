import assert from "node:assert/strict";
import test from "node:test";
import { searchCatalog, catalogCategories, transitionCatalogDraft } from "../../../packages/contracts/src/catalog";
import { discoveryRequestIsCurrent, parseAddSubscriptionIntent, validateAddSubscriptionIntent, validateManualSubscription } from "../../../packages/contracts/src/discovery";
const price={serviceSlug:"viaplay",planName:"Viaplay Film & Serier",countryCode:"NO",currency:"NOK",billingProviderSlug:"direct",monthlyPriceMinor:16900,verification:"registry"};
const parse=(message:string)=>parseAddSubscriptionIntent(message,"NO","NOK");
const resolve=(message:string,prices=[price])=>validateAddSubscriptionIntent(parse(message),"NO","NOK",prices);

test("bounded discovery uses aliases, normalized spacing, categories and market relevance",()=>{
  assert.equal(searchCatalog("  APPLE   MUSIC ","NO")[0]?.slug,"apple-music");
  assert.equal(searchCatalog("HBO Max","NO")[0]?.slug,"max");
  assert.ok(searchCatalog("","NO",{limit:12}).length<=12);
  for(const category of catalogCategories)assert.ok(searchCatalog("","NO",{category:category.id}).every(s=>s.categories.includes(category.id)));
  assert.equal(searchCatalog("not-a-known-provider","NO").length,0);
  assert.equal(searchCatalog("Viaplay","US")[0]?.slug,"viaplay");
  assert.ok(!searchCatalog("","US").some(s=>s.slug==="viaplay"));
  assert.ok(searchCatalog("","IN").every(s=>["apple-music","apple-tv-plus","icloud-plus","google-one"].includes(s.slug)));
  assert.equal(searchCatalog("","NO",{limit:1000}).length<=50,true);
});

test("AI knows service identity but never guesses an ambiguous or absent plan",()=>{
  for(const message of ["Legg til Spotify Premium.","Jeg har Netflix.","I have Netflix"]){
    const candidate=resolve(message);assert.equal(candidate?.kind,"service");
    if(candidate?.kind==="service")assert.deepEqual(candidate.prefill,{});
    assert.equal(candidate?.requiresConfirmation,true);
  }
});

test("Viaplay user-stated plan resolves through actual market and route evidence",()=>{
  const candidate=resolve("Legg til Viaplay Film & Serier.");
  assert.equal(candidate?.kind,"service");
  if(candidate?.kind==="service")assert.deepEqual(candidate.prefill,{planName:price.planName,billingProviderSlug:"direct",monthlyPriceMinor:16900});
  assert.equal(candidate?.requiresConfirmation,true);
});

test("AI route, weak evidence, conflicting price and invented model fields cannot leak a price",()=>{
  for(const prices of [[{...price,verification:"single-source"}],[price,{...price,monthlyPriceMinor:17000}],[{...price,currency:"USD"}],[{...price,countryCode:"US"}]]){
    const candidate=resolve("Legg til Viaplay Film & Serier",prices);
    if(candidate?.kind==="service")assert.deepEqual(candidate.prefill,{});else assert.fail();
  }
  const apple=resolve("Legg til Viaplay Film & Serier som jeg betaler gjennom Apple");
  if(apple?.kind==="service"){assert.equal(apple.billingProviderSlug,"apple");assert.deepEqual(apple.prefill,{});}else assert.fail();
  const unsupported=resolve("Add Viaplay through Google Play");
  if(unsupported?.kind==="service"){assert.equal(unsupported.billingProviderSlug,"");assert.deepEqual(unsupported.prefill,{});}else assert.fail();
  const forged=validateAddSubscriptionIntent({...parse("Add Viaplay"),planQuery:"Invented",prefill:{monthlyPriceMinor:1},monthlyPriceMinor:1},"NO","NOK",[price]);
  if(forged?.kind==="service")assert.deepEqual(forged.prefill,{});else assert.fail();
});

test("stale country and invalid actions are rejected, global search never grants local pricing",()=>{
  assert.equal(validateAddSubscriptionIntent(parse("Add Viaplay"),"US","USD",[price]),null);
  assert.equal(validateAddSubscriptionIntent({...parse("Add Viaplay"),requiresConfirmation:false},"NO","NOK",[price]),null);
  const outside=validateAddSubscriptionIntent(parseAddSubscriptionIntent("Add Viaplay Film & Serier","US","USD"),"US","USD",[price]);
  if(outside?.kind==="service"){assert.equal(outside.availableForSelection,false);assert.deepEqual(outside.prefill,{});}else assert.fail();
  for(const message of ["Cancel Netflix","I have cancelled Netflix","Do not add Netflix","Add not Netflix","Add Netflix and Spotify","How do I add Netflix?"]){assert.equal(parse(message),null,message);}
});

test("unknown service opens a manual candidate with no fabricated plan price or metadata",()=>{
  assert.deepEqual(resolve("Legg til LokalTV Premium."),{kind:"manual",customServiceName:"LokalTV Premium",countryCode:"NO",currency:"NOK",requiresConfirmation:true});
  const candidate=resolve("Add My Local Service");assert.ok(candidate);assert.equal("prefill" in candidate,false);
  assert.equal("create" in candidate,false);assert.equal("managementUrl" in candidate,false);
});

test("manual inputs validate stored hundredths, actual billing, dates and explicit market currency",()=>{
  const valid={customServiceName:"  LokalTV  ",billingProviderSlug:"carrier",monthlyPriceMinor:12345,countryCode:"NO",currency:"NOK",planName:"My bundle",renewalDate:"2026-10-01"};
  assert.equal(validateManualSubscription(valid),"LokalTV");
  for(const bad of [{customServiceName:""},{customServiceName:"x\n"},{monthlyPriceMinor:0},{monthlyPriceMinor:1.5},{monthlyPriceMinor:2147483648},{currency:"USD"},{countryCode:"RU"},{billingProviderSlug:"invented"},{renewalDate:"2026-02-31"},{planName:"x".repeat(101)}]){
    assert.throws(()=>validateManualSubscription({...valid,...bad}),/INVALID_MANUAL_SUBSCRIPTION/);
  }
});

test("service and billing changes clear stale draft values without mutating the old draft",()=>{
  const previous={serviceSlug:"viaplay",billingProviderSlug:"direct",planName:"Viaplay Film & Serier",monthlyPrice:"169.00",renewalDate:"2026-10-01"};
  for(const [service,route]of [["manual","direct"],["viaplay","apple"],["spotify","direct"]]){
    const next=transitionCatalogDraft(previous,service,route);assert.equal(next.planName,"");assert.equal(next.monthlyPrice,"");assert.equal(next.renewalDate,previous.renewalDate);
  }
  assert.equal(previous.monthlyPrice,"169.00");
});

test("late AI response cannot replace a newer form or a switched market even after returning to the old country",()=>{
  const request={countryCode:"NO",epoch:3};
  assert.equal(discoveryRequestIsCurrent(request,{countryCode:"NO",epoch:3}),true);
  assert.equal(discoveryRequestIsCurrent(request,{countryCode:"NO",epoch:4}),false);
  assert.equal(discoveryRequestIsCurrent(request,{countryCode:"US",epoch:3}),false);
  assert.equal(discoveryRequestIsCurrent(request,{countryCode:"NO",epoch:5}),false);
});

test("an unrecognized user-stated billing provider never becomes direct billing",()=>{
  const candidate=resolve("Add Netflix through Telia");
  if(candidate?.kind!=="service")assert.fail();
  assert.equal(candidate.billingProviderSlug,"");assert.equal(candidate.requestedRouteUnresolved,true);assert.deepEqual(candidate.prefill,{});
  assert.equal(validateAddSubscriptionIntent({...parse("Add Netflix"),billingProviderSlug:42},"NO","NOK",[]),null);
});
