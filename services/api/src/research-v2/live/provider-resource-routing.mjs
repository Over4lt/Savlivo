import {priceIntent,educationalPlanOnly} from '../intelligence/price-entry-intent.mjs';
import {priceNeedIntents,priceNeedRelevance} from '../intelligence/price-evidence-needs.mjs';
import {catalogObjective} from '../intelligence/login-manage.mjs';
import {pendingMarketProof} from './market-proof-continuation.mjs';
import {hasProviderRoutingAuthority,providerRoutingAuthority} from './provider-routing-authority.mjs';
import {semanticReasons} from './source-frontier.mjs';

export const providerRoutingObjectives=Object.freeze({OFFERING_DISCOVERY:'PRICE_OFFERING_DISCOVERY',PRICE_EVIDENCE:'PRICE_EVIDENCE',MARKET_PROOF:'MARKET_PROOF'});
const normalized=u=>{try{const x=new URL(u);x.hash='';return x.href;}catch{return null;}};
const leadText=lead=>lead?.label??lead?.title??'';
const strongRoles=new Set(['PRICING','PLAN_CATALOG']);

// Planning metadata only. This objective cannot establish authority or Truth.
export function providerStageRoutingObjective(t){
 if(catalogObjective(t)||!hasProviderRoutingAuthority(t))return null;
 if(pendingMarketProof(t).length)return providerRoutingObjectives.MARKET_PROOF;
 if(priceNeedIntents(t).length)return providerRoutingObjectives.PRICE_EVIDENCE;
 return providerRoutingObjectives.OFFERING_DISCOVERY;
}

function intent(t,lead){
 const authority=providerRoutingAuthority(t,lead.url);if(!authority)return null;
 try{return priceIntent(lead,{base:lead.from?.url??`https://${authority.host}/`,authorities:[{hostname:authority.host}]});}catch{return null;}
}

export function providerResourceRelevance(t,lead,objective=providerStageRoutingObjective(t)){
 const authority=lead?.url&&providerRoutingAuthority(t,lead.url);if(!objective||!authority)return {tier:3,role:'OUTSIDE_PROVIDER_OBJECTIVE',signals:[]};
 const text=leadText(lead),need=objective===providerRoutingObjectives.PRICE_EVIDENCE?priceNeedRelevance(t,lead.url,text):null;
 if(objective===providerRoutingObjectives.MARKET_PROOF){const relevant=/country|region|market|availability|terms|legal|membership|subscription|bedingungen/iu.test(new URL(lead.url).pathname+' '+text);return {tier:relevant?0:2,role:relevant?'MARKET_PROOF':'GENERAL_PROVIDER',signals:relevant?['MARKET_PROOF_RELEVANCE']:[]};}
 const signals=[];if(lead.priceEntryIntent)signals.push('PRICE_ENTRY_INTENT');if(strongRoles.has(lead.routingRole))signals.push('RESOURCE_ROLE_'+lead.routingRole);const classified=intent(t,lead);if(classified?.candidate)signals.push('PRICE_INTENT');if(need)signals.push(need.reason);
 if(signals.length)return {tier:0,role:lead.routingRole??(need?'PRICE_EVIDENCE':'PRICE_OR_PLAN_ENTRY'),signals};
 const semantic=semanticReasons(lead.url,text,lead.from?.mechanism??'');
 if(semantic.reasons.includes('SUBSCRIPTION_PRODUCT_PRICING')&&!educationalPlanOnly({...lead,label:text}))return {tier:1,role:'SEMANTIC_PRICING_HINT',signals:['SEMANTIC_SUBSCRIPTION_PRODUCT_PRICING']};
 return {tier:2,role:'GENERAL_PROVIDER',signals:semantic.reasons};
}

export function targetMarketPathHint(t,url){
 let segments;try{segments=new URL(url).pathname.split('/').filter(Boolean).map(decodeURIComponent);}catch{return false;}
 return segments.some(segment=>segment.toUpperCase()===t.market||new RegExp('^[a-z]{2,3}[-_]'+t.market+'$','i').test(segment));
}

function recordFor(t,lead){const hash=lead?.from?.bodyHash;if(!hash)return null;return (t.providerRoutingProgress??[]).find(row=>row.parentBodyHash===hash);}
export function providerBranchPreference(t,lead,relevance=providerResourceRelevance(t,lead)){
 if(relevance.tier===0)return 0;
 return recordFor(t,lead)?.outcome==='NO_PROGRESS'?1:0;
}

const sorted=a=>[...new Set(a.filter(x=>x!==null&&x!==undefined).map(String))].sort();
export function providerRoutingSnapshot(t){
 const truth=t.v3Truth??{},catalog=t.v3Catalog??{},offers=sorted([...(truth.offers??[]).map(o=>o.id),...Object.values(truth.prices??{}).map(p=>p?.id)]),propositions=[];
 for(const [market,price] of Object.entries(truth.prices??{}))for(const [name,value] of Object.entries(price?.propositions??{}))propositions.push([market,price?.id??null,name,value?.state??null]);
 const needs=sorted((truth.needs??[]).map(n=>JSON.stringify([n.offerId??null,n.proposition??null,n.market??null,n.state??null]))),priceNeeds=sorted((t.priceEvidenceNeeds?.claims??[]).flatMap(c=>(c.missing??[]).map(n=>n.gapKey??JSON.stringify([c.claimKey,n.assertion,n.disposition])))),market=sorted((t.marketProof?.objectives??[]).map(o=>o.key+':'+o.status)),catalogOffers=sorted((catalog.offerings??catalog.offers??[]).filter(o=>o.classification!=='CANDIDATE_ONLY'&&o.processingState!=='PENDING').map(o=>o.id??o.offerId??o.name)),strong=sorted((t.leads??[]).filter(l=>providerResourceRelevance(t,l).tier===0).map(l=>normalized(l.url)));
 return {objective:providerStageRoutingObjective(t),offers,propositions:sorted(propositions.map(JSON.stringify)),needs,priceNeeds,market,catalog:[catalog.state??null,catalog.scope??null,catalog.offeringState??null],catalogOffers,verified:Number(t.verified?.length??0),retainedCommercial:t.retainedPriceReview?.sourceBound===true?[t.retainedPriceReview.confidence??'UNKNOWN']:[],strong};
}

export function summarizeProviderRoutingProgress({target,before,page,lead}){
 const after=providerRoutingSnapshot(target),categories=[];const grew=(key,label)=>{if(after[key].some(x=>!before[key].includes(x)))categories.push(label);};
 grew('offers','OFFER_IDENTITY');grew('propositions','PROPOSITION_STATE');grew('needs','OFFER_SPECIFIC_NEED');grew('priceNeeds','PRICE_EVIDENCE_NEED');grew('market','MARKET_PROOF_OBJECTIVE');grew('catalogOffers','USEFUL_CATALOG_OFFERING');grew('retainedCommercial','RETAINED_COMMERCIAL_EVIDENCE');grew('strong','STRONG_PROVIDER_DESTINATION');
 if(JSON.stringify(after.catalog)!==JSON.stringify(before.catalog))categories.push('CATALOG_STATE_OR_SCOPE');if(after.verified>before.verified)categories.push('VERIFIED_PROVIDER_EVIDENCE');
 const objective=before.objective??providerStageRoutingObjective(target)??providerRoutingObjectives.OFFERING_DISCOVERY,relevance=providerResourceRelevance(target,lead??{url:page.url??page.requestedUrl,title:''},objective);
 return {version:1,meaning:'ROUTING_ONLY_NOT_EVIDENCE',objective,attemptedResource:normalized(page.url??page.requestedUrl),parentUrl:normalized(page.url??page.requestedUrl),parentBodyHash:page.bodyHash??null,branchKey:page.bodyHash?'PROVIDER_BODY:'+page.bodyHash:null,depth:page.navigationDepth??0,mechanism:lead?.from?.mechanism??lead?.from?.method??'DIRECT',routingRole:relevance.role,outcome:categories.length?'PROGRESS':'NO_PROGRESS',categories:sorted(categories)};
}

export function recordProviderRoutingProgress(t,summary){
 const rows=(t.providerRoutingProgress??[]).filter(row=>row.parentBodyHash!==summary.parentBodyHash&&row.attemptedResource!==summary.attemptedResource);rows.push(structuredClone(summary));t.providerRoutingProgress=rows.slice(-32);return summary;
}
