// Pre-authority research only. Candidate pages never enter V3 knowledge or Truth.
import {createHash} from 'node:crypto';
import {extractPage} from '../research-v1/public-web-adapter.mjs';
import {createTavilySearch,readTavilyKeychain} from '../research-v2/live/tavily-search.mjs';
import {createV2RobotsPublicAdapter} from '../research-v2/live/robots-policy.mjs';
import {normalizeFrontierUrl} from '../research-v2/live/source-frontier.mjs';
import {sourceLinks,decodeEntities} from '../research-v2/live/source-frontier-links.mjs';

export const bootstrapBounds=Object.freeze({searches:2,candidates:12,reads:10,linksPerPage:80,bytesPerPage:1048576,requestsPerRead:4});
const sha=s=>createHash('sha256').update(s).digest('hex');
const identity=s=>String(s??'').normalize('NFKC').replace(/\s+/gu,' ').trim().toLocaleLowerCase('en');
const words=s=>String(s??'').replace(/[™®℠]/gu,'').normalize('NFKD').replace(/\p{M}/gu,'').toLocaleLowerCase('en').match(/[\p{L}\p{N}]+/gu)??[];
const folded=s=>words(s).join('');
const plain=s=>decodeEntities(String(s??'').replace(/<[^>]*>/g,' ')).replace(/\s+/gu,' ').trim();
const types=v=>(Array.isArray(v)?v:[v]).filter(x=>typeof x==='string').map(x=>x.split('/').at(-1));
const name=v=>typeof v==='string'?v:typeof v?.name==='string'?v.name:null;
const same=(a,b)=>!!a&&!!b&&!!folded(a)&&folded(a)===folded(b);
const primary=(value,service)=>{
    if(same(value,service))return true;
    const first=String(value??'').split(/\s+[|—–-]\s+|\s+:\s+/u)[0];
    if(same(first,service))return true;
    const a=words(first),b=words(service);
    return b.length>0&&a.length>b.length&&b.every((part,i)=>a[i]===part);
};
const safeUrl=value=>normalizeFrontierUrl(value).url;
const sameOrigin=(value,base)=>{try{const url=safeUrl(new URL(value,base).href);return !!url&&new URL(url).origin===new URL(base).origin;}catch{return false;}};
const short=value=>typeof value==='string'?value.replace(/[\p{C}]/gu,' ').replace(/\s+/gu,' ').trim().slice(0,160):null;
const code=value=>typeof value==='string'&&/^[A-Z0-9_:-]{1,80}$/.test(value)?value:null;
const sample=values=>[...new Set(values.filter(Boolean).map(short))].slice(0,8);
const displayQuery=s=>String(s).normalize('NFKC').replace(/[-‐‑‒–—_]+/gu,' ').replace(/\s+/gu,' ').trim();
const thirdPartyPresentation=(value,service)=>{
    if(!folded(service)||!folded(value).includes(folded(service)))return false;
    const serviceWords=new Set(words(service));
    return words(value).some(word=>!serviceWords.has(word)&&['review','reviews','compare','comparison','comparisons','alternatives','directory','listing','marketplace','reseller','affiliate','vs'].includes(word));
};

function redirectSummary(diagnostic) {
    if(!diagnostic||typeof diagnostic!=='object')return null;
    const destination=diagnostic.destination;
    return {stage:code(diagnostic.stage),httpStatus:Number.isInteger(diagnostic.httpStatus)?diagnostic.httpStatus:null,limit:Number.isInteger(diagnostic.limit)?diagnostic.limit:null,followed:Number.isInteger(diagnostic.followed)?diagnostic.followed:null,destination:destination&&typeof destination==='object'?Object.fromEntries(['valid','https','sameOrigin','userinfo','query','fragment'].filter(k=>typeof destination[k]==='boolean').map(k=>[k,destination[k]])):null};
}

function acquisitionDiagnostics(candidate,page) {
    const requested=safeUrl(candidate?.url),final=safeUrl(page?.url),body=page?.rawSource?.text;
    const checks={requestedUrl:!!requested,finalUrl:!!final,sameOrigin:!!requested&&!!final&&new URL(requested).origin===new URL(final).origin,outcomeOk:page?.outcome==='OK',http200:page?.httpStatus===200,rawBodyPresent:typeof body==='string',bodyWithinLimit:typeof body==='string'&&Buffer.byteLength(body)<=bootstrapBounds.bytesPerPage,htmlContentType:/^text\/html\b/i.test(page?.contentType??page?.rawSource?.contentType??''),sourceHashMatches:typeof body==='string'&&page?.sourceIntegrity?.sha256===sha(body)};
    const bodyDiagnostic=page?.bodyDiagnostic,responseDiagnostic=page?.responseDiagnostic;
    return {checks,failedChecks:Object.entries(checks).filter(([,passed])=>!passed).map(([key])=>key),adapter:{outcome:code(page?.outcome),failureCode:code(page?.failure?.code),httpStatus:Number.isInteger(page?.httpStatus)?page.httpStatus:null,redirectCount:Array.isArray(page?.redirects)?page.redirects.length:null,redirectDiagnostic:redirectSummary(page?.redirectDiagnostic),accessDecisions:(Array.isArray(page?.accessDecisions)?page.accessDecisions:[]).slice(0,8).map(x=>({decision:code(x?.decision),reason:code(x?.reason),boundary:code(x?.boundary),httpStatus:Number.isInteger(x?.httpStatus)?x.httpStatus:null,redirectDiagnostic:redirectSummary(x?.rejectionDiagnostic)}))},content:{type:short(page?.contentType??page?.rawSource?.contentType),bodyBytes:typeof body==='string'?Buffer.byteLength(body):null,sourceHashPresent:typeof page?.sourceIntegrity?.sha256==='string',sourceHashMatches:checks.sourceHashMatches,bodyDiagnostic:bodyDiagnostic&&typeof bodyDiagnostic==='object'?{stage:code(bodyDiagnostic.stage),limit:Number.isInteger(bodyDiagnostic.limit)?bodyDiagnostic.limit:null,declaredBytes:Number.isInteger(bodyDiagnostic.declaredBytes)?bodyDiagnostic.declaredBytes:null,receivedBytes:Number.isInteger(bodyDiagnostic.receivedBytes)?bodyDiagnostic.receivedBytes:null,contentType:short(bodyDiagnostic.contentType)}:null,responseDiagnostic:responseDiagnostic&&typeof responseDiagnostic==='object'?{rejectionStage:code(responseDiagnostic.rejectionStage),httpStatus:Number.isInteger(responseDiagnostic.httpStatus)?responseDiagnostic.httpStatus:null,normalizedMediaType:short(responseDiagnostic.normalizedMediaType)}:null}};
}

function structuredIdentities(body) {
    const nodes=[];
    for(const match of body.matchAll(/<script\b[^>]*type\s*=\s*(?:"application\/ld\+json"|'application\/ld\+json')[^>]*>([\s\S]*?)<\/script\s*>/gi)) {
        if(match[1].length>262144||nodes.length>=32)continue;
        let parsed;try{parsed=JSON.parse(match[1]);}catch{continue;}
        const queue=[parsed];
        while(queue.length&&nodes.length<32){const item=queue.shift();if(Array.isArray(item)){queue.push(...item.slice(0,32));continue;}if(!item||typeof item!=='object')continue;
            if(Array.isArray(item['@graph']))queue.push(...item['@graph'].slice(0,32));
            if(item['@type'])nodes.push(item);
        }
    }
    return nodes;
}

export function evaluateProviderCandidate({service,candidate,page}) {
    const acquisition=acquisitionDiagnostics(candidate,page),final=safeUrl(page?.url),body=page?.rawSource?.text;
    if(acquisition.failedChecks.length)return {status:'CANDIDATE',reason:'NO_INTACT_SAME_ORIGIN_PAGE',diagnostics:{acquisition}};
    const extracted=extractPage(body,final,{maxText:5000,maxLinks:0});
    const headings=[...body.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1\s*>/gi)].slice(0,8).map(m=>plain(m[1]));
    const titleMatch=primary(extracted.title,service),headingMatch=headings.some(h=>primary(h,service)),prominent=titleMatch||headingMatch;
    const nodes=structuredIdentities(body),siteNames=[extracted.metadata['og:site_name'],...nodes.filter(n=>types(n['@type']).includes('WebSite')).map(n=>name(n))].filter(Boolean);
    const organizationNames=nodes.filter(n=>types(n['@type']).includes('Organization')).map(n=>name(n)).filter(Boolean);
    const ownerNames=[...siteNames,...organizationNames],products=nodes.filter(n=>types(n['@type']).some(t=>['Product','Service','SoftwareApplication'].includes(t))&&same(name(n),service));
    const related=products.find(n=>[n.provider,n.brand,n.publisher,n.manufacturer].some(p=>ownerNames.some(owner=>same(name(p),owner)))&&(!n.url||sameOrigin(n.url,final)));
    const relatedProviderNames=related?[related.provider,related.brand,related.publisher,related.manufacturer].map(name).filter(Boolean):[];
    const distinctSites=[...new Set(siteNames.map(folded))],siteConflict=distinctSites.length>1&&siteNames.some(n=>!same(n,service)&&!relatedProviderNames.some(provider=>same(n,provider)));
    const directOwner=siteNames.some(n=>same(n,service))||!siteNames.length&&organizationNames.some(n=>same(n,service)),root=new URL(final).pathname==='/',rootIdentity=root&&titleMatch&&headingMatch&&!siteNames.length&&!organizationNames.length;
    const canonical=sourceLinks(body,{maxBytes:bootstrapBounds.bytesPerPage,maxLinks:bootstrapBounds.linksPerPage,maxJsonNodes:300}).links.filter(l=>l.mechanism==='PROVIDER_CANONICAL_OR_LOCALE'&&/canonical/i.test(l.label));
    const foreignCanonical=canonical.some(l=>{try{const u=safeUrl(new URL(l.url,final).href);return u&&new URL(u).origin!==new URL(final).origin;}catch{return false;}});
    const listing=nodes.some(n=>types(n['@type']).some(t=>['Review','AggregateRating','ItemList','CollectionPage','SearchResultsPage'].includes(t)))||[extracted.title,...headings].some(value=>thirdPartyPresentation(value,service));
    const identitySummary={normalizedRequestedIdentity:folded(service),title:short(extracted.title),titleMatches:titleMatch,headings:sample(headings),matchingHeadings:sample(headings.filter(h=>primary(h,service))),siteNames:sample(siteNames),organizationNames:sample(organizationNames),productNames:sample(products.map(n=>name(n))),productProviderNames:sample(products.flatMap(n=>[n.provider,n.brand,n.publisher,n.manufacturer].map(name))),siteConflict,explicitProductProvider:!!related,rootFirstPartyPresentation:rootIdentity};
    const diagnostics={acquisition,identity:identitySummary};
    const refuse=reason=>({status:'CANDIDATE',reason,diagnostics});
    if(listing)return refuse('THIRD_PARTY_PAGE');
    if(foreignCanonical)return refuse('FOREIGN_CANONICAL');
    if(siteConflict)return refuse('COMPETING_SITE_IDENTITIES');
    if(!prominent&&!related&&!directOwner)return refuse('SERVICE_NOT_PRIMARY');
    if(!ownerNames.length&&!rootIdentity)return refuse('SITE_IDENTITY_MISSING');
    const relation=related?'EXPLICIT_PRODUCT_PROVIDER':directOwner||rootIdentity?'DIRECT_SERVICE_SITE':null;
    if(!relation)return refuse('PROVIDER_PRODUCT_RELATIONSHIP_UNRESOLVED');
    const providerName=relation==='EXPLICIT_PRODUCT_PROVIDER'?ownerNames.find(owner=>[related.provider,related.brand,related.publisher,related.manufacturer].some(p=>same(name(p),owner))):ownerNames.find(n=>same(n,service))??service;
    return {status:'PROVIDER_BOUND',host:new URL(final).hostname,entryUrl:final,relation,providerName,source:{url:final,sha256:sha(body),siteIdentity:providerName,serviceIdentity:service,primaryTitle:extracted.title,primaryHeadings:headings.filter(h=>primary(h,service)).slice(0,2)},diagnostics};
}

export async function bootstrapProvider({service,market,search,read,bounds={}}) {
    if(typeof service!=='string'||!service.trim()||service.length>120||typeof market!=='string'||!/^[A-Z]{2}$/.test(market))throw Error('INVALID_BOOTSTRAP_TARGET');
    if(typeof search!=='function'||typeof read!=='function')throw Error('BOOTSTRAP_CAPABILITY_REQUIRED');
    const limit={...bootstrapBounds,...bounds};
    for(const [key,value]of Object.entries(limit))if(!(key in bootstrapBounds)||!Number.isSafeInteger(value)||value<1||value>bootstrapBounds[key])throw Error('INVALID_BOOTSTRAP_BOUND');
    const target={service:identity(service).replace(/\s+/g,'-'),serviceName:service.trim(),market};
    const queryIdentity=displayQuery(service),queries=[`${queryIdentity} official site`,`${queryIdentity} ${market} official subscription`].slice(0,limit.searches);
    const queue=[],seen=new Set(),pages=[],searches=[];
    const add=(url,from)=>{const normalized=safeUrl(url);if(!normalized||seen.has(normalized)||seen.size>=limit.candidates)return;seen.add(normalized);queue.push({url:normalized,from});};
    for(const query of queries){let result;try{result=await search({query,target});}catch{result={results:[],failure:{code:'SEARCH_UNAVAILABLE'}};}
        const results=Array.isArray(result?.results)?result.results.slice(0,8):[];
        searches.push({query,count:results.length,failure:result?.failure?.code??null});
        for(const row of results)add(row?.url,'SEARCH');
    }
    while(queue.length&&pages.length<limit.reads){
        const candidate=queue.shift();let page;
        try{page=await read({url:candidate.url,target});}catch{page={outcome:'UNRESOLVED',failure:{code:'READ_EXCEPTION'}};}
        page??={outcome:'UNRESOLVED',failure:{code:'EMPTY_READER_RESPONSE'}};
        const decision=evaluateProviderCandidate({service,candidate,page});
        pages.push({url:candidate.url,finalUrl:page.url??null,status:decision.status,reason:decision.reason??null,host:decision.host??null,relation:decision.relation??null,source:decision.source??null,diagnostics:decision.diagnostics});
        if(page.outcome==='OK'&&typeof page.rawSource?.text==='string'&&page.sourceIntegrity?.sha256===sha(page.rawSource.text)&&safeUrl(page.url)&&new URL(page.url).origin===new URL(candidate.url).origin){
            const base=page.url??candidate.url;
            for(const link of sourceLinks(page.rawSource.text,{maxBytes:limit.bytesPerPage,maxLinks:limit.linksPerPage,maxJsonNodes:300}).links){
                let url;try{url=new URL(link.url,base).href;}catch{continue;}
                if(primary(link.label,service)||link.mechanism==='PROVIDER_CANONICAL_OR_LOCALE')add(url,'SOURCE_LINK');
            }
        }
    }
    const bound=pages.filter(p=>p.status==='PROVIDER_BOUND'),hosts=[...new Set(bound.map(p=>p.host))];
    if(hosts.length!==1)return {status:'UNRESOLVED_PROVIDER_IDENTITY',reason:hosts.length?'COMPETING_PROVIDER_HOSTS':'NO_CLEAR_PROVIDER_IDENTITY',service:target.service,serviceName:target.serviceName,market,searches,candidates:pages};
    const selected=bound.find(p=>p.host===hosts[0]);
    return {status:'PROVIDER_BOUND',service:target.service,serviceName:target.serviceName,market,host:selected.host,entryUrl:selected.finalUrl,relation:selected.relation,providerName:selected.source.siteIdentity,source:selected.source,scope:'EXACT_HOST_IDENTITY_ONLY_NOT_MARKET',searches,candidates:pages};
}

export function researchInputFromBinding(binding,{permissions={DIRECT:true,TAVILY:true},bounds,semantic={mode:'LIVE'},planning}={}) {
    if(binding?.status!=='PROVIDER_BOUND'||!binding.host||!binding.service||!binding.market||binding.scope!=='EXACT_HOST_IDENTITY_ONLY_NOT_MARKET'||!safeUrl(binding.entryUrl)||new URL(binding.entryUrl).hostname!==binding.host||binding.source?.url!==binding.entryUrl||!/^[a-f0-9]{64}$/.test(binding.source?.sha256??''))throw Error('PROVIDER_BINDING_REQUIRED');
    return {objective:{kind:'PRICE',serviceId:binding.service,serviceName:binding.serviceName,providerHosts:[binding.host],markets:[binding.market],seeds:[binding.entryUrl]},provider:{reviewed:true,serviceId:binding.service,hosts:[binding.host],basis:'AUTONOMOUS_PROVIDER_BOOTSTRAP',source:binding.source},permissions,semantic,...(bounds?{bounds}:{}),...(planning?{planning}:{})};
}

export async function createLiveBootstrap({env=process.env}={}) {
    const search=await createTavilySearch({readKeychain:async()=>env.TAVILY_API_KEY?.trim()||await readTavilyKeychain(),maxCalls:bootstrapBounds.searches});
    return {search,read:async({url,target})=>{
        const origin=new URL(url).origin;
        const adapter=createV2RobotsPublicAdapter({authorities:[],retainRaw:true,maxLinks:bootstrapBounds.linksPerPage,maxReads:1,maxRequests:bootstrapBounds.requestsPerRead,network:{authorityOrigins:[origin],timeoutMs:15000,maxBytes:bootstrapBounds.bytesPerPage,maxRedirects:1,pricingResources:false}});
        return adapter.read({url,targetCountry:target.market,maxRedirects:1});
    }};
}
