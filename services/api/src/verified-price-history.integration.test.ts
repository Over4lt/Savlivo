import test from "node:test";
import assert from "node:assert/strict";
import {pool} from "./db.js";
import {persistVerifiedLivePrices} from "./pricing-store.js";
import type {AdapterPrice} from "./pricing-adapters.js";

const enabled=process.env.SAVLIVO_DISPOSABLE_DB_TEST==="1";
const expectedUrl="postgresql://postgres@127.0.0.1:55439/savlivo_test";
const at=(day:number)=>`2026-10-${String(day).padStart(2,"0")}T12:00:00.000Z`;
const price=(slug:string,planName:string,amount:number,day:number,other:Partial<AdapterPrice>={}):AdapterPrice=>({
  serviceSlug:"disney-plus",serviceName:"Disney+",planSlug:"history-test-"+slug,planName,
  billingProviderSlug:"direct",countryCode:"DE",currency:"EUR",monthlyPriceMinor:amount,
  updatedAt:at(day),source:"v3-truth",sourceUrl:"https://provider.example/de/prices",
  confidence:"official-provider-adapter",priceType:"exact",verification:"authoritative-provider",
  sourceCount:1,verifiedByAgreement:false,...other
});
const events=async(slug:string)=>(await pool.query(`SELECT history_series_id,history_event_kind,plan_identity,
  plan_slug,plan_name,country_code,currency,billing_interval,monthly_price_minor,
  provider_verified_at,observed_at,provider_effective_at,source_url
  FROM verified_price_observations WHERE service_slug='disney-plus' AND plan_slug=$1
    AND history_series_id IS NOT NULL ORDER BY provider_verified_at,id`,["history-test-"+slug])).rows;
const current=async(slug:string)=>(await pool.query(`SELECT * FROM verified_provider_prices
  WHERE service_slug='disney-plus' AND plan_slug=$1 AND country_code='DE'`,["history-test-"+slug])).rows;
const reset=async()=>{
  await pool.query("DELETE FROM verified_provider_prices WHERE service_slug='disney-plus' AND plan_slug LIKE 'history-test-%'");
  await pool.query("DELETE FROM verified_price_observations WHERE service_slug='disney-plus' AND plan_slug LIKE 'history-test-%'");
};

test("durable Verified history uses only genuine, atomic, stable provider observations",{skip:!enabled},async t=>{
  assert.equal(process.env.DATABASE_URL,expectedUrl);
  await reset();
  t.after(async()=>{await reset();await pool.end();});
  await t.test("first Verified baseline, real changes, unchanged checks and name-only updates",async()=>{
    const base=price("basic","Basic",899,1),changed=price("basic","Basic",1099,2);
    await persistVerifiedLivePrices([base]);
    let rows=await events("basic");assert.deepEqual(rows.map(row=>row.history_event_kind),["BASELINE"]);
    assert.equal(rows[0].monthly_price_minor,899);assert.equal(rows[0].billing_interval,"MONTHLY_RECURRING");
    assert.equal(rows[0].provider_effective_at,null);assert.equal(rows[0].source_url,base.sourceUrl);
    assert.equal(new Date(rows[0].provider_verified_at).toISOString(),base.updatedAt);
    assert.ok(new Date(rows[0].observed_at).getTime()>Date.parse(base.updatedAt));
    await persistVerifiedLivePrices([changed]);
    await persistVerifiedLivePrices([changed]);
    await persistVerifiedLivePrices([price("basic","Basic renamed",1099,3)]);
    await persistVerifiedLivePrices([price("basic","Basic renamed",1099,4)]);
    rows=await events("basic");assert.deepEqual(rows.map(row=>row.history_event_kind),["BASELINE","PRICE_CHANGE"]);
    assert.deepEqual(rows.map(row=>row.monthly_price_minor),[899,1099]);
    assert.equal(rows[0].history_series_id,rows[1].history_series_id);
    const currentBasic=(await current("basic"))[0];
    assert.equal(currentBasic.plan_name,"Basic renamed");
    assert.equal(currentBasic.history_series_id,rows[0].history_series_id);
    assert.equal(new Date(currentBasic.verified_at).toISOString(),at(3));
    assert.equal(new Date(currentBasic.last_checked_at).toISOString(),at(4));
    await persistVerifiedLivePrices([price("basic","Basic renamed",899,5)]);
    rows=await events("basic");assert.deepEqual(rows.map(row=>row.monthly_price_minor),[899,1099,899]);
    assert.deepEqual(rows.map(row=>row.history_event_kind),["BASELINE","PRICE_CHANGE","PRICE_CHANGE"]);
  });
  await t.test("proven prefix aliases share a series, while other plans remain distinct",async()=>{
    const standard=price("standard","Standard",899,1),prefixed=price("disney-standard","Disney+ Standard",899,2);
    await persistVerifiedLivePrices([standard]);
    const first=(await events("standard"))[0];
    await persistVerifiedLivePrices([prefixed]);
    assert.equal((await current("standard")).length,0);
    assert.equal((await events("disney-standard")).length,0,"rename is not a monetary event");
    assert.equal((await current("disney-standard"))[0].history_series_id,first.history_series_id);
    await persistVerifiedLivePrices([price("disney-standard","Disney+ Standard",1099,3)]);
    assert.equal((await events("disney-standard"))[0].history_series_id,first.history_series_id);
    for(const [slug,name] of [["ads","Standard with ads"],["premium","Premium"],["extra","Extra Member"]])
      await persistVerifiedLivePrices([price(slug,name,699,1)]);
    const ids=(await pool.query(`SELECT DISTINCT history_series_id FROM verified_provider_prices
      WHERE service_slug='disney-plus' AND plan_slug LIKE 'history-test-%' AND plan_slug IN
      ('history-test-disney-standard','history-test-ads','history-test-premium','history-test-extra')`)).rows;
    assert.equal(ids.length,4);
  });
  await t.test("two legacy current alias rows retain their verified sequence before reconciliation",async()=>{
    const old=price("dual-standard","Standard",899,1),exact=price("dual-disney-standard","Disney+ Standard",1099,2);
    for(const row of [old,exact])await pool.query(`INSERT INTO verified_provider_prices
      (plan_identity,service_slug,plan_slug,plan_name,billing_provider_slug,country_code,currency,
       monthly_price_minor,source,source_url,verification,source_count,verified_by_agreement,verified_at,last_checked_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$14)`,[
        `catalog:disney-plus:de:${row.planSlug}:direct:eur`,row.serviceSlug,row.planSlug,row.planName,row.billingProviderSlug,
        row.countryCode,row.currency,row.monthlyPriceMinor,row.source,row.sourceUrl,row.verification,row.sourceCount,row.verifiedByAgreement,row.updatedAt]);
    await persistVerifiedLivePrices([price("dual-disney-standard","Disney+ Standard",1199,3)]);
    const rows=(await pool.query(`SELECT history_series_id,history_event_kind,monthly_price_minor
      FROM verified_price_observations WHERE service_slug='disney-plus'
        AND plan_slug IN ('history-test-dual-standard','history-test-dual-disney-standard')
        AND history_series_id IS NOT NULL ORDER BY provider_verified_at,id`)).rows;
    assert.deepEqual(rows.map(row=>row.monthly_price_minor),[899,1099,1199]);
    assert.deepEqual(rows.map(row=>row.history_event_kind),["BOOTSTRAP_BASELINE","PRICE_CHANGE","PRICE_CHANGE"]);
    assert.equal(new Set(rows.map(row=>row.history_series_id)).size,1);
    assert.equal((await current("dual-standard")).length,0);
  });
  await t.test("market and currency boundaries are separate; annual input is rejected",async()=>{
    await persistVerifiedLivePrices([price("market","Market plan",999,1)]);
    await persistVerifiedLivePrices([price("market","Market plan",999,1,{countryCode:"NO",currency:"NOK"})]);
    await persistVerifiedLivePrices([price("market","Market plan",999,1,{currency:"USD"})]);
    await persistVerifiedLivePrices([price("market","Market plan",999,1,{billingProviderSlug:"apple"})]);
    const ids=(await pool.query(`SELECT DISTINCT history_series_id FROM verified_provider_prices
      WHERE service_slug='disney-plus' AND plan_slug='history-test-market'`)).rows;
    assert.equal(ids.length,4);
    await assert.rejects(persistVerifiedLivePrices([price("annual","Annual",999,1,{billingInterval:"ANNUAL_RECURRING"})]),/VERIFIED_PRICE_BILLING_INTERVAL_UNSUPPORTED/);
    assert.equal((await events("annual")).length,0);
  });
  await t.test("Suggested and personal overrides never become provider-Verified history",async()=>{
    const weak=price("weak","Suggested",999,1,{verification:"single-source",sourceCount:1});
    await persistVerifiedLivePrices([weak,price("range","Range",999,1,{priceType:"range"})]);
    assert.equal((await events("weak")).length,0);assert.equal((await events("range")).length,0);
    const before=(await pool.query("SELECT count(*)::int n FROM verified_price_observations WHERE service_slug='disney-plus' AND history_series_id IS NOT NULL")).rows[0].n;
    const user=(await pool.query("INSERT INTO users(email,password_hash) VALUES('history-test@example.invalid','disabled') RETURNING id")).rows[0].id;
    try{
      await pool.query(`INSERT INTO subscriptions(user_id,service_id,billing_provider_id,status,country_code,currency,monthly_price_minor)
        SELECT $1,s.id,b.id,'ACTIVE','DE','EUR',12345 FROM services s,billing_providers b
        WHERE s.slug='disney-plus' AND b.slug='direct'`,[user]);
      assert.equal((await pool.query("SELECT count(*)::int n FROM verified_price_observations WHERE service_slug='disney-plus' AND history_series_id IS NOT NULL")).rows[0].n,before);
    }finally{await pool.query("DELETE FROM users WHERE id=$1",[user]);}
  });
  await t.test("pre-migration current value becomes an as-of bootstrap, never an invented first verification",async()=>{
    const old=price("legacy-current","Legacy current",799,1);
    await pool.query(`INSERT INTO verified_provider_prices(plan_identity,service_slug,plan_slug,plan_name,billing_provider_slug,
      country_code,currency,monthly_price_minor,source,source_url,verification,source_count,verified_by_agreement,verified_at,last_checked_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$14)`,[
      "catalog:disney-plus:de:legacy-current:direct:eur",old.serviceSlug,old.planSlug,old.planName,old.billingProviderSlug,
      old.countryCode,old.currency,old.monthlyPriceMinor,old.source,old.sourceUrl,old.verification,old.sourceCount,old.verifiedByAgreement,old.updatedAt]);
    await persistVerifiedLivePrices([price("legacy-current","Legacy current",799,2)]);
    const initial=(await events("legacy-current"));
    assert.deepEqual(initial.map(row=>row.history_event_kind),["BOOTSTRAP_BASELINE"]);
    assert.ok(new Date(initial[0].observed_at).getTime()>Date.parse(old.updatedAt));
    await persistVerifiedLivePrices([price("legacy-current","Legacy current",999,3)]);
    assert.deepEqual((await events("legacy-current")).map(row=>row.history_event_kind),["BOOTSTRAP_BASELINE","PRICE_CHANGE"]);
  });
  await t.test("first post-migration write of a changed legacy current price keeps both real amounts",async()=>{
    const old=price("legacy-change","Legacy changed",799,1);
    await pool.query(`INSERT INTO verified_provider_prices(plan_identity,service_slug,plan_slug,plan_name,billing_provider_slug,
      country_code,currency,monthly_price_minor,source,source_url,verification,source_count,verified_by_agreement,verified_at,last_checked_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$14)`,[
      "catalog:disney-plus:de:legacy-change:direct:eur",old.serviceSlug,old.planSlug,old.planName,old.billingProviderSlug,
      old.countryCode,old.currency,old.monthlyPriceMinor,old.source,old.sourceUrl,old.verification,old.sourceCount,old.verifiedByAgreement,old.updatedAt]);
    await persistVerifiedLivePrices([price("legacy-change","Legacy changed",999,2)]);
    const rows=await events("legacy-change");
    assert.deepEqual(rows.map(row=>row.history_event_kind),["BOOTSTRAP_BASELINE","PRICE_CHANGE"]);
    assert.deepEqual(rows.map(row=>row.monthly_price_minor),[799,999]);
    assert.equal((await current("legacy-change"))[0].monthly_price_minor,999);
  });
  await t.test("legacy history remains intact and is never silently assigned a new series",async()=>{
    const old=price("legacy-record","Legacy",799,1);
    const legacy=(await pool.query(`INSERT INTO verified_price_observations
      (service_slug,plan_slug,plan_name,billing_provider_slug,country_code,currency,monthly_price_minor,
       source,source_url,verification,source_count,verified_by_agreement,provider_verified_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id`,[
        old.serviceSlug,old.planSlug,old.planName,old.billingProviderSlug,old.countryCode,old.currency,old.monthlyPriceMinor,
        old.source,old.sourceUrl,old.verification,old.sourceCount,old.verifiedByAgreement,old.updatedAt])).rows[0].id;
    await persistVerifiedLivePrices([price("legacy-record","Legacy",999,2)]);
    const rows=(await pool.query("SELECT id,history_series_id,monthly_price_minor FROM verified_price_observations WHERE plan_slug='history-test-legacy-record' ORDER BY id")).rows;
    assert.equal(rows.length,2);assert.equal(rows[0].id,legacy);assert.equal(rows[0].history_series_id,null);
  });
  await t.test("concurrent retries produce one baseline and one current value",async()=>{
    const item=price("concurrent","Concurrent",999,1);
    await Promise.all(Array.from({length:5},()=>persistVerifiedLivePrices([item])));
    assert.equal((await events("concurrent")).length,1);
    assert.equal((await current("concurrent")).length,1);
  });
  await t.test("conflicting value at an already recorded verification instant rolls back",async()=>{
    await persistVerifiedLivePrices([price("same-instant","Instant",899,1)]);
    await persistVerifiedLivePrices([price("same-instant","Instant",999,2)]);
    await assert.rejects(persistVerifiedLivePrices([price("same-instant","Instant",1099,2)]),/VERIFIED_HISTORY_EVENT_CONFLICT/);
    assert.equal((await current("same-instant"))[0].monthly_price_minor,999);
    assert.deepEqual((await events("same-instant")).map(row=>row.monthly_price_minor),[899,999]);
  });
  await t.test("history insertion failure rolls back the authoritative current-price change",async()=>{
    const initial=price("atomic","Atomic",999,1);await persistVerifiedLivePrices([initial]);
    await pool.query(`CREATE FUNCTION history_test_reject_change() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.plan_slug='history-test-atomic' AND NEW.history_event_kind='PRICE_CHANGE'
        THEN RAISE EXCEPTION 'synthetic history failure'; END IF; RETURN NEW; END $$`);
    await pool.query(`CREATE TRIGGER history_test_reject_change BEFORE INSERT ON verified_price_observations
      FOR EACH ROW EXECUTE FUNCTION history_test_reject_change()`);
    try{
      await assert.rejects(persistVerifiedLivePrices([price("atomic","Atomic",1099,2)]),/synthetic history failure/);
      assert.equal((await current("atomic"))[0].monthly_price_minor,999);
      assert.deepEqual((await events("atomic")).map(row=>row.monthly_price_minor),[999]);
    }finally{
      await pool.query("DROP TRIGGER history_test_reject_change ON verified_price_observations");
      await pool.query("DROP FUNCTION history_test_reject_change()");
    }
  });
});
