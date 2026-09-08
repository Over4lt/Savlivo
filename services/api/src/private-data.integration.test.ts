import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import http from "node:http";
import { pool } from "./db.js";
import {privateDataPool} from "./private-data-db.js";
import {hashPassword} from "./passwords.js";
import {createToken} from "./auth.js";
import {authenticatedAdmin, dashboardData, handlePrivateData, hashSession} from "./private-data-http.js";
import {observeVerifiedPrices} from "./private-data-maintenance.js";
import {expireAnalytics} from "./analytics.js";
const enabled=process.env.SAVLIVO_DISPOSABLE_DB_TEST==="1";
test("disposable migration, aggregation, admin HTTP authorization, audit, expiry and deletion",{skip:!enabled},async()=>{
  assert.equal(process.env.DATABASE_URL,"postgresql://postgres@127.0.0.1:55439/savlivo_test");
  const sql=(path:string)=>readFileSync(new URL(`../../../${path}`,import.meta.url),"utf8");
  const server=http.createServer(async(req,res)=>{if(!await handlePrivateData(req,res)){res.writeHead(404);res.end();}});
  try {
    await pool.query(sql("db/schema.sql"));
    for(const name of ["002_auth.sql","009_subscription_market.sql","010_account_deletion_grace_period.sql","011_add_viaplay.sql","012_manual_subscriptions.sql"])await pool.query(sql(`db/migrations/${name}`));
    const password="disposable-test-password";
    const users=(await pool.query(`INSERT INTO users(email,password_hash,country_code,currency)
      SELECT 'fixture'||i||'@example.invalid',$1,'NO','NOK' FROM generate_series(1,11) i RETURNING id`,[hashPassword(password)])).rows;
    const user=users[0].id;
    await pool.query("INSERT INTO billing_providers(slug,name,provider_type) VALUES ('direct','Direct','DIRECT') ON CONFLICT DO NOTHING");
    await pool.query(`INSERT INTO subscriptions(user_id,billing_provider_id,custom_service_name,status,country_code,currency,monthly_price_minor)
      SELECT u.id,b.id,'Private manual name','ACTIVE','NO','NOK',12345 FROM users u CROSS JOIN billing_providers b WHERE b.slug='direct'`);
    const before=(await pool.query("SELECT * FROM subscriptions ORDER BY id")).rows;
    const migration=sql("db/migrations/013_private_analytics.sql");await pool.query(migration);await pool.query(migration);
    assert.deepEqual((await pool.query("SELECT * FROM subscriptions ORDER BY id")).rows,before);
    const historyMigration=sql("db/migrations/014_verified_price_observations.sql");
    await pool.query(historyMigration);await pool.query(historyMigration);
    for (const [route,currency,verification,count,agreement] of [
      ["direct","NOK","authoritative-provider",1,false],
      ["apple","NOK","multi-source",1,false],
      ["google-play","USD","authoritative-provider",1,false],
      ["carrier","NOK","registry",1,false]
    ]) await pool.query(`INSERT INTO verified_provider_prices(service_slug,plan_slug,plan_name,billing_provider_slug,
      country_code,currency,monthly_price_minor,source,source_url,verification,source_count,verified_by_agreement)
      VALUES('spotify','individual','Individual',$1,'NO',$2,12900,'provider','https://www.spotify.com/no/premium/',$3,$4,$5)`,[route,currency,verification,count,agreement]);
    const pricesBefore=(await pool.query("SELECT * FROM verified_provider_prices ORDER BY billing_provider_slug")).rows;
    await observeVerifiedPrices();await observeVerifiedPrices();
    assert.equal((await pool.query("SELECT count(*)::int n FROM verified_price_observations")).rows[0].n,1);
    assert.deepEqual((await pool.query("SELECT * FROM verified_provider_prices ORDER BY billing_provider_slug")).rows,pricesBefore);
    await pool.query("UPDATE verified_provider_prices SET monthly_price_minor=13900 WHERE billing_provider_slug='direct'");
    await observeVerifiedPrices();
    await pool.query("UPDATE verified_provider_prices SET monthly_price_minor=12900 WHERE billing_provider_slug='direct'");
    await observeVerifiedPrices();
    assert.deepEqual((await pool.query("SELECT monthly_price_minor n FROM verified_price_observations ORDER BY id")).rows.map(row=>row.n),[12900,13900,12900]);
    await pool.query("ALTER TABLE verified_price_observations RENAME TO unavailable_price_history");
    await assert.rejects(observeVerifiedPrices());
    assert.equal((await pool.query("SELECT monthly_price_minor n FROM verified_provider_prices WHERE billing_provider_slug='direct'")).rows[0].n,12900);
    await pool.query("ALTER TABLE unavailable_price_history RENAME TO verified_price_observations");

    await pool.query("INSERT INTO analytics_actors(user_id) SELECT id FROM users");
    await pool.query(`INSERT INTO analytics_events(actor_id,event,market,platform,expires_at)
      SELECT id,'catalog_no_result','NO','ios',now()+interval '30 days' FROM analytics_actors`);
    await pool.query(`INSERT INTO analytics_events(actor_id,event,market,platform,occurred_at,expires_at)
      SELECT id,'catalog_search','NO','ios',now()-interval '10 days',now()+interval '20 days' FROM analytics_actors`);
    await pool.query("INSERT INTO entitlements(user_id,plan) SELECT id,'MANUAL' FROM users");
    const data=await dashboardData(7,"NO");assert.equal(data.events.length,1);assert.equal(data.events[0].count,11);
    assert.equal(data.subscriptions[0].monthly_hundredths,String(12345*11));assert.equal(data.entitlements[0].users,11);
    assert.equal((await dashboardData(30,"NO")).events.length,2);
    assert.equal((await dashboardData(30,"US")).events.length,0);
    assert.equal(JSON.stringify(data).includes("Private manual name"),false);
    assert.equal(JSON.stringify(data).includes("@example.invalid"),false);
    await pool.query("INSERT INTO admin_roles(user_id,role) VALUES($1,'analytics_reader')",[user]);
    process.env.ADMIN_ENABLED="true";process.env.ANALYTICS_MAINTENANCE_ENABLED="true";process.env.ADMIN_ALLOWED_ORIGIN="https://savlivo.com";process.env.ADMIN_AUDIT_RETENTION_DAYS="180";
    await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));
    const base=`http://127.0.0.1:${(server.address() as import("node:net").AddressInfo).port}`;
    const headers={Origin:"https://savlivo.com","Content-Type":"application/json"};
    process.env.ANALYTICS_COLLECTION_ENABLED="true";process.env.ANALYTICS_PRIVACY_REVIEWED="true";process.env.ANALYTICS_RAW_RETENTION_DAYS="30";
    const customerHeaders={...headers,Authorization:`Bearer ${createToken({id:user,email:"fixture1@example.invalid"})}`};
    assert.equal((await fetch(`${base}/v1/analytics/events`,{method:"POST",headers,body:JSON.stringify({event:"app_active",market:"NO",platform:"ios"})})).status,401);
    assert.equal((await fetch(`${base}/v1/analytics/events`,{method:"POST",headers:customerHeaders,body:JSON.stringify({event:"app_active",market:"NO",platform:"ios",userId:users[1].id})})).status,400);
    assert.equal((await fetch(`${base}/v1/analytics/events`,{method:"POST",headers:customerHeaders,body:JSON.stringify({event:"app_active",market:"NO",platform:"ios"})})).status,202);
    let written=0;
    for(let attempt=0;attempt<30 && !written;attempt++) {
      written=(await pool.query("SELECT count(*)::int n FROM analytics_events WHERE event='app_active'")).rows[0].n;
      if(!written)await new Promise(resolve=>setTimeout(resolve,10));
    }
    assert.equal(written,1);
    const association=(await pool.query("SELECT a.user_id,e.actor_id FROM analytics_events e JOIN analytics_actors a ON a.id=e.actor_id WHERE event='app_active'")).rows[0];
    assert.equal(association.user_id,user);assert.notEqual(association.actor_id,user);

    assert.equal((await fetch(`${base}/v1/admin/overview`,{headers})).status,401);
    assert.equal((await fetch(`${base}/v1/admin/overview`,{headers:{...headers,Authorization:`Bearer ${createToken({id:user,email:"fixture1@example.invalid"})}`}})).status,401);
    assert.equal((await fetch(`${base}/v1/admin/session`,{method:"POST",headers,body:JSON.stringify({email:"fixture2@example.invalid",password})})).status,401);
    assert.equal((await fetch(`${base}/v1/admin/session`,{method:"POST",headers,body:JSON.stringify({email:"fixture1@example.invalid",password,role:"admin"})})).status,400);
    const login=await fetch(`${base}/v1/admin/session`,{method:"POST",headers,body:JSON.stringify({email:"fixture1@example.invalid",password})});assert.equal(login.status,200);
    const {token}=await login.json() as {token:string};
    assert.equal(await authenticatedAdmin(`Bearer ${token}`),user);
    const authorized={...headers,Authorization:`Bearer ${token}`};
    assert.equal((await fetch(`${base}/v1/admin/overview`,{headers:authorized})).status,200);
    assert.equal((await fetch(`${base}/v1/admin/overview`,{headers:{...authorized,Origin:"https://evil.invalid"}})).status,403);
    assert.equal((await pool.query("SELECT count(*)::int n FROM admin_audit WHERE action='dashboard_read'")).rows[0].n,1);
    // Audit failure denies data disclosure.
    await pool.query("ALTER TABLE admin_audit RENAME TO unavailable_admin_audit");
    assert.equal((await fetch(`${base}/v1/admin/overview`,{headers:authorized})).status,503);
    await pool.query("ALTER TABLE unavailable_admin_audit RENAME TO admin_audit");
    await pool.query("UPDATE admin_sessions SET expires_at=now()-interval '1 second' WHERE token_hash=$1",[hashSession(token)]);
    assert.equal(await authenticatedAdmin(`Bearer ${token}`),null);
    await pool.query("UPDATE admin_sessions SET expires_at=now()+interval '1 minute'");
    await pool.query("UPDATE users SET deletion_scheduled_for=now()+interval '1 day' WHERE id=$1",[user]);
    assert.equal(await authenticatedAdmin(`Bearer ${token}`),null);
    await pool.query("UPDATE users SET deletion_scheduled_for=NULL WHERE id=$1",[user]);
    await pool.query("DELETE FROM admin_roles WHERE user_id=$1",[user]);assert.equal(await authenticatedAdmin(`Bearer ${token}`),null);
    await pool.query("UPDATE analytics_events SET expires_at=now()-interval '1 day' WHERE event='catalog_search'");
    await expireAnalytics();assert.equal((await pool.query("SELECT count(*)::int n FROM analytics_events")).rows[0].n,12);
    await pool.query("DELETE FROM users WHERE id=ANY($1::uuid[])",[[users[0].id,users[1].id]]);
    assert.equal((await pool.query("SELECT count(*)::int n FROM analytics_events")).rows[0].n,9);
    assert.equal((await dashboardData(7,"NO")).events.length,0); // Small-cohort suppression.
    assert.equal((await pool.query("SELECT count(*)::int n FROM subscriptions")).rows[0].n,9);
  } finally {await new Promise<void>(resolve=>server.close(()=>resolve()));await pool.end();await privateDataPool.end();}
});
