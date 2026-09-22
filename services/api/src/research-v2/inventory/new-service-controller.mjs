// Durable service/stage orchestration only. Network and evidence remain in V2 adapters.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {atomic} from './expansion-campaign.mjs';
export const stages=['IDENTITY_SUBSCRIPTION','MARKETS','LOGIN','MANAGEMENT','CANCELLATION','PRICING','VALIDATION'];
export const bounds=Object.freeze({searchesPerService:5,readsPerService:8,requestsPerService:40,requestsPerRead:4,maxBytes:2097152});
export const approvedIdsHash='e49d6659153c51609f2ad699928e1ed8a74e79283fa09c8c4decf4cb286aa485';
export const baselineIdsHash='ef804375ffd67e37ea83752f088dad327bdb4cf83994476289a76dc9afdadaf5';
export const manifestPath='docs/catalog/global-47/research-v2/v15-discovery-20260921/manifest.json';
export const runDirectory='.savlivo/research-v2/universe-expansion/runs/v15-new-services-full-v2-20260921';
export const digest=x=>createHash('sha256').update(typeof x==='string'||Buffer.isBuffer(x)?x:JSON.stringify(x)).digest('hex');
export const json=p=>JSON.parse(fs.readFileSync(p,'utf8'));
export function inside(root,relative){const base=fs.realpathSync(root),file=path.resolve(base,relative);if(!file.startsWith(base+path.sep)||!fs.realpathSync(file).startsWith(base+path.sep))throw Error('MANIFEST_PATH_ESCAPE');return file;}
export function validateSelection(manifest,candidates,baseline) {
 const ids=manifest.serviceIds,old=baseline.map(b=>b.service).sort();
 if(!Array.isArray(ids)||ids.length!==188||manifest.expectedServices!==188||new Set(ids).size!==188)throw Error('COHORT_COUNT_OR_DUPLICATE');
 if(digest(ids)!==approvedIdsHash||digest(old)!==baselineIdsHash||old.length!==275)throw Error('APPROVED_COHORT_OR_BASELINE_CHANGED');
 if(ids.some(id=>old.includes(id)))throw Error('BASELINE_INCLUDED');
 const sorted=[...candidates].sort((a,b)=>a.slug.localeCompare(b.slug));
 if(digest(sorted.map(c=>c.slug))!==approvedIdsHash)throw Error('CANDIDATE_SCOPE_CHANGED');
 const owners=new Map(),norm=s=>s.normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');
 for(const c of sorted) {
  if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(c.slug)||typeof c.name!=='string'||!c.name.trim())throw Error('INVALID_CANDIDATE');
  for(const s of [c.slug,c.name,...c.aliases??[]]){const k=norm(s);if(owners.has(k)&&owners.get(k)!==c.slug)throw Error('ALIAS_COLLISION');owners.set(k,c.slug);}
 }
 return sorted;
}
export function loadCohort(root=process.cwd()) {
 const file=path.join(root,manifestPath),manifest=json(file),base=path.dirname(file);
 if(manifest.status!=='READY_FOR_FULL_V2_CONTROLLER'||manifest.controller?.version!==1||manifest.liveExecutable!==true)throw Error('MANIFEST_CONTROLLER_NOT_READY');
 for(const [p,h]of Object.entries(manifest.inputHashes??{}))if(digest(fs.readFileSync(inside(root,p)))!==h)throw Error('MANIFEST_INPUT_CHANGED');
 for(const [p,h]of Object.entries(manifest.outputHashes??{}))if(digest(fs.readFileSync(inside(base,p)))!==h)throw Error('MANIFEST_OUTPUT_CHANGED');
 if(!Object.keys(manifest.inputHashes??{}).length||!Object.keys(manifest.outputHashes??{}).length)throw Error('UNBOUND_MANIFEST');
 const u=json(path.join(base,'expanded-service-universe.json'));
 const candidates=validateSelection(manifest,[...u.new_include,...u.research],u.existing);
 const engineFiles=['services/api/src/research-v2/inventory/new-service-controller.mjs','services/api/src/research-v2/live/new-service-runtime.mjs','services/api/src/research-v2/live/new-service-analysis-worker.mjs'];
 const engineHashes=Object.fromEntries(engineFiles.map(f=>[f,digest(fs.readFileSync(path.join(root,f)))]));
 return {manifest,candidates,engineHashes,fingerprint:digest({ids:manifest.serviceIds,candidates,stages,bounds,engineHashes,version:1})};
}
export function ensureOutput(root=process.cwd()) {
 const output=path.resolve(root,runDirectory),relative=path.relative(root,output);let cursor=path.resolve(root);
 for(const part of relative.split(path.sep)){cursor=path.join(cursor,part);if(fs.existsSync(cursor)&&fs.lstatSync(cursor).isSymbolicLink())throw Error('SYMLINK_OUTPUT_REJECTED');}
 fs.mkdirSync(output,{recursive:true});const probe=path.join(output,'.write-check-'+process.pid);const fd=fs.openSync(probe,'wx',0o600);fs.closeSync(fd);fs.unlinkSync(probe);return output;
}
export function validateCheckpoint(directory,cohort) {
 const file=directory+'/checkpoint.json';if(!fs.existsSync(file))return;
 const state=json(file);
 if(state.fingerprint!==cohort.fingerprint)throw Error('RESUME_INPUT_CHANGED');
 if(digest(Object.keys(state.services??{}))!==approvedIdsHash)throw Error('CHECKPOINT_SCOPE_CHANGED');
 for(const field of ['requests','searches','reads']) {
  const limit={requests:bounds.requestsPerService,searches:bounds.searchesPerService,reads:bounds.readsPerService}[field];
  const values=Object.values(state.services).map(s=>s[field]);
  if(values.some(n=>!Number.isSafeInteger(n)||n<0||n>limit)||values.reduce((a,b)=>a+b,0)!==state[field])throw Error('CHECKPOINT_BUDGET_CORRUPT');
 }
 if(fs.existsSync(directory+'/run-manifest.json')&&json(directory+'/run-manifest.json').fingerprint!==cohort.fingerprint)throw Error('RESUME_MANIFEST_CHANGED');
 const ledger=directory+'/network.jsonl';if(fs.existsSync(ledger)){const raw=fs.readFileSync(ledger,'utf8');if(raw&&!raw.endsWith('\n'))throw Error('CHECKPOINT_LEDGER_INCOMPLETE');const rows=raw.trim()?raw.trim().split('\n').map(JSON.parse):[];if(rows.length>state.requests||rows.some(r=>!state.services[r.service]))throw Error('CHECKPOINT_LEDGER_CORRUPT');}
}
export function report(state,directory) {
 const counts=Object.fromEntries(['PENDING','RUNNING','COMPLETED','PARTIAL','UNRESOLVED','FAILED'].map(s=>[s,0]));
 for(const s of Object.values(state.services))counts[s.status]++;
 const summary={cohort:188,attempted:Object.values(state.services).filter(s=>Object.keys(s.stages).length).length,...counts,
   networkRequests:state.requests,searches:state.searches,reads:state.reads,stages,
   executionComplete:counts.PENDING+counts.RUNNING===0,researchComplete:counts.COMPLETED===188,
   productionPromoted:false,userPriceAuthoritative:true,priceRequiredForCatalogEligibility:false,
   decodo:0,browser:0,serviceResults:Object.values(state.services).map(s=>({service:s.id,status:s.status,stages:s.stages}))};
 atomic(directory+'/summary.json',summary);
 fs.writeFileSync(directory+'/report.md','# New-service full V2 run\n\n'+Object.entries(summary).filter(([,v])=>typeof v!=='object').map(([k,v])=>`- ${k}: ${v}`).join('\n')+'\n\nStage completion is not evidence verification. Unproven identity, authority, markets and channels remain unresolved/review-required. See services/<id>/result.json and acquired page/operation artifacts. No production promotion or user-price replacement.\n');return summary;
}
export class SafeStop extends Error {constructor(){super('SAFE_STOP');}}
export class Operations {
 constructor({state,directory,save,shouldStop}){Object.assign(this,{state,directory,save,shouldStop});}
 charge(service,kind,metadata={}) {
  const s=this.state.services[service];if(s.requests>=bounds.requestsPerService||this.state.requests>=188*bounds.requestsPerService)throw Error('NETWORK_BOUND');
  s.requests++;this.state.requests++;this.save();
  const fd=fs.openSync(this.directory+'/network.jsonl','a',0o600);try{fs.writeSync(fd,JSON.stringify({time:new Date().toISOString(),service,kind,...metadata})+'\n');fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
 }
 async execute(service,kind,key,fn) {
  if(this.shouldStop())throw new SafeStop();
  const s=this.state.services[service],id=digest([kind,key]),dir=this.directory+'/services/'+service+'/operations';fs.mkdirSync(dir,{recursive:true});
  const file=dir+'/'+id+'.json';
  if(fs.existsSync(file)) {const old=json(file);if(old.status==='COMPLETE')return old.result;if(old.status==='FAILED')throw Error(old.code);return {failure:{code:'INTERRUPTED_DISPATCH_NOT_RETRIED'},outcome:'UNRESOLVED'};}
  const field=kind==='SEARCH'?'searches':kind==='READ'?'reads':null;
  if(field){const ceiling=kind==='SEARCH'?bounds.searchesPerService:bounds.readsPerService;if(s[field]>=ceiling)return {outcome:'UNRESOLVED',failure:{code:kind+'_BOUND'}};s[field]++;this.state[field]++;this.save();}
  atomic(file,{kind,key,status:'DISPATCHED',at:new Date().toISOString()});
  try{const result=await fn();atomic(file,{kind,key,status:'COMPLETE',result});return result;}
  catch(e){if(e instanceof SafeStop)throw e;atomic(file,{kind,key,status:'FAILED',code:'OPERATION_FAILED'});throw Error('OPERATION_FAILED');}
 }
}
export async function runController({cohort,directory,adapter,shouldStop=()=>false,onProgress=()=>{}}) {
 fs.mkdirSync(directory,{recursive:true});const lock=directory+'/controller.lock';
 if(fs.existsSync(lock)){const pid=Number(fs.readFileSync(lock));if(!Number.isInteger(pid)||pid<1)throw Error('INVALID_LOCK');try{process.kill(pid,0);throw Error('CONTROLLER_ACTIVE');}catch(e){if(e.code!=='ESRCH')throw e;}fs.unlinkSync(lock);}
 fs.writeFileSync(lock,String(process.pid),{flag:'wx',mode:0o600});
 try {
  validateCheckpoint(directory,cohort);
  const file=directory+'/checkpoint.json';const state=fs.existsSync(file)?json(file):{version:1,fingerprint:cohort.fingerprint,requests:0,searches:0,reads:0,services:Object.fromEntries(cohort.candidates.map(c=>[c.slug,{id:c.slug,status:'PENDING',requests:0,searches:0,reads:0,stages:{}}]))};
  if(state.fingerprint!==cohort.fingerprint)throw Error('RESUME_INPUT_CHANGED');
  if(Object.keys(state.services).length!==188||digest(Object.keys(state.services))!==approvedIdsHash)throw Error('CHECKPOINT_SCOPE_CHANGED');
  const save=()=>{state.updatedAt=new Date().toISOString();atomic(file,state);};save();
  const operations=new Operations({state,directory,save,shouldStop});
  if(!fs.existsSync(directory+'/run-manifest.json'))atomic(directory+'/run-manifest.json',{version:1,cohort:cohort.manifest.serviceIds,fingerprint:cohort.fingerprint,engineHashes:cohort.engineHashes,stages,bounds,totalRequestCeiling:188*bounds.requestsPerService,startedAt:new Date().toISOString(),origin:'CLI',production:false,decodo:false,browser:false});
  // Stage-major scheduling gives every service breadth before follow-up depth.
  for(const stage of stages)for(const candidate of cohort.candidates) {
   const s=state.services[candidate.slug];if(s.stages[stage])continue;if(shouldStop())throw new SafeStop();
   s.status='RUNNING';s.currentStage=stage;save();
   const dir=directory+'/services/'+candidate.slug;fs.mkdirSync(dir,{recursive:true});const resultFile=dir+'/'+stage+'.json';
   try {
    const result=fs.existsSync(resultFile)?json(resultFile):await adapter.stage({stage,candidate,directory:dir,prior:s.stages,operations});
    if(!result||!['COMPLETE','PARTIAL','UNRESOLVED','FAILED','REVIEW_REQUIRED'].includes(result.status))throw Error('INVALID_STAGE_RESULT');
    atomic(resultFile,result);
    const large=new Set(['proofs','facts','sourceAssertions','observations','analysis','marketAnalysis','journeys','results','decisions','markets','researchFailures','verified']);
    s.stages[stage]={...Object.fromEntries(Object.entries(result).filter(([k])=>!large.has(k))),artifact:'services/'+candidate.slug+'/'+stage+'.json'};
   } catch(e) {if(e instanceof SafeStop)throw e;const result={status:'FAILED',reason:'STAGE_EXECUTION_FAILED',detail:'See retained operation artifacts; secrets and raw exception text are not logged.'};atomic(resultFile,result);s.stages[stage]=result;}
   delete s.currentStage;
   if(stage==='VALIDATION') {
    const outcomes=Object.values(s.stages);s.status=outcomes.some(r=>r.status==='FAILED')||s.stages.VALIDATION.researchFailed===true?'FAILED':s.stages.VALIDATION.researchComplete===true?'COMPLETED':outcomes.some(r=>r.established===true)?'PARTIAL':'UNRESOLVED';
    atomic(dir+'/result.json',{service:s.id,status:s.status,stages:s.stages,requests:s.requests,productionPromoted:false});
   }
   save();report(state,directory);onProgress({service:s.id,stage,status:s.stages[stage].status,requests:state.requests});
  }
  return report(state,directory);
 } catch(e) {if(e instanceof SafeStop){const state=json(directory+'/checkpoint.json');report(state,directory);return {stopped:true,resumeSameCommand:true};}throw e;}
 finally {fs.unlinkSync(lock);}
}
