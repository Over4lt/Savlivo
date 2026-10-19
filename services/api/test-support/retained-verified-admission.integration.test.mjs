import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {gunzipSync} from 'node:zlib';
import {fileURLToPath} from 'node:url';
import {generateKeyPairSync,randomUUID,sign} from 'node:crypto';
import {pool} from '../src/db.ts';
import {openMarketRunStore} from '../src/research-v1/market-run-store.mjs';
import {loadRetainedVerifiedEvidence,preflightRetainedVerifiedV1,currentParserTruthVersion,
  commitRetainedVerifiedV1,snapshotVerifiedTargetV1} from '../src/v2-operations/verified-reconciliation-v1.mjs';
import {approvalMessageV1,admitRetainedVerifiedInDisposableDatabaseV1} from './retained-verified-admission-core.mjs';

const databaseUrl='postgresql://postgres@127.0.0.1:55439/savlivo_test';
const enabled=process.env.SAVLIVO_DISPOSABLE_DB_TEST==='1'&&process.env.DATABASE_URL===databaseUrl;
const fixtures=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../src/research-v3/fixtures/max');
const archived=JSON.parse(fs.readFileSync(path.join(fixtures,'us-production-g1-receipt.json'),'utf8'));
const body=gunzipSync(fs.readFileSync(path.join(fixtures,'us-production-help-pricing.html.gz'))).toString('utf8');
const sourceHash='664386f1d597a5bfc9b830e5d407362a3614067af5eff85b2e096d40f1ee7c79';

function retainedFixture(root){
 const jobRoot=path.join(root,archived.jobId),child=path.join(jobRoot,'price-research-targets','01-max-US'),run=path.join(child,'acquisitions','original');
 fs.mkdirSync(path.join(run,'raw'),{recursive:true});
 fs.mkdirSync(path.join(child,'priority-research-links'),{recursive:true});
 fs.mkdirSync(path.join(run,'interpretation-0001'),{recursive:true});
 fs.writeFileSync(path.join(jobRoot,'operation.json'),JSON.stringify({id:archived.jobId,config:{objective:'PRICE_RESEARCH',targetKind:'CANONICAL_SELECTION',batchTargets:[{id:archived.target.id,serviceId:'max',targetMarket:'US'}]}}));
 fs.writeFileSync(path.join(jobRoot,'price-research-batch-progress.jsonl'),JSON.stringify({index:0,targetId:archived.target.id,status:'COMPLETE'})+'\n');
 fs.writeFileSync(path.join(run,'raw',sourceHash+'.body'),body);
 const attempt=structuredClone(archived.attempt);attempt.page.rawSource={text:body};
 const store=openMarketRunStore(path.join(run,'journal'));
 const record=store.append('V2_ACQUISITION_RESULT',{target:{id:archived.target.id},result:{attempts:[attempt]}});store.close();
 const sourceCheck=structuredClone(archived.sourceCheck);
 sourceCheck.receipt.geo.sourceReference={...sourceCheck.receipt.geo.sourceReference,
   sequence:record.sequence,hash:record.hash,path:'journal/record-00000001.json',
   pointer:'/result/attempts/0/page',trustRoot:{kind:'LIVE_CAMPAIGN_ROOT_V1',id:path.basename(run)}};
 fs.writeFileSync(path.join(run,'interpretation-0001/targeted-verification.json'),JSON.stringify({sourceChecks:[sourceCheck]}));
 fs.writeFileSync(path.join(child,'priority-research-links/adaptive-state.json'),JSON.stringify({targets:{[archived.target.id]:{...archived.target,
   acquisitionOutcomes:[{sourceHash,runDirectory:run,countryV3Evaluation:{status:'EVALUATED',sourceHash,receiptStatus:'HASH_VERIFIED',geoClass:'G1'},
   sourceClassification:{status:'PROVIDER_SOURCE',sourceHash,finalUrl:attempt.page.url}}]}}}));
 return {selector:{runsRoot:root,jobId:archived.jobId,service:'max',market:'US',sourceHash},
   bodyFile:path.join(run,'raw',sourceHash+'.body'),sourceCheckFile:path.join(run,'interpretation-0001/targeted-verification.json'),
   journalFile:path.join(run,'journal','record-00000001.json')};
}

async function reset(){
 await pool.query("DELETE FROM retained_verified_admissions WHERE service_slug='max' AND country_code='US'");
 await pool.query("DELETE FROM verified_provider_prices WHERE service_slug='max' AND country_code='US'");
 await pool.query("DELETE FROM verified_price_observations WHERE service_slug='max' AND country_code='US'");
 await pool.query("DELETE FROM retained_verified_target_revisions WHERE service_slug='max' AND country_code='US'");
}
async function counts(){
 const result=await pool.query(`SELECT
   (SELECT count(*)::int FROM verified_provider_prices WHERE service_slug='max' AND country_code='US') AS current_count,
   (SELECT count(*)::int FROM verified_price_observations WHERE service_slug='max' AND country_code='US') AS history_count,
   (SELECT count(*)::int FROM retained_verified_admissions WHERE service_slug='max' AND country_code='US') AS receipt_count`);
 return result.rows[0];
}
const policy={kind:'SYNTHETIC_TEST_ONLY',revision:'test-policy-1',maxSourceAgeMs:7*24*60*60*1000};
const keys=generateKeyPairSync('ed25519');
const operatorId=randomUUID();
async function request(fixture,options={}){
 const evidence=loadRetainedVerifiedEvidence(fixture.selector);
 const dryRun=await preflightRetainedVerifiedV1({evidence,snapshot:snapshotVerifiedTargetV1,atVersion:currentParserTruthVersion()});
 const approval={nonce:randomUUID(),operatorId,digest:dryRun.digest,jobId:dryRun.jobId,
   service:dryRun.service,market:dryRun.market,attemptId:dryRun.attemptId,bodyHash:dryRun.bodyHash,
   policyRevision:policy.revision,maxSourceAgeMs:policy.maxSourceAgeMs};
 const signature=sign(null,approvalMessageV1(approval),keys.privateKey).toString('base64url');
 return {database:pool,runsRoot:fixture.selector.runsRoot,dryRun,approval,signature,
   publicKey:keys.publicKey,authorizeAdministrator:async id=>id===operatorId,
   syntheticPolicy:policy,...options};
}

test('isolated V1 admission is atomic, source-bound, idempotent and disabled in production',{skip:!enabled},async t=>{
 assert.equal(process.env.DATABASE_URL,databaseUrl);
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'retained-admission-test-'));
 t.after(async()=>{await reset();await pool.end();fs.rmSync(root,{recursive:true,force:true});});
 const fixture=retainedFixture(root);
 await t.test('three plans and history commit once with original acquisition time',async()=>{
  await reset();const input=await request(fixture);
  assert.equal(input.dryRun.offerings.length,3);
  assert.equal(input.dryRun.admissionEligible,false);
  await assert.rejects(commitRetainedVerifiedV1(input),/PRODUCTION_COMMIT_DISABLED/);
  const first=await admitRetainedVerifiedInDisposableDatabaseV1(input);
  assert.equal(first.status,'ADMITTED');
  assert.deepEqual(await counts(),{current_count:3,history_count:3,receipt_count:1});
  const rows=(await pool.query("SELECT verified_at,last_checked_at FROM verified_provider_prices WHERE service_slug='max' AND country_code='US'")).rows;
  assert(rows.every(row=>new Date(row.verified_at).toISOString()===input.dryRun.acquiredAt&&new Date(row.last_checked_at).toISOString()===input.dryRun.acquiredAt));
  assert.equal(new Date(first.receipt.source_acquired_at).toISOString(),input.dryRun.acquiredAt);
  assert(new Date(first.receipt.admitted_at).getTime()>Date.parse(input.dryRun.acquiredAt));
  const again=await admitRetainedVerifiedInDisposableDatabaseV1(input);
  assert.equal(again.status,'ALREADY_ADMITTED');
  assert.deepEqual(await counts(),{current_count:3,history_count:3,receipt_count:1});
  const conflictingApproval={...input.approval,nonce:randomUUID()};
  const conflicting={...input,approval:conflictingApproval,
    signature:sign(null,approvalMessageV1(conflictingApproval),keys.privateKey).toString('base64url')};
  await assert.rejects(admitRetainedVerifiedInDisposableDatabaseV1(conflicting),/CONFLICTING_REPLAY/);
 });
 await t.test('failure during the second plan rolls back every current, history and receipt row',async()=>{
  await reset();
  await pool.query(`CREATE FUNCTION retained_test_reject_standard() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN IF NEW.service_slug='max' AND NEW.country_code='US' AND NEW.plan_slug='standard'
    THEN RAISE EXCEPTION 'synthetic second plan failure'; END IF; RETURN NEW; END $$`);
  await pool.query(`CREATE TRIGGER retained_test_reject_standard BEFORE INSERT ON verified_provider_prices
    FOR EACH ROW EXECUTE FUNCTION retained_test_reject_standard()`);
  try{await assert.rejects(admitRetainedVerifiedInDisposableDatabaseV1(await request(fixture)),/synthetic second plan failure/);
    assert.deepEqual(await counts(),{current_count:0,history_count:0,receipt_count:0});}
  finally{await pool.query('DROP TRIGGER retained_test_reject_standard ON verified_provider_prices');
    await pool.query('DROP FUNCTION retained_test_reject_standard()');}
 });
 await t.test('failure while writing the durable receipt rolls back every plan',async()=>{
  await reset();
  await pool.query(`CREATE FUNCTION retained_test_reject_receipt() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN RAISE EXCEPTION 'synthetic receipt failure'; END $$`);
  await pool.query(`CREATE TRIGGER retained_test_reject_receipt BEFORE INSERT ON retained_verified_admissions
    FOR EACH ROW EXECUTE FUNCTION retained_test_reject_receipt()`);
  try{await assert.rejects(admitRetainedVerifiedInDisposableDatabaseV1(await request(fixture)),/synthetic receipt failure/);
    assert.deepEqual(await counts(),{current_count:0,history_count:0,receipt_count:0});}
  finally{await pool.query('DROP TRIGGER retained_test_reject_receipt ON retained_verified_admissions');
    await pool.query('DROP FUNCTION retained_test_reject_receipt()');}
 });
 await t.test('concurrent identical approval has one effect',async()=>{
  await reset();const input=await request(fixture);
  const results=await Promise.all([admitRetainedVerifiedInDisposableDatabaseV1(input),admitRetainedVerifiedInDisposableDatabaseV1(input)]);
  assert.deepEqual(results.map(row=>row.status).sort(),['ADMITTED','ALREADY_ADMITTED']);
  assert.deepEqual(await counts(),{current_count:3,history_count:3,receipt_count:1});
 });
 await t.test('concurrent conflicting approvals cannot add another series',async()=>{
  await reset();const a=await request(fixture),b=await request(fixture);
  const results=await Promise.allSettled([admitRetainedVerifiedInDisposableDatabaseV1(a),admitRetainedVerifiedInDisposableDatabaseV1(b)]);
  assert.equal(results.filter(row=>row.status==='fulfilled').length,1);
  assert.match(results.find(row=>row.status==='rejected').reason.message,/CONFLICTING_REPLAY/);
  assert.deepEqual(await counts(),{current_count:3,history_count:3,receipt_count:1});
 });
 await t.test('changed revision or history after preflight fails closed',async()=>{
  await reset();const input=await request(fixture);
  await pool.query(`INSERT INTO verified_price_observations(service_slug,plan_slug,plan_name,billing_provider_slug,country_code,currency,
    monthly_price_minor,source,source_url,verification,source_count,verified_by_agreement,provider_verified_at)
    VALUES('max','prior','Prior','direct','US','USD',999,'v3-truth','https://provider.example/us',
    'authoritative-provider',1,false,clock_timestamp())`);
  await assert.rejects(admitRetainedVerifiedInDisposableDatabaseV1(input),/DATABASE_SNAPSHOT_CHANGED/);
  assert.deepEqual(await counts(),{current_count:0,history_count:1,receipt_count:0});
  await pool.query("DELETE FROM verified_price_observations WHERE service_slug='max' AND country_code='US'");
  await assert.rejects(admitRetainedVerifiedInDisposableDatabaseV1(input),/DATABASE_SNAPSHOT_CHANGED/);
  assert.deepEqual(await counts(),{current_count:0,history_count:0,receipt_count:0});
 });
 await t.test('invalid approval, disabled policy, source alteration and expired source fail closed',async()=>{
  await reset();const input=await request(fixture);
  await assert.rejects(admitRetainedVerifiedInDisposableDatabaseV1({...input,signature:'invalid'}),/APPROVAL_MISMATCH/);
  await assert.rejects(admitRetainedVerifiedInDisposableDatabaseV1({...input,dryRun:{...input.dryRun,digest:'0'.repeat(64)}}),/APPROVAL_MISMATCH/);
  await assert.rejects(admitRetainedVerifiedInDisposableDatabaseV1({...input,dryRun:{...input.dryRun,parserTruthVersion:'0'.repeat(64)}}),/PARSER_TRUTH_VERSION_CHANGED/);
  for(const changed of [{jobId:randomUUID()},{market:'DE'},{service:'netflix'},
    {attemptId:'other-attempt'},{bodyHash:'0'.repeat(64)}]){
   const approval={...input.approval,...changed};
   const signature=sign(null,approvalMessageV1(approval),keys.privateKey).toString('base64url');
   await assert.rejects(admitRetainedVerifiedInDisposableDatabaseV1({...input,approval,signature}),/APPROVAL_MISMATCH/);
  }
  await assert.rejects(admitRetainedVerifiedInDisposableDatabaseV1({...input,authorizeAdministrator:async()=>false}),/ADMIN_UNAUTHORIZED/);
  await assert.rejects(admitRetainedVerifiedInDisposableDatabaseV1({...input,syntheticPolicy:null}),/FRESHNESS_POLICY_UNAPPROVED/);
  await assert.rejects(admitRetainedVerifiedInDisposableDatabaseV1({...input,syntheticPolicy:{...policy,maxSourceAgeMs:1}}),/FRESHNESS_POLICY_UNAPPROVED/);
  const expiredPolicy={...policy,maxSourceAgeMs:1};
  const expiredApproval={...input.approval,maxSourceAgeMs:1};
  const expired={...input,approval:expiredApproval,syntheticPolicy:expiredPolicy,
    signature:sign(null,approvalMessageV1(expiredApproval),keys.privateKey).toString('base64url')};
  await assert.rejects(admitRetainedVerifiedInDisposableDatabaseV1(expired),/SOURCE_EXPIRED/);
  fs.appendFileSync(fixture.bodyFile,' ');
  try{await assert.rejects(admitRetainedVerifiedInDisposableDatabaseV1(input),/BODY_HASH_MISMATCH/);}
  finally{fs.writeFileSync(fixture.bodyFile,body);}
  fs.renameSync(fixture.journalFile,fixture.journalFile+'.missing');
  try{await assert.rejects(admitRetainedVerifiedInDisposableDatabaseV1(input));}
  finally{fs.renameSync(fixture.journalFile+'.missing',fixture.journalFile);}
  const originalCheck=fs.readFileSync(fixture.sourceCheckFile,'utf8');
  const wrong=JSON.parse(originalCheck);wrong.sourceChecks[0].receipt.geo.geoCountry='DE';
  fs.writeFileSync(fixture.sourceCheckFile,JSON.stringify(wrong));
  try{await assert.rejects(admitRetainedVerifiedInDisposableDatabaseV1(input),/COUNTRY_PROVIDER_RECEIPT_INVALID/);}
  finally{fs.writeFileSync(fixture.sourceCheckFile,originalCheck);}
  assert.deepEqual(await counts(),{current_count:0,history_count:0,receipt_count:0});
 });
});
