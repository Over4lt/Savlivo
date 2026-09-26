// Bounded deterministic source comprehension. Unsupported language/structure stays
// unresolved. Pricing observations (including normalized P1M) are never inputs.
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import {decodeEntities} from '../live/source-frontier-links.mjs';
import {inspectLoginManage} from './login-manage.mjs';
import {admissionContract,sealAdmissionEvidence,mergeAdmissionEvidence} from './service-admission.mjs';
const escaped=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const text=raw=>decodeEntities(raw.replace(/<[^>]*>/g,' ')).replace(/\s+/g,' ').trim();
const consumer=/\b(?:subscription|membership)\b/i;
const contextual=/\b(?:benefit|value|worth|savings|insurance|included|installments?|instalments?|financing|equivalent|works out|divided|usage|allowance|business|enterprise|employee|corporate|gift)\b/i;
const negative=/\b(?:not|never|cannot|can't|no longer|used to|previously|formerly|may|might|could|would|if)\b|\?/i;
function monthlyFact(quote,serviceName){
 const serviceWide=new RegExp('^'+escaped(serviceName??'')+'\\s+(?:offers|provides)\\s+only\\s+(?:annual|yearly|12-month)\\s+(?:consumer\\s+)?(?:subscriptions|memberships)[.!]?$','i');
 if(serviceName&&serviceWide.test(quote)&&!negative.test(quote))return {status:'DISQUALIFIED',reason:'SERVICE_EXPLICITLY_NON_MONTHLY',scope:'ALL_SERVICE_CONSUMER_OFFERS',subject:serviceName};
 if(!consumer.test(quote))return null;
 const own=new RegExp('^(?:(?:your|our|this|the)\\s+(?:consumer\\s+)?(?:subscription|membership)|'+escaped(serviceName??'')+'(?:\\s+[\\p{L}\\p{N}+_-]+){0,3}\\s+(?:subscription|membership))\\s+(?:is|will|automatically|renews?|costs|includes|could)\\b','iu');
 if(!serviceName||!own.test(quote))return {status:'UNRESOLVED',reason:'CONSUMER_PROPOSITION_OWNERSHIP_UNRESOLVED'};
 if(contextual.test(quote))return {status:'UNRESOLVED',reason:'CONTEXTUAL_OR_NON_RECURRING_VALUE'};
 // Actual charge/renewal predicate is mandatory, not a monthly-looking number.
 if(negative.test(quote))return {status:'UNRESOLVED',reason:'MONTHLY_BILLING_ASSERTION_UNPROVEN'};
 if(/\b(?:annual|annually|year|yearly|12 months|twelve months)\b/i.test(quote))return {status:'UNRESOLVED',reason:'NON_MONTHLY_OFFER_NOT_SERVICE_DISQUALIFICATION'};
 const cadence='(?:monthly|every (?:calendar )?month|each (?:calendar )?month|per calendar month)';
 const billed=new RegExp('\\b(?:billed|charged|payable|renews?|renewed)\\s+(?:automatically\\s+)?'+cadence+'\\b','i');
 const renewed=/\b(?:membership|subscription)\b.{0,100}\bautomatically renews?\b.{0,35}\b(?:each|every) month\b/i;
 if(!billed.test(quote)&&!renewed.test(quote))return {status:'UNRESOLVED',reason:'MONTHLY_BILLING_CADENCE_MISSING'};
 return {status:'ESTABLISHED',reason:'EXPLICIT_CONSUMER_CALENDAR_MONTH_BILLING',billingInterval:'P1M',commercialRole:'CONSUMER_SUBSCRIPTION_BILLING',subject:quote};
}
function sizeFact(quote,serviceName){
 if(!serviceName||/\b(?:downloads?|visits?|views?|followers?|group|parent|combined|industry|market size|potential|forecast|expects?|aims?)\b/i.test(quote))return null;
 const match=quote.match(new RegExp('^'+escaped(serviceName)+'\\s+(?:has|serves|counts)\\s+(?:(over|more than|at least|approximately|about|up to|fewer than)\\s+)?([0-9][0-9,]*(?:\\.[0-9]+)?)\\s*(million|billion|thousand)?\\s+(active users|paying subscribers|users|members|customers|subscribers)\\b','i'));
 if(!match||negative.test(quote))return null;
 // A subset (for example one country) or historical figure is not an exact
 // current service-total count. Do not disqualify the service from that subset.
 if(!/^(?:\s+(?:worldwide|globally|in total))?[.!]?$/.test(quote.slice(match[0].length)))return null;
 const count=Number(match[2].replaceAll(',',''))*({million:1e6,billion:1e9,thousand:1e3}[match[3]?.toLowerCase()]??1),qualifier=match[1]?.toLowerCase()??'exact';
 if(!Number.isSafeInteger(count)||count<0)return null;
 const lower=['exact','over','more than','at least'].includes(qualifier),upper=['exact','up to','fewer than'].includes(qualifier);
 const status=lower&&count>=admissionContract.minimumUsers?'ESTABLISHED':upper&&count<admissionContract.minimumUsers?'DISQUALIFIED':'UNRESOLVED';
 return {status,reason:status==='ESTABLISHED'?'SERVICE_ATTRIBUTED_AUDIENCE_THRESHOLD_MET':status==='DISQUALIFIED'?'SERVICE_SIZE_BELOW_THRESHOLD':'SERVICE_SIZE_BOUND_INSUFFICIENT',count,metric:match[4].toLowerCase(),qualifier,subject:serviceName,scope:'EXACT_SERVICE'};
}
export function inspectServiceAdmission({body,sourceHash,url,service,serviceName,authority,capturedAt,reference}){
 if(typeof body!=='string'||body.length>8000000||createHash('sha256').update(body).digest('hex')!==sourceHash||reference?.hash!==sourceHash||authority?.status!=='CONFIGURED_REVIEWED'||authority.provider!==serviceName)return null;
 try{if(new URL(url).hostname!==authority.hostname)return null;}catch{return null;}
 const facts=[],visible=body.replace(/<!--[\s\S]*?-->|<(script|style|nav|footer|header|blockquote)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,m=>' '.repeat(m.length));
 for(const m of visible.matchAll(/<(p|li)\b[^>]*>([\s\S]*?)<\/\1\s*>/gi)){
  const paragraph=text(m[2]);if(paragraph.length>1600)continue;
  // Sentence boundaries retain decimals and keep qualifications within each claim.
  for(const quote of paragraph.split(/(?<=[.!;])\s+(?=[A-Z])/u)){
   const locator={offset:m.index,length:m[0].length,coordinate:'UTF16_CODE_UNITS'},monthly=monthlyFact(quote,serviceName),size=sizeFact(quote,serviceName);
   if(monthly){if(monthly.status==='ESTABLISHED'&&(contextual.test(paragraph)||/\b(?:annual|annually|yearly|12 months|twelve months)\b/i.test(paragraph)))Object.assign(monthly,{status:'UNRESOLVED',reason:'PARAGRAPH_BILLING_QUALIFICATION'});facts.push({dimension:'monthlyRecurring',...monthly,quote,locator});}
   if(size)facts.push({dimension:'serviceSize',...size,quote,locator});
   const subscribers=escaped(serviceName)+'\\s+(?:subscribers|members)\\s+(?:cannot|can no longer)\\s+';
   const blockedLogin=new RegExp('^'+subscribers+'(?:log|sign) in\\s+to\\s+(?:their|an?)\\s+account[.!]?$','i');
   const blockedManage=new RegExp('^'+subscribers+'manage\\s+their\\s+(?:subscription|membership)\\s+(?:in|through)\\s+their\\s+account[.!]?$','i');
   if(blockedLogin.test(quote))facts.push({dimension:'accountLogin',status:'DISQUALIFIED',scope:'ALL_SERVICE_SUBSCRIBERS',reason:'SUBSCRIBER_LOGIN_EXPLICITLY_UNAVAILABLE',quote,locator});
   if(blockedManage.test(quote))facts.push({dimension:'membershipManagement',status:'DISQUALIFIED',scope:'ALL_SERVICE_SUBSCRIBERS',reason:'ACCOUNT_MEMBERSHIP_MANAGEMENT_EXPLICITLY_UNAVAILABLE',quote,locator});
  }
 }
 const capability=inspectLoginManage({body,sourceHash,url,service,provider:serviceName,authorityEstablished:true,reference});
 for(const p of capability.login)facts.push({dimension:'accountLogin',status:'ESTABLISHED',reason:'PROVIDER_ACCOUNT_LOGIN',quote:p.providerText,locator:p.locator,destination:p.destination??null});
 for(const p of capability.management.filter(p=>/ACCOUNT/.test(p.meaning)&&/\b(?:account|konto|compte|cuenta|conta)\b/i.test(p.providerText)))facts.push({dimension:'membershipManagement',status:'ESTABLISHED',reason:'PROVIDER_ACCOUNT_MEMBERSHIP_MANAGEMENT',quote:p.providerText,locator:p.locator});
 const independence=reviewedIndependence(authority.qualificationEvidenceReview,{service,url,sourceHash});
 // Direct declarations (including reviewed provider FAQs/support) retain their
 // explicit sufficiency rule. A reviewed corroborating observation can instead
 // enter the shared threshold; merely calling it independent never strengthens it.
 const strength=authority.qualificationEvidenceReview?'STRONG':'DIRECT';
 return sealAdmissionEvidence({service,url,sourceHash,capturedAt,reference,strength,dependencyRoots:independence??['provider:'+service],authority:{status:authority.status,service,provider:serviceName,hostname:authority.hostname,sourceType:authority.sourceType,qualificationEvidenceReview:authority.qualificationEvidenceReview??null,ownershipReference:authority.ownershipReview??authority.ownershipReference??null},facts});
}
function reviewedIndependence(reference,{service,url,sourceHash}){
 // Never infer independent origins from separate URLs, hosts or captures. A
 // frozen, source-specific review must identify the underlying evidence roots.
 if(!reference?.path||!reference.sha256)return null;
 try{
  if(fs.statSync(reference.path).size>32768)return null;
  const bytes=fs.readFileSync(reference.path),review=JSON.parse(bytes);
  if(createHash('sha256').update(bytes).digest('hex')!==reference.sha256||review.version!=='QUALIFICATION_INDEPENDENCE_REVIEW_V1'||review.proofKind!=='CORROBORATING_OBSERVATION'||review.status!=='REVIEWED'||!review.reviewer||!review.reason||review.service!==service||review.url!==url||review.sourceHash!==sourceHash||!Array.isArray(review.rootIds)||!review.rootIds.length||review.rootIds.length>16||review.rootIds.some(id=>typeof id!=='string'||!id))return null;
  return review.rootIds.map(id=>'reviewed-origin:'+id);
 }catch{return null;}
}
export function observeAdmissionSource(target,page,body,reference,options){
 const proof=inspectServiceAdmission({body,sourceHash:page.bodyHash,url:page.url,service:target.service,serviceName:target.serviceName,authority:page.authority,capturedAt:page.sourceIntegrity?.checkedAt??page.capturedAt??page.checkedAt,reference});
 return mergeAdmissionEvidence(target,proof,options);
}
