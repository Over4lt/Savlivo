// Bounded discovery of research locations. Search results grant no provider authority.
import {createTavilySearch,readTavilyKeychain} from '../research-v2/live/tavily-search.mjs';
import {normalizeFrontierUrl} from '../research-v2/live/source-frontier.mjs';
import {navigationParametersSafe} from './discovery-authority.mjs';
import {digest,normalizeUrl} from './model.mjs';
import {createResearchTarget,researchTargetKinds,serviceDiscoveryObjective,serviceObjectiveForResearchTarget} from './research-target.mjs';
import {reviewProviderSeedAuthority,reviewProviderSeedAuthorityWithDiagnostic} from './provider-authority-review.mjs';

export const bootstrapBounds=Object.freeze({searches:2,candidates:12});
const identity=value=>String(value).normalize('NFKC').replace(/\s+/gu,' ').trim().toLocaleLowerCase('en').replace(/\s+/gu,'-');
const displayQuery=value=>String(value).normalize('NFKC').replace(/[-‐‑‒–—_]+/gu,' ').replace(/\s+/gu,' ').trim();
const assets=/\.(?:png|jpe?g|gif|svg|webp|ico|woff2?|css|js|mp[34]|pdf|zip|exe)$/i;
const secretQuery=/^(?:access[_-]?token|token|password|secret|authorization|session[_-]?id|api[_-]?key|signature|auth[_-]?code)$/i;
const discoveryText=value=>String(value??'').normalize('NFKC').replace(/\s+/gu,' ').trim().slice(0,500);
const objectiveIntents=Object.freeze([
    Object.freeze({kind:'CANCELLATION',objectives:Object.freeze(['CANCELLATION']),terms:Object.freeze(['cancel','subscription','membership']),signals:Object.freeze(['cancel','cancellation','subscription','membership'])}),
    Object.freeze({kind:'SUBSCRIPTION_MANAGEMENT',objectives:Object.freeze(['MEMBERSHIP_MANAGEMENT_EXISTS','WEB_MANAGEMENT']),terms:Object.freeze(['manage','subscription','billing','membership']),signals:Object.freeze(['manage','management','subscription','billing','membership'])}),
    Object.freeze({kind:'ACCOUNT_LOGIN',objectives:Object.freeze(['ACCOUNT_LOGIN_EXISTS','LOGIN']),terms:Object.freeze(['login','account']),signals:Object.freeze(['login','account','sign in'])}),
    Object.freeze({kind:'SUBSCRIPTION_PRICE',objectives:Object.freeze([serviceDiscoveryObjective,'PRICE','PRICE_AMOUNT','MONTHLY_SUBSCRIPTION','CONSUMER_MONTHLY_SUBSCRIPTION_EXISTS']),terms:Object.freeze(['subscription','plans','membership','pricing']),signals:Object.freeze(['subscription','plans','membership','pricing','offers'])})
]);

const normalizedObjectives=values=>[...new Set((Array.isArray(values)?values:[values]).filter(value=>typeof value==='string').map(value=>value.trim().toUpperCase()).filter(Boolean))];
const objectiveIntent=values=>{const objectives=normalizedObjectives(values);return objectiveIntents.find(intent=>intent.objectives.some(value=>objectives.includes(value)))??objectiveIntents.at(-1);};
const marketName=market=>{try{return new Intl.DisplayNames(['en'],{type:'region'}).of(market)??market;}catch{return market;}};
const objectiveWords=value=>displayQuery(value).toLocaleLowerCase('en').match(/[\p{L}\p{N}]{3,}/gu)??[];

export function providerResourceDiscoveryQuery({providerName,targetMarket,unresolvedObjectives=[serviceDiscoveryObjective]}) {
    if(typeof providerName!=='string'||!providerName.trim()||providerName.length>120||typeof targetMarket!=='string'||!/^[A-Z]{2}$/.test(targetMarket))throw Error('INVALID_BOOTSTRAP_TARGET');
    const intent=objectiveIntent(unresolvedObjectives);
    return {kind:intent.kind,objectives:normalizedObjectives(unresolvedObjectives),query:[displayQuery(providerName),...intent.terms,marketName(targetMarket)].join(' ')};
}

function objectiveRelevance(row,{seedName,intent}) {
    const url=researchCandidate(row?.url).url,context=discoveryText([row?.title,row?.content,row?.snippet].filter(Boolean).join(' ')),path=url?displayQuery(new URL(url).pathname):'',text=(context+' '+path).toLocaleLowerCase('en'),provider=objectiveWords(seedName),terms=intent.signals.filter(term=>text.includes(term));
    const providerMatches=provider.filter(term=>text.includes(term)).length;
    return terms.length?Math.min(20,terms.length*4+(providerMatches?Math.min(4,providerMatches*2):0)):0;
}

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

async function discoverSeedCandidates({seedName,targetMarket,search,bounds={},searchTarget,identityFields,queries=null,unresolvedObjectives=[serviceDiscoveryObjective]}) {
    if(typeof seedName!=='string'||!seedName.trim()||seedName.length>120||typeof targetMarket!=='string'||!/^[A-Z]{2}$/.test(targetMarket))throw Error('INVALID_BOOTSTRAP_TARGET');
    if(typeof search!=='function')throw Error('BOOTSTRAP_CAPABILITY_REQUIRED');
    const limit={...bootstrapBounds,...bounds};
    for(const [key,value] of Object.entries(limit))if(!(key in bootstrapBounds)||!Number.isSafeInteger(value)||value<1||value>bootstrapBounds[key])throw Error('INVALID_BOOTSTRAP_BOUND');
    const name=displayQuery(seedName),intent=objectiveIntent(unresolvedObjectives);
    const plannedQueries=(queries??[{kind:'GENERIC_PROVIDER',query:`${name} official site`},{kind:'GENERIC_SUBSCRIPTION',query:`${name} ${targetMarket} official subscription`}]).slice(0,limit.searches);
    const searches=[],candidates=[],rejected=[];
    let limitReached=false;
    for(const [searchIndex,planned] of plannedQueries.entries()) {
        const query=planned.query;
        let response;
        try{response=await search({query,target:searchTarget});}catch{response={results:[],failure:{code:'SEARCH_UNAVAILABLE'}};}
        const results=Array.isArray(response?.results)?response.results.slice(0,8):[];
        searches.push({kind:planned.kind,query,count:results.length,failure:response?.failure?.code??null});
        for(const [resultIndex,row] of results.entries()) {
            const candidate=researchCandidate(row?.url);
            if(!candidate.url){rejected.push({searchIndex,resultIndex,reason:candidate.reason});continue;}
            const relevance=objectiveRelevance(row,{seedName,intent}),discoveryContext={title:discoveryText(row?.title),context:discoveryText(row?.content??row?.snippet),discoveryOnly:true};
            const record={candidateId:'provider-seed-search:'+digest([planned.kind,searchIndex,resultIndex,candidate.url]),url:candidate.url,host:candidate.host,searchIndex,resultIndex,searchRank:Number.isSafeInteger(row?.rank)?row.rank:resultIndex,insertionOrder:candidates.length,originKind:planned.kind==='OBJECTIVE_RESOURCE'?'OBJECTIVE_SEARCH':'SEARCH',truthAuthority:'NONE',providerAuthority:'NONE',objectiveIntent:intent.kind,objectiveRelevance:relevance,score:relevance,discoveryContext},prior=candidates.findIndex(value=>value.host===candidate.host);
            if(prior>=0){if(planned.kind==='OBJECTIVE_RESOURCE'&&relevance>candidates[prior].objectiveRelevance)candidates[prior]={...record,insertionOrder:candidates[prior].insertionOrder};continue;}
            if(candidates.length>=limit.candidates){limitReached=true;continue;}
            candidates.push(record);
        }
    }
    const common={...identityFields,searches,candidates,rejected,bounds:limit,limitReached};
    if(!candidates.length)return {status:'UNRESOLVED_CANDIDATE_DISCOVERY',reason:'NO_USABLE_CANDIDATE_HOSTS',...common,candidateHosts:[],seeds:[]};
    return {status:'CANDIDATE_HOSTS_FOUND',...common,candidateHosts:candidates.map(c=>c.host),seeds:candidates.map(c=>c.url)};
}

export async function discoverCandidateHosts({service,market,search,bounds={}}) {
    const target={service:identity(service),serviceName:service?.trim(),market};
    return discoverSeedCandidates({seedName:service,targetMarket:market,search,bounds,searchTarget:target,identityFields:target});
}

export async function discoverResearchTargetCandidates({researchTarget,search,bounds={}}) {
    const target=createResearchTarget(researchTarget);
    return discoverSeedCandidates({seedName:target.seedName,targetMarket:target.targetMarket,search,bounds,searchTarget:target,identityFields:{researchTarget:structuredClone(target)}});
}

export async function discoverProviderResourceCandidates({researchTarget,unresolvedObjectives=[serviceDiscoveryObjective],search,bounds={}}) {
    const target=createResearchTarget(researchTarget),intent=providerResourceDiscoveryQuery({providerName:target.seedName,targetMarket:target.targetMarket,unresolvedObjectives});
    return discoverSeedCandidates({seedName:target.seedName,targetMarket:target.targetMarket,search,bounds,searchTarget:target,identityFields:{researchTarget:structuredClone(target)},queries:[{kind:'OBJECTIVE_RESOURCE',query:intent.query}],unresolvedObjectives});
}

export function reviewProviderSeedCandidate(discovery,observation){
    if(discovery?.status!=='CANDIDATE_HOSTS_FOUND'||!discovery.researchTarget||!Array.isArray(discovery.candidateHosts)||!discovery.candidateHosts.length)throw Error('CANDIDATE_DISCOVERY_REQUIRED');
    const target=createResearchTarget(discovery.researchTarget);
    if(target.targetKind!==researchTargetKinds.PROVIDER_OR_BRAND_SEED)throw Error('PROVIDER_SEED_TARGET_REQUIRED');
    return reviewProviderSeedAuthority(observation,target,{candidateHosts:discovery.candidateHosts});
}

export function reviewProviderSeedCandidateWithDiagnostic(discovery,observation){
    if(discovery?.status!=='CANDIDATE_HOSTS_FOUND'||!discovery.researchTarget||!Array.isArray(discovery.candidateHosts)||!discovery.candidateHosts.length)throw Error('CANDIDATE_DISCOVERY_REQUIRED');
    const target=createResearchTarget(discovery.researchTarget);
    if(target.targetKind!==researchTargetKinds.PROVIDER_OR_BRAND_SEED)throw Error('PROVIDER_SEED_TARGET_REQUIRED');
    return reviewProviderSeedAuthorityWithDiagnostic(observation,target,{candidateHosts:discovery.candidateHosts});
}

export function researchInputFromCandidates(discovery,{permissions={DIRECT:true,TAVILY:true},bounds,semantic={mode:'LIVE'},planning}={}) {
    if(discovery?.researchTarget){
        const target=createResearchTarget(discovery.researchTarget);
        if(target.targetKind===researchTargetKinds.PROVIDER_OR_BRAND_SEED)throw Error('SUBSCRIPTION_SERVICE_DISCOVERY_REQUIRED');
        if(discovery?.status!=='CANDIDATE_HOSTS_FOUND'||!/^[A-Z]{2}$/.test(target.targetMarket)||!Array.isArray(discovery.candidateHosts)||!discovery.candidateHosts.length||discovery.candidateHosts.length>bootstrapBounds.candidates||!Array.isArray(discovery.seeds)||discovery.seeds.length!==discovery.candidateHosts.length||discovery.seeds.some((url,index)=>researchCandidate(url).host!==discovery.candidateHosts[index]))throw Error('CANDIDATE_DISCOVERY_REQUIRED');
        return {objective:serviceObjectiveForResearchTarget(target,{candidateHosts:discovery.candidateHosts,seeds:discovery.seeds}),permissions,semantic,...(bounds?{bounds}:{}),...(planning?{planning}:{})};
    }
    if(discovery?.status!=='CANDIDATE_HOSTS_FOUND'||!discovery.service||!discovery.serviceName||!/^[A-Z]{2}$/.test(discovery.market??'')||!Array.isArray(discovery.candidateHosts)||!discovery.candidateHosts.length||discovery.candidateHosts.length>bootstrapBounds.candidates||!Array.isArray(discovery.seeds)||discovery.seeds.length!==discovery.candidateHosts.length||discovery.seeds.some((url,index)=>researchCandidate(url).host!==discovery.candidateHosts[index]))throw Error('CANDIDATE_DISCOVERY_REQUIRED');
    return {objective:{kind:'PRICE',serviceId:discovery.service,serviceName:discovery.serviceName,providerHosts:[],candidateHosts:[...discovery.candidateHosts],markets:[discovery.market],seeds:[...discovery.seeds]},permissions,semantic,...(bounds?{bounds}:{}),...(planning?{planning}:{})};
}

export async function createLiveBootstrap({env=process.env}={}) {
    const search=await createTavilySearch({readKeychain:async()=>env.TAVILY_API_KEY?.trim()||await readTavilyKeychain(),maxCalls:bootstrapBounds.searches});
    return {search};
}
