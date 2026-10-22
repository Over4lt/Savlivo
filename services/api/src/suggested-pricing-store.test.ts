import test from "node:test";
import assert from "node:assert/strict";
import {suggestedRowsToProductPlans, type SuggestedRow} from "./suggested-pricing-store.js";
import {productPriceTruth} from "../../../packages/contracts/src/product-pricing.js";

const row=(name:string,id:string,minor:number):SuggestedRow=>({
  suggested_id:id,origin_suggested_id:null,plan_identity:`catalog:prime-video:no:${name.toLowerCase().replace(/\W+/g,"-")}:direct:nok`,
  service_slug:"prime-video",plan_name:name,billing_provider_slug:"direct",country_code:"NO",currency:"NOK",
  monthly_price_minor:minor,payment_cadence:"MONTHLY_RECURRING",provenance:"GOOGLE_AI_V4",
  source_url:"https://www.primevideo.com/",researched_at:"2026-10-21T13:22:09.923Z",
  warnings:["OFFICIAL_SOURCE_NOT_ACQUIRED"],active:true
});

test("historical active Prime Video add-on remains recorded but cannot become a subscription price",()=>{
 const plans=suggestedRowsToProductPlans([row("Prime Video Ad Free (Add-On)","v4:old-addon",2900),row("Prime Video","v4:base",7900)]);
 const addon=plans.find(plan=>plan.planName.includes("Add-On"));
 assert.equal(addon?.suggested,null);
 assert.equal(addon?.suggestedHistory[0]?.monthlyPriceMinor,2900);
 assert.equal(productPriceTruth(addon!).activePrice,null);
 assert.equal(productPriceTruth(plans.find(plan=>plan.planName==="Prime Video")!).activePrice?.monthlyPriceMinor,7900);
});

test("calculated total retains both component sources and remains Suggested",()=>{
 const total=row("Prime Video Without Ads (Calculated Total)","v4:total",10800);
 total.calculation={schemaVersion:1,method:"MONTHLY_BASE_PLUS_AD_FREE_ADD_ON",currency:"NOK",
  components:[{role:"BASE",planName:"Prime Video",monthlyPriceMinor:7900,sourceUrl:"https://www.primevideo.com/no",aiExcerptSha256:"a".repeat(64)},
   {role:"AD_FREE_ADD_ON",planName:"Prime Video Ad Free add-on",monthlyPriceMinor:2900,sourceUrl:"https://www.primevideo.com/help",aiExcerptSha256:"b".repeat(64)}],
  compatibilityAiExcerptSha256:"c".repeat(64)};
 total.offer_scope="CALCULATED_TOTAL";
 total.warnings=["CALCULATED_TOTAL_UNVERIFIED"];
 const [plan]=suggestedRowsToProductPlans([total]);
 assert.equal(productPriceTruth(plan).authority,"SUGGESTED");
 assert.equal(plan.suggested?.calculation?.components.length,2);
 assert.equal(plan.suggested?.calculation?.method,"MONTHLY_BASE_PLUS_AD_FREE_ADD_ON");
});

test("an older ambiguous bare ad-free Suggested stays historical while qualified full price remains active",()=>{
 const old=row("Prime Video Ad Free","v4:bare-addon",2900);
 const qualified=row("Prime Video Without Ads","v4:complete",11900);
 qualified.offer_scope="COMPLETE_SUBSCRIPTION";
 const plans=suggestedRowsToProductPlans([old,qualified]);
 assert.equal(plans[0].suggested,null);
 assert.equal(plans[0].suggestedHistory[0].monthlyPriceMinor,2900);
 assert.equal(plans[1].suggested?.monthlyPriceMinor,11900);
 assert.equal(plans[1].suggested?.offerScope,"COMPLETE_SUBSCRIPTION");
});
