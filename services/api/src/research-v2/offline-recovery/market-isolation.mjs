// Explicit offer-owned scope only. Locale, currency and investigation scope
// cannot exclude a competing claim. Unknown/overlapping scope remains a conflict.
export function explicitOfferMarkets(candidate){
 const evidence=candidate.marketOwnerEvidence??candidate.attribution?.marketOwnerEvidence??[];
 if(!evidence.length||evidence.some(e=>!['EXPLICIT_STRUCTURED_FIELD','SECTION_HEADING','COUNTRY_OWNER_LABEL'].includes(e.type)||!e.path||! /^[A-Z]{2}$/.test(e.code??'')))return [];
 return [...new Set(evidence.map(e=>e.code))];
}
export function disjointOfferMarkets(a,b){const x=explicitOfferMarkets(a),y=explicitOfferMarkets(b);return x.length>0&&y.length>0&&!x.some(c=>y.includes(c));}
export function foreignOfferForTarget(c){const countries=explicitOfferMarkets(c);return /^[A-Z]{2}$/.test(c.market??'')&&countries.length>0&&!countries.includes(c.market);}
