import assert from "node:assert/strict";
import test from "node:test";
import { openSubscriptionManagementBrowser, usesSubscriptionManagementBrowser } from "./subscription-management-browser.js";

function browser(result = "cancel") {
  const system: string[] = [];
  const external: string[] = [];
  return {system,external,platform:"ios",async openSystemBrowser(url:string){system.push(url);return {type:result};},async openExternal(url:string){external.push(url);return true;}};
}

test("eligible current and future HTTPS management destinations use iOS Safari without rewriting URLs",async()=>{
  for(const url of [
    "https://www.netflix.com/cancelplan", "https://www.netflix.com/account",
    "https://www.spotify.com/account/", "https://www.disneyplus.com/account",
    "https://www.primevideo.com/region/eu/settings/your-account",
    "https://www.amazon.com/gp/video/settings/channels",
    "https://account.microsoft.com/services/",
    "https://one.google.com/plans?g1_last_touchpoint=39&g1_landing_page=0",
    "https://www.youtube.com/paid_memberships",
    "https://future-provider.example/new-country/manage?plan=family#billing"
  ]){
    const b=browser();
    assert.equal(await openSubscriptionManagementBrowser(url,b),true);
    assert.deepEqual(b.system,[url]);
    assert.deepEqual(b.external,[]);
  }
});

test("HTTP provider pages supported by Expo remain eligible without upgrading or rewriting their URL",async()=>{
  const url="http://future-provider.example/account";
  const b=browser();
  assert.equal(await openSubscriptionManagementBrowser(url,b),true);
  assert.deepEqual(b.system,[url]);
  assert.deepEqual(b.external,[]);
});

test("Android web and other platforms retain the existing external opener",async()=>{
  for(const platform of ["android","web","windows"]){
    const b={...browser(),platform};
    const url="https://www.spotify.com/account/";
    assert.equal(await openSubscriptionManagementBrowser(url,b),true);
    assert.deepEqual(b.system,[]);
    assert.deepEqual(b.external,[url]);
  }
});

test("platform-store HTTPS links preserve external platform routing",async()=>{
  for(const url of [
    "https://apps.apple.com/account/subscriptions",
    "https://apps.apple.com/no/app/example/id123?mt=8",
    "https://buy.itunes.apple.com/WebObjects/MZFinance.woa/wa/manageSubscriptions",
    "https://appstore.com/example", "https://appsto.re/example",
    "https://play.google.com/store/account/subscriptions?sku=example",
    "https://market.android.com/details?id=example",
    "https://apps.microsoft.com/detail/example",
    "HTTPS://APPS.APPLE.COM/account/subscriptions",
    "https://apps.apple.com./account/subscriptions"
  ]){
    const b=browser();
    assert.equal(await openSubscriptionManagementBrowser(url,b),true);
    assert.deepEqual(b.system,[]);
    assert.deepEqual(b.external,[url]);
  }
});

test("non-web deep links and invalid URLs are delegated unchanged rather than presented in Safari",async()=>{
  for(const url of ["itms-apps://apps.apple.com/account/subscriptions","itms-services://example","market://details?id=example","intent://example","providerapp://manage","tel:123","mailto:help@example.com","file:///account","javascript:void(0)","/account","//provider.example/account","https://","https://user:password@provider.example/account",""]){
    const b=browser();
    await openSubscriptionManagementBrowser(url,b);
    assert.deepEqual(b.system,[]);
    assert.deepEqual(b.external,[url]);
  }
  assert.equal(usesSubscriptionManagementBrowser(null,"ios"),false);
  assert.equal(usesSubscriptionManagementBrowser(undefined,"ios"),false);
});

test("store exclusions match parsed host boundaries rather than incidental URL text",()=>{
  assert.equal(usesSubscriptionManagementBrowser("https://provider.example/account?return=apps.apple.com","ios"),true);
  assert.equal(usesSubscriptionManagementBrowser("https://apps.apple.com.provider.example/manage","ios"),true);
  assert.equal(usesSubscriptionManagementBrowser("https://www.apple.com/account","ios"),true);
});

test("cancel and dismiss return navigation success without external fallback",async()=>{
  for(const result of ["cancel","dismiss"]){
    const b=browser(result);
    assert.equal(await openSubscriptionManagementBrowser("https://www.netflix.com/cancelplan",b),true);
    assert.deepEqual(b.external,[]);
  }
});

test("navigation remains pending until the system sheet closes",async()=>{
  let close!: (result:{type:string})=>void;
  let finished=false;
  const b=browser();
  b.openSystemBrowser=()=>new Promise(resolve=>{close=resolve;});
  const opening=openSubscriptionManagementBrowser("https://www.spotify.com/account/",b).then(result=>{finished=true;return result;});
  await Promise.resolve();
  assert.equal(finished,false);
  close({type:"cancel"});
  assert.equal(await opening,true);
});

test("unavailable or failed native presentation falls back to the identical external destination",async()=>{
  for(const message of ["unavailable","presentation failed"]){
    const b=browser();
    b.openSystemBrowser=async()=>{throw new Error(message);};
    const url="https://www.netflix.com/cancelplan";
    assert.equal(await openSubscriptionManagementBrowser(url,b),true);
    assert.deepEqual(b.external,[url]);
  }
});

test("unexpected native results retain external fallback",async()=>{
  for(const result of ["locked","unknown","opened"]){
    const b=browser(result);
    const url="https://www.spotify.com/account/";
    assert.equal(await openSubscriptionManagementBrowser(url,b),true);
    assert.deepEqual(b.external,[url]);
  }
});

test("external false and rejection semantics are preserved for fallback and ineligible routes",async()=>{
  for(const url of ["https://www.netflix.com/account","https://apps.apple.com/account/subscriptions"]){
    const b=browser("locked");
    b.openExternal=async()=>false;
    assert.equal(await openSubscriptionManagementBrowser(url,b),false);
    b.openExternal=async()=>{throw new Error("external failed");};
    await assert.rejects(openSubscriptionManagementBrowser(url,b),/external failed/);
  }
});
