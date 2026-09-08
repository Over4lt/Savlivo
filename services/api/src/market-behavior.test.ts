import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  countryCurrencies, countryCurrencyData, subscriptionsForMarket,
  subscriptionCountry, isCurrentMarketPricing, formatMarketMinor, expansionMarketServices, expansionServiceAvailable
} from "../../../packages/contracts/src/markets.js";
import { pool } from "./db.js";
import { addSubscription, updateSubscription } from "./repositories.js";
import { reminderInstantForRenewal } from "./notification-logic.js";
import { getRegionalPricing, mergeFreshAndPersistedPricing } from "./pricing.js";
import { fetchProviderLocalPrices, verifiedProviderRegistry, type AdapterPrice } from "./pricing-adapters.js";

const audit = JSON.parse(readFileSync(new URL("../../../docs/markets/readiness-before.json", import.meta.url), "utf8"));

test("shared definitions preserve every baseline mobile country and API currency", () => {
  for (const code of audit.mobileMarkets) assert.ok(countryCurrencyData.some(([cc]) => cc === code));
  assert.deepEqual(countryCurrencies, audit.apiCurrencies);
  assert.equal(new Set(countryCurrencyData.map(([cc]) => cc)).size, countryCurrencyData.length);
  for (const [cc, , currency] of countryCurrencyData) assert.equal(countryCurrencies[cc], currency);
});

test("switching views preserves a multi-country account, saved amounts and shared-currency separation", () => {
  const items = [
    { id: "no", countryCode: "NO", currency: "NOK", monthlyPriceMinor: 12900 },
    { id: "gb", countryCode: "GB", currency: "GBP", monthlyPriceMinor: 1199 },
    { id: "au", countryCode: "AU", currency: "AUD", monthlyPriceMinor: 1499 },
    { id: "nz", countryCode: "NZ", currency: "NZD", monthlyPriceMinor: 1849 },
    { id: "de", countryCode: "DE", currency: "EUR", monthlyPriceMinor: 999 },
    { id: "fr", countryCode: "FR", currency: "EUR", monthlyPriceMinor: 1099 },
    { id: "legacy-no", currency: "NOK", monthlyPriceMinor: 9900 },
    { id: "ambiguous-eur", currency: "EUR", monthlyPriceMinor: 500 }
  ];
  const before = structuredClone(items);
  for (const country of ["GB", "AU", "NZ", "DE", "FR", "GB"]) {
    assert.deepEqual(subscriptionsForMarket(items, country).map(s => s.id), [country.toLowerCase()]);
  }
  assert.deepEqual(subscriptionsForMarket(items, "NO").map(s => s.id), ["no", "legacy-no"]);
  assert.deepEqual(items, before);
  assert.equal(subscriptionCountry(" gb ", "GBP"), "GB");
  assert.equal(subscriptionCountry("", "NOK"), "NO");
  assert.equal(subscriptionCountry("", "EUR"), undefined);
  assert.equal(subscriptionCountry("AU", "USD"), "AU"); // Saved country is never inferred over.
});

test("late pricing responses and mismatched currency cannot replace the active market snapshot", () => {
  assert.equal(isCurrentMarketPricing({countryCode:"GB",currency:"GBP"},"GB","GB"), true);
  assert.equal(isCurrentMarketPricing({countryCode:"GB",currency:"GBP"},"GB","AU"), false);
  assert.equal(isCurrentMarketPricing({countryCode:"AU",currency:"USD"},"AU","AU"), false);
  assert.equal(isCurrentMarketPricing({countryCode:"DE",currency:"EUR"},"FR","FR"), false);
  assert.equal(isCurrentMarketPricing(null,"NZ","NZ"), false);
});

test("new market currencies and Norway format stored minor amounts without FX", () => {
  assert.equal(formatMarketMinor(1299,"GBP","en-GB"), "£12.99");
  assert.equal(formatMarketMinor(1499,"AUD","en-AU"), "$14.99");
  assert.equal(formatMarketMinor(1849,"NZD","en-NZ"), "$18.49");
  assert.match(formatMarketMinor(12900,"NOK","nb-NO"), /129,00/);
});

test("subscription repository preserves one user and distinct market/currency identities on creation", async (t) => {
  const created: any[] = [];
  t.mock.method(pool, "query", (async (sql: string, params: any[]) => {
    if (sql.includes("INSERT INTO subscriptions")) {
      const item = {id: String(created.length + 1), userId: params[0], countryCode: params[3], monthlyPriceMinor: params[4], currency: params[5]};
      created.push(item);
      return {rows:[{id:item.id}]};
    }
    return {rows:[created.find(item => item.id === params[1])]};
  }) as any);
  for (const [countryCode,currency] of [["GB","GBP"],["AU","AUD"],["NZ","NZD"],["NO","NOK"]]) {
    await addSubscription({userId:"same-account",serviceSlug:"icloud-plus",billingProviderSlug:"apple",countryCode,currency,monthlyPriceMinor:199,planName:"50 GB"});
  }
  assert.equal(created.length, 4);
  assert.ok(created.every(item => item.userId === "same-account" && item.monthlyPriceMinor === 199));
  assert.deepEqual(created.map(item => [item.countryCode,item.currency]), [["GB","GBP"],["AU","AUD"],["NZ","NZD"],["NO","NOK"]]);
});

test("verified persisted market prices survive empty and weaker refreshes without crossing countries", () => {
  const price = {serviceSlug:"icloud-plus",planSlug:"50-gb",planName:"50 GB",billingProviderSlug:"apple",countryCode:"AU",currency:"AUD",monthlyPriceMinor:149,updatedAt:"2026-09-08",source:"official-provider-adapter:icloud-plus",sourceUrl:"https://support.apple.com/en-us/108047",confidence:"official-provider-adapter",priceType:"exact",verification:"authoritative-provider"} as AdapterPrice;
  assert.deepEqual(mergeFreshAndPersistedPricing([], [price]), [price]);
  assert.deepEqual(mergeFreshAndPersistedPricing([{...price, monthlyPriceMinor:1, verification:"single-source"}], [price]), [price]);
});

test("notifications retain user timezone independently of the subscription market", () => {
  for (const timeZone of ["Europe/Oslo","Europe/London","Australia/Sydney","Pacific/Auckland"]) {
    const instant = reminderInstantForRenewal("2026-10-15", timeZone);
    assert.equal(new Intl.DateTimeFormat("en-GB", {timeZone,hour:"2-digit",hourCycle:"h23"}).format(new Date(instant)), "09");
  }
});


test("only evidence-ready expansion markets are selectable and their catalogs are bounded", () => {
  assert.deepEqual(countryCurrencyData.filter(([cc]) => !audit.mobileMarkets.includes(cc)).map(([cc]) => cc), ["GB", "AU", "NZ", "CH", "PL", "BR", "CZ", "MY", "IN", "SG", "HK", "TW", "AE", "TH", "PH"]);
  for (const cc of ["GB", "AU", "NZ"]) {
    const services = expansionMarketServices[cc];
    assert.ok(services.length >= 4);
    assert.ok(services.includes("icloud-plus") && services.includes("apple-music") && services.includes("apple-tv-plus") && services.includes("google-one"));
    assert.equal(expansionServiceAvailable("netflix", cc), false);
    assert.equal(expansionServiceAvailable("hulu", cc), false);
    assert.equal(expansionServiceAvailable("tencent-video", cc), false);
    assert.equal(expansionServiceAvailable("icloud-plus", cc), true);
    const rows = verifiedProviderRegistry[cc];
    assert.equal(rows.length, cc === "GB" ? 15 : 11);
    assert.ok(rows.every(row => services.includes(row.serviceSlug)));
    assert.ok(rows.filter(row => row.serviceSlug.startsWith("apple-") || row.serviceSlug === "icloud-plus").every(row => row.billingProviderSlug === "apple"));
    assert.ok(rows.filter(row => ["google-one", "spotify"].includes(row.serviceSlug)).every(row => row.billingProviderSlug === "direct"));
  }
  assert.equal(expansionServiceAvailable("netflix", "NO"), undefined); // Existing rules still decide.
  assert.equal(expansionServiceAvailable("spotify", "AU"), false);
});

test("pricing lookup retains all 37 launch plans during complete provider outage", async (t) => {
  t.mock.method(globalThis, "fetch", async () => { throw new Error("offline"); });
  t.mock.method(pool, "query", (async () => ({ rows: [] })) as any);
  for (const country of ["GB", "AU", "NZ"]) {
    const snapshot = await getRegionalPricing(country, {forceRefresh:true});
    assert.equal(snapshot.countryCode, country);
    assert.equal(snapshot.currency, countryCurrencies[country]);
    assert.equal(snapshot.items.length, country === "GB" ? 15 : 11);
    assert.ok(snapshot.items.every(p => p.verification === "registry" && p.countryCode === country && p.currency === countryCurrencies[country]));
  }
});

test("every existing market retains every baseline fallback service plan price and billing route", async (t) => {
  t.mock.method(globalThis, "fetch", async () => { throw new Error("offline"); });
  for (const market of audit.markets.filter((m: any) => m.mobileSupported)) {
    const current = await fetchProviderLocalPrices(market.country, market.currency);
    for (const [service, rows] of Object.entries(market.fallback) as [string, any[]][]) {
      for (const row of rows) {
        assert.ok(current.some(p => p.serviceSlug === service && p.planName === row.plan &&
          p.billingProviderSlug === row.route && p.monthlyPriceMinor === row.minor), `${market.country} ${service} ${row.plan} ${row.route}`);
      }
    }
  }
});

const previousExpansion = JSON.parse(readFileSync(new URL("../../../docs/markets/readiness-after.json", import.meta.url), "utf8"));
const nextWave = [["CH", "CHF", "de-CH", "Europe/Zurich"], ["PL", "PLN", "pl-PL", "Europe/Warsaw"], ["BR", "BRL", "pt-BR", "America/Sao_Paulo"], ["CZ", "CZK", "cs-CZ", "Europe/Prague"], ["MY", "MYR", "en-MY", "Asia/Kuala_Lumpur"]];

test("next-wave selection filtering integer amounts savings and reminders remain market scoped", () => {
  const items = nextWave.map(([countryCode,currency], i) => ({id:countryCode,countryCode,currency,monthlyPriceMinor:1299+i}));
  const before = structuredClone(items);
  for (const [cc,currency,locale,timeZone] of nextWave) {
    assert.ok(countryCurrencyData.some(([code,,cur]) => code === cc && cur === currency));
    assert.deepEqual(expansionMarketServices[cc], ["icloud-plus","apple-music","apple-tv-plus","spotify"]);
    assert.equal(expansionServiceAvailable("netflix",cc),false);
    assert.equal(isCurrentMarketPricing({countryCode:cc,currency},cc,cc),true);
    assert.equal(isCurrentMarketPricing({countryCode:cc,currency:"USD"},cc,cc),false);
    const selected = subscriptionsForMarket(items,cc);
    assert.equal(selected.length,1);
    assert.equal(selected[0].id,cc);
    assert.equal(selected.reduce((sum,p)=>sum+p.monthlyPriceMinor,0)*12, items.find(p=>p.id===cc)!.monthlyPriceMinor*12);
    const parts = new Intl.NumberFormat(locale,{style:"currency",currency}).formatToParts(12.99);
    assert.equal(parts.find(p=>p.type==="fraction")?.value,"99");
    assert.equal(formatMarketMinor(1299,currency,locale), parts.map(p=>p.value).join(""));
    assert.equal(subscriptionCountry(cc.toLowerCase(),currency),cc);
    assert.equal(subscriptionCountry("",currency),undefined); // New currencies never move legacy subscriptions.
    const instant=reminderInstantForRenewal("2026-10-15",timeZone);
    assert.equal(new Intl.DateTimeFormat("en-GB",{timeZone,hour:"2-digit",hourCycle:"h23"}).format(new Date(instant)),"09");
  }
  assert.deepEqual(items,before);
});

test("regional pricing retains all 65 next-wave registry rows during total provider outage", async(t)=>{
  t.mock.method(globalThis,"fetch",async()=>{throw new Error("offline");});
  t.mock.method(pool,"query",(async()=>({rows:[]})) as any);
  for(const [cc,currency] of nextWave){
    const snapshot=await getRegionalPricing(cc,{forceRefresh:true});
    const launch=snapshot.items.filter(p=>expansionMarketServices[cc].includes(p.serviceSlug));
    assert.equal(launch.length,13);
    for(const row of verifiedProviderRegistry[cc]) assert.ok(launch.some(p=>p.serviceSlug===row.serviceSlug&&p.planName===row.planName&&p.monthlyPriceMinor===row.monthlyPriceMinor&&p.billingProviderSlug===row.billingProviderSlug&&p.currency===currency&&p.countryCode===cc&&p.verification==="registry"));
  }
});

test("all 18 pre-wave markets remain selectable with their existing catalogs and exact launch fallbacks",async(t)=>{
  t.mock.method(globalThis,"fetch",async()=>{throw new Error("offline");});
  for(const cc of previousExpansion.mobileMarkets) assert.ok(countryCurrencyData.some(([code])=>code===cc));
  for(const market of previousExpansion.markets.filter((m:any)=>m.launchPlans)){
    assert.deepEqual(expansionMarketServices[market.country],market.launchServices);
    const prices=await fetchProviderLocalPrices(market.country,market.currency);
    for(const row of market.launchPlans) assert.ok(prices.some(p=>p.serviceSlug===row.serviceSlug&&p.planName===row.planName&&p.monthlyPriceMinor===row.monthlyPriceMinor&&p.billingProviderSlug===row.billingProviderSlug&&p.currency===row.currency));
  }
});

const internationalMarkets = [["IN","INR","en-IN","Asia/Kolkata"],["SG","SGD","en-SG","Asia/Singapore"],["HK","HKD","en-HK","Asia/Hong_Kong"],["TW","TWD","zh-TW","Asia/Taipei"],["AE","AED","en-AE","Asia/Dubai"],["TH","THB","th-TH","Asia/Bangkok"],["PH","PHP","en-PH","Asia/Manila"]];

test("next-wave subscriptions can be created and edited without moving another market or account",async(t)=>{
  const saved=new Map<string,any>();
  t.mock.method(pool,"query",(async(sql:string,params:any[])=>{
    if(sql.includes("INSERT INTO subscriptions")){
      const id=String(saved.size+1);
      saved.set(id,{id,userId:params[0],countryCode:params[3],currency:params[5],monthlyPriceMinor:params[4]});
      return {rows:[{id}]};
    }
    const row=saved.get(params[1]);
    return {rows:row?.userId===params[0]?[row]:[]};
  }) as any);
  t.mock.method(pool,"connect",(async()=>({release(){},async query(sql:string,params:any[]){
    if(!sql.includes("UPDATE subscriptions"))return {rows:[]};
    assert.doesNotMatch(sql,/country_code\s*=/i);
    const row=saved.get(params[1]);
    if(row?.userId!==params[0])return {rows:[]};
    row.monthlyPriceMinor=params[4];row.currency=params[5];return {rows:[{id:row.id}]};
  }})) as any);
  for(const [countryCode,currency] of [...nextWave,...internationalMarkets])await addSubscription({userId:"one-account",serviceSlug:"apple-music",billingProviderSlug:"apple",countryCode,currency,monthlyPriceMinor:1299,planName:"Individual"});
  for(const item of [...saved.values()]){
    const otherMarkets=structuredClone([...saved.values()].filter(p=>p.id!==item.id));
    const updated=await updateSubscription({userId:"one-account",subscriptionId:item.id,serviceSlug:"apple-music",billingProviderSlug:"apple",currency:item.currency,monthlyPriceMinor:1499,planName:"Individual"});
    assert.equal(updated.countryCode,item.countryCode);
    assert.equal(updated.monthlyPriceMinor,1499);
    assert.deepEqual([...saved.values()].filter(p=>p.id!==item.id),otherMarkets);
  }
  assert.equal(saved.size,12);
  await assert.rejects(updateSubscription({userId:"other-account",subscriptionId:"1",serviceSlug:"apple-music",billingProviderSlug:"apple",currency:"CHF",monthlyPriceMinor:1}),/SUBSCRIPTION_NOT_FOUND/);
});

test("release review preserves all 23 selectable markets and valid offline pricing identities", async(t)=>{
  const expected = ["US","NO","SE","DK","DE","ES","FR","IT","PT","NL","BE","AT","IE","FI","CN","GB","AU","NZ","CH","PL","BR","CZ","MY"];
  assert.deepEqual(countryCurrencyData.slice(0, expected.length).map(([cc])=>cc),expected);
  assert.equal(countryCurrencyData.length,30);
  t.mock.method(globalThis,"fetch",async()=>{throw new Error("offline");});
  const subscriptions=countryCurrencyData.map(([countryCode,,currency])=>({id:countryCode,countryCode,currency,monthlyPriceMinor:1299}));
  const before=structuredClone(subscriptions);
  for(const [cc,,currency] of countryCurrencyData){
    assert.equal(countryCurrencies[cc],currency);
    assert.equal(new Intl.NumberFormat("en-US",{style:"currency",currency}).resolvedOptions().maximumFractionDigits,2);
    assert.match(formatMarketMinor(1299,currency,"en-US"),/12\.99/);
    assert.deepEqual(subscriptionsForMarket(subscriptions,cc).map(p=>p.id),[cc]);
    const prices=await fetchProviderLocalPrices(cc,currency);
    assert.ok(prices.length>0,cc);
    assert.ok(prices.every(p=>p.countryCode===cc&&p.currency===currency&&Number.isInteger(p.monthlyPriceMinor)&&p.monthlyPriceMinor>0),cc);
    if(expansionMarketServices[cc]) for(const service of expansionMarketServices[cc]) assert.ok(prices.some(p=>p.serviceSlug===service),`${cc} ${service}`);
  }
  assert.deepEqual(subscriptions,before);
});

test("all 286 pre-expansion registry records retain their exact values source URLs and billing routes",()=>{
  const baseline=JSON.parse(readFileSync(new URL("./fixtures/registry-f2340dc.json",import.meta.url),"utf8"));
  for(const [cc,entry]of Object.entries(baseline) as [string,{count:number;sha256:string}][]){
    assert.ok(verifiedProviderRegistry[cc].length>=entry.count);
    assert.equal(createHash("sha256").update(JSON.stringify(verifiedProviderRegistry[cc].slice(0,entry.count))).digest("hex"),entry.sha256,cc);
  }
});

test("seven international markets meet unchanged breadth route fallback and application readiness thresholds",async(t)=>{
  t.mock.method(pool,"query",(async()=>({rows:[]})) as any);
  t.mock.method(globalThis,"fetch",async()=>{throw new Error("offline");});
  const items=countryCurrencyData.map(([countryCode,,currency])=>({id:countryCode,countryCode,currency,monthlyPriceMinor:12345}));
  const before=structuredClone(items);
  for(const [cc,currency,locale,timeZone]of [...internationalMarkets,...internationalMarkets]){
    assert.ok(countryCurrencyData.some(([c,,cur])=>c===cc&&cur===currency));
    const services=expansionMarketServices[cc];
    assert.deepEqual(services,["icloud-plus","apple-music","apple-tv-plus","google-one"]);
    assert.equal(expansionServiceAvailable("spotify",cc),false);
    const rows=verifiedProviderRegistry[cc];
    assert.equal(rows.length,11);assert.equal(new Set(rows.map(r=>r.serviceSlug)).size,4);
    assert.deepEqual([...new Set(rows.map(r=>new URL(r.sourceUrl).hostname.includes("apple")?"Apple":"Google"))].sort(),["Apple","Google"]);
    assert.equal(rows.filter(r=>r.billingProviderSlug==="apple").length,9);
    assert.equal(rows.filter(r=>r.billingProviderSlug==="direct").length,2);
    const prices=await getRegionalPricing(cc);
    for(const row of rows)assert.ok(prices.items.some(p=>p.serviceSlug===row.serviceSlug&&p.planName===row.planName&&p.billingProviderSlug===row.billingProviderSlug&&p.monthlyPriceMinor===row.monthlyPriceMinor&&p.currency===currency&&p.countryCode===cc),`${cc} ${row.planName}`);
    assert.deepEqual(subscriptionsForMarket(items,cc).map(p=>p.id),[cc]);
    assert.equal(isCurrentMarketPricing({countryCode:cc,currency},cc,cc),true);
    assert.equal(isCurrentMarketPricing({countryCode:cc,currency:"USD"},cc,cc),false);
    assert.equal(isCurrentMarketPricing({countryCode:cc,currency},cc,"NO"),false);
    assert.equal(subscriptionCountry("",currency),undefined);
    const format=new Intl.NumberFormat(locale,{style:"currency",currency});
    assert.equal(format.resolvedOptions().maximumFractionDigits,2);
    assert.equal(format.formatToParts(123.45).find(p=>p.type==="fraction")?.value,"45");
    assert.equal(formatMarketMinor(12345,currency,locale),format.format(123.45));
    const instant=reminderInstantForRenewal("2026-10-15",timeZone);
    assert.equal(new Intl.DateTimeFormat("en-GB",{timeZone,hour:"2-digit",hourCycle:"h23"}).format(new Date(instant)),"09");
  }
  assert.deepEqual(items,before);
  assert.deepEqual(subscriptionsForMarket(items,"NO").map(p=>p.id),["NO"]);
  for(const cc of ["JP","KR","MX","AR","ZA","VN","ID","NG","EG","MA","QA","KW","RU"])assert.ok(!countryCurrencyData.some(([c])=>c===cc),cc);
});

test("catalog batch preserves all 363 baseline registry rows and all 756 offline pricing hits",async(t)=>{
  const baseline=JSON.parse(readFileSync(new URL("../../../docs/catalog/baseline-60362c6.json",import.meta.url),"utf8"));
  t.mock.method(globalThis,"fetch",async()=>{throw new Error("provider outage");});
  for(const market of baseline.markets){
    assert.deepEqual(verifiedProviderRegistry[market.country]?.slice(0,market.registry.length)??[],market.registry);
    const rows=await fetchProviderLocalPrices(market.country,market.currency);
    for(const previous of market.offlinePrices)assert.ok(rows.some(p=>p.serviceSlug===previous.serviceSlug&&p.planName===previous.planName&&p.billingProviderSlug===previous.billingProviderSlug&&p.monthlyPriceMinor===previous.monthlyPriceMinor&&p.currency===previous.currency&&p.verification===previous.verification&&p.sourceUrl===previous.sourceUrl),`${market.country} ${previous.serviceSlug} ${previous.planName}`);
    const viaplay=rows.filter(p=>p.serviceSlug==="viaplay");
    assert.equal(viaplay.length,market.country==="NO"?1:0);
    if(viaplay.length){assert.equal(viaplay[0].verification,"registry");assert.equal(viaplay[0].billingProviderSlug,"direct");}
  }
});

test("discovery preserves all 364 registry rows and 757 offline results from 2258c70",async(t)=>{
  const baseline=JSON.parse(readFileSync(new URL("../../../docs/catalog/baseline-2258c70.json",import.meta.url),"utf8"));
  const digest=(value:unknown)=>createHash("sha256").update(JSON.stringify(value)).digest("hex");
  t.mock.method(globalThis,"fetch",async()=>{throw new Error("offline");});
  assert.deepEqual(countryCurrencyData,baseline.markets.map((m:any)=>[m.country,m.name,m.currency]));
  let registry=0,offline=0;
  for(const market of baseline.markets){
    assert.equal(digest(verifiedProviderRegistry[market.country]??[]),market.registrySha256);
    const prices=await fetchProviderLocalPrices(market.country,market.currency);
    assert.equal(digest(prices.map(({updatedAt,...p})=>p)),market.offlineSha256,market.country);
    registry+=market.registryRows;offline+=prices.length;
  }
  assert.equal(registry,364);assert.equal(offline,757);
});
