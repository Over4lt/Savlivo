import {loadLiveSource} from '../verification/live-source.mjs';
import {bindCurrencyFormatter} from './currency-formatter.mjs';
// Post-interpretation field evidence: canonical claims stay under the existing gate.
export function analyzeCurrencyResources({sources,candidates=[],bindings=[]}){
 const groups=new Map(),rows=[];
 for(const source of sources)for(const occurrence of source.occurrences??[]){const key=occurrence.service+'|'+occurrence.market;if(!groups.has(key))groups.set(key,[]);groups.get(key).push({source,occurrence});}
 for(const [target,entries] of groups){
  if(entries.length>256){rows.push({target,status:'UNRESOLVED',reason:'OCCURRENCE_COUNT_BOUND'});continue;}
  const scripts=entries.filter(e=>/\.js(?:[?#]|$)/i.test(e.occurrence.url));if(!scripts.length)continue;
  if(scripts.length>8){rows.push({target,status:'UNRESOLVED',reason:'RESOURCE_COUNT_BOUND'});continue;}
  if(scripts.some(e=>new Set(scripts.filter(s=>s.occurrence.url===e.occurrence.url).map(s=>s.source.sha256)).size>1)){rows.push({target,status:'UNRESOLVED',reason:'RESOURCE_CONTENT_CONFLICT'});continue;}
  const loaded=[];
  for(const e of entries){try{const x=loadLiveSource(e.occurrence,e.source.sha256,bindings);if(x.body.includes('<script')||scripts.includes(e))loaded.push({...e,body:x.body,url:e.occurrence.url,sha256:e.source.sha256,receipt:x.receipt});}catch{rows.push({target,status:'UNRESOLVED',reason:'RESOURCE_PROVENANCE_FAILURE',occurrence:e.occurrence.id});}}
  const docs=loaded.filter(e=>e.body.includes('<script'));if(docs.length>8){rows.push({target,status:'UNRESOLVED',reason:'DOCUMENT_COUNT_BOUND'});continue;}
  for(const document of docs)for(const resource of loaded.filter(e=>scripts.some(s=>s.occurrence.id===e.occurrence.id))){
   if(!document.body.includes(new URL(resource.url).pathname))continue;
   const offers=candidates.filter(c=>c.bodyHash===document.sha256&&c.service===document.occurrence.service&&c.market===document.occurrence.market).map(c=>({path:c.structuredPath,amount:c.amountNormalized,currency:c.currency,ownershipEstablished:!!c.product&&!c.ownershipAmbiguous&&!c.crossCardRisk&&c.attribution?.productOwnershipEstablished===true,ordinaryMonthly:c.commercial?.ordinaryMonthly===true,marketEstablished:c.attribution?.marketApplicabilityEstablished===true,conflictClear:(c.blockingReasons??[]).every(r=>/^CURRENCY_UNRESOLVED$/.test(r))}));
   try{rows.push({target,documentHash:document.sha256,resourceHash:resource.sha256,...bindCurrencyFormatter({document,resource,offers})});}catch{rows.push({target,status:'UNRESOLVED',reason:'UNSUPPORTED_FORMATTER_SOURCE'});}
  }
 }
 return {version:1,canonicalMutation:false,rows};
}
