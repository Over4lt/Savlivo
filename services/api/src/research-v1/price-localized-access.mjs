// Access hypothesis only, never a price fact or provider truth.
// An official source must positively describe network-localized pricing and
// unavailable pricing for this plan. Empty parsers/missing fields are insufficient.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {validatePriceScope,priceScopeKey} from './price-scope.mjs';
export const localizedAccessVersion='PRICE_LOCALIZED_ACCESS_V1';
const hash=s=>createHash('sha256').update(s).digest('hex');
const allowed=d=>['ALLOWED','NO_ROBOTS_POLICY'].includes(d.decision);
function fragment(source,scope){
 const text=source.extraction?.text??source.rawSource?.text??'';
 // Bounded sentence relationships, not arbitrary localization words.
 return text.split(/[\n.!?]/).find(s=>s.length<=600&&s.toLowerCase().includes(scope.plan.toLowerCase())&&
  /price.{0,50}(?:unavailable|not (?:shown|displayed|available))/i.test(s)&&
  /pric(?:e|es|ing).{0,120}(?:based on|depend(?:s)? on|determined by).{0,50}(?:current country|network location|access location)/i.test(s))?.trim()??null;
}
export function validLocalizedPriceAccess(gap,source,scope){
 try{
  validatePriceScope(scope);const d=gap.priceGeography;
  assert(d?.version===localizedAccessVersion&&d.category==='OFFICIAL_NETWORK_LOCALIZED_PRICE_UNAVAILABLE');
  assert(gap.fact==='prices'&&gap.requiresTargetGeo===true&&priceScopeKey(d.scope)===priceScopeKey(scope));
  assert(d.requestedMarket===scope.countryCode&&d.sourceUrl===source.url);
  assert(source.priceAcquisition?.complete===true&&priceScopeKey(source.priceAcquisition.scope)===priceScopeKey(scope));
  assert(d.acquisitionId===source.priceAcquisition.id&&d.acquisitionId===hash(JSON.stringify([scope,source.url,source.checkedAt])));
  assert(source.outcome==='OK'&&source.httpStatus===200&&source.redirects.length===0);
  assert(['OFFICIAL_PROVIDER','OFFICIAL_SUPPORT','OFFICIAL_STORE'].includes(source.sourceType));
  assert(source.authority?.hostname===new URL(source.url).hostname&&source.authority.provider);
  assert(source.rawSource?.text&&hash(source.rawSource.text)===d.bodySha256);
  assert(d.fragment&&d.fragment===fragment(source,scope)&&source.rawSource.text.includes(d.fragment)&&source.rawSource.text.length<=1000000);
  assert(source.accessDecisions?.some(x=>x.targetUrl===source.url&&allowed(x))&&source.accessDecisions.every(allowed));
  assert(!/captcha|sign in|log in|login|access denied|prohibited/i.test(source.extraction?.text??source.rawSource.text));
  assert(Array.isArray(d.requiredSources)&&d.requiredSources.length>0&&d.requiredSources.length<=60&&d.requiredSources.includes(source.url));
  return true;
 }catch{return false;}
}
export function exhaustedPriceAccessPages({scope,pages,actions,attempts,acquisitions,hasVerifiedPrice=false,hasPriceCandidate=false,evaluatedPathIds=[]}){
 if(hasVerifiedPrice||hasPriceCandidate)return [];
 const matching=actions.filter(a=>a.claim==='prices'&&a.path!=='GEO_RESEARCH_REQUIRED'&&
  (a.priceScope||a.priceAcquisition?.scope)&&priceScopeKey(a.priceScope??a.priceAcquisition.scope)===priceScopeKey(scope));
 if(!matching.length||matching.some(a=>!attempts.some(t=>t.id===a.id&&t.status==='COMPLETED')&&!evaluatedPathIds.includes(a.id)))return [];
 const requiredSources=[...new Set(matching.flatMap(a=>a.priceAcquisition?.sources??a.plan.map(p=>p.url)).filter(Boolean))];
 const retained=pages.filter(p=>p.priceAcquisition&&priceScopeKey(p.priceAcquisition.scope)===priceScopeKey(scope));
 if(requiredSources.some(url=>!retained.some(p=>p.url===url&&p.outcome==='OK'&&p.priceAcquisition.complete)))return [];
 // A candidate needing semantic verification is not an access problem.
 if(acquisitions.some(a=>a.candidates?.some(c=>c.trust==='UNVERIFIED_PARSER_OUTPUT'&&c.item.planName===scope.plan&&c.item.countryCode===scope.countryCode)))return [];
 const output=[];
 for(const page of retained){
  const quote=fragment(page,scope);if(!quote)continue;
  const gap={fact:'prices',requiresTargetGeo:true,reason:'Official source describes unavailable scoped pricing dependent on network location',
   priceGeography:{version:localizedAccessVersion,category:'OFFICIAL_NETWORK_LOCALIZED_PRICE_UNAVAILABLE',scope:structuredClone(scope),
    requestedMarket:scope.countryCode,sourceUrl:page.url,bodySha256:hash(page.rawSource.text),fragment:quote,
    acquisitionId:page.priceAcquisition.id,requiredSources}};
  if(validLocalizedPriceAccess(gap,page,scope))output.push({...structuredClone(page),gaps:[...page.gaps,gap]});
 }
 return output;
}
export function localizedHistoryComplete(gap,attempts){
 const scope=gap.priceScope;if(!scope)return false;
 const sources=attempts.flatMap(a=>a.source?[a.source]:[]);
 const diagnostic=sources.flatMap(s=>(s.geoGaps??[]).filter(g=>validLocalizedPriceAccess(g,s,scope)).map(g=>g.priceGeography))[0];
 return !!diagnostic&&diagnostic.requiredSources.every(url=>sources.some(s=>s.url===url&&s.outcome==='OK'&&s.priceAcquisition?.complete===true&&priceScopeKey(s.priceAcquisition.scope)===priceScopeKey(scope)));
}
