import test from 'node:test';
import assert from 'node:assert/strict';
import {privateDataPool as pool} from './private-data-db.js';
import {adminSessionLifetimeSeconds,finishAuthentication,authenticatedAdmin,hashSession} from './admin-passkeys.js';
import {authenticator} from './admin-passkey-fixtures.js';

// Real passkey signature verification; only persistence is an in-memory SQL fixture.
test('absolute 60-minute sessions: issuance, polling, expiry, logout and stable relogin identity',async t=>{
 let now=1000000,counter=0;const key=authenticator(),sessions=new Map<string,{user_id:string;expires:number}>();
 const config={origin:'http://localhost:8080',rpID:'localhost',days:180},handle='fixture-user',challenge='fixture-challenge';
 const query=async(sql:string,args:any[]=[])=>{
  if(sql.startsWith('DELETE FROM admin_passkey_challenges'))return {rows:[{fresh:true,purpose:'authentication',rp_id:config.rpID,origin:config.origin,challenge}]};
  if(sql.startsWith('SELECT user_id FROM admin_passkeys'))return {rows:[{user_id:'stable-user'}]};
  if(sql.startsWith('SELECT r.webauthn_user_id'))return {rows:[{webauthn_user_id:handle}]};
  if(sql.startsWith('SELECT * FROM admin_passkeys'))return {rows:[{id:key.id,public_key:key.publicKey,counter}]};
  if(sql.startsWith('UPDATE admin_passkeys')){counter=args[1];return {rows:[]};}
  if(sql.startsWith('INSERT INTO admin_sessions')){
   assert.match(sql,/now\(\)\+\$4\*interval '1 second'/);assert.equal(args[3],3600);
   sessions.set(args[0],{user_id:args[1],expires:now+args[3]*1000});return {rows:[]};
  }
  if(sql.startsWith('SELECT s.user_id')){
   assert.match(sql,/s.expires_at>now\(\)/);assert.match(sql,/r.role='analytics_reader'/);
   const s=sessions.get(args[0]);return {rows:s&&s.expires>now?[{user_id:s.user_id}]:[]};
  }
  if(sql.startsWith('DELETE FROM admin_sessions WHERE token_hash=')){sessions.delete(args[0]);return {rows:[]};}
  if(['BEGIN','COMMIT','ROLLBACK'].includes(sql)||sql.startsWith('INSERT INTO admin_audit'))return {rows:[]};
  throw Error('Unexpected persistence operation: '+sql);
 };
 t.mock.method(pool,'query',query as any);t.mock.method(pool,'connect',(async()=>({query,release(){}})) as any);
 const login=()=>finishAuthentication('11111111-1111-4111-8111-111111111111',key.assert(challenge,config.origin,config.rpID,Buffer.from(handle).toString("base64url"),counter+1),config);
 const one=await login();assert.equal(one.expiresInSeconds,adminSessionLifetimeSeconds);assert.equal(one.expiresInSeconds,3600);
 const expiry=sessions.get(hashSession(one.token))!.expires;
 for(let i=0;i<3;i++){now+=1000;assert.equal(await authenticatedAdmin('Bearer '+one.token),'stable-user');assert.equal(sessions.get(hashSession(one.token))!.expires,expiry);}
 now=expiry-1;assert.equal(await authenticatedAdmin('Bearer '+one.token),'stable-user');
 now=expiry;assert.equal(await authenticatedAdmin('Bearer '+one.token),null);
 now=expiry+1;assert.equal(await authenticatedAdmin('Bearer '+one.token),null);
 const two=await login(),three=await login();assert.notEqual(two.token,one.token);
 assert.equal(await authenticatedAdmin('Bearer '+two.token),'stable-user');assert.equal(await authenticatedAdmin('Bearer '+three.token),'stable-user');
 // Same exact deletion used by the HTTP logout route; other sessions survive.
 await pool.query('DELETE FROM admin_sessions WHERE token_hash=$1',[hashSession(two.token)]);
 assert.equal(await authenticatedAdmin('Bearer '+two.token),null);assert.equal(await authenticatedAdmin('Bearer '+three.token),'stable-user');
 const other='adm_'+'x'.repeat(43);sessions.set(hashSession(other),{user_id:'other-user',expires:now+3600000});assert.equal(await authenticatedAdmin('Bearer '+other),'other-user');
});
