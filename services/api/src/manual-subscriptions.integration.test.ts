import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { pool } from "./db.js";
import { addSubscription, getSubscription, listSubscriptions, updateSubscription, updateSubscriptionStatus, listSavingsEvents, deleteSubscription } from "./repositories.js";
import { queueRenewalReminders } from "./notifications.js";
import { subscriptionEditIdentity, subscriptionForClient } from "./subscription-format.js";

// Explicit disposable test database only. Never inherit a developer/production DB URL.
const enabled=process.env.SAVLIVO_DISPOSABLE_DB_TEST==="1";
test("additive migration preserves known bills and manual records round-trip with isolation and reminders",{skip:!enabled},async()=>{
  assert.equal(process.env.DATABASE_URL,"postgresql://postgres@127.0.0.1:55439/savlivo_test");
  const sql=(path:string)=>readFileSync(new URL(`../../../${path}`,import.meta.url),"utf8");
  try {
    await pool.query(sql("db/schema.sql"));
    for(const name of ["002_auth.sql","003_billing.sql","004_subscription_status_history.sql","005_status_history_invariants.sql","009_subscription_market.sql","011_add_viaplay.sql"])await pool.query(sql(`db/migrations/${name}`));
    await pool.query(sql("services/api/migrations/20260824_notifications.sql"));
    const user=(await pool.query("INSERT INTO users(email,password_hash,timezone) VALUES ('discovery@local.invalid','disabled','Europe/Oslo') RETURNING id")).rows[0].id;
    const other=(await pool.query("INSERT INTO users(email,password_hash) VALUES ('other@local.invalid','disabled') RETURNING id")).rows[0].id;
    await pool.query("INSERT INTO services(slug,name) VALUES ('netflix','Netflix') ON CONFLICT DO NOTHING");
    await pool.query("INSERT INTO billing_providers(slug,name,provider_type) VALUES ('direct','Direct','DIRECT'),('carrier','Carrier','GUIDED'),('apple','Apple','APPLE') ON CONFLICT DO NOTHING");
    const known=(await pool.query(`INSERT INTO subscriptions(user_id,service_id,billing_provider_id,country_code,status,monthly_price_minor,currency) SELECT $1,svc.id,bp.id,'NO','ACTIVE',12900,'NOK' FROM services svc,billing_providers bp WHERE svc.slug='netflix' AND bp.slug='direct' RETURNING *`,[user])).rows[0];
    const migration=sql("db/migrations/012_manual_subscriptions.sql");
    await pool.query(migration);await pool.query(migration);
    const after=(await pool.query("SELECT * FROM subscriptions WHERE id=$1",[known.id])).rows[0];
    for(const key of Object.keys(known))assert.deepEqual(after[key],known[key],key);
    assert.equal(after.custom_service_name,null);
    const renewal=(await pool.query("SELECT to_char(CURRENT_DATE+3,'YYYY-MM-DD') value")).rows[0].value;
    const created=await addSubscription({userId:user,serviceSlug:"manual",customServiceName:"LokalTV",billingProviderSlug:"carrier",countryCode:"NO",currency:"NOK",monthlyPriceMinor:12345,planName:"My actual plan",renewalDate:renewal});
    assert.equal(created.serviceSlug,"manual");assert.equal(created.serviceName,"LokalTV");assert.equal(created.customServiceName,"LokalTV");assert.equal(created.monthlyPriceMinor,12345);assert.equal(created.countryCode,"NO");
    assert.equal((await pool.query("SELECT service_id FROM subscriptions WHERE id=$1",[created.id])).rows[0].service_id,null);
    assert.equal((await pool.query("SELECT count(*)::int n FROM services WHERE name='LokalTV'")).rows[0].n,0);
    const legacy = subscriptionForClient(created, false);
    const legacyEdited = await updateSubscription({userId:user,subscriptionId:created.id,
      ...subscriptionEditIdentity(legacy.serviceSlug,created.id,false),billingProviderSlug:"carrier",currency:"NOK",monthlyPriceMinor:13000,planName:"Legacy edit",renewalDate:renewal});
    assert.equal(legacyEdited.customServiceName,"LokalTV");
    assert.equal(legacyEdited.serviceSlug,"manual");
    assert.equal(legacyEdited.monthlyPriceMinor,13000);
    const preserved = await updateSubscription({userId:user,subscriptionId:created.id,
      ...subscriptionEditIdentity(legacy.serviceSlug,created.id,false),customServiceName:"Untrusted replacement",billingProviderSlug:"carrier",currency:"NOK",monthlyPriceMinor:13000,renewalDate:renewal});
    assert.equal(preserved.customServiceName,"LokalTV");
    const disposable = await addSubscription({userId:user,serviceSlug:"manual",customServiceName:"Legacy status/delete",billingProviderSlug:"carrier",countryCode:"NO",currency:"NOK",monthlyPriceMinor:100});
    const legacyDisposable = subscriptionForClient(disposable,false);
    await updateSubscriptionStatus({userId:user,subscriptionId:legacyDisposable.id,status:"PAUSED",effectiveDate:renewal});
    assert.equal((await getSubscription(user,legacyDisposable.id)).status,"PAUSED");
    assert.equal(await deleteSubscription(other,legacyDisposable.id),false);
    assert.equal(await deleteSubscription(user,legacyDisposable.id),true);
    await assert.rejects(updateSubscription({userId:other,subscriptionId:created.id,
      ...subscriptionEditIdentity(legacy.serviceSlug,created.id,false),billingProviderSlug:"carrier",currency:"NOK",monthlyPriceMinor:1}),/NOT_FOUND/);
    await assert.rejects(updateSubscription({userId:user,subscriptionId:known.id,
      ...subscriptionEditIdentity(`manual:${known.id}`,known.id,false),billingProviderSlug:"direct",currency:"NOK",monthlyPriceMinor:1}),/NOT_FOUND/);
    assert.equal(await getSubscription(other,created.id),null);
    await assert.rejects(updateSubscription({userId:other,subscriptionId:created.id,serviceSlug:"manual",customServiceName:"Wrong owner",billingProviderSlug:"direct",monthlyPriceMinor:1,currency:"NOK"}),/NOT_FOUND/);
    const updated=await updateSubscription({userId:user,subscriptionId:created.id,serviceSlug:"manual",customServiceName:"Local TV renamed",billingProviderSlug:"apple",currency:"NOK",monthlyPriceMinor:11900,planName:"Updated",renewalDate:renewal});
    assert.equal(updated.serviceName,"Local TV renamed");assert.equal(updated.billingProviderSlug,"apple");assert.equal(updated.countryCode,"NO");
    await assert.rejects(updateSubscription({userId:user,subscriptionId:created.id,serviceSlug:"manual",customServiceName:"Local",billingProviderSlug:"direct",currency:"USD",monthlyPriceMinor:100}),/INVALID_MANUAL/);
    await addSubscription({userId:user,serviceSlug:"manual",customServiceName:"Another market",billingProviderSlug:"direct",countryCode:"US",currency:"USD",monthlyPriceMinor:999});
    const items=await listSubscriptions(user);assert.equal(items.length,3);assert.equal(items.find(i=>i.id===known.id)?.monthlyPriceMinor,12900);
    await queueRenewalReminders();
    const jobs=(await pool.query("SELECT payload FROM notification_jobs WHERE subscription_id=$1",[created.id])).rows;
    assert.ok(jobs.length>0);assert.ok(jobs.some(j=>j.payload.title.includes("Local TV renamed")));
    await updateSubscriptionStatus({userId:user,subscriptionId:created.id,status:"CANCELLED",effectiveDate:renewal});
    assert.equal((await getSubscription(user,created.id)).status,"CANCELLED");
    await listSavingsEvents(user); // Exercise nullable service join without changing savings arithmetic.
    assert.equal(await deleteSubscription(other,created.id),false);
    assert.equal(await deleteSubscription(user,created.id),true);
    assert.equal((await listSubscriptions(user)).length,2);
  } finally {await pool.end();}
});
