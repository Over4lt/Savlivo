import './offline-guard.mjs';
import {assertOffline} from './offline-guard.mjs';
import assert from 'node:assert/strict';
import {readFileSync,existsSync,mkdirSync,writeFileSync,lstatSync} from 'node:fs';
import {resolve,join,relative} from 'node:path';
import {iterateMarketRunRecords,digest} from '../../research-v1/market-run-store.mjs';
import {hydrateRetainedBody} from '../../research-v1/retained-body-reference.mjs';
import {decodeCheckpointPayload} from '../../research-v1/checkpoint-objects.mjs';
import {assertNoSymlinkAncestors} from '../../research-v1/active-state.mjs';
import {findingScope} from '../../research-v1/contract.mjs';
import {resolveSourceOccurrence,sourceMappingVersion} from './source-occurrence.mjs';
// Frozen V1 population projection (research-result-view.mjs). Importing that view
// loads the market/tsx execution graph. Reuse the authoritative scope contract,
// without loading an executor, compiler, transport, interpreter or browser.
export const verifiedPriceFacts=item=>item.prices.filter(p=>p.status==='VERIFIED'&&p.value&&!item.conflicts.some(c=>c.resolutionStatus==='OPEN'&&c.facts.includes('prices')&&(c.scope===undefined||c.scope===findingScope('prices',p.value))));
export const canonicalPriceIdentity=(item,fact)=>JSON.stringify([item.canonicalSlug??item.serviceName,item.countryCode,findingScope('prices',fact.value),typeof fact.value.amount==='string'&&/^\d+(?:\.\d+)?$/.test(fact.value.amount)?fact.value.amount.replace(/(\.\d*?)0+$/,'$1').replace(/\.$/,''):fact.value.amount]);

export const version='RESEARCH_V2_OFFLINE_CORPUS_V1';
export const expectedPopulation=Object.freeze({rejected:622,concrete:152,null:470,positive:114,recovery:49,concerns:9});
export const statuses=Object.freeze({intact:'RESOLVED_TO_INTACT_RETAINED_EVIDENCE',missing:'RESOLVED_BUT_BODY_UNAVAILABLE',integrity:'HASH_INTEGRITY_FAILURE',dangling:'DANGLING_UNRESOLVED_REFERENCE',unsupported:'UNSUPPORTED_HISTORICAL_FORMAT',incomplete:'OTHER_PROVEN_INCOMPLETE_STATE'});
const clone=v=>JSON.parse(JSON.stringify(v??null));
const field=(v,keys)=>Object.fromEntries(keys.filter(k=>v?.[k]!==undefined).map(k=>[k,clone(v[k])]));
export function readOccurrence(occurrence,root){
 const path=resolve(root,occurrence.record.path);assert(!lstatSync(path).isSymbolicLink());
 const record=JSON.parse(readFileSync(path,'utf8')),{hash,...body}=record;assert.equal(digest(body),hash);assert.equal(hash,occurrence.record.hash);
 let page=decodeCheckpointPayload(resolve(path,'..'),record.payload);
 for(const k of occurrence.record.pointer.split('/').slice(1))page=page?.[k.replaceAll('~1','/').replaceAll('~0','~')];
 return validateBody(page??{});
}
export function validateBody(page){
 try{
  const p=hydrateRetainedBody(page),body=p.rawSource?.text,hash=p.sourceIntegrity?.sha256;
  if(typeof body!=='string')return {status:statuses.missing,reason:'BODY_UNAVAILABLE',hash:hash??null};
  if(!hash)return {status:statuses.incomplete,reason:'MISSING_AUTHORITATIVE_HASH',hash:null,computedHash:digest(body),bodyPresent:true};
  if(!/^[a-f0-9]{64}$/.test(hash)||digest(body)!==hash)return {status:statuses.integrity,reason:'BODY_HASH_MISMATCH',hash,bodyPresent:true};
  return {status:statuses.intact,hash,bytes:Buffer.byteLength(body),body};
 }catch(e){return {status:/ENOENT|Missing\/invalid|no such file/.test(e.message)?statuses.missing:statuses.integrity,reason:/ENOENT|Missing\/invalid|no such file/.test(e.message)?'RETAINED_REFERENCE_BODY_MISSING':'RETAINED_REFERENCE_INVALID',hash:page.sourceIntegrity?.sha256??null};}
}
export function locate(body,quote,fragment){
 if(typeof body!=='string')return {status:'BODY_UNAVAILABLE',retainedFragment:clone(fragment),quote:quote??null};
 if(fragment){
  const {offset,length,sha256}=fragment;
  if(Number.isSafeInteger(offset)&&Number.isSafeInteger(length)&&offset>=0&&length>0&&offset+length<=body.length&&sha256&&digest(body.slice(offset,offset+length))===sha256)
   return {status:'EXACT_RETAINED_FRAGMENT',coordinate:'UTF16_CODE_UNITS',retainedFragment:clone(fragment),quote:quote??null};
  return {status:'INVALID_RETAINED_FRAGMENT',retainedFragment:clone(fragment),quote:quote??null};
 }
 if(typeof quote==='string'&&quote.length){
  const offsets=[];let start=0,index;
  while((index=body.indexOf(quote,start))!==-1&&offsets.length<101){offsets.push(index);start=index+quote.length;}
  if(offsets.length===1)return {status:'EXACT_RAW_QUOTE',coordinate:'UTF16_CODE_UNITS',offset:offsets[0],length:quote.length,sha256:digest(quote),quote};
  if(offsets.length)return {status:'AMBIGUOUS_QUOTE',offsets:offsets.slice(0,100),truncated:offsets.length>100,quote};
 }
 return {status:'NO_EXACT_RAW_LOCATOR',quote:quote??null};
}
// Audit tags only. These do not affect identity, verification, or source selection.
export function concern(service,market,value){
 if(service==='strava'&&['4 members','Annual','Annual only'].includes(value.plan))return 'AUDIT_STRAVA_PRODUCT_IDENTITY';
 if(service==='spotify'&&['GB','NO','RO'].includes(market)&&value.plan==='Individual'&&value.offerType==='PROMOTIONAL'&&value.cadenceDescription==='1 month')return 'AUDIT_SPOTIFY_NEIGHBORING_STUDENT_BADGE';
 if(service==='spotify'&&market==='EG'&&value.plan==='Premium'&&value.offerType==='TRIAL')return 'AUDIT_SPOTIFY_EGYPT_CARD_OWNERSHIP';
 return null;
}
export function createCollector({root,expected=expectedPopulation}){
 const sources=new Map(),rejections=[],positives=new Map(),issues=[];
 const issue=(kind,reference,detail=null)=>issues.push({kind,reference,detail});
 function addPage(page,context,pointer,record){
  const checked=validateBody(page),key=checked.status===statuses.intact?'sha256:'+checked.hash:'unresolved:'+digest([record.hash,pointer]);
  const occurrence={id:digest([record.hash,pointer]),...context,record:{path:record.path,sequence:record.sequence,hash:record.hash,pointer},...field(page,['url','checkedAt','authority','targetCountry','locale','sourceType','sourceIntegrity','contentType','transportProof','accessDecisions','priceEvidenceExcluded']),
   bodyLocator:page.retainedBodyReference?{kind:'RETAINED_BODY_REFERENCE',reference:clone(page.retainedBodyReference)}:{kind:'JOURNAL_JSON_POINTER',path:record.path,recordHash:record.hash,pointer:pointer+'/rawSource/text'},status:checked.status,reason:checked.reason??null};
  let source=sources.get(key);if(!source){source={key,sha256:checked.hash,bytes:checked.bytes??null,status:checked.status,bodyPresent:checked.bodyPresent??checked.status===statuses.intact,occurrences:[],links:[]};sources.set(key,source);}
  source.occurrences.push(occurrence);
  if(checked.status!==statuses.intact)issue(checked.reason??checked.status,occurrence.id,{sourceKey:key});
  return {page,key,occurrence,body:checked.body,status:checked.status};
 }
 const candidates=(selector,pages)=>pages.filter(p=>p.page.url===selector.url&&(!selector.checkedAt||p.page.checkedAt===selector.checkedAt)&&(!selector.hash||p.page.sourceIntegrity?.sha256===selector.hash));
 function link(ref,selector,pages,quote,fragment,selected=null){
  const matches=selected??candidates(selector,pages);
  if(!matches.length){issue('DANGLING_EVIDENCE_REFERENCE',ref,selector);return {status:statuses.dangling,sources:[],selector};}
  const hashes=new Set(matches.map(p=>p.key));if(hashes.size>1)issue('AMBIGUOUS_SOURCE_MAPPING',ref,{selector,sourceKeys:[...hashes]});
  const links=matches.map(p=>{
   const locator=locate(p.body,quote,fragment);if(!['EXACT_RETAINED_FRAGMENT','EXACT_RAW_QUOTE'].includes(locator.status))issue(locator.status,ref,{sourceKey:p.key,occurrenceId:p.occurrence.id});
   const s=sources.get(p.key);if(!s.links.includes(ref))s.links.push(ref);
   return {sourceKey:p.key,occurrenceId:p.occurrence.id,status:p.status,locator};
  });
  return {status:hashes.size>1?statuses.incomplete:links.every(p=>p.status===statuses.intact)?statuses.intact:links.find(p=>p.status!==statuses.intact).status,sources:links,selector};
 }
 function addController(c,record){
  if(!c?.task||!c.latest?.item||!Array.isArray(c.pages)||!Array.isArray(c.latest.observations)){issue('UNSUPPORTED_CONTROLLER',record.path);return;}
  const context={taskId:c.task.id,service:c.task.canonicalSlug??c.task.serviceName,market:c.task.countryCode};
  const pages=c.pages.map((p,i)=>addPage(p,context,'/result/pages/'+i,record));
  // Additional acquired bodies are indexed even if they never became observations.
  let nodes=0;function walk(v,pointer){if(++nodes>500000)throw Error('SOURCE_ENUMERATION_NODE_BOUND');if(!v||typeof v!=='object')return;
   if(typeof v.url==='string'&&(v.rawSource||v.retainedBodyReference||v.sourceIntegrity)){pages.push(addPage(v,context,pointer,record));return;}
   for(const[k,x]of Object.entries(v))if(typeof x==='object')walk(x,pointer+'/'+k.replaceAll('~','~0').replaceAll('/','~1'));
  }
  for(const key of ['priceAcquisitions','acquisitionExecutions','unappliedPages'])try{walk(c[key],'/result/'+key);}catch{issue('INCOMPLETE_SOURCE_ENUMERATION',record.path,key);}
  for(const [i,o]of c.latest.observations.entries()){
   if(o.observation?.fact!=='prices'||o.claimDecision?.accepted!==false)continue;
   const id='rejection:'+digest([record.hash,i]),selector={url:o.sourceUrl,checkedAt:o.checkedAt,hash:o.observation.proof?.rawSha256??o.claimDecision.rawSha256};
   const originalCandidates=candidates(selector,pages);
   const sourceMapping=o.observation.value===null&&new Set(originalCandidates.map(p=>p.key)).size>1?resolveSourceOccurrence(c,o,record,originalCandidates):null;
   const selected=sourceMapping?.sourceResolved?originalCandidates.filter(p=>sourceMapping.selectedOccurrenceIds.includes(p.occurrence.id)):null;
   const evidence=link(id,selector,pages,o.observation.quote,o.observation.proof?.fragment,selected);
   if(sourceMapping)sourceMapping.selectedEvidence=sourceMapping.sourceResolved?evidence.sources.map(s=>({sourceKey:s.sourceKey,occurrenceId:s.occurrenceId,bodyStatus:s.status,rawLocatorStatus:s.locator.status})):[];
   rejections.push({id,...context,historicalReference:{path:record.path,recordHash:record.hash,pointer:'/result/latest/observations/'+i},original:clone(o),evidence,...(sourceMapping?{sourceMapping}:{}),replayEligible:evidence.status===statuses.intact});
  }
  // Use V1's identity/filter only to reproduce its historical population, never to endorse it.
  for(const f of verifiedPriceFacts(c.latest.item)){
   const key=canonicalPriceIdentity(c.latest.item,f),id='positive:'+digest(key);let row=positives.get(key);
   if(!row){row={id,historicalCanonicalIdentity:key,...context,value:clone(f.value),historicalStatus:'VERIFIED',phase1Endorsement:false,concern:concern(context.service,context.market,f.value),occurrences:[]};positives.set(key,row);}
   const evidence=[];for(const evidenceId of f.evidenceIds??[]){const entries=c.latest.item.evidence.filter(e=>e.id===evidenceId);
    if(!entries.length){issue('DANGLING_POSITIVE_EVIDENCE_ID',id,evidenceId);evidence.push({status:statuses.dangling,evidenceId,sources:[]});}
    for(const e of entries){const observations=c.latest.observations.filter(o=>o.observation?.fact==='prices'&&JSON.stringify(o.observation.value)===JSON.stringify(f.value)&&o.sourceUrl===e.sourceUrl&&o.checkedAt===e.checkedAt);
     if(observations.length)for(const o of observations)evidence.push({evidenceId,originalEvidence:clone(e),...link(id,{url:e.sourceUrl,checkedAt:e.checkedAt,hash:o.observation.proof?.rawSha256??o.claimDecision?.rawSha256},pages,o.observation.quote,o.observation.proof?.fragment)});
     else evidence.push({evidenceId,originalEvidence:clone(e),...link(id,{url:e.sourceUrl,checkedAt:e.checkedAt},pages,e.finding)});
    }
   }
   if(!evidence.length)issue('POSITIVE_WITHOUT_EVIDENCE',id);
   row.occurrences.push({record:{path:record.path,hash:record.hash,pointer:'/result/latest/item/prices/'+c.latest.item.prices.indexOf(f)},evidence});
  }
 }
 function finish(run,recoveryInput=null){
  const recovery=[];
  if(!recoveryInput){issue('RECOVERY_AUDIT_MANIFEST_MISSING','recovery',{expected:expected.recovery,knownGroups:{alreadyGrounded:18,googleOne:1,netflix:30},note:'Aggregate handoff is not a target list. No target identities or monetary fields fabricated.'});}
  else{
   assert.equal(recoveryInput.version,'RESEARCH_V2_RECOVERY_PROVENANCE_V1');assert.equal(recoveryInput.runId,run.runId);assert.equal(recoveryInput.chainHead,run.chainHead);assert(Array.isArray(recoveryInput.targets));
   const seen=new Set();for(const target of recoveryInput.targets){assert(typeof target.id==='string'&&!seen.has(target.id));seen.add(target.id);assert(Array.isArray(target.sources));
    const evidence=target.sources.map(ref=>{const source=sources.get(ref.sourceKey),occurrence=source?.occurrences.find(o=>o.id===ref.occurrenceId);if(!occurrence){issue('DANGLING_RECOVERY_SOURCE',target.id,ref);return {status:statuses.dangling,...ref};}
     if(!source.links.includes(target.id))source.links.push(target.id);
     // Exact source and occurrence are required; no URL-only recovery substitution.
     let checked;try{checked=readOccurrence(occurrence,root);}catch{checked={status:statuses.integrity};}
     const locator=locate(checked.body,ref.quote,ref.locator);
     const ok=['EXACT_RETAINED_FRAGMENT','EXACT_RAW_QUOTE'].includes(locator.status);
     if(!ok||checked.status!==statuses.intact)issue('RECOVERY_PROVENANCE_UNRESOLVED',target.id,{...ref,status:checked.status,locatorStatus:locator.status});
     return {...ref,status:checked.status,locator,laterVerificationReady:ok&&checked.status===statuses.intact};
    });
    if(!evidence.length)issue('RECOVERY_WITHOUT_SOURCES',target.id);
    recovery.push({...clone(target),evidence,laterVerificationReady:evidence.length>0&&evidence.every(e=>e.laterVerificationReady),phase1Endorsement:false});
   }
  }
  const positive=[...positives.values()].sort((a,b)=>a.id.localeCompare(b.id));
  const observed={rejected:rejections.length,concrete:rejections.filter(r=>r.original.observation.value!==null).length,null:rejections.filter(r=>r.original.observation.value===null).length,positive:positive.length,recovery:recovery.length,concerns:positive.filter(p=>p.concern).length};
  for(const[k,n]of Object.entries(expected))if(observed[k]!==n)issue('POPULATION_MISMATCH',k,{expected:n,observed:observed[k]});
  const list=[...sources.values()].sort((a,b)=>a.key.localeCompare(b.key));
  const missing={version,issues:issues.sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))),counts:Object.fromEntries([...new Set(issues.map(i=>i.kind))].sort().map(k=>[k,issues.filter(i=>i.kind===k).length]))};
  const mappings=rejections.filter(r=>r.sourceMapping).map(r=>r.sourceMapping);
  const sourceMappings={version:sourceMappingVersion,population:mappings.length,classifications:Object.fromEntries(['A','B','C','D'].map(k=>[k,mappings.filter(m=>m.classification===k).length])),resolved:mappings.filter(m=>m.sourceResolved).length,unresolved:mappings.filter(m=>!m.sourceResolved).length,resolvedWithUnavailableBody:mappings.filter(m=>m.sourceResolved&&m.selectedEvidence.some(e=>e.bodyStatus===statuses.missing)).length,rawLocatorStatuses:{}};
  for(const m of mappings)for(const e of m.selectedEvidence)sourceMappings.rawLocatorStatuses[e.rawLocatorStatus]=(sourceMappings.rawLocatorStatuses[e.rawLocatorStatus]??0)+1;
  const manifest={version,run,expected,observed,sourceMappings,uniqueSources:list.length,intactSources:list.filter(s=>s.status===statuses.intact).length,offline:assertOffline(),generation:{deterministic:true,clock:'NONE',truthEvaluation:'NONE'},successGate:issues.length?'FAIL':'PASS'};
  // Return the serialized contract shape as well as writing it: absent optional
  // selector fields must not differ between in-memory and persisted replay.
  return clone({manifest,sources:{version,sources:list},rejections:{version,rows:rejections},positive:{version,rows:positive},recovery:{version,expected:expected.recovery,identified:recovery.length,rows:recovery,unresolvedTargetCount:Math.max(0,expected.recovery-recovery.length)},missing});
 }
 return {addController,finish,issue};
}
export function buildCorpus({runDirectory,root=process.cwd(),expected=expectedPopulation,recoveryInput=null,onProgress=()=>{}}){
 root=resolve(root);const directory=join(resolve(runDirectory),'run'),collector=createCollector({root,expected});let count=0,head=null,last,runId=null,tasks=0;
 assertNoSymlinkAncestors(directory);
 try{for(const record of iterateMarketRunRecords(directory)){
  count++;head=record.hash;last=record.type;
  if(record.type==='RUN_CREATED')runId=record.payload.manifest?.runId;
  if(record.type==='TASK_COMPLETE'){tasks++;collector.addController(record.payload.result,{...record,path:relative(root,join(directory,`record-${String(record.sequence).padStart(8,'0')}.json`))});}
  if(count%500===0)onProgress({records:count,tasks});
 }}catch(e){collector.issue('JOURNAL_OR_PAYLOAD_INTEGRITY_FAILURE',relative(root,directory),{lastValidatedSequence:count,error:e.code??e.name});}
 if(last!=='RUN_STOP')collector.issue('INCOMPLETE_RUN',relative(root,directory),{lastType:last??null});
 return collector.finish({runId,directory:relative(root,resolve(runDirectory)),chainHead:head,records:count,tasks,terminal:last??null},recoveryInput);
}
export function validateCorpus(c){
 assert.equal(c.manifest.version,version);for(const key of ['sources','rejections','positive','recovery','missing'])assert.equal(c[key].version,version);
 assert.equal(c.manifest.observed.rejected,c.rejections.rows.length);assert.equal(c.manifest.observed.positive,c.positive.rows.length);assert.equal(c.manifest.observed.recovery,c.recovery.rows.length);assert.equal(c.manifest.uniqueSources,c.sources.sources.length);
 assert.deepEqual(Object.keys(c.manifest.offline).sort(),['browser','decodo','externalNetwork','groq','provider','subprocess']);assert(Object.values(c.manifest.offline).every(n=>n===0));
 const keys=new Set(c.sources.sources.map(s=>s.key));assert.equal(keys.size,c.sources.sources.length);
 const occurrences=new Map();for(const s of c.sources.sources){assert(Object.values(statuses).includes(s.status));assert.equal(typeof s.bodyPresent,'boolean');if(s.status===statuses.intact){assert(s.bodyPresent);assert.equal(s.key,'sha256:'+s.sha256);}for(const o of s.occurrences)occurrences.set(o.id,s.key);}
 const check=links=>{for(const l of links??[]){assert(keys.has(l.sourceKey));assert.equal(occurrences.get(l.occurrenceId),l.sourceKey);}};
 for(const r of c.rejections.rows){check(r.evidence.sources);if(r.sourceMapping){const m=r.sourceMapping;assert.equal(m.version,sourceMappingVersion);assert.equal(r.original.observation.value,null);assert(['A','B','C','D'].includes(m.classification));check(m.originalCandidates);check(m.selectedEvidence);assert.equal(m.evidence.recordHash,r.historicalReference.recordHash);if(m.sourceResolved){assert(m.selectedOccurrenceIds.length);assert.deepEqual(m.selectedOccurrenceIds,r.evidence.sources.map(s=>s.occurrenceId));}else assert.equal(m.selectedOccurrenceIds.length,0);}}
 if(c.manifest.sourceMappings){const rows=c.rejections.rows.filter(r=>r.sourceMapping),s=c.manifest.sourceMappings;assert.equal(s.version,sourceMappingVersion);assert.equal(s.population,rows.length);assert.equal(s.resolved,rows.filter(r=>r.sourceMapping.sourceResolved).length);assert.equal(s.unresolved,s.population-s.resolved);for(const k of ['A','B','C','D'])assert.equal(s.classifications[k],rows.filter(r=>r.sourceMapping.classification===k).length);}
 for(const p of c.positive.rows){assert.equal(p.phase1Endorsement,false);for(const o of p.occurrences)for(const e of o.evidence)check(e.sources);}
 assert.equal(c.manifest.successGate,c.missing.issues.length?'FAIL':'PASS');return c;
}
export function writeCorpus(c,directory){
 validateCorpus(c);const dest=resolve(directory),source=resolve(c.manifest.run.directory);
 assertNoSymlinkAncestors(dest);
 assert(dest!==source&&!dest.startsWith(source+'/'),'Derived output cannot be inside the authoritative run');
 assert(!dest.includes('/.savlivo/research-v1/'),'Derived V2 output cannot change V1 state');
 for(const s of c.sources.sources)for(const o of s.occurrences){const d=o.bodyLocator.reference?.directory;if(d)assert(dest!==resolve(d)&&!dest.startsWith(resolve(d)+'/'),'Derived output cannot change retained evidence');}
 assert(!existsSync(directory),'Use a new derived artifact directory');mkdirSync(directory,{recursive:true});for(const[k,v]of Object.entries(c))writeFileSync(join(directory,k+'.json'),JSON.stringify(v,null,2)+'\n',{flag:'wx',mode:0o600});
}
