import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import os from 'node:os';
import {Operations,atomic} from './control.mjs';import {operationsRequest} from './http.mjs';import {priceResearchBatchStatus,recordJobPhase} from './job-status.mjs';import {executePriceResearchBatch} from './price-research-batch.mjs';import {diagnosticContext} from './diagnostics.mjs';
const id='2892caf1-8c46-6533-9b67-6b87f7e50465';
test('job status is authoritative, actor-owned and preparation requires live persisted evidence',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'job-status-')),ops=new Operations({root,repo:root,read:true,control:true});
 const job={id,status:'QUEUED',actor:'one',config:{services:['fixture']}};ops.transaction(db=>db.jobs.push(job));
 const url=new URL('https://offline.invalid/v1/admin/v2-operations/jobs/'+id),get=actor=>operationsRequest({method:'GET',url,actor},ops);
 assert.equal((await get('one')).phase,null);await assert.rejects(get('two'),/JOB_NOT_FOUND/);await assert.rejects(get(null),/UNAUTHORIZED/);
 const logs=[];t.mock.method(console,'error',line=>logs.push(JSON.parse(line)));recordJobPhase(ops.config,job,'PREPARATION_STARTED');assert.equal((await get('one')).phase,null);fs.writeFileSync(path.join(root,'control.lock'),String(process.pid));assert.equal((await get('one')).phase,'Preparing execution');fs.unlinkSync(path.join(root,'control.lock'));assert.equal((await get('one')).phase,null);
 recordJobPhase(ops.config,job,'PREPARATION_FAILED');assert.equal((await get('one')).phase,null);
 atomic(path.join(root,'runs',id,'execution-phase.json'),{jobId:id,event:'PREPARATION_STARTED',pid:99999999});assert.equal((await get('one')).phase,null);
 for(const status of ['RUNNING','COMPLETE','FAILED','STOPPED','INTERRUPTED','SKIPPED_CONFLICT','SKIPPED_NOT_DUE']){ops.transaction(db=>db.jobs[0].status=status);const r=await get('one');assert.equal(r.status,status);assert.equal(r.terminal,status!=='RUNNING');}
 assert.equal(logs[0].jobId,id);assert.equal(logs[0].eventType,'PREPARATION_STARTED');assert.equal(ops.db().jobs.length,1);
});
test('correlation accepts only purpose and opaque IDs, never tokens or arbitrary context',()=>{
 assert.deepEqual(diagnosticContext({purpose:'WORKER_PREPARE',jobId:id,token:'secret',path:'/private/evidence',operationId:'secret'}),{purpose:'WORKER_PREPARE',jobId:id});
 assert.deepEqual(diagnosticContext({purpose:'secret'}),{});
});

test('worker preparation remains QUEUED until claim/publication; observability adds no execution',async t=>{
 const {EventEmitter}=await import('node:events'),{syncBuiltinESMExports}=await import('node:module'),cp=(await import('node:child_process')).default;
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'observed-worker-')),config={root,repo:root,read:true,control:true,scheduling:false};
 const ops=new Operations(config),job={id,status:'QUEUED',actor:'one',origin:'ADMIN',config:{objective:'MATURE_LIFECYCLE'},sourceRun:null};ops.transaction(db=>db.jobs.push(job));fs.mkdirSync(path.join(root,'runs',id),{recursive:true});
 const values={V2_OPERATIONS_REPOSITORY_ROOT:root,V2_OPERATIONS_STATE_ROOT:root,ANALYTICS_V2_OPERATIONS_ENABLED:'true',ANALYTICS_V2_RUN_CONTROL_ENABLED:'true',ANALYTICS_V2_SCHEDULING_ENABLED:'false'},old=Object.fromEntries(Object.keys(values).map(k=>[k,process.env[k]]));Object.assign(process.env,values);t.after(()=>{for(const [k,v]of Object.entries(old))if(v===undefined)delete process.env[k];else process.env[k]=v;});
 t.mock.method(Operations.prototype,'index',()=>[]);let prepared=0,spawned=0;
 t.mock.method(Operations.prototype,'prepareQueued',function(_db,j){prepared++;assert.equal(j.status,'QUEUED');assert.equal(this.config.diagnosticContext.jobId,id);assert.equal(this.db().jobs[0].status,'QUEUED');return true;});
 const child=Object.assign(new EventEmitter(),{pid:process.pid,unref(){},kill(){throw Error('No real child should be killed');}});
 t.mock.method(cp,'spawn',()=>{spawned++;return child;});syncBuiltinESMExports();t.after(()=>{t.mock.restoreAll();syncBuiltinESMExports();});
 const logs=[];t.mock.method(console,'error',line=>logs.push(JSON.parse(line)));
 const {tick}=await import('./worker.mjs');await tick();assert.equal(prepared,1);assert.equal(spawned,1);assert.equal(ops.db().jobs[0].status,'RUNNING');assert(ops.db().jobs[0].startedAt);
 assert.deepEqual(logs.filter(e=>e.event==='V2_JOB_EXECUTION').map(e=>e.eventType),['PREPARATION_STARTED','PREPARATION_COMPLETED','CHILD_SPAWNED','RUNNING_PUBLISHED']);
});

test('execution integrity phase is authoritative and transitions without pretending research started',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'job-integrity-')),ops=new Operations({root,repo:root,read:true});const job={id,status:'RUNNING',pid:process.pid,actor:'one',config:{}};ops.transaction(db=>db.jobs.push(job));
 const get=()=>operationsRequest({method:'GET',url:new URL('https://offline.invalid/v1/admin/v2-operations/jobs/'+id),actor:'one'},ops);
 return (async()=>{recordJobPhase(ops.config,job,'AUTHORITATIVE_VALIDATION_STARTED');assert.equal((await get()).phase,'Validating execution integrity');recordJobPhase(ops.config,job,'AUTHORITATIVE_VALIDATION_COMPLETED');assert.equal((await get()).phase,'Lifecycle execution');})().finally(()=>fs.rmSync(root,{recursive:true,force:true}));
});

test('live GET does not reconstruct runs, take ownership or write operational state',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'read-only-status-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const ops=new Operations({root,repo:root,read:true,control:true});ops.transaction(db=>db.jobs.push({id,status:'RUNNING',actor:'one',config:{services:['fixture']}}));
 const before=fs.readFileSync(path.join(root,'state.json'));
 for(const method of ['transaction','index','prepareQueued'])t.mock.method(ops,method,()=>{throw Error('Status must not call '+method);});
 for(let i=0;i<3;i++)assert.equal((await operationsRequest({method:'GET',url:new URL('https://offline.invalid/v1/admin/v2-operations/jobs/'+id),actor:'one'},ops)).status,'RUNNING');
 assert.deepEqual(fs.readFileSync(path.join(root,'state.json')),before);assert.deepEqual(fs.readdirSync(root),['state.json']);
});

test('status projects bounded recorded failure and phase without reconstruction or mutation',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'failure-status-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const ops=new Operations({root,repo:root,read:true,control:true});ops.transaction(db=>db.jobs.push({id,status:'INTERRUPTED',actor:'one',error:'MATURE_EXECUTION_INTERRUPTED_CHECKPOINT_PRESERVED',startedAt:'2026-09-25T12:00:00Z',finishedAt:'2026-09-25T12:01:00Z'}));
 atomic(path.join(root,'runs',id,'execution-phase.json'),{jobId:id,event:'AUTHORITATIVE_VALIDATION_COMPLETED',at:'2026-09-25T12:00:10Z'});
 const before=fs.readFileSync(path.join(root,'state.json'));for(const method of ['transaction','index','prepareQueued'])t.mock.method(ops,method,()=>{throw Error('Read must not call '+method);});
 const value=await operationsRequest({method:'GET',url:new URL('https://offline.invalid/v1/admin/v2-operations/jobs/'+id),actor:'one'},ops);
 assert.equal(value.terminal,true);assert.equal(value.diagnostic.kind,'CAUSE');assert.equal(value.diagnostic.reason,'MATURE_EXECUTION_INTERRUPTED_CHECKPOINT_PRESERVED');assert.equal(value.diagnostic.lastPhase,'AUTHORITATIVE_VALIDATION_COMPLETED');assert.equal(value.finishedAt,'2026-09-25T12:01:00Z');assert.deepEqual(fs.readFileSync(path.join(root,'state.json')),before);
});

test('PRICE_RESEARCH job status represents the complete admitted scope and bounded child result summaries',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'price-job-status-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const source=[['alpha','Alpha','DE'],['beta','Beta','NO'],...Array.from({length:10},(_,index)=>[`service-${index}`,`Service ${index}`,'DE'])],targets=source.map(([serviceId,serviceName,targetMarket])=>({id:`price-research:${serviceId}:${targetMarket}`,serviceId,serviceName,targetMarket,marketApplicabilityEstablished:false})),config={objective:'PRICE_RESEARCH',targetKind:'CANONICAL_SELECTION',services:targets.map(row=>row.serviceId),markets:['DE','NO'],targetingRevision:'a'.repeat(64),batchTargets:targets,logicalTargetCount:targets.length,perTargetRequestCeiling:96,batchRequestCeiling:targets.length*96},ops=new Operations({root,repo:root,read:true,control:true});
 const plans=['gold','platinum','diamond'].map(name=>({planIdentity:`alpha:de:${name}`,suggested:[{provenance:'GOOGLE_AI_V4'},{provenance:'V3_SOURCE_RESEARCH'}],verified:[{provenance:'V3_VERIFIED',verificationEvidence:{eligibility:'ELIGIBLE',targetMarket:'DE',truthMarket:'DE'}}]}));
 const verificationEvidence={provider:'Alpha',serviceId:'alpha',targetMarket:'DE',plan:'Gold',amount:6.99,currency:'EUR',sourceUrl:'https://provider.example/fr/membership',sourceAuthority:'REVIEWED_PROVIDER',transport:'DECODO',acquisitionTransport:null,networkGeography:'DE',observationId:'provider-observation',bodySha256:'b'.repeat(64),truthMarket:'DE',eligibility:'ELIGIBLE',verification:'authoritative-provider',verifiedAt:'2026-10-15T12:00:00.000Z',verifiedByAgreement:false,propositionStates:{SERVICE_IDENTITY:'ESTABLISHED',PRICE_AMOUNT:'ESTABLISHED',CURRENCY:'ESTABLISHED',MONTHLY_SUBSCRIPTION:'ESTABLISHED',CONSUMER_SUBSCRIPTION:'ESTABLISHED',TARGET_MARKET:'ESTABLISHED'}};
 const researchResult={kind:'ADMIN_V4_FIRST_RESEARCH_RESULT',downstreamResult:{targets:{[targets[0].id]:{reads:[{}],queries:[{}],decisions:[{route:'DECODO',acquisitionReserved:true}],decodoVerification:{status:'ATTEMPTED'},renderingOutcomes:[{}]}},services:{alpha:{stop:{reason:'NO_EXECUTABLE_PROGRESS_RECONCILE'}}}},targets:[{target:{id:targets[0].id},googleRequests:2,strictGeminiRequests:1,simplifiedRecoveryRequests:1,recoveryReason:'STRICT_NORMALIZATION_FAILED',recoveryOutcome:'RECOVERY_CANDIDATES',combined:{kind:'CombinedResearchResult',resultClass:'VERIFIED',plans,suggested:[{provenance:'GOOGLE_AI_V4'},{provenance:'V3_SOURCE_RESEARCH'}]},verificationEvidence:[verificationEvidence],verificationRetry:{attempted:true,count:1,firstAttemptReason:'NO_EXECUTABLE_PROGRESS_RECONCILE',firstAttemptOutcome:'UNRESOLVED',firstAttemptUsage:{actions:4,reads:2,searches:1,acquisitions:1,retainedReviews:0,bytes:100},retryOutcome:'VERIFIED',retryReason:'VERIFIED',retryUsage:{actions:2,reads:1,searches:0,acquisitions:1,retainedReviews:0,bytes:50},verifiedAttempt:2},persisted:{suggestedPlans:6,verified:4},secret:'discard'}]};
 ops.transaction(db=>db.jobs.push({id,status:'RUNNING',actor:'one',config}));const dir=path.join(root,'runs',id);atomic(path.join(dir,'manifest.json'),{objective:'PRICE_RESEARCH',limits:{totalRequests:targets.length*96}});let calls=0;await assert.rejects(executePriceResearchBatch({job:{id,config},directory:dir,executeTarget:async()=>{calls++;if(calls===1)return researchResult;throw Error('TAVILY_CREDENTIAL_UNAVAILABLE');}}),/PRICE_RESEARCH_BATCH_CHILD_FAILED/);fs.appendFileSync(path.join(dir,'price-research-batch-progress.jsonl'),JSON.stringify({index:1,targetId:targets[1].id,status:'FAILED',failureCode:'TAVILY_CREDENTIAL_UNAVAILABLE',failureDetail:'must-not-leak arbitrary text'})+'\n');
 const value=await operationsRequest({method:'GET',url:new URL('https://offline.invalid/v1/admin/v2-operations/jobs/'+id),actor:'one'},ops);
 assert.equal(value.maximumRequests,1152);assert.equal(value.batchProgress.logicalTargetCount,12);assert.equal(value.batchProgress.outcomes.length,12);assert.equal(value.batchProgress.continuationCursor,null);const first=value.batchProgress.outcomes[0];assert.deepEqual({position:first.position,total:first.total,targetId:first.targetId,serviceId:first.serviceId,serviceName:first.serviceName,targetMarket:first.targetMarket,status:first.status,resultClass:first.resultClass,suggestedPlans:first.suggestedPlans,verified:first.verified,capabilityUsage:first.capabilityUsage,recoveryReason:first.recoveryReason,recoveryOutcome:first.recoveryOutcome,stopReason:first.stopReason,researchOutcome:first.researchOutcome,verificationEvidenceAvailable:first.verificationEvidenceAvailable},{position:1,total:12,targetId:targets[0].id,serviceId:'alpha',serviceName:'Alpha',targetMarket:'DE',status:'COMPLETE',resultClass:'VERIFIED',suggestedPlans:3,verified:3,capabilityUsage:{googleAiRequests:2,strictGeminiRequests:1,simplifiedRecoveryRequests:1,directAttempts:1,tavilyAttempts:1,decodoAttempts:1,browserAttempts:1},recoveryReason:'STRICT_NORMALIZATION_FAILED',recoveryOutcome:'RECOVERY_CANDIDATES',stopReason:undefined,researchOutcome:'VERIFIED',verificationEvidenceAvailable:true});assert.equal(typeof first.startedAt,'string');assert.equal(typeof first.finishedAt,'string');assert.equal(value.batchProgress.outcomes[1].status,'FAILED');assert.equal(value.batchProgress.outcomes[1].failureCode,'TAVILY_CREDENTIAL_UNAVAILABLE');assert.equal(value.batchProgress.outcomes.at(-1).status,'PENDING');assert.equal(JSON.stringify(value).includes('must-not-leak'),false);assert.equal(JSON.stringify(value).includes('secret'),false);assert.equal(JSON.stringify(value).includes('provider.example'),false,'compact job status must not inline evidence');
 assert.deepEqual(first.decodoVerification,{status:'ATTEMPTED'});
 const evidence=await operationsRequest({method:'GET',url:new URL('https://offline.invalid/v1/admin/v2-operations/jobs/'+id+'/price-research-targets/1/verification-evidence'),actor:'one'},ops);assert.deepEqual(evidence.target,{id:targets[0].id,serviceId:'alpha',serviceName:'Alpha',targetMarket:'DE'});assert.deepEqual(evidence.stages,{googleAiV4Suggested:1,v3SourceResearchSuggested:1,v3TruthVerified:1});assert.deepEqual(evidence.verificationEvidence,[verificationEvidence]);assert.equal(evidence.verificationRetry.attempted,true);assert.equal(evidence.verificationRetry.count,1);assert.equal(evidence.verificationRetry.firstAttemptReason,'NO_EXECUTABLE_PROGRESS_RECONCILE');assert.equal(evidence.verificationRetry.retryOutcome,'VERIFIED');assert.equal(evidence.verificationRetry.verifiedAttempt,2);assert.equal(JSON.stringify(value).includes('firstAttemptReason'),false,'normal status remains bounded');await assert.rejects(operationsRequest({method:'GET',url:new URL('https://offline.invalid/v1/admin/v2-operations/jobs/'+id+'/price-research-targets/1/verification-evidence'),actor:'two'},ops),/JOB_NOT_FOUND/);
 const childResult=path.join(dir,'price-research-targets','01-alpha-DE','result.json');researchResult.targets[0].combined.plans.push({planIdentity:'alpha:de:historical-suggested',suggested:[{provenance:'V3_SOURCE_RESEARCH'}],verified:[],activeSuggested:{plan:'Historical suggested tier'}});atomic(childResult,researchResult);assert.equal(priceResearchBatchStatus({status:'COMPLETE',config},dir).outcomes[0].stopReason,undefined,'a separate Suggested identity is retained as evidence but does not govern eligible Verified truth');researchResult.targets[0].combined.plans.pop();
 researchResult.targets[0].combined.resultClass='CONFLICT';atomic(childResult,researchResult);assert.equal(priceResearchBatchStatus({status:'COMPLETE',config},dir).outcomes[0].stopReason,'AUTHORITATIVE_CONFLICT');researchResult.targets[0].combined.resultClass='VERIFIED';
 researchResult.targets[0].verificationEvidence=[];atomic(childResult,researchResult);assert.equal(priceResearchBatchStatus({status:'COMPLETE',config},dir).outcomes[0].stopReason,'NO_EXECUTABLE_PROGRESS_RECONCILE','existing Verified without current eligible truth retains the unresolved research condition');
});

test('an exhausted V3 verification retry replaces the earlier no-progress stop diagnostic',async t=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'price-retry-status-'));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
 const target={id:'price-research:alpha:AU',serviceId:'alpha',serviceName:'Alpha',targetMarket:'AU',marketApplicabilityEstablished:false},config={objective:'PRICE_RESEARCH',targetKind:'CANONICAL_SELECTION',services:['alpha'],markets:['AU'],targetingRevision:'a'.repeat(64),batchTargets:[target],logicalTargetCount:1,perTargetRequestCeiling:96,batchRequestCeiling:96};
 await executePriceResearchBatch({job:{id:'fixture',config},directory,executeTarget:async()=>({kind:'ADMIN_V4_FIRST_RESEARCH_RESULT',downstreamResult:{services:{alpha:{stop:{reason:'NO_EXECUTABLE_PROGRESS_RECONCILE'}}}},targets:[{target:{id:target.id},combined:{kind:'CombinedResearchResult',resultClass:'SUGGESTED',plans:[{planIdentity:'alpha:au:gold',suggested:[{provenance:'GOOGLE_AI_V4'}],verified:[]}],operationalFailures:[{kind:'V3_VERIFICATION_RETRY_EXHAUSTED',reason:'NO_EXECUTABLE_PROGRESS_RECONCILE'}]},verificationRetry:{attempted:true,count:1,retryOutcome:'UNRESOLVED',retryReason:'NO_EXECUTABLE_PROGRESS_RECONCILE'},verificationEvidence:[]}]} )});
 const batch=priceResearchBatchStatus({status:'COMPLETE',config},directory),row=batch.outcomes[0];assert.equal(batch.researchMode,'standard');assert.equal(row.status,'COMPLETE');assert.equal(row.resultClass,'SUGGESTED');assert.equal(row.stopReason,'V3_VERIFICATION_RETRY_EXHAUSTED');assert.equal(row.researchOutcome,'SUGGESTED');assert.equal(row.verificationEvidenceAvailable,undefined);
});

test('Suggested Only status reports mode, zero new Verified, NO_RESULT and actual skipped capabilities',async t=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'suggested-status-'));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
 const target={id:'price-research:prime-video:NO',serviceId:'prime-video',serviceName:'Prime Video',targetMarket:'NO',marketApplicabilityEstablished:false};
 const config={objective:'PRICE_RESEARCH',targetKind:'CANONICAL_SELECTION',services:['prime-video'],markets:['NO'],targetingRevision:'a'.repeat(64),batchTargets:[target],logicalTargetCount:1,researchMode:'suggested_only',perTargetRequestCeiling:1,batchRequestCeiling:1,capabilities:{direct:false,tavily:false,decodo:false,browser:false,groq:false}};
 await executePriceResearchBatch({job:{id:'fixture',config},directory,executeTarget:async()=>({kind:'ADMIN_V4_FIRST_RESEARCH_RESULT',researchMode:'suggested_only',targets:[{target:{id:target.id},researchMode:'suggested_only',googleAttempts:[{status:'GOOGLE_AI_SUCCESS',requests:1,groundedCandidates:0,qualifyingSuggested:0}],combined:{kind:'CombinedResearchResult',resultClass:'NO_RESULT',plans:[],suggested:[],operationalFailures:[]},persisted:{suggestedPlans:0,verified:0},stopReason:'SUGGESTED_ONLY_BUDGET_EXHAUSTED',capabilityUsage:{googleAiRequests:1,strictGeminiRequests:1,simplifiedRecoveryRequests:0,directAttempts:0,tavilyAttempts:0,decodoAttempts:0,browserAttempts:0}}]})});
 const batch=priceResearchBatchStatus({status:'COMPLETE',config},directory),row=batch.outcomes[0];
 assert.equal(batch.researchMode,'suggested_only');assert.equal(row.resultClass,'NO_RESULT');assert.equal(row.researchOutcome,'NO_RESULT');assert.equal(row.verified,0);assert.equal(row.stopReason,'SUGGESTED_ONLY_BUDGET_EXHAUSTED');
 assert.deepEqual(row.capabilityUsage,{googleAiRequests:1,strictGeminiRequests:1,simplifiedRecoveryRequests:0,directAttempts:0,tavilyAttempts:0,decodoAttempts:0,browserAttempts:0});
 assert.deepEqual(row.googleAttempts,[{status:'GOOGLE_AI_SUCCESS',requestStatus:null,requests:1,detailsUnavailable:true}],'older final artifacts must not invent candidate counts');
});

test('Suggested Only status retains bounded rejection diagnostics without source URLs',async t=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'suggested-diagnostics-'));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
 const target={id:'price-research:prime-video:DK',serviceId:'prime-video',serviceName:'Prime Video',targetMarket:'DK',marketApplicabilityEstablished:false};
 const config={objective:'PRICE_RESEARCH',targetKind:'CANONICAL_SELECTION',services:['prime-video'],markets:['DK'],targetingRevision:'b'.repeat(64),batchTargets:[target],logicalTargetCount:1,researchMode:'suggested_only',perTargetRequestCeiling:2,batchRequestCeiling:2,capabilities:{direct:false,tavily:false,decodo:false,browser:false,groq:false}};
 const attempt={status:'GOOGLE_AI_SUCCESS',requestStatus:'STOP',requests:1,requestRuntimeMs:41000,wallRuntimeMs:41003,candidateCount:2,modelSourceCount:1,groundingCount:1,urlMatched:0,v4Suggested:0,normalizationRejected:0,qualifyingSuggested:0,rejected:{SOURCE_URL_NOT_GROUNDED:2},sourceHosts:['primevideo.com'],groundingHosts:['google.com'],sourceUrl:'https://example.com/private?token=secret'};
 const performance={targetRuntimeMs:42000,googleWallMs:41003,normalizationMs:3,persistenceMs:900,qualifyingVariants:0,duplicateVariants:0,conflictingVariants:1,followupReason:'DOCUMENTED_PRICE_GAP',secret:'token=secret'};
 await executePriceResearchBatch({job:{id:'fixture',config},directory,executeTarget:async()=>({kind:'ADMIN_V4_FIRST_RESEARCH_RESULT',researchMode:'suggested_only',targets:[{target:{id:target.id},researchMode:'suggested_only',googleAttempts:[attempt],performance,combined:{kind:'CombinedResearchResult',resultClass:'NO_RESULT',plans:[],suggested:[],operationalFailures:[]},persisted:{suggestedPlans:0,verified:0},capabilityUsage:{googleAiRequests:1}}]})});
 const row=priceResearchBatchStatus({status:'COMPLETE',config},directory).outcomes[0];
 assert.equal(row.googleAttempts[0].candidateCount,2);
 assert.equal(row.googleAttempts[0].rejected.SOURCE_URL_NOT_GROUNDED,2);
 assert.deepEqual(row.googleAttempts[0].sourceHosts,['primevideo.com']);
 assert.equal(row.googleAttempts[0].requestRuntimeMs,41000);
 assert.equal(row.suggestedPerformance.googleWallMs,41003);
 assert.equal(row.suggestedPerformance.followupReason,'DOCUMENTED_PRICE_GAP');
 assert.equal(JSON.stringify(row).includes('token=secret'),false);
});

test('Max-style retained Verified cannot become fresh Verified when V3 retry is exhausted',async t=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'old-verified-status-'));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
 const target={id:'price-research:max:NO',serviceId:'max',serviceName:'Max',targetMarket:'NO',marketApplicabilityEstablished:false},config={objective:'PRICE_RESEARCH',targetKind:'CANONICAL_SELECTION',services:['max'],markets:['NO'],targetingRevision:'a'.repeat(64),batchTargets:[target],logicalTargetCount:1,perTargetRequestCeiling:96,batchRequestCeiling:96};
 const plans=['basic','standard','premium'].map(name=>({planIdentity:'max:no:'+name,suggested:[{provenance:'GOOGLE_AI_V4'}],verified:[{provenance:'EXISTING_VERIFIED',source:'official-provider-adapter:max'}]}));
 await executePriceResearchBatch({job:{id:'fixture',config},directory,executeTarget:async()=>({kind:'ADMIN_V4_FIRST_RESEARCH_RESULT',downstreamResult:{services:{max:{stop:{reason:'NO_EXECUTABLE_PROGRESS_RECONCILE'}}}},targets:[{target:{id:target.id},combined:{kind:'CombinedResearchResult',resultClass:'VERIFIED',plans,operationalFailures:[{kind:'V3_VERIFICATION_RETRY_EXHAUSTED'}]},verificationRetry:{attempted:true,count:1,retryOutcome:'UNRESOLVED'},verificationEvidence:[],persisted:{verified:0}}]})});
 const row=priceResearchBatchStatus({status:'COMPLETE',config},directory).outcomes[0];
 assert.equal(row.verified,0);
 assert.equal(row.previouslyVerified,0);
 assert.equal(row.previouslyOldVerified,3);
 assert.equal(row.priorSourceUnclassified,0);
 assert.equal(row.researchOutcome,'SUGGESTED');
 assert.equal(row.resultClass,'SUGGESTED');
 assert.equal(row.stopReason,'V3_VERIFICATION_RETRY_EXHAUSTED');
});

test('archived existing evidence without a source is not mislabelled as current Verified',async t=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'unknown-source-status-'));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
 const target={id:'price-research:max:NO',serviceId:'max',serviceName:'Max',targetMarket:'NO',marketApplicabilityEstablished:false},config={objective:'PRICE_RESEARCH',targetKind:'CANONICAL_SELECTION',services:['max'],markets:['NO'],targetingRevision:'a'.repeat(64),batchTargets:[target],logicalTargetCount:1,perTargetRequestCeiling:96,batchRequestCeiling:96};
 await executePriceResearchBatch({job:{id:'fixture',config},directory,executeTarget:async()=>({kind:'ADMIN_V4_FIRST_RESEARCH_RESULT',targets:[{target:{id:target.id},combined:{kind:'CombinedResearchResult',resultClass:'VERIFIED',plans:[{planIdentity:'max:no:basic',suggested:[],verified:[{provenance:'EXISTING_VERIFIED'}]}]},verificationEvidence:[]}]})});
 const row=priceResearchBatchStatus({status:'COMPLETE',config},directory).outcomes[0];
 assert.equal(row.verified,0);assert.equal(row.previouslyVerified,0);
 assert.equal(row.previouslyOldVerified,0);assert.equal(row.priorSourceUnclassified,1);
});

test('persisted legacy count alone cannot claim new Verified when plan-bound V3 result is absent',async t=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'old-verified-legacy-status-'));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
 const target={id:'price-research:max:NO',serviceId:'max',serviceName:'Max',targetMarket:'NO',marketApplicabilityEstablished:false},config={objective:'PRICE_RESEARCH',targetKind:'CANONICAL_SELECTION',services:['max'],markets:['NO'],targetingRevision:'a'.repeat(64),batchTargets:[target],logicalTargetCount:1,perTargetRequestCeiling:96,batchRequestCeiling:96};
 await executePriceResearchBatch({job:{id:'fixture',config},directory,executeTarget:async()=>({kind:'ADMIN_V4_FIRST_RESEARCH_RESULT',downstreamResult:{services:{max:{stop:{reason:'NO_EXECUTABLE_PROGRESS_RECONCILE'}}}},targets:[{target:{id:target.id},persisted:{verified:3}}]})});
 const row=priceResearchBatchStatus({status:'COMPLETE',config},directory).outcomes[0];
 assert.equal(row.verified,undefined);
 assert.equal(row.previouslyVerified,undefined);
 assert.equal(row.researchOutcome,'UNRESOLVED');
});

test('PRICE_RESEARCH status projection preserves a synthetic scope above ten thousand targets',()=>{
 const targets=Array.from({length:11000},(_,index)=>{const serviceId=`future-${String(index).padStart(5,'0')}`;return {id:`price-research:${serviceId}:DE`,serviceId,serviceName:`Future ${index}`,targetMarket:'DE',marketApplicabilityEstablished:false};}),config={objective:'PRICE_RESEARCH',targetKind:'CANONICAL_SELECTION',services:targets.map(row=>row.serviceId),markets:['DE'],targetingRevision:'a'.repeat(64),batchTargets:targets,logicalTargetCount:targets.length,perTargetRequestCeiling:96,batchRequestCeiling:targets.length*96};
 const value=priceResearchBatchStatus({status:'QUEUED',config},path.join(os.tmpdir(),'missing-price-research-status-fixture'));assert.equal(value.logicalTargetCount,11000);assert.equal(value.admittedTargetCount,11000);assert.equal(value.serviceCount,11000);assert.equal(value.outcomes.length,0);assert.equal(value.outcomesTruncated,true);assert.deepEqual(value.progressCounts,{pending:11000,running:0,complete:0,failed:0,stopped:0});assert.equal(value.batchRequestCeiling,11000*96);assert.equal(value.continuationCursor,null);
});

test('persistent resumable job listing is actor scoped, paginated and artifact independent',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'job-list-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));const ops=new Operations({root,repo:root,read:true,control:true});
 const statuses=['INTERRUPTED','STOPPED','FAILED','COMPLETE','RUNNING','QUEUED','SKIPPED_CONFLICT'];ops.transaction(db=>{statuses.forEach((status,i)=>db.jobs.push({id:String(i),status,actor:'one'}));db.jobs.push({id:'private',status:'INTERRUPTED',actor:'two'});});
 const before=fs.readFileSync(root+'/state.json');ops.index=()=>{throw Error('NO_ARTIFACT_RECONSTRUCTION');};
 const get=(actor='one',query='resumable=true&limit=2')=>operationsRequest({method:'GET',url:new URL('https://offline.invalid/v1/admin/v2-operations/jobs?'+query),actor},ops);
 for(let i=0;i<3;i++){const first=await get();assert.equal(first.total,3);assert.equal(first.rows.length,2);assert(first.rows.every(r=>r.resumeAllowed));assert.equal((await get('one','resumable=true&limit=2&offset=2')).rows.length,1);}
 assert.equal((await get('two')).rows[0].id,'private');await assert.rejects(get(null),/UNAUTHORIZED/);assert.deepEqual(fs.readFileSync(root+'/state.json'),before);
});


test('dismissing one resumable job is durable, actor-owned, idempotent and preserves history artifacts',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'dismiss-resumable-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));const config={root,repo:root,read:true,control:true,scheduling:false},ops=new Operations(config),first='11111111-1111-1111-1111-111111111111',second='22222222-2222-2222-2222-222222222222',running='33333333-3333-3333-3333-333333333333';
 const jobs=[{id:first,status:'INTERRUPTED',actor:'one',origin:'ADMIN',createdAt:'2026-10-15T10:00:00Z',config:{objective:'PRICE_RESEARCH'},error:'WORKER_PROCESS_EXITED_CHECKPOINT_PRESERVED'},{id:second,status:'STOPPED',actor:'one',origin:'ADMIN',createdAt:'2026-10-15T09:00:00Z',config:{objective:'PRICE_RESEARCH'}}];
 ops.transaction(db=>db.jobs.push(...jobs));
 for(const job of jobs){const dir=path.join(root,'runs',job.id);atomic(path.join(dir,'operation.json'),job);atomic(path.join(dir,'manifest.json'),{objective:'PRICE_RESEARCH',createdAt:job.createdAt,limits:{totalRequests:96}});atomic(path.join(dir,'checkpoint.json'),{jobId:job.id,turn:7});atomic(path.join(dir,'research-artifact.json'),{jobId:job.id,evidence:'retained'});}
 const list=(instance=ops,query='resumable=true')=>operationsRequest({method:'GET',url:new URL('https://offline.invalid/v1/admin/v2-operations/jobs?'+query),actor:'one'},instance);
 const dismiss=(instance=ops,id=first,actor='one')=>operationsRequest({method:'POST',url:new URL('https://offline.invalid/v1/admin/v2-operations/jobs/'+id+'/dismiss-resumable'),body:{},actor},instance);
 assert.deepEqual((await list()).rows.map(row=>row.id).sort(),[first,second]);
 const checkpoint=fs.readFileSync(path.join(root,'runs',first,'checkpoint.json')),artifact=fs.readFileSync(path.join(root,'runs',first,'research-artifact.json')),dismissed=await dismiss();
 assert.equal(dismissed.id,first);assert.equal(dismissed.resumeAllowed,false);assert.equal(typeof dismissed.resumableDismissedAt,'string');assert.deepEqual((await list()).rows.map(row=>row.id),[second]);
 const restarted=new Operations(config);assert.deepEqual((await list(restarted)).rows.map(row=>row.id),[second]);
 const all=await list(restarted,'limit=50');assert.equal(all.total,2);assert.deepEqual(new Set(all.rows.map(row=>row.id)),new Set([first,second]));assert.equal(all.rows.find(row=>row.id===first).resumeAllowed,false);assert.equal((await operationsRequest({method:'GET',url:new URL('https://offline.invalid/v1/admin/v2-operations/jobs/'+first),actor:'one'},restarted)).status,'INTERRUPTED');const history=await operationsRequest({method:'GET',url:new URL('https://offline.invalid/v1/admin/v2-operations/runs?limit=50'),actor:'one'},restarted);assert(history.rows.some(run=>run.jobId===first&&run.status==='INTERRUPTED'));
 assert.deepEqual(fs.readFileSync(path.join(root,'runs',first,'checkpoint.json')),checkpoint);assert.deepEqual(fs.readFileSync(path.join(root,'runs',first,'research-artifact.json')),artifact);assert.equal(fs.existsSync(path.join(root,'runs',first,'operation.json')),true);assert.equal(restarted.db().jobs.length,2);
 const repeated=await dismiss(restarted);assert.equal(repeated.resumableDismissedAt,dismissed.resumableDismissedAt);assert.equal(restarted.db().events.filter(event=>event.type==='RESUMABLE_DISMISSED'&&event.jobId===first).length,1);
 await assert.rejects(dismiss(restarted,second,'two'),/OWNED_RUN_NOT_FOUND/);const resumed=restarted.control(second,'resume','one');assert.equal(resumed.status,'QUEUED');assert.equal(restarted.db().events.filter(event=>event.type==='RESUME_REQUESTED'&&event.jobId===second).length,1);await assert.rejects(dismiss(restarted,second),/RUN_NOT_RESUMABLE/);
 restarted.transaction(db=>db.jobs.push({id:running,status:'RUNNING',actor:'one'}));await assert.rejects(dismiss(restarted,running),/RUN_NOT_RESUMABLE/);
});
