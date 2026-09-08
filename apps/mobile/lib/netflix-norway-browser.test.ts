import assert from "node:assert/strict";
import test from "node:test";
import { countryCurrencyData } from "../../../packages/contracts/src/markets.js";
import { openNetflixNorwayBrowser, usesNetflixNorwayBrowser } from "./netflix-norway-browser.js";

const netflix = Object.freeze({serviceSlug:"netflix",billingProviderSlug:"direct",countryCode:"NO",currency:"NOK",status:"ACTIVE"});
const cancelUrl = "https://www.netflix.com/cancelplan";
const accountUrl = "https://www.netflix.com/account";

function browser(result = "cancel") {
  const system: string[] = [];
  const external: string[] = [];
  return {system,external,platform:"ios",async openSystemBrowser(url:string){system.push(url);return {type:result};},async openExternal(url:string){external.push(url);return true;}};
}

test("Norwegian direct Netflix opens the same cancel and account destinations in the iOS sheet",async()=>{
  for(const url of [cancelUrl,accountUrl]){
    const b=browser();
    assert.equal(await openNetflixNorwayBrowser(url,netflix,"NO",b),true);
    assert.deepEqual(b.system,[url]);
    assert.deepEqual(b.external,[]);
  }
});

test("Netflix in every other selectable country preserves external browser behavior",async()=>{
  for(const [cc,,currency] of countryCurrencyData.filter(([cc])=>cc!=="NO")){
    const b=browser();
    await openNetflixNorwayBrowser(cancelUrl,{...netflix,countryCode:cc,currency},cc,b);
    assert.deepEqual(b.system,[]);
    assert.deepEqual(b.external,[cancelUrl]);
  }
});

test("non-Netflix and platform-billed Netflix never use the pilot",async()=>{
  for(const subscription of [
    {...netflix,serviceSlug:"spotify"}, {...netflix,serviceSlug:"disney-plus"},
    ...["apple","google-play","amazon","carrier",""].map(billingProviderSlug=>({...netflix,billingProviderSlug}))
  ]){
    const b=browser();
    await openNetflixNorwayBrowser(accountUrl,subscription,"NO",b);
    assert.deepEqual(b.system,[]);
    assert.deepEqual(b.external,[accountUrl]);
  }
});

test("selected market alone cannot turn a foreign subscription into the Norway pilot",()=>{
  assert.equal(usesNetflixNorwayBrowser(cancelUrl,{...netflix,countryCode:"US"},"NO","ios"),false);
  assert.equal(usesNetflixNorwayBrowser(cancelUrl,netflix,"US","ios"),false);
  assert.equal(usesNetflixNorwayBrowser(cancelUrl,{...netflix,countryCode:undefined},"NO","ios"),true);
  assert.equal(usesNetflixNorwayBrowser(cancelUrl,{...netflix,countryCode:undefined,currency:"EUR"},"NO","ios"),false);
});

test("Android web and unsupported platforms keep existing external behavior",async()=>{
  for(const platform of ["android","web","windows"]){
    const b={...browser(),platform};
    await openNetflixNorwayBrowser(cancelUrl,netflix,"NO",b);
    assert.deepEqual(b.system,[]);
    assert.deepEqual(b.external,[cancelUrl]);
  }
});

test("only the exact trusted existing Netflix destinations qualify",()=>{
  for(const url of [undefined,null,"", "http://www.netflix.com/account", "https://www.netflix.com.evil.example/account", "https://www.netflix.com/account?next=other", "https://apps.apple.com/account/subscriptions", "https://www.netflix.com/login"]){
    assert.equal(usesNetflixNorwayBrowser(url,netflix,"NO","ios"),false);
  }
});

test("Done or dismissal finishes navigation without changing subscription status or reopening externally",async()=>{
  for(const result of ["cancel","dismiss"]){
    const subscription=Object.freeze({...netflix,status:"PAUSED"});
    const before=structuredClone(subscription);
    const b=browser(result);
    await openNetflixNorwayBrowser(cancelUrl,subscription,"NO",b);
    assert.deepEqual(subscription,before);
    assert.deepEqual(b.external,[]);
  }
});

test("opening remains pending until the iOS browser closes",async()=>{
  let close!: (result:{type:string})=>void;
  let finished=false;
  const b=browser();
  b.openSystemBrowser=()=>new Promise(resolve=>{close=resolve;});
  const opening=openNetflixNorwayBrowser(cancelUrl,netflix,"NO",b).then(result=>{finished=true;return result;});
  await Promise.resolve();
  assert.equal(finished,false);
  close({type:"cancel"});
  assert.equal(await opening,true);
  assert.equal(netflix.status,"ACTIVE");
});

test("missing native support or rejected presentation falls back to the same external URL",async()=>{
  for(const message of ["unavailable","presentation failed"]){
    const b=browser();
    b.openSystemBrowser=async()=>{throw new Error(message);};
    assert.equal(await openNetflixNorwayBrowser(cancelUrl,netflix,"NO",b),true);
    assert.deepEqual(b.external,[cancelUrl]);
  }
});

test("locked or unrecognized browser results use the existing opener without claiming provider success",async()=>{
  for(const result of ["locked","unknown","opened"]){
    const b=browser(result);
    assert.equal(await openNetflixNorwayBrowser(cancelUrl,netflix,"NO",b),true);
    assert.deepEqual(b.external,[cancelUrl]);
    assert.equal(netflix.status,"ACTIVE");
  }
});

test("external fallback failure remains failure and leaves subscription unchanged",async()=>{
  const b=browser("locked");
  b.openExternal=async()=>false;
  assert.equal(await openNetflixNorwayBrowser(cancelUrl,netflix,"NO",b),false);
  b.openExternal=async()=>{throw new Error("external failed");};
  await assert.rejects(openNetflixNorwayBrowser(cancelUrl,netflix,"NO",b),/external failed/);
  assert.equal(netflix.status,"ACTIVE");
});
