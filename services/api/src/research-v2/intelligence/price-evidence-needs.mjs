// Routing projection of adjudicated evidence only. Never an admission credential.
import {createHash} from 'node:crypto';
export const priceNeedsVersion=2,priceNeedsDerivation='PRICE_EVIDENCE_NEEDS_V2';
export const priceNeedsBounds=Object.freeze({observations:2048,claims:256,sources:128,bytes:2097152});
const stable=x=>JSON.stringify(x,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);
const digest=x=>createHash('sha256').update(stable(x)).digest('hex');
const sorted=x=>[...new Set(x)].sort();
const unique=x=>[...new Map(x.map(v=>[stable(v),v])).values()].sort((a,b)=>stable(a).localeCompare(stable(b)));
export const admittedPriceTarget=t=>t?.researchObjective==='SERVICE_COVERAGE'&&typeof t.service==='string'&&/^[A-Z]{2}$/.test(t.market??'')&&t.id===t.service+'-price-'+t.market;
const conflicts=new Set(['MULTIPLE_CONFLICTING_FACTS','SAME_SCOPE_INCOMPATIBLE_AMOUNTS','UNRESOLVED_SEMANTIC_CONFLICT','UNRESOLVED_CRITICAL_CONFLICT','PROVIDER_PAGE_MARKET_CONFLICT','GEO_PROVIDER_MARKET_CONFLICT','CROSS_COUNTRY_MARKET_MISMATCH','STRUCTURED_MARKET_MISMATCH','STRUCTURED_VISIBLE_CURRENCY_CONTEXT_CONFLICT','REPEATED_TEXT_DIFFERENT_OWNERS']);
const excluded=new Set(['TRIAL','INTRO_PROMOTION','PREPAID_FIXED_DURATION','ONE_TIME_NON_RENEWING','OPTIONAL_ADDON','SECONDARY_FEE','COMPARISON_PRICE','CREDIT','DISCOUNT','TAX']);
const fields=['service','provenance','plan','amount','currency','billingInterval','recurringSemantics','ordinaryPriceRole','offerOwnership','offerPresentation','market'];
const exactReasons={offerPresentation:'EMBEDDED_OFFER_ACTIVATION_UNRESOLVED',billingInterval:'EXACT_RECURRING_INTERVAL_UNRESOLVED',offerOwnership:'OFFER_OWNERSHIP_UNRESOLVED',market:'MARKET_APPLICABILITY_UNRESOLVED'};
const established=f=>f?.status==='ESTABLISHED';
const url=x=>{try{const u=new URL(x);return ['http:','https:'].includes(u.protocol)&&!u.username&&!u.password?u:null;}catch{return null;}};
function reviewed(t,u){return u&&t.authorities?.some(a=>a.hostname===u.hostname&&a.provider===t.serviceName&&a.checkedAt&&['OFFICIAL_PROVIDER','OFFICIAL_SUPPORT'].includes(a.sourceType));}
// Only source-grounded, positive commercial observations with a concrete named
// offer/interval and a reviewed origin can justify bounded offer/terms discovery.
// Other structures remain interpretation work. URL vocabulary guides, never proves.
function opportunity(t,o,identity){
 const u=url(o.source.url);return reviewed(t,u)&&established(o.fields?.service)&&established(o.fields?.provenance)&&established(o.fields?.amount)&&established(o.fields?.currency)&&Number(o.amount)>0&&!!(identity.plan||identity.productId)&&!!identity.cadence&&!t.demonstratedRendering&&!t.demonstratedConfigurator;
}
function combineAssertions(rows){
 const groups=new Map();for(const row of rows){const {evidence,...meaning}=row,key=stable(meaning);if(!groups.has(key))groups.set(key,{...meaning,evidence:[]});groups.get(key).evidence.push(...evidence);}
 return unique([...groups.values()].map(r=>({...r,evidence:sorted(r.evidence)})));
}
function legacyBuild(targetId,sources){
 if(sources.length>priceNeedsBounds.sources)throw Error('PRICE_NEEDS_SOURCE_BOUND');
 const claims=new Map();for(const source of sources)for(const row of source.claims){
  if(!claims.has(row.claimKey))claims.set(row.claimKey,{claimKey:row.claimKey,identity:row.identity,established:[],missing:[]});const c=claims.get(row.claimKey);c.established.push(...row.established);c.missing.push(...row.missing);
 }
 if(claims.size>priceNeedsBounds.claims)throw Error('PRICE_NEEDS_CLAIM_BOUND');
 for(const c of claims.values()){c.established=combineAssertions(c.established);c.missing=combineAssertions(c.missing);}
 sources=sources.map(s=>({...s,references:unique(s.references),claims:unique(s.claims)}));
 const value={version:1,derivationVersion:'PRICE_EVIDENCE_NEEDS_V1',targetId,sources:unique(sources),claims:[...claims.values()].sort((a,b)=>a.claimKey.localeCompare(b.claimKey)),meaning:'ROUTING_ONLY_NOT_VERIFICATION_OR_SCOPE_ADMISSION'};
 if(Buffer.byteLength(stable(value))>priceNeedsBounds.bytes)throw Error('PRICE_NEEDS_SIZE_BOUND');return {...value,evidenceDigest:digest(value)};
}
// Persist claims once. Source contributions are reconstructed from evidence IDs,
// preserving replacement-by-source semantics without a second claim collection.
function expand(p){return p.sources.map(s=>{const ids=new Set(s.references.map(r=>r.evidenceId));return {...s,claims:p.claims.map(c=>({...c,established:c.established.map(a=>({...a,evidence:a.evidence.filter(id=>ids.has(id))})).filter(a=>a.evidence.length),missing:c.missing.map(a=>({...a,evidence:a.evidence.filter(id=>ids.has(id))})).filter(a=>a.evidence.length)})).filter(c=>c.established.length||c.missing.length)};});}
const compactReference=r=>Object.fromEntries(Object.entries(r).filter(([k])=>k!=='sourceUrl').map(([k,v])=>[k,typeof v==='string'&&v.length>256?{digest:digest(v),meaning:'LOCATOR_DIGEST_NOT_EVIDENCE'}:v]));
function build(targetId,input,inherited=[],originDerivations=[priceNeedsDerivation]){
 const sources=[],claims=new Map(),omitted=[];
 const omit=(s,reason)=>{const rows=s.claims??[];omitted.push({key:digest(s),reason,sources:1,claims:rows.length,needs:rows.reduce((n,c)=>n+c.missing.length,0),dispositions:sorted(rows.flatMap(c=>c.missing.map(m=>m.disposition)))});};
 const value=()=>({version:priceNeedsVersion,derivationVersion:priceNeedsDerivation,originDerivations:sorted(originDerivations),targetId,sources,claims:[...claims.values()].sort((a,b)=>a.claimKey.localeCompare(b.claimKey)),meaning:'ROUTING_ONLY_NOT_VERIFICATION_OR_SCOPE_ADMISSION'});
 for(const raw of unique(input).sort((a,b)=>a.url.localeCompare(b.url))){
  const s={url:raw.url,references:unique(raw.references.map(compactReference)),claims:unique(raw.claims)};
  if(sources.length>=priceNeedsBounds.sources){omit(s,'SOURCE_BOUND');continue;}
  if(s.url.length>2048||s.claims.some(c=>Buffer.byteLength(stable(c))>16384)){omit(s,'FIELD_BOUND');continue;}
  const next=new Map(claims);for(const row of s.claims){const prior=next.get(row.claimKey);next.set(row.claimKey,{...row,established:combineAssertions([...(prior?.established??[]),...row.established]),missing:combineAssertions([...(prior?.missing??[]),...row.missing])});}
  if(next.size>priceNeedsBounds.claims){omit(s,'CLAIM_BOUND');continue;}
  const candidate={...value(),sources:[...sources,{url:s.url,references:s.references}],claims:[...next.values()]};
  // Reserve space for bounded coverage metadata and final digest.
  if(Buffer.byteLength(stable(candidate))>priceNeedsBounds.bytes-32768){omit(s,'BYTE_BOUND');continue;}
  sources.push({url:s.url,references:s.references});claims.clear();for(const [key,c]of next)claims.set(key,c);
 }
 const summaries=unique([...inherited,...omitted]);
 // Inherited incompleteness is never upgraded to completeness by a later merge.
 const coverage=summaries.length===1&&!omitted.length?{complete:false,reason:summaries[0].reason,omittedSources:summaries[0].sources,omittedClaims:summaries[0].claims,omittedNeeds:summaries[0].needs,omittedObservations:summaries[0].observations??0,dispositions:summaries[0].dispositions,omittedDigest:summaries[0].key}:{complete:!summaries.length,reason:summaries.length?'BOUNDED_PLANNING_PROJECTION':null,omittedSources:summaries.reduce((n,x)=>n+x.sources,0),omittedClaims:summaries.reduce((n,x)=>n+x.claims,0),omittedNeeds:summaries.reduce((n,x)=>n+x.needs,0),omittedObservations:summaries.reduce((n,x)=>n+(x.observations??0),0),dispositions:sorted(summaries.flatMap(x=>x.dispositions)),omittedDigest:summaries.length?digest(summaries):null};
 coverage.reasons=sorted(summaries.flatMap(x=>x.reasons??[x.reason]));
 const result={...value(),coverage},sealed={...result,evidenceDigest:digest(result)};if(Buffer.byteLength(stable(sealed))>priceNeedsBounds.bytes)throw Error('PRICE_NEEDS_SIZE_BOUND');return sealed;
}
function inherited(p){return p?.coverage?.complete===false?[{key:p.coverage.omittedDigest,reason:p.coverage.reason,reasons:p.coverage.reasons,sources:p.coverage.omittedSources,claims:p.coverage.omittedClaims,needs:p.coverage.omittedNeeds,observations:p.coverage.omittedObservations??0,dispositions:p.coverage.dispositions}]:[];}
export function projectPriceEvidenceNeeds(target,observations){
 if(!admittedPriceTarget(target))return null;
 if(!Array.isArray(observations))throw Error('PRICE_NEEDS_OBSERVATION_BOUND');
 if(observations.length>priceNeedsBounds.observations)return build(target.id,[],[{key:digest(unique(observations.map(o=>digest(o)))),reason:'OBSERVATION_BOUND',sources:0,claims:0,needs:0,dispositions:['UNKNOWN'],observations:observations.length}]);
 const sources=new Map();for(const o of observations){
  if(o.service!==target.service||o.source?.kind!=='ORIGINAL_PROVIDER'||!url(o.source.url)||!/^[a-f0-9]{64}$/.test(o.source.hash??''))continue;
  const requested=o.marketApplicability?.requestedMarket??o.requestedMarket??o.market;
  if(requested!==target.market)continue;
  const sourceKey=o.source.url;if(!sources.has(sourceKey))sources.set(sourceKey,{url:sourceKey,references:[],claims:[]});
  const role=o.offerObject?.monetaryRole?.role??o.commercialRole;
  if((o.blockers??[]).some(r=>['NON_CHARGE_MONETARY_AMOUNT','MATERIALIZED_SECONDARY_MONETARY_ROLE'].includes(r))||excluded.has(role)||excluded.has(o.commercialRole)||o.amount!==null&&Number(o.amount)===0)continue;
  const proof=o.fields?.offerPresentation?.evidence??o.offerObject?.offerPresentation;
  const identity={productId:o.providerPlanId??proof?.skuId??proof?.productId??null,plan:o.plan??o.offerObject?.planLabel??null,cadence:o.billingInterval?.normalized??o.offerObject?.exactInterval?.normalized??null,scope:{...(o.offerObject?.dimensions??{}),...(o.scope??{})},commitment:o.commitment??null};
  // Labels/intervals here are observed identity, never assertions of verification.
  // Unknown identity is one target-level need, not a manufactured plan.
  if(!identity.plan&&!identity.productId){identity.cadence=null;identity.scope={};identity.commitment=null;}
  const semantic={...identity,currency:o.currency??null,monetaryRole:role??null,commitment:identity.commitment?{value:identity.commitment.value,unit:identity.commitment.unit}:null,scope:Object.fromEntries(Object.entries(identity.scope).map(([k,v])=>[k,v?.value??v]))};
  const claimKey=digest([target.id,semantic]);
  const ref={sourceUrl:o.source.url,sourceHash:o.source.hash,offerObjectId:o.offerObject?.objectId??null,domLocator:o.source.path??o.offerObject?.pricePath??null,verifierStatus:o.candidateVerificationStatus??o.completeCanonicalStatus??null,presentationRule:proof?.rule??null,occurrenceId:proof?.occurrenceId??null,surfacePath:proof?.surfacePath??null};
  const evidenceId=digest(ref);sources.get(sourceKey).references.push({evidenceId,...ref});
  const allReasons=sorted(o.blockers??[]),hardConflict=allReasons.filter(r=>conflicts.has(r));
  const establishedRefs=[],missing=[];const add=(assertion,disposition,reasons)=>missing.push({gapKey:digest([claimKey,assertion]),assertion,disposition,reasons:sorted(reasons),evidence:[evidenceId]});
  const canResearch=opportunity(target,o,semantic),authority=established(o.fields?.service),integrity=established(o.fields?.provenance);
  for(const assertion of fields){const f=o.fields?.[assertion];if(established(f)){establishedRefs.push({assertion,value:({plan:semantic.plan,amount:o.amount,currency:o.currency,billingInterval:semantic.cadence,market:o.market,offerPresentation:o.offerPresentation?.rule??o.fields?.offerPresentation?.evidence?.rule??null})[assertion]??null,evidence:[evidenceId]});continue;}
   // Existing trustworthy admission predates presentation receipts in some paths.
   // Do not create a new mandatory assertion for those successful observations.
   if(o.trustworthy&&assertion==='offerPresentation')continue;
   const reasons=f?.blocker?[f.blocker]:[exactReasons[assertion]??assertion.toUpperCase()+'_UNRESOLVED'];
   const disposition=assertion==='service'?'HUMAN_REVIEW':assertion==='provenance'?'POLICY':!authority?'HUMAN_REVIEW':!integrity?'POLICY':hardConflict.length?'CONFLICT':canResearch&&['offerPresentation','offerOwnership','market','plan','billingInterval'].includes(assertion)?'RESEARCHABLE':'INTERPRETATION';
   add(assertion,disposition,reasons);
  }
  if(hardConflict.length)add('conflicts','CONFLICT',hardConflict);
  // Preserve unmapped adjudicator blockers as interpretation diagnostics, never
  // convert arbitrary/source-controlled strings into permission to research.
  const mapped=new Set([...missing.flatMap(m=>m.reasons),...hardConflict]);const remaining=allReasons.filter(r=>!mapped.has(r));
  if(remaining.length)add('qualification',!authority?'HUMAN_REVIEW':!integrity?'POLICY':hardConflict.length?'CONFLICT':'INTERPRETATION',remaining);
  sources.get(sourceKey).claims.push({claimKey,identity:semantic,established:unique(establishedRefs),missing:unique(missing)});
 }
 return build(target.id,[...sources.values()]);
}
export function readPriceEvidenceNeeds(target){
 if(!admittedPriceTarget(target)||target.priceEvidenceNeeds==null)return null;
 const p=target.priceEvidenceNeeds;
 if(p.targetId!==target.id||p.meaning!=='ROUTING_ONLY_NOT_VERIFICATION_OR_SCOPE_ADMISSION'||!Array.isArray(p.sources))throw Error('PRICE_NEEDS_SCHEMA_OR_SCOPE');
 if(Buffer.byteLength(stable(p))>priceNeedsBounds.bytes+256)throw Error('PRICE_NEEDS_SIZE_BOUND');
 if(p.version===1&&p.derivationVersion==='PRICE_EVIDENCE_NEEDS_V1'){
  const expected=legacyBuild(target.id,p.sources);if(stable(expected)!==stable(p))throw Error('PRICE_NEEDS_DIGEST');
  // Preserve legacy claim identities/dispositions; do not reinterpret evidence.
  return build(target.id,p.sources,[],['PRICE_EVIDENCE_NEEDS_V1']);
 }
 if(p.version!==priceNeedsVersion||p.derivationVersion!==priceNeedsDerivation||!Array.isArray(p.claims)||!p.coverage||!Array.isArray(p.originDerivations)||p.originDerivations.some(v=>!['PRICE_EVIDENCE_NEEDS_V1',priceNeedsDerivation].includes(v)))throw Error('PRICE_NEEDS_SCHEMA_OR_SCOPE');
 const {evidenceDigest,...payload}=p;if(digest(payload)!==evidenceDigest)throw Error('PRICE_NEEDS_DIGEST');
 const expected=build(target.id,expand(p),inherited(p),p.originDerivations);if(stable(expected)!==stable(p))throw Error('PRICE_NEEDS_DIGEST');
 return p;
}
export function mergePriceEvidenceNeeds(target,incoming){
 if(!admittedPriceTarget(target)||incoming==null)return;
 const next=readPriceEvidenceNeeds({...target,priceEvidenceNeeds:incoming}),prior=readPriceEvidenceNeeds(target);
 // An incomplete projection is a stable unresolved planning stop, not a cache
 // that can be incrementally declared complete without full re-projection.
 if(prior?.coverage.complete===false)return;
 const replace=new Set(next.sources.map(s=>s.url));target.priceEvidenceNeeds=build(target.id,[...expand(prior??{sources:[],claims:[]}).filter(s=>!replace.has(s.url)),...expand(next)],[...inherited(prior),...inherited(next)],sorted([...(prior?.originDerivations??[]),...next.originDerivations]));
}

export function researchablePriceNeeds(target){const p=readPriceEvidenceNeeds(target);if(p?.coverage?.complete===false)return [];return p?.claims.flatMap(c=>c.missing.filter(m=>m.disposition==='RESEARCHABLE').map(m=>({...m,identity:c.identity})))??[];}
export function priceNeedsStop(target){const p=readPriceEvidenceNeeds(target);if(p?.coverage?.complete===false)return 'PRICE_EVIDENCE_PROJECTION_INCOMPLETE';if(!p?.claims.length||researchablePriceNeeds(target).length)return null;const dispositions=new Set(p.claims.flatMap(c=>c.missing.map(m=>m.disposition)));return dispositions.has('POLICY')?'PRICE_EVIDENCE_POLICY_REVIEW_REQUIRED':dispositions.has('HUMAN_REVIEW')?'PRICE_EVIDENCE_HUMAN_REVIEW_REQUIRED':dispositions.has('CONFLICT')?'PRICE_EVIDENCE_CONFLICT_REVIEW_REQUIRED':dispositions.has('INTERPRETATION')?'RETAINED_STRUCTURE_REQUIRES_REVIEW':null;}
export function priceNeedIntent(target){const needs=researchablePriceNeeds(target),order=['offerPresentation','offerOwnership','market','billingInterval','recurringSemantics','ordinaryPriceRole','plan','amount','currency'];return order.find(k=>needs.some(n=>n.assertion===k))??null;}
export function priceNeedQuery(target,attempt){const intent=priceNeedIntent(target);if(!intent)return null;const wording={offerPresentation:['membership plan purchase options','subscription plan selection purchase terms'],offerOwnership:['official membership plan details','subscription product purchase terms'],market:['subscription pricing country availability','localized subscription billing terms'],billingInterval:['subscription billing interval renewal terms','plan recurring billing terms'],recurringSemantics:['subscription renewal terms','recurring plan billing terms'],ordinaryPriceRole:['subscription trial renewal charge','regular subscription billing terms'],plan:['subscription plan details','membership product details'],amount:['subscription charge','plan price'],currency:['subscription billing currency','localized plan currency']}[intent];return [target.serviceName??target.service,target.market,wording[Math.min(attempt,1)],target.authorities?.[0]?.hostname?'site:'+target.authorities[0].hostname:null].filter(Boolean).join(' ');}
export function priceNeedRelevance(target,url,label=''){
 const intent=priceNeedIntent(target);if(!intent)return null;const u=new URL(url),s=u.pathname+' '+label;
 const patterns={offerPresentation:/membership|offer|checkout|purchase|subscribe|plans/i,offerOwnership:/membership|offer|product|plans|subscription/i,market:/country|region|market|locale|pricing|billing|terms/i,billingInterval:/billing|terms|renew|subscription|plans/i,recurringSemantics:/billing|terms|renew|subscription/i,ordinaryPriceRole:/billing|terms|renew|trial|subscription/i,plan:/plans|membership|subscription/i,amount:/pricing|plans|subscription/i,currency:/currency|pricing|billing|terms/i};
 return patterns[intent].test(s)?{bonus:4,reason:'ADDRESS_PRICE_EVIDENCE_'+intent,assertion:intent}:null;
}
