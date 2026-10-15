// Explicit service-scoped DNS namespace review. This is provider identity for
// routing only; it cannot establish a price, product, market, or availability.
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {parse} from 'tldts';
import {loadResearchServiceProjection} from './research-service-projection.mjs';
import {normalizeUrl} from './model.mjs';

const defaultRepository=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../../..');
const registryPath='docs/catalog/global-47/research-v2/reviewed-provider-domains.json';
const baselinePath='docs/catalog/baseline-60362c6.json';
const fail=()=>{throw Error('REVIEWED_PROVIDER_NAMESPACE_INVALID');};
const within=(root,relative)=>{
 if(typeof relative!=='string'||path.isAbsolute(relative))fail();
 const file=path.resolve(root,relative);
 if(!file.startsWith(root+path.sep))fail();
 return file;
};
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const parsedDomain=hostname=>{
 const result=parse(hostname,{allowPrivateDomains:true});
 return result.domain&&(result.isIcann||result.isPrivate)&&!result.isIp?result.domain:null;
};
export function reviewedNamespaceMatches(domain,url){
 const normalized=normalizeUrl(url);
 if(!normalized||typeof domain!=='string')return false;
 const host=new URL(normalized).hostname;
 return parsedDomain(domain)===domain&&parsedDomain(host)===domain&&(host===domain||host.endsWith('.'+domain));
}

function validateEvidence(binding,evidence,repo,sourceCache){
 if(!evidence||evidence.path!==baselinePath||!['DIRECT_PROVIDER_PRICE_SOURCE','DIRECT_PROVIDER_MANAGEMENT_ROUTE'].includes(evidence.kind)||typeof evidence.sha256!=='string'||!/^[a-f0-9]{64}$/.test(evidence.sha256)||!reviewedNamespaceMatches(binding.registrableDomain,evidence.sourceUrl))fail();
 let source=sourceCache.get(evidence.path);
 if(!source){const bytes=fs.readFileSync(within(repo,evidence.path));source={sha256:hash(bytes),data:JSON.parse(bytes)};sourceCache.set(evidence.path,source);}
 if(source.sha256!==evidence.sha256)fail();
 const data=source.data;
 if(!data.services?.some(row=>row.slug===binding.service&&row.name===binding.serviceName))fail();
 const confirmed=evidence.kind==='DIRECT_PROVIDER_PRICE_SOURCE'
  ?data.markets?.some(market=>market.offlinePrices?.some(row=>row.serviceSlug===binding.service&&row.source==='official-provider-adapter:'+binding.service&&row.billingProviderSlug==='direct'&&row.sourceUrl===evidence.sourceUrl))
  :data.managementProfiles?.some(profile=>profile.some(row=>row.service===binding.service&&row.routes?.direct===evidence.sourceUrl));
 if(!confirmed)fail();
}

export function loadReviewedProviderNamespaces({repo=defaultRepository}={}){
 const root=path.resolve(repo),document=JSON.parse(fs.readFileSync(within(root,registryPath),'utf8'));
 if(document.schemaVersion!==1||document.scope!=='LIVE_PRICE_RESEARCH_PROVIDER_IDENTITY_ONLY'||!Array.isArray(document.bindings))fail();
 const projection=loadResearchServiceProjection({repo:root});
 const identities=new Map(projection.rows.filter(row=>row.sources.baseline||row.sources.frozen).map(row=>[row.serviceId,row.name]));
 const seen=new Set(),sources=new Map();
 for(const binding of document.bindings){
  if(binding.status!=='REVIEWED'||binding.scope!=='OWNED_DNS_NAMESPACE'||identities.get(binding.service)!==binding.serviceName||parsedDomain(binding.registrableDomain)!==binding.registrableDomain||seen.has(binding.service+'|'+binding.registrableDomain)||typeof binding.review?.reviewedAt!=='string'||!Number.isFinite(Date.parse(binding.review.reviewedAt))||!binding.review.method||typeof binding.review.reason!=='string'||!binding.review.reason.trim()||!Array.isArray(binding.provenance)||!binding.provenance.length)fail();
  const kinds=new Set(binding.provenance.map(row=>row.kind)),hosts=new Set(binding.provenance.map(row=>{try{return new URL(row.sourceUrl).hostname;}catch{return null;}}));
  if(!kinds.has('DIRECT_PROVIDER_PRICE_SOURCE')||!kinds.has('DIRECT_PROVIDER_MANAGEMENT_ROUTE')||hosts.size<2||hosts.has(null))fail();
  seen.add(binding.service+'|'+binding.registrableDomain);
  for(const evidence of binding.provenance)validateEvidence(binding,evidence,root,sources);
 }
 return document.bindings;
}

let defaultBindings;
export function reviewedProviderNamespacesFor(service,serviceName){
 defaultBindings??=loadReviewedProviderNamespaces();
 return defaultBindings.filter(row=>row.service===service&&row.serviceName===serviceName).map(row=>structuredClone(row));
}

// A reviewed price-source host is the preferred navigation root. The path is
// deliberately discarded: this is a discovery seed, never inherited evidence.
export function canonicalReviewedProviderRoot(binding){
 if(binding?.status!=='REVIEWED'||binding?.scope!=='OWNED_DNS_NAMESPACE')return null;
 const source=binding.provenance?.find(row=>row.kind==='DIRECT_PROVIDER_PRICE_SOURCE'&&reviewedNamespaceMatches(binding.registrableDomain,row.sourceUrl));
 if(!source)return null;
 const url=new URL(source.sourceUrl);
 return {url:`https://${url.hostname}/`,registrableDomain:binding.registrableDomain,sourceUrl:source.sourceUrl,meaning:'ROUTING_ONLY_NOT_EVIDENCE',truthAuthority:'NONE'};
}
