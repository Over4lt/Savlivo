import fs from 'node:fs';import path from 'node:path';
import {DiscoveryJournal,discoveryLimits,discoveryActivation,discoverTarget,sha,mergeSources,officialCandidate} from './online-discovery.mjs';
import {loadProviderSourceRegistry} from './provider-source-registry.mjs';
import {createV2RobotsPublicAdapter} from './robots-policy.mjs';
import {createGeoEscalation} from '../../../../../docs/catalog/global-47/research-v1/geo-escalation.mjs';
import {iterateMarketRunRecords} from '../../research-v1/market-run-store.mjs';
import {verifyRetainedRun} from './module-stage.mjs';
import {evaluateVerifiedCountryRun} from './provider-source-v3.mjs';
import {conditionalCommercialRenderingRequired} from './rendering-diagnosis.mjs';
import {classifyAcquiredSource} from './source-classification.mjs';
import {installRunScopedV3ProviderAuthority} from './provider-routing-authority.mjs';
import {interpretRun} from './runner.mjs';
import {writeRoutingOnlySourceProof} from './routing-only-source-proof.mjs';
import {interactiveNavigationDestination,interactiveRouteRequiresBrowser} from './interactive-research-route.mjs';
const read=p=>JSON.parse(fs.readFileSync(p));
export function discoveryEvidenceFingerprint(sources,service){
 return sha(JSON.stringify(sources.flatMap(s=>(s.occurrences??[]).filter(o=>o.service===service).map(o=>[o.market,s.sha256])).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)))));
}
export function discoverySearchHistory(root='.savlivo/research-v2/live',excludeDirectory){
 const counts={};if(!fs.existsSync(root))return counts;
 for(const name of fs.readdirSync(root).sort()){
  const dir=path.join(root,name),file=path.join(dir,'open-web-discovery/state.json');
  if(path.resolve(dir)===path.resolve(excludeDirectory??'.')||!fs.existsSync(file))continue;
  for(const t of read(file).targets??[])counts[t.service]=(counts[t.service]??0)+(t.queries?.length??0);
 }return counts;
}
export function selectOpenWebTargets(targets,{coveredServices=[],priorSearchCounts={},reviewedExclusions=[],sources=[],limit=78}={}){
 const covered=new Set(coveredServices),excluded=new Set(reviewedExclusions.filter(e=>e.disposition==='ONLY_NONCANONICAL_NO_MONTHLY_ALTERNATIVE'&&e.evidenceFingerprint===discoveryEvidenceFingerprint(sources,e.service)).map(e=>e.service));
 // A reviewed exclusion expires as soon as its retained provider-body context changes.
 const representatives=[...new Map(targets.filter(t=>t.gaps.length&&!covered.has(t.service)&&!excluded.has(t.service)).map(t=>[t.service,t])).values()];
 return representatives.sort((a,b)=>(priorSearchCounts[a.service]??0)-(priorSearchCounts[b.service]??0)||sha(a.service).localeCompare(sha(b.service))).slice(0,limit);
}
export function discoveryInputs(inventory){
 const registry=loadProviderSourceRegistry({targets:inventory,inventoryReference:{kind:'CURRENT_RUN_INVENTORY',sha256:sha(JSON.stringify(inventory))}});
 // Historic commercial values are never imported. These URLs remain untrusted leads.
 const file='docs/catalog/service-audit.json',bytes=fs.readFileSync(file),audit=JSON.parse(bytes);const legacy=[];
 for(const s of audit.services)for(const m of s.plansByMarket??[])for(const p of m.plans??[])if(p.sourceUrl)legacy.push({service:s.slug,market:m.country,url:p.sourceUrl,label:'historic provider source lead',method:'HISTORICAL_URL_ONLY',reference:{path:file,sha256:sha(bytes),service:s.slug,market:m.country}});
 const leads=[...registry.leads.map(l=>({...l,method:l.mechanism})),...legacy];return {registry,leads};
}
export function retainedParents(dir,target){
 return [...iterateMarketRunRecords(dir+'/journal')].filter(r=>r.type==='RESPONSE_CAPTURED'&&r.payload.target?.taskId===target.id&&r.payload.status===200&&/text\/html|application\/json/.test(r.payload.contentType??'')).map(r=>{const p=r.payload,body=fs.readFileSync(dir+'/'+p.bodyFile,'utf8');if(sha(body)!==p.bodyHash)throw Error('DISCOVERY_PARENT_HASH_FAILURE');return {url:p.url,body,bodyHash:p.bodyHash,record:{path:dir+'/journal/record-'+String(r.sequence).padStart(8,'0')+'.json',sequence:r.sequence},depth:0};});
}
export function claimsFor(candidates,target){return candidates.filter(c=>c.service===target.service&&c.market===target.market).map(c=>({plan:!!((c.product??c.plan)&&!c.ownershipAmbiguous),amount:!!c.amountNormalized,currency:!!c.currency&&!c.currencyAmbiguous,cadence:c.commercial?.type==='RECURRING_MONTHLY',priceRole:c.commercial?.ordinaryMonthly===true&&c.commercial?.strongRecurringMonthly===true,ownership:!!c.productOwnerEvidence?.raw&&!c.ownershipAmbiguous&&!c.crossCardRisk,market:c.attribution?.marketApplicabilityEstablished===true}));}
// Only acquisition-owned decision fields can establish an access restriction.
// Source text, URLs, diagnostics, and failure messages are not policy decisions.
const providerRestrictionCodes=new Set(['EXPLICIT_PROVIDER_PROHIBITION','PROVIDER_HTTP_403','HTTP_FORBIDDEN','PROVIDER_BLOCKED','CAPTCHA','CHALLENGE','AUTH_REQUIRED']);
const policyRestrictionCodes=new Set(['DISALLOWED','ROBOTS_DISALLOW','ROBOTS_INVALID','PACING','UNSUPPORTED_PACING_DIRECTIVE','PACING_WITHOUT_GROUP','ROBOTS_ACCESS_STOP','ACCESS_POLICY_STOP','ACCESS_CONTROL_STOP']);
export function providerStop(records,target){
 if(records.some(r=>r.type==='RESPONSE_CAPTURED'&&r.payload.target?.taskId===target.id&&[401,403].includes(r.payload.status)))return 'PROVIDER_RESTRICTED';
 const codes=[];
 const decision=d=>{if(d&&typeof d==='object')codes.push(d.decision,d.reason);};
 const status=s=>{
  if(!s||typeof s!=='object')return;
  codes.push(s.outcome,s.reason,typeof s.failure==='string'?s.failure:s.failure?.code);
  decision(s.accessPolicy);
  for(const d of s.accessDecisions??[])decision(d);
 };
 for(const r of records){if(r.type!=='V2_ACQUISITION_RESULT'||r.payload.target?.id!==target.id)continue;
  status(r.payload.result);
  for(const a of r.payload.result.attempts??[]){
   status(a);status(a.page);
   for(const read of a.reads??[])status(read);
   for(const d of a.transportVerification?.accessAdmission?.decisions??[])decision(d);
  }
 }
 return codes.some(c=>providerRestrictionCodes.has(c))?'PROVIDER_RESTRICTED':codes.some(c=>policyRestrictionCodes.has(c))?'POLICY_BLOCKED':null;
}
export function discoveryAdapterFactory(url){return options=>{
 const ordinary=createV2RobotsPublicAdapter({...options,network:{...options.network,pricingResources:false}});
 // Associated resource readers have no provider authority; this bounded discovery stage
 // does not acquire them. Do not construct a provider-only wrapper for such readers.
 if(!options.authorities?.length)return {...ordinary,read:async({url})=>({url,outcome:'UNRESOLVED',failure:{code:'DISCOVERY_ASSOCIATED_RESOURCE_DISABLED'}})};
 const bounded=createV2RobotsPublicAdapter({...options,publicEvidence:{maxRedirects:0,maxBodyBytes:discoveryLimits.maxBodyBytes,maxTotalBodyBytes:discoveryLimits.maxBodyBytes},network:{...options.network,pricingResources:false}});
 // The independent verifier is not commercial provider evidence. Preserve its approved reader.
 return {...ordinary,read:input=>(input.url===url?bounded:ordinary).read(input),checkAccess:(u,opts)=>(u===url?bounded:ordinary).checkAccess(u,opts)};
};}
export function createDiscoveryAcquirer({runtime,bundle,runLive,root,dependencies={}}){return async({target,candidate,journal,maxBytes=2097152})=>{
 if(!Number.isSafeInteger(maxBytes)||maxBytes<0||maxBytes>2097152)throw Error('CAMPAIGN_BYTE_BOUND');let remainingBytes=maxBytes,acquisitionBytes=0;
 const allowed=new Set([candidate.url,new URL('/robots.txt',candidate.url).href,bundle.verifier.url,new URL('/robots.txt',bundle.verifier.url).href]);
 const transport={...bundle.transport,async request(r){if(!allowed.has(r.url.href))throw Error('DISCOVERY_SCOPE_STOP');if(remainingBytes===0)throw Error('CAMPAIGN_BYTE_BOUND');const requestMax=Math.min(r.maxBytes,remainingBytes);journal.reserve(target.id,'requests');const reservation=journal.reserve(target.id,'bytes',requestMax+65536);journal.append('REQUEST_STARTED',{target:target.id,url:r.url.href,maxBytes:requestMax});let count=0;try{const response=await bundle.transport.request({...r,maxBytes:requestMax,onBodyBytes:n=>{count+=n;if(count>requestMax)throw Error('CAMPAIGN_BYTE_BOUND');journal.append('RESPONSE_BYTES',{target:target.id,bytes:n});r.onBodyBytes?.(n);}}),observed=Math.max(count,response.body.length);if(observed>remainingBytes)throw Error('CAMPAIGN_BYTE_BOUND');if(!count)journal.append('RESPONSE_BYTES',{target:target.id,bytes:response.body.length});remainingBytes-=observed;acquisitionBytes+=observed;journal.append('RESPONSE',{target:target.id,url:r.url.href,status:response.status,hash:sha(response.body),bytes:response.body.length});journal.settleBytes(reservation,observed+65536);return response;}finally{journal.append('REQUEST_FINISHED',{target:target.id,url:r.url.href});}}};
 const routingOnly=!!candidate.acquisitionCandidate;
 // The engine needs a configured source to retain the geo receipt. For a new
 // candidate this bridge is transport metadata only; offline interpretation is
 // deferred until the acquired bytes pass the V3 source review below.
 const authority={hostname:new URL(candidate.url).hostname,provider:target.serviceName,sourceType:'OFFICIAL_PROVIDER',sourceUrl:candidate.url,checkedAt:new Date().toISOString(),discoveryDomainBinding:candidate.authority??null,routingOnly};
 const child=await runLive({inventory:[{...target,urls:[candidate.url],authorities:[...target.authorities,authority],onlineDiscoveryProof:candidate}],root,maxRetries:0,coverageFallback:false,onlineDiscovery:false,dependencies:{...dependencies,...(routingOnly?{interpret:async()=>{}}:{}),loadConfig:async()=>runtime,providerFactory:()=>({...bundle,transport}),engineFactory:opts=>createGeoEscalation({...opts,robotsAdapterFactory:discoveryAdapterFactory(candidate.url)})}});
 const records=[...iterateMarketRunRecords(child.directory+'/journal')],hardStop=providerStop(records,target),accepted=records.some(r=>r.type==='V2_ACQUISITION_RESULT'&&r.payload.result.outcome==='OBSERVED');
 const acquiredAttempt=records.filter(r=>r.type==='V2_ACQUISITION_RESULT'&&r.payload.target?.id===target.id).flatMap(r=>r.payload.result?.attempts??[]).find(attempt=>attempt.outcome==='OBSERVED'&&attempt.page?.outcome==='OK'),acquired=acquiredAttempt?.page;
 const sourceClassification=routingOnly?classifyAcquiredSource({target,page:acquired?{...acquired,requestedUrl:acquiredAttempt.requestedUrl??candidate.url,bodyHash:acquired.sourceIntegrity?.sha256}:null,body:acquired?.rawSource?.text,observationId:'decodo-source-'+(acquired?.sourceIntegrity?.sha256??'unknown').slice(0,24)}):null;
 if(routingOnly&&sourceClassification.status==='PROVIDER_SOURCE'){
  if(sourceClassification.binding?.kind!=='PROVIDER_SOURCE_DOMAIN_FAMILY')installRunScopedV3ProviderAuthority(target,sourceClassification.review);
  writeRoutingOnlySourceProof(child.directory,target,sourceClassification);
 }
 const admittedSource=!routingOnly||sourceClassification.status==='PROVIDER_SOURCE';
 if(routingOnly&&admittedSource)await (dependencies.interpret??interpretRun)(child.directory);
 const verification=admittedSource?await (dependencies.verifyRetainedRun??verifyRetainedRun)(child.directory):{verified:[],usable:false,monetaryFacts:0,sourceChecks:[],priceEvidenceNeedsByTarget:{}};
 const v3=hardStop?{countryV3Evaluation:{status:'UNRESOLVED',reason:hardStop}}:admittedSource?(dependencies.evaluateVerifiedCountryRun??evaluateVerifiedCountryRun)({target,verification,records}):{countryV3Evaluation:{status:'UNRESOLVED',reason:sourceClassification.reason}};
 const parents=hardStop?[]:retainedParents(child.directory,target),parent=parents.find(row=>row.url===(sourceClassification?.finalUrl??candidate.url))??parents.find(row=>row.url===candidate.url),interactiveRoute=candidate.acquisitionCandidate?.researchLinkKind==='INTERACTIVE_ROUTE'&&parent&&admittedSource&&!verification.verified.length,interactiveNavigationUrl=interactiveRoute?interactiveNavigationDestination(parent.body,parent.url):null,renderingRequired=admittedSource&&!verification.verified.length&&!!parent&&(conditionalCommercialRenderingRequired(parent.body)||interactiveRoute&&interactiveRouteRequiresBrowser(parent.body,parent.url));
 return {...v3,researchLinkId:candidate.acquisitionCandidate?.researchLinkId??null,interactiveNavigationUrl,renderingUrl:renderingRequired?parent.url:null,sourceClassification:sourceClassification&&{status:sourceClassification.status,reason:sourceClassification.reason,finalUrl:sourceClassification.finalUrl,requestedUrl:sourceClassification.requestedUrl,sourceHash:sourceClassification.sourceHash,observationId:sourceClassification.observationId},priceEvidenceNeeds:verification.priceEvidenceNeedsByTarget?.[target.id]??null,url:candidate.url,runDirectory:child.directory,classification:hardStop??(!admittedSource?sourceClassification.status:verification.verified.length?'VERIFIED_OUTPUT':verification.usable?'COMMERCIAL_FIELDS_INSUFFICIENT':accepted?'CONTENT_NOT_COMMERCIAL':'ACQUISITION_FAILED'),acquired:accepted,usable:verification.usable,monetary:verification.monetaryFacts,verified:verification.verified,sufficient:verification.verified.length>0,renderingRequired,hardStop:!!hardStop,acquisitionBytes,policy:records.filter(r=>r.type==='V2_ACQUISITION_RESULT').map(r=>({actionId:r.payload.actionId,attempts:r.payload.result.attempts?.map(a=>({failure:a.failure,reason:a.reason,accessPolicy:a.accessPolicy}))})),parents};
 };}
export async function runOnlineDiscoveryStage({dir,inventory,runtime,bundle,runLive,dependencies={},limits=discoveryLimits}){
 if(dependencies.openWebDiscovery){
  const configured=dependencies.openWebDiscovery.bind?dependencies.openWebDiscovery.bind({dir,runtime,bundle,runLive,dependencies}):dependencies.openWebDiscovery;
  const {runOpenWebResearch}=await import('./open-web-discovery.mjs');
  const out=fs.readdirSync(dir).filter(n=>/^interpretation-\d+$/.test(n)).sort().at(-1);
  const candidates=read(dir+'/'+out+'/monthly/candidates.json');
  const targets=inventory.map(t=>{const activation=discoveryActivation({ordinaryComplete:true,interpretationComplete:true,claims:claimsFor(candidates,t),hasSources:!!t.urls.length});return {...t,gaps:activation.missingFields,discoveryTrigger:activation.reason};}).filter(t=>t.gaps.length);
  const sources=read(dir+'/'+out+'/corpus/sources.json').sources;
  const exclusionFile='docs/catalog/global-47/research-v2/discovery-reviewed-exclusions.json';
  const selected=selectOpenWebTargets(targets,{coveredServices:configured.coveredServices,priorSearchCounts:discoverySearchHistory(undefined,dir),reviewedExclusions:fs.existsSync(exclusionFile)?read(exclusionFile):[],sources,limit:configured.bounds?.services??78});
  const state=await runOpenWebResearch({...configured,directory:path.join(dir,'open-web-discovery'),targets:selected,catalog:inventory});
  return state.targets.map(t=>({target:t.id,pages:[...t.reads,{verified:t.verified}],terminal:t.done??'COMMERCIAL_FIELDS_SUFFICIENT'}));
 }
 const dest=path.join(dir,'online-discovery'),journal=new DiscoveryJournal(dest,limits),{registry,leads}=discoveryInputs(inventory),out=fs.readdirSync(dir).filter(n=>/^interpretation-\d+$/.test(n)).sort().at(-1),candidates=read(dir+'/'+out+'/monthly/candidates.json'),records=[...iterateMarketRunRecords(dir+'/journal')];
 const acquire=createDiscoveryAcquirer({runtime,bundle,runLive,root:dest+'/acquisitions',dependencies}),results=[];
 const groups=new Map();for(const t of [...inventory].sort((a,b)=>Number(!!a.urls.length)-Number(!!b.urls.length)||a.service.localeCompare(b.service)||a.market.localeCompare(b.market))){if(!groups.has(t.service))groups.set(t.service,[]);groups.get(t.service).push(t);}const order=[];while([...groups.values()].some(g=>g.length))for(const g of groups.values())if(g.length)order.push(g.shift());
 for(const t of order){const activation=discoveryActivation({ordinaryComplete:true,interpretationComplete:true,claims:claimsFor(candidates,t),hasSources:!!t.urls.length,hardStop:providerStop(records,t)});if(!activation.active){journal.append('ACTIVATION',{target:t.id,activation});continue;}if(journal.usage.targets>=limits.targets)break;
  const own=registry.domains.filter(d=>d.service===t.service);const selected=leads.filter(l=>l.service===t.service).sort((a,b)=>Number(b.market===t.market)-Number(a.market===t.market)||a.url.localeCompare(b.url));
  const roots=own.map(d=>({url:new URL(d.reference.authoritySourceUrl??'https://'+d.hostname).origin+'/',method:'REVIEWED_PROVIDER_ROOT',reference:d.reference,depth:0}));
  results.push(await discoverTarget({target:t,activation,domains:registry.domains,leads:[...selected.filter(l=>own.some(d=>{try{return d.hostname===new URL(l.url).hostname;}catch{return false;}})),...roots,...selected],parents:retainedParents(dir,t),journal,acquire}));
 }
 const sources=mergeSources([],results.flatMap(r=>r.sources)),publish=(file,v)=>{const tmp=dest+'/'+file+'.pending';fs.writeFileSync(tmp,JSON.stringify(v,null,2)+'\n');fs.renameSync(tmp,dest+'/'+file+'.json');};publish('results',results);publish('discovered-provider-sources',sources);publish('usage',journal.usage);const reusable=sources.filter(s=>results.some(r=>r.pages.some(p=>p.url===s.url&&p.acquired&&!p.hardStop)));if(reusable.length){const cache='.savlivo/research-v2/discovered-provider-sources';fs.mkdirSync(cache,{recursive:true});const file=cache+'/'+sha(dir)+'.json';fs.writeFileSync(file+'.pending',JSON.stringify(reusable,null,2)+'\n');fs.renameSync(file+'.pending',file);}return results;
}

export function mergePersistedDiscovery(inventory,{cache='.savlivo/research-v2/discovered-provider-sources'}={}){
 if(!fs.existsSync(cache))return inventory;
 const rows=[];for(const file of fs.readdirSync(cache).filter(f=>/^[a-f0-9]{64}\.json$/.test(f)).sort()){const bytes=fs.readFileSync(cache+'/'+file);if(bytes.length>2097152)throw Error('DISCOVERY_CACHE_BOUND');const data=JSON.parse(bytes);if(!Array.isArray(data)||data.length>30)throw Error('DISCOVERY_CACHE_INVALID');rows.push(...data);}
 // Cache never creates a new authority: corroborate its exact host against current reviewed registry.
 const {registry}=discoveryInputs(inventory);
 return inventory.map(t=>{const selected=rows.filter(r=>r.service===t.service&&r.market===t.market&&r.runDirectory&&r.ownership?.validated&&officialCandidate(t,{url:r.url},registry.domains).eligible).sort((a,b)=>a.url.localeCompare(b.url));return {...t,urls:[...new Set([...t.urls,...selected.map(r=>r.url)])],authorities:[...t.authorities,...selected.filter(r=>!t.authorities.some(a=>a.hostname===new URL(r.url).hostname)).map(r=>({hostname:new URL(r.url).hostname,provider:t.serviceName,sourceType:'OFFICIAL_PROVIDER',sourceUrl:r.url,checkedAt:r.discoveredAt,discoveryDomainBinding:registry.domains.find(d=>d.service===t.service&&d.hostname===new URL(r.url).hostname)}))],persistedOnlineDiscovery:selected};});
}
