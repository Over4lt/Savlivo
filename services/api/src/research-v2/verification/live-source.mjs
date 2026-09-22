import '../offline-replay/offline-guard.mjs';
import {readHistoricalReference,resolveGeoOccurrence} from '../offline-recovery/geo-evidence.mjs';
import {readOccurrence,statuses} from '../offline-replay/corpus.mjs';
import {hash} from '../offline-recovery/extract.mjs';
import {validateStructuredRelationship} from '../../research-v1/associated-structured-resources.mjs';
import fs from 'node:fs';import path from 'node:path';
const catalogs=new Map();
function serviceCatalog(occurrence,root){const file=path.resolve(root,path.dirname(occurrence.record.path),'../manifest.json');if(!catalogs.has(file)){try{catalogs.set(file,JSON.parse(fs.readFileSync(file)).inventory.map(({service,serviceName,market})=>({service,serviceName,market})));}catch{catalogs.set(file,[]);}}return catalogs.get(file);}
// Authority derives from the retained reviewed acquisition contract, not from a
// guessed domain or the task's requested market. All references are re-opened.
export function loadLiveSource(occurrence,expectedHash,bindings,root=process.cwd()){
 const checked=readOccurrence(occurrence,root);if(checked.status!==statuses.intact||checked.hash!==expectedHash)throw Error('PROVENANCE_INTEGRITY_FAILURE');
 const page=readHistoricalReference(occurrence.record,root),target=readHistoricalReference({...occurrence.record,pointer:'/target'},root);
 const host=new URL(page.url).hostname;
 const configured=page.authority?.status==='CONFIGURED_REVIEWED'&&page.authority.hostname===host&&target.authorities?.some(a=>a.hostname===host&&a.provider===page.authority.provider&&a.provider===target.serviceName&&/^OFFICIAL_/.test(a.sourceType));
 const derived=page.authority?.status==='DERIVED_EXACT_RESOURCE'&&validateStructuredRelationship(page)===true;
 const serviceEstablished=!!(configured||derived)&&target.service===occurrence.service&&target.market===occurrence.market&&target.id===occurrence.taskId&&page.url===occurrence.url;
 const geo=resolveGeoOccurrence(occurrence,expectedHash,new Map(),root);
 const bound=bindings.filter(b=>b.sourceOccurrenceId===occurrence.id&&b.bodyHash===expectedHash&&b.taskId===target.id&&b.record.path===occurrence.record.path&&b.record.hash===occurrence.record.hash&&b.record.pointer===occurrence.record.pointer);
 return {body:checked.body,context:{bodyHash:expectedHash,service:target.service,serviceCatalog:serviceCatalog(occurrence,root),market:target.market,authority:serviceEstablished,geoEvidence:[geo],sourceOccurrences:[occurrence],sourceOccurrenceIds:[occurrence.id]},receipt:{intact:true,bodyHash:expectedHash,service:target.service,serviceEstablished,bindingEstablished:bound.length>0,sourceOccurrenceId:occurrence.id,sourceUrl:page.url,record:occurrence.record,targetReference:{...occurrence.record,pointer:'/target'},serviceEvidence:{authority:page.authority,targetService:target.service,targetServiceName:target.serviceName,matchedAuthority:configured?'CONFIGURED_REVIEWED':derived?'DERIVED_EXACT_RESOURCE':null},geo,bindings:bound.map(b=>({bindingId:b.bindingId,candidateId:b.candidateId,factId:b.factId,attemptId:b.attemptId}))}};
}
