import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {normalizePublicUrl} from '../../research-v1/public-network.mjs';
import {resourceKey} from './execution-capabilities.mjs';

// The complete first-party Max DE page contains the provider's country/language
// route map. Its hash pins routing evidence, never market or pricing truth.
const maxRouteEvidenceHash='f6a618d5ab14ea3ce06b599756f707eccb12855b5430d03fc6625a4f5caf00df';
const maxRouteEvidenceUrl=new URL('../../research-v3/fixtures/max/de-homepage.html.gz',import.meta.url);
const preferredLanguages=Object.freeze({DE:'de',ES:'es',GB:'en',IE:'en',IT:'it',NO:'no',NZ:'en',SE:'sv'});
const maxCountryPath=/^\/([a-z]{2})\/([a-z]{2})\/?$/u;
let maxRouteMap;

function maxProviderRoutes(){
 if(maxRouteMap)return maxRouteMap;
 const body=gunzipSync(readFileSync(maxRouteEvidenceUrl)).toString('utf8');
 if(createHash('sha256').update(body).digest('hex')!==maxRouteEvidenceHash)throw Error('MAX_PROVIDER_ROUTE_EVIDENCE_HASH_MISMATCH');
 const routes=new Map();
 for(const match of body.matchAll(/"([a-z]{2})\/([a-z]{2})":\{"url":"\/\1\/\2"/gu)){
  const market=match[1].toUpperCase(),languages=routes.get(market)??new Set();languages.add(match[2]);routes.set(market,languages);
 }
 // The current DE route appears as the canonical URL, outside that map.
 if(!body.includes('<link rel="canonical" href="https://www.hbomax.com/de/de"'))throw Error('MAX_PROVIDER_ROUTE_CANONICAL_MISSING');
 routes.get('DE')?.add('de');
 maxRouteMap=routes;
 return routes;
}

// Shared constructor; another provider may supply its own proven route map.
export function countryLanguageRouteCandidates({service,market,origin,languages,preferredLanguage,evidenceSha256,sourceLink=null}){
 const preferred=preferredLanguage;
 const selected=[...(preferred&&languages.has(preferred)?[preferred]:[]),...(languages.has('en')?['en']:[])];
 if(!selected.length&&languages.size===1)selected.push(...languages);
 return [...new Set(selected)].slice(0,2).map(language=>({url:new URL(`/${market.toLowerCase()}/${language}`,origin).href,origin:sourceLink?'SAME_SERVICE_PROVIDER_ROUTE':'CHECKED_IN_PROVIDER_ROUTE_MAP',service,market,sourceLinkId:sourceLink?.id??null,sourceMarket:sourceLink?.marketCode??null,providerRouteEvidenceSha256:evidenceSha256}));
}
// Both the verified US Research Link and the retained GB Direct source use
// this same first-party pricing article. The GB URL is a bounded acquisition
// hint backed by the retained body hash, not a market receipt or price proof.
const maxHelpArticle={market:'GB',url:'https://help.hbomax.com/gb/Answer/Detail/000002547',sourceHash:'1f5bf27614ea6257a61dc23aaf76d902183688e65b42cb3a3b20d75fe5aa9983'};
const maxUSHelpPath='/us/Answer/Detail/000002547';

function maxHelpCandidates({service,market,patternLinks}){
 if(service!=='max'||market!==maxHelpArticle.market)return [];
 const source=(patternLinks??[]).find(link=>{
  if(link.serviceId!=='max'||link.enabled!==true||link.truthAuthority!=='NONE'||link.marketScope!=='MARKET_SPECIFIC'||link.marketCode!=='US'||link.lastResult!=='VERIFIED')return false;
  try{const url=normalizePublicUrl(link.url);return url.hostname==='help.hbomax.com'&&url.pathname===maxUSHelpPath&&!url.hash&&(!url.search||url.search==='?pubDate=20260926');}catch{return false;}
 });
 const inferred=source?new URL(source.url).pathname.replace(/^\/us\//u,'/gb/'):null;
 const url=inferred?new URL(inferred,'https://help.hbomax.com').href:maxHelpArticle.url;
 if(url!==maxHelpArticle.url)return [];
 return [{url,origin:source?'SAME_SERVICE_PROVIDER_ARTICLE':'CHECKED_IN_PROVIDER_ARTICLE',service,market,sourceLinkId:source?.id??null,sourceMarket:source?.marketCode??null,providerRouteEvidenceSha256:maxHelpArticle.sourceHash}];
}

function maxCandidates({service,market,patternLinks}){
 if(service!=='max'||!(/^[A-Z]{2}$/u.test(market)))return [];
 const help=maxHelpCandidates({service,market,patternLinks});if(help.length)return help;
 const languages=maxProviderRoutes().get(market);
 if(!languages)return help;
 const preferredLanguage=preferredLanguages[market]??(languages.has(market.toLowerCase())?market.toLowerCase():null);
 for(const link of patternLinks??[]){
  if(link.serviceId!=='max'||link.enabled!==true||link.truthAuthority!=='NONE'||link.marketScope!=='MARKET_SPECIFIC'||link.lastResult!=='VERIFIED')continue;
  let source;try{source=normalizePublicUrl(link.url);}catch{continue;}
  if(source.hostname!=='www.hbomax.com'||source.search||source.hash)continue;
  const parts=maxCountryPath.exec(source.pathname),sourceMarket=link.marketCode?.toLowerCase();
  if(!parts||parts[1]!==sourceMarket||!maxProviderRoutes().get(link.marketCode)?.has(parts[2]))continue;
  return countryLanguageRouteCandidates({service,market,origin:source.origin,languages,preferredLanguage,evidenceSha256:maxRouteEvidenceHash,sourceLink:link});
 }
 return countryLanguageRouteCandidates({service,market,origin:'https://www.hbomax.com',languages,preferredLanguage,evidenceSha256:maxRouteEvidenceHash});
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
