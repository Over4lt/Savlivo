// Search results help an operator find coverage lists. They never establish
// availability, exclude a market, or supply price/market evidence to research.
import {countryCurrencyData} from '../../../../packages/contracts/src/markets.ts';

const clean=value=>String(value??'').replace(/[\u0000-\u001f\u007f]/gu,' ').replace(/\s+/gu,' ').trim();
const normalized=value=>clean(value).toLocaleLowerCase('en-US').replace(/[^\p{L}\p{N}]+/gu,' ').trim();
const identity=name=>normalized(clean(name).split('/')[0]);
const displayNames=new Intl.DisplayNames(['en'],{type:'region'});
const countryNames=new Map(countryCurrencyData.flatMap(([code,name])=>[[normalized(name),code],[normalized(displayNames.of(code)),code]]));
for(const [name,code] of [['mainland china','CN'],['china','CN'],['uk','GB'],['usa','US'],['united states of america','US'],['south korea','KR']])countryNames.set(name,code);
const candidateMarkets=snippet=>{
 const value=clean(snippet);
 if(/\b(?:(?:not|never)\s+(?:(?:currently|yet)\s+)?|no\s+longer\s+)(?:available|offered)\s+in\b/iu.test(value))return [];
 const clause=value.match(/\b(?:available|offered)\s+in\s+([^.;:]{2,240})/iu)?.[1];
 if(!clause)return [];
 const parts=clause.replace(/\s+only\s*$/iu,'').split(/,\s*|\s+and\s+/iu).map(normalized);
 if(!parts.length||parts.length>46||parts.some(part=>!countryNames.has(part)))return [];
 return [...new Set(parts.map(part=>countryNames.get(part)))];
};

export function marketCoverageSearchLeads(serviceName,results,limit=3){
 const name=identity(serviceName);
 if(name.length<3||!Array.isArray(results))return [];
 const seen=new Set(),leads=[];
 for(const row of results){
  if(leads.length>=limit)break;
  let url;try{url=new URL(row?.url);}catch{continue;}
  if(url.protocol!=='https:'||url.username||url.password||[...url.searchParams.keys()].some(key=>/token|secret|auth|session|key/iu.test(key)))continue;
  url.hash='';
  const title=clean(row?.title).slice(0,160),snippet=clean(row?.snippet).slice(0,300);
  if(!title.toLocaleLowerCase('en-US').replace(/[^\p{L}\p{N}]+/gu,' ').includes(name)||
     !/countr|region|availab|where to watch|territor|land|länder|pays|país/iu.test(title+' '+snippet)||seen.has(url.href))continue;
  seen.add(url.href);
  leads.push({url:url.href,title,snippet,candidateMarkets:candidateMarkets(snippet),classification:'UNVERIFIED_SEARCH_LEAD'});
 }
 return leads;
}
