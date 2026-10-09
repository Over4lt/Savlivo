// Persist an original public-provider response through the normal V2 journal boundary.
// Search text is never accepted here. No market or currency is inferred.
import fs from 'node:fs';import path from 'node:path';import {createHash,randomUUID} from 'node:crypto';
import {openMarketRunStore} from '../../research-v1/market-run-store.mjs';
import {interpretRun} from './runner.mjs';import {verifyRetainedRun} from './module-stage.mjs';
import {canonical} from '../../research-v3/model.mjs';
import {authorityBinding} from '../../research-v3/discovery-authority.mjs';
import {adaptV2CurrentSource} from '../../research-v3/v2-current-source-adapter.mjs';
import {evaluate} from '../../research-v3/truth.mjs';
import {autonomousProviderAuthorityDecision} from './provider-routing-authority.mjs';
const sha=x=>createHash('sha256').update(x).digest('hex');
const allowedAccessFields=new Set(['decision','reason','boundary','httpStatus','rule']);
function autonomousAuthority(target,page){
 const requested=autonomousProviderAuthorityDecision(target,page.requestedUrl??page.url),final=autonomousProviderAuthorityDecision(target,page.url);
 if(!requested||!final||requested.authority.hostname!==final.authority.hostname||page.providerAuthority?.provenance!=='V3_AUTONOMOUS_CANDIDATE_REVIEW'||canonical(page.providerAuthority.binding)!==canonical(final.providerAuthorityBinding))return null;
 return {status:'CONFIGURED_REVIEWED',hostname:final.authority.hostname,provider:target.serviceName,sourceType:'OFFICIAL_PROVIDER',sourceUrl:final.url,checkedAt:page.checkedAt??page.capturedAt??page.sourceIntegrity?.checkedAt??new Date().toISOString(),autonomousProviderAuthority:{provenance:'V3_AUTONOMOUS_CANDIDATE_REVIEW',binding:structuredClone(final.providerAuthorityBinding)}};
}
export function validateDirectProviderPage({target,page,directory}){
 const projected=autonomousAuthority(target,page),authority=projected??page.authority;
 if(page.outcome!=='OK'||page.httpStatus!==200||authority?.status!=='CONFIGURED_REVIEWED')throw Error('DIRECT_PROVIDER_AUTHORITY_REQUIRED');
 const host=new URL(page.url).hostname;
 if(authority.hostname!==host||authority.provider!==target.serviceName||!projected&&!target.authorities.some(a=>a.hostname===host&&a.provider===target.serviceName&&/^OFFICIAL_/.test(a.sourceType)))throw Error('DIRECT_PROVIDER_IDENTITY_MISMATCH');
 if(!page.bodyFile||!/^bodies\/[a-f0-9]{64}\.txt$/.test(page.bodyFile))throw Error('DIRECT_PROVIDER_BODY_REQUIRED');
 const body=fs.readFileSync(path.join(directory,page.bodyFile),'utf8');
 if(sha(body)!==page.bodyHash||sha(body)!==page.sourceIntegrity?.sha256)throw Error('DIRECT_PROVIDER_HASH_MISMATCH');
 if(!page.accessDecisions?.length||page.accessDecisions.some(d=>!['ALLOWED','NO_ROBOTS_POLICY'].includes(d.decision)))throw Error('DIRECT_PROVIDER_POLICY_UNPROVEN');
 return {...page,authority,rawSource:{text:body},acquisitionChannel:'DIRECT_PROVIDER'};
}
export function evaluateDirectProviderTruth({target,retained}){
 if(retained.truncated===true||retained.completeness==='INCOMPLETE')throw Error('DIRECT_PROVIDER_SOURCE_INCOMPLETE');
 const url=retained.url,host=new URL(url).hostname,objective={kind:'PRICE',serviceId:target.service,serviceName:target.serviceName,providerHosts:[host],markets:[target.market],seeds:[url]};
 const contentType=String(retained.contentType??'text/html').split(';')[0].trim().toLowerCase();
 const accessDecisions=retained.accessDecisions.map(row=>Object.fromEntries(Object.entries(row).filter(([key,value])=>allowedAccessFields.has(key)&&value!==undefined)));
 const observation=adaptV2CurrentSource({contractVersion:1,observationId:'direct-v3-'+retained.bodyHash.slice(0,24),target:{service:target.service,serviceName:target.serviceName,market:target.market},page:{url,requestedUrl:retained.requestedUrl??url,outcome:'OK',httpStatus:retained.httpStatus,contentType,bodyHash:retained.bodyHash,sourceIntegrity:{sha256:retained.sourceIntegrity.sha256},rawSource:{text:retained.rawSource.text},accessDecisions},providerAuthority:{status:'AUTHORITATIVE_PROVIDER',binding:authorityBinding(objective,url)},acquisition:{route:'DIRECT'}},objective);
 const truth=evaluate({objective,observations:[observation]});
 return {v3Observation:{id:observation.id,kind:observation.kind,url:observation.url,sha256:observation.sha256,context:observation.context,candidateCount:observation.candidates.length,nativeStructuredFacts:observation.nativeStructured?.facts?.length??0},v3Truth:truth};
}
export async function interpretDirectProvider({target,page,directory,interpret=interpretRun,verify=verifyRetainedRun,onReplayStage=()=>{}}){
 onReplayStage('SOURCE_VALIDATION');const retained=validateDirectProviderPage({target,page,directory});
 const v3=evaluateDirectProviderTruth({target,retained});
 const dir=path.join(directory,'direct-acquisitions','direct-'+randomUUID());onReplayStage('ACQUISITION_RECORD',{runDirectory:dir});fs.mkdirSync(dir,{recursive:true});
 const bridged=retained.authority.autonomousProviderAuthority?{hostname:retained.authority.hostname,provider:target.serviceName,sourceType:'OFFICIAL_PROVIDER',sourceUrl:retained.url,checkedAt:retained.authority.checkedAt,discoveryDomainBinding:{validated:true,service:target.service,hostname:retained.authority.hostname,authorityScope:'EXACT_HOST_PROVIDER_SOURCING',reference:structuredClone(retained.authority.autonomousProviderAuthority)}}:null;
 const interpretationTarget=bridged?{...target,urls:[...new Set([...(target.urls??[]),retained.url])],authorities:[...(target.authorities??[]),bridged]}:target;
 const manifest={version:'RESEARCH_V2_LIVE_V1',id:path.basename(dir),createdAt:new Date().toISOString(),inventory:[interpretationTarget],capabilities:{decodo:false,groq:false,browser:false,providerContact:false,productionVerified:false},productionVerified:false};
 fs.writeFileSync(dir+'/manifest.json',JSON.stringify(manifest,null,2));
 const store=openMarketRunStore(dir+'/journal');try{store.append('V2_ACQUISITION_RESULT',{target:interpretationTarget,result:{outcome:'OBSERVED',attempts:[{id:path.basename(dir),method:'DIRECT_PUBLIC',outcome:'OBSERVED',page:retained}]}});}finally{store.close();}
 onReplayStage('INTERPRETATION',{runDirectory:dir});await interpret(dir);onReplayStage('TARGETED_VERIFICATION',{runDirectory:dir});const verification=await verify(dir);
 return {...v3,priceEvidenceNeeds:verification.priceEvidenceNeedsByTarget?.[target.id]??null,url:page.url,runDirectory:dir,classification:verification.verified.length?'VERIFIED_OUTPUT':'DIRECT_FIELDS_INSUFFICIENT',acquired:true,usable:verification.usable,monetary:verification.monetaryFacts,verified:verification.verified,sufficient:verification.verified.length>0,blockers:verification.blockers,channel:'DIRECT_PROVIDER',hardStop:false};
}
export function directGeoGap(outcome){
 // A successful body with unresolved fields is not an acquisition failure.
 // Concrete transient failures are handled by providerAccessGap before interpretation.
 return outcome?.acquisitionEscalation?.eligible===true;
}
