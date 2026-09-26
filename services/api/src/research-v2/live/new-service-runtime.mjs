import {evaluateServiceAdmission} from '../intelligence/service-admission.mjs';
import {observeAdmissionSource} from '../intelligence/service-admission-source.mjs';
// Binds the cohort controller to real V2 transports and existing deterministic interpreters.
// No network at import. No fixture/cache fallback. No authentication or form submission.
import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {countryCurrencyData} from '../../../../../packages/contracts/src/markets.ts';
import {createTavilySearch,readTavilyKeychain} from './tavily-search.mjs';
import {createV2RobotsPublicAdapter} from './robots-policy.mjs';
import {normalizePublicUrl} from '../../research-v1/public-network.mjs';
import {extractPage} from '../../research-v1/public-web-adapter.mjs';
import {extractClaimProposals,verifyClaim} from '../../research-v1/claim-verification.mjs';
import {loadProviderSourceRegistry} from './provider-source-registry.mjs';
import {inspectLoginManage,eligibilityState} from '../intelligence/login-manage.mjs';
import {catalogProductPolicy} from '../intelligence/catalog-capabilities.mjs';
import {recognizeConfigurator} from '../intelligence/configurator.mjs';
import {loginEntries} from '../intelligence/login-entry-intent.mjs';
import {priceEntries} from '../intelligence/price-entry-intent.mjs';
import {capabilityDestination} from '../intelligence/login-manage.mjs';
import {interpretDirectProvider} from './direct-provider-evidence.mjs';
import {acquisitionEscalation} from './provider-access-gap.mjs';
import {sourceLinks} from './source-frontier-links.mjs';
import {digest,json,bounds} from '../inventory/new-service-controller.mjs';
import {atomic} from '../inventory/expansion-campaign.mjs';
export const markets=countryCurrencyData.map(([code])=>code);
export async function runtimeCredentials(env=process.env) {
 const key=env.TAVILY_API_KEY?.trim()||await readTavilyKeychain();
 return {key:key||null,available:!!key,source:env.TAVILY_API_KEY?.trim()?'TAVILY_API_KEY':'macOS Keychain com.savlivo.research-v2.tavily / TAVILY_API_KEY'};
}
export function safeGet(value) {
 try{const u=normalizePublicUrl(value);if(u.protocol!=='https:')return null;
  const text=decodeURIComponent(u.pathname+' '+u.search);
  if(/(?:logout|signout|delete|remove-account|unsubscribe|checkout|purchase|oauth|authorize|callback|password|reset|token|session|credential|[?&](?:action|do)=)/i.test(text)||/\.(?:pdf|zip|exe|js|css|png|jpg|mp4)$/i.test(u.pathname))return null;
  // Preserve existing read-only authentication destination restrictions, including unreviewed reads.
  if(/(?:^|\/)(?:login|signin|servicelogin)(?:\/|$)/i.test(u.pathname))return null;
  return u.href;
 }catch{return null;}
}
const suffix={IDENTITY_SUBSCRIPTION:'official website consumer subscription membership about',MARKETS:'official subscription availability supported countries regions',LOGIN:'official personal account sign in customer help',MANAGEMENT:'official manage subscription membership cancel billing Apple Google Play instructions',PRICING:'official recurring subscription membership plans pricing'};
const readLimits={IDENTITY_SUBSCRIPTION:2,MARKETS:1,LOGIN:1,MANAGEMENT:2,PRICING:2};
export function finalState(prior,{service='',evidence=[],admissionOptions={}}={}) {
 const serviceAdmission=evaluateServiceAdmission(service,evidence,{prior:Object.values(prior).map(p=>p?.serviceAdmission),...admissionOptions});
 const login=prior.LOGIN?.established===true,management=prior.MANAGEMENT?.established===true;
 const identity=prior.IDENTITY_SUBSCRIPTION?.established===true;
 const complete=serviceAdmission.status==='ESTABLISHED'&&identity&&login&&management&&prior.MARKETS?.established===true&&prior.CANCELLATION?.established===true;
 return {serviceAdmission,productionEligible:serviceAdmission.status==='ESTABLISHED',status:'COMPLETE',established:complete,researchComplete:complete,identity:identity?'ESTABLISHED':'REVIEW_REQUIRED',subscriptionQualification:serviceAdmission.dimensions.monthlyRecurring.status,
  login:login?'ESTABLISHED':'UNRESOLVED',management:management?'ESTABLISHED':'UNRESOLVED',cancellation:prior.CANCELLATION?.status??'UNRESOLVED',
  marketApplicability:prior.MARKETS?.established===true?'ESTABLISHED':'UNRESOLVED',pricing:prior.PRICING?.established===true?'ESTABLISHED':'UNRESOLVED',
  // There is no reviewed all-channel cancellation verifier in V2. Execution never manufactures readiness.
  v2Readiness:complete?'EVIDENCE_READY_FOR_REVIEW':'REVIEW_REQUIRED',catalogEligibility:serviceAdmission.status==='ESTABLISHED'?'EVIDENCE_READY_FOR_REVIEW':'UNRESOLVED',
  priceStrategy:prior.PRICING?.priceStrategy??'MANUAL_ONLY',priceRequiredForEligibility:false,userPriceAuthoritative:true,nationalDefaultFromScopedPrice:false,productionPromoted:false};
}
export async function createNewServiceRuntime({key,candidates,dependencies={}}) {
 if(!key)throw Error('TAVILY_CREDENTIAL_REQUIRED');
 const registry=dependencies.registry??loadProviderSourceRegistry({targets:candidates.map(c=>({id:c.slug,service:c.slug,serviceName:c.name,market:null,authorities:[],urls:[]})),inventoryReference:{kind:'NEW_SERVICE_COHORT'}});
 const searches=new Map();
 const reviewed=c=>registry.domains.filter(d=>d.service===c.slug&&d.validated).map(d=>({hostname:d.hostname,provider:c.name,sourceType:d.role??'OFFICIAL_PROVIDER',sourceUrl:d.reference.authoritySourceUrl??registry.leads.find(l=>l.service===c.slug&&new URL(l.url).hostname===d.hostname)?.url,checkedAt:new Date().toISOString(),ownershipReference:d.reference})).filter(a=>a.sourceUrl);
 return {async stage({stage,candidate:c,directory,prior,operations}) {
  c={category:'other',markets:[],references:[],researchInput:{},...c};
  const authorities=reviewed(c),target={id:c.slug,service:c.slug,serviceName:c.name,category:c.category,market:null,authorities,urls:[],researchObjective:'CATALOG_ONLY',smartResearch:{version:2,navigationDepth:3},gaps:['LOGIN','WEB_MANAGEMENT']};
  const pagesFile=directory+'/pages.json';let pages=fs.existsSync(pagesFile)?json(pagesFile):[];
  if(stage==='VALIDATION'){
   for(const page of pages.filter(p=>p.outcome==='OK'&&p.bodyFile)){try{const source=fs.readFileSync(directory+'/'+page.bodyFile,'utf8');observeAdmissionSource(target,page,source,{path:directory+'/'+page.bodyFile,hash:page.bodyHash});}catch{/* Missing current bytes are not a contradiction of prior typed proof. */}}
   const failures=pages.filter(p=>p.outcome!=='OK').map(p=>({url:p.requestedUrl,outcome:p.outcome,code:p.failure?.code??'ACQUISITION_UNRESOLVED',httpStatus:p.httpStatus??null,escalation:p.escalation??null}));
   const searchFailures=Object.keys(suffix).flatMap(s=>{const f=directory+'/'+s+'-candidate-trace.json';return fs.existsSync(f)&&json(f).searchFailure?[{stage:s,...json(f).searchFailure}]:[];});
   return {...finalState(prior,{service:c.slug,evidence:target.serviceAdmissionEvidence??[],admissionOptions:{authorities}}),researchFailures:{acquisition:failures,search:searchFailures},researchFailed:!pages.some(p=>p.outcome==='OK')&&(failures.length>0||searchFailures.length>0)};
  }
  const body=p=>{const value=fs.readFileSync(directory+'/'+p.bodyFile,'utf8');if(digest(value)!==p.bodyHash)throw Error('BODY_HASH_MISMATCH');return value;};
  if(stage!=='CANCELLATION') {
   const query=[c.name,suffix[stage]].join(' ');
   const found=await operations.execute(c.slug,'SEARCH',query,async()=>{
    let search=searches.get(c.slug);if(!search){search=await (dependencies.createSearch??createTavilySearch)({readKeychain:async()=>key,maxCalls:5});searches.set(c.slug,search);}
    operations.charge(c.slug,'DISCOVERY',{stage});return search({query,target});
   });
   const leads=[];
   // Previously acquired provider content contributes navigation hypotheses, never authority grants.
   for(const p of pages.filter(p=>p.bodyFile&&p.outcome==='OK')) {
    const html=body(p);let links;
    if(stage==='PRICING')links=priceEntries(html,{base:p.url,authorities}).candidates;
    else if(stage==='LOGIN')links=loginEntries(html,{base:p.url,serviceName:c.name,authorities}).candidates;
    else links=sourceLinks(html).links.filter(l=>{try{return capabilityDestination(new URL(l.url,p.url).href,l.label).value>=8;}catch{return false;}});
    for(const l of links){try{leads.push({...l,url:new URL(l.url,p.url).href,origin:'ACQUIRED_PAGE_LINK',parent:p.url});}catch{/* Malformed navigation does not abort a service. */}}
   }
   if(stage==='IDENTITY_SUBSCRIPTION')leads.push(...c.references.filter(r=>r.reference).map(r=>({url:r.reference,origin:'INPUT_LEAD_NOT_EVIDENCE'})),...registry.leads.filter(l=>l.service===c.slug));
   leads.push(...(found.results??[]).map(l=>({...l,origin:'SEARCH_DISCOVERY_ONLY'})));
   const unique=[...new Map(leads.map(l=>[safeGet(l.url),l]).filter(([url])=>url&&!pages.some(p=>p.requestedUrl===url))).entries()];
   atomic(directory+'/'+stage+'-candidate-trace.json',{stage,query,searchFailure:found.failure??null,candidates:unique.map(([url,l],rank)=>({url,rank,origin:l.origin??'REPOSITORY',parent:l.parent??null,authority:authorities.some(a=>a.hostname===new URL(url).hostname)?'REVIEWED':'UNREVIEWED',selected:rank<readLimits[stage]})),searchIsEvidence:false});
   for(const [url]of unique.slice(0,readLimits[stage])) {
    const result=await operations.execute(c.slug,'READ',url,async()=>{
     // Exact origin fence applies even to unreviewed discovery. No external redirect authority inheritance.
     const reader=(dependencies.createReader??createV2RobotsPublicAdapter)({authorities,retainRaw:true,maxLinks:80,maxReads:1,maxRequests:bounds.requestsPerRead,
       network:{authorityOrigins:[new URL(url).origin],timeoutMs:15000,maxBytes:bounds.maxBytes,maxRedirects:1}});
     const requestedMarket=prior.MARKETS?.confirmed?.[0]??c.markets[0]??null;
     const page=await reader.read({url,targetCountry:requestedMarket,maxRedirects:1,consumeNetwork:kind=>operations.charge(c.slug,kind,{stage,url})});
     const raw=page.rawSource?.text;delete page.rawSource;
     if(typeof raw==='string'){const h=digest(raw);fs.mkdirSync(directory+'/bodies',{recursive:true});fs.writeFileSync(directory+'/bodies/'+h+'.txt',raw);page.bodyFile='bodies/'+h+'.txt';page.bodyHash=h;}
     return {...page,requestedUrl:url,stage,escalation:acquisitionEscalation({page}),decodoExecuted:false};
    });
    if(!pages.some(p=>p.requestedUrl===url)){pages.push({...result,requestedUrl:url});atomic(pagesFile,pages);}
   }
  }
  const acquired=pages.filter(p=>p.bodyFile&&p.outcome==='OK'),trusted=acquired.filter(p=>p.authority?.status==='CONFIGURED_REVIEWED'&&authorities.some(a=>a.hostname===new URL(p.url).hostname&&a.provider===c.name));
  const assertions=acquired.map(p=>({url:p.url,bodyHash:p.bodyHash,authority:p.authority?.status??'UNKNOWN',observations:p.observations??[],discoveries:p.discoveries??[]}));
  const analyzeMarkets=async()=>{
   if(!fs.existsSync(pagesFile))atomic(pagesFile,[]);
   return operations.execute(c.slug,'LOCAL','market-analysis:'+digest(pages.map(p=>p.bodyHash??p.requestedUrl)),async()=>{
    if(dependencies.analyzeMarkets)return dependencies.analyzeMarkets({directory});
    await new Promise((resolve,reject)=>{const child=spawn(process.execPath,[new URL('./new-service-analysis-worker.mjs',import.meta.url).pathname,path.resolve(directory)],{env:{PATH:process.env.PATH??''},stdio:'ignore',timeout:120000});child.on('error',()=>reject(Error('MARKET_WORKER_FAILED')));child.on('exit',code=>code===0?resolve():reject(Error('MARKET_WORKER_FAILED')));});return json(directory+'/market-analysis.json');
   });
  };
  const confirmedMarkets=analysis=>[...new Set((Array.isArray(analysis)?analysis:[]).filter(r=>r.authorityEstablished).flatMap(r=>(r.result.records??[]).filter(f=>f.status==='ESTABLISHED').map(f=>f.country)).filter(m=>markets.includes(m)))];
  if(stage==='IDENTITY_SUBSCRIPTION')return {status:trusted.length?'PARTIAL':acquired.length?'REVIEW_REQUIRED':'UNRESOLVED',established:trusted.length>0,authorityBindings:authorities,sourceAssertions:assertions,reason:trusted.length?'REVIEWED_PROVIDER_IDENTITY':'PROVIDER_IDENTITY_REVIEW_REQUIRED',subscriptionQualification:'UNRESOLVED',consumerRelevance:'REVIEW_REQUIRED',familyMembers:c.researchInput.productFamilyMembers};
  if(stage==='MARKETS') {
   const analysis=await analyzeMarkets(),confirmed=confirmedMarkets(analysis);
   return {status:confirmed.length?'PARTIAL':'UNRESOLVED',established:confirmed.length>0,confirmed,analysis,markets:markets.map(m=>({market:m,status:confirmed.includes(m)?'ESTABLISHED':'UNRESOLVED'})),researchHints:c.markets,absenceIsNotUnsupported:true};
  }
  const proofs=trusted.map(p=>inspectLoginManage({body:body(p),sourceHash:p.bodyHash,url:p.url,service:c.slug,provider:c.name,market:null,authorityEstablished:true,reference:{path:directory+'/'+p.bodyFile,hash:p.bodyHash}}));
  if(stage==='LOGIN'||stage==='MANAGEMENT') {
   const field=stage==='LOGIN'?'login':'management',facts=proofs.flatMap(p=>p[field]);
   return {status:facts.length?'COMPLETE':'UNRESOLVED',established:facts.length>0,proofs,facts,eligibility:eligibilityState(c.slug,proofs),sourceAssertions:assertions,reason:facts.length?'PROVIDER_ORIGIN_FIELD_EVIDENCE':trusted.length?'FIELD_NOT_ESTABLISHED':'DESTINATION_AUTHORITY_UNRESOLVED'};
  }
  if(stage==='CANCELLATION') {
   const observations=trusted.flatMap(p=>(p.observations??[]).filter(o=>['cancelWeb','billingRoutes'].includes(o.fact)).map(o=>({...o,url:p.url,bodyHash:p.bodyHash})));
   const decisions=[];
   for(const p of trusted){if(!markets.includes(p.targetCountry))continue;
    const task={id:c.slug,canonicalSlug:c.slug,serviceName:c.name,countryCode:p.targetCountry};
    const marketName=new Intl.DisplayNames(['en'],{type:'region'}).of(p.targetCountry),at=new Date().toISOString();
    for(const observation of extractClaimProposals(task,p,marketName).filter(o=>['cancelWeb','billingRoutes'].includes(o.fact)))decisions.push({observation,verification:verifyClaim({task,page:p,observation,at,marketName,providerHosts:authorities.map(a=>a.hostname)})});
   }
   const facts=decisions.filter(d=>d.verification.accepted===true),established=facts.some(d=>d.observation.fact==='cancelWeb');
   return {status:established?'COMPLETE':observations.length?'REVIEW_REQUIRED':'UNRESOLVED',established,facts,decisions,observations,sourceAssertions:assertions,reason:established?'EXISTING_CANCELLATION_CLAIM_VERIFIED':'EXISTING_PUBLIC_EXTRACTION_REQUIRES_CHANNEL_AND_CANCELLATION_REVIEW',authenticatedActionsPerformed:false};
  }
  if(stage==='PRICING') {
   const analysis=await analyzeMarkets(),confirmed=confirmedMarkets(analysis);
   const scopes=[...new Set([...(prior.MARKETS?.confirmed??[]),...confirmed,...c.markets])].filter(m=>markets.includes(m));
   const results=[];
   for(const p of trusted)for(const market of scopes) {
    results.push(await operations.execute(c.slug,'LOCAL','price:'+p.bodyHash+':'+market,()=>(dependencies.interpretPrice??interpretDirectProvider)({target:{...target,id:c.slug+'|'+market,market,researchObjective:'SERVICE_COVERAGE'},page:p,directory})));
   }
   const verified=results.flatMap(r=>r.verified??[]);
   const journeys=trusted.map(p=>recognizeConfigurator({body:body(p),sourceHash:p.bodyHash,url:p.url,target}));
   const policy=catalogProductPolicy({slug:c.slug,disposition:'RESEARCH'},{confidence:verified.length?'HIGH':'NONE',variablePrice:journeys.some(j=>j.classification==='CONFIGURATOR')});
   return {status:verified.length?'PARTIAL':'UNRESOLVED',established:verified.length>0,verified,results,confirmed,marketAnalysis:analysis,journeys,priceStrategy:policy.priceStrategy,investigatedMarketHints:scopes,sourceAssertions:assertions,
    reason:!trusted.length?'PROVIDER_AUTHORITY_UNRESOLVED':!scopes.length?'MARKET_APPLICABILITY_UNRESOLVED':'EXISTING_PRICE_VERIFIER_RESULT',priceRequiredForCatalogEligibility:false,userPriceAuthoritative:true,automaticUserPriceReplacement:false};
  }
  throw Error('UNSUPPORTED_STAGE');
 }};
}
