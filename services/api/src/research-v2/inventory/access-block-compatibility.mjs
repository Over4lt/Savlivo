// Re-derive routing scope only. Never modify retained files, policy facts or budgets.
import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';import {isDeepStrictEqual} from 'node:util';
import {accessStopOrigins} from '../live/access-stop-scope.mjs';
const origins=t=>[...new Set([...(t.blockedOrigins??[]),...(t.researchMemory?.blockedOrigins??[])])];
const stop=r=>['BLOCKED','ACCESS_CONTROL_STOP'].includes(r.outcome)||r.failure?.code==='ROBOTS_ACCESS_STOP';
export function reconcileAccessBlocks(target,reference){
 if(!origins(target).length)return target;
 const cache=new Map();let bytes=0;const corrections=[];
 const load=ref=>{
  if(!ref?.path||!/^[a-f0-9]{64}$/.test(ref.hash??''))throw Error('UNBOUND_ACCESS_HISTORY');
  const file=path.resolve(ref.path),key=file+'|'+ref.hash;if(cache.has(key))return cache.get(key);
  if(cache.size>=32||!file.startsWith(process.cwd()+path.sep)||fs.realpathSync(file)!==file)throw Error('ACCESS_HISTORY_BOUND');
  const stat=fs.statSync(file);if(!stat.isFile())throw Error('ACCESS_HISTORY_FILE');
  const size=stat.size;if(size>32*1024*1024||(bytes+=size)>128*1024*1024)throw Error('ACCESS_HISTORY_BOUND');
  const raw=fs.readFileSync(file);if(createHash('sha256').update(raw).digest('hex')!==ref.hash)throw Error('ACCESS_HISTORY_CHANGED');
  const doc=JSON.parse(raw),t=Array.isArray(doc.targets)?doc.targets.find(t=>t.id===target.id):doc.targets?.[target.id];
  if(!t||t.id!==target.id||t.service!==target.service||t.market!==target.market||!isDeepStrictEqual(t.authorities,target.authorities))throw Error('ACCESS_HISTORY_SCOPE');
  cache.set(key,t);return t;
 };
 const resolve=(t,ref,origin,seen=new Set())=>{
  const unknown=()=>({origins:[origin],references:[]});
  const key=ref.path+'|'+ref.hash;if(seen.has(key)||seen.size>=32)return unknown();seen=new Set(seen).add(key);
  const result=new Set(),references=[ref];let explained=false;
  // This is the actual seed parent, not a guess based on a hostname or timestamp.
  const parentRef=t.priorUsage?.reference??t.continuationPriorUsage?.source;
  if(parentRef){const parent=load(parentRef);if(origins(parent).includes(origin)){const inherited=resolve(parent,parentRef,origin,seen);inherited.origins.forEach(o=>result.add(o));references.push(...inherited.references);explained=true;}
   else if(t.researchMemory?.blockedOrigins?.includes(origin))return unknown();
  }else return unknown();
  for(const r of t.reads??[]){if(!stop(r))continue;const requested=r.requestedUrl??r.url,current=accessStopOrigins(r,requested);
   if(new URL(requested).origin===origin||current.includes(origin)){current.forEach(o=>result.add(o));explained=true;}}
  // These summaries do not carry enough typed scope to relax an acquisition stop.
  if((t.acquisitionOutcomes??[]).some(o=>new URL(o.url).origin===origin))result.add(origin);
  return explained?{origins:[...result],references}:unknown();
 };
 try{
  const persisted=load(reference);if(!isDeepStrictEqual(persisted,target))return target;
  for(const origin of origins(target)){try{const r=resolve(persisted,reference,origin);if(!r.origins.includes(origin))corrections.push({origin,replacementOrigins:r.origins,references:r.references});}catch{/* Missing, oversized or ambiguous history stays restricted. */}}
 }catch{return target;}
 if(!corrections.length)return target;
 const replace=values=>[...new Set((values??[]).flatMap(o=>corrections.find(c=>c.origin===o)?.replacementOrigins??[o]))];
 return {...target,blockedOrigins:replace(origins(target)),...(target.researchMemory?{researchMemory:{...target.researchMemory,blockedOrigins:replace(target.researchMemory.blockedOrigins)}}:{}),accessBlockCompatibility:{version:1,meaning:'CURRENT_SCOPE_REDERIVED_FROM_HASH_BOUND_HISTORY',corrections}};
}
