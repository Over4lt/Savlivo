import fs from 'node:fs';import path from 'node:path';
import {DiscoveryJournal,discoveryLimits,discoveryActivation,discoverTarget,sha,mergeSources,officialCandidate} from './online-discovery.mjs';
import {loadProviderSourceRegistry} from './provider-source-registry.mjs';
import {createV2RobotsPublicAdapter} from './robots-policy.mjs';
import {createGeoEscalation} from '../../../../../docs/catalog/global-47/research-v1/geo-escalation.mjs';
import {iterateMarketRunRecords} from '../../research-v1/market-run-store.mjs';
import {verifyRetainedRun} from './module-stage.mjs';
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
export function providerStop(records,target){const attempts=records.filter(r=>r.type==='V2_ACQUISITION_RESULT'&&r.payload.target?.id===target.id).flatMap(r=>r.payload.result.attempts??[]);const text=JSON.stringify(attempts);if(records.some(r=>r.type==='RESPONSE_CAPTURED'&&r.payload.target?.taskId===target.id&&[401,403].includes(r.payload.status)))return 'PROVIDER_RESTRICTED';return /EXPLICIT_PROVIDER_PROHIBITION|PROVIDER_HTTP_403|HTTP_FORBIDDEN|PROVIDER_BLOCKED|CAPTCHA|CHALLENGE|AUTH_REQUIRED/.test(text)?'PROVIDER_RESTRICTED':/DISALLOWED|ROBOTS_DISALLOW|PACING|ROBOTS_INVALID/.test(text)?'POLICY_BLOCKED':null;}
export function discoveryAdapterFactory(url){return options=>{
 const ordinary=createV2RobotsPublicAdapter({...options,network:{...options.network,pricingResources:false}});
 // Associated resource readers have no provider authority; this bounded discovery stage
 // does not acquire them. Do not construct a provider-only wrapper for such readers.
 if(!options.authorities?.length)return {...ordinary,read:async({url})=>({url,outcome:'UNRESOLVED',failure:{code:'DISCOVERY_ASSOCIATED_RESOURCE_DISABLED'}})};
 const bounded=createV2RobotsPublicAdapter({...options,publicEvidence:{maxRedirects:0,maxBodyBytes:discoveryLimits.maxBodyBytes,maxTotalBodyBytes:discoveryLimits.maxBodyBytes},network:{...options.network,pricingResources:false}});
 // The independent verifier is not commercial provider evidence. Preserve its approved reader.
 return {...ordinary,read:input=>(input.url===url?bounded:ordinary).read(input),checkAccess:(u,opts)=>(u===url?bounded:ordinary).checkAccess(u,opts)};
};}
export function createDiscoveryAcquirer({runtime,bundle,runLive,root,dependencies={}}){return async({target,candidate,journal})=>{
 const allowed=new Set([candidate.url,new URL('/robots.txt',candidate.url).href,bundle.verifier.url,new URL('/robots.txt',bundle.verifier.url).href]);
 const transport={...bundle.transport,async request(r){if(!allowed.has(r.url.href))throw Error('DISCOVERY_SCOPE_STOP');journal.reserve(target.id,'requests');const reservation=journal.reserve(target.id,'bytes',r.maxBytes+65536);journal.append('REQUEST_STARTED',{target:target.id,url:r.url.href,maxBytes:r.maxBytes});let count=0;try{const response=await bundle.transport.request({...r,onBodyBytes:n=>{count+=n;journal.append('RESPONSE_BYTES',{target:target.id,bytes:n});r.onBodyBytes?.(n);}});if(!count)journal.append('RESPONSE_BYTES',{target:target.id,bytes:response.body.length});journal.append('RESPONSE',{target:target.id,url:r.url.href,status:response.status,hash:sha(response.body),bytes:response.body.length});journal.settleBytes(reservation,Math.max(count,response.body.length)+65536);return response;}finally{journal.append('REQUEST_FINISHED',{target:target.id,url:r.url.href});}}};
 const authority={hostname:new URL(candidate.url).hostname,provider:target.serviceName,sourceType:'OFFICIAL_PROVIDER',sourceUrl:candidate.url,checkedAt:new Date().toISOString(),discoveryDomainBinding:candidate.authority};
 const child=await runLive({inventory:[{...target,urls:[candidate.url],authorities:[...target.authorities,authority],onlineDiscoveryProof:candidate}],root,maxRetries:0,coverageFallback:false,onlineDiscovery:false,dependencies:{...dependencies,loadConfig:async()=>runtime,providerFactory:()=>({...bundle,transport}),engineFactory:opts=>createGeoEscalation({...opts,robotsAdapterFactory:discoveryAdapterFactory(candidate.url)})}});
 const verification=await verifyRetainedRun(child.directory),records=[...iterateMarketRunRecords(child.directory+'/journal')],hardStop=providerStop(records,target),accepted=records.some(r=>r.type==='V2_ACQUISITION_RESULT'&&r.payload.result.outcome==='OBSERVED');
 return {url:candidate.url,runDirectory:child.directory,classification:hardStop??(verification.verified.length?'VERIFIED_OUTPUT':verification.usable?'COMMERCIAL_FIELDS_INSUFFICIENT':accepted?'CONTENT_NOT_COMMERCIAL':'ACQUISITION_FAILED'),acquired:accepted,usable:verification.usable,monetary:verification.monetaryFacts,verified:verification.verified,sufficient:verification.verified.length>0,hardStop:!!hardStop,policy:records.filter(r=>r.type==='V2_ACQUISITION_RESULT').map(r=>({actionId:r.payload.actionId,attempts:r.payload.result.attempts?.map(a=>({failure:a.failure,reason:a.reason,accessPolicy:a.accessPolicy}))})),parents:hardStop?[]:retainedParents(child.directory,target)};
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
