// Persist an original public-provider response through the normal V2 journal boundary.
// Search text is never accepted here. No market or currency is inferred.
import fs from 'node:fs';import path from 'node:path';import {createHash,randomUUID} from 'node:crypto';
import {openMarketRunStore} from '../../research-v1/market-run-store.mjs';
import {interpretRun} from './runner.mjs';import {verifyRetainedRun} from './module-stage.mjs';
const sha=x=>createHash('sha256').update(x).digest('hex');
export function validateDirectProviderPage({target,page,directory}){
 if(page.outcome!=='OK'||page.httpStatus!==200||page.authority?.status!=='CONFIGURED_REVIEWED')throw Error('DIRECT_PROVIDER_AUTHORITY_REQUIRED');
 const host=new URL(page.url).hostname;
 if(page.authority.hostname!==host||page.authority.provider!==target.serviceName||!target.authorities.some(a=>a.hostname===host&&a.provider===target.serviceName&&/^OFFICIAL_/.test(a.sourceType)))throw Error('DIRECT_PROVIDER_IDENTITY_MISMATCH');
 if(!page.bodyFile||!/^bodies\/[a-f0-9]{64}\.txt$/.test(page.bodyFile))throw Error('DIRECT_PROVIDER_BODY_REQUIRED');
 const body=fs.readFileSync(path.join(directory,page.bodyFile),'utf8');
 if(sha(body)!==page.bodyHash||sha(body)!==page.sourceIntegrity?.sha256)throw Error('DIRECT_PROVIDER_HASH_MISMATCH');
 if(!page.accessDecisions?.length||page.accessDecisions.some(d=>!['ALLOWED','NO_ROBOTS_POLICY'].includes(d.decision)))throw Error('DIRECT_PROVIDER_POLICY_UNPROVEN');
 return {...page,rawSource:{text:body},acquisitionChannel:'DIRECT_PROVIDER'};
}
export async function interpretDirectProvider({target,page,directory,interpret=interpretRun,verify=verifyRetainedRun,onReplayStage=()=>{}}){
 onReplayStage('SOURCE_VALIDATION');const retained=validateDirectProviderPage({target,page,directory});
 const dir=path.join(directory,'direct-acquisitions','direct-'+randomUUID());onReplayStage('ACQUISITION_RECORD',{runDirectory:dir});fs.mkdirSync(dir,{recursive:true});
 const manifest={version:'RESEARCH_V2_LIVE_V1',id:path.basename(dir),createdAt:new Date().toISOString(),inventory:[target],capabilities:{decodo:false,groq:false,browser:false,providerContact:false,productionVerified:false},productionVerified:false};
 fs.writeFileSync(dir+'/manifest.json',JSON.stringify(manifest,null,2));
 const store=openMarketRunStore(dir+'/journal');try{store.append('V2_ACQUISITION_RESULT',{target,result:{outcome:'OBSERVED',attempts:[{id:path.basename(dir),method:'DIRECT_PUBLIC',outcome:'OBSERVED',page:retained}]}});}finally{store.close();}
 onReplayStage('INTERPRETATION',{runDirectory:dir});await interpret(dir);onReplayStage('TARGETED_VERIFICATION',{runDirectory:dir});const verification=await verify(dir);
 return {priceEvidenceNeeds:verification.priceEvidenceNeedsByTarget?.[target.id]??null,url:page.url,runDirectory:dir,classification:verification.verified.length?'VERIFIED_OUTPUT':'DIRECT_FIELDS_INSUFFICIENT',acquired:true,usable:verification.usable,monetary:verification.monetaryFacts,verified:verification.verified,sufficient:verification.verified.length>0,blockers:verification.blockers,channel:'DIRECT_PROVIDER',hardStop:false};
}
export function directGeoGap(outcome){
 // A successful body with unresolved fields is not an acquisition failure.
 // Concrete transient failures are handled by providerAccessGap before interpretation.
 return outcome?.acquisitionEscalation?.eligible===true;
}
