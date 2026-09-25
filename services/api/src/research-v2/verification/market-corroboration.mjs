// Semantic alternatives, not a score. Repeated observations never add strength.
export const corroborationVersion='OFFER_MARKET_CORROBORATION_V1';
export function corroborateMarket(observations){
 const groups=[...new Set(observations.map(o=>o.dependency))].map(dependency=>({dependency,dimensions:[...new Set(observations.filter(o=>o.dependency===dependency).map(o=>o.dimension))]}));
 const strong=(dimension)=>observations.filter(o=>o.dimension===dimension&&['STRONG','DIRECT'].includes(o.strength));
 const owned=strong('EXACT_OFFER_OWNERSHIP'),surface=strong('REGIONAL_COMMERCIAL_SURFACE');
 const commerce=[...strong('OFFER_BOUND_PURCHASE_CONTEXT'),...strong('CHECKOUT_OR_BILLING_CONTEXT')];
 const direct=strong('STRUCTURED_MARKET_APPLICABILITY').filter(o=>o.strength==='DIRECT');
 const pair=surface.flatMap(s=>commerce.filter(c=>c.dependency!==s.dependency).map(c=>[s,c]))[0];
 const rule=direct.length?'DIRECT_EXACT_OFFER_MARKET':owned.length&&pair?'OWNED_REGIONAL_COMMERCE_WITH_INDEPENDENT_TRANSACTION_CONTEXT':null;
 return {version:corroborationVersion,status:rule?'ESTABLISHED':'INSUFFICIENT_POSITIVE_EVIDENCE',rule,observations,dependencyGroups:groups,contributingDimensions:rule?[...new Set((direct.length?direct:[...owned,...pair]).map(o=>o.dimension))]:[],supportingOnly:observations.filter(o=>!['STRONG','DIRECT'].includes(o.strength)).map(o=>o.dimension),reason:rule??'NO_INDEPENDENT_OFFER_COMMERCIAL_CORROBORATION'};
}
