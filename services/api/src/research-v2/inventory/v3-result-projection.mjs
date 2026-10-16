// Pure outer projection of already-evaluated V3 state. This module does not
// acquire evidence, re-run Truth, or change admission/catalog semantics.
import {canonical,digest,requiredPricePropositions} from '../../research-v3/model.mjs';

const clone=value=>value===undefined?undefined:structuredClone(value);
const stateOf=offer=>offer?.propositions??{};
const established=(offer,truth,market)=>requiredPricePropositions.every(name=>stateOf(offer)[name]?.state==='ESTABLISHED')&&truth?.eligibility?.[market]?.result==='ELIGIBLE';
const referenceKey=reference=>canonical(reference);

function sourceReferences(offer){
 const references=[];
 for(const proposition of Object.values(stateOf(offer)))for(const row of proposition?.evidence??[]){
  const reference=row?.reference;if(reference&&!references.some(existing=>referenceKey(existing)===referenceKey(reference)))references.push(clone(reference));
 }
 return references;
}

function sourceProjection(target,references){
 const observation=target?.v3Observation,ids=new Set(references.map(reference=>reference.observation).filter(Boolean)),hashes=new Set(references.map(reference=>reference.sha256).filter(Boolean));
 if(!observation||ids.size&&!ids.has(observation.id)||hashes.size&&!hashes.has(observation.sha256))return null;
 return {observationId:observation.id,url:observation.url,bodyHash:observation.sha256,context:clone(observation.context)};
}

function exactOfferIdentity(target,propositions){
 const observation=target?.v3Observation;if(!observation)return null;let selected=null;
 for(const name of requiredPricePropositions.filter(name=>name!=='SERVICE_IDENTITY')){
  const identities=[];for(const row of propositions[name]?.evidence??[]){const reference=row?.reference,source=reference?.source,locator=source?.offerIdentity,offerName=source?.offer;
   if(reference?.observation!==observation.id||reference?.sha256!==observation.sha256||locator?.kind!=='SPAN'||!Number.isSafeInteger(locator.start)||!Number.isSafeInteger(locator.end)||locator.end<=locator.start||typeof locator.quote!=='string'||!locator.quote||digest(locator.quote)!==locator.sha256||offerName!==locator.quote)continue;
   identities.push({name:locator.quote,observation:reference.observation,bodySha256:reference.sha256,locator:clone(locator)});
  }
  const unique=new Map(identities.map(identity=>[canonical(identity),identity]));if(unique.size!==1)return null;const current=[...unique.values()][0];if(selected&&canonical(selected)!==canonical(current))return null;selected=current;
 }
 return selected;
}

export function projectEstablishedV3Offerings(target){
 const truth=target?.v3Truth;if(!truth||!Array.isArray(truth.offers))return [];
 const projected=[];
 for(const offer of truth.offers){
  const propositions=stateOf(offer),market=propositions.TARGET_MARKET?.state==='ESTABLISHED'?propositions.TARGET_MARKET.value:offer.market;
  if(typeof market!=='string'||!established(offer,truth,market))continue;
  const references=sourceReferences(offer),marketReference=propositions.TARGET_MARKET?.evidence?.[0]?.reference,offerIdentity=exactOfferIdentity(target,propositions);
  projected.push({
   id:offer.id??null,name:offer.name??offer.plan??offerIdentity?.name??null,...(offerIdentity?{offerIdentity}:{}),market,established:true,
   ordinaryRecurringPrice:{amount:propositions.PRICE_AMOUNT.value,currency:propositions.CURRENCY.value},
   subscription:{monthly:propositions.MONTHLY_SUBSCRIPTION.value,consumer:propositions.CONSUMER_SUBSCRIPTION.value,billingInterval:propositions.MONTHLY_SUBSCRIPTION.value===true?'P1M':null,displayMonthlyCadence:propositions.MONTHLY_CADENCE?.state==='ESTABLISHED'?propositions.MONTHLY_CADENCE.value:null},
   eligibility:clone(truth.eligibility[market]),
   propositionStates:Object.fromEntries(Object.entries(propositions).map(([name,value])=>[name,value.state])),
   source:sourceProjection(target,references),sourceReferences:references,
   countryContext:clone(marketReference?.marketContext??null)
  });
 }
 return projected;
}

const verificationPropositions=['SERVICE_IDENTITY','PRICE_AMOUNT','CURRENCY','MONTHLY_SUBSCRIPTION','CONSUMER_SUBSCRIPTION','TARGET_MARKET','MONTHLY_CADENCE'];
// Diagnostic projection only. Every field comes from the already-evaluated
// offering/source projection; this never re-runs or reinterprets Truth.
export function projectV3VerificationEvidence(target){
 return projectEstablishedV3Offerings(target).map(row=>{
  const source=row.source,observation=source?target?.v3Observation:null,route=source?.context?.transport??null,acquiredAt=[observation?.acquiredAt,observation?.observedAt,observation?.checkedAt,observation?.timestamp].find(value=>typeof value==='string')??null,rendered=typeof observation?.renderParentObservation==='string';
  return {
   provider:typeof target?.serviceName==='string'?target.serviceName:null,
   serviceId:typeof target?.service==='string'?target.service:null,
   targetMarket:typeof target?.market==='string'?target.market:null,
   plan:row.name??row.id,
   exactOfferId:row.id,
   offerIdentityName:row.offerIdentity?.name??null,
   amount:row.ordinaryRecurringPrice.amount,
   currency:row.ordinaryRecurringPrice.currency,
   sourceUrl:source?.url??row.sourceReferences.find(reference=>reference?.url)?.url??null,
   sourceAuthority:typeof observation?.authority==='string'?observation.authority:null,
   transport:rendered?'RENDERED':route,
   acquisitionTransport:rendered?route:null,
   networkGeography:source?.context?.networkGeography??null,
   observationId:source?.observationId??null,
   bodySha256:source?.bodyHash??null,
   truthMarket:row.market,
   eligibility:row.eligibility?.result??null,
   verification:'authoritative-provider',
   verifiedAt:acquiredAt,
   verifiedByAgreement:false,
   propositionStates:Object.fromEntries(verificationPropositions.filter(name=>Object.hasOwn(row.propositionStates,name)).map(name=>[name,row.propositionStates[name]]))
  };
 });
}

export function projectTargetV3Result(target){
 if(!target?.v3Truth)return null;
 const direct=[...(target.providerInterpretations??[])].reverse().find(row=>row?.v3Observation?.context?.transport==='DIRECT');
 const legacyDiagnostics=target.researchDiagnosis?[{kind:'RESEARCH_DIAGNOSIS',value:target.researchDiagnosis,source:'LEGACY_V2',phase:direct?'DIRECT':null,sourceObservationId:direct?.v3Observation?.id??null,governsV3Offerings:false}]:[];
 return {suggested:clone(target.v3SuggestedCandidates??[]),offerings:projectEstablishedV3Offerings(target),catalog:clone(target.v3Catalog??null),legacyDiagnostics};
}
