import {youtubePremiumConsentRoute} from '../../research-v3/provider-consent-route.mjs';

const emptySha256='e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

// A hash-chained acquisition journal can justify a new, independently checked
// Browser attempt. The 302 body and pre-country check are not a G1 receipt.
export function documentedConsentRedirect(records,target,url){
 if(!Array.isArray(records))return null;
 const captures=records.filter(row=>row.type==='RESPONSE_CAPTURED'&&row.payload?.target?.taskId===target.id&&row.payload.target.service===target.service&&row.payload.target.market===target.market&&row.payload.url===url&&row.payload.status===302&&row.payload.bytes===0&&row.payload.bodyHash===emptySha256&&row.payload.proof?.tlsVerified===true&&row.payload.proof?.access==='PUBLIC'&&row.payload.proof.url===url&&youtubePremiumConsentRoute({serviceId:target.service,market:target.market,url,redirectUrl:row.payload.location}));
 if(captures.length!==1)return null;
 const capture=captures[0],binding=capture.payload.bindingRef;
 const attempts=records.filter(row=>row.type==='V2_ACQUISITION_RESULT'&&row.payload?.target?.id===target.id).flatMap(row=>row.payload.result?.attempts??[]).filter(row=>row.requestedUrl===url&&row.bindingRef===binding&&row.targetCountry===target.market&&row.failure==='TARGET_READ_FAILED'&&row.transportVerification?.before?.status==='MATCH'&&row.transportVerification.before.country===target.market&&row.transportVerification.after===null&&row.reads?.some(read=>read.url===url&&read.failure?.code==='AUTHORITY_POLICY_STOP'));
 if(attempts.length!==1||capture.payload.proof.bindingRef!==binding)return null;
 return {url:capture.payload.location,recordHash:capture.hash};
}
