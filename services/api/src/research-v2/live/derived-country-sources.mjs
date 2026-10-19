import {normalizePublicUrl} from '../../research-v1/public-network.mjs';
import {resourceKey} from './execution-capabilities.mjs';

// Routes observed in the official Max DE frozen page (SHA-256
// f6a618d5ab14ea3ce06b599756f707eccb12855b5430d03fc6625a4f5caf00df).
// These are navigation candidates, never country or pricing evidence. Add a
// market only after its path appears in a retained first-party route map.
const maxRoutes=Object.freeze({DE:['de'],ES:['es','en']});
const maxCountryPath=/^\/([a-z]{2})\/([a-z]{2})\/?$/u;

function maxCandidates({service,market,patternLinks}){
 if(service!=='max'||!Object.hasOwn(maxRoutes,market))return [];
 const routes=(origin,link=null)=>maxRoutes[market].map(language=>({url:new URL(`/${market.toLowerCase()}/${language}`,origin).href,origin:link?'SAME_SERVICE_PROVIDER_ROUTE':'CHECKED_IN_PROVIDER_ROUTE_MAP',sourceLinkId:link?.id??null,sourceMarket:link?.marketCode??null,providerRouteEvidenceSha256:'f6a618d5ab14ea3ce06b599756f707eccb12855b5430d03fc6625a4f5caf00df'}));
 for(const link of patternLinks??[]){
  if(link.serviceId!=='max'||link.enabled!==true||link.truthAuthority!=='NONE'||link.marketScope!=='MARKET_SPECIFIC'||link.lastResult!=='VERIFIED')continue;
  let source;try{source=normalizePublicUrl(link.url);}catch{continue;}
  if(source.hostname!=='www.hbomax.com'||source.search||source.hash)continue;
  const parts=maxCountryPath.exec(source.pathname),sourceMarket=link.marketCode?.toLowerCase();
  if(!parts||parts[1]!==sourceMarket||!maxRoutes[link.marketCode]?.includes(parts[2]))continue;
  return routes(source.origin,link);
 }
 // The same frozen first-party page independently proves this small route
 // table. It keeps an exact market link optional even when no sibling link
 // has yet been configured for the service.
 return routes('https://www.hbomax.com');
}

// A service-specific strategy can be added after its own first-party route
// structure is proven. No generic country-token substitution is performed.
export function derivedCountrySourceCandidates({service,market,patternLinks=[],researchLinks=[],attemptedUrls=[]}){
 const configured=new Set(researchLinks.filter(link=>link.enabled&&link.marketScope==='MARKET_SPECIFIC'&&link.marketCode===market).map(link=>resourceKey(link.url)));
 const attempted=new Set(attemptedUrls.map(resourceKey));
 const seen=new Set();
 return maxCandidates({service,market,patternLinks}).filter(row=>{
  const key=resourceKey(row.url);if(configured.has(key)||attempted.has(key)||seen.has(key))return false;seen.add(key);return true;
 }).slice(0,2);
}
