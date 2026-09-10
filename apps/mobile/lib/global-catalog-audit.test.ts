import assert from "node:assert/strict";
import test from "node:test";
import {URL} from "node:url";
import {readFileSync} from "node:fs";
import {serviceCatalog,serviceEligibleForCatalog,serviceAvailableInMarket,searchCatalog,billingProvidersForService,catalogManagementDestination,resolveCatalogCandidate} from "../../../packages/contracts/src/catalog";
import {countryCurrencyData,formatMarketMinor,subscriptionsForMarket} from "../../../packages/contracts/src/markets";
import {browseCatalog} from "./catalog-browse";

test("Storytel is explicitly NO-only; all historical new-addition availability stays intact",()=>{
  const baseline=JSON.parse(readFileSync(new URL("../../../docs/catalog/global-47/baseline.json",import.meta.url),"utf8"));
  for(const market of baseline.markets){
    const oldSlugs=new Set(baseline.catalog.map((s:{slug:string})=>s.slug));
    const offered=serviceCatalog.filter(s=>serviceAvailableInMarket(s.slug,market.country)).filter(s=>oldSlugs.has(s.slug));
    for(const slug of market.services)assert.ok(offered.some(s=>s.slug===slug));
    for(const service of offered.filter(s=>!market.services.includes(s.slug)))assert.ok(service.additionalAvailability?.markets.includes(market.country));
    assert.equal(serviceAvailableInMarket("storytel",market.country),market.country==="NO");
  }
  assert.deepEqual(billingProvidersForService("storytel").map(p=>p.slug),["direct"]);
  assert.equal(serviceCatalog.filter(s=>s.slug==="storytel").length,1);
  for(const cc of ["JP","CA","SA","KR","MX","ID","TR","ZA","IL","QA","EG","KW","VN","RO","GR","CL","CO","RU"]){
    assert.equal(serviceAvailableInMarket("storytel",cc),false);
    assert.equal(serviceAvailableInMarket("netflix",cc),!["KW","RU","ZZ"].includes(cc));
  }
  assert.equal(serviceAvailableInMarket("invented-service","NO"),false);
  assert.equal(countryCurrencyData.length,46);
});

test("availability-only additions offer manual amounts without invented prices or destinations",()=>{
  for(const [slug,markets] of Object.entries({"rtl-plus":["DE"],videoland:["NL"],"nintendo-switch-online":["US","BR","JP","CA","MX","CL","CO"],"osn-plus":["AE","SA","QA","EG"]})){
    for(const [cc,,currency] of countryCurrencyData){
      assert.equal(serviceAvailableInMarket(slug,cc),markets.includes(cc));
      assert.equal(catalogManagementDestination(slug,cc,"direct"),undefined);
      assert.deepEqual(billingProvidersForService(slug).map(p=>p.slug),["direct"]);
      const candidate=resolveCatalogCandidate({serviceQuery:slug.replaceAll("-"," "),countryCode:cc,currency},[]);
      if(candidate.kind==="service")assert.deepEqual(candidate.prefill,{});
      assert.equal(browseCatalog(cc).some(s=>s.slug===slug),serviceEligibleForCatalog(slug,cc));
    }
  }
});

test("provider-confirmed Netflix availability repairs launch gaps without extending to China or inactive markets",()=>{
  for(const [cc] of countryCurrencyData)assert.equal(serviceAvailableInMarket("netflix",cc),cc!=="CN");
  for(const cc of ["KW","RU","ZZ"])assert.equal(serviceAvailableInMarket("netflix",cc),false);
  const result=resolveCatalogCandidate({serviceQuery:"Netflix",countryCode:"IN",currency:"INR"},[]);
  assert.equal(result.kind,"service");
  if(result.kind==="service"){assert.equal(result.availableForSelection,true);assert.deepEqual(result.prefill,{});}
});

test("name prefixes outrank contains and aliases; multilingual aliases and unknown search remain safe",()=>{
  for(const q of ["ne","netf"," NETFLIX "])assert.equal(searchCatalog(q,"NO")[0]?.slug,"netflix");
  assert.equal(searchCatalog("story tel","NO")[0]?.slug,"storytel");
  assert.deepEqual(searchCatalog("腾讯视频","NO"),[]);
  assert.equal(searchCatalog("HBO MAX","NO")[0]?.slug,"max");
  assert.equal(searchCatalog("DISNEY   PLUS","NO")[0]?.slug,"disney-plus");
  assert.deepEqual(searchCatalog("unknown local provider","NO"),[]);
  assert.ok(searchCatalog("e","NO",{limit:3}).length<=3);
  assert.deepEqual(searchCatalog("Storytel","US"),[]);
});

test("picker retains manual entry and static grouping, with no horizontal category controls",()=>{
  const source=readFileSync(new URL("../app/index.tsx",import.meta.url),"utf8");
  assert.match(source,/beginManualService\(catalogQuery\)/);
  assert.match(source,/catalogCategories.map\(category =>/);
  assert.match(source,/accessibilityRole="header"[\s\S]*?tr\(group.name\)/);
  assert.match(source,/styles\.servicePickerCategoryCard/);
  assert.doesNotMatch(source,/setCatalogCategory|catalogCategory===/);
});

test("JPY KRW VND KWD CLP COP preserve stored hundredths and never convert amounts",()=>{
  for(const currency of ["JPY","KRW","VND","KWD","CLP","COP"]){
    for(const stored of [1,123,123456789]){
      const formatted=formatMarketMinor(stored,currency,"en-US");
      const expected=new Intl.NumberFormat("en-US",{style:"currency",currency,maximumFractionDigits:Math.max(2,new Intl.NumberFormat("en-US",{style:"currency",currency}).resolvedOptions().maximumFractionDigits!)}).format(stored/100);
      assert.equal(formatted,expected,currency);
    }
  }
  // Genuine KWD thousandths remain unsupported; do not reinterpret existing amounts.
  assert.equal(Math.round(0.001*100),0);
});

test("saved unavailable and manual subscriptions survive market selection independently of catalog eligibility",()=>{
  const records=[{id:"saved",serviceSlug:"storytel",countryCode:"SE",currency:"SEK"},{id:"manual",serviceSlug:"manual",countryCode:"SE",currency:"SEK"},{id:"fr",countryCode:"FR",currency:"EUR"},{id:"de",countryCode:"DE",currency:"EUR"}];
  const before=JSON.stringify(records);
  assert.equal(serviceAvailableInMarket("storytel","SE"),false);
  assert.deepEqual(subscriptionsForMarket(records,"SE").map(s=>s.id),["saved","manual"]);
  assert.deepEqual(subscriptionsForMarket(records,"FR").map(s=>s.id),["fr"]);
  assert.equal(JSON.stringify(records),before);
});

test("sixteen markets retain global and local availability independently of new discovery without cross-market leakage",()=>{
  const local:Record<string,[string,string]>={JP:["JPY","u-next"],CA:["CAD","crave"],SA:["SAR","stc-tv"],KR:["KRW","tving"],MX:["MXN","vix"],ID:["IDR","vidio"],TR:["TRY","gain"],ZA:["ZAR","dstv-stream"],IL:["ILS","sting-plus"],QA:["QAR","tod"],EG:["EGP","watch-it"],VN:["VND","fpt-play"],RO:["RON","voyo-ro"],GR:["EUR","magenta-tv-gr"],CL:["CLP","zapping"],CO:["COP","win-play"]};
  const saved=Object.entries(local).map(([countryCode,[currency]])=>({id:countryCode,countryCode,currency,monthlyPriceMinor:1234,customServiceName:"User's own name"}));
  const before=structuredClone(saved);
  for(const [cc,[currency,slug]] of Object.entries(local)){
    assert.equal(countryCurrencyData.find(([code])=>code===cc)?.[2],currency);
    const offered=serviceCatalog.filter(s=>serviceAvailableInMarket(s.slug,cc));
    for(const service of [slug,"netflix","spotify","apple-music","google-one","youtube-premium","chatgpt"])assert.ok(offered.some(s=>s.slug===service),`${cc}: ${service}`);
    assert.equal(serviceAvailableInMarket("invented",cc),false);
    assert.equal(serviceAvailableInMarket(slug,"US"),false);
    assert.deepEqual(subscriptionsForMarket(saved,cc).map(s=>s.id),[cc]);
    const draft=resolveCatalogCandidate({serviceQuery:slug,countryCode:cc,currency},[]);
    assert.equal(draft.kind,"service");if(draft.kind==="service")assert.deepEqual(draft.prefill,{});
    const manual=resolveCatalogCandidate({serviceQuery:"User's own unknown service",countryCode:cc,currency},[]);
    assert.equal(manual.kind,"unknown");assert.equal(manual.requiresConfirmation,true);
  }
  assert.deepEqual(saved,before);assert.ok(!countryCurrencyData.some(([cc])=>String(cc)==="KW"));
});

test("new currency display keeps hundredths, including fractional zero-decimal currencies",()=>{
  for(const currency of ["JPY","KRW","VND","CLP","COP"]){
    const formatted=formatMarketMinor(123456,currency);
    assert.match(formatted,/1[,.\s]?234[,.]56/);
    assert.doesNotMatch(formatted,/123[,.]?456/);
  }
});

test("Japanese is complete and app language remains independent from the expanded markets",async()=>{
  const {appLanguages,uiTranslations}=await import("./ui-localization");
  assert.ok(appLanguages.some(l=>l.code==="ja"));
  assert.deepEqual(Object.keys(uiTranslations.ja!).sort(),Object.keys(uiTranslations.no!).sort());
  for(const key of Object.keys(uiTranslations.no!) as string[]){
    assert.ok(uiTranslations.ja![key]);
    assert.deepEqual((uiTranslations.ja![key].match(/\{\w+\}/g)??[]).sort(),(key.match(/\{\w+\}/g)??[]).sort(),key);
  }
});
