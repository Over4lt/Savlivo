// Pure outer projection of already-evaluated V3 state. This module does not
// acquire evidence, re-run Truth, or change admission/catalog semantics.
import {canonical,requiredPricePropositions} from '../../research-v3/model.mjs';

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

export function projectEstablishedV3Offerings(target){
 const truth=target?.v3Truth;if(!truth||!Array.isArray(truth.offers))return [];
 const projected=[];
 for(const offer of truth.offers){
  const propositions=stateOf(offer),market=propositions.TARGET_MARKET?.state==='ESTABLISHED'?propositions.TARGET_MARKET.value:offer.market;
  if(typeof market!=='string'||!established(offer,truth,market))continue;
  const references=sourceReferences(offer),marketReference=propositions.TARGET_MARKET?.evidence?.[0]?.reference;
  projected.push({
   id:offer.id??null,name:offer.name??offer.plan??null,market,established:true,
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

export function projectTargetV3Result(target){
 if(!target?.v3Truth)return null;
 const direct=[...(target.providerInterpretations??[])].reverse().find(row=>row?.v3Observation?.context?.transport==='DIRECT');
 const legacyDiagnostics=target.researchDiagnosis?[{kind:'RESEARCH_DIAGNOSIS',value:target.researchDiagnosis,source:'LEGACY_V2',phase:direct?'DIRECT':null,sourceObservationId:direct?.v3Observation?.id??null,governsV3Offerings:false}]:[];
 return {offerings:projectEstablishedV3Offerings(target),catalog:clone(target.v3Catalog??null),legacyDiagnostics};
}
