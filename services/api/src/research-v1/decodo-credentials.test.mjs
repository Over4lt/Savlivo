import test from 'node:test';import assert from 'node:assert/strict';
import {resolveDecodoCredentials} from './decodo-credentials.mjs';
import {loadDecodoRuntimeConfig,decodoRuntimeAuthorization} from './decodo-runtime-config.mjs';
import {createDecodoProvider} from '../../../../docs/catalog/global-47/research-v1/decodo-adapter.mjs';
import {capabilityAvailability} from '../research-v2/capabilities/config.mjs';
const canonical={DECODO_USERNAME:'canonicalbase',DECODO_PASSWORD:'canonical-private-sentinel'},legacy={SAVLIVO_DECODO_USERNAME:'legacybase',SAVLIVO_DECODO_PASSWORD:'legacy-private-sentinel'};
for(const [name,env,configured,source]of [
 ['canonical',canonical,true,'CANONICAL'],['legacy',legacy,true,'LEGACY'],['precedence',{...legacy,...canonical},true,'CANONICAL'],
 ['mixed username',{DECODO_USERNAME:canonical.DECODO_USERNAME,SAVLIVO_DECODO_PASSWORD:legacy.SAVLIVO_DECODO_PASSWORD},false,'CANONICAL'],
 ['mixed password',{DECODO_PASSWORD:canonical.DECODO_PASSWORD,SAVLIVO_DECODO_USERNAME:legacy.SAVLIVO_DECODO_USERNAME},false,'CANONICAL'],
 ['partial overrides complete legacy',{...legacy,DECODO_USERNAME:canonical.DECODO_USERNAME},false,'CANONICAL'],
 ['empty canonical overrides legacy',{...legacy,DECODO_USERNAME:'',DECODO_PASSWORD:''},false,'CANONICAL'],
 ['one empty canonical',{...legacy,DECODO_PASSWORD:''},false,'CANONICAL'],
 ['empty legacy',{SAVLIVO_DECODO_USERNAME:'',SAVLIVO_DECODO_PASSWORD:''},false,'LEGACY'],
 ['malformed canonical',{...canonical,DECODO_USERNAME:'bad:name'},false,'CANONICAL'],
 ['whitespace',{...canonical,DECODO_PASSWORD:'  '},false,'CANONICAL'],
 ['absent',{},false,'ABSENT']
])test(name+' resolves identically in runtime, adapter, readiness and authorization',async()=>{
 const resolved=resolveDecodoCredentials(env);assert.equal(resolved.configured,configured);assert.equal(resolved.source,source);
 let keychain=0;const runtime=await loadDecodoRuntimeConfig({env,readKeychain:async()=>{keychain++;return null;}});
 assert.equal(keychain,source==='ABSENT'?2:0);
 assert.equal(createDecodoProvider({env:runtime}).provider.configured,configured);
 assert.equal(capabilityAvailability(env).decodo.available,configured);assert.equal(capabilityAvailability(runtime).decodo.available,configured);
 if(configured)assert.equal(decodoRuntimeAuthorization(runtime).task,'0.20');else assert.throws(()=>decodoRuntimeAuthorization(runtime),/DECODO_RUNTIME_CONFIG_NOT_READY/);
 if(source==='CANONICAL'){assert.equal(runtime.DECODO_USERNAME,env.DECODO_USERNAME??'');assert.equal(runtime.DECODO_PASSWORD,env.DECODO_PASSWORD??'');}
 // Both non-enumerable compatibility properties contain only the selected pair.
 assert.equal(runtime.SAVLIVO_DECODO_USERNAME,runtime.DECODO_USERNAME);assert.equal(runtime.SAVLIVO_DECODO_PASSWORD,runtime.DECODO_PASSWORD);
 const diagnostics=JSON.stringify({resolved,runtime,copy:{...runtime},readiness:capabilityAvailability(env),provider:createDecodoProvider({env:runtime}).provider});
 for(const secret of [...Object.values(canonical),...Object.values(legacy)])assert(!diagnostics.includes(secret));
});
test('adapter directly consumes canonical pair with precedence, without a loader',async()=>{
 const defaults=await loadDecodoRuntimeConfig({env:{},readKeychain:async()=>null});
 assert(createDecodoProvider({env:{...defaults,...canonical}}).provider.configured);
 assert(!createDecodoProvider({env:{...defaults,...legacy,DECODO_USERNAME:''}}).provider.configured);
});
test('legacy local Keychain remains compatible, but never fills partial environment pairs',async()=>{
 const runtime=await loadDecodoRuntimeConfig({env:{},readKeychain:async k=>legacy[k]});assert.equal(runtime.DECODO_USERNAME,legacy.SAVLIVO_DECODO_USERNAME);assert(capabilityAvailability(runtime).decodo.available);
 let calls=0;const partial=await loadDecodoRuntimeConfig({env:{DECODO_USERNAME:'base'},readKeychain:async()=>{calls++;return 'secret';}});assert.equal(calls,0);assert(!resolveDecodoCredentials(partial).configured);
});
test('inherited properties cannot supply a missing credential',()=>{
 const env=Object.assign(Object.create({DECODO_PASSWORD:'hidden'}),{DECODO_USERNAME:'base'});assert(!resolveDecodoCredentials(env).configured);
});
test('canonical credential reflection is rejected by the actual synthetic transport without disclosure',async()=>{
 const {decodoFixture,request,budget}=await import('../../../../docs/catalog/global-47/research-v1/decodo-test-fixtures.mjs');
 const f=decodoFixture({env:canonical,body:canonical.DECODO_PASSWORD}),result=await f.engine.execute(request({budgetDecision:budget()}));
 assert.equal(result.outcome,'UNRESOLVED');assert(result.attempts.every(a=>a.page===null));
 const serialized=JSON.stringify({result,bundle:f.bundle,events:f.events});for(const value of Object.values(canonical))assert(!serialized.includes(value));
 assert(!serialized.includes(Buffer.from(canonical.DECODO_USERNAME+':'+canonical.DECODO_PASSWORD).toString('base64')));
});
