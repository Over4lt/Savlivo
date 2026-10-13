import {normalizePublicUrl} from '../../research-v1/public-network.mjs';

const safe=value=>{try{return normalizePublicUrl(value).href;}catch{return null;}};

// One projection boundary for every accepted V3 provider observation. A
// continuation is routing knowledge only; acquisition and the normal authority
// and Truth boundaries remain responsible for anything it points at.
export function projectSourceBoundContinuations({target,outcome,add}){
 const parent=outcome?.v3Observation;if(!parent||typeof add!=='function')return {considered:0,projected:0,rejected:[]};
 const rejected=[];let projected=0,considered=0;
 for(const row of outcome.v3Continuations??[]){
  considered++;const url=safe(row?.url),reason=!url?'UNSAFE_URL':row?.truthAuthority!=='NONE'||row?.authority===true?'CONTINUATION_CLAIMS_AUTHORITY':row?.source?.bodySha256!==parent.sha256?'PARENT_HASH_MISMATCH':row?.source?.observation!==parent.id?'PARENT_OBSERVATION_MISMATCH':!Number.isSafeInteger(row?.source?.start)||!Number.isSafeInteger(row?.source?.end)||row.source.start<0||row.source.start>=row.source.end||typeof row?.source?.sha256!=='string'?'SOURCE_LOCATOR_INVALID':null;
  if(reason){rejected.push({id:row?.id??null,url:url??row?.url??null,reason});continue;}
 add({url,title:row.label,originKind:'CHILD',navigationOnly:true,sourceBoundCandidate:true,continuationId:row.id,continuationKind:row.kind,continuationScore:row.score,continuationNeeds:structuredClone(row.needs??[]),continuationContext:row.context??null,continuationLocale:row.locale??null,continuationState:row.state??null,continuationSignals:structuredClone(row.signals??{}),continuationAcquisitionContext:structuredClone(parent.context??null),continuationResearchContext:{targetId:target.id??null,service:target.service??null,serviceName:target.serviceName??null,targetMarket:target.market??null,candidateServiceId:target.providerSeedCandidateServiceContext?.sourceServiceId??null,providerRelationship:structuredClone(target.providerSeedCandidateServiceContext?.providerRelationship??target.providerSeedCandidateServiceContext?.sourceRelationship??null)},from:{url:parent.url,bodyHash:row.source.bodySha256,observation:parent.id,acquisitionContext:structuredClone(parent.context??null),locator:structuredClone(row.source),mechanism:'V3_SOURCE_BOUND_CONTINUATION'},source:structuredClone(row.source),canContributeEvidence:false,evidenceStatus:'DISCOVERY_LEAD_ONLY',authoritative:false,truthAuthority:'NONE'});projected++;
 }
 if(projected){target.sourceBoundContinuationParents??=[];const key=JSON.stringify([parent.id,parent.url,parent.sha256]);if(!target.sourceBoundContinuationParents.some(row=>JSON.stringify([row.id,row.url,row.sha256])===key))target.sourceBoundContinuationParents.push({id:parent.id,url:parent.url,sha256:parent.sha256,context:structuredClone(parent.context??null),accepted:true,meaning:'ROUTING_PROVENANCE_NOT_EVIDENCE'});}
 return {considered,projected,rejected};
}
