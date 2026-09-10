import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
import {countryCurrencyData} from "../../../packages/contracts/src/markets.js";
import {serviceCatalog} from "../../../packages/contracts/src/catalog.js";
import {subscriptionForClient,subscriptionEditIdentity} from "./subscription-format.js";
import {pool} from "./db.js";
import {addSubscription,updateSubscription,listSubscriptions,deleteSubscription} from "./repositories.js";

const enabled=process.env.SAVLIVO_DISPOSABLE_DB_TEST==="1";
test("016–018 are additive and rerunnable; existing data and new-market manual amounts survive",{skip:!enabled},async()=>{
  assert.equal(process.env.DATABASE_URL,"postgresql://postgres@127.0.0.1:55439/savlivo_test");
  const sql=(path:string)=>readFileSync(new URL(`../../../${path}`,import.meta.url),"utf8");
  try{
    await pool.query(sql("db/schema.sql"));
    for(const name of ["002_auth.sql","003_billing.sql","004_subscription_status_history.sql","005_status_history_invariants.sql","009_subscription_market.sql","012_manual_subscriptions.sql"])
      await pool.query(sql(`db/migrations/${name}`));
    const user=(await pool.query("INSERT INTO users(email,password_hash) VALUES('catalog-fixture@local.invalid','disabled') RETURNING id")).rows[0].id;
    await addSubscription({userId:user,serviceSlug:"netflix",billingProviderSlug:"direct",countryCode:"NO",currency:"NOK",monthlyPriceMinor:14900});
    await addSubscription({userId:user,serviceSlug:"manual",customServiceName:"Fixture manual",billingProviderSlug:"direct",countryCode:"SE",currency:"SEK",monthlyPriceMinor:100});
    const before=(await pool.query("SELECT * FROM subscriptions ORDER BY id")).rows;
    const services=(await pool.query("SELECT * FROM services ORDER BY slug")).rows;
    const migration=sql("db/migrations/016_add_storytel.sql");
    await pool.query(migration);await pool.query(migration);
    assert.deepEqual((await pool.query("SELECT * FROM subscriptions ORDER BY id")).rows,before);
    assert.deepEqual((await pool.query("SELECT * FROM services WHERE slug<>'storytel' ORDER BY slug")).rows,services);
    assert.equal((await pool.query("SELECT count(*)::int n FROM services WHERE slug='storytel'")).rows[0].n,1);
    const added=await addSubscription({userId:user,serviceSlug:"storytel",billingProviderSlug:"direct",countryCode:"NO",currency:"NOK",monthlyPriceMinor:21900,planName:"Unlimited"});
    assert.equal(added.serviceName,"Storytel");assert.equal(added.serviceSlug,"storytel");
    const edited=await updateSubscription({userId:user,subscriptionId:added.id,serviceSlug:"storytel",billingProviderSlug:"direct",currency:"NOK",monthlyPriceMinor:18900,planName:"Premium"});
    assert.equal(edited.countryCode,"NO");assert.equal(edited.planName,"Premium");
    assert.equal((await listSubscriptions(user)).length,3);
    assert.equal(await deleteSubscription(user,added.id),true);
    assert.equal((await listSubscriptions(user)).length,2);
    const beforeExpansion=(await pool.query("SELECT * FROM subscriptions ORDER BY id")).rows;
    const existingServices=(await pool.query("SELECT * FROM services ORDER BY slug")).rows;
    const expansion=sql("db/migrations/017_add_available_catalog_services.sql");
    await pool.query(expansion);await pool.query(expansion);
    assert.deepEqual((await pool.query("SELECT * FROM subscriptions ORDER BY id")).rows,beforeExpansion);
    for(const old of existingServices)assert.deepEqual((await pool.query("SELECT * FROM services WHERE slug=$1",[old.slug])).rows[0],old);
    const marketExpansion=sql("db/migrations/018_add_market_catalog_services.sql");
    await pool.query(marketExpansion);await pool.query(marketExpansion);
    assert.deepEqual((await pool.query("SELECT * FROM subscriptions ORDER BY id")).rows,beforeExpansion);
    for(const old of existingServices)assert.deepEqual((await pool.query("SELECT * FROM services WHERE slug=$1",[old.slug])).rows[0],old);
    for(const service of serviceCatalog.slice(48))assert.equal((await pool.query("SELECT count(*)::int n FROM services WHERE slug=$1",[service.slug])).rows[0].n,1);
    for(const [countryCode,,currency] of countryCurrencyData.slice(30)){
      const row=await addSubscription({userId:user,serviceSlug:"manual",customServiceName:"Market fixture",billingProviderSlug:"direct",countryCode,currency,monthlyPriceMinor:1234});
      assert.equal(row.countryCode,countryCode);assert.equal(row.monthlyPriceMinor,1234);
      const edited=await updateSubscription({userId:user,subscriptionId:row.id,...subscriptionEditIdentity(subscriptionForClient(row,false).serviceSlug,row.id,false),billingProviderSlug:"direct",currency,monthlyPriceMinor:1256});
      assert.equal(edited.customServiceName,"Market fixture");assert.equal(edited.monthlyPriceMinor,1256);
      assert.equal(await deleteSubscription(user,row.id),true);
    }
    for(const [serviceSlug,countryCode,currency] of [["rtl-plus","DE","EUR"],["videoland","NL","EUR"],["nintendo-switch-online","US","USD"],["osn-plus","AE","AED"]]){
      assert.equal((await pool.query("SELECT count(*)::int n FROM services WHERE slug=$1",[serviceSlug])).rows[0].n,1);
      const manualPrice=await addSubscription({userId:user,serviceSlug,billingProviderSlug:"direct",countryCode,currency,monthlyPriceMinor:1234,planName:"User-entered plan"});
      assert.equal(manualPrice.serviceSlug,serviceSlug);
      assert.equal(manualPrice.monthlyPriceMinor,1234);
      assert.equal(await deleteSubscription(user,manualPrice.id),true);
    }
  }finally{await pool.end();}
});
