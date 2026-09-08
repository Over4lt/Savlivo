import assert from "node:assert/strict";
import test from "node:test";
import {URL}from"node:url";
import {readFileSync}from"node:fs";
import {serviceCatalog,serviceCategories,serviceBillingProviders,serviceAvailableInMarket,searchCatalog,resolveCatalogCandidate,catalogPlans}from"../../../packages/contracts/src/catalog.js";
const baseline=JSON.parse(readFileSync(new URL("../../../docs/catalog/baseline-60362c6.json",import.meta.url),"utf8"));
test("canonical catalog preserves all original identities categories billing selections and 30-market availability",()=>{
  assert.deepEqual(serviceCatalog.slice(0,42).map(({slug,name})=>({slug,name})),baseline.services);
  for(const category of baseline.categories)assert.deepEqual(serviceCategories.find(c=>c.key===category.key)?.slugs.filter(s=>baseline.services.some((p:any)=>p.slug===s)),category.slugs);
  for(const[slug,routes]of Object.entries(baseline.billingSelection))assert.deepEqual(serviceBillingProviders[slug],routes);
  for(const market of baseline.markets)for(const service of baseline.services)assert.equal(serviceAvailableInMarket(service.slug,market.country),market.availability.includes(service.slug));
  assert.equal(new Set(serviceCatalog.map(s=>s.slug)).size,serviceCatalog.length);
});
test("search tolerates case spacing aliases without hiding explicit foreign matches or inventing unknowns",()=>{
  assert.equal(searchCatalog("  DISNEY   PLUS ","NO")[0]?.slug,"disney-plus");
  assert.equal(searchCatalog("腾讯视频","NO")[0]?.slug,"tencent-video");
  assert.equal(searchCatalog("hbo max","NO")[0]?.slug,"max");
  assert.deepEqual(searchCatalog("totally unknown service","NO"),[]);
  assert.ok(searchCatalog("","NO",{limit:3}).length<=3);
  assert.ok(searchCatalog("","NO",{category:"cloud"}).every(s=>s.categories.includes("cloud")));
});
const evidence={serviceSlug:"spotify",planName:"Individual",countryCode:"NO",currency:"NOK",billingProviderSlug:"direct",monthlyPriceMinor:12900,verification:"registry"};
test("AI and manual candidates share the catalog and require exact market route plan evidence before prefilling",()=>{
  const input={serviceQuery:"Spotify",countryCode:"NO",currency:"NOK",planName:"Individual",billingProviderSlug:"direct"};
  const result=resolveCatalogCandidate(input,[evidence]);
  assert.equal(result.requiresConfirmation,true);assert.equal(result.kind,"service");
  if(result.kind==="service")assert.deepEqual(result.prefill,{planName:"Individual",billingProviderSlug:"direct",monthlyPriceMinor:12900});
  for(const args of [{...input,planName:undefined},{...input,billingProviderSlug:"apple"},{...input,countryCode:"SE",currency:"SEK"},{...input,currency:"USD"},{...input,planName:"Premium"}]){
    const r=resolveCatalogCandidate(args,[evidence]);if(r.kind==="service")assert.deepEqual(r.prefill,{});
  }
  assert.deepEqual(catalogPlans("spotify","NO","USD",[evidence]),[]);
  const inactive=resolveCatalogCandidate({...input,countryCode:"JP",currency:"JPY"},[{...evidence,countryCode:"JP",currency:"JPY"}]);
  if(inactive.kind==="service"){assert.equal(inactive.availableForSelection,false);assert.deepEqual(inactive.prefill,{});}
  assert.equal(resolveCatalogCandidate({...input,serviceQuery:"unknown"},[evidence]).kind,"unknown");
});
test("weak or conflicting catalog prices never prefill an amount and input records remain unchanged",()=>{
  const input={serviceQuery:"Spotify",countryCode:"NO",currency:"NOK",planName:"Individual",billingProviderSlug:"direct"};
  for(const rows of [[{...evidence,verification:"single-source"}],[evidence,{...evidence,monthlyPriceMinor:19900}]]){
    const before=structuredClone(rows);const r=resolveCatalogCandidate(input,rows);if(r.kind==="service")assert.deepEqual(r.prefill,{});assert.deepEqual(rows,before);
  }
});

test("Viaplay launch is Norway-only with independent billing selections and an instruction destination",async()=>{
  const {catalogManagementDestination,billingProvidersForService}=await import("../../../packages/contracts/src/catalog.js");
  const {usesSubscriptionManagementBrowser}=await import("./subscription-management-browser.js");
  assert.equal(serviceAvailableInMarket("viaplay","NO"),true);
  for(const cc of ["SE","DK","FI","US","IN"])assert.equal(serviceAvailableInMarket("viaplay",cc),false);
  assert.deepEqual(billingProvidersForService("viaplay").map(p=>p.slug),["direct","apple","carrier"]);
  const route=catalogManagementDestination("viaplay","NO","direct")!;
  assert.equal(route.kind,"instructions");assert.equal(route.url,"https://help.viaplay.com/nb/cancel-package/");
  assert.equal(usesSubscriptionManagementBrowser(route.url,"ios"),true);
  assert.equal(catalogManagementDestination("viaplay","NO","carrier"),undefined);
});

test("changing service or billing route never carries a direct price into a different draft identity",async()=>{
  const {transitionCatalogDraft}=await import("../../../packages/contracts/src/catalog.js");
  const saved=Object.freeze({serviceSlug:"viaplay",billingProviderSlug:"direct",planName:"Viaplay Film & Serier",monthlyPrice:"169.00",countryCode:"NO"});
  assert.equal(transitionCatalogDraft(saved,"viaplay","direct"),saved);
  for(const route of ["apple","google-play","carrier","amazon"]){
    const changed=transitionCatalogDraft(saved,"viaplay",route);
    assert.equal(changed.planName,"");assert.equal(changed.monthlyPrice,"");assert.equal(changed.countryCode,"NO");
    assert.equal(saved.monthlyPrice,"169.00");
  }
  assert.equal(transitionCatalogDraft(saved,"netflix","direct").monthlyPrice,"");
});
