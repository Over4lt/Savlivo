import {parseMarketQualification} from './market-qualification.mjs';
// Source-local declarations and explicit linked-offer joins. Routing metadata is
// never accepted here. Callers supply re-opened, hash-checked provider receipts.
import {htmlTree,hash,normalizeText} from '../offline-recovery/extract.mjs';
export const marketProofVersion='SOURCE_BOUND_MARKET_PROOF_V1';
export const marketProofBounds=Object.freeze({sources:8,bytes:8000000,links:16,identities:16,maxAgeDays:30,maxJoinDays:7});
const pathOf=n=>n.parent?pathOf(n.parent)+'/'+n.tag+'['+n.index+']':'$';
const canonical=(s,base)=>{try{const u=new URL(s,base);if(u.protocol!=='https:'||u.username||u.password)return null;u.hash='';return u.href;}catch{return null;}};
export function marketDestinations(body,url){
 const out=[];for(const n of htmlTree(body).nodes){if(n.tag!=='a'||!/market|country|region|availability|available|terms|legal|membership|subscription|bedingungen|verfügbar|länder/iu.test(n.text+' '+(n.attrs.href??'')))continue;
  const dest=canonical(n.attrs.href,url);if(dest&&new URL(dest).origin===new URL(url).origin&&!out.some(x=>x.url===dest))out.push({url:dest,label:normalizeText(n.text).slice(0,160),path:pathOf(n),sourceHash:hash(body),meaning:'DESTINATION_HINT_NOT_MARKET_EVIDENCE'});
  if(out.length>=marketProofBounds.links)break;
 }return out;
}
function declarations(resource,plan,targetMarket){
 const tree=htmlTree(resource.body),rows=[];
 for(const n of tree.nodes){if(!['p','li','dd'].includes(n.tag)||n.text.length>500)continue;let a=n;while(a&&!['script','style','template','noscript','pre','code','blockquote','del'].includes(a.tag)&&a.attrs?.['aria-hidden']!=='true'&&!Object.hasOwn(a.attrs??{},'hidden')&&!Object.hasOwn(a.attrs??{},'inert')&&!/display\s*:\s*none|visibility\s*:\s*hidden/i.test(a.attrs?.style??''))a=a.parent;if(a)continue;
  const section=n.parent;if(section?.children.some(x=>/^h[1-6]$/.test(x.tag)&&/archiv|historic|previous|expired|example|hypothetical|former/i.test(x.text)))continue;
  const assertion=parseMarketQualification(normalizeText(n.text),plan);if(!assertion)continue;
  const applies=assertion.countries.includes(targetMarket),negative=assertion.polarity==='NEGATIVE'?applies:assertion.exclusive&&!applies;
  if(!applies&&!negative)continue;
  rows.push({...assertion,country:targetMarket,negative,plan,path:pathOf(n),span:[n.start,n.end],bodyHash:resource.receipt.bodyHash,sourceUrl:resource.receipt.sourceUrl,capturedAt:resource.capturedAt,type:'EXPLICIT_PROVIDER_MARKET_STATEMENT'});
 }return rows;
}
function sound(r){return r?.receipt?.intact&&r.receipt.serviceEstablished&&r.receipt.bodyHash===hash(r.body)&&r.receipt.sourceUrl;}
export function proveOfferMarket(candidate,context){
 if(!candidate.product||candidate.ownershipAmbiguous||candidate.crossCardRisk||!(Number(candidate.amountNormalized)>0))return null;
 const resources=context.marketProofResources??[],own=resources.find(r=>r.receipt.bodyHash===context.bodyHash&&sound(r)&&(!context.sourceOccurrences?.length||context.sourceOccurrences.some(o=>o.id===r.occurrence.id)));if(!own)return null;
 const results=[];
 for(const r of resources){if(!sound(r)||r.receipt.service!==own.receipt.service||r.receipt.serviceEvidence?.targetServiceName!==own.receipt.serviceEvidence?.targetServiceName)continue;
  const same=r.receipt.bodyHash===own.receipt.bodyHash;
  if(!same){
   // Exact first-party origin, explicit retained identity binding: B names the
   // plan and links to A's exact offer surface. No inferred locale sibling.
   if(new URL(r.receipt.sourceUrl).origin!==new URL(own.receipt.sourceUrl).origin)continue;
   const times=[r.capturedAt,own.capturedAt].map(Date.parse);if(times.some(x=>!Number.isFinite(x))||Math.abs(times[0]-times[1])>marketProofBounds.maxJoinDays*86400000)continue;
   if(!htmlTree(r.body).nodes.some(n=>n.tag==='a'&&canonical(n.attrs.href,r.receipt.sourceUrl)===canonical(own.receipt.sourceUrl)))continue;
  }
  for(const d of declarations(r,candidate.product,context.market))results.push({...d,join:same?'SAME_SOURCE_EXACT_PLAN':'EXACT_PLAN_AND_LINKED_PRICE_SOURCE',priceSourceHash:context.bodyHash,pricePath:candidate.structuredPath,record:r.occurrence.record});
 }
 const relevant=results.filter(r=>r.country===context.market),negative=relevant.some(r=>r.negative),positive=relevant.some(r=>!r.negative&&r.reviewStatus!=='REVIEW_REQUIRED'),reviewRequired=relevant.some(r=>r.reviewStatus==='REVIEW_REQUIRED');
 if(!negative&&!positive&&!reviewRequired)return null;
 return {version:marketProofVersion,status:negative?'MARKET_CONTRADICTED':reviewRequired?'MARKET_NOT_VERIFIED':'MARKET_VERIFIED',reviewRequired,market:context.market,plan:candidate.product,priceSourceHash:context.bodyHash,pricePath:candidate.structuredPath,evidence:relevant,conflicting:negative&&positive};
}
export function marketResearch(target,observations,resources){
 const objectives=[];
 for(const o of observations){if(o.service!==target.service||!o.plan||!(Number(o.amount)>0)||!o.billingInterval||o.marketApplicability?.requestedMarket!==target.market)continue;
  const proofs=(o.fields?.market?.evidence??[]).map(x=>x.evidence?.marketProof).filter(Boolean);
  const negative=proofs.some(p=>p.status==='MARKET_CONTRADICTED'),positive=o.market===target.market&&o.exposure?.marketTargeting===true;
  const marketOnly=o.trustworthy===true&&o.marketApplicability?.status==='UNKNOWN'&&['service','provenance','plan','amount','currency','ownership'].every(k=>o.fields?.[k]?.status==='ESTABLISHED');
  if(!marketOnly&&!negative&&!positive)continue;
  const source=resources.find(r=>r.receipt.bodyHash===o.source.hash&&r.receipt.sourceUrl===o.source.url);if(!source)continue;
  const identity={service:target.service,market:target.market,plan:o.plan,amount:o.amount,currency:o.currency,interval:o.billingInterval.normalized,scope:o.scope,sourceHash:o.source.hash,sourceUrl:o.source.url,path:o.source.path};
  const key=hash(JSON.stringify(identity));if(objectives.some(x=>x.key===key))continue;
  objectives.push({key,identity,status:negative?'MARKET_CONTRADICTED':positive?'MARKET_VERIFIED':'MARKET_NOT_VERIFIED',missingFact:'MARKET_PROOF',established:['AUTHORITY','IDENTITY','COMMERCIAL_MEANING','VALUE_AND_CADENCE','PROVENANCE']});
 }
 if(objectives.length>marketProofBounds.identities)return {version:1,objectives:[],sources:[],leads:[],reason:'MARKET_OBJECTIVE_BOUND',meaning:'PLANNING_ONLY'};
 const pending=objectives.some(o=>o.status==='MARKET_NOT_VERIFIED');
 const leads=pending?[...new Map(resources.flatMap(r=>marketDestinations(r.body,r.receipt.sourceUrl)).map(l=>[l.url,l])).values()].slice(0,marketProofBounds.links):[];
 const sources=objectives.length?resources.map(r=>({sha256:r.receipt.bodyHash,occurrences:[r.occurrence]})):[];
 return {version:1,objectives,sources,leads,meaning:'PLANNING_ONLY_REOPEN_SOURCES_FOR_VERIFICATION'};
}
