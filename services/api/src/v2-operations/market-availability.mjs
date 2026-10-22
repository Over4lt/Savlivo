// A provider's explicit coverage statement may save price-research requests.
// An absent price, failed acquisition, catalog hint, or AI answer never does.
import {createHash} from 'node:crypto';
import {countryCurrencyData} from '../../../../packages/contracts/src/markets.ts';
import {serviceCatalog} from '../../../../packages/contracts/src/catalog.ts';
import {createV2RobotsPublicAdapter} from '../research-v2/live/robots-policy.mjs';
import {baselineProviderSourceHosts,providerSourceDomainFamily} from '../research-v3/provider-source-family.mjs';

const markets=countryCurrencyData.map(([code,name])=>({code,name}));
const aliases={GB:['Great Britain','UK'],CZ:['Czech Republic'],TR:['Turkey'],KR:['Republic of Korea'],US:['USA','United States of America'],AE:['UAE'],HK:['Hong Kong SAR']};
const displayNames=new Intl.DisplayNames(['en'],{type:'region'});
const allRegionNames=new Set();
for(let first=65;first<=90;first++)for(let second=65;second<=90;second++){
 const code=String.fromCharCode(first,second),name=displayNames.of(code);
 if(name&&name!==code)allRegionNames.add(name.normalize('NFKD').replace(/\p{M}/gu,'').toLocaleLowerCase('en-US').replace(/[^\p{L}\p{N}]+/gu,' ').trim());
}
for(const name of ['US Virgin Islands','U.S. Virgin Islands','Türkiye','Turkey','Czech Republic','South Korea','North Korea','Great Britain'])allRegionNames.add(name.normalize('NFKD').replace(/\p{M}/gu,'').toLocaleLowerCase('en-US').replace(/[^\p{L}\p{N}]+/gu,' ').trim());
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
 if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(serviceId??'')||typeof serviceName!=='string'||!serviceName||
    typeof body!=='string'||Buffer.byteLength(body)>2_000_000||!Number.isFinite(Date.parse(checkedAt??''))||
    !isEnglish(body)||!serviceTitle(body,serviceName))return null;
 const target={service:serviceId,serviceName,providerSourceIdentityHosts:officialHosts};
 if(!providerSourceDomainFamily(target,url))return null;
 const visible=body.replace(/<script\b[^>]*>[\s\S]*?<\/script>/giu,'').replace(/<style\b[^>]*>[\s\S]*?<\/style>/giu,''),unavailable=new Set(),evidence=[],sections=headingSections(visible);
 const brand=serviceName.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
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
export async function discoverOfficialMarketAvailability(service,{search=null,read=null,clock=()=>new Date().toISOString()}={}){
 const serviceId=service.serviceId,serviceName=service.name,now=Date.now(),cached=cache.get(serviceId);
 if(cached&&cached.until>now)return cached.value;
 const signal=AbortSignal.timeout(4000);
 const officialHosts=baselineProviderSourceHosts(serviceId,serviceName).filter(host=>!host.endsWith('apps.apple.com'));
 if(!officialHosts.length)return null;
 const target={service:serviceId,serviceName,providerSourceIdentityHosts:officialHosts};
 const adapter=!search||!read?createV2RobotsPublicAdapter({searchEnabled:true,retainRaw:true,maxResults:4,maxLinks:4,maxReads:3,maxRequests:7,network:{timeoutMs:8000,maxBytes:2_000_000,maxRedirects:2}}):null;
 const catalogSource=serviceCatalog.find(row=>row.slug===serviceId)?.additionalAvailability?.sourceUrl;
 let proof=null;
 const attempted=new Set();
 const attempt=async url=>{
  if(signal.aborted||!url||attempted.has(url)||!providerSourceDomainFamily(target,url))return null;
  try{if([...new URL(url).searchParams.keys()].some(key=>/token|secret|auth|session|key/iu.test(key)))return null;}catch{return null;}
  attempted.add(url);
  let page;try{page=await (read??adapter.read)({url,signal,stopOnCrossHostRedirect:true,maxRedirects:2});}catch{return null;}
  if(page?.outcome!=='OK'||page.httpStatus!==200||!page.rawSource?.text||!providerSourceDomainFamily(target,page.url)||
     page.sourceIntegrity?.sha256!==sha(page.rawSource.text)||!page.accessDecisions?.length||
     page.accessDecisions.some(row=>!['ALLOWED','NO_ROBOTS_POLICY'].includes(row.decision)))return null;
  return officialMarketAvailability({serviceId,serviceName,url:page.url,body:page.rawSource.text,checkedAt:page.checkedAt??clock(),officialHosts});
 };
 proof=await attempt(catalogSource);
 if(!proof&&!signal.aborted){
  const query=`site:${officialHosts[0].replace(/^www\./u,'')} ${serviceName} available countries locations`;
  let found=[];try{found=(await (search??adapter.search)({query,signal,target:{service:serviceId,market:null}})).results??[];}catch{}
  for(const url of found.filter(row=>/availab|countries|locations|regions/iu.test(row.title??'')).map(row=>row.url).slice(0,2)){
   proof=await attempt(url);if(proof)break;
  }
 }
 cache.set(serviceId,{until:now+(proof?CACHE_MS:UNKNOWN_CACHE_MS),value:proof});
 return proof;
}
