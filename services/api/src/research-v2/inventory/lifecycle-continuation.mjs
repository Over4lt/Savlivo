import {finalizedBoundary} from '../storage/finalize.mjs';
// Continuation inventory/projection helpers for the existing mature executor.
// No transport, authority inference, verifier or alternative scheduler lives here.
import fs from 'node:fs';import path from 'node:path';
import {digest,json} from './new-service-controller.mjs';
import {createResearchMemory,combineResearchMemory} from '../live/research-memory.mjs';
import {atomic} from './expansion-campaign.mjs';
const hashFile=f=>digest(fs.readFileSync(f));
export function assertLifecycleCohort(ids,baseline){
 if(!ids.length||new Set(ids).size!==ids.length||ids.some(id=>baseline.includes(id)))throw Error('LIFECYCLE_COHORT_SCOPE');
}
function filesUnder(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isSymbolicLink()?(()=>{throw Error('LIFECYCLE_SYMLINK');})():e.isDirectory()?filesUnder(path.join(dir,e.name)):e.isFile()?[path.join(dir,e.name)]:[]);}
export function validateLifecycleSnapshot(snapshot){
 const {snapshotHash,...payload}=snapshot;if(snapshotHash!==digest(payload))throw Error('LIFECYCLE_SNAPSHOT_CHANGED');
 for(const [f,hash]of Object.entries(snapshot.inputHashes)){if(!fs.realpathSync(f).startsWith(process.cwd()+path.sep)||hashFile(f)!==hash)throw Error('LIFECYCLE_IMMUTABLE_INPUT_CHANGED');}
 return snapshot;
}
export function snapshotLifecycle({handoff,researchMarkets,runsRoot,baselineIds=[],legacyDirectory=null,quarantine=[],codeHash,genesis=null}){
 const ids=handoff.cohort.manifest.serviceIds;assertLifecycleCohort(ids,baselineIds);
 if(genesis&&(genesis.genesis.lifecycle.executionRoot!==runsRoot||digest(genesis.source.cohort)!==digest(ids)))throw Error('LIFECYCLE_GENESIS_SCOPE');
 const key=digest({ids,review:handoff.document,researchMarkets,input:handoff.inputHashes,codeHash,...(genesis?{genesis:genesis.genesis.genesisHash}:{})}),control=path.join(runsRoot,'lifecycle-control-'+digest(ids).slice(0,16)),file=control+'/'+key+'.json';
 if(fs.existsSync(file))return validateLifecycleSnapshot(json(file));
 const parents=[],inputHashes={...handoff.inputHashes},states=genesis?structuredClone(genesis.source.states):{},sources=genesis?structuredClone(genesis.source.sources):{};
 if(genesis)for(const e of genesis.genesis.protectedReferences.entries)inputHashes[e.path]=e.sha256;
 const addSource=(service,directory,pages)=>{if(!ids.includes(service))throw Error('LIFECYCLE_SOURCE_SCOPE');sources[service]??=[];for(const page of pages){const body=page.bodyFile?path.join(directory,page.bodyFile):null;if(body){if(!/^bodies\/[a-f0-9]{64}\.txt$/.test(page.bodyFile)||hashFile(body)!==page.bodyHash)throw Error('LIFECYCLE_BODY_HASH');inputHashes[body]=hashFile(body);}sources[service].push({directory,page});}};
 const dirs=fs.existsSync(runsRoot)?fs.readdirSync(runsRoot).map(n=>path.join(runsRoot,n)).filter(d=>fs.existsSync(d+'/lineage.json')&&fs.existsSync(d+'/summary.json')).sort((a,b)=>fs.statSync(a+'/summary.json').mtimeMs-fs.statSync(b+'/summary.json').mtimeMs||a.localeCompare(b)):[];
 for(const d of dirs){const lineage=json(d+'/lineage.json');if(digest(lineage.cohort)!==digest(ids))continue;
  const summary=json(d+'/summary.json'),ledger=d+'/network.jsonl',events=fs.existsSync(ledger)?fs.readFileSync(ledger,'utf8').trim().split('\n').filter(Boolean).map(JSON.parse):[];
  if(!summary.executionComplete||events.length!==summary.additionalRequests||events.some(e=>!ids.includes(e.service)))throw Error('LIFECYCLE_PARENT_NOT_RECONCILED');
  parents.push({directory:d,requests:events.length,fingerprint:lineage.fingerprint});
  const boundary=finalizedBoundary(process.cwd(),d);
  if(boundary){if(digest(boundary.receipt.cohort)!==digest(ids)||boundary.receipt.runId!==d)throw Error('LIFECYCLE_FINALIZED_SCOPE');if(filesUnder(d).some(f=>f.endsWith('.lock')))throw Error('LIFECYCLE_PARENT_LOCK');inputHashes[boundary.file]=hashFile(boundary.file);}
  for(const f of (boundary?boundary.receipt.entries.map(e=>e.path):filesUnder(d))){if(f.endsWith('.lock')){const pid=Number(fs.readFileSync(f,'utf8'));if(!Number.isInteger(pid)||pid<1)throw Error('LIFECYCLE_PARENT_LOCK');try{process.kill(pid,0);throw Error('LIFECYCLE_PARENT_ACTIVE');}catch(e){if(e.code!=='ESRCH')throw e;}}const actual=hashFile(f);if(boundary&&actual!==boundary.receipt.entries.find(e=>e.path===f)?.sha256)throw Error('LIFECYCLE_FINALIZED_INPUT_CHANGED');inputHashes[f]=actual;}
  for(const phase of ['catalog','pricing']){const f=d+'/'+phase+'/adaptive-state.json';if(!fs.existsSync(f))continue;const state=json(f);if(state.pending)throw Error('LIFECYCLE_PARENT_PENDING');for(const t of Object.values(state.targets)){if(!ids.includes(t.service))throw Error('LIFECYCLE_TARGET_SCOPE');states[t.id]={target:t,reference:{path:f,hash:inputHashes[f]}};}}
  for(const f of Object.keys(inputHashes).filter(f=>f.startsWith(d+'/')&&f.endsWith('/pages.json'))){const service=ids.find(id=>f.includes('/bootstrap/'+id+'/')||f.includes('/services/'+id+'/')||f.includes('/replay/'+id+'-'));if(service&&Array.isArray(json(f)))addSource(service,path.dirname(f),json(f));}
  for(const f of Object.keys(inputHashes).filter(f=>f.startsWith(d+'/')&&f.endsWith('/open-web-discovery/state.json'))){const state=json(f);for(const t of state.targets??[])addSource(t.service,path.dirname(f),t.reads??[]);}
 }
 if(legacyDirectory){for(const id of ids){const dir=legacyDirectory+'/services/'+id,f=dir+'/pages.json';if(fs.existsSync(f)){inputHashes[f]=hashFile(f);addSource(id,dir,json(f));}}}
 const snapshot={version:1,key,cohort:ids,parents,states,sources,inputHashes,quarantine,codeHash,historicalRequests:handoff.summary.historicalRequests??0,parentRequests:(genesis?.genesis.accounting.parentRequests??0)+parents.reduce((n,p)=>n+p.requests,0),...(genesis?{productionGenesisHash:genesis.genesis.genesisHash}: {})};
 snapshot.snapshotHash=digest(snapshot);fs.mkdirSync(control,{recursive:true});atomic(file,snapshot);return snapshot;
}
export function lifecycleSeed(target,snapshot){
 const entry=snapshot.states[target.id];if(!entry)return structuredClone(target);
 const old=entry.target;if(digest(old.authorities)!==digest(target.authorities))return structuredClone(target);
 const t=structuredClone(old);if(target.capabilities)t.capabilities=target.capabilities;t.researchMemory=combineResearchMemory(t,[t.researchMemory,createResearchMemory(t,entry.reference)].filter(Boolean));
 t.priorUsage={reads:t.reads?.length??0,searches:t.queries?.length??0,reference:entry.reference};
 for(const field of ['reads','queries','decisions','retainedReviews'])t[field]=[];
 for(const field of ['done','executionBlocked','historicalSchedulerTerminal','researchPlan'])delete t[field];
 return t;
}
export function evaluateProviderCandidate({service,page,targets}){
 const target=targets.find(t=>t.service===service),host=page?.url?new URL(page.url).hostname:null;
 const authority=target?.authorities.find(a=>a.hostname===host&&a.ownershipReview?.review?.status==='REVIEWED');
 return authority?{status:'ESTABLISHED',reason:'EXISTING_EXACT_SERVICE_HOST_REVIEW',authority}:{status:'HUMAN_REVIEW_REQUIRED',reason:page?.outcome==='OK'?'EXPLICIT_OWNERSHIP_REVIEW_REQUIRED':'PROVIDER_ACQUISITION_INSUFFICIENT',candidateUrl:page?.url??null};
}
export function writeLifecycleDisposition({directory,handoff,phases,events,bootstrap,researchMarkets,executionComplete}){
 const catalog=phases.catalog?.targets??{},pricing=phases.pricing?.targets??{};
 const claims=[];for(const phase of ['catalog','pricing']){const root=directory+'/'+phase;if(fs.existsSync(root))for(const f of filesUnder(root).filter(f=>f.endsWith('/field-review.jsonl')))for(const line of fs.readFileSync(f,'utf8').trim().split('\n').filter(Boolean))claims.push({...JSON.parse(line),artifact:f});}
 const services=handoff.cohort.manifest.serviceIds.filter(id=>!handoff.config?.executionServices||handoff.config.executionServices.includes(id)).map(id=>{
  const target=Object.values(catalog).find(t=>t.service===id),bound=handoff.targets.some(t=>t.service===id),p=Object.values(pricing).filter(t=>t.service===id),status=target?.catalogEligibility?.status??'',serviceClaims=claims.filter(c=>c.service===id),accepted=serviceClaims.flatMap(c=>(c.decisions??[]).filter(d=>d.verification.accepted).map(d=>({...d,market:d.market??c.market,artifact:c.artifact,url:c.url}))),proofs=target?.catalogCapabilityProofs??[];
  const field=f=>({status:accepted.some(d=>f.includes(d.observation.fact))?'VERIFIED':'UNRESOLVED',evidence:accepted.filter(d=>f.includes(d.observation.fact))});
  const row={service_id:id,providerAuthority:{status:bound?'ESTABLISHED':'HUMAN_REVIEW_REQUIRED'},subscriptionQualification:field(['subscription']),identity:field(['identity']),markets:{researched:researchMarkets[id]??[],verified:accepted.filter(d=>d.observation.fact==='availability'),status:accepted.some(d=>d.observation.fact==='availability')?'VERIFIED':'UNRESOLVED'},login:{status:['LOGIN_MANAGE_ESTABLISHED','LOGIN_ONLY_ESTABLISHED'].includes(status)?'ESTABLISHED':'UNRESOLVED'},management:{status:['LOGIN_MANAGE_ESTABLISHED','MANAGE_ONLY_ESTABLISHED'].includes(status)?'ESTABLISHED':'UNRESOLVED'},cancellation:field(['cancelWeb','billingRoutes']),pricing:p.map(t=>({market:t.market,status:t.retainedPriceReview?.sourceBound?'ESTABLISHED':t.verified?.length?'PARTIAL':'UNRESOLVED',confidence:t.retainedPriceReview?.confidence??null,observations:t.verified??[],quarantine:t.quarantinedVerified??[],reason:phases.pricing.services?.[t.service]?.stop??null})),evidence:proofs,humanReview:bound?[phases.catalog?.services?.[id]?.reconciliation,phases.pricing?.services?.[id]?.reconciliation,target?.retainedFailure?.reason,...p.map(t=>t.retainedFailure?.reason)].filter(reason=>reason&&reason!=='BUDGET_EXHAUSTED'):[bootstrap.find(b=>b.service===id)?.reason??'EXPLICIT_OWNERSHIP_REVIEW_REQUIRED'],unresolvedReasons:[phases.catalog?.services?.[id]?.stop,phases.pricing?.services?.[id]?.stop].filter(Boolean),requests:events.filter(e=>e.service===id).length,executionComplete,researchComplete:false};
  if(row.pricing.some(p=>p.status==='ESTABLISHED')&&p.some(t=>t.retainedPriceReview?.sourceBound&&t.verified?.length))row.subscriptionQualification={status:'ESTABLISHED',reason:'VERIFIED_RECURRING_PROVIDER_PRICE',evidence:p.flatMap(t=>t.verified??[])};
  row.finalStatus=!bound||row.humanReview.length?'HUMAN_REVIEW_REQUIRED':row.login.status==='ESTABLISHED'||row.management.status==='ESTABLISHED'||row.pricing.some(p=>p.status!=='UNRESOLVED')?'PARTIAL':'UNRESOLVED';return row;
 });
 atomic(directory+'/final-dispositions.json',{services,executionComplete,productionPromoted:false});
 fs.writeFileSync(directory+'/final-dispositions.md','# Mature V2 final dispositions\n\nExecution completion is not evidence completion. No catalog promotion.\n\n| Service | Authority | Login | Management | Cancellation | Pricing | Requests | Final |\n|---|---|---|---|---|---|---:|---|\n'+services.map(s=>`| ${s.service_id} | ${s.providerAuthority.status} | ${s.login.status} | ${s.management.status} | ${s.cancellation.status} | ${s.pricing.map(p=>p.market+':'+p.status).join(', ')||'UNRESOLVED: no scope'} | ${s.requests} | ${s.finalStatus} |`).join('\n')+'\n');
 return services;
}

export function writeLifecycleReviewQueue(directory,handoff,bootstrap){
 const items=bootstrap.filter(b=>!handoff.targets.some(t=>t.service===b.service)),bindings=[];
 for(const item of items){const candidate=handoff.cohort.candidates.find(c=>c.slug===item.service),source=item.retainedSource??(fs.existsSync(directory+'/bootstrap/'+item.service+'/pages.json')?{directory:directory+'/bootstrap/'+item.service,page:json(directory+'/bootstrap/'+item.service+'/pages.json')[0]}:null),page=source?.page,url=page?.url??item.candidateUrl;
  if(!url)continue;let host;try{const u=new URL(url);if(u.protocol!=='https:')continue;host=u.hostname;}catch{continue;}
  const evidence=[];
  if(page?.bodyFile&&page.outcome==='OK'){
   const body=fs.readFileSync(source.directory+'/'+page.bodyFile,'utf8');if(digest(body)!==page.bodyHash)throw Error('LIFECYCLE_REVIEW_BODY_HASH');
   const dest=directory+'/review-candidates/'+item.service;fs.mkdirSync(dest+'/bodies',{recursive:true});fs.writeFileSync(dest+'/'+page.bodyFile,body);atomic(dest+'/pages.json',[page]);
   const quote=(page.observations??[]).filter(o=>o.fact==='identity').map(o=>o.quote).find(q=>typeof q==='string'&&q.trim()&&body.includes(q))??body.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1];
   if(quote)evidence.push({format:'NATIVE_PUBLIC_PAGE_V1',path:dest+'/pages.json',sha256:hashFile(dest+'/pages.json'),pageIndex:0,sourceUrl:page.url,locator:{offset:body.indexOf(quote)},excerpt:quote});
   item.retainedReference={originalDirectory:source.directory,bodyHash:page.bodyHash,reviewSource:dest+'/pages.json'};
  }
  bindings.push({service:item.service,serviceName:candidate.name,hostname:host,entryUrl:url,bindingType:'DIRECT_PROVIDER',sourceType:'OFFICIAL_PROVIDER',basis:'OFFICIAL_SERVICE_SITE',marketScope:null,authorityScope:'DOMAIN_IDENTITY_ONLY_NOT_PRICE_OR_MARKET',review:{status:'REVIEW_REQUIRED',checkedAt:null,reason:null},evidence});
 }
 atomic(directory+'/provider-review-queue.json',{schemaVersion:1,scope:'SHADOW_RESEARCH_ONLY',items,meaning:'INDIVIDUAL_EXPLICIT_OWNERSHIP_REVIEW_REQUIRED_NOT_AUTOMATIC_APPROVAL'});
 atomic(directory+'/provider-binding-drafts.json',{schemaVersion:1,scope:'SHADOW_RESEARCH_ONLY',bindings});
 fs.writeFileSync(directory+'/PROVIDER-REVIEW.md','# Provider decisions required\n\nDrafts use the mature binding schema. Identity/title excerpts are review leads, not ownership approval. Review exact service, host and product/regional scope individually, then add supported entries to the configured reviewed binding document. Set REVIEWED only with sufficient evidence, reason and date. Resume using the same operator command; V2 derives the next immutable handoff.\n\n'+items.map(i=>'- '+i.service+': '+(i.candidateUrl??'no provider target')+' — '+(i.reason??i.status)).join('\n')+'\n');
 return items;
}

export function lifecycleBudgets(handoff,perReviewedService=36){
 const reviewed=new Set(handoff.targets.map(t=>t.service));
 const byService=Object.fromEntries(handoff.cohort.manifest.serviceIds.map(id=>[id,handoff.config?.executionServices&&!handoff.config.executionServices.includes(id)?0:reviewed.has(id)?perReviewedService:handoff.rows.find(r=>r.service===id)?.providerReview?.selectedCandidate?4:0]));
 return {byService,total:Object.values(byService).reduce((a,b)=>a+b,0)};
}
