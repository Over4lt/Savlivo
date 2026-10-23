// A provider's explicit coverage statement may save price-research requests.
// An absent price, failed acquisition, catalog hint, or AI answer never does.
import {createHash} from 'node:crypto';
import {countryCurrencyData} from '../../../../packages/contracts/src/markets.ts';
import {serviceCatalog} from '../../../../packages/contracts/src/catalog.ts';
import {createV2RobotsPublicAdapter} from '../research-v2/live/robots-policy.mjs';
import {baselineProviderSourceHosts,providerSourceDomainFamily} from '../research-v3/provider-source-family.mjs';
import {createTavilySearch} from '../research-v2/live/tavily-search.mjs';
import {readAvailabilitySearch,reserveAvailabilitySearch,completeAvailabilitySearch} from './market-availability-search-memory.mjs';
import {serviceMarketOverviewFor} from './service-market-overview.mjs';

const markets=countryCurrencyData.map(([code,name])=>({code,name}));
const aliases={GB:['Great Britain','UK'],CZ:['Czech Republic'],TR:['Turkey'],KR:['Republic of Korea'],US:['USA','United States of America'],AE:['UAE'],HK:['Hong Kong SAR']};
const displayNames=new Intl.DisplayNames(['en'],{type:'region'});
const allRegionNames=new Set();
for(let first=65;first<=90;first++)for(let second=65;second<=90;second++){
 const code=String.fromCharCode(first,second),name=displayNames.of(code);
 if(name&&name!==code)allRegionNames.add(name.normalize('NFKD').replace(/\p{M}/gu,'').toLocaleLowerCase('en-US').replace(/[^\p{L}\p{N}]+/gu,' ').trim());
}
for(const name of [...markets.map(market=>market.name),'US Virgin Islands','U.S. Virgin Islands','Türkiye','Turkey','Czech Republic','South Korea','North Korea','Great Britain'])allRegionNames.add(name.normalize('NFKD').replace(/\p{M}/gu,'').toLocaleLowerCase('en-US').replace(/[^\p{L}\p{N}]+/gu,' ').trim());
const sha=value=>createHash('sha256').update(value).digest('hex');
const text=value=>String(value??'').replace(/<script\b[^>]*>[\s\S]*?<\/script>/giu,' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/giu,' ')
 .replace(/<[^>]+>/gu,' ').replace(/&(?:nbsp|amp|quot|apos|lt|gt);/giu,entity=>({'&nbsp;':' ','&amp;':'&','&quot;':'"','&apos;':"'",'&lt;':'<','&gt;':'>'})[entity.toLowerCase()]??' ')
 .replace(/&#(\d+);/gu,(_,code)=>String.fromCodePoint(Number(code))).replace(/\s+/gu,' ').trim();
const normalized=value=>text(value).normalize('NFKD').replace(/\p{M}/gu,'').toLocaleLowerCase('en-US').replace(/[^\p{L}\p{N}]+/gu,' ').trim();
const nameMatches=(value,code)=>[markets.find(row=>row.code===code)?.name,...(aliases[code]??[])].filter(Boolean)
 .some(name=>normalized(value)===normalized(name));
const headingSections=html=>{
 const headings=[...html.matchAll(/<h([1-4])\b[^>]*>([\s\S]*?)<\/h\1\s*>/giu)];
 return headings.map((row,index)=>({heading:text(row[2]),body:html.slice(row.index+row[0].length,headings.slice(index+1).find(next=>Number(next[1])<=Number(row[1]))?.index??html.length)}));
};
const cells=html=>[...html.matchAll(/<(?:li|td)\b[^>]*>([\s\S]*?)<\/(?:li|td)\s*>/giu)].map(row=>text(row[1]));
const isEnglish=html=>/<html\b[^>]*\blang\s*=\s*["']?en(?:[-"'\s>])/iu.test(html.slice(0,1024));
const serviceTitle=(html,name)=>{
 const title=text(html.match(/<title\b[^>]*>([\s\S]*?)<\/title\s*>/iu)?.[1]);
 const words=normalized(name).split(' ').filter(word=>word.length>=3);
 return words.length>0&&words.every(word=>normalized(title).split(' ').includes(word));
};

export function officialMarketAvailability({serviceId,serviceName,url,body,checkedAt,officialHosts=[]}){
 const localizedJapanOnly=['u-next','dmm-tv'].includes(serviceId)&&serviceMarketOverviewFor(serviceId)?.sourceUrl===url;
 const localizedTitle=localizedJapanOnly&&typeof body==='string'&&normalized(body.match(/<title\b[^>]*>([\s\S]*?)<\/title\s*>/iu)?.[1]).includes(normalized(serviceName));
 if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(serviceId??'')||typeof serviceName!=='string'||!serviceName||
    typeof body!=='string'||Buffer.byteLength(body)>2_000_000||!Number.isFinite(Date.parse(checkedAt??''))||
    (!isEnglish(body)&&!localizedJapanOnly)||(!serviceTitle(body,serviceName)&&!localizedTitle))return null;
 const target={service:serviceId,serviceName,providerSourceIdentityHosts:officialHosts};
 if(!providerSourceDomainFamily(target,url))return null;
 const visible=body.replace(/<script\b[^>]*>[\s\S]*?<\/script>/giu,'').replace(/<style\b[^>]*>[\s\S]*?<\/style>/giu,''),unavailable=new Set(),evidence=[],sections=headingSections(visible);
 const brand=serviceName.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
 const overview=serviceMarketOverviewFor(serviceId);
 const countryOnly={US_ONLY:'US',CA_ONLY:'CA',JP_ONLY:'JP',KR_ONLY:'KR'}[overview?.sourceScope];
 if(countryOnly){
  let matchingPage=false;
  try{
   const current=new URL(url),reviewed=new URL(overview.sourceUrl);
   matchingPage=current.origin===reviewed.origin&&current.pathname===reviewed.pathname;
  }catch{}
  const statement=normalized(visible);
  const name=normalized(serviceName).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const serviceWide={
   US_ONLY:new RegExp('(?:'+name+' is currently available to stream within the united states|to subscribe to '+name+'.{0,160}to be located within the u s|'+name+' services? are only available in the united states|the '+name+' service is for individuals.{0,100}reside in the united states)'),
   CA_ONLY:serviceId==='crave'?/crave is only available for use within canada/u:serviceId==='sportsnet-plus'?/sportsnet is only available for streaming while you are physically located in canada/u:serviceId==='siriusxm-canada'?/we offer the services only within the provinces and territories of canada/u:/^$/u,
   JP_ONLY:serviceId==='hulu-japan'?/hulu japan .{0,100}is only available within japan/u:/^$/u,
   KR_ONLY:serviceId==='tving'?/our service is only available in south korea/u:/^$/u
  }[overview.sourceScope];
  const japaneseOnly=(serviceId==='u-next'&&statement.includes(normalized('サービスのご利用は日本国内に限ります')))||
   (serviceId==='dmm-tv'&&statement.includes(normalized('DMM TVは海外からご利用いただくことはできません')));
  if(matchingPage&&(serviceWide.test(statement)||japaneseOnly)){
   for(const market of markets)if(market.code!==countryOnly)unavailable.add(market.code);
   evidence.push(serviceName+' provider page limits sign-up or streaming to '+countryOnly+'.');
  }
 }
 // Only these reviewed, exact provider pages have a documented complete
 // service-wide country statement. A partial list, changed wording or an
 // unrecognized territory leaves every absent market eligible.
 if(['vix','kobo-plus'].includes(serviceId)&&overview?.sourceScope==='COMPLETE_SERVICE_LIST'&&url===overview.sourceUrl){
  let listed=[];
  if(serviceId==='vix'){
   const paragraph=[...visible.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p\s*>/giu)].map(row=>text(row[1]))
    .find(value=>/^vix is available in /iu.test(value));
   const names=paragraph?.match(/^ViX is available in (.+)\.$/iu)?.[1];
   if(names)listed=names.split(/,\s*|\s+and\s+/iu);
  }else if(normalized(visible).includes('moving to a country where kobo plus is not currently offered')&&
           normalized(visible).includes('kobo plus subscription will be cancelled')){
   const section=sections.find(row=>normalized(row.heading)==='available countries');
   listed=cells(section?.body.match(/<ul\b[^>]*>[\s\S]*?<\/ul\s*>/iu)?.[0]??'');
  }
  if(listed.length>=(serviceId==='vix'?15:25)&&listed.every(item=>allRegionNames.has(normalized(item)))){
   const present=new Set(markets.filter(market=>listed.some(item=>nameMatches(item,market.code))).map(market=>market.code));
   if(present.size>=(serviceId==='vix'?4:20)){
    for(const market of markets)if(!present.has(market.code))unavailable.add(market.code);
    evidence.push(`${serviceName} complete provider country list: ${listed.join(', ')}`);
   }
  }
 }
 const explicitNegative=new RegExp('\\b'+brand+'\\s+is\\s+not\\s+available\\s+in\\b|\\b'+brand+'\\s+is\\s+unavailable\\s+in\\b','iu');
 // Explicit negatives apply only to listed countries, never their neighbors.
 for(const section of sections){
  if(!explicitNegative.test(section.heading))continue;
  for(const item of cells(section.body))for(const market of markets)if(nameMatches(item,market.code)){unavailable.add(market.code);evidence.push(section.heading+': '+item);}
 }
 // Some help centers put the statement in a paragraph immediately before
 // the list rather than in a heading (Netflix does this).
 for(const match of visible.matchAll(new RegExp(brand+'\\s+is\\s+(?:not\\s+available|unavailable)\\s+in\\s*:\\s*<\\/[^>]+>\\s*<(?:ul|ol)\\b[^>]*>([\\s\\S]{0,5000}?)<\\/(?:ul|ol)>','giu'))){
  for(const item of cells(match[1]))for(const market of markets)if(nameMatches(item,market.code)){unavailable.add(market.code);evidence.push(serviceName+' is not available in: '+item);}
 }
 // A negative from absence requires the provider to call this the complete
 // membership country list. Generic navigation and language lists do not count.
 const intro=text(visible.slice(0,Math.min(visible.length,12000)));
 const exhaustive=new RegExp(brand+'\\s+(?:memberships?|subscriptions?|service)\\s+(?:are|is)\\s+available\\s+in\\s+the\\s+(?:countries|locations|regions|territories)(?:\\/territories)?\\s+listed\\s+below\\b','iu').test(intro);
 for(const section of sections){
  if(!exhaustive||!/\b(?:available locations|available countries|countries where .* available)\b/iu.test(section.heading)||
     /\blite\b|\bstudent\b|\bfamily\b|\blanguage\b/iu.test(section.heading))continue;
  const listed=cells(section.body),recognized=new Set();let unresolved=false;
  for(const item of listed){
   const label=item.split(/\s+[–—-]\s+/u)[0];
   if(!allRegionNames.has(normalized(label))){unresolved=true;break;}
   if(/\b(?:unavailable|not available)\b/iu.test(item))continue;
   for(const market of markets)if(nameMatches(label,market.code))recognized.add(market.code);
  }
  // Every list item must be understood before absence can exclude a market.
  if(unresolved||listed.length<10||recognized.size<8)continue;
  evidence.push(`${serviceName} subscriptions are available in the countries listed below: ${listed.join(', ')}`);
  for(const market of markets){
   if(recognized.has(market.code))continue;
   const knownNames=[market.name,...(aliases[market.code]??[])];
   if(knownNames.some(name=>new RegExp('(?:^|\\W)'+name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'(?:$|\\W)','iu').test(text(section.body))))continue;
   unavailable.add(market.code);
  }
 }
 if(!unavailable.size)return null;
 return {version:1,serviceId,sourceUrl:url,sourceHash:sha(body),checkedAt,unavailableMarkets:[...unavailable].sort(),basis:'OFFICIAL_EXPLICIT_OR_EXHAUSTIVE_COVERAGE',evidenceText:evidence.join(' | ').slice(0,3000)};
}

const cache=new Map(),CACHE_MS=6*60*60*1000,UNKNOWN_CACHE_MS=15*60*1000;
export async function discoverOfficialMarketAvailability(service,{search=null,read=null,paidSearch=null,paidSearchEnabled=false,ledgerRoot=null,clock=()=>new Date().toISOString()}={}){
 const serviceId=service.serviceId,serviceName=service.name,now=Date.now(),cacheKey=(ledgerRoot??'')+'\u0000'+serviceId,cached=cache.get(cacheKey);
 const prior=ledgerRoot?readAvailabilitySearch(ledgerRoot,serviceId):null;
 const reviewed=serviceMarketOverviewFor(serviceId);
 const reviewedOnlyPage=reviewed&&(['CA_ONLY','JP_ONLY','KR_ONLY'].includes(reviewed.sourceScope)||
  ['vix','kobo-plus'].includes(serviceId))?reviewed.sourceUrl:null;
 // Availability-only trust anchor: a reviewed first-party page is useful even
 // when a provider has no price-source host in the V3 registry. This host is
 // never carried into price acquisition or V3 provider authority.
 const reviewedHost=reviewedOnlyPage?new URL(reviewedOnlyPage).hostname:null;
 const officialHosts=[...new Set([...baselineProviderSourceHosts(serviceId,serviceName).filter(host=>!host.endsWith('apps.apple.com')),...(reviewedHost?[reviewedHost]:[])])];
 if(!officialHosts.length)return null;
 const target={service:serviceId,serviceName,providerSourceIdentityHosts:officialHosts};
 const saved=prior?.proof;
 if(saved?.version===1&&saved.serviceId===serviceId&&/^[a-f0-9]{64}$/u.test(saved.sourceHash??'')&&
    providerSourceDomainFamily(target,saved.sourceUrl)&&Number.isFinite(Date.parse(saved.checkedAt??''))&&
    Date.parse(saved.checkedAt)<=now&&now-Date.parse(saved.checkedAt)<CACHE_MS)return saved;
 if(cached&&cached.until>now&&(cached.value||!paidSearchEnabled))return cached.value;
 const signal=AbortSignal.timeout(4000);
 const adapter=!search||!read?createV2RobotsPublicAdapter({searchEnabled:true,retainRaw:true,maxResults:4,maxLinks:4,maxReads:7,maxRequests:16,network:{timeoutMs:8000,maxBytes:2_000_000,maxRedirects:2}}):null;
 const catalogSource=reviewed&&(['US_ONLY','CA_ONLY','JP_ONLY','KR_ONLY','EXPLICIT_NEGATIVE'].includes(reviewed.sourceScope)||
  ['vix','kobo-plus'].includes(serviceId))?reviewed.sourceUrl:
  serviceCatalog.find(row=>row.slug===serviceId)?.additionalAvailability?.sourceUrl;
 let proof=null;
 const attempted=new Set();
 const attempt=async(url,readSignal=signal)=>{
  if(readSignal.aborted||!url||attempted.has(url)||!providerSourceDomainFamily(target,url))return null;
  try{if([...new URL(url).searchParams.keys()].some(key=>/token|secret|auth|session|key/iu.test(key)))return null;}catch{return null;}
  attempted.add(url);
  let page;try{page=await (read??adapter.read)({url,signal:readSignal,stopOnCrossHostRedirect:true,maxRedirects:2});}catch{return null;}
  if(page?.outcome!=='OK'||page.httpStatus!==200||!page.rawSource?.text||!providerSourceDomainFamily(target,page.url)||
     page.sourceIntegrity?.sha256!==sha(page.rawSource.text)||!page.accessDecisions?.length||
     page.accessDecisions.some(row=>!['ALLOWED','NO_ROBOTS_POLICY'].includes(row.decision)))return null;
  return officialMarketAvailability({serviceId,serviceName,url:page.url,body:page.rawSource.text,checkedAt:page.checkedAt??clock(),officialHosts});
 };
 proof=await attempt(catalogSource);
 if(!proof)for(const url of (prior?.leadUrls??[]).slice(0,2)){proof=await attempt(url);if(proof)break;}
 if(!proof&&!signal.aborted){
  const query=`site:${officialHosts[0].replace(/^www\./u,'')} ${serviceName} available countries locations`;
  let found=[];try{found=(await (search??adapter.search)({query,signal,target:{service:serviceId,market:null}})).results??[];}catch{}
  for(const url of found.filter(row=>/availab|countries|locations|regions/iu.test(row.title??'')).map(row=>row.url).slice(0,2)){
   proof=await attempt(url);if(proof)break;
  }
 }
 if(!proof&&paidSearchEnabled&&ledgerRoot&&!prior){
  let paid=paidSearch;
  if(!paid)try{paid=await createTavilySearch({maxCalls:1,timeoutMs:10000});}catch{}
  if(paid&&reserveAvailabilitySearch(ledgerRoot,serviceId,clock())){
   const query=`site:${officialHosts[0].replace(/^www\./u,'')} ${serviceName} subscription available countries locations official`;
   let result=null,leadUrls=[];
   try{
    result=await paid({query,target:{service:serviceId,market:null}});
    leadUrls=(result?.results??[]).filter(row=>/availab|countries|locations|regions/iu.test(row.title??'')&&providerSourceDomainFamily(target,row.url)).map(row=>row.url).slice(0,2);
    for(const url of leadUrls){proof=await attempt(url,AbortSignal.timeout(8000));if(proof)break;}
   }finally{
    completeAvailabilitySearch(ledgerRoot,serviceId,{at:clock(),query,leadUrls,proof,usageCredits:result?.usageCredits});
   }
  }
 }
 cache.set(cacheKey,{until:now+(proof?CACHE_MS:UNKNOWN_CACHE_MS),value:proof});
 return proof;
}
