// V2 discovery controller. No transport, interpretation, or verification at import.
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {normalizeFrontierUrl,semanticReasons} from './source-frontier.mjs';
import {sourceLinks} from './source-frontier-links.mjs';
export const sha=b=>createHash('sha256').update(b).digest('hex');
export const discoveryLimits=Object.freeze({targets:20,pages:30,requests:180,bytes:48*1024*1024,candidates:240,analysisSteps:20000,perTargetPages:3,perTargetRequests:24,perTargetBytes:8*1024*1024,perTargetCandidates:12,perTargetAnalysisSteps:1000,depth:2,retries:0,redirects:0,associatedResources:0,queries:0,maxBodyBytes:2*1024*1024});
export const commercialFields=['plan','amount','currency','cadence','priceRole','ownership','market'];
export function discoveryActivation({ordinaryComplete,interpretationComplete,claims=[],hasSources=false,hardStop=null}){
 if(hardStop)return {active:false,reason:hardStop,missingFields:[]};
 if(!ordinaryComplete||!interpretationComplete)return {active:false,reason:'ORDINARY_STAGES_REQUIRED',missingFields:[]};
 // Never combine sufficient fields across different claims/cards.
 const missing=claims.map(c=>commercialFields.filter(f=>c[f]!==true));
 if(missing.some(m=>!m.length))return {active:false,reason:'COMMERCIAL_FIELDS_SUFFICIENT',missingFields:[]};
 const fields=missing.sort((a,b)=>a.length-b.length||a.join().localeCompare(b.join()))[0]??commercialFields;
 return {active:true,reason:hasSources?'COMMERCIAL_FIELDS_INSUFFICIENT':'NO_SOURCE_RESEARCH_STATE',missingFields:fields};
}
export function officialCandidate(target,lead,domains){
 const n=normalizeFrontierUrl(lead.url,lead.parent?.url);if(!n.url)return {eligible:false,reason:n.reason,lead};
 const authority=domains.find(d=>d.validated===true&&d.service===target.service&&d.hostname===n.hostname&&d.reference);
 if(!authority)return {eligible:false,reason:'OWNERSHIP_UNPROVEN',url:n.url,lead};
 const sem=semanticReasons(n.url,lead.label??'',lead.method??'');if(sem.reject||sem.priority>=60)return {eligible:false,reason:'NONCOMMERCIAL_OR_UNSAFE_DESTINATION',url:n.url,lead};
 return {eligible:true,url:n.url,authority,priority:sem.priority,marketHint:lead.market===target.market||new URL(n.url).pathname.split('/').some(x=>x.toUpperCase()===target.market),provenance:lead,evidenceStatus:'DISCOVERY_LEAD_ONLY',currency:null,marketApplicability:false};
}
export function mergeSources(old,added){
 const map=new Map();for(const c of [...old,...added]){const k=JSON.stringify([c.service,c.market,c.url]);const p=map.get(k);if(!p)map.set(k,structuredClone(c));else p.provenance=[...new Map([...(p.provenance??[]),...(c.provenance??[])].map(x=>[JSON.stringify(x),x])).values()].sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));}
 return [...map.values()].sort((a,b)=>JSON.stringify([a.service,a.market,a.url]).localeCompare(JSON.stringify([b.service,b.market,b.url])));
}
export class DiscoveryJournal{
 constructor(directory,limits=discoveryLimits){fs.mkdirSync(directory,{recursive:true});this.directory=directory;this.file=directory+'/discovery-journal.jsonl';this.limits=limits;this.events=[];if(fs.existsSync(this.file)){const text=fs.readFileSync(this.file,'utf8');if(text&&!text.endsWith('\n'))throw Error('INCOMPLETE_DISCOVERY_JOURNAL');this.events=text.trim()?text.trim().split('\n').map(JSON.parse):[];}if(this.events[0]?.type==='LIMITS'&&JSON.stringify(this.events[0].limits)!==JSON.stringify(limits))throw Error('RESUME_LIMITS_CHANGED');if(!this.events.length)this.append('LIMITS',{limits});this.usage={targets:0,pages:0,requests:0,bytes:0,candidates:0,analysisSteps:0,perTarget:{}};this.settled=new Set();for(const e of this.events){if(e.type==='RESERVE')this.apply(e.target,e.kind,e.amount);if(e.type==='SETTLE_BYTES')this.applySettlement(e);}}
 append(type,data){const e={sequence:this.events.length+1,type,...data};const fd=fs.openSync(this.file,'a',0o600);try{fs.writeSync(fd,JSON.stringify(e)+'\n');fs.fsyncSync(fd);}finally{fs.closeSync(fd);}this.events.push(e);return e;}
 apply(target,kind,amount){this.usage[kind]+=amount;const t=this.usage.perTarget[target]??={};t[kind]=(t[kind]??0)+amount;}
 reserve(target,kind,amount=1){if(!Number.isSafeInteger(amount)||amount<0)throw Error('INVALID_RESERVATION');const l=this.limits,cap={pages:l.perTargetPages,requests:l.perTargetRequests,bytes:l.perTargetBytes,candidates:l.perTargetCandidates,analysisSteps:l.perTargetAnalysisSteps}[kind];if(this.usage[kind]+amount>l[kind]||cap!==undefined&&(this.usage.perTarget[target]?.[kind]??0)+amount>cap){this.append('BOUND_STOP',{target,kind});throw Error('DISCOVERY_BOUND_'+kind);}const event=this.append('RESERVE',{target,kind,amount});this.apply(target,kind,amount);return event.sequence;}
 applySettlement(event){const reservation=this.events.find(e=>e.sequence===event.reservation&&e.type==='RESERVE'&&e.kind==='bytes');if(!reservation||reservation.sequence>=event.sequence||this.settled.has(event.reservation)||!Number.isSafeInteger(event.used)||event.used<0||event.used>reservation.amount)throw Error('CORRUPT_BYTE_SETTLEMENT');this.apply(reservation.target,'bytes',event.used-reservation.amount);this.settled.add(event.reservation);}
 settleBytes(reservation,used){const r=this.events.find(e=>e.sequence===reservation&&e.type==='RESERVE'&&e.kind==='bytes');if(!r||this.settled.has(reservation)||!Number.isSafeInteger(used)||used<0||used>r.amount)throw Error('INVALID_BYTE_SETTLEMENT');const event=this.append('SETTLE_BYTES',{reservation,used,target:r.target});this.applySettlement(event);}
 // Only completed responses settle. Reservations never refund on crash. A dispatched URL is never implicitly retried.
 attempted(target,url){return this.events.some(e=>e.type==='PAGE_STARTED'&&e.target===target&&e.url===url);}
}
export async function discoverTarget({target,activation,domains,leads=[],parents=[],journal,acquire,clock=()=>new Date().toISOString()}){
 const old=journal.events.find(e=>e.type==='TARGET_RESULT'&&e.target===target.id);if(old)return old.result;
 const result={service:target.service,market:target.market,target:target.id,activation,candidates:[],rejected:[],pages:[],sources:[],failures:[],terminal:null};
 if(journal.events.some(e=>e.type==='PAGE_STARTED'&&e.target===target.id&&!journal.events.some(r=>r.type==='PAGE_RESULT'&&r.target===target.id&&r.url===e.url))){result.terminal='DISCOVERY_INTERRUPTED_RECONCILIATION_REQUIRED';journal.append('TARGET_RESULT',{target:target.id,result});return result;}
 journal.append('ACTIVATION',{target:target.id,activation});if(!activation.active){result.terminal=activation.reason;journal.append('TARGET_RESULT',{target:target.id,result});return result;}
 const queue=[],seen=new Set(),known=new Set(target.urls??[]);let final=false;
 const add=lead=>{const key=normalizeFrontierUrl(lead.url,lead.parent?.url).url??String(lead.url);if(seen.has(key))return;seen.add(key);journal.reserve(target.id,'candidates');const c=officialCandidate(target,lead,domains);if(!c.eligible){result.rejected.push(c);journal.append('CANDIDATE_REJECTED',{target:target.id,candidate:c});return;}result.candidates.push(c);journal.append('CANDIDATE_PROVEN',{target:target.id,candidate:c});if(!known.has(c.url)&&!journal.attempted(target.id,c.url))queue.push(c);};
 const expand=parent=>{if(parent.depth>=journal.limits.depth)return;if(typeof parent.body!=='string'||sha(parent.body)!==parent.bodyHash||!parent.record)throw Error('PARENT_INTEGRITY_UNPROVEN');if(!officialCandidate(target,{url:parent.url},domains).eligible)return;
  const parsed=sourceLinks(parent.body,{maxBytes:journal.limits.maxBodyBytes,maxLinks:200,maxJsonNodes:500});journal.reserve(target.id,'analysisSteps',parsed.links.length+1);journal.append('LINK_ANALYSIS',{target:target.id,parent:{url:parent.url,bodyHash:parent.bodyHash,record:parent.record},stops:parsed.stops});
  const links=parsed.links.map(l=>({...l,url:normalizeFrontierUrl(l.url,parent.url).url})).filter(l=>l.url&&semanticReasons(l.url,l.label,l.mechanism).priority<=35).sort((a,b)=>semanticReasons(a.url,a.label).priority-semanticReasons(b.url,b.label).priority||a.url.localeCompare(b.url));
  for(const l of links.slice(0,Math.max(0,journal.limits.perTargetCandidates-(journal.usage.perTarget[target.id]?.candidates??0))))add({...l,method:'LIVE_PROVIDER_LINK',parent:{url:parent.url,bodyHash:parent.bodyHash,record:parent.record,depth:parent.depth},syntax:l.reference,depth:parent.depth+1});
  if(links.length>journal.limits.perTargetCandidates)journal.append('CANDIDATE_SELECTION_BOUND',{target:target.id,available:links.length,limit:journal.limits.perTargetCandidates});
 };
 try{
  if(!journal.usage.perTarget[target.id]?.targets)journal.reserve(target.id,'targets');
  for(const p of parents)expand(p);
  for(const lead of leads.slice(0,Math.max(0,journal.limits.perTargetCandidates-(journal.usage.perTarget[target.id]?.candidates??0))))add(lead);
  while(queue.length&&!final){queue.sort((a,b)=>Number(b.marketHint)-Number(a.marketHint)||a.priority-b.priority||a.url.localeCompare(b.url));const c=queue.shift();journal.reserve(target.id,'pages');journal.append('PAGE_STARTED',{target:target.id,url:c.url,candidate:c,at:clock()});
   const outcome=await acquire({target,candidate:c,journal});result.pages.push(outcome);journal.append('PAGE_RESULT',{target:target.id,url:c.url,outcome});
   result.sources=mergeSources(result.sources,[{service:target.service,market:target.market,url:c.url,ownership:c.authority,provenance:[c.provenance],discoveredAt:clock(),runId:journal.directory,policy:outcome.policy??null,usefulness:outcome.classification,runDirectory:outcome.runDirectory??null}]);
   if(outcome.hardStop){result.terminal=outcome.classification;break;}
   if(outcome.sufficient){result.terminal='COMMERCIAL_FIELDS_SUFFICIENT';final=true;break;}
   if(outcome.classification)result.failures.push(outcome.classification);
   for(const p of outcome.parents??[])expand({...p,depth:(c.provenance.depth??0)+1});
  }
 }catch(e){result.terminal=String(e.message).startsWith('DISCOVERY_BOUND_')?'BUDGET_STOP':'DISCOVERY_INTERRUPTED';journal.append('STOP',{target:target.id,reason:result.terminal});}
 result.terminal??=result.pages.at(-1)?.classification??(result.rejected.some(r=>r.reason==='OWNERSHIP_UNPROVEN')?'OWNERSHIP_UNPROVEN':'NO_DISCOVERY_LEAD');journal.append('TARGET_RESULT',{target:target.id,result});return result;
}
