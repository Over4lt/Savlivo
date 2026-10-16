// Research-level projection of explicit source-bound monthly prices.
// This output is independent of Truth: it neither admits evidence to Truth nor
// changes any proposition, provider binding, market or catalog decision.
import {authorityBinding} from './discovery-authority.mjs';
import {canonical,digest,providerBound} from './model.mjs';
import {projectObservation} from './projection.mjs';

export const suggestedProjectionLimits=Object.freeze({scripts:32,scriptBytes:1_000_000,nodes:20_000,depth:32,candidates:64});
const currencies=new Set(Intl.supportedValuesOf('currency'));
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const finite=value=>typeof value==='number'&&Number.isFinite(value)||typeof value==='string'&&/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value);
const pointer=(base,key)=>base+'/'+String(key).replaceAll('~','~0').replaceAll('/','~1');
const established=value=>value?.state==='ESTABLISHED';
const referenceOf=proposition=>proposition?.evidence?.find(row=>row?.reference)?.reference??null;
const sourceName=reference=>reference?.source?.offer??reference?.source?.offerIdentity?.quote??null;
const monthlyOffer=offer=>offer&&Number.isFinite(offer.amount)&&offer.amount>0&&currencies.has(offer.currency)&&offer.billingCadence==='MONTHLY'&&['SUBSCRIPTION','MEMBERSHIP'].includes(offer.relationship)&&offer.role==='ORDINARY'&&offer.amountDerivation==='EXPLICIT';
function sourceAligned(observation,objective,truth,projection){
 if(projection.source.serviceId===objective.serviceId)return true;
 const identity=truth?.service?.SERVICE_IDENTITY,reference=referenceOf(identity);
 return established(identity)&&identity.value===true&&reference?.observation===observation.id&&reference?.sha256===observation.sha256;
}

function identityContext(observation,targetMarket){
 const observed=observation.context?.transport==='DECODO'?observation.context.networkGeography:null;
 return {
  market:observed??targetMarket,
  marketAlignment:observed===targetMarket?'EXACT':observed?'MISMATCH':'UNRESOLVED',
  warnings:[...(observed===targetMarket?['MARKET_OBSERVED_NOT_PROVIDER_APPLICABILITY']:observed?['MARKET_MISMATCH']:['MARKET_UNRESOLVED']), 'BILLING_ROUTE_UNRESOLVED']
 };
}

function candidate({observation,objective,targetMarket,plan,amount,currency,locator,offerId=null,acquiredAt=null,warnings=[]}){
 const identity=identityContext(observation,targetMarket);
 return {
  provider:objective.serviceName,market:identity.market,plan,amount:Number(amount),currency,
  paymentCadence:'MONTHLY_RECURRING',billingRoute:null,sourceUrl:observation.url,sourceHash:observation.sha256,
  acquiredAt,provenance:'V3_SOURCE_RESEARCH',warnings:[...new Set([...identity.warnings,...warnings])],
  sourceLocator:structuredClone(locator),
  researchEvidence:{
   acquired:true,sourceBound:true,observationId:observation.id,amountBasis:'EXPLICIT',
   cadence:'MONTHLY_RECURRING',cadenceEvidence:structuredClone(locator),priceRole:'ORDINARY_RECURRING',
   sourceOwnership:'FIRST_PARTY',providerAlignment:'EXACT',planAlignment:'EXACT',
   marketAlignment:identity.marketAlignment,billingRouteAlignment:'UNRESOLVED',
   ...(offerId?{exactOfferId:offerId}:{})
  }
 };
}

function truthCandidates(observation,objective,targetMarket,truth,projection,acquiredAt){
 const rows=[];
 for(const offer of truth?.offers??[]){
  const p=offer.propositions??{};
  if(!established(p.SERVICE_IDENTITY)||!established(p.PRICE_AMOUNT)||!established(p.CURRENCY)||!established(p.MONTHLY_SUBSCRIPTION)||p.MONTHLY_SUBSCRIPTION.value!==true||!established(p.CONSUMER_SUBSCRIPTION)||p.CONSUMER_SUBSCRIPTION.value!==true)continue;
  const ref=referenceOf(p.PRICE_AMOUNT),sourceOffer=projection.source.offers.find((row,index)=>row.id===offer.id||ref?.pointer==='/offers/'+index);
  const plan=sourceOffer?.name??sourceName(ref)??offer.name??offer.plan??offer.id;
  if(!plan||!Number.isFinite(p.PRICE_AMOUNT.value)||p.PRICE_AMOUNT.value<=0||!currencies.has(p.CURRENCY.value)||ref?.observation!==observation.id||ref?.sha256!==observation.sha256)continue;
  rows.push(candidate({observation,objective,targetMarket,plan,amount:p.PRICE_AMOUNT.value,currency:p.CURRENCY.value,acquiredAt,offerId:sourceOffer?.id===offer.id?offer.id:null,
   locator:{kind:'V3_TRUTH_REFERENCE',pointer:ref.pointer??null,source:structuredClone(ref.source??null)},
   warnings:truth.established?[]:['VERIFIED_TRUTH_UNRESOLVED']}));
 }
 return rows;
}

function projectedOfferCandidates(observation,objective,targetMarket,projection,acquiredAt){
 const rows=[];
 for(const [index,offer] of projection.source.offers.entries()){
  if(!monthlyOffer(offer))continue;
  const binding=projection.bindings['/offers/'+index],plan=offer.name??binding?.offer??offer.id;
  if(!plan||binding?.observation&&binding.observation!==observation.id||binding?.sourceHash&&binding.sourceHash!==observation.sha256)continue;
  rows.push(candidate({observation,objective,targetMarket,plan,amount:offer.amount,currency:offer.currency,acquiredAt,offerId:offer.id,
   locator:{kind:'V3_PROJECTED_OFFER',pointer:'/offers/'+index,source:structuredClone(binding??null)}}));
 }
 return rows;
}

function currencyValues(value,limit){
 const found=new Set(),seen=new Set(),stack=[value];
 while(stack.length&&seen.size<limit){
  const current=stack.pop();if(!current||typeof current!=='object'||seen.has(current))continue;seen.add(current);
  if(Array.isArray(current)){for(const child of current)stack.push(child);continue;}
  for(const [key,child] of Object.entries(current)){
   if(/^(?:currency|currencyCode)$/i.test(key)&&currencies.has(child))found.add(child);
   if(child&&typeof child==='object')stack.push(child);
  }
 }
 return {found,complete:stack.length===0};
}

function inertMonthlyCandidates(observation,objective,targetMarket,acquiredAt){
 const rows=[];let scripts=0;
 for(const match of observation.body.matchAll(/<script\b([^>]*)>([^]*?)<\/script\s*>/gi)){
  if(++scripts>suggestedProjectionLimits.scripts)break;
  const raw=match[2],bytes=Buffer.byteLength(raw);
  if(bytes>suggestedProjectionLimits.scriptBytes||!/\btype\s*=\s*["']application\/(?:ld\+)?json["']/i.test(match[1]))continue;
  let root;try{root=JSON.parse(raw);}catch{continue;}
  const stack=[{value:root,path:'',depth:0,ancestors:[]}],seen=new Set();let nodes=0;
  while(stack.length&&rows.length<suggestedProjectionLimits.candidates&&nodes<suggestedProjectionLimits.nodes){
   const {value,path,depth,ancestors}=stack.pop();if(!value||typeof value!=='object'||seen.has(value)||depth>suggestedProjectionLimits.depth)continue;seen.add(value);nodes++;
   if(object(value)){
    const monthly=value.monthly,label=value.planName??value.name??value.title??value.type??value.id;
    if(object(monthly)&&typeof label==='string'&&label.trim()&&label.length<=256&&!/\b(?:trial|introductory|annual|yearly)\b/i.test(label)){
     const amount=monthly.pricePerMonth,currencyScope=[value,...ancestors].map(scope=>currencyValues(scope,suggestedProjectionLimits.nodes)).find(row=>row.complete&&row.found.size===1),currency=currencyScope?[...currencyScope.found][0]:null;
     const unsafe=monthly.prepaid===true||monthly.oneTime===true||monthly.billedYearly===true||monthly.billingCadence==='YEARLY'||monthly.commitment==='ANNUAL';
     if(finite(amount)&&Number(amount)>0&&currency&&!unsafe)rows.push(candidate({observation,objective,targetMarket,plan:label.trim(),amount:Number(amount),currency,acquiredAt,
      locator:{kind:'INERT_JSON_MONTHLY_FIELD',jsonPointer:pointer(pointer(path,'monthly'),'pricePerMonth'),script:{start:match.index,end:match.index+match[0].length,id:match[1].match(/\bid\s*=\s*["']([^"']+)/i)?.[1]??null}},
      warnings:['RESEARCH_LEVEL_STRUCTURED_MONTHLY_PROJECTION']}));
    }
    for(const [key,child] of Object.entries(value))if(child&&typeof child==='object')stack.push({value:child,path:pointer(path,key),depth:depth+1,ancestors:[value,...ancestors]});
   }else for(let index=value.length-1;index>=0;index--)if(value[index]&&typeof value[index]==='object')stack.push({value:value[index],path:pointer(path,index),depth:depth+1,ancestors:[value,...ancestors]});
  }
 }
 return rows;
}

export function projectV3SuggestedCandidates({observation,objective,targetMarket,providerAuthority,truth=null,acquiredAt=null,researchLineage=[]}){
 const expected=authorityBinding(objective,observation?.url);
 if(providerAuthority?.status!=='AUTHORITATIVE_PROVIDER'||!expected||canonical(providerAuthority.binding)!==canonical(expected)||observation?.kind!=='PROVIDER'||observation.outcome!=='OK'||observation.truncated||observation.completeness==='INCOMPLETE'||digest(observation.body)!==observation.sha256||!providerBound(objective,observation.url)||!/^[A-Z]{2}$/.test(targetMarket??''))return [];
 const projection=observation.format==='WEB'?projectObservation(observation,objective):{source:{offers:[]},bindings:{}};
 if(!sourceAligned(observation,objective,truth,projection))return [];
 const rows=[...truthCandidates(observation,objective,targetMarket,truth,projection,acquiredAt),...projectedOfferCandidates(observation,objective,targetMarket,projection,acquiredAt),...(observation.format==='WEB'?inertMonthlyCandidates(observation,objective,targetMarket,acquiredAt):[])],seen=new Set();
 return rows.filter(row=>{const key=JSON.stringify([row.sourceHash,row.plan,row.amount,row.currency,row.paymentCadence]);if(seen.has(key))return false;seen.add(key);return true;}).map(row=>{
  const matches=researchLineage.filter(binding=>binding?.originSuggestedId&&binding.observationId===observation.id&&binding.sourceHash===observation.sha256&&canonical(binding.sourceLocator)===canonical(row.sourceLocator));
  if(matches.length!==1)return row;
  return {...row,originSuggestedId:matches[0].originSuggestedId,researchEvidence:{...row.researchEvidence,lineage:{kind:'V4_SUGGESTED_ORIGIN',originSuggestedId:matches[0].originSuggestedId,basis:matches[0].basis??'EXPLICIT_RESEARCH_LINEAGE',truthAuthority:'NONE'}}};
 });
}
