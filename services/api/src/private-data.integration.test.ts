import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import http from "node:http";
import {randomBytes} from "node:crypto";
import { pool } from "./db.js";
import {privateDataPool} from "./private-data-db.js";
import {hashPassword} from "./passwords.js";
import {createToken} from "./auth.js";
import {authenticatedAdmin, dashboardData, handlePrivateData, hashSession} from "./private-data-http.js";
import {observeVerifiedPrices} from "./private-data-maintenance.js";
import {authenticator} from "./admin-passkey-fixtures.js";
import {beginAuthentication,finishAuthentication} from "./admin-passkeys.js";
import {expireAnalytics} from "./analytics.js";
const enabled=process.env.SAVLIVO_DISPOSABLE_DB_TEST==="1";
test("disposable migration, aggregation, admin HTTP authorization, audit, expiry and deletion",{skip:!enabled},async(t)=>{
  assert.equal(process.env.DATABASE_URL,"postgresql://postgres@127.0.0.1:55439/savlivo_test");
  const sql=(path:string)=>readFileSync(new URL(`../../../${path}`,import.meta.url),"utf8");
  const server=http.createServer(async(req,res)=>{if(!await handlePrivateData(req,res)){res.writeHead(404);res.end();}});
  try {
    await pool.query(sql("db/schema.sql"));
    for(const name of ["002_auth.sql","009_subscription_market.sql","010_account_deletion_grace_period.sql"])await pool.query(sql(`db/migrations/${name}`));
    await t.test("011/012 idempotency and pre-existing known subscription preservation",async()=>{
      const id=(await pool.query("INSERT INTO users(email,password_hash) VALUES('migration@example.invalid','disabled') RETURNING id")).rows[0].id;
      const before=(await pool.query(`INSERT INTO subscriptions(user_id,service_id,billing_provider_id,status,country_code,currency,monthly_price_minor)
        SELECT $1,s.id,b.id,'ACTIVE','NO','NOK',12900 FROM services s,billing_providers b WHERE s.slug='netflix' AND b.slug='direct' RETURNING *`,[id])).rows[0];
      assert.ok(before);
      await pool.query(sql("db/migrations/011_add_viaplay.sql"));
      const svc=(await pool.query("SELECT id FROM services WHERE slug='viaplay'")).rows[0].id;
      await pool.query(sql("db/migrations/011_add_viaplay.sql"));
      await pool.query(sql("db/migrations/012_manual_subscriptions.sql"));await pool.query(sql("db/migrations/012_manual_subscriptions.sql"));
      assert.equal((await pool.query("SELECT id FROM services WHERE slug='viaplay'")).rows[0].id,svc);
      const after=(await pool.query("SELECT * FROM subscriptions WHERE id=$1",[before.id])).rows[0];
      for(const key of Object.keys(before))assert.deepEqual(after[key],before[key]);assert.equal(after.custom_service_name,null);
      await pool.query("DELETE FROM users WHERE id=$1",[id]);
    });
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
    await pool.query(sql("db/migrations/015_admin_passkeys.sql"));await pool.query(sql("db/migrations/015_admin_passkeys.sql"));
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
    const data=await dashboardData("NO");
    assert.equal("events" in data,false);assert.equal("subscriptions" in data,false);
    assert.equal(JSON.stringify(data).includes("Private manual name"),false);
    assert.equal(JSON.stringify(data).includes("@example.invalid"),false);
    await pool.query("INSERT INTO admin_roles(user_id,role) VALUES($1,'analytics_reader')",[user]);
    process.env.ADMIN_RP_ID="savlivo.com";process.env.NODE_ENV="test";process.env.ADMIN_ENABLED="true";process.env.ANALYTICS_MAINTENANCE_ENABLED="true";process.env.ADMIN_ALLOWED_ORIGIN="https://savlivo.com";process.env.ADMIN_AUDIT_RETENTION_DAYS="180";
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
    assert.equal((await fetch(`${base}/v1/admin/session`,{method:"POST",headers,body:JSON.stringify({email:"fixture1@example.invalid",password,role:"admin"})})).status,404);
    const key=authenticator();
    await pool.query("INSERT INTO admin_passkeys(id,user_id,rp_id,public_key,counter) VALUES($1,$2,'savlivo.com',$3,0)",[key.id,user,key.publicKey]);
    const handle=Buffer.from((await pool.query("SELECT webauthn_user_id FROM admin_roles WHERE user_id=$1",[user])).rows[0].webauthn_user_id).toString("base64url");
    let counter=0;
    const login=async()=>{const config={origin:"https://savlivo.com",rpID:"savlivo.com",days:180},a=await beginAuthentication(config);
      return finishAuthentication(a.challengeId,key.assert(a.options.challenge,config.origin,config.rpID,handle,++counter),config);};
    let {token}=await login();
    assert.equal(await authenticatedAdmin(`Bearer ${token}`),user);
    const authorized={...headers,Authorization:`Bearer ${token}`};
    assert.equal((await fetch(`${base}/v1/admin/overview`,{headers:authorized})).status,200);
    assert.equal((await fetch(`${base}/v1/admin/overview`,{headers:{...authorized,Origin:"https://evil.invalid"}})).status,403);
    assert.equal((await pool.query("SELECT count(*)::int n FROM admin_audit WHERE action='dashboard_read'")).rows[0].n,1);
    for(const query of ["days=7","days=30","market=NO&service=netflix","market=NO&category=video","service=netflix&billing=apple","market=NO&market=US"])
      assert.equal((await fetch(`${base}/v1/admin/overview?${query}`,{headers:authorized})).status,400);
    process.env.NODE_ENV="production";
    assert.equal((await fetch(`${base}/v1/admin/overview`,{headers:authorized})).status,404);
    assert.equal((await fetch(`${base}/v1/admin/session`,{method:"POST",headers,body:JSON.stringify({email:"fixture1@example.invalid",password})})).status,404);
    process.env.ADMIN_RP_ID="savlivo.com";process.env.NODE_ENV="test";
    // Audit failure denies data disclosure.
    await pool.query("ALTER TABLE admin_audit RENAME TO unavailable_admin_audit");
    assert.equal((await fetch(`${base}/v1/admin/overview`,{headers:authorized})).status,503);
    await pool.query("ALTER TABLE unavailable_admin_audit RENAME TO admin_audit");
    await t.test("session entropy/hash/expiry, atomic creation, logout during audit failure and replay denial",async()=>{
      assert.match(token,/^adm_[A-Za-z0-9_-]{43}$/);
      const saved=(await pool.query("SELECT token_hash,extract(epoch FROM expires_at-now()) seconds FROM admin_sessions WHERE user_id=$1",[user])).rows[0];
      assert.equal(saved.token_hash,hashSession(token));assert.notEqual(saved.token_hash,token);
      assert.ok(Number(saved.seconds)>880 && Number(saved.seconds)<=900);
      const countBefore=(await pool.query("SELECT count(*)::int n FROM admin_sessions")).rows[0].n;
      await pool.query("ALTER TABLE admin_audit RENAME TO unavailable_admin_audit");
      await assert.rejects(login());
      assert.equal((await pool.query("SELECT count(*)::int n FROM admin_sessions")).rows[0].n,countBefore);
      assert.equal((await fetch(`${base}/v1/admin/session`,{method:"DELETE",headers:authorized})).status,503);
      assert.equal(await authenticatedAdmin(`Bearer ${token}`),null);
      await pool.query("ALTER TABLE unavailable_admin_audit RENAME TO admin_audit");
      const old=token;
      token=(await login()).token;assert.notEqual(token,old);
      assert.equal(await authenticatedAdmin(`Bearer ${old}`),null);assert.equal(await authenticatedAdmin(`Bearer ${token}`),user);
      const auditRecords=(await pool.query("SELECT * FROM admin_audit")).rows;
      assert.equal(JSON.stringify(auditRecords).includes(password),false);assert.equal(JSON.stringify(auditRecords).includes("@"),false);
      assert.equal(JSON.stringify(auditRecords).includes(token),false);
    });
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
    assert.equal("events" in await dashboardData("NO"),false); // No personal reporting.
    assert.equal((await pool.query("SELECT count(*)::int n FROM subscriptions")).rows[0].n,9);
    await t.test("concurrent sessions revoke independently; normal routes cannot grant roles or alter audit; deletion cascades",async()=>{
      const owner=users[2].id;
      await pool.query("INSERT INTO admin_roles(user_id,role) VALUES($1,'analytics_reader')",[owner]);
      const tokens=[`adm_${randomBytes(32).toString('base64url')}`,`adm_${randomBytes(32).toString('base64url')}`];
      const ownerKey=authenticator();await pool.query("INSERT INTO admin_passkeys(id,user_id,rp_id,public_key,counter) VALUES($1,$2,'savlivo.com',$3,0)",[ownerKey.id,owner,ownerKey.publicKey]);
      for(const item of tokens)await pool.query("INSERT INTO admin_sessions(token_hash,user_id,credential_id,expires_at) VALUES($1,$2,$3,now()+interval '10 minutes')",[hashSession(item),owner,ownerKey.id]);
      const ownerHeaders={...headers,Authorization:`Bearer ${tokens[0]}`};
      assert.equal((await fetch(`${base}/v1/admin/roles`,{method:"POST",headers:ownerHeaders,body:JSON.stringify({role:"analytics_reader"})})).status,404);
      assert.equal((await fetch(`${base}/v1/admin/audit`,{method:"DELETE",headers:ownerHeaders})).status,404);
      const out=await fetch(`${base}/v1/admin/session`,{method:"DELETE",headers:ownerHeaders});assert.equal(out.status,200);
      assert.equal(out.headers.get("cache-control"),"no-store");assert.equal(out.headers.get("x-content-type-options"),"nosniff");
      assert.equal(out.headers.get("permissions-policy"),"camera=(), microphone=(), geolocation=(), payment=()");
      assert.equal(out.headers.get("referrer-policy"),"no-referrer");assert.equal(out.headers.get("x-frame-options"),"DENY");
      assert.equal(await authenticatedAdmin(`Bearer ${tokens[0]}`),null);
      assert.equal(await authenticatedAdmin(`Bearer ${tokens[1]}`),owner);
      await pool.query("DELETE FROM users WHERE id=$1",[owner]);
      assert.equal(await authenticatedAdmin(`Bearer ${tokens[1]}`),null);
      assert.equal((await pool.query("SELECT count(*)::int n FROM admin_sessions WHERE user_id=$1",[owner])).rows[0].n,0);
      assert.equal((await pool.query("SELECT count(*)::int n FROM analytics_actors WHERE user_id=$1",[owner])).rows[0].n,0);
      assert.ok((await pool.query("SELECT count(*)::int n FROM admin_audit WHERE action='session_closed' AND user_id IS NULL")).rows[0].n>0);
    });
    for(const size of [0,1,9,10,11]) await t.test(`user-derived reports remain absent with ${size} users`,async()=>{
      await pool.query("DELETE FROM users"); // Explicit guarded disposable fixture only.
      await pool.query(`INSERT INTO users(email,password_hash,country_code,currency)
        SELECT 'cohort'||i||'@example.invalid','disabled','NO','NOK' FROM generate_series(1,$1) i`,[size]);
      await pool.query("INSERT INTO entitlements(user_id,plan) SELECT id,'MANUAL' FROM users");
      await pool.query(`INSERT INTO subscriptions(user_id,billing_provider_id,custom_service_name,status,country_code,currency,monthly_price_minor)
        SELECT u.id,b.id,'Private service name','ACTIVE','NO','NOK',12345 FROM users u CROSS JOIN billing_providers b WHERE b.slug='direct'`);
      await pool.query("INSERT INTO analytics_actors(user_id) SELECT id FROM users");
      await pool.query(`INSERT INTO analytics_events(actor_id,event,market,platform,expires_at)
        SELECT id,'catalog_search','NO','ios',now()+interval '1 day' FROM analytics_actors`);
      for(const market of [null,"NO","US"]) {
        const result=await dashboardData(market);
        for(const key of ["events","subscriptions","entitlements","newUsers","serviceDistribution"])assert.equal(key in result,false);
        assert.equal(JSON.stringify(result).includes("Private service name"),false);
      }
    });
    await t.test("unknown amounts and expiry cannot change the public-only report",async()=>{
      await pool.query("UPDATE subscriptions SET monthly_price_minor=NULL");
      await pool.query("UPDATE subscriptions SET monthly_price_minor=54321 WHERE id=(SELECT id FROM subscriptions LIMIT 1)");
      const result=await dashboardData("NO");
      await pool.query("UPDATE subscriptions SET monthly_price_minor=0");
      assert.deepEqual(await dashboardData("NO"),result);
      await pool.query("UPDATE analytics_events SET expires_at=now()-interval '1 second'");
      assert.deepEqual(await dashboardData("NO"),result);
      assert.equal((await pool.query("SELECT count(*)::int n FROM analytics_events")).rows[0].n,11);
    });
    await t.test("successive snapshots, complementary groups and unknown spending disclose no user-derived change",async()=>{
      const baselineNO=await dashboardData("NO"), baselineGlobal=await dashboardData(null);
      // 11 global vs 10 in NO: changing the eleventh account must not change either report.
      await pool.query("UPDATE users SET country_code='US',currency='USD' WHERE id=(SELECT id FROM users LIMIT 1)");
      await pool.query("UPDATE subscriptions SET country_code='US',currency='USD' WHERE user_id IN (SELECT id FROM users WHERE country_code='US')");
      assert.deepEqual(await dashboardData("NO"),baselineNO);assert.deepEqual(await dashboardData(null),baselineGlobal);
      // Parent 20, NO child 10, US sibling 9, final account SE.
      await pool.query(`INSERT INTO users(email,password_hash,country_code,currency)
        SELECT 'extra'||i||'@example.invalid','disabled',CASE WHEN i=9 THEN 'SE' ELSE 'US' END,
          CASE WHEN i=9 THEN 'SEK' ELSE 'USD' END FROM generate_series(1,9) i`);
      assert.deepEqual(await dashboardData(null),baselineGlobal);
      for(const interval of ["1 day","7 days","30 days"]) {
        await pool.query("UPDATE users SET created_at=now()-$1::interval",[interval]);
        await pool.query("UPDATE analytics_events SET occurred_at=now()-$1::interval",[interval]);
        assert.deepEqual(await dashboardData("NO"),baselineNO);assert.deepEqual(await dashboardData(null),baselineGlobal);
      }
      await pool.query("UPDATE subscriptions SET monthly_price_minor=NULL");
      assert.deepEqual(await dashboardData("NO"),baselineNO);
      await pool.query("DELETE FROM users WHERE country_code='SE'");
      assert.deepEqual(await dashboardData(null),baselineGlobal);
    });
    await t.test("bounded retention, audit expiry, empty actor cleanup and operational data survival",async()=>{
      const before=(await pool.query("SELECT * FROM subscriptions ORDER BY id")).rows;
      await pool.query("DELETE FROM analytics_events");
      await pool.query(`INSERT INTO analytics_events(actor_id,event,market,platform,expires_at)
        SELECT a.id,'app_active','NO','ios',now()-interval '1 day' FROM (SELECT id FROM analytics_actors LIMIT 1) a CROSS JOIN generate_series(1,5001)`);
      await pool.query("INSERT INTO admin_audit(action,expires_at) VALUES('retention',now()-interval '1 day'),('retention',now()+interval '1 day')");
      await expireAnalytics();assert.equal((await pool.query("SELECT count(*)::int n FROM analytics_events")).rows[0].n,1);
      assert.equal((await pool.query("SELECT count(*)::int n FROM admin_audit WHERE expires_at<=now()")).rows[0].n,0);
      assert.equal((await pool.query("SELECT count(*)::int n FROM admin_audit WHERE expires_at>now()")).rows[0].n>0,true);
      await expireAnalytics();assert.equal((await pool.query("SELECT count(*)::int n FROM analytics_actors")).rows[0].n,0);
      assert.deepEqual((await pool.query("SELECT * FROM subscriptions ORDER BY id")).rows,before);
    });

  } finally {await new Promise<void>(resolve=>server.close(()=>resolve()));await pool.end();await privateDataPool.end();}
});
