// Subprocesses are the real offline interpreter; deny transport in this host.
import net from 'node:net';import {syncBuiltinESMExports} from 'node:module';
net.Socket.prototype.connect=()=>{throw Error('TEST_NETWORK_FORBIDDEN')};globalThis.fetch=()=>{throw Error('TEST_NETWORK_FORBIDDEN')};syncBuiltinESMExports();
import test,{after} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {createHash} from 'node:crypto';

const cwd=process.cwd(),root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'price-needs-')));process.chdir(root);after(()=>{process.chdir(cwd);fs.rmSync(root,{recursive:true});});
const sha=x=>createHash('sha256').update(x).digest('hex');fs.writeFileSync('memory.json','[]');const reference={path:'memory.json',hash:sha('[]')};
const known='https://provider.example/offer';
const target=(market='NO')=>({id:'fixture-price-'+market,service:'fixture',serviceName:'Fixture',market,researchObjective:'SERVICE_COVERAGE',smartResearch:{version:2},authorities:[{hostname:'provider.example',provider:'Fixture',sourceUrl:known,checkedAt:'2026-01-01',sourceType:'OFFICIAL_PROVIDER'}],urls:[known],leads:[{url:known,title:'Membership plans',rank:0}],reads:[],queries:[],decisions:[],verified:[],blockedOrigins:[],capabilities:{direct:true,tavily:true,decodo:false,browser:false,groq:false}});
const missing=t=>t.priceEvidenceNeeds.claims.flatMap(c=>c.missing);

test('real retained replay produces the same projection via offline interpreter and verifier worker',async()=>{
 const {replayTarget}=await import('../inventory/reviewed-cohort-execution.mjs'),{loadProviderSourceRegistry}=await import('../live/provider-source-registry.mjs');
 fs.symlinkSync(cwd+'/docs',root+'/docs','dir');
 const t=target(),directory=root+'/source',body='<html><head><title>Fixture</title></head><body><h1>Fixture membership</h1><script>window.catalog = {"currencyExponents":{"NOK":2},"offers":[{"product":{"name":"Solo","sku":"S","subscription":{"length":1,"unit":"months"}},"totalAmountWithTaxes":{"amount":"2500","currencyCode":"NOK"}}]};</script></body></html>',h=sha(body);
 fs.mkdirSync(directory+'/bodies',{recursive:true});fs.writeFileSync(directory+'/bodies/'+h+'.txt',body);
 const page={url:known,requestedUrl:known,httpStatus:200,outcome:'OK',contentType:'text/html',checkedAt:'2026-01-01T00:00:00Z',authority:{status:'CONFIGURED_REVIEWED',hostname:'provider.example',provider:'Fixture',sourceType:'OFFICIAL_PROVIDER'},sourceIntegrity:{sha256:h},bodyHash:h,bodyFile:'bodies/'+h+'.txt',accessDecisions:[{decision:'ALLOWED'}]};
 fs.writeFileSync(directory+'/pages.json',JSON.stringify([page]));
 const r=await replayTarget({target:t,directory:root+'/replay',sourceDirectory:directory,registry:loadProviderSourceRegistry({targets:[t]})});assert.equal(r.accepted,1);assert.equal(r.networkCalls,0);assert.equal(r.researchComplete,false);assert(r.target.priceEvidenceNeeds.claims.length>0);assert.equal(r.target.verified.length,0);assert(missing(r.target).some(m=>m.assertion==='offerPresentation'));
 const second=await replayTarget({target:t,directory:root+'/replay',sourceDirectory:directory,registry:loadProviderSourceRegistry({targets:[t]}),interpret:()=>{throw Error('NO_REPEAT');}});assert.deepEqual(second,r);
});
