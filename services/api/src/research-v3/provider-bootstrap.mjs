// Bounded discovery of research locations. Search results grant no provider authority.
import {createTavilySearch,readTavilyKeychain} from '../research-v2/live/tavily-search.mjs';
import {normalizeFrontierUrl} from '../research-v2/live/source-frontier.mjs';
import {navigationParametersSafe} from './discovery-authority.mjs';
import {normalizeUrl} from './model.mjs';

export const bootstrapBounds=Object.freeze({searches:2,candidates:12});
const identity=value=>String(value).normalize('NFKC').replace(/\s+/gu,' ').trim().toLocaleLowerCase('en').replace(/\s+/gu,'-');
const displayQuery=value=>String(value).normalize('NFKC').replace(/[-‐‑‒–—_]+/gu,' ').replace(/\s+/gu,' ').trim();
const assets=/\.(?:png|jpe?g|gif|svg|webp|ico|woff2?|css|js|mp[34]|pdf|zip|exe)$/i;
const secretQuery=/^(?:access[_-]?token|token|password|secret|authorization|session[_-]?id|api[_-]?key|signature|auth[_-]?code)$/i;

function researchCandidate(value) {
    const normalized=normalizeFrontierUrl(value);
    if(!normalized.url)return {reason:normalized.reason??'INVALID_URL'};
    const url=normalizeUrl(normalized.url);
    if(!url||!navigationParametersSafe(url))return {reason:'UNSAFE_URL'};
    const parsed=new URL(url);
    if(assets.test(parsed.pathname))return {reason:'ASSET_DESTINATION'};
    if([...parsed.searchParams.keys()].some(key=>secretQuery.test(key)))return {reason:'SECRET_QUERY_REJECTED'};
    return {url,host:parsed.hostname};
}

export async function discoverCandidateHosts({service,market,search,bounds={}}) {
    if(typeof service!=='string'||!service.trim()||service.length>120||typeof market!=='string'||!/^[A-Z]{2}$/.test(market))throw Error('INVALID_BOOTSTRAP_TARGET');
    if(typeof search!=='function')throw Error('BOOTSTRAP_CAPABILITY_REQUIRED');
    const limit={...bootstrapBounds,...bounds};
    for(const [key,value] of Object.entries(limit))if(!(key in bootstrapBounds)||!Number.isSafeInteger(value)||value<1||value>bootstrapBounds[key])throw Error('INVALID_BOOTSTRAP_BOUND');
    const target={service:identity(service),serviceName:service.trim(),market};
    const name=displayQuery(service);
    const queries=[`${name} official site`,`${name} ${market} official subscription`].slice(0,limit.searches);
    const searches=[],candidates=[],rejected=[],hosts=new Set();
    let limitReached=false;
    for(const [searchIndex,query] of queries.entries()) {
        let response;
        try{response=await search({query,target});}catch{response={results:[],failure:{code:'SEARCH_UNAVAILABLE'}};}
        const results=Array.isArray(response?.results)?response.results.slice(0,8):[];
        searches.push({query,count:results.length,failure:response?.failure?.code??null});
        for(const [resultIndex,row] of results.entries()) {
            const candidate=researchCandidate(row?.url);
            if(!candidate.url){rejected.push({searchIndex,resultIndex,reason:candidate.reason});continue;}
            if(hosts.has(candidate.host))continue;
            if(candidates.length>=limit.candidates){limitReached=true;continue;}
            hosts.add(candidate.host);
            candidates.push({url:candidate.url,host:candidate.host,searchIndex,resultIndex,truthAuthority:'NONE'});
        }
    }
    const common={service:target.service,serviceName:target.serviceName,market,searches,candidates,rejected,bounds:limit,limitReached};
    if(!candidates.length)return {status:'UNRESOLVED_CANDIDATE_DISCOVERY',reason:'NO_USABLE_CANDIDATE_HOSTS',...common,candidateHosts:[],seeds:[]};
    return {status:'CANDIDATE_HOSTS_FOUND',...common,candidateHosts:candidates.map(c=>c.host),seeds:candidates.map(c=>c.url)};
}

export function researchInputFromCandidates(discovery,{permissions={DIRECT:true,TAVILY:true},bounds,semantic={mode:'LIVE'},planning}={}) {
    if(discovery?.status!=='CANDIDATE_HOSTS_FOUND'||!discovery.service||!discovery.serviceName||!/^[A-Z]{2}$/.test(discovery.market??'')||!Array.isArray(discovery.candidateHosts)||!discovery.candidateHosts.length||discovery.candidateHosts.length>bootstrapBounds.candidates||!Array.isArray(discovery.seeds)||discovery.seeds.length!==discovery.candidateHosts.length||discovery.seeds.some((url,index)=>researchCandidate(url).host!==discovery.candidateHosts[index]))throw Error('CANDIDATE_DISCOVERY_REQUIRED');
    return {objective:{kind:'PRICE',serviceId:discovery.service,serviceName:discovery.serviceName,providerHosts:[],candidateHosts:[...discovery.candidateHosts],markets:[discovery.market],seeds:[...discovery.seeds]},permissions,semantic,...(bounds?{bounds}:{}),...(planning?{planning}:{})};
}

export async function createLiveBootstrap({env=process.env}={}) {
    const search=await createTavilySearch({readKeychain:async()=>env.TAVILY_API_KEY?.trim()||await readTavilyKeychain(),maxCalls:bootstrapBounds.searches});
    return {search};
}
