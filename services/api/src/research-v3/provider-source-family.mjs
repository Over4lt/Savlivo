// Post-acquisition source identity only. This module grants no navigation,
// acquisition, provider-authority binding, market or price permission.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {parse} from 'tldts';
import {canonical,normalizeUrl} from './model.mjs';
import {reviewedProviderNamespacesFor} from './reviewed-provider-namespaces.mjs';

const baselinePath=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../../../docs/catalog/baseline-60362c6.json');
let baselineHosts;
const registrable=hostname=>{
 if(typeof hostname!=='string'||!hostname||hostname.length>253)return null;
 let host;try{host=new URL('https://'+hostname+'/').hostname;}catch{return null;}
 if(host!==hostname.toLowerCase())return null;
 const result=parse(host,{allowPrivateDomains:true});
 return result.domain&&(result.isIcann||result.isPrivate)&&!result.isIp?result.domain:null;
};
// Max's checked-in price source uses max.com. These two exact HBO Max hosts
// belong to the same service, but do not grant an entire new DNS namespace.
const maxHboSourceHosts=new Set(['www.hbomax.com','help.hbomax.com']);

// These hosts come from checked-in, service-scoped official provider price
// sources. A manually entered Research link is never read by this projection.
export function baselineProviderSourceHosts(serviceId,serviceName){
 baselineHosts??=(()=>{
  const data=JSON.parse(fs.readFileSync(baselinePath,'utf8')),names=new Map((data.services??[]).map(row=>[row.slug,row.name])),hosts=new Map();
  for(const market of data.markets??[])for(const row of market.offlinePrices??[]){
   if(names.get(row.serviceSlug)==null||row.source!=='official-provider-adapter:'+row.serviceSlug||row.billingProviderSlug!=='direct')continue;
   const url=normalizeUrl(row.sourceUrl);if(!url)continue;const host=new URL(url).hostname;if(!registrable(host))continue;
   const key=row.serviceSlug+'\u0000'+names.get(row.serviceSlug),set=hosts.get(key)??new Set();if(set.size<16)set.add(host);hosts.set(key,set);
  }
  return hosts;
 })();
 return [...(baselineHosts.get(serviceId+'\u0000'+serviceName)??[])];
}

export function providerSourceDomainFamily(target,finalUrl){
 const url=normalizeUrl(finalUrl);if(!url)return null;
 const host=new URL(url).hostname,domain=registrable(host);if(!domain)return null;
 const reviewed=reviewedProviderNamespacesFor(target?.service,target?.serviceName)
  .filter(binding=>(target?.reviewedProviderNamespaces??[]).some(row=>canonical(row)===canonical(binding)))
  .map(binding=>binding.registrableDomain);
 const established=[...(target?.providerSourceIdentityHosts??[]),...(target?.authorities??[])
  .filter(row=>row.routingOnly!==true&&row.provider===target?.serviceName&&row.checkedAt&&['OFFICIAL_PROVIDER','OFFICIAL_SUPPORT'].includes(row.sourceType)&&normalizeUrl(row.sourceUrl)&&new URL(row.sourceUrl).hostname===row.hostname)
  .map(row=>row.hostname),...reviewed];
 if(target?.service==='max'&&target?.serviceName==='Max'&&maxHboSourceHosts.has(host)&&established.includes('www.max.com'))
  return {host,registrableDomain:domain,establishedHost:'www.max.com',reason:'MAX_HBO_MAX_OFFICIAL_HOST'};
 const matched=established.find(candidate=>registrable(candidate)===domain);
 return matched?{host,registrableDomain:domain,establishedHost:matched,reason:'SAME_PROVIDER_REGISTRABLE_DOMAIN'}:null;
}
