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
const plain=s=>decodeEntities(String(s??'').replace(/<[^>]*>/g,' ')).replace(/\s+/gu,' ').trim();
const types=v=>(Array.isArray(v)?v:[v]).filter(x=>typeof x==='string').map(x=>x.split('/').at(-1));
const name=v=>typeof v==='string'?v:typeof v?.name==='string'?v.name:null;
const same=(a,b)=>!!a&&!!b&&identity(a)===identity(b);
const primary=(value,service)=>same(value,service)||String(value??'').split(/\s+[|—–]\s+|\s+:\s+/u).some((part,i)=>i===0&&same(part,service));
const safeUrl=value=>normalizeFrontierUrl(value).url;
const sameOrigin=(value,base)=>{try{const url=safeUrl(new URL(value,base).href);return !!url&&new URL(url).origin===new URL(base).origin;}catch{return false;}};

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
    const requested=safeUrl(candidate?.url),final=safeUrl(page?.url),body=page?.rawSource?.text;
    if(!requested||!final||new URL(requested).origin!==new URL(final).origin||page.outcome!=='OK'||page.httpStatus!==200||typeof body!=='string'||Buffer.byteLength(body)>bootstrapBounds.bytesPerPage||!/^text\/html\b/i.test(page.contentType??page.rawSource?.contentType??'')||page.sourceIntegrity?.sha256!==sha(body))return {status:'CANDIDATE',reason:'NO_INTACT_SAME_ORIGIN_PAGE'};
    const extracted=extractPage(body,final,{maxText:5000,maxLinks:0});
    const headings=[...body.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1\s*>/gi)].slice(0,8).map(m=>plain(m[1]));
    const prominent=primary(extracted.title,service)||headings.some(h=>same(h,service));
    const nodes=structuredIdentities(body),siteNames=[extracted.metadata['og:site_name'],...nodes.filter(n=>types(n['@type']).some(t=>['WebSite','Organization'].includes(t))).map(n=>name(n))].filter(Boolean);
    const distinct=[...new Set(siteNames.map(identity))];
    const canonical=sourceLinks(body,{maxBytes:bootstrapBounds.bytesPerPage,maxLinks:bootstrapBounds.linksPerPage,maxJsonNodes:300}).links.filter(l=>l.mechanism==='PROVIDER_CANONICAL_OR_LOCALE'&&/canonical/i.test(l.label));
    const foreignCanonical=canonical.some(l=>{try{const u=safeUrl(new URL(l.url,final).href);return u&&new URL(u).origin!==new URL(final).origin;}catch{return false;}});
    const listing=nodes.some(n=>types(n['@type']).some(t=>['Review','AggregateRating','ItemList','CollectionPage','SearchResultsPage'].includes(t)));
    if(!prominent||!siteNames.length||distinct.length!==1||foreignCanonical||listing)return {status:'CANDIDATE',reason:!prominent?'SERVICE_NOT_PRIMARY':!siteNames.length?'SITE_IDENTITY_MISSING':distinct.length!==1?'COMPETING_SITE_IDENTITIES':foreignCanonical?'FOREIGN_CANONICAL':'THIRD_PARTY_PAGE'};
    const siteName=siteNames[0];
    let relation=null;
    if(same(siteName,service))relation='DIRECT_SERVICE_SITE';
    else if(nodes.some(n=>types(n['@type']).some(t=>['Product','Service','SoftwareApplication'].includes(t))&&same(name(n),service)&&[n.provider,n.brand,n.publisher,n.manufacturer].some(p=>same(name(p),siteName))&&(!n.url||sameOrigin(n.url,final))))relation='EXPLICIT_PRODUCT_PROVIDER';
    if(!relation)return {status:'CANDIDATE',reason:'PROVIDER_PRODUCT_RELATIONSHIP_UNRESOLVED'};
    return {status:'PROVIDER_BOUND',host:new URL(final).hostname,entryUrl:final,relation,providerName:siteName,source:{url:final,sha256:sha(body),siteIdentity:siteName,serviceIdentity:service,primaryTitle:extracted.title,primaryHeadings:headings.filter(h=>same(h,service)).slice(0,2)}};
}

export async function bootstrapProvider({service,market,search,read,bounds={}}) {
    if(typeof service!=='string'||!service.trim()||service.length>120||typeof market!=='string'||!/^[A-Z]{2}$/.test(market))throw Error('INVALID_BOOTSTRAP_TARGET');
    if(typeof search!=='function'||typeof read!=='function')throw Error('BOOTSTRAP_CAPABILITY_REQUIRED');
    const limit={...bootstrapBounds,...bounds};
    for(const [key,value]of Object.entries(limit))if(!(key in bootstrapBounds)||!Number.isSafeInteger(value)||value<1||value>bootstrapBounds[key])throw Error('INVALID_BOOTSTRAP_BOUND');
    const target={service:identity(service).replace(/\s+/g,'-'),serviceName:service.trim(),market};
    const queries=[`${service} official site`,`${service} ${market} official subscription`].slice(0,limit.searches);
    const queue=[],seen=new Set(),pages=[],searches=[];
    const add=(url,from)=>{const normalized=safeUrl(url);if(!normalized||seen.has(normalized)||seen.size>=limit.candidates)return;seen.add(normalized);queue.push({url:normalized,from});};
    for(const query of queries){let result;try{result=await search({query,target});}catch{result={results:[],failure:{code:'SEARCH_UNAVAILABLE'}};}
        const results=Array.isArray(result?.results)?result.results.slice(0,8):[];
        searches.push({query,count:results.length,failure:result?.failure?.code??null});
        for(const row of results)add(row?.url,'SEARCH');
    }
    while(queue.length&&pages.length<limit.reads){
        const candidate=queue.shift();let page;
        try{page=await read({url:candidate.url,target});}catch{page={outcome:'UNRESOLVED'};}
        const decision=evaluateProviderCandidate({service,candidate,page});
        pages.push({url:candidate.url,finalUrl:page.url??null,status:decision.status,reason:decision.reason??null,host:decision.host??null,relation:decision.relation??null,source:decision.source??null});
        if(page.outcome==='OK'&&typeof page.rawSource?.text==='string'&&page.sourceIntegrity?.sha256===sha(page.rawSource.text)&&safeUrl(page.url)&&new URL(page.url).origin===new URL(candidate.url).origin){
            const base=page.url??candidate.url;
            for(const link of sourceLinks(page.rawSource.text,{maxBytes:limit.bytesPerPage,maxLinks:limit.linksPerPage,maxJsonNodes:300}).links){
                let url;try{url=new URL(link.url,base).href;}catch{continue;}
                if(same(link.label,service)||link.mechanism==='PROVIDER_CANONICAL_OR_LOCALE')add(url,'SOURCE_LINK');
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
