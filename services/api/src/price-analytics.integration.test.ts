import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {pool} from "./db.js";
import {privateDataPool} from "./private-data-db.js";
import {priceAnalyticsReport,projectPriceAnalytics} from "./price-analytics.js";

const enabled=process.env.SAVLIVO_DISPOSABLE_DB_TEST==="1";
const id=(digit:string)=>`vh:${digit.repeat(64)}`;
const sql=(path:string)=>readFileSync(new URL(`../../../${path}`,import.meta.url),"utf8");

test("Price Analytics current counts exclude old adapter rows but preserve historical series",()=>{
  const base={service_slug:"max",plan_slug:"basic",plan_name:"Basic",history_series_id:id("a"),
    country_code:"NO",currency:"NOK",monthly_price_minor:9900,
    verified_at:"2026-10-19T00:00:00Z",last_checked_at:"2026-10-19T00:00:00Z",
    verification:"authoritative-provider",source_count:1,verified_by_agreement:false};
  const current=[{...base,source:"official-provider-adapter:max"},
    {...base,plan_slug:"standard",plan_name:"Standard",history_series_id:id("b"),
      monthly_price_minor:12900,source:"v3-truth"}];
  const result=projectPriceAnalytics(current,[],{service:"max",market:null,plan:null,period:"All"});
  assert.equal(result.summary.plans,1);
  assert.equal(result.summary.markets,1);
  assert.equal(result.summary.oldVerifiedPlans,1);
  assert.equal(result.summary.oldVerifiedMarkets,1);
  assert.deepEqual(result.summary.recentVerifications.map(row=>row.planName),["Standard"]);
});

test("Price Analytics reads only structured provider-Verified history from a disposable database",{skip:!enabled},async t=>{
  assert.equal(process.env.DATABASE_URL,"postgresql://postgres@127.0.0.1:55439/savlivo_test");
  t.after(async()=>{await pool.end();await privateDataPool.end();});
  await pool.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public");
  for(const path of ["db/schema.sql","db/migrations/002_auth.sql","db/migrations/009_subscription_market.sql",
    "db/migrations/014_verified_price_observations.sql","db/migrations/019_suggested_provider_prices.sql",
    "db/migrations/023_durable_verified_price_history.sql","db/migrations/024_price_analytics_history_index.sql",
    "db/migrations/025_verified_bootstrap_integrity.sql"])await pool.query(sql(path));
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
  const c=id("c");
  await pool.query(`INSERT INTO verified_provider_prices(plan_identity,history_series_id,service_slug,plan_slug,plan_name,
    billing_provider_slug,country_code,currency,monthly_price_minor,source,source_url,verification,source_count,
    verified_by_agreement,verified_at,last_checked_at)
    VALUES('catalog:disney-plus:no:premium:direct:nok',$1,'disney-plus','premium','Premium','direct','NO',
      'NOK',15900,'v3-truth','https://provider.example/prices','authoritative-provider',1,false,
      '2026-05-01T00:00:00Z',now())`,[c]);
  const observed=(await pool.query(`INSERT INTO verified_price_observations(history_series_id,history_event_kind,
    plan_identity,billing_interval,service_slug,plan_slug,plan_name,billing_provider_slug,country_code,currency,
    monthly_price_minor,source,source_url,verification,source_count,verified_by_agreement,provider_verified_at,
    observed_at)
    VALUES($1,'BOOTSTRAP_BASELINE','catalog:disney-plus:no:premium:direct:nok','MONTHLY_RECURRING',
      'disney-plus','premium','Premium','direct','NO','NOK',15900,'v3-truth','https://provider.example/prices',
      'authoritative-provider',1,false,'2026-05-01T00:00:00Z',now()-interval '1 hour')
    RETURNING observed_at`,[c])).rows[0].observed_at;
  const bootstrap=await priceAnalyticsReport({service:"disney-plus",market:"NO",plan:c,period:"3M"});
  assert.equal(bootstrap.state,"AVAILABLE");
  if(bootstrap.state==="AVAILABLE"){
    assert.equal(bootstrap.series.length,1);
    assert.equal(bootstrap.series[0].points[0].at,new Date(observed).toISOString());
    assert.equal(bootstrap.series[0].points[0].verifiedAt,"2026-05-01T00:00:00.000Z");
    assert.equal(bootstrap.series[0].olderHistoryUnavailable,true);
    assert.equal(bootstrap.changes.length,0);
    assert.equal(bootstrap.summary.priceChanges30d,0);
  }
  await pool.query(`UPDATE verified_provider_prices SET monthly_price_minor=16900,verified_at=now(),
    last_checked_at=now() WHERE history_series_id=$1`,[c]);
  await pool.query(`INSERT INTO verified_price_observations(history_series_id,history_event_kind,
    plan_identity,billing_interval,service_slug,plan_slug,plan_name,billing_provider_slug,country_code,currency,
    monthly_price_minor,source,source_url,verification,source_count,verified_by_agreement,provider_verified_at)
    VALUES($1,'PRICE_CHANGE','catalog:disney-plus:no:premium:direct:nok','MONTHLY_RECURRING',
      'disney-plus','premium','Premium','direct','NO','NOK',16900,'v3-truth','https://provider.example/prices',
      'authoritative-provider',1,false,now())`,[c]);
  const changed=await priceAnalyticsReport({service:"disney-plus",market:"NO",plan:c,period:"3M"});
  assert.equal(changed.state,"AVAILABLE");
  if(changed.state==="AVAILABLE"){
    assert.deepEqual(changed.series[0].points.map(point=>point.kind),["BOOTSTRAP_BASELINE","PRICE_CHANGE"]);
    assert.equal(changed.series[0].points[0].at,new Date(observed).toISOString());
    assert.equal(changed.changes.length,1);
    assert.ok(Math.abs(changed.changes[0].percent-(1000/15900*100))<0.0001);
    assert.ok(Math.abs(changed.series[0].points[1].index!-(16900/15900*100))<0.0001);
  }
});
