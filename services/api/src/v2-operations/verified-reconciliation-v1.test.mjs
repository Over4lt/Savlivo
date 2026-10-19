import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {gunzipSync} from 'node:zlib';
import {fileURLToPath} from 'node:url';
import {openMarketRunStore} from '../research-v1/market-run-store.mjs';
import {digest} from '../research-v3/model.mjs';
import {loadRetainedVerifiedEvidence,preflightRetainedVerifiedV1,revalidateApprovedDryRunV1,originalAcquisitionTime,sourceAgeAt,snapshotVerifiedTargetV1,commitRetainedVerifiedV1,reconciliationV1Policy} from './verified-reconciliation-v1.mjs';

const fixtures=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../research-v3/fixtures/max');
const archived=JSON.parse(fs.readFileSync(path.join(fixtures,'us-production-g1-receipt.json'),'utf8'));
const body=gunzipSync(fs.readFileSync(path.join(fixtures,'us-production-help-pricing.html.gz'))).toString('utf8');
const hash='664386f1d597a5bfc9b830e5d407362a3614067af5eff85b2e096d40f1ee7c79';
assert.equal(digest(body),hash);
const acquisitionAt=archived.attempt.page.sourceIntegrity.checkedAt;
const evidence=()=>({jobId:archived.jobId,targetId:archived.target.id,target:structuredClone(archived.target),sourceCheck:structuredClone(archived.sourceCheck),attempt:{...structuredClone(archived.attempt),page:{...structuredClone(archived.attempt.page),rawSource:{text:body}}},bodyHash:hash,sourceUrl:archived.attempt.page.url,acquiredAt:acquisitionAt,journalRecord:{sequence:17,hash:archived.recordHash},attemptId:archived.attempt.id});
const at=new Date(Date.parse(acquisitionAt)+60*60*1000).toISOString();
const snapshot=(extra={})=>async()=>({at,currentCount:0,historyCount:0,identity:'synthetic-repeatable-read-snapshot',...extra});

test('exact hash-bound Max US source and original G1 receipt yields deterministic read-only dry-run',async()=>{
 const first=await preflightRetainedVerifiedV1({evidence:evidence(),snapshot:snapshot(),atVersion:'version-1'});
 const second=await preflightRetainedVerifiedV1({evidence:evidence(),snapshot:snapshot(),atVersion:'version-1'});
 assert.deepEqual(first,second);
 assert.equal(first.evidenceReady,true);
 assert.equal(first.admissionEligible,false);
 assert.equal(first.reason,'FRESHNESS_POLICY_UNAPPROVED');
 assert.equal(first.approvedFreshnessPolicy,null);
 assert.deepEqual(first.freshnessScenarios,{hours24:true,hours72:true,days7:true});
 assert.equal(first.offerings.length,3);
 assert.deepEqual(first.offerings.map(row=>[row.plan,row.amount,row.currency]),[['Basic with Ads',10.99,'USD'],['Standard',18.49,'USD'],['Premium',22.99,'USD']]);
 assert(first.offerings.every(row=>row.verifiedAt===acquisitionAt&&row.sourceUrl===archived.attempt.page.url&&row.bodySha256===hash));
 assert.equal(first.acquiredAt,acquisitionAt);
 assert.equal(first.snapshotAt,at);
 assert.equal(first.ageMs,60*60*1000);
 assert.equal(first.productionCommitEnabled,false);
 assert.equal(reconciliationV1Policy.productionCommitEnabled,false);
 assert.equal(reconciliationV1Policy.approvedMaxSourceAgeMs,null);
});

test('freshness horizons are diagnostic only; old and uncertain acquisition times cannot authorize admission',async()=>{
 assert.deepEqual(sourceAgeAt(acquisitionAt,new Date(Date.parse(acquisitionAt)+24*60*60*1000).toISOString()).scenarios,{hours24:true,hours72:true,days7:true});
 const old=await preflightRetainedVerifiedV1({evidence:evidence(),snapshot:snapshot({at:new Date(Date.parse(acquisitionAt)+24*60*60*1000+1).toISOString()}),atVersion:'version-1'});
 assert.deepEqual(old.freshnessScenarios,{hours24:false,hours72:true,days7:true});
 assert.equal(old.evidenceReady,true);
 assert.equal(old.admissionEligible,false);
 assert.equal(old.reason,'FRESHNESS_POLICY_UNAPPROVED');
 assert.deepEqual(sourceAgeAt(acquisitionAt,new Date(Date.parse(acquisitionAt)+7*24*60*60*1000+1).toISOString()).scenarios,{hours24:false,hours72:false,days7:false});
 assert.throws(()=>sourceAgeAt(acquisitionAt,new Date(Date.parse(acquisitionAt)-1).toISOString()),/ACQUISITION_TIME_FUTURE/);
 assert.throws(()=>sourceAgeAt(acquisitionAt,at,{unbounded:Number.POSITIVE_INFINITY}),/FRESHNESS_HORIZON_INVALID/);
 const absent=evidence().attempt;delete absent.page.sourceIntegrity.checkedAt;
 assert.throws(()=>originalAcquisitionTime(absent),/ACQUISITION_TIME_UNKNOWN/);
 const conflict=evidence().attempt;conflict.page.checkedAt=new Date(Date.parse(acquisitionAt)+1).toISOString();
 assert.throws(()=>originalAcquisitionTime(conflict),/ACQUISITION_TIME_CONFLICT/);
});

test('existing current or historical Verified blocks proposed admission',async()=>{
 for(const value of [{currentCount:1},{historyCount:1}]){
  const result=await preflightRetainedVerifiedV1({evidence:evidence(),snapshot:snapshot(value),atVersion:'version-1'});
  assert.equal(result.evidenceReady,false);
  assert.equal(result.admissionEligible,false);
  assert.equal(result.reason,'VERIFIED_ALREADY_PRESENT');
 }
});

test('wrong market, altered source and version or database changes cannot preserve digest',async()=>{
 const original=await preflightRetainedVerifiedV1({evidence:evidence(),snapshot:snapshot(),atVersion:'version-1'});
 const changedVersion=await preflightRetainedVerifiedV1({evidence:evidence(),snapshot:snapshot(),atVersion:'version-2'});
 const changedSnapshot=await preflightRetainedVerifiedV1({evidence:evidence(),snapshot:snapshot({identity:'another-snapshot'}),atVersion:'version-1'});
 const laterSnapshot=await preflightRetainedVerifiedV1({evidence:evidence(),snapshot:snapshot({at:new Date(Date.parse(at)+1000).toISOString()}),atVersion:'version-1'});
 assert.notEqual(original.digest,changedVersion.digest);
 assert.notEqual(original.digest,changedSnapshot.digest);
 assert.notEqual(original.digest,laterSnapshot.digest);
 const wrong=evidence();wrong.sourceCheck.receipt.geo.geoCountry='DE';
 await assert.rejects(preflightRetainedVerifiedV1({evidence:wrong,snapshot:snapshot(),atVersion:'version-1'}),/COUNTRY_PROVIDER_RECEIPT_INVALID/);
 const altered=evidence();altered.attempt.page.rawSource.text+=' ';
 await assert.rejects(preflightRetainedVerifiedV1({evidence:altered,snapshot:snapshot(),atVersion:'version-1'}),/COUNTRY_PROVIDER_HASH_MISMATCH/);
});

test('loader binds completed job, journal hash, attempt, source, receipt and body',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'retained-verified-v1-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const jobRoot=path.join(root,archived.jobId),child=path.join(jobRoot,'price-research-targets','01-max-US'),run=path.join(child,'acquisitions','original');
 fs.mkdirSync(path.join(run,'raw'),{recursive:true});
 fs.mkdirSync(path.join(child,'priority-research-links'),{recursive:true});
 fs.mkdirSync(path.join(run,'interpretation-0001'),{recursive:true});
 fs.writeFileSync(path.join(jobRoot,'operation.json'),JSON.stringify({id:archived.jobId,config:{objective:'PRICE_RESEARCH',targetKind:'CANONICAL_SELECTION',batchTargets:[{id:archived.target.id,serviceId:'max',targetMarket:'US'}]}}));
 fs.writeFileSync(path.join(jobRoot,'price-research-batch-progress.jsonl'),JSON.stringify({index:0,targetId:archived.target.id,status:'COMPLETE'})+'\n');
 fs.writeFileSync(path.join(run,'raw',hash+'.body'),body);
 const store=openMarketRunStore(path.join(run,'journal'));
 const record=store.append('V2_ACQUISITION_RESULT',{target:{id:archived.target.id},result:{attempts:[evidence().attempt]}});
 store.close();
 const sourceCheck=structuredClone(archived.sourceCheck);
 sourceCheck.receipt.geo.sourceReference={...sourceCheck.receipt.geo.sourceReference,sequence:record.sequence,hash:record.hash,path:'journal/record-00000001.json',pointer:'/result/attempts/0/page',trustRoot:{kind:'LIVE_CAMPAIGN_ROOT_V1',id:path.basename(run)}};
 fs.writeFileSync(path.join(run,'interpretation-0001/targeted-verification.json'),JSON.stringify({sourceChecks:[sourceCheck]}));
 fs.writeFileSync(path.join(child,'priority-research-links/adaptive-state.json'),JSON.stringify({targets:{[archived.target.id]:{...archived.target,acquisitionOutcomes:[{sourceHash:hash,runDirectory:run,countryV3Evaluation:{status:'EVALUATED',sourceHash:hash,receiptStatus:'HASH_VERIFIED',geoClass:'G1'},sourceClassification:{status:'PROVIDER_SOURCE',sourceHash:hash,finalUrl:archived.attempt.page.url}}]}}}));
 const selector={runsRoot:root,jobId:archived.jobId,service:'max',market:'US',sourceHash:hash};
 const loaded=loadRetainedVerifiedEvidence(selector);
 assert.equal(loaded.journalRecord.hash,record.hash);
 assert.equal(loaded.acquiredAt,acquisitionAt);
 sourceCheck.receipt.geo.sourceReference.hash='0'.repeat(64);
 fs.writeFileSync(path.join(run,'interpretation-0001/targeted-verification.json'),JSON.stringify({sourceChecks:[sourceCheck]}));
 assert.throws(()=>loadRetainedVerifiedEvidence(selector),/JOURNAL_RECEIPT_BINDING/);
 sourceCheck.receipt.geo.sourceReference.hash=record.hash;
 fs.writeFileSync(path.join(run,'interpretation-0001/targeted-verification.json'),JSON.stringify({sourceChecks:[sourceCheck]}));
 fs.writeFileSync(path.join(jobRoot,'price-research-batch-progress.jsonl'),JSON.stringify({index:0,targetId:archived.target.id,status:'STOPPED'})+'\n');
 assert.throws(()=>loadRetainedVerifiedEvidence(selector),/TARGET_NOT_COMPLETE/);
 fs.writeFileSync(path.join(jobRoot,'price-research-batch-progress.jsonl'),JSON.stringify({index:0,targetId:archived.target.id,status:'COMPLETE'})+'\n');
 fs.appendFileSync(path.join(run,'raw',hash+'.body'),' ');
 assert.throws(()=>loadRetainedVerifiedEvidence(selector),/BODY_HASH_MISMATCH/);
});

test('production commit stays disabled even with a dry-run digest',async()=>{
 await assert.rejects(commitRetainedVerifiedV1({approvedDigest:'a'.repeat(64)}),/PRODUCTION_COMMIT_DISABLED/);
});

test('an approved digest cannot activate admission while freshness policy is unapproved',async()=>{
 const dryRun=await preflightRetainedVerifiedV1({evidence:evidence(),snapshot:snapshot(),atVersion:'version-1'});
 const input={dryRun,approvedDigest:dryRun.digest,operator:'admin-example',evidence:evidence(),snapshot:snapshot({at:new Date(Date.parse(at)+60_000).toISOString()}),atVersion:'version-1'};
 await assert.rejects(revalidateApprovedDryRunV1(input),/FRESHNESS_POLICY_UNAPPROVED/);
 await assert.rejects(revalidateApprovedDryRunV1({...input,approvedDigest:'0'.repeat(64)}),/FRESHNESS_POLICY_UNAPPROVED/);
 await assert.rejects(commitRetainedVerifiedV1(input),/PRODUCTION_COMMIT_DISABLED/);
});

test('database snapshot is scoped and uses one read-only repeatable-read transaction',async()=>{
 const queries=[],client={release(){queries.push(['RELEASE']);},async query(sql,args){
  queries.push([sql,args]);
  if(sql.startsWith('SELECT'))return {rows:[{at:new Date(at),identity:'tx-snapshot',current_count:0,history_count:0}]};
  return {rows:[]};
 }};
 const result=await snapshotVerifiedTargetV1('max','US',{connect:async()=>client});
 assert.deepEqual(result,{at,identity:'tx-snapshot',currentCount:0,historyCount:0});
 assert.equal(queries[0][0],'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
 assert.deepEqual(queries[1][1],['max','US']);
 assert.match(queries[1][0],/verified_provider_prices/);
 assert.match(queries[1][0],/verified_price_observations/);
 assert.equal(queries[2][0],'ROLLBACK');
 assert.deepEqual(queries[3],['RELEASE']);
});
