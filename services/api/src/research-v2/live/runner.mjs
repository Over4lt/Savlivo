import {reconcileRunCoverage} from './coverage-finalization.mjs';
import {applyFrontierInventory} from './frontier-inventory.mjs';
import {createV2RobotsPublicAdapter} from './robots-policy.mjs';
// Acquisition host: deliberately does NOT import the offline interpretation graph.
import assert from 'node:assert/strict';
import fs from 'node:fs';import path from 'node:path';import {randomUUID,createHash} from 'node:crypto';import {spawn} from 'node:child_process';
import {createDecodoProvider} from '../../../../../docs/catalog/global-47/research-v1/decodo-adapter.mjs';
import {createGeoEscalation} from '../../../../../docs/catalog/global-47/research-v1/geo-escalation.mjs';
import {loadDecodoRuntimeConfig,decodoRuntimeAuthorization} from '../../research-v1/decodo-runtime-config.mjs';
import {tsImport} from 'tsx/esm/api';
import {createGeoBudget} from '../../research-v1/geo-provider.mjs';
import {decodoOnlyPolicy} from '../../research-v1/acquisition-policy.mjs';
import {openMarketRunStore} from '../../research-v1/market-run-store.mjs';
export const currentShadowBaselinePath='.savlivo/research-v2/forensic-review/full-decodo-night-20260916/verified-identities.json';
export const capabilities=Object.freeze({decodo:true,groq:false,browser:false,providerContact:false,productionVerified:false});
const sha=x=>createHash('sha256').update(x).digest('hex');
export function fullInventory(state){
 const targets=[];for(const s of state.services)for(const market of [...new Set(s.markets)].sort()){
  const authorities=[],urls=[];const add=(url,sourceType,checkedAt)=>{try{const u=new URL(url);if(u.protocol!=='https:'||u.username||u.password)return;authorities.push({hostname:u.hostname,provider:s.name,sourceType,sourceUrl:u.href,checkedAt:checkedAt?.length===10?checkedAt+'T00:00:00.000Z':checkedAt});urls.push(u.href);}catch{}};
  const w=s.web?.find(w=>w.countryCode===market);for(const key of ['startWeb','cancelWeb'])if(w?.[key]?.status==='VERIFIED'){add(w[key].url,'OFFICIAL_PROVIDER',w.verifiedAt);add(w[key].evidenceUrl,'OFFICIAL_SUPPORT',w.verifiedAt);}if(s.additionalAvailability?.markets.includes(market))add(s.additionalAvailability.sourceUrl,'OFFICIAL_PROVIDER',s.additionalAvailability.verifiedAt);
  for(const r of state.retained??[])if(r.result?.item?.canonicalSlug===s.slug&&r.result.item.countryCode===market)for(const p of r.sourcePages??r.pages??[]){if(p.authority?.status==='CONFIGURED_REVIEWED'&&p.authority.provider===s.name)add(p.url,p.authority.sourceType,p.checkedAt);}
  const hosts=new Set(authorities.map(a=>a.hostname));for(const p of state.prices??[])if((p.scope?.serviceSlug??p.serviceSlug)===s.slug&&(p.scope?.countryCode??p.countryCode)===market){try{if(hosts.has(new URL(p.sourceUrl).hostname))urls.unshift(p.sourceUrl);}catch{}}
  targets.push({id:'v2-'+sha(s.slug+'|'+market).slice(0,24),service:s.slug,serviceName:s.name,market,urls:[...new Set(urls)],authorities:[...new Map(authorities.filter(a=>a.checkedAt).map(a=>[JSON.stringify(a),a])).values()]});
 }return targets.sort((a,b)=>(a.service+'|'+a.market).localeCompare(b.service+'|'+b.market));
}
export async function loadFullInventory(){
 const catalog=await tsImport('../../../../../packages/contracts/src/catalog.ts',import.meta.url),web=await tsImport('../../../../../packages/contracts/src/catalog-web-management.ts',import.meta.url),markets=await tsImport('../../../../../packages/contracts/src/markets.ts',import.meta.url);
 const services=catalog.serviceCatalog.map(s=>({...s,markets:markets.countryCurrencyData.filter(([c])=>catalog.serviceAvailableInMarket(s.slug,c)).map(([c])=>c),web:markets.countryCurrencyData.flatMap(([countryCode])=>{const w=web.webEvidenceFor(s.slug,countryCode);return w?[{countryCode,...w}]:[];})}));
 // Retained URLs are discovery leads only; old values/VERIFIED status never gate a fresh task.
 const file=path.resolve('.savlivo/research-v2/offline-replay/full-20260914-phase1-raw-locators/sources.json');const retained=fs.existsSync(file)?JSON.parse(fs.readFileSync(file)).sources.flatMap(s=>s.occurrences.filter(o=>o.authority?.status==='CONFIGURED_REVIEWED').map(o=>({result:{item:{canonicalSlug:o.service,countryCode:o.market}},sourcePages:[{url:o.url,checkedAt:o.checkedAt,authority:o.authority}]}))):[];
 return fullInventory({services,retained});
}
export async function loadCoverageInventory(){
 const inventory=await loadFullInventory();
 const candidates=JSON.parse(fs.readFileSync('.savlivo/research-v2/source-frontier/phase1-20260915/candidate-provenance.json'));
 const baseline=JSON.parse(fs.readFileSync(currentShadowBaselinePath));
 const merged=applyFrontierInventory(inventory,candidates,{coveredServices:[...new Set(baseline.map(p=>p.service))]});
 const {mergePersistedDiscovery}=await import('./online-discovery-stage.mjs');return mergePersistedDiscovery(merged);
}
function publish(file,bytes){const temp=path.join(path.dirname(file),'.pending-'+randomUUID()),fd=fs.openSync(temp,'wx',0o600);try{fs.writeFileSync(fd,bytes);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}fs.linkSync(temp,file);fs.unlinkSync(temp);const d=fs.openSync(path.dirname(file),'r');try{fs.fsyncSync(d);}finally{fs.closeSync(d);}}
export function makeRunDirectory(root,clock=()=>new Date().toISOString(),uuid=randomUUID){const id='research-v2-full-decodo-'+clock().replace(/[-:.]/g,'')+'-'+uuid();const dir=path.join(root,id);fs.mkdirSync(root,{recursive:true});fs.mkdirSync(dir,{mode:0o700});return {id,dir};}
export function interpretRun(directory){return new Promise((resolve,reject)=>{const child=spawn(process.execPath,[new URL('./interpret.mjs',import.meta.url).pathname,path.resolve(directory)],{cwd:process.cwd(),env:{PATH:process.env.PATH??''},stdio:['ignore','inherit','inherit']});child.on('error',()=>reject(Error('V2_INTERPRETATION_WORKER_START_FAILED')));child.on('exit',code=>code===0?resolve():reject(Error('V2_INTERPRETATION_FAILED; acquisition remains retained')));});}
export async function runLive({inventory,root='.savlivo/research-v2/live',env=process.env,monetaryAuthorizationMode='BOUNDED',maxRetries=1,coverageFallback=false,onlineDiscovery=coverageFallback,clock=()=>new Date().toISOString(),dependencies={}}={}){
 assert(Array.isArray(inventory)&&inventory.length);assert(Number.isInteger(maxRetries)&&maxRetries>=0&&maxRetries<=2);
 const runtime=await (dependencies.loadConfig??loadDecodoRuntimeConfig)({env});const budgetSpec=(dependencies.authorization??decodoRuntimeAuthorization)(runtime,null,monetaryAuthorizationMode);
 const bundle=(dependencies.providerFactory??createDecodoProvider)({env:runtime});assert(bundle.provider.id==='decodo'&&bundle.provider.ready&&bundle.provider.configured&&bundle.verifier.approved,'DECODO_PREFLIGHT_FAILED');
 const {id,dir}=makeRunDirectory(root,clock);const manifest={version:'RESEARCH_V2_LIVE_V1',id,createdAt:clock(),capabilities,inventory,inventoryHash:sha(JSON.stringify(inventory)),monetaryAuthorizationMode,budget:budgetSpec,maxRetries,concurrency:1,scope:'ALL_CATALOG_SERVICE_MARKET_PAIRS_NO_FRESHNESS_SKIP',externalBilling:'UNKNOWN',productionVerified:false};publish(path.join(dir,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');fs.mkdirSync(path.join(dir,'raw'));const store=openMarketRunStore(path.join(dir,'journal'));
 let current=null,requestNumber=0,operations=0,failed=0;
 const append=(type,payload)=>store.append(type,payload);
 const accounts=[...inventory.map(t=>({scope:'TASK',key:t.id,ceiling:budgetSpec.task})),...[...new Set(inventory.map(t=>t.market))].map(key=>({scope:'MARKET',key,ceiling:budgetSpec.market})),{scope:'RUN',key:id,ceiling:budgetSpec.run}].map((a,i)=>({...a,id:'v2-budget-'+i,currency:budgetSpec.currency,monetaryAuthorizationMode}));const budget=createGeoBudget(accounts);
 const budgetDecision=async request=>{append('BUDGET_REQUEST',{request});const result=await budget(request);append('BUDGET_RESULT',{result});return result;};
 const transport={...bundle.transport,statistics:bundle.statistics,async request(r){const requestId='request-'+String(++requestNumber).padStart(8,'0');const meta={requestId,target:current,url:r.url.href,bindingRef:r.bindingRef??null};append('REQUEST_STARTED',meta);try{const response=await bundle.transport.request(r);const bytes=Buffer.from(response.body),bodyHash=sha(bytes),name=bodyHash+'.body';if(!fs.existsSync(path.join(dir,'raw',name)))publish(path.join(dir,'raw',name),bytes);else assert.equal(sha(fs.readFileSync(path.join(dir,'raw',name))),bodyHash,'RAW_CHECKPOINT_HASH_MISMATCH');append('RESPONSE_CAPTURED',{...meta,status:response.status,bodyHash,bodyFile:'raw/'+name,bytes:bytes.length,contentType:response.headers?.['content-type']??null,location:response.headers?.location??null,proof:response.proof??null});return response;}catch(e){append('REQUEST_FAILED',{...meta,reason:'TRANSPORT_FAILED_REDACTED'});throw e;}}};
 let thrown;try{append('V2_RUN_CREATED',{manifest});for(const target of inventory){current={taskId:target.id,service:target.service,market:target.market};if(!target.urls.length){append('TARGET_SKIPPED',{...current,reason:'NO_REVIEWED_OFFICIAL_START_URL'});failed++;continue;}
  if(!bundle.provider.countries.includes(target.market)){append('TARGET_SKIPPED',{...current,reason:'DECODO_COUNTRY_UNAVAILABLE'});failed++;continue;}
  for(const url of target.urls){let completed=false;for(let retry=0;retry<=maxRetries;retry++){const actionId=target.id+'-'+sha(url).slice(0,12)+'-'+retry;append('ACQUISITION_STARTED',{...current,url,actionId,retry});const engine=(dependencies.engineFactory??createGeoEscalation)({robotsAdapterFactory:createV2RobotsPublicAdapter,proofVersion:2,providers:[bundle.provider],transports:{decodo:transport},verifier:bundle.verifier,clock,authorities:target.authorities,acquisitionPolicy:decodoOnlyPolicy,pageRuntime:null,imageResources:false,limits:{providers:1,reads:60,networkRequests:180,timeoutMs:30000},...(dependencies.resolveHost?{resolveHost:dependencies.resolveHost}:{})});
   const result=await engine.execute({researchId:target.id,runId:id,remainingReads:60,budgetDecision,experimentalAcquisition:{policy:decodoOnlyPolicy,countryCode:target.market,serviceSlug:target.service,url,actionId}});append('V2_ACQUISITION_RESULT',{target,actionId,retry,result});operations++;completed=result.outcome==='OBSERVED';if(completed||!result.attempts?.some(a=>['TIMEOUT','NETWORK_FAILED','ADAPTER_FAILED','DNS_FAILED'].includes(a.failure)))break;
  }if(!completed)failed++;}append('TARGET_COMPLETE',current);}
  append('ACQUISITION_COMPLETE',{operations,failed,budget:budget.snapshot()});
 }catch(e){thrown=Error('V2_ACQUISITION_INTERRUPTED; completed response checkpoints retained');append('RUN_INTERRUPTED',{operations,failed,reason:'REDACTED_EXECUTION_ERROR'});}finally{store.close();}
 if(thrown)throw thrown;await (dependencies.interpret??interpretRun)(dir);
 if(coverageFallback){
  const {runModuleStage,verifyRetainedRun}=await import('./module-stage.mjs');
  const primaryVerification=await verifyRetainedRun(dir);
  const moduleRuntime=Object.create(runtime);Object.defineProperty(moduleRuntime,'SAVLIVO_DECODO_MAX_BODY_BYTES',{value:'4194304'});
  const moduleBundle=(dependencies.providerFactory??createDecodoProvider)({env:moduleRuntime});
  const moduleResults=await runModuleStage({dir,inventory,runtime:moduleRuntime,bundle:moduleBundle,resolveHost:dependencies.resolveHost,acquireEndpoint:async({target,candidate,budget,root})=>{
   const allowed=new Set([candidate.url,new URL('/robots.txt',candidate.url).href,bundle.verifier.url,new URL('/robots.txt',bundle.verifier.url).href]);
   const bounded={...bundle,transport:{...bundle.transport,async request(r){
    if(!allowed.has(r.url.href))throw Error('ENDPOINT_SCOPE_STOP');budget.request('endpoint',r.maxBytes);let bytes=0;
    try{const response=await bundle.transport.request({...r,onBodyBytes:n=>{bytes+=n;budget.traffic('endpoint',n);r.onBodyBytes?.(n);}});if(!bytes)budget.traffic('endpoint',response.body.length);return response;}finally{budget.settled();}
   }}};
   const child=await runLive({inventory:[{...target,urls:[candidate.url],derivedEndpointProof:candidate}],root,maxRetries:0,dependencies:{...dependencies,loadConfig:async()=>runtime,providerFactory:()=>bounded}});
   return {runDirectory:child.directory,verification:await verifyRetainedRun(child.directory)};
  }});
  const baseline=JSON.parse(fs.readFileSync(currentShadowBaselinePath));
  publish(path.join(dir,'shadow-coverage.json'),JSON.stringify(reconcileRunCoverage(primaryVerification,moduleResults,baseline),null,2)+'\n');
 }
 if(onlineDiscovery){const {runOnlineDiscoveryStage}=await import('./online-discovery-stage.mjs');const discovered=await runOnlineDiscoveryStage({dir,inventory,runtime,bundle,runLive,dependencies});
  // Separate immutable final-stage ledger includes discovery child verification, not just primary evidence.
  const earlier=fs.existsSync(path.join(dir,'shadow-coverage.json'))?JSON.parse(fs.readFileSync(path.join(dir,'shadow-coverage.json'))):{verified:[]};
  const baselinePath=currentShadowBaselinePath;
  const baseline=fs.existsSync(baselinePath)?JSON.parse(fs.readFileSync(baselinePath)):[];
  const results=discovered.map(r=>({endpoints:r.pages.map(p=>({verification:{verified:p.verified??[]}}))}));
  publish(path.join(dir,'online-discovery-shadow-coverage.json'),JSON.stringify(reconcileRunCoverage(earlier,results,baseline),null,2)+'\n');
 }
 publish(path.join(dir,'complete.json'),JSON.stringify({id,operations,failed,capabilities,productionVerified:false},null,2)+'\n');return {id,directory:dir,targets:inventory.length,operations,failed,capabilities};
}

// Bounded CLI acceptance uses retained ordinary evidence and the identical discovery stage.
export async function runDiscoveryAcceptance({retainedDirectory,inventory,dependencies,root='.savlivo/research-v2/tavily-integration/20260917/acceptance'}={}){
 assert(inventory.length>=1&&inventory.length<=12&&new Set(inventory.map(t=>t.service)).size===inventory.length,'ACCEPTANCE_DISTINCT_TARGET_BOUND');
 const retained=path.resolve(retainedDirectory),manifest=JSON.parse(fs.readFileSync(retained+'/manifest.json'));
 assert(inventory.every(target=>manifest.inventory.some(t=>t.id===target.id)),'RETAINED_TARGET_REQUIRED');
 const output=fs.readdirSync(retained).filter(n=>/^interpretation-\d+$/.test(n)).sort().at(-1);assert(output,'RETAINED_INTERPRETATION_REQUIRED');
 const {dir}=makeRunDirectory(root,()=>new Date().toISOString());
 for(const name of ['journal','raw',output])fs.symlinkSync(path.join(retained,name),path.join(dir,name),'dir');
 publish(path.join(dir,'acceptance-input.json'),JSON.stringify({retainedDirectory:retained,inventory,bounds:dependencies.openWebDiscovery.bounds},null,2));
 const runtime=await loadDecodoRuntimeConfig(),bundle=createDecodoProvider({env:runtime});
 const {runOnlineDiscoveryStage}=await import('./online-discovery-stage.mjs');
 const results=await runOnlineDiscoveryStage({dir,inventory,runtime,bundle,runLive,dependencies});
 publish(path.join(dir,'acceptance-complete.json'),JSON.stringify({results,externalSearch:'TAVILY'},null,2));return {directory:dir,results};
}
