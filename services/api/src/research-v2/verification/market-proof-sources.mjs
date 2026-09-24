import {loadLiveSource} from './live-source.mjs';
import {readHistoricalReference} from '../offline-recovery/geo-evidence.mjs';
import {marketProofBounds} from './market-proof.mjs';
// References, not cached verdicts. Authority, bytes, current invalidation and age
// are checked again whenever interpretation or targeted verification consumes them.
export function loadMarketProofSources(sources,target,root=process.cwd()){
 if(!Array.isArray(sources)||sources.length>marketProofBounds.sources||sources.some(s=>!Array.isArray(s?.occurrences)))return [];
 const all=sources.flatMap(s=>(s.occurrences??[]).map(occurrence=>({hash:s.sha256,occurrence})));if(all.length>marketProofBounds.sources)return [];
 const out=[];let bytes=0;
 for(const {hash,occurrence:o} of all){try{
  if(o.service!==target.service||o.market!==target.market||o.taskId!==target.id)continue;
  if((target.invalidatedEvidence??[]).includes(hash)||(target.quarantinedVerified??[]).some(q=>{const v=q.value??q.originalVerified??q;return v.sourceHash===hash||v.sourceHashes?.includes(hash)||v.source?.hash===hash;}))continue;
  const r=loadLiveSource(o,hash,[],root),page=readHistoricalReference(o.record,root),capturedAt=page.sourceIntegrity?.checkedAt;
  const age=Date.now()-Date.parse(capturedAt??'');if(!Number.isFinite(age)||age<0||age>Math.min(target.retainedMaxAgeDays??30,marketProofBounds.maxAgeDays)*86400000)continue;
  const host=new URL(o.url).hostname;if(!r.receipt.serviceEstablished||!target.authorities?.some(a=>a.hostname===host&&a.provider===target.serviceName&&a.checkedAt&&['OFFICIAL_PROVIDER','OFFICIAL_SUPPORT'].includes(a.sourceType)))continue;
  bytes+=Buffer.byteLength(r.body);if(bytes>marketProofBounds.bytes)return [];
  out.push({...r,occurrence:o,capturedAt});
 }catch{/* Unusable references never create market truth. */}}
 return out;
}
