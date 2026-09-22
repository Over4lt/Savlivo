// Reuse hash-bound, previously interpreted provider artifacts. This does not admit prices.
import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';
import {usableResearchMemory} from './research-memory.mjs';import {normalizeFrontierUrl} from './source-frontier.mjs';
const sha=x=>createHash('sha256').update(x).digest('hex'),norm=u=>normalizeFrontierUrl(u).url;
function read(file){const p=path.resolve(file);if(!p.startsWith(process.cwd()+path.sep)||fs.lstatSync(p).isSymbolicLink())throw Error('OUTSIDE_RETAINED_ROOT');return JSON.parse(fs.readFileSync(p));}
export function retainedSuccesses(t){
 const memory=usableResearchMemory(t);if(memory.rejected)return [];
 return [...new Map(memory.attempts.filter(a=>a.route==='DIRECT'&&a.outcome==='OK'&&a.bodyHash).map(a=>[norm(a.finalUrl??a.url)+'|'+a.bodyHash,a])).values()].map(a=>{
 const url=norm(a.finalUrl??a.url),key=sha(JSON.stringify([url,a.bodyHash,a.reference]));let observations=[],intact=false,capturedAt=a.capturedAt??null;
 try{const doc=read(a.reference.path);if(doc.summary?.service===t.service&&doc.summary.market===t.market&&doc.summary.hash===a.bodyHash&&doc.receipt?.intact&&doc.receipt.serviceEstablished){observations=doc.observations??[];intact=true;}
 else{const source=(doc.targets??[doc]).find(s=>s.service===t.service&&s.market===t.market),page=source?.reads?.find(r=>r.bodyHash===a.bodyHash&&[r.requestedUrl,r.url].filter(Boolean).some(u=>norm(u)===url));if(page?.bodyFile){const f=path.resolve(path.dirname(a.reference.path),page.bodyFile);if(f.startsWith(path.resolve(path.dirname(a.reference.path))+path.sep)&&sha(fs.readFileSync(f))===a.bodyHash)intact=true;capturedAt=page.sourceIntegrity?.checkedAt??capturedAt;}
 for(const p of source?.providerInterpretations??[]){if(!p.runDirectory||norm(p.url)!==url)continue;const children=fs.readdirSync(p.runDirectory).filter(n=>/^interpretation-\d+$/.test(n)).sort();for(const child of children){const f=p.runDirectory+'/'+child+'/provider-price-intelligence.json';if(fs.existsSync(f))observations.push(...read(f).observations.filter(o=>o.source?.hash===a.bodyHash));}}
 }
 }catch{intact=false;}
 const authorized=t.authorities?.some(x=>x.hostname===new URL(url).hostname&&x.provider===t.serviceName&&x.checkedAt&&['OFFICIAL_PROVIDER','OFFICIAL_SUPPORT'].includes(x.sourceType)),invalidation=(t.invalidatedEvidence??[]).includes(a.bodyHash),now=Date.parse(t.researchAsOf??''),at=Date.parse(capturedAt??''),stale=Number.isFinite(now)&&Number.isFinite(at)&&now-at>(t.retainedMaxAgeDays??30)*86400000;
 const relevant=observations.filter(o=>o.service===t.service&&o.source?.kind==='ORIGINAL_PROVIDER'&&o.source.hash===a.bodyHash),sufficient=!stale&&relevant.find(o=>['HIGH','MEDIUM'].includes(o.confidence)&&o.fields?.provenance?.status==='ESTABLISHED'&&(o.market===t.market||t.researchObjective==='SERVICE_COVERAGE'));
 return {key,url,bodyHash:a.bodyHash,reference:a.reference,intact:intact&&authorized&&!invalidation,capturedAt,stale,invalidated:!authorized||invalidation,observations:relevant.length,unresolvedFields:[...new Set(relevant.flatMap(o=>o.blockers??[]))],fieldsResolved:[...new Set(relevant.flatMap(o=>Object.entries(o.fields??{}).filter(([,v])=>v.status==='ESTABLISHED').map(([k])=>k)))],sufficient:sufficient?{sourceBound:true,confidence:sufficient.confidence,market:sufficient.market,objective:t.researchObjective,sourceHash:a.bodyHash,artifact:a.reference.path}:null,reviewed:(t.retainedReviews??[]).some(r=>r.key===key)};
 });
}
export function consumeRetainedSuccess(t,key){const r=retainedSuccesses(t).find(r=>r.key===key);if(!r?.intact)throw Error('RETAINED_SOURCE_RECONCILIATION_REQUIRED');return {key:r.key,url:r.url,sourceHash:r.bodyHash,reference:r.reference,retainedPriceReview:r.sufficient,fieldsResolved:r.fieldsResolved,blockers:r.unresolvedFields,stale:r.stale,networkRequests:0,meaning:'REUSE_EXISTING_PROVIDER_INTERPRETATION_NOT_NEW_ADMISSION'};}
