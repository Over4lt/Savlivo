// Proposed retained-source Verified reconciliation policy. This module is
// read-only: it has no admission endpoint and no production write capability.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {safePath} from './artifacts.mjs';
import {readMarketRunRecords} from '../research-v1/market-run-store.mjs';
import {evaluateCountryProviderTruth} from '../research-v2/live/provider-source-v3.mjs';
import {projectV3VerificationEvidence} from '../research-v2/inventory/v3-result-projection.mjs';
import {semanticPlanLabel} from '../verified-price-reconciliation.mjs';
import {pool} from '../db.ts';

export const reconciliationV1Policy=Object.freeze({version:1,maxSourceAgeMs:24*60*60*1000,productionCommitEnabled:false});
const sha=value=>createHash('sha256').update(value).digest('hex');
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
const digest=value=>sha(JSON.stringify(canonical(value)));
const fail=code=>{throw Error('RETAINED_VERIFIED_'+code);};
const validId=value=>typeof value==='string'&&/^[a-z0-9][a-z0-9-]{0,159}$/.test(value);
const validHash=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const readJson=(root,relative,max=16_000_000)=>{
 const file=safePath(root,relative),stat=fs.statSync(file);
 if(!stat.isFile()||stat.size>max)fail('ARTIFACT_BOUND');
 return JSON.parse(fs.readFileSync(file,'utf8'));
};
const inside=(root,file)=>{
 const base=fs.realpathSync(root),resolved=fs.realpathSync(file);
 if(!resolved.startsWith(base+path.sep))fail('ARTIFACT_PATH');
 return resolved;
};

// The timestamp is taken only from the original acquisition record. A file
// mtime, later interpretation, receipt review or dry-run time is not evidence
// that the provider source was freshly acquired.
export function originalAcquisitionTime(attempt){
 const page=attempt?.page;
 const values=[page?.checkedAt,page?.sourceIntegrity?.checkedAt].filter(value=>value!==undefined&&value!==null);
 if(!values.length||values.some(value=>typeof value!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(value)||!Number.isFinite(Date.parse(value))))fail('ACQUISITION_TIME_UNKNOWN');
 const instants=new Set(values.map(value=>Date.parse(value)));
 if(instants.size!==1)fail('ACQUISITION_TIME_CONFLICT');
 return new Date([...instants][0]).toISOString();
}

export function sourceAgeAt(acquiredAt,at){
 const age=Date.parse(at)-Date.parse(acquiredAt);
 if(!Number.isFinite(age)||age<0)fail('ACQUISITION_TIME_FUTURE');
 return {ageMs:age,within24Hours:age<=reconciliationV1Policy.maxSourceAgeMs};
}

// Only a completed child in an already closed canonical batch is eligible.
// The journal's own hash chain is verified by readMarketRunRecords.
export function loadRetainedVerifiedEvidence({runsRoot,jobId,service,market,sourceHash}){
 if(!/^[a-f0-9-]{36}$/.test(jobId??'')||!validId(service)||!/^[A-Z]{2}$/.test(market??'')||!validHash(sourceHash))fail('SELECTOR_INVALID');
 const jobRoot=safePath(runsRoot,jobId),job=readJson(jobRoot,'operation.json');
 if(job?.id!==jobId||job.config?.objective!=='PRICE_RESEARCH'||job.config?.targetKind!=='CANONICAL_SELECTION')fail('JOB_INVALID');
 const targetId='price-research:'+service+':'+market,targets=job.config.batchTargets??[],index=targets.findIndex(row=>row.id===targetId&&row.serviceId===service&&row.targetMarket===market);
 if(index<0||targets.filter(row=>row.id===targetId).length!==1)fail('TARGET_NOT_IN_JOB');
 const eventsFile=safePath(jobRoot,'price-research-batch-progress.jsonl');
 if(fs.statSync(eventsFile).size>8_000_000)fail('PROGRESS_BOUND');
 const events=fs.readFileSync(eventsFile,'utf8').split('\n').filter(Boolean).map(line=>JSON.parse(line));
 if(events.filter(row=>row.index===index&&row.targetId===targetId).at(-1)?.status!=='COMPLETE')fail('TARGET_NOT_COMPLETE');
 const child=safePath(jobRoot,'price-research-targets/'+String(index+1).padStart(2,'0')+'-'+service+'-'+market);
 const checkpoints=['priority-research-links','known-service','known-service-v3-verification-retry-1'];
 const matches=[];
 for(const checkpoint of checkpoints){
  const file=safePath(child,checkpoint+'/adaptive-state.json');
  if(!fs.existsSync(file))continue;
  const state=readJson(child,checkpoint+'/adaptive-state.json'),target=state.targets?.[targetId];
  if(!target)continue;
  if(target.id!==targetId||target.service!==service||target.market!==market)fail('TARGET_MISMATCH');
  for(const outcome of target.acquisitionOutcomes??[])if(outcome.sourceHash===sourceHash&&outcome.countryV3Evaluation?.status==='EVALUATED')matches.push({target,outcome});
 }
 if(matches.length!==1)fail('SOURCE_AMBIGUOUS');
 const {target,outcome}=matches[0],run=inside(child,outcome.runDirectory),bodyFile=inside(run,path.join(run,'raw',sourceHash+'.body'));
 if(outcome.countryV3Evaluation.sourceHash!==sourceHash||
    outcome.countryV3Evaluation.receiptStatus!=='HASH_VERIFIED'||
    outcome.countryV3Evaluation.geoClass!=='G1')fail('COUNTRY_EVALUATION_MISMATCH');
 if(fs.statSync(bodyFile).size>8_000_000)fail('BODY_BOUND');
 const body=fs.readFileSync(bodyFile,'utf8');
 if(sha(body)!==sourceHash)fail('BODY_HASH_MISMATCH');
 const verification=readJson(run,'interpretation-0001/targeted-verification.json');
 const checks=(verification.sourceChecks??[]).filter(row=>row.hash===sourceHash);
 if(checks.length!==1)fail('SOURCE_CHECK_AMBIGUOUS');
 const sourceCheck=checks[0],attemptId=sourceCheck.receipt?.geo?.attemptId;
 const records=readMarketRunRecords(path.join(run,'journal'),{maxBytes:250_000_000});
 const candidateRecords=records.filter(row=>row.type==='V2_ACQUISITION_RESULT'&&row.payload?.target?.id===targetId);
 const found=candidateRecords.flatMap(record=>(record.payload.result?.attempts??[]).flatMap((attempt,attemptIndex)=>attempt.id===attemptId?[{record,attempt,attemptIndex}]:[]));
 if(found.length!==1)fail('ATTEMPT_AMBIGUOUS');
 const {record,attempt,attemptIndex}=found[0],reference=sourceCheck.receipt?.geo?.sourceReference;
 if(!reference||reference.hash!==record.hash||reference.sequence!==record.sequence||
    reference.path!==`journal/record-${String(record.sequence).padStart(8,'0')}.json`||
    reference.pointer!==`/result/attempts/${attemptIndex}/page`||
    reference.trustRoot?.kind!=='LIVE_CAMPAIGN_ROOT_V1'||reference.trustRoot?.id!==path.basename(run)||
    sourceCheck.occurrence!==sourceCheck.receipt.sourceOccurrenceId)fail('JOURNAL_RECEIPT_BINDING');
 if(attempt.page?.rawSource?.text!==body||attempt.page?.sourceIntegrity?.sha256!==sourceHash)fail('JOURNAL_BODY_MISMATCH');
 const acquiredAt=originalAcquisitionTime(attempt);
 if(outcome.sourceClassification?.sourceHash!==sourceHash||outcome.sourceClassification?.finalUrl!==attempt.page.url||outcome.sourceClassification?.status!=='PROVIDER_SOURCE')fail('SOURCE_CLASSIFICATION_MISMATCH');
 return {jobId,targetId,target,sourceCheck,attempt,bodyHash:sourceHash,sourceUrl:attempt.page.url,acquiredAt,journalRecord:{sequence:record.sequence,hash:record.hash},attemptId};
}

export function currentParserTruthVersion(){
 const directory=path.dirname(fileURLToPath(import.meta.url));
 const v3=path.resolve(directory,'../research-v3');
 const versionFiles=[
  ...fs.readdirSync(v3).filter(name=>name.endsWith('.mjs')).sort().map(name=>'../research-v3/'+name),
  '../research-v2/live/provider-source-v3.mjs',
  '../research-v2/live/source-classification.mjs',
  '../research-v2/live/provider-routing-authority.mjs',
  '../research-v2/inventory/v3-result-projection.mjs',
  '../../../../packages/contracts/src/product-pricing.ts',
  '../../../../packages/contracts/src/markets.ts'
 ];
 return digest(versionFiles.map(relative=>({file:relative,sha256:sha(fs.readFileSync(path.resolve(directory,relative)))})));
}

// snapshot() must read both tables in one READ ONLY, REPEATABLE READ database
// transaction. It returns {at, currentCount, historyCount, identity}.
export async function snapshotVerifiedTargetV1(service,market,database=pool){
 if(!validId(service)||!/^[A-Z]{2}$/.test(market??''))fail('SNAPSHOT_SELECTOR_INVALID');
 const client=await database.connect();
 try{
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  const result=await client.query(`SELECT transaction_timestamp() AS at, txid_current_snapshot()::text AS identity,
    (SELECT count(*)::int FROM verified_provider_prices WHERE service_slug=$1 AND country_code=$2) AS current_count,
    (SELECT count(*)::int FROM verified_price_observations WHERE service_slug=$1 AND country_code=$2) AS history_count`,[service,market]);
  const row=result.rows[0];
  await client.query('ROLLBACK');
  return {at:new Date(row.at).toISOString(),identity:row.identity,currentCount:row.current_count,historyCount:row.history_count};
 }catch(error){try{await client.query('ROLLBACK');}catch{}throw error;}
 finally{client.release();}
}

export async function preflightRetainedVerifiedV1({evidence,snapshot,atVersion=currentParserTruthVersion(),now}={}){
 if(!evidence||typeof snapshot!=='function')fail('PREFLIGHT_INPUT_INVALID');
 const {jobId,targetId,target,sourceCheck,attempt,bodyHash,sourceUrl,acquiredAt,journalRecord,attemptId}=evidence;
 if(!validHash(bodyHash)||targetId!=='price-research:'+target?.service+':'+target?.market||sourceCheck?.hash!==bodyHash||attempt?.id!==attemptId||attempt?.page?.url!==sourceUrl||originalAcquisitionTime(attempt)!==acquiredAt)fail('EVIDENCE_BINDING');
 const sourceResult=evaluateCountryProviderTruth({target,sourceCheck,attempt});
 const v3Target={...target,...sourceResult,v3Observation:{...sourceResult.v3Observation,acquiredAt}};
 const offerings=projectV3VerificationEvidence(v3Target);
 if(!offerings.length||offerings.some(row=>row.serviceId!==target.service||row.targetMarket!==target.market||row.truthMarket!==target.market||row.sourceUrl!==sourceUrl||row.bodySha256!==bodyHash||row.verifiedAt!==acquiredAt||row.verification!=='authoritative-provider'))fail('V3_NOT_ESTABLISHED');
 const ids=offerings.map(row=>row.exactOfferId);
 if(ids.some(id=>typeof id!=='string'||!id)||new Set(ids).size!==ids.length)fail('OFFER_IDENTITY_AMBIGUOUS');
 const semanticKeys=offerings.map(row=>[row.currency,semanticPlanLabel(row.plan,target.serviceName)?.core].join('\u0000'));
 if(semanticKeys.some(key=>key.endsWith('\u0000'))||new Set(semanticKeys).size!==semanticKeys.length)fail('OFFER_IDENTITY_AMBIGUOUS');
 const database=await snapshot(target.service,target.market);
 if(!database||typeof database.at!=='string'||!Number.isFinite(Date.parse(database.at))||!Number.isSafeInteger(database.currentCount)||!Number.isSafeInteger(database.historyCount)||typeof database.identity!=='string')fail('SNAPSHOT_INVALID');
 if(now!==undefined&&Date.parse(now)!==Date.parse(database.at))fail('SNAPSHOT_TIME_MISMATCH');
 const age=sourceAgeAt(acquiredAt,database.at),empty=database.currentCount===0&&database.historyCount===0;
 const result={policyVersion:1,jobId,targetId,service:target.service,market:target.market,sourceUrl,bodyHash,attemptId,journalRecord,acquiredAt,snapshotAt:database.at,admittedAt:null,ageMs:age.ageMs,within24Hours:age.within24Hours,currentVerified:database.currentCount,historyRows:database.historyCount,parserTruthVersion:atVersion,offerings:offerings.map(row=>({id:row.exactOfferId,plan:row.plan,amount:row.amount,currency:row.currency,billingInterval:'MONTHLY_RECURRING',sourceUrl:row.sourceUrl,bodySha256:row.bodySha256,verifiedAt:acquiredAt})),eligible:age.within24Hours&&empty,reason:!age.within24Hours?'SOURCE_OVER_24_HOURS':!empty?'VERIFIED_ALREADY_PRESENT':null,databaseSnapshot:database.identity,productionCommitEnabled:false};
 return {...result,digest:digest(result)};
}

// This is a read-only rehearsal of the proposed approval handshake. A future
// write release must repeat it under the same database locks as the ordinary
// Verified writer before any insert.
export async function revalidateApprovedDryRunV1({dryRun,approvedDigest,operator,evidence,snapshot,atVersion=currentParserTruthVersion()}={}){
 if(typeof operator!=='string'||!operator.trim()||!validHash(approvedDigest)||!dryRun||dryRun.digest!==approvedDigest)fail('OPERATOR_APPROVAL_REQUIRED');
 const {digest:claimed,...signed}=dryRun;
 if(digest(signed)!==claimed||dryRun.policyVersion!==1||dryRun.eligible!==true)fail('APPROVAL_INVALID');
 const current=await preflightRetainedVerifiedV1({evidence,snapshot,atVersion});
 const stable=value=>{
  const {digest:ignoredDigest,ageMs:ignoredAge,snapshotAt:ignoredAt,within24Hours:ignoredFreshness,eligible:ignoredEligibility,reason:ignoredReason,...rest}=value;
  return rest;
 };
 if(!current.eligible||digest(stable(current))!==digest(stable(dryRun)))fail('APPROVAL_STALE');
 return {approvedDigest,operator:operator.trim(),sourceAcquiredAt:current.acquiredAt,admissionCheckedAt:current.snapshotAt,offerings:current.offerings,readyForDisabledCommit:true};
}

// A later release needs its own reviewed, atomic admission contract. No caller
// can enable production admission with an environment variable in V1.
export async function commitRetainedVerifiedV1(){fail('PRODUCTION_COMMIT_DISABLED');}
