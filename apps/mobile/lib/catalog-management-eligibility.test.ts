import assert from "node:assert/strict";
import test from "node:test";
import {URL} from "node:url";
import {readFileSync} from "node:fs";
import {serviceCatalog,serviceAvailableInMarket,serviceEligibleForCatalog,searchCatalog,catalogManagementEligibility,catalogWebManagementDestination,resolveCatalogCandidate} from "../../../packages/contracts/src/catalog";
import {catalogWebEvidence,webEvidenceFor} from "../../../packages/contracts/src/catalog-web-management";
import {countryCurrencyData,subscriptionsForMarket} from "../../../packages/contracts/src/markets";
import {validateAddSubscriptionIntent,validateManualSubscription} from "../../../packages/contracts/src/discovery";
import {browseCatalog} from "./catalog-browse";

test("all service-market pairs fail closed unless both provider web flows have evidence",()=>{
  let pairs=0;
  for(const [cc] of countryCurrencyData)for(const s of serviceCatalog){
    const evidence=webEvidenceFor(s.slug,cc);
    const expected=serviceAvailableInMarket(s.slug,cc)&&evidence?.startWeb.status==="VERIFIED"&&evidence?.cancelWeb.status==="VERIFIED";
    assert.equal(serviceEligibleForCatalog(s.slug,cc),Boolean(expected));
    assert.equal(browseCatalog(cc).some(entry=>entry.slug===s.slug),Boolean(expected));
    assert.equal(searchCatalog(s.slug,cc).some(entry=>entry.slug===s.slug),Boolean(expected));
    pairs++;
  }
  assert.equal(pairs,3588);
  for(const cc of ["KW","ZZ",""])assert.equal(serviceEligibleForCatalog("netflix",cc),false);
  assert.equal(serviceEligibleForCatalog("unknown","NO"),false);
});

test("classification separates direct evidence from web eligibility and absence is not unavailability",()=>{
  assert.equal(catalogManagementEligibility("netflix","NO",true),"FULLY_VERIFIED");
  assert.equal(catalogManagementEligibility("netflix","NO",false),"CATALOG_ELIGIBLE_PRICE_UNVERIFIED");
  for(const slug of ["vidio","siriusxm-canada","unknown"]){
    assert.equal(catalogManagementEligibility(slug,slug==="vidio"?"ID":"CA",true),"REVIEW_REQUIRED");
  }
  assert.equal(webEvidenceFor("vidio","ID")?.startWeb.status,"VERIFIED");
  assert.equal(serviceEligibleForCatalog("vidio","ID"),false);
});

test("evidence has explicit markets, HTTPS provider references and no duplicate scope",()=>{
  const scopes=new Set<string>();
  for(const row of catalogWebEvidence){
    assert.ok(serviceCatalog.some(s=>s.slug===row.serviceSlug));
    for(const cc of row.markets){
      assert.ok(countryCurrencyData.some(([country])=>country===cc));
      const key=row.serviceSlug+cc;assert.ok(!scopes.has(key));scopes.add(key);
    }
    for(const flow of [row.startWeb,row.manageWeb,row.cancelWeb])if(flow.status==="VERIFIED"){
      assert.equal(new URL(flow.url!).protocol,"https:");
      assert.equal(new URL(flow.evidenceUrl!).protocol,"https:");
      assert.doesNotMatch(flow.url!,/apps\.apple\.com|play\.google\.com/);
    }
  }
});

test("review-required AI Add becomes a manual draft without invented price, route or canonical identity",()=>{
  const value={kind:"open-add-subscription",version:1,countryCode:"ID",currency:"IDR",serviceQuery:"Vidio",planQuery:"Platinum",billingProviderSlug:"direct",requiresConfirmation:true};
  const evidence={serviceSlug:"vidio",planName:"Platinum",countryCode:"ID",currency:"IDR",billingProviderSlug:"direct",monthlyPriceMinor:100,verification:"registry"};
  assert.deepEqual(validateAddSubscriptionIntent(value,"ID","IDR",[evidence]),{kind:"manual",customServiceName:"Vidio",countryCode:"ID",currency:"IDR",requiresConfirmation:true});
  const resolved=resolveCatalogCandidate({serviceQuery:"Vidio",countryCode:"ID",currency:"IDR",planName:"Platinum",billingProviderSlug:"direct"},[evidence]);
  assert.equal(resolved.kind,"service");if(resolved.kind==="service"){assert.equal(resolved.availableForSelection,false);assert.deepEqual(resolved.prefill,{});}
  assert.equal(validateManualSubscription({customServiceName:"Vidio",countryCode:"ID",currency:"IDR",monthlyPriceMinor:100,billingProviderSlug:"direct"}),"Vidio");
});

test("historical and manual records remain visible independently from new discovery",()=>{
  const rows=[{id:"a",serviceSlug:"vidio",countryCode:"ID"},{id:"b",serviceSlug:"manual",countryCode:"ID"},{id:"c",serviceSlug:"netflix",countryCode:"NO"}];
  const before=structuredClone(rows);
  assert.equal(serviceEligibleForCatalog("vidio","ID"),false);
  assert.deepEqual(subscriptionsForMarket(rows,"ID").map(r=>r.id),["a","b"]);
  assert.deepEqual(subscriptionsForMarket(rows,"NO").map(r=>r.id),["c"]);
  assert.deepEqual(rows,before);
  const source=readFileSync(new URL("../app/index.tsx",import.meta.url),"utf8");
  assert.match(source,/if \(!serviceEligibleForCatalog\(service.slug, selectedCountryCode\)\) \{\s*beginManualService\(service.name\)/);
  assert.match(source,/serviceSelectionLocked[\s\S]*?serviceEligibleForCatalog/);
});

test("new verified fallback destinations are direct-only and never generate unknown URLs",()=>{
  assert.equal(catalogWebManagementDestination("osn-plus","AE","direct"),"https://osnplus.com/manage-subscriptions");
  for(const route of ["apple","google-play","amazon","carrier",""])assert.equal(catalogWebManagementDestination("osn-plus","AE",route),null);
  assert.equal(catalogWebManagementDestination("osn-plus","US","direct"),null);
  assert.equal(catalogWebManagementDestination("unknown","NO","direct"),null);
});

test("Qatar operator availability and generic cancellation do not establish TOD direct web signup",()=>{
  assert.equal(serviceAvailableInMarket("tod","QA"),true);
  const evidence=webEvidenceFor("tod","QA");
  assert.equal(evidence?.cancelWeb.status,"VERIFIED");
  assert.equal(evidence?.startWeb.status,"REVIEW_REQUIRED");
  assert.equal(serviceEligibleForCatalog("tod","QA"),false);
  assert.equal(catalogManagementEligibility("tod","QA",true),"REVIEW_REQUIRED");
  assert.equal(searchCatalog("TOD","QA").some(s=>s.slug==="tod"),false);
  assert.equal(browseCatalog("QA").some(s=>s.slug==="tod"),false);
  assert.deepEqual(validateAddSubscriptionIntent({kind:"open-add-subscription",version:1,countryCode:"QA",currency:"QAR",serviceQuery:"TOD",requiresConfirmation:true},"QA","QAR",[]),{kind:"manual",customServiceName:"TOD",countryCode:"QA",currency:"QAR",requiresConfirmation:true});
});
