import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {pool} from "./db.js";
import {privateDataPool} from "./private-data-db.js";
import {priceAnalyticsReport} from "./price-analytics.js";

const enabled=process.env.SAVLIVO_DISPOSABLE_DB_TEST==="1";
const id=(digit:string)=>`vh:${digit.repeat(64)}`;
const sql=(path:string)=>readFileSync(new URL(`../../../${path}`,import.meta.url),"utf8");

test("Price Analytics reads only structured provider-Verified history from a disposable database",{skip:!enabled},async t=>{
  assert.equal(process.env.DATABASE_URL,"postgresql://postgres@127.0.0.1:55439/savlivo_test");
  t.after(async()=>{await pool.end();await privateDataPool.end();});
  await pool.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public");
  for(const path of ["db/schema.sql","db/migrations/002_auth.sql","db/migrations/009_subscription_market.sql",
    "db/migrations/014_verified_price_observations.sql","db/migrations/019_suggested_provider_prices.sql",
    "db/migrations/023_durable_verified_price_history.sql","db/migrations/024_price_analytics_history_index.sql"])await pool.query(sql(path));
  assert.equal((await pool.query("SELECT to_regclass('verified_price_observations_service_series_time_idx') IS NOT NULL AS present")).rows[0].present,true);
  const a=id("a"),b=id("b");
  for(const [series,market,currency,amount] of [[a,"NO","NOK",10900],[b,"SE","SEK",12900]] as const){
    await pool.query(`INSERT INTO verified_provider_prices(plan_identity,history_series_id,service_slug,plan_slug,plan_name,
      billing_provider_slug,country_code,currency,monthly_price_minor,source,source_url,verification,source_count,
      verified_by_agreement,verified_at,last_checked_at)
      VALUES($1,$2,'disney-plus','standard','Disney+ Standard','direct',$3,$4,$5,'v3-truth',
        'https://provider.example/prices','authoritative-provider',1,false,'2026-09-01T00:00:00Z','2026-10-18T00:00:00Z')`,
    [`catalog:disney-plus:${market.toLowerCase()}:standard:direct:${currency.toLowerCase()}`,series,market,currency,amount]);
  }
  await pool.query(`INSERT INTO verified_provider_prices(plan_identity,service_slug,plan_slug,plan_name,billing_provider_slug,
    country_code,currency,monthly_price_minor,source,source_url,verification,source_count,verified_by_agreement)
    VALUES('catalog:disney-plus:no:weak:direct:nok','disney-plus','weak','Weak registry','direct','NO','NOK',5990,
      'registry','https://provider.example/prices','registry',1,false)`);
  for(const [series,market,currency,kind,amount,date] of [
    [a,"NO","NOK","BASELINE",8990,"2026-05-01T00:00:00Z"],
    [a,"NO","NOK","PRICE_CHANGE",10900,"2026-09-01T00:00:00Z"],
    [b,"SE","SEK","BASELINE",12900,"2026-08-01T00:00:00Z"]
  ])await pool.query(`INSERT INTO verified_price_observations(history_series_id,history_event_kind,plan_identity,billing_interval,
    service_slug,plan_slug,plan_name,billing_provider_slug,country_code,currency,monthly_price_minor,source,source_url,
    verification,source_count,verified_by_agreement,provider_verified_at)
    VALUES($1,$2,'catalog:disney-plus:standard','MONTHLY_RECURRING','disney-plus','standard','Disney+ Standard',
      'direct',$3,$4,$5,'v3-truth','https://provider.example/prices','authoritative-provider',1,false,$6::timestamptz)`,
    [series,kind,market,currency,amount,date]);
  await pool.query(`INSERT INTO verified_price_observations(service_slug,plan_slug,plan_name,billing_provider_slug,
    country_code,currency,monthly_price_minor,source,source_url,verification,source_count,verified_by_agreement,
    provider_verified_at) VALUES('disney-plus','standard','Unlinked legacy','direct','NO','NOK',6990,'legacy',
    'https://provider.example/older','authoritative-provider',1,false,'2026-01-01T00:00:00Z')`);
  await pool.query(`INSERT INTO suggested_provider_prices(suggested_id,plan_identity,service_slug,plan_name,billing_provider_slug,
    country_code,currency,monthly_price_minor,payment_cadence,provenance,source_url,researched_at,warnings,active)
    VALUES('suggested:fixture','catalog:disney-plus:no:standard:direct:nok','disney-plus','Suggested','direct','NO','NOK',4990,
      'MONTHLY_RECURRING','V3_SOURCE_RESEARCH','https://provider.example/prices',now(),'[]',true)`);
  const user=(await pool.query("INSERT INTO users(email,password_hash) VALUES('price-analytics@example.invalid','disabled') RETURNING id")).rows[0].id;
  await pool.query(`INSERT INTO subscriptions(user_id,service_id,billing_provider_id,status,country_code,currency,monthly_price_minor)
    SELECT $1,s.id,b.id,'ACTIVE','NO','NOK',29900 FROM services s,billing_providers b
    WHERE s.slug='disney-plus' AND b.slug='direct'`,[user]);
  const all=await priceAnalyticsReport({service:"disney-plus",market:null,plan:null,period:"All"});
  assert.equal(all.state,"AVAILABLE");
  if(all.state!=="AVAILABLE")return;
  assert.equal(all.summary.plans,2);assert.equal(all.summary.markets,2);
  assert.equal(all.series.length,2);assert.equal(all.changes.length,1);
  assert.deepEqual(all.series.find(row=>row.seriesId===a)?.points.map(row=>row.amountMinor),[8990,10900]);
  assert.equal(JSON.stringify(all).includes("Unlinked legacy"),false);
  assert.equal(JSON.stringify(all).includes("29900"),false);
  assert.equal(JSON.stringify(all).includes("4990"),false);
  const windowed=await priceAnalyticsReport({service:"disney-plus",market:"NO",plan:null,period:"3M"});
  assert.equal(windowed.state,"AVAILABLE");
  if(windowed.state==="AVAILABLE"){
    assert.equal(windowed.changes.length,1);
    assert.deepEqual(windowed.series[0].points.map(row=>row.amountMinor),[8990,10900]);
    assert.equal(windowed.series[0].points[0].kind,"CARRIED_BASELINE");
  }
  const selected=await priceAnalyticsReport({service:"disney-plus",market:"NO",plan:a,period:"All"});
  assert.equal(selected.state,"AVAILABLE");
  if(selected.state==="AVAILABLE"){
    assert.equal(selected.summary.plans,1);assert.equal(selected.summary.markets,1);
    assert.equal(selected.series.length,1);assert.equal(selected.changes.length,1);
  }
});
