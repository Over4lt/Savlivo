// Isolated admission contract for disposable-database tests only. No API,
// production CLI, migration runner or runtime module imports this file.
import {createHash,verify} from 'node:crypto';
import {loadRetainedVerifiedEvidence,preflightRetainedVerifiedV1,currentParserTruthVersion,sourceAgeAt} from '../src/v2-operations/verified-reconciliation-v1.mjs';
import {evaluateCountryProviderTruth} from '../src/research-v2/live/provider-source-v3.mjs';
import {v3ResultFromTarget,verifiedAdapters} from '../src/google-ai/admin-live-pipeline.mjs';
import {persistVerifiedLivePricesInTransaction} from '../src/pricing-store.ts';
import {pool} from '../src/db.ts';

const fail=code=>{throw Error('RETAINED_VERIFIED_'+code);};
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
const hash=value=>createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');

export function approvalMessageV1(approval){
 const {nonce,operatorId,digest,jobId,service,market,attemptId,bodyHash,policyRevision,maxSourceAgeMs}=approval??{};
 if(!/^[0-9a-f-]{36}$/i.test(nonce??'')||!/^[0-9a-f-]{36}$/i.test(operatorId??'')||
    !/^[a-f0-9]{64}$/.test(digest??'')||!/^[a-f0-9-]{36}$/.test(jobId??'')||
    !/^[a-z0-9-]+$/.test(service??'')||!/^[A-Z]{2}$/.test(market??'')||
    !attemptId||!/^[a-f0-9]{64}$/.test(bodyHash??'')||
    typeof policyRevision!=='string'||!policyRevision||
    !Number.isSafeInteger(maxSourceAgeMs)||maxSourceAgeMs<=0)fail('APPROVAL_INVALID');
 return Buffer.from(JSON.stringify(canonical({schemaVersion:1,nonce,operatorId,digest,jobId,service,market,attemptId,bodyHash,policyRevision,maxSourceAgeMs})));
}

async function readTargetState(client,service,market){
 const revision=(await client.query(`SELECT revision FROM retained_verified_target_revisions
   WHERE service_slug=$1 AND country_code=$2 FOR UPDATE`,[service,market])).rows[0]?.revision;
 const counts=(await client.query(`SELECT
   (SELECT count(*)::int FROM verified_provider_prices WHERE service_slug=$1 AND country_code=$2) AS current_count,
   (SELECT count(*)::int FROM verified_price_observations WHERE service_slug=$1 AND country_code=$2) AS history_count`,[service,market])).rows[0];
 return {revision:Number(revision),currentCount:counts?.current_count,historyCount:counts?.history_count};
}

// The only policy accepted here is an explicit synthetic fixture. There is no
// production caller and the public V1 commit function remains hard-disabled.
export async function admitRetainedVerifiedInDisposableDatabaseV1({
 database,runsRoot,dryRun,approval,signature,publicKey,authorizeAdministrator,syntheticPolicy
}={}){
 if(process.env.SAVLIVO_DISPOSABLE_DB_TEST!=='1'||
    process.env.DATABASE_URL!=='postgresql://postgres@127.0.0.1:55439/savlivo_test'||database!==pool)
   fail('PRODUCTION_COMMIT_DISABLED');
 if(syntheticPolicy?.kind!=='SYNTHETIC_TEST_ONLY'||
    syntheticPolicy.revision!==approval?.policyRevision||
    syntheticPolicy.maxSourceAgeMs!==approval?.maxSourceAgeMs)fail('FRESHNESS_POLICY_UNAPPROVED');
 if(!database?.connect||typeof authorizeAdministrator!=='function'||!publicKey||
    typeof signature!=='string'||!/^[A-Za-z0-9_-]+$/.test(signature))fail('APPROVAL_INVALID');
 const message=approvalMessageV1(approval);
 if(!verify(null,message,publicKey,Buffer.from(signature,'base64url'))||
    approval.digest!==dryRun?.digest||approval.jobId!==dryRun.jobId||
    approval.service!==dryRun.service||approval.market!==dryRun.market||
    approval.attemptId!==dryRun.attemptId||approval.bodyHash!==dryRun.bodyHash||
    !Number.isSafeInteger(dryRun.databaseRevision)||dryRun.databaseRevision<0||
    dryRun.currentVerified!==0||dryRun.historyRows!==0||!dryRun.evidenceReady)
   fail('APPROVAL_MISMATCH');
 if(await authorizeAdministrator(approval.operatorId)!==true)fail('ADMIN_UNAUTHORIZED');
 const client=await database.connect();
 try{
  await client.query('BEGIN');
  await client.query('SELECT pg_advisory_xact_lock(hashtext($1),hashtext($2))',[dryRun.service,dryRun.market]);
  // Even an idempotent replay must still resolve the original journal/body.
  const evidence=loadRetainedVerifiedEvidence({runsRoot,jobId:dryRun.jobId,service:dryRun.service,
    market:dryRun.market,sourceHash:dryRun.bodyHash});
  const version=currentParserTruthVersion();
  if(version!==dryRun.parserTruthVersion)fail('PARSER_TRUTH_VERSION_CHANGED');
  const existing=(await client.query(`SELECT * FROM retained_verified_admissions
    WHERE approval_nonce=$1 OR (job_id=$2 AND target_id=$3 AND attempt_id=$4 AND body_sha256=$5)
    FOR UPDATE`,[approval.nonce,dryRun.jobId,dryRun.targetId,dryRun.attemptId,dryRun.bodyHash])).rows;
  if(existing.length){
   const row=existing[0];
   if(existing.length!==1||row.approval_nonce!==approval.nonce||row.approved_digest!==dryRun.digest||
      row.operator_id!==approval.operatorId||row.job_id!==dryRun.jobId||
      row.target_id!==dryRun.targetId||row.body_sha256.trim()!==dryRun.bodyHash)fail('CONFLICTING_REPLAY');
   await client.query('COMMIT');
   return {status:'ALREADY_ADMITTED',receipt:row};
  }
  await client.query(`INSERT INTO retained_verified_target_revisions(service_slug,country_code)
    VALUES($1,$2) ON CONFLICT DO NOTHING`,[dryRun.service,dryRun.market]);
  const before=await readTargetState(client,dryRun.service,dryRun.market);
  if(before.revision!==dryRun.databaseRevision||before.currentCount!==0||before.historyCount!==0)
   fail('DATABASE_SNAPSHOT_CHANGED');
  const repeat=await preflightRetainedVerifiedV1({evidence,atVersion:version,snapshot:async()=>({
    at:dryRun.snapshotAt,identity:dryRun.databaseSnapshot,currentCount:before.currentCount,
    historyCount:before.historyCount,revision:before.revision
  })});
  if(repeat.digest!==dryRun.digest)fail('PREFLIGHT_DIGEST_CHANGED');
  const now=(await client.query('SELECT clock_timestamp() AS at')).rows[0]?.at;
  const admittedAt=new Date(now).toISOString();
  if(sourceAgeAt(evidence.acquiredAt,admittedAt,{
    approved:syntheticPolicy.maxSourceAgeMs
  }).ageMs>syntheticPolicy.maxSourceAgeMs)fail('SOURCE_EXPIRED');
  const evaluated=evaluateCountryProviderTruth({target:evidence.target,sourceCheck:evidence.sourceCheck,
    attempt:evidence.attempt});
  const target={...evidence.target,...evaluated,v3Observation:{...evaluated.v3Observation,acquiredAt:evidence.acquiredAt}};
  const rows=verifiedAdapters(target,v3ResultFromTarget(target).verified);
  const observed=rows.map(row=>[row.planName,row.monthlyPriceMinor,row.currency,row.sourceUrl,row.updatedAt]).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
  const approved=dryRun.offerings.map(row=>[row.plan,Math.round(row.amount*100),row.currency,row.sourceUrl,row.verifiedAt]).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
  if(rows.length!==dryRun.offerings.length||rows.some(row=>row.updatedAt!==evidence.acquiredAt||
     row.sourceUrl!==evidence.sourceUrl||row.serviceSlug!==dryRun.service||row.countryCode!==dryRun.market||
     row.billingInterval&&row.billingInterval!=='MONTHLY_RECURRING')||
     JSON.stringify(observed)!==JSON.stringify(approved))fail('WRITER_MAPPING_MISMATCH');
  const saved=await persistVerifiedLivePricesInTransaction(rows,client);
  if(saved.persisted!==rows.length)fail('WRITER_INCOMPLETE');
  const after=await readTargetState(client,dryRun.service,dryRun.market);
  if(after.currentCount!==rows.length||after.historyCount!==rows.length)fail('WRITER_RESULT_MISMATCH');
  const result=rows.map(row=>({planIdentity:row.planIdentity,planName:row.planName,
    amountMinor:row.monthlyPriceMinor,currency:row.currency,sourceUrl:row.sourceUrl,
    acquiredAt:evidence.acquiredAt}));
  const resultDigest=hash(result);
  const receipt=(await client.query(`INSERT INTO retained_verified_admissions
    (job_id,target_id,service_slug,country_code,attempt_id,source_url,body_sha256,
     journal_sequence,journal_hash,approved_digest,approval_nonce,operator_id,approval_signature,
     policy_revision,parser_truth_version,source_acquired_at,admitted_at,prior_revision,
     resulting_revision,result_digest,result)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21::jsonb)
    RETURNING *`,[dryRun.jobId,dryRun.targetId,dryRun.service,dryRun.market,dryRun.attemptId,
    evidence.sourceUrl,dryRun.bodyHash,evidence.journalRecord.sequence,evidence.journalRecord.hash,
    dryRun.digest,approval.nonce,approval.operatorId,signature,approval.policyRevision,version,
    evidence.acquiredAt,admittedAt,before.revision,after.revision,resultDigest,JSON.stringify(result)])).rows[0];
  await client.query('COMMIT');
  return {status:'ADMITTED',receipt};
 }catch(error){try{await client.query('ROLLBACK');}catch{}throw error;}
 finally{client.release();}
}
