import {catalogRouteOutcome} from '../intelligence/management-targeting.mjs';
// Routing memory only. Never authority, market, currency or price evidence.
import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';
import {normalizeFrontierUrl} from './source-frontier.mjs';import {providerAccessGap} from './provider-access-gap.mjs';
const hash=x=>createHash('sha256').update(typeof x==='string'||Buffer.isBuffer(x)?x:JSON.stringify(x)).digest('hex');
export const memoryScope=t=>hash([t.service,t.market,[...new Set((t.authorities??[]).map(a=>a.provider+'|'+a.hostname))].sort()]);
export function createResearchMemory(t,reference){
 const attempts=(t.reads??[]).map(r=>({...catalogRouteOutcome(t,r),route:'DIRECT',url:normalizeFrontierUrl(r.requestedUrl??r.url).url,finalUrl:normalizeFrontierUrl(r.url??r.requestedUrl).url,completed:true,outcome:r.outcome??'UNKNOWN',failure:r.failure?.code??null,permittedEscalation:!!providerAccessGap(r),bodyHash:r.bodyHash??null,capturedAt:r.sourceIntegrity?.checkedAt??null,reference})).filter(r=>r.url);
 for(const q of t.queries??[])attempts.push({route:'DISCOVERY',query:q.query,completed:true,failure:q.failure?.code??null,reference});
 for(const o of t.acquisitionOutcomes??[])attempts.push({route:'DECODO',url:normalizeFrontierUrl(o.url).url,completed:true,outcome:o.classification,reference});
 return {version:1,scope:memoryScope(t),meaning:'ROUTING_ONLY_NOT_PROVIDER_FACTS',references:[reference],unresolvedFields:[...new Set((t.providerInterpretations??[]).flatMap(o=>o.blockers??[]))],attempts:attempts.slice(0,256),blockedOrigins:[...new Set(t.blockedOrigins??[])],diagnosis:t.researchDiagnosis??null};
}
export function combineResearchMemory(t,memories){if(!memories.some(m=>m.scope===memoryScope(t)))return null;return {version:1,scope:memoryScope(t),meaning:'ROUTING_ONLY_NOT_PROVIDER_FACTS',references:memories.filter(m=>m.scope===memoryScope(t)).flatMap(m=>m.references??[]),unresolvedFields:[...new Set(memories.filter(m=>m.scope===memoryScope(t)).flatMap(m=>m.unresolvedFields??[]))],attempts:[...new Map(memories.filter(m=>m.scope===memoryScope(t)).flatMap(m=>m.attempts).map(a=>[JSON.stringify([a.route,a.url,a.query,a.reference]),a])).values()].slice(0,256),blockedOrigins:[...new Set(memories.filter(m=>m.scope===memoryScope(t)).flatMap(m=>m.blockedOrigins))],diagnosis:memories.filter(m=>m.scope===memoryScope(t)).map(m=>m.diagnosis).filter(Boolean).at(-1)??null};}
const refs=new Map();
function intactReference(ref){try{if(!ref?.path||!/^([a-f0-9]{64})$/.test(ref.hash??''))return false;const file=path.resolve(ref.path);if(!file.startsWith(process.cwd()+path.sep)||fs.lstatSync(file).isSymbolicLink())return false;const stat=fs.statSync(file),key=file+'|'+stat.mtimeMs+'|'+stat.size;let digest=refs.get(key);if(!digest){digest=hash(fs.readFileSync(file));refs.set(key,digest);}return digest===ref.hash;}catch{return false;}}
export function usableResearchMemory(t,{verifyReferences=true}={}){
 const m=t.researchMemory;if(!m||m.version!==1||m.scope!==memoryScope(t)||m.meaning!=='ROUTING_ONLY_NOT_PROVIDER_FACTS'||!Array.isArray(m.attempts)||m.attempts.length>256)return {attempts:[],blockedOrigins:[],rejected:!!m};
 // Whole memory fails closed on a broken checkpoint reference. It never falls back to positive facts.
 if(verifyReferences&&(!(m.references?.length)||!m.references.every(intactReference)||!m.attempts.every(a=>intactReference(a.reference))))return {attempts:[],blockedOrigins:[],rejected:true};
 const hosts=new Set((t.authorities??[]).map(a=>a.hostname)),attempts=m.attempts.filter(a=>a.completed===true&&['DIRECT','DISCOVERY','DECODO'].includes(a.route)&&(!a.url||normalizeFrontierUrl(a.url).url&&hosts.has(new URL(a.url).hostname)));
 return {attempts,unresolvedFields:m.unresolvedFields??[],blockedOrigins:(m.blockedOrigins??[]).filter(o=>{try{return hosts.has(new URL(o).hostname);}catch{return false;}}),diagnosis:m.diagnosis??null,rejected:false};
}
export function researchKnowledge(t){
 const prior=usableResearchMemory(t),current=(t.reads??[]).map(r=>({...catalogRouteOutcome(t,r),route:'DIRECT',url:normalizeFrontierUrl(r.requestedUrl??r.url).url,finalUrl:normalizeFrontierUrl(r.url??r.requestedUrl).url,completed:true,outcome:r.outcome,failure:r.failure?.code,permittedEscalation:!!providerAccessGap(r)}));
 const attempts=[...prior.attempts,...current,...(t.queries??[]).map(q=>({route:'DISCOVERY',query:q.query,completed:true})),...(t.acquisitionOutcomes??[]).map(o=>({route:'DECODO',url:o.url,completed:true}))];
 return {version:1,scope:memoryScope(t),attempts,blockedOrigins:[...new Set([...prior.blockedOrigins,...(t.blockedOrigins??[])])],unresolvedFields:[...new Set([...(prior.unresolvedFields??[]),...(t.providerInterpretations??[]).flatMap(o=>o.blockers??[])])],diagnosis:t.researchDiagnosis??prior.diagnosis??null,priceStrategy:t.priceStrategy??'UNSPECIFIED',memoryRejected:prior.rejected,meaning:'DECISION_STATE_NOT_ADMISSION'};
}
