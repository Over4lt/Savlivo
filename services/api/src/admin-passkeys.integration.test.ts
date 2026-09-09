import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import http from "node:http";
import {privateDataPool as pool} from "./private-data-db.js";
import {beginRegistration,finishRegistration,beginAuthentication,finishAuthentication,issueEnrollmentGrant,authenticatedAdmin,hashSession,revokeAdminSessions} from "./admin-passkeys.js";
import {handlePrivateData} from "./private-data-http.js";
import {authenticator} from "./admin-passkey-fixtures.js";
import {expireAnalytics} from "./analytics.js";
import {createToken} from "./auth.js";
const config={origin:"http://localhost:8080",rpID:"localhost",days:180};
test("passkey protocol, migration, RBAC and session integration",{skip:process.env.SAVLIVO_DISPOSABLE_DB_TEST!=="1"},async t=>{
  assert.equal(process.env.DATABASE_URL,"postgresql://postgres@127.0.0.1:55439/savlivo_test");
  // Runs after the existing guarded private-data scenario on the same disposable DB.
  const sql=readFileSync(new URL("../../../db/migrations/015_admin_passkeys.sql",import.meta.url),"utf8");
  await pool.query(sql);
  const before=(await pool.query("SELECT * FROM subscriptions ORDER BY id")).rows;await pool.query(sql);
  assert.deepEqual((await pool.query("SELECT * FROM subscriptions ORDER BY id")).rows,before);
  process.env.NODE_ENV="test";process.env.ADMIN_RP_ID=config.rpID;process.env.ADMIN_ALLOWED_ORIGIN=config.origin;
  process.env.ADMIN_ENABLED="true";process.env.ANALYTICS_MAINTENANCE_ENABLED="true";process.env.ADMIN_AUDIT_RETENTION_DAYS="180";
  const server=http.createServer(async(req,res)=>{if(!await handlePrivateData(req,res)){res.writeHead(404);res.end();}});
  await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));
  const base=`http://127.0.0.1:${(server.address() as import("node:net").AddressInfo).port}`;
  const headers={Origin:config.origin,"Content-Type":"application/json"};
  async function user(role=true) {
    const id=(await pool.query("INSERT INTO users(email,password_hash) VALUES(gen_random_uuid()::text||'@example.invalid','disabled') RETURNING id")).rows[0].id;
    if(role)await pool.query("INSERT INTO admin_roles(user_id,role) VALUES($1,'analytics_reader')",[id]);return id as string;
  }
  async function enrollment(id:string) {return beginRegistration(`Bearer ${await issueEnrollmentGrant(id,config)}`,config);}
  async function enrolled() {const id=await user(),key=authenticator(),registration=await enrollment(id);await finishRegistration(registration.challengeId,key.register(registration.options.challenge,config.origin,config.rpID),config);return {id,key,handle:registration.options.user.id};}
  async function login(f:Awaited<ReturnType<typeof enrolled>>,counter=1) {const a=await beginAuthentication(config);return finishAuthentication(a.challengeId,f.key.assert(a.options.challenge,config.origin,config.rpID,f.handle,counter),config);}
  try {
    await t.test("operator grant requires DB role; customer JWT and claims cannot enroll; password route gone",async()=>{
      const id=await user(false);await assert.rejects(issueEnrollmentGrant(id,config),/PASSKEY_DENIED/);
      const auth=`Bearer ${createToken({id,email:"test@example.invalid"})}`;
      await assert.rejects(beginRegistration(auth,config),/PASSKEY_DENIED/);
      assert.equal((await fetch(`${base}/v1/admin/passkeys/register/options`,{method:"POST",headers:{...headers,Authorization:auth},body:'{}'})).status,401);
      assert.equal((await fetch(`${base}/v1/admin/passkeys/register/options`,{method:"POST",headers,body:'{"role":"admin"}'})).status,400);
      assert.equal((await fetch(`${base}/v1/admin/session`,{method:"POST",headers,body:'{}'})).status,404);
    });
    await t.test("valid registration stores public material, grant single-use and no session issuance",async()=>{
      const id=await user(),token=await issueEnrollmentGrant(id,config),key=authenticator();
      assert.equal(await authenticatedAdmin(`Bearer ${token}`),null);
      const r=await beginRegistration(`Bearer ${token}`,config);
      await assert.rejects(beginRegistration(`Bearer ${token}`,config),/PASSKEY_DENIED/);
      const reply=key.register(r.options.challenge,config.origin,config.rpID);
      await finishRegistration(r.challengeId,reply,config);await assert.rejects(finishRegistration(r.challengeId,reply,config),/PASSKEY_DENIED/);
      const record=(await pool.query("SELECT * FROM admin_passkeys WHERE id=$1",[key.id])).rows[0];assert.deepEqual(record.public_key,key.publicKey);
      assert.equal((await pool.query("SELECT count(*)::int n FROM admin_sessions WHERE user_id=$1",[id])).rows[0].n,0);
    });
    await t.test("complete HTTP registration/authentication supports RSA and retains configured host boundary",async()=>{
      const id=await user(),key=authenticator("RSA"),grant=await issueEnrollmentGrant(id,config);
      const post=async(path:string,body:unknown,authorization?:string)=>fetch(`${base}/v1/admin/passkeys/${path}`,{method:"POST",headers:{...headers,...(authorization?{Authorization:`Bearer ${authorization}`}:{})},body:JSON.stringify(body)});
      const options=await post("register/options",{},grant);assert.equal(options.status,200);const r=await options.json() as Awaited<ReturnType<typeof beginRegistration>>;
      assert.equal((await post("register/verify",{challengeId:r.challengeId,response:key.register(r.options.challenge,config.origin,config.rpID)})).status,200);
      const a=await (await post("authenticate/options",{})).json() as Awaited<ReturnType<typeof beginAuthentication>>;
      const login=await post("authenticate/verify",{challengeId:a.challengeId,response:key.assert(a.options.challenge,config.origin,config.rpID,r.options.user.id)});
      assert.equal(login.status,200);assert.equal(await authenticatedAdmin(`Bearer ${(await login.json() as {token:string}).token}`),id);
      process.env.NODE_ENV="production";assert.equal((await post("authenticate/options",{})).status,404);assert.equal((await fetch(`${base}/v1/admin/session`,{method:"POST",headers,body:"{}"})).status,404);process.env.NODE_ENV="test";
    });
    await t.test("production origin/RP registration and authentication are server-controlled, with logout",async()=>{
      const production={...config,origin:"https://admin.savlivo.com",rpID:"admin.savlivo.com"};
      process.env.NODE_ENV="production";process.env.ADMIN_ALLOWED_ORIGIN=production.origin;process.env.ADMIN_RP_ID=production.rpID;
      try {
        const id=await user(),key=authenticator();
        for(const [origin,rpID] of [["https://savlivo.com",production.rpID],[production.origin,"savlivo.com"]]) {
          const r=await beginRegistration(`Bearer ${await issueEnrollmentGrant(id,production)}`,production);
          await assert.rejects(finishRegistration(r.challengeId,key.register(r.options.challenge,origin,rpID),production),/PASSKEY_DENIED/);
        }
        const post=async(path:string,body:unknown,token?:string)=>fetch(`${base}/v1/admin/passkeys/${path}`,{method:"POST",headers:{Origin:production.origin,"Content-Type":"application/json",...(token?{Authorization:`Bearer ${token}`}:{})},body:JSON.stringify(body)});
        const r=await (await post("register/options",{},await issueEnrollmentGrant(id,production))).json() as Awaited<ReturnType<typeof beginRegistration>>;
        assert.equal(r.options.rp.id,production.rpID);
        assert.equal((await post("register/verify",{challengeId:r.challengeId,response:key.register(r.options.challenge,production.origin,production.rpID)})).status,200);
        for(const [origin,rpID] of [["http://localhost:8080",production.rpID],[production.origin,"localhost"]]) {
          const a=await beginAuthentication(production);
          await assert.rejects(finishAuthentication(a.challengeId,key.assert(a.options.challenge,origin,rpID,r.options.user.id),production),/PASSKEY_DENIED/);
        }
        const a=await (await post("authenticate/options",{})).json() as Awaited<ReturnType<typeof beginAuthentication>>;
        assert.equal(a.options.rpId,production.rpID);
        const response=await post("authenticate/verify",{challengeId:a.challengeId,response:key.assert(a.options.challenge,production.origin,production.rpID,r.options.user.id)});
        assert.equal(response.status,200);
        const session=await response.json() as {token:string;expiresInSeconds:number};
        assert.equal(session.expiresInSeconds,900);assert.equal(await authenticatedAdmin(`Bearer ${session.token}`),id);
        assert.equal((await fetch(`${base}/v1/admin/session`,{method:"DELETE",headers:{Origin:production.origin,Authorization:`Bearer ${session.token}`}})).status,200);
        assert.equal(await authenticatedAdmin(`Bearer ${session.token}`),null);
      } finally {process.env.NODE_ENV="test";process.env.ADMIN_ALLOWED_ORIGIN=config.origin;process.env.ADMIN_RP_ID=config.rpID;}
    });
    await t.test("expired or wrong-origin bootstrap and legacy sessions cannot enroll or read; audit failure issues no grant",async()=>{
      const id=await user(),grant=await issueEnrollmentGrant(id,config);
      await assert.rejects(beginRegistration(`Bearer ${grant}`,{...config,origin:"http://localhost:9999"}),/PASSKEY_DENIED/);
      await pool.query("UPDATE admin_sessions SET expires_at=now()-interval '1 second' WHERE token_hash=$1",[hashSession(grant)]);
      await assert.rejects(beginRegistration(`Bearer ${grant}`,config),/PASSKEY_DENIED/);
      await pool.query("UPDATE admin_sessions SET enrollment_only=false,expires_at=now()+interval '1 minute' WHERE token_hash=$1",[hashSession(grant)]);
      assert.equal(await authenticatedAdmin(`Bearer ${grant}`),null);await assert.rejects(beginRegistration(`Bearer ${grant}`,config),/PASSKEY_DENIED/);
      await pool.query("ALTER TABLE admin_audit RENAME TO unavailable_admin_audit");
      try{await assert.rejects(issueEnrollmentGrant(id,config));}finally{await pool.query("ALTER TABLE unavailable_admin_audit RENAME TO admin_audit");}
      assert.equal((await pool.query("SELECT count(*)::int n FROM admin_sessions WHERE user_id=$1",[id])).rows[0].n,1);
    });
    await t.test("revocation and replacement operator grants invalidate outstanding enrollment",async()=>{
      const id=await user(),key=authenticator(),r=await enrollment(id);
      await revokeAdminSessions(id);
      await assert.rejects(finishRegistration(r.challengeId,key.register(r.options.challenge,config.origin,config.rpID),config),/PASSKEY_DENIED/);
      const versioned=await enrollment(id);
      await pool.query("UPDATE admin_roles SET enrollment_version=gen_random_uuid() WHERE user_id=$1",[id]);
      await assert.rejects(finishRegistration(versioned.challengeId,key.register(versioned.options.challenge,config.origin,config.rpID),config),/PASSKEY_DENIED/);
      const next=await enrollment(id);await issueEnrollmentGrant(id,config);
      await assert.rejects(finishRegistration(next.challengeId,key.register(next.options.challenge,config.origin,config.rpID),config),/PASSKEY_DENIED/);
    });
    for(const failure of ["expired","origin","rp","uv","role","deleted","pending","duplicate","config"])await t.test(`registration rejects ${failure}`,async()=>{
      const id=await user(),key=authenticator(),r=await enrollment(id);
      if(failure==="expired")await pool.query("UPDATE admin_passkey_challenges SET expires_at=now()-interval '1 second' WHERE id=$1",[r.challengeId]);
      if(failure==="role")await pool.query("DELETE FROM admin_roles WHERE user_id=$1",[id]);
      if(failure==="deleted")await pool.query("DELETE FROM users WHERE id=$1",[id]);
      if(failure==="pending")await pool.query("UPDATE users SET deletion_scheduled_for=now() WHERE id=$1",[id]);
      if(failure==="duplicate")await pool.query("INSERT INTO admin_passkeys(id,user_id,rp_id,public_key,counter) VALUES($1,$2,$3,$4,0)",[key.id,await user(),config.rpID,key.publicKey]);
      await assert.rejects(finishRegistration(r.challengeId,key.register(r.options.challenge,failure==="origin"?"https://evil.invalid":config.origin,failure==="rp"?"evil.invalid":config.rpID,failure==="uv"?0x41:0x45),failure==="config"?{...config,rpID:"evil.invalid"}:config),/PASSKEY_DENIED/);
      assert.equal((await pool.query("SELECT count(*)::int n FROM admin_passkey_challenges WHERE id=$1",[r.challengeId])).rows[0].n,0);
    });
    for(const failure of ["signature","origin","rp","expired","unknown","removed","deleted","role","pending","uv","userHandle","crossOrigin"])await t.test(`assertion rejects ${failure}`,async()=>{
      const f=await enrolled(),a=await beginAuthentication(config);
      if(failure==="expired")await pool.query("UPDATE admin_passkey_challenges SET expires_at=now()-interval '1 second' WHERE id=$1",[a.challengeId]);
      if(failure==="removed")await pool.query("DELETE FROM admin_passkeys WHERE id=$1",[f.key.id]);
      if(failure==="deleted")await pool.query("DELETE FROM users WHERE id=$1",[f.id]);
      if(failure==="role")await pool.query("DELETE FROM admin_roles WHERE user_id=$1",[f.id]);
      if(failure==="pending")await pool.query("UPDATE users SET deletion_scheduled_for=now() WHERE id=$1",[f.id]);
      const key=failure==="unknown"?authenticator():f.key;
      const response=key.assert(a.options.challenge,failure==="origin"?"https://evil.invalid":config.origin,failure==="rp"?"evil.invalid":config.rpID,
        failure==="userHandle"?"wrong":f.handle,1,failure==="uv"?1:5,failure==="crossOrigin");
      if(failure==="signature")response.response.signature="AAAA";
      await assert.rejects(finishAuthentication(a.challengeId,response,config),/PASSKEY_DENIED/);
      await assert.rejects(finishAuthentication(a.challengeId,response,config),/PASSKEY_DENIED/);
      assert.equal((await pool.query("SELECT count(*)::int n FROM admin_sessions WHERE user_id=$1",[f.id])).rows[0].n,0);
    });
    await t.test("valid signature issues hashed 15-minute session; replay and counter regression fail; synced zero counters work",async()=>{
      const f=await enrolled(),a=await beginAuthentication(config),reply=f.key.assert(a.options.challenge,config.origin,config.rpID,f.handle);
      const result=await finishAuthentication(a.challengeId,reply,config);assert.equal(await authenticatedAdmin(`Bearer ${result.token}`),f.id);
      const row=(await pool.query("SELECT *,extract(epoch FROM expires_at-now()) seconds FROM admin_sessions WHERE token_hash=$1",[hashSession(result.token)])).rows[0];
      assert.ok(row.seconds>880&&row.seconds<=900);assert.equal(row.credential_id,f.key.id);assert.notEqual(row.token_hash,result.token);
      await assert.rejects(finishAuthentication(a.challengeId,reply,config),/PASSKEY_DENIED/);
      await assert.rejects(login(f,1),/PASSKEY_DENIED/);await assert.rejects(login(f,0),/PASSKEY_DENIED/);await login(f,2);
      const synced=await enrolled();await login(synced,0);await login(synced,0);
    });
    for(const change of ["role","account","credential","replacement","expiry"])await t.test(`active session revoked by ${change}`,async()=>{
      const f=await enrolled(),session=await login(f);assert.equal(await authenticatedAdmin(`Bearer ${session.token}`),f.id);
      if(change==="role")await pool.query("DELETE FROM admin_roles WHERE user_id=$1",[f.id]);
      if(change==="account")await pool.query("DELETE FROM users WHERE id=$1",[f.id]);
      if(change==="credential")await pool.query("DELETE FROM admin_passkeys WHERE id=$1",[f.key.id]);
      if(change==="replacement")await pool.query("UPDATE admin_passkeys SET public_key=$2 WHERE id=$1",[f.key.id,authenticator().publicKey]);
      if(change==="expiry")await pool.query("UPDATE admin_sessions SET expires_at=now()-interval '1 second' WHERE token_hash=$1",[hashSession(session.token)]);
      assert.equal(await authenticatedAdmin(`Bearer ${session.token}`),null);
    });
    await t.test("concurrent challenge consumption succeeds once and audit failure rolls back counter/session",async()=>{
      const f=await enrolled(),a=await beginAuthentication(config),reply=f.key.assert(a.options.challenge,config.origin,config.rpID,f.handle);
      const results=await Promise.allSettled([finishAuthentication(a.challengeId,reply,config),finishAuthentication(a.challengeId,reply,config)]);
      assert.equal(results.filter(r=>r.status==="fulfilled").length,1);
      await pool.query("ALTER TABLE admin_audit RENAME TO unavailable_admin_audit");
      try {await assert.rejects(login(f,2));}finally{await pool.query("ALTER TABLE unavailable_admin_audit RENAME TO admin_audit");}
      assert.equal(Number((await pool.query("SELECT counter FROM admin_passkeys WHERE id=$1",[f.key.id])).rows[0].counter),1);
    });
    await t.test("migration rerun preserves active credentials, handles and sessions; challenge cleanup is bounded",async()=>{
      const f=await enrolled(),session=await login(f);
      const roles=(await pool.query("SELECT * FROM admin_roles ORDER BY user_id")).rows;
      const credentials=(await pool.query("SELECT * FROM admin_passkeys ORDER BY id")).rows;
      const sessions=(await pool.query("SELECT * FROM admin_sessions ORDER BY token_hash")).rows;
      await pool.query(sql);
      assert.deepEqual((await pool.query("SELECT * FROM admin_roles ORDER BY user_id")).rows,roles);
      assert.deepEqual((await pool.query("SELECT * FROM admin_passkeys ORDER BY id")).rows,credentials);
      assert.deepEqual((await pool.query("SELECT * FROM admin_sessions ORDER BY token_hash")).rows,sessions);
      assert.equal(await authenticatedAdmin(`Bearer ${session.token}`),f.id);
      await pool.query("DELETE FROM admin_passkey_challenges");
      await pool.query(`INSERT INTO admin_passkey_challenges(challenge,purpose,rp_id,origin,expires_at)
        SELECT 'expired-test-'||i,'authentication','localhost','http://localhost:8080',now()-interval '1 second' FROM generate_series(1,5001) i`);
      await expireAnalytics();assert.equal((await pool.query("SELECT count(*)::int n FROM admin_passkey_challenges")).rows[0].n,1);
      await expireAnalytics();assert.equal((await pool.query("SELECT count(*)::int n FROM admin_passkey_challenges")).rows[0].n,0);
      assert.equal(await authenticatedAdmin(`Bearer ${session.token}`),f.id);
    });
    await t.test("authenticated enrollment, revoked enrollment session, logout and revoke-all via HTTP",async()=>{
      const f=await enrolled(),one=await login(f),two=await login(f,2);
      const r=await beginRegistration(`Bearer ${one.token}`,config);
      assert.ok(r.options.excludeCredentials?.some(credential=>credential.id===f.key.id));
      await fetch(`${base}/v1/admin/session`,{method:"DELETE",headers:{...headers,Authorization:`Bearer ${one.token}`}});
      assert.equal(await authenticatedAdmin(`Bearer ${one.token}`),null);assert.equal(await authenticatedAdmin(`Bearer ${two.token}`),f.id);
      await assert.rejects(finishRegistration(r.challengeId,authenticator().register(r.options.challenge,config.origin,config.rpID),config),/PASSKEY_DENIED/);
      const next=await beginRegistration(`Bearer ${two.token}`,config),key=authenticator();await finishRegistration(next.challengeId,key.register(next.options.challenge,config.origin,config.rpID),config);
      assert.equal(await authenticatedAdmin(`Bearer ${two.token}`),null);
      const current=await login(f,3);assert.equal((await fetch(`${base}/v1/admin/sessions`,{method:"DELETE",headers:{...headers,Authorization:`Bearer ${current.token}`}})).status,200);
      assert.equal(await authenticatedAdmin(`Bearer ${current.token}`),null);
    });
  }finally{await new Promise<void>(resolve=>server.close(()=>resolve()));await pool.end();}
});
