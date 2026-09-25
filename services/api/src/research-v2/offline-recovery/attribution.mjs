import {isResponseBoundPayload,isProviderBoundPayload} from './structured-materialization.mjs';
import {proveOfferMarket} from '../verification/market-proof.mjs';
// Experimental provenance metadata only; no currency inference or provider rules.
import '../offline-replay/offline-guard.mjs';
const norm=x=>String(x??'').normalize('NFD').replace(/\p{M}/gu,'').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
// CLDR names are recognition vocabulary, NOT a second supported-market inventory.
const names=new Map();for(const locale of ['en','es','fr','de','pt','nl','it']){const display=new Intl.DisplayNames([locale],{type:'region',fallback:'none'});for(let a=65;a<=90;a++)for(let b=65;b<=90;b++){const code=String.fromCharCode(a,b),name=display.of(code);if(name){const key=norm(name);if(!names.has(key))names.set(key,new Set());names.get(key).add(code);}}}
export const countryLabel=x=>{const codes=names.get(norm(x));return codes?.size===1?[...codes][0]:null;};
const pathOf=n=>n.parent?pathOf(n.parent)+'/'+n.tag+'['+n.index+']':'$';
export function structuredMarkets(v,p){const out=[];for(const [key,value]of Object.entries(v)){if(!/^(?:country_?code|country|market|addressCountry|eligibleRegion|areaServed)$/i.test(key))continue;for(const x of Array.isArray(value)?value:[value]){const raw=typeof x==='object'&&x?x.identifier??x.name??x.addressCountry:x;const code=typeof raw==='string'&&/^[A-Z]{2}$/.test(raw)?raw:countryLabel(raw);if(code)out.push({code,raw,path:p+'/'+key,type:'EXPLICIT_STRUCTURED_FIELD'});}}return out;}
export function annotateHTML(candidates,tree){const paths=new Map(tree.nodes.map(n=>[pathOf(n),n]));const headings=tree.nodes.filter(n=>/^h[1-6]$/.test(n.tag)&&countryLabel(n.text));const countries=[...new Set(headings.map(n=>countryLabel(n.text)))].sort();
 for(const c of candidates){if(c.sourceType!=='HTML')continue;const owner=paths.get(c.qualifierPreservation?.ownerPath),node=paths.get(c.structuredPath);const evidence=[];const direct=countryLabel(c.product);if(direct)evidence.push({code:direct,raw:c.product,path:owner?pathOf(owner):c.structuredPath,type:'COUNTRY_OWNER_LABEL'});
 // A preceding heading owns its sibling section until the next heading. Never
 // select by price proximity or borrow from a following/neighbouring section.
 if(!evidence.length)for(let n=node;n?.parent;n=n.parent){const siblings=n.parent.children;const preceding=siblings.slice(0,n.index).filter(s=>/^h[1-6]$/.test(s.tag)).at(-1);if(preceding){const code=countryLabel(preceding.text);if(code){evidence.push({code,raw:preceding.text,path:pathOf(preceding),type:'SECTION_HEADING'});break;}}}
 c.marketOwnerEvidence=evidence;c.multiCountrySource=countries.length>1;c.sourceCountryLabels=countries;c.productOwnerEvidence={raw:c.product,path:owner?pathOf(owner):c.structuredPath,method:c.structuralContainer};
 }
}
export function attribute(c,context){if(context.providerPolicy)return combinedAttribute(c,context);const evidence=c.marketOwnerEvidence??[],codes=[...new Set(evidence.map(e=>e.code))];const countryProduct=!!countryLabel(c.product);const conflicts=evidence.filter(e=>!evidence.some(other=>other.path===e.path&&other.code===context.market));const conflict=conflicts.length>0;const explicit=codes.length>0&&!conflict;const structured=c.sourceType==='JSON'&&!isResponseBoundPayload(c,context);const labels=[];if(c.product&&!countryProduct&&!c.ownershipAmbiguous)labels.push('EXPLICIT_PRODUCT_OWNER');if(explicit)labels.push(evidence.some(e=>e.type==='SECTION_HEADING')?'INHERITED_SECTION_CONTEXT':'EXPLICIT_MARKET_OWNER');if(c.multiCountrySource)labels.push('CROSS_COUNTRY_CONTEXT');if(conflict)labels.push(structured?'STRUCTURED_MARKET_MISMATCH':'CROSS_COUNTRY_CONTEXT');
 // Geo evidence establishes observation context for the acquired page. It does
 // not make every embedded/global machine catalog offer applicable to a visitor.
 // Preserve the separate explicit-owner requirement for those structured offers.
 const geo=context.geoEvidence?.some(e=>e.classification==='G1'&&e.targetCountry===context.market)??false;
 const established=context.geoPolicy?(!!context.authority&&!conflict&&(explicit||(!structured&&!c.multiCountrySource&&codes.length===0&&geo))):!!context.marketBound&&!conflict&&(explicit||(!structured&&!c.multiCountrySource&&(context.sharedMarkets?.length??0)<=1&&codes.length===0));
 const reasons=[];if((context.sharedMarkets?.length??0)>1&&!explicit&&!geo)reasons.push('SHARED_SOURCE_MARKET_UNRESOLVED');if(countryProduct)reasons.push('PRODUCT_FROM_COUNTRY_LABEL');if(conflict)reasons.push(structured?'STRUCTURED_MARKET_MISMATCH':'CROSS_COUNTRY_MARKET_MISMATCH');if(!established){reasons.push('MARKET_APPLICABILITY_UNRESOLVED');labels.push('UNRESOLVED_ATTRIBUTION');if(!codes.length)reasons.push('PAGE_GLOBAL_ONLY_APPLICABILITY');}if(!codes.length)labels.push('PAGE_GLOBAL_CONTEXT');
 return {...c,product:countryProduct?null:c.product,plan:countryProduct?null:c.plan,originalProductLabel:c.product,ownershipAmbiguous:c.ownershipAmbiguous||countryProduct,attribution:{version:1,requestedMarket:context.market,marketApplicabilityEstablished:established,productOwnershipEstablished:!!c.product&&!countryProduct&&!c.ownershipAmbiguous,marketSourceType:explicit?(evidence.some(e=>e.type==='SECTION_HEADING')?'section':'explicit'):geo?'geo-observed':'task-context',...(context.geoPolicy?{marketEvidenceType:conflict?'CONFLICTING':explicit?(geo?'PROVIDER_AND_GEO':'PROVIDER_DECLARED'):geo?'GEO_OBSERVED':'TASK_ONLY',geoEvidence:context.geoEvidence??[],geoEvidenceMeaning:'Observed response market, not provider-declared offer applicability',structuredCatalogApplicabilityRequired:structured&&!explicit}:{}),marketOwnerEvidence:evidence,productOwnerEvidence:c.productOwnerEvidence??{raw:c.product,path:c.structuredPath,method:c.structuralContainer},conflictingMarketEvidence:conflicts,multiCountrySource:!!c.multiCountrySource,sharedSourceMarkets:context.sharedMarkets??[context.market],classes:[...new Set(labels)].sort(),blockingReasons:reasons}};
}


export const marketEvidenceTypes=['PROVIDER_DECLARED','GEO_OBSERVED','PROVIDER_AND_GEO','TASK_ONLY','CONFLICTING','UNRESOLVED'];
export function combineMarketEvidenceTypes(types){
 const values=types.filter(t=>marketEvidenceTypes.includes(t));
 if(values.includes('CONFLICTING'))return 'CONFLICTING';
 const provider=values.some(t=>['PROVIDER_DECLARED','PROVIDER_AND_GEO'].includes(t));
 const geo=values.some(t=>['GEO_OBSERVED','PROVIDER_AND_GEO'].includes(t));
 return provider&&geo?'PROVIDER_AND_GEO':provider?'PROVIDER_DECLARED':geo?'GEO_OBSERVED':values.includes('UNRESOLVED')?'UNRESOLVED':values.length?'TASK_ONLY':'UNRESOLVED';
}
function combinedAttribute(c,context){
 const base=attribute(c,{...context,providerPolicy:false});
 const prior=base.attribution,owner=prior.marketOwnerEvidence;
 const ownerConflicts=prior.conflictingMarketEvidence;
 const marketProof=proveOfferMarket(c,context);
 const explicitOwner=owner.length>0&&ownerConflicts.length===0||marketProof?.status==='MARKET_VERIFIED';
 const page=context.providerEvidence?.records??[];
 const invalidBinding=page.some(e=>e.bodyHash!==context.bodyHash);
 const pageConflicts=page.filter(e=>e.bodyHash===context.bodyHash&&(e.status==='CONFLICTING'||e.country!==context.market));
 const matchingPages=page.filter(e=>e.bodyHash===context.bodyHash&&e.status==='ESTABLISHED'&&e.country===context.market);
 const geoEvidence=context.geoEvidence??[];
 const complete=geoEvidence.filter(e=>e.classification==='G1');
 const geoConflicts=complete.filter(e=>e.targetCountry!==context.market||e.geoCountry!==context.market);
 const geo=complete.some(e=>e.targetCountry===context.market&&e.geoCountry===context.market);
 const structured=c.sourceType==='JSON'&&!isResponseBoundPayload(c,context);
 // A page country does not transfer ownership/applicability into an independent
 // embedded machine catalog. Preserve the existing structured-owner safeguard.
 const pageApplicable=matchingPages.length>0&&!structured&&!c.multiCountrySource;
 const provider=explicitOwner||pageApplicable;
 const conflict=ownerConflicts.length>0||pageConflicts.length>0||geoConflicts.length>0||marketProof?.status==='MARKET_CONTRADICTED';
 const scopeUnresolved=(structured&&!explicitOwner&&(geo||matchingPages.length>0))||(c.multiCountrySource&&!explicitOwner);
 const invalidMaterializedOrigin=!isProviderBoundPayload(c,context);
 const incomplete=marketProof?.reviewRequired===true||invalidMaterializedOrigin||invalidBinding||scopeUnresolved||(!provider&&!geo&&(page.length>0||geoEvidence.some(e=>e.classification==='G2')));
 const type=conflict?'CONFLICTING':incomplete?'UNRESOLVED':provider&&geo?'PROVIDER_AND_GEO':provider?'PROVIDER_DECLARED':geo?'GEO_OBSERVED':'TASK_ONLY';
 const established=!!context.authority&&['PROVIDER_DECLARED','GEO_OBSERVED','PROVIDER_AND_GEO'].includes(type);
 const reasons=[];
 if(marketProof?.status==='MARKET_CONTRADICTED')reasons.push('PROVIDER_OFFER_MARKET_CONFLICT');
 if(invalidMaterializedOrigin)reasons.push('MATERIALIZED_PROVIDER_ORIGIN_UNRESOLVED');
 if(prior.blockingReasons.includes('PRODUCT_FROM_COUNTRY_LABEL'))reasons.push('PRODUCT_FROM_COUNTRY_LABEL');
 if(ownerConflicts.length)reasons.push(structured?'STRUCTURED_MARKET_MISMATCH':'CROSS_COUNTRY_MARKET_MISMATCH');
 if(pageConflicts.length)reasons.push('PROVIDER_PAGE_MARKET_CONFLICT');
 if(geoConflicts.length)reasons.push('GEO_PROVIDER_MARKET_CONFLICT');
 if(invalidBinding)reasons.push('PROVIDER_MARKET_BODY_BINDING_MISMATCH');
 if(scopeUnresolved)reasons.push('MARKET_SCOPE_UNRESOLVED');
 if(!established)reasons.push('MARKET_APPLICABILITY_UNRESOLVED');
 const classes=prior.classes.filter(x=>!['UNRESOLVED_ATTRIBUTION','PAGE_GLOBAL_CONTEXT'].includes(x));
 if(pageApplicable)classes.push('PROVIDER_DECLARED_PAGE');
 if(geo)classes.push('GEO_OBSERVED_MARKET');
 if(!established)classes.push('UNRESOLVED_ATTRIBUTION');
 return {...base,attribution:{...prior,version:2,marketProof,marketEvidenceType:type,marketApplicabilityEstablished:established,
   marketSourceType:explicitOwner?prior.marketSourceType:pageApplicable?'provider-page':geo?'geo-observed':'task-context',
   providerPageEvidence:page,providerPageDiagnostics:context.providerEvidence?.diagnostics??[],
   providerOwnerEvidence:owner.map(e=>({...e,bodyHash:context.bodyHash,sourceOccurrenceIds:context.sourceOccurrenceIds})),
   providerConflictingEvidence:pageConflicts,geoConflictingEvidence:geoConflicts,
   geoEvidence,structuredCatalogApplicabilityRequired:structured&&!explicitOwner,
   classes:[...new Set(classes)].sort(),blockingReasons:[...new Set(reasons)].sort()}};
}
