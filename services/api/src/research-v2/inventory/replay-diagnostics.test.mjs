import net from 'node:net';
import {syncBuiltinESMExports} from 'node:module';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {replayTarget} from './reviewed-cohort-execution.mjs';
import {interpretDirectProvider} from '../live/direct-provider-evidence.mjs';
import {projectPriceEvidenceNeeds} from '../intelligence/price-evidence-needs.mjs';
import {projectionMetrics,replayDiagnostics,retainedReplayFailure} from './replay-diagnostics.mjs';
net.Socket.prototype.connect=()=>{throw Error('TEST_NETWORK_FORBIDDEN');};globalThis.fetch=()=>{throw Error('TEST_NETWORK_FORBIDDEN');};syncBuiltinESMExports();
const sha=x=>createHash('sha256').update(x).digest('hex');
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
function fixture(t,count=1){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'replay-diagnostics-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));fs.mkdirSync(root+'/bodies');
 const pages=Array.from({length:count},(_,i)=>{const body='<html><body><p>Fixture '+i+'</p></body></html>',bodyHash=sha(body),url='https://provider.example/plans/'+i+'?private=SECRET#fragment';fs.writeFileSync(root+'/bodies/'+bodyHash+'.txt',body);return {url,requestedUrl:url,httpStatus:200,outcome:'OK',bodyHash,bodyFile:'bodies/'+bodyHash+'.txt',sourceIntegrity:{sha256:bodyHash},accessDecisions:[{decision:'ALLOWED'}]};});
 fs.writeFileSync(root+'/pages.json',JSON.stringify(pages));
 const target={id:'fixture-price-DE',service:'fixture',serviceName:'Fixture',market:'DE',researchObjective:'SERVICE_COVERAGE',authorities:[{hostname:'provider.example',provider:'Fixture',sourceType:'OFFICIAL_PROVIDER',checkedAt:'2026-01-01'}],urls:[],reads:[],queries:[],verified:[],priorUsage:{reads:7,searches:2},researchMemory:{version:1,scope:'unchanged',attempts:[]},requestCeiling:36};
 const directory=root+'/replay',registry={domains:[{service:'fixture',hostname:'provider.example',validated:true,reference:{fixture:true}}]};
 return {root,pages,target,directory,registry,sourceDirectory:root,progress:()=>read(directory+'/replay-progress.json')};
}
const result=()=>({verified:[],runDirectory:null});
async function fails(args,interpret){let error;try{await replayTarget({...args,interpret});}catch(e){error=e;}assert(error,'expected replay failure');return error;}
for(const stage of ['INTERPRETATION','TARGETED_VERIFICATION'])test(stage+' preserves original error and source identity',async t=>{
 const f=fixture(t);let calls=0;const error=Error(stage+'_FAILED');const e=await fails(f,args=>interpretDirectProvider({...args,interpret:async()=>{calls++;if(stage==='INTERPRETATION')throw error;},verify:async()=>{throw error;}}));
 assert.equal(e,error);const p=f.progress();assert.equal(p.version,1);assert.equal(p.stage,stage);assert.equal(p.error.code,error.message);assert.equal(p.current.ordinal,1);assert.equal(p.current.sourceHash,f.pages[0].bodyHash);assert.equal(p.current.url,'https://provider.example/plans/0');assert.match(p.current.acquisition,/^direct-/);assert.equal(p.current.recordPersisted,false);assert.equal(calls,1);assert(!JSON.stringify(p).includes('SECRET'));assert.equal(e.replayDiagnostic.error.code,error.message);
});
test('record persistence failure is distinct and does not retry interpretation',async t=>{
 const f=fixture(t);let calls=0;await fails(f,async()=>{calls++;const key=sha(JSON.stringify([f.pages[0].bodyHash,'DE']));fs.mkdirSync(f.directory+'/price-'+key+'.json.pending');return result();});assert.equal(calls,1);assert.equal(f.progress().stage,'REPLAY_RECORD_PERSISTENCE');assert.equal(f.progress().current.recordPersisted,false);assert.equal(f.progress().error.code,'EISDIR');
});
test('post-persistence verified integration failure retains persisted status',async t=>{
 const f=fixture(t);await fails(f,async()=>({verified:{invalid:true}}));const p=f.progress();assert.equal(p.stage,'VERIFIED_RESULT_INTEGRATION');assert.equal(p.current.recordPersisted,true);assert.equal(p.current.integrationComplete,false);assert.equal(p.lastIntegrated,null);assert(fs.existsSync(f.directory+'/'+p.current.replayRecord));assert(!fs.existsSync(f.directory+'/'+p.current.replayRecord+'.dispatched'));
});
function needs(t,page){return projectPriceEvidenceNeeds(t,[{service:t.service,plan:'Standard',amount:10,currency:'EUR',market:'DE',billingInterval:{normalized:'P1M'},commercialRole:'RECURRING_MONTHLY',source:{kind:'ORIGINAL_PROVIDER',url:page.url.split('?')[0],hash:page.bodyHash,path:'x'.repeat(1100000)},fields:Object.fromEntries(['service','provenance','plan','amount','currency','billingInterval'].map(k=>[k,{status:'ESTABLISHED'}])),blockers:[]}]);}
test('real aggregate SIZE_BOUND retains last success and bounded size/count diagnostics',async t=>{
 const f=fixture(t,2),before=structuredClone(f.target);let calls=0;
 const e=await fails(f,async args=>{const i=calls++;return {verified:[{sourceHashes:[args.page.bodyHash]}],priceEvidenceNeeds:needs(args.target,args.page),runDirectory:null};});
 assert.equal(e.message,'PRICE_NEEDS_SIZE_BOUND');assert.equal(calls,2);const p=f.progress();assert.equal(p.stage,'PRICE_EVIDENCE_NEEDS_MERGE');assert.equal(p.current.ordinal,2);assert.equal(p.current.recordPersisted,true);assert.equal(p.lastIntegrated.ordinal,1);assert.equal(p.lastIntegrated.sourceHash,f.pages[0].bodyHash);assert.equal(p.lastIntegrated.integrationComplete,true);assert.equal(p.metrics.prior.sources,1);assert.equal(p.metrics.incoming.sources,1);assert.equal(p.metrics.aggregateByteLimit,2097152);assert(p.metrics.prior.serializedBytes>1100000);assert(p.metrics.incoming.serializedBytes>1100000);assert(Buffer.byteLength(JSON.stringify(p))<5000);assert(!JSON.stringify(p).includes('xxxxx'));assert.deepEqual(f.target,before);assert(!fs.existsSync(f.directory+'/retained-replay.json'));
 const disposition=retainedReplayFailure(e,f.directory);assert.equal(disposition.reason,'RETAINED_INTERPRETATION_REVIEW_REQUIRED');assert.equal(disposition.diagnostic.error.code,e.message);assert.equal(disposition.diagnostic.current.ordinal,2);
});
for(const code of ['DIRECT_PROVIDER_HASH_MISMATCH','DIRECT_PROVIDER_AUTHORITY_REQUIRED','DIRECT_PROVIDER_POLICY_UNPROVEN'])test(code+' still rethrows original error',async t=>{
 const f=fixture(t),e=await fails(f,async()=>{throw Error(code);});assert.throws(()=>retainedReplayFailure(e,f.directory),x=>x===e);assert.equal(f.progress().error.code,code);
});
test('final pages publication failure preserves last integrated receipt',async t=>{
 const f=fixture(t);await fails(f,async()=>{fs.mkdirSync(f.directory+'/pages.json.pending');return result();});const p=f.progress();assert.equal(p.stage,'PAGES_PUBLICATION');assert.equal(p.lastIntegrated.ordinal,1);assert.equal(p.current.integrationComplete,true);
});
test('successful replay and old result cache preserve exact shapes and accounting',async t=>{
 const f=fixture(t),before=structuredClone(f.target);let calls=0;const r=await replayTarget({...f,interpret:async()=>{calls++;return result();}});assert.equal(f.progress().status,'COMPLETE');assert.equal(f.progress().current.integrationComplete,true);assert.equal(r.networkCalls,0);assert.equal(r.target.requestCeiling,36);assert.deepEqual(r.target.priorUsage,before.priorUsage);assert.deepEqual(f.target,before);
 fs.unlinkSync(f.directory+'/replay-progress.json');const cached=await replayTarget({...f,interpret:()=>{throw Error('NO_RETRY');}});assert.deepEqual(cached,r);assert.equal(calls,1);assert(!fs.existsSync(f.directory+'/replay-progress.json'));assert(Array.isArray(read(f.directory+'/pages.json')));
});
test('existing source record without diagnostics is reused with object-shaped target metadata intact',async t=>{
 const f=fixture(t);f.target.historicalCheckpoint={targets:{[f.target.id]:{usage:{reads:2}}}};fs.mkdirSync(f.directory);const key=sha(JSON.stringify([f.pages[0].bodyHash,'DE']));fs.writeFileSync(f.directory+'/price-'+key+'.json',JSON.stringify(result()));const r=await replayTarget({...f,interpret:()=>{throw Error('NO_REINTERPRETATION');}});assert.deepEqual(r.target.historicalCheckpoint,f.target.historicalCheckpoint);assert.equal(f.progress().current.recordPersisted,true);
});
test('existing reservation stays reserved and is not automatically retried',async t=>{
 const f=fixture(t);fs.mkdirSync(f.directory);const file=f.directory+'/price-'+sha(JSON.stringify([f.pages[0].bodyHash,'DE']))+'.json.dispatched';fs.writeFileSync(file,'reserved');const e=await fails(f,()=>{throw Error('UNEXPECTED_RETRY');});assert.equal(e.message,'HANDOFF_RETAINED_INTERPRETATION_RECONCILIATION_REQUIRED');assert.equal(f.progress().stage,'INTERPRETATION_RESERVATION');assert.equal(fs.readFileSync(file,'utf8'),'reserved');
});
test('diagnostic write failure never replaces research exception; unsafe messages are omitted',t=>{
 const f=fixture(t);fs.mkdirSync(f.directory);fs.mkdirSync(f.directory+'/replay-progress.json.pending');const p=replayDiagnostics(f.directory,f.target.id);p.source(f.pages[0],1);const e=Object.assign(Error('secret body https://user:password@example.test/?token=SECRET'),{code:'EIO'});const d=p.fail(e);assert.equal(d.error.code,'EIO');assert(d.persistenceError);assert(!JSON.stringify(d).includes('SECRET'));assert(!JSON.stringify(d).includes('password'));assert.equal(retainedReplayFailure(Error('OLD_FAILURE'),f.directory).diagnostic,undefined);
});
test('metric measurement is bounded without returning projection data',()=>{
 const v={sources:[],claims:[],text:'x'.repeat(5*1024*1024)},m=projectionMetrics(v);assert.equal(m.serializedBytes,null);assert.equal(m.measurementComplete,false);assert.equal(m.measurementByteLimit,4194304);assert.equal(projectionMetrics({sources:[],claims:[]}).serializedBytes,26);
});
test('source preparation failure precedes interpretation and reservation',async t=>{
 const f=fixture(t);fs.mkdirSync(f.directory);fs.writeFileSync(f.directory+'/bodies','occupied');let calls=0;await fails(f,()=>{calls++;return result();});assert.equal(calls,0);assert.equal(f.progress().stage,'SOURCE_PREPARATION');assert.equal(f.progress().current.replayRecord,null);
});
test('result publication failure is distinct from successful pages publication',async t=>{
 const f=fixture(t);await fails(f,async()=>{fs.mkdirSync(f.directory+'/retained-replay.json.pending');return result();});assert.equal(f.progress().stage,'RESULT_PUBLICATION');assert(fs.existsSync(f.directory+'/pages.json'));assert.equal(f.progress().lastIntegrated.ordinal,1);assert(!fs.existsSync(f.directory+'/retained-replay.json'));
});
test('incompatible needs retain existing blocked behavior and exact diagnostic',async t=>{
 const f=fixture(t),e=await fails(f,async()=>({...result(),priceEvidenceNeeds:{version:999}}));assert.equal(e.message,'PRICE_NEEDS_SCHEMA_OR_SCOPE');assert.equal(f.progress().stage,'PRICE_EVIDENCE_NEEDS_MERGE');assert.equal(retainedReplayFailure(e,f.directory).diagnostic.error.code,e.message);assert(!fs.existsSync(f.directory+'/retained-replay.json'));
});
