import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {pool} from "./db.js";
import {privateDataPool} from "./private-data-db.js";
import {dashboardData} from "./private-data-http.js";
import {priceAnalyticsReport} from "./price-analytics.js";
import {persistVerifiedLivePrices} from "./pricing-store.js";
import {loadPersistedVerifiedPrices} from "./pricing-store.js";
import {projectCatalogProductPlans} from "./product-pricing.js";
import {productPriceStatus} from "../../../packages/contracts/src/product-pricing.js";
import type {AdapterPrice} from "./pricing-adapters.js";

const enabled=process.env.SAVLIVO_DISPOSABLE_DB_TEST==="1";
const sql=(path:string)=>readFileSync(new URL(`../../../${path}`,import.meta.url),"utf8");
const price=(market:string,plan:string,minor:number,source:string,at:string):AdapterPrice=>({
  serviceSlug:"max",serviceName:"Max",planSlug:plan.toLowerCase().replaceAll(" ","-"),planName:plan,
  billingProviderSlug:"direct",countryCode:market,currency:market==="NO"?"NOK":market==="SE"?"SEK":"DKK",
  monthlyPriceMinor:minor,updatedAt:at,source,sourceUrl:`https://www.hbomax.com/${market.toLowerCase()}/plans`,
  confidence:"official-provider-adapter",priceType:"exact",verification:"authoritative-provider",
  sourceCount:1,verifiedByAgreement:false
});

test("disposable Postgres preserves partial Old Verified, renamed alias, price history and idempotency",{skip:!enabled},async t=>{
  assert.equal(process.env.DATABASE_URL,"postgresql://postgres@127.0.0.1:55439/savlivo_test");
  t.after(async()=>{await pool.end();await privateDataPool.end();});
  await pool.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public");
  for(const path of ["db/schema.sql","db/migrations/002_auth.sql","db/migrations/009_subscription_market.sql",
    "db/migrations/014_verified_price_observations.sql","db/migrations/019_suggested_provider_prices.sql",
    "db/migrations/023_durable_verified_price_history.sql","db/migrations/024_price_analytics_history_index.sql",
    "db/migrations/025_verified_bootstrap_integrity.sql"])await pool.query(sql(path));
  const oldAt="2026-08-01T00:00:00.000Z",newAt="2026-10-20T00:00:00.000Z";
  for(const row of [price("NO","Basic",9900,"official-provider-adapter:max",oldAt),
    price("NO","Standard",14900,"official-provider-adapter:max",oldAt),
    price("NO","Premium",19900,"official-provider-adapter:max",oldAt),
    price("SE","Max Standard",14900,"official-provider-adapter:max",oldAt),
    price("DK","Legacy Special",15900,"official-provider-adapter:max",oldAt)])
    await persistVerifiedLivePrices([row]);
  await persistVerifiedLivePrices([price("NO","Basic",10900,"v3-truth",newAt)]);
  await persistVerifiedLivePrices([price("SE","Standard",16900,"v3-truth",newAt)]);
  const no=await loadPersistedVerifiedPrices("NO","NOK");
  assert.deepEqual(no.map(row=>[row.planSlug,row.source,row.monthlyPriceMinor]),[
    ["basic","v3-truth",10900],["premium","official-provider-adapter:max",19900],
    ["standard","official-provider-adapter:max",14900]]);
  assert.deepEqual(projectCatalogProductPlans(no).map(productPriceStatus),
    ["VERIFIED_ONLY","OLD_VERIFIED_ONLY","OLD_VERIFIED_ONLY"]);
  const dashboard=await dashboardData("NO");
  assert.equal(dashboard.dataQuality.priceCoverage.plansWithVerified,1);
  assert.equal(dashboard.dataQuality.priceCoverage.plansWithOldVerified,2);
  assert(dashboard.dataQuality.persistedPrices.some(row=>row.price_status==="old_verified"&&row.prices===2));
  const analytics=await priceAnalyticsReport({service:"max",market:"NO",plan:null,period:"All"});
  assert.equal(analytics.state,"AVAILABLE");
  if(analytics.state==="AVAILABLE"){
    assert.equal(analytics.summary.plans,1);
    assert.equal(analytics.summary.oldVerifiedPlans,2);
    assert.deepEqual(analytics.changes.map(row=>[row.previousPriceStatus,row.newPriceStatus]),
      [["OLD_VERIFIED","VERIFIED"]]);
    assert.deepEqual(analytics.series.find(row=>row.planName==="Basic")?.points.map(row=>row.priceStatus),
      ["OLD_VERIFIED","VERIFIED"]);
  }
  const se=await loadPersistedVerifiedPrices("SE","SEK");
  assert.equal(se.length,1);
  assert.equal(se[0].source,"v3-truth");
  assert.equal(se[0].monthlyPriceMinor,16900);
  const dk=await loadPersistedVerifiedPrices("DK","DKK");
  assert.equal(dk.length,1);
  assert.equal(productPriceStatus(projectCatalogProductPlans(dk)[0]),"OLD_VERIFIED_ONLY");
  const history=await pool.query(`SELECT country_code,plan_slug,source,monthly_price_minor,history_event_kind
    FROM verified_price_observations ORDER BY country_code,plan_slug,provider_verified_at`);
  assert.deepEqual(history.rows.filter(row=>row.country_code==="NO").map(row=>[row.plan_slug,row.source,row.monthly_price_minor,row.history_event_kind]),
    [["basic","official-provider-adapter:max",9900,"BASELINE"],["basic","v3-truth",10900,"PRICE_CHANGE"],
      ["premium","official-provider-adapter:max",19900,"BASELINE"],
      ["standard","official-provider-adapter:max",14900,"BASELINE"]]);
  const before=history.rowCount;
  await persistVerifiedLivePrices([price("NO","Basic",10900,"v3-truth",newAt)]);
  assert.equal((await pool.query("SELECT count(*)::int AS count FROM verified_price_observations")).rows[0].count,before);
  await persistVerifiedLivePrices([price("DK","Unrelated New Name",17900,"v3-truth",newAt)]);
  const afterDk=await loadPersistedVerifiedPrices("DK","DKK");
  assert.equal(afterDk.length,2);
  assert(afterDk.some(row=>row.planName==="Legacy Special"&&row.source.startsWith("official-provider-adapter:")));

  // The one-time retirement archives the exact old row without touching
  // history or the two independent V3 plans. A later V3 ads price is allowed.
  const beV3=(plan:string,slug:string,amount:number):AdapterPrice=>({
    serviceSlug:"disney-plus",serviceName:"Disney+",planSlug:slug,planName:plan,
    billingProviderSlug:"direct",countryCode:"BE",currency:"EUR",monthlyPriceMinor:amount,
    updatedAt:"2026-10-17T10:07:52.028Z",source:"v3-truth",
    sourceUrl:"https://help.disneyplus.com/en-GB/article/disneyplus-price?redirect=true",
    confidence:"official-provider-adapter",priceType:"exact",verification:"authoritative-provider",
    sourceCount:1,verifiedByAgreement:false
  });
  for(const item of [beV3("Disney+ Standard","disney-standard",1099),
    beV3("Disney+ Premium","disney-premium",1599)])await persistVerifiedLivePrices([item]);
  await pool.query(`INSERT INTO verified_provider_prices
    (plan_identity,history_series_id,service_slug,plan_slug,plan_name,billing_provider_slug,
     country_code,currency,monthly_price_minor,source,source_url,verification,source_count,
     verified_by_agreement,verified_at,last_checked_at)
    VALUES ('catalog:disney-plus:be:standard-with-ads:direct:eur',NULL,'disney-plus',
      'standard-with-ads','Standard with Ads','direct','BE','EUR',699,
      'official-provider-adapter:disney-plus','https://www.disneyplus.com/nl-be',
      'authoritative-provider',2,false,'2026-08-30T23:49:28.776834Z',
      '2026-09-23T09:25:08.743517Z')`);
  const historyBeforeRetirement=(await pool.query("SELECT count(*)::int AS n FROM verified_price_observations")).rows[0].n;
  await pool.query(sql("services/api/scripts/retire-disney-be-ads.sql"));
  assert.equal((await pool.query("SELECT count(*)::int AS n FROM verified_price_observations")).rows[0].n,historyBeforeRetirement);
  const archived=(await pool.query("SELECT reason,original_row,retired_at FROM verified_provider_price_retirements")).rows;
  assert.equal(archived.length,1);assert.equal(archived[0].original_row.monthly_price_minor,699);
  assert.match(archived[0].reason,/disputed legacy adapter price/);
  assert.deepEqual((await loadPersistedVerifiedPrices("BE","EUR")).map(row=>[row.planSlug,row.monthlyPriceMinor]),
    [["disney-premium",1599],["disney-standard",1099]]);
  await assert.rejects(pool.query(`INSERT INTO verified_provider_prices
    (plan_identity,service_slug,plan_slug,plan_name,billing_provider_slug,country_code,currency,
     monthly_price_minor,source,source_url,verification,source_count,verified_by_agreement)
    VALUES ('catalog:disney-plus:be:standard-with-ads:direct:eur','disney-plus','standard-with-ads',
      'Standard with Ads','direct','BE','EUR',699,'official-provider-adapter:disney-plus',
      'https://www.disneyplus.com/nl-be','authoritative-provider',2,false)`));
  await persistVerifiedLivePrices([beV3("Standard with Ads","standard-with-ads",799)]);
  assert.equal((await loadPersistedVerifiedPrices("BE","EUR")).find(row=>row.planSlug==="standard-with-ads")?.source,"v3-truth");
});
