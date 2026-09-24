import {loadMarketProofSources} from '../verification/market-proof-sources.mjs';
import {marketResearch} from '../verification/market-proof.mjs';
import {projectPriceEvidenceNeeds} from '../intelligence/price-evidence-needs.mjs';
import {enrichOfferObservations} from '../intelligence/offer-intelligence.mjs';
import {adjudicateProviderPrice,reconcilePriceObservations} from '../intelligence/provider-price-adjudication.mjs';
import {loadLiveSource} from '../verification/live-source.mjs';
import {prepareCommercialSource} from '../offline-recovery/commercial.mjs';
import {analyzeCurrencyResources} from '../code-dataflow/currency-resource-ledger.mjs';
import {deriveEvidence} from '../verification/gate.mjs';
import {loadGoverningResources} from '../verification/governing-resources.mjs';
import {analyzeInterpretedRun} from '../code-dataflow/post-interpretation.mjs';
// Offline child process. Never import this graph into the acquisition host.
import {assertOffline} from '../offline-replay/offline-guard.mjs';
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {hostname} from 'node:os';import {pathToFileURL} from 'node:url';
import {iterateMarketRunRecords} from '../../research-v1/market-run-store.mjs';
import {validateBody,statuses} from '../offline-replay/corpus.mjs';
import {extract,grade,hash,normalizeText} from '../offline-recovery/extract.mjs';
import {attribute,combineMarketEvidenceTypes} from '../offline-recovery/attribution.mjs';
import {inspectProviderMarket,providerEvidenceFor} from '../offline-recovery/provider-market.mjs';
import {checkGeoChain} from '../offline-recovery/geo-evidence.mjs';
import {validateStructuredRelationship} from '../../research-v1/associated-structured-resources.mjs';
import {runMonthly} from '../offline-recovery/monthly-run.mjs';import {csv} from '../offline-recovery/run.mjs';
const unique=a=>[...new Set(a)].sort(),label=x=>normalizeText(x).toLowerCase();
const factKey=c=>[c.service,c.market,label(c.product),c.amountNormalized,c.currency,c.billingPeriod,c.promotionOrTrial,c.qualifier,...(c.attribution?.blockingReasons.includes('PRODUCT_FROM_COUNTRY_LABEL')?[{unresolvedCountryOwner:c.attribution.marketOwnerEvidence.map(e=>e.code).sort()}]:[])];
export function interpret(directory,{outputDirectory=null}={}){const dir=path.resolve(directory),manifest=JSON.parse(fs.readFileSync(dir+'/manifest.json'));assert(manifest.version==='RESEARCH_V2_LIVE_V1');assert(manifest.capabilities.groq===false&&manifest.capabilities.browser===false&&manifest.capabilities.providerContact===false);
 const owner=dir+'/journal/.owner.json';if(fs.existsSync(owner)){const o=JSON.parse(fs.readFileSync(owner));assert(o.host===hostname(),'REMOTE_OWNER_CANNOT_BE_VERIFIED');let alive=true;try{process.kill(o.pid,0);}catch(e){if(e.code==='ESRCH')alive=false;}assert(!alive,'ACQUISITION_STILL_RUNNING');}
 const names=fs.readdirSync(dir).filter(n=>/^interpretation-\d{4}$/.test(n));const output=outputDirectory?path.resolve(outputDirectory):dir+'/interpretation-'+String(names.length+1).padStart(4,'0');assert(!fs.existsSync(output),'NEW_INTERPRETATION_OUTPUT_REQUIRED');fs.mkdirSync(output,{recursive:true});const corpus=output+'/corpus',discovery=output+'/discovery';fs.mkdirSync(corpus);fs.mkdirSync(discovery);
 const sources=[],work=[],failures=[];
 for(const r of iterateMarketRunRecords(dir+'/journal',{owned:true})){if(r.type!=='V2_ACQUISITION_RESULT')continue;const {target,result}=r.payload;for(const[a,attempt]of result.attempts.entries()){
  const pages=attempt.page?[{page:attempt.page,pointer:`/result/attempts/${a}/page`},...(attempt.page.structuredResources??[]).map((page,i)=>({page,pointer:`/result/attempts/${a}/page/structuredResources/${i}`}))]:[];
  if(!pages.length)failures.push({taskId:target.id,recordHash:r.hash,reason:attempt.failure??result.reason??'NO_BODY'});
  for(const {page,pointer}of pages){const checked=validateBody(page);if(checked.status!==statuses.intact){failures.push({taskId:target.id,recordHash:r.hash,pointer,status:checked.status});continue;}
   const record={path:path.relative(process.cwd(),dir+'/journal/record-'+String(r.sequence).padStart(8,'0')+'.json'),hash:r.hash,sequence:r.sequence,pointer};
   const occurrence={id:hash([r.hash,pointer]),service:target.service,market:target.market,taskId:target.id,url:page.url,authority:page.authority,record};
   const geo=checkGeoChain({occurrence,bodyHash:checked.hash,attempt,sourcePage:page,executionReference:{path:record.path,recordHash:r.hash,pointer:`/result/attempts/${a}`}});
   let authority=page.authority?.status==='CONFIGURED_REVIEWED';if(page.authority?.status==='DERIVED_EXACT_RESOURCE'){try{authority=validateStructuredRelationship(page)===true;}catch{authority=false;}}
   let source=sources.find(s=>s.sha256===checked.hash);if(!source){source={key:'sha256:'+checked.hash,sha256:checked.hash,occurrences:[]};sources.push(source);}source.occurrences.push(occurrence);work.push({target,checked,occurrence,geo,authority});
  }
 }}
 const marketResources=new Map();
 for(const target of manifest.inventory){
  const refs=Array.isArray(target.marketProof?.sources)?target.marketProof.sources.filter(s=>Array.isArray(s?.occurrences)).slice(0,8):[];
  const combined=[...sources.filter(s=>s.occurrences.some(o=>o.taskId===target.id)),...refs];
  const dedup=[...new Map(combined.flatMap(s=>s.occurrences.map(o=>({sha256:s.sha256,occurrences:[o]}))).map(s=>[s.sha256+'|'+s.occurrences[0].id,s])).values()];
  const resources=loadMarketProofSources(dedup,target);marketResources.set(target.id,resources);
  for(const r of resources){if(work.some(w=>w.occurrence.id===r.occurrence.id))continue;
   let s=sources.find(s=>s.sha256===r.receipt.bodyHash);if(!s){s={sha256:r.receipt.bodyHash,key:'sha256:'+r.receipt.bodyHash,occurrences:[]};sources.push(s);}s.occurrences.push(r.occurrence);
   work.push({target,checked:{body:r.body,hash:r.receipt.bodyHash},occurrence:r.occurrence,geo:r.receipt.geo,authority:true});
  }
 }
 const candidates=[],bindings=[],analyses=[],priceIntelligence=[];for(const {target,checked,occurrence,geo,authority}of work){let raw;try{raw=extract(checked.body);}catch{failures.push({sourceOccurrenceId:occurrence.id,bodyHash:checked.hash,reason:'EXTRACTION_BOUND_OR_UNSUPPORTED_SOURCE'});continue;}const provider=inspectProviderMarket(checked.body,{bodyHash:checked.hash,sourceOccurrences:[occurrence]}),context={marketProofResources:marketResources.get(target.id),providerPolicy:true,geoPolicy:true,geoEvidence:[geo],authority,market:target.market,bodyHash:checked.hash,sourceOccurrenceIds:[occurrence.id],sourceOccurrences:[occurrence],sharedMarkets:unique(work.filter(w=>w.checked.hash===checked.hash).map(w=>w.target.market)),malformed:raw.diagnostics.malformedHtml};
 // Resolve only richer currency evidence; keep the normal ownership/role pipeline.
 const richer=deriveEvidence(checked.body,{...context,service:target.service,serviceCatalog:manifest.inventory,governingResources:loadGoverningResources(checked.body,occurrence,sources,bindings)});
 // Preserve price intelligence independently of the complete monthly identity.
 // Re-open the original receipt: discovery text cannot enter this path.
 if(authority){try{const b={bindingId:'price-intelligence:'+occurrence.id,sourceOccurrenceId:occurrence.id,bodyHash:checked.hash,taskId:target.id,record:occurrence.record};const loaded=loadLiveSource(occurrence,checked.hash,[b]);const source=prepareCommercialSource(loaded.body,checked.hash);priceIntelligence.push(...enrichOfferObservations(reconcilePriceObservations(richer.rows.map(c=>adjudicateProviderPrice(c,richer,loaded.receipt,{body:loaded.body,sourceUrl:occurrence.url,source}))),source,checked.hash).offers);}catch(e){failures.push({sourceOccurrenceId:occurrence.id,reason:'PRICE_INTELLIGENCE_FAILED_CLOSED',detail:e.message});}}
 for(const c of raw.candidates){const subject=richer.rows.find(r=>(r.subscriptionSubject||r.columnPlanTable||r.namedOfferDetails||r.attribution?.marketProof)&&r.structuredPath===c.structuredPath&&r.amountNormalized===c.amountNormalized);if(subject)Object.assign(c,subject);const r=richer.rows.find(r=>r.structuredPath===c.structuredPath&&r.amountNormalized===c.amountNormalized&&r.product===c.product&&r.currencyResolution);if(r){c.currency=r.currency;c.currencyResolution=r.currencyResolution;}}
 raw.candidates.push(...richer.rows.filter(r=>r.subscriptionFaq));
 const evaluate=x=>{if(x.subscriptionFaq||x.columnPlanTable||x.namedOfferDetails||x.attribution?.marketProof)return structuredClone(x);const attributed=attribute(x,{...context,providerEvidence:providerEvidenceFor(x,provider)});return grade(attributed,{...context,marketBound:attributed.attribution.marketApplicabilityEstablished});};
 // Verification reopens each occurrence using its literal currency token. Keep
 // token-distinct witnesses separate; monthly identities still normalize currency.
 const buckets=new Map();for(const c of raw.candidates){const k=JSON.stringify([c.product,c.amountNormalized,c.currency,c.currencyRaw,c.billingPeriod,c.qualifier,c.promotionOrTrial,c.structuralContainer,c.sourceType]);if(!buckets.has(k))buckets.set(k,[]);buckets.get(k).push(c);}
 const visible=new Set(raw.candidates.filter(c=>c.sourceType==='HTML'&&c.currency).map(c=>c.currency));
 for(const[k,items]of buckets){const c=items[0],g=evaluate(c),gs=items.map(evaluate);g.verificationLevel=Math.min(...gs.map(x=>x.verificationLevel));g.blockingReasons=unique(gs.flatMap(x=>x.blockingReasons));g.qualifierEvidence=items.flatMap(x=>x.qualifierEvidence??[]);g.qualifierPreservation={...g.qualifierPreservation,unresolved:unique(gs.flatMap(x=>x.qualifierPreservation?.unresolved??[]))};
  if(c.sourceType==='JSON'&&visible.size&&(visible.size>1||!visible.has(c.currency))){g.verificationLevel=Math.min(2,g.verificationLevel);g.blockingReasons.push('STRUCTURED_VISIBLE_CURRENCY_CONTEXT_CONFLICT');}
  if(raw.candidates.some(x=>x.amountNormalized===c.amountNormalized&&x.currency===c.currency&&x.normalizedEvidenceSnippet===c.normalizedEvidenceSnippet&&x.product!==c.product)){g.verificationLevel=Math.min(2,g.verificationLevel);g.ownershipAmbiguous=true;g.blockingReasons.push('REPEATED_TEXT_DIFFERENT_OWNERS');}
  if(raw.candidates.some(x=>x.product&&x.product===c.product&&x.currency===c.currency&&x.billingPeriod===c.billingPeriod&&x.promotionOrTrial===c.promotionOrTrial&&JSON.stringify(x.qualifier)===JSON.stringify(c.qualifier)&&x.amountNormalized!==c.amountNormalized)){g.verificationLevel=Math.min(2,g.verificationLevel);g.blockingReasons.push('MULTIPLE_CONFLICTING_FACTS');}
  // The monthly stage derives commercial semantics from the retained proof.
  // Do not freeze its intermediate classifier output as discovery input.
  if(g.subscriptionSubject||g.subscriptionFaq||g.columnPlanTable||g.namedOfferDetails||g.attribution?.marketProof)delete g.commercial;
  g.decisionReason=g.blockingReasons.join('|')||g.decisionReason;const candidateId='candidate:'+hash([occurrence.id,k]),factId='fact:'+hash(factKey({...g,service:g.subscriptionSubject?.targetService??target.service,market:target.market}));
  candidates.push({...g,candidateId,factId,observationId:occurrence.id,observationIds:[occurrence.id],service:g.subscriptionSubject?.targetService??target.service,market:target.market,sourceOccurrenceId:occurrence.id,sourceOccurrenceIds:[occurrence.id],bodyHash:checked.hash,bodyAvailable:true,sourceUrl:occurrence.url,occurrenceCount:items.length,discoveryOccurrences:items.map(x=>({structuredPath:x.structuredPath,coordinates:x.discoveryCoordinates})),exactHistoricalLocatorAvailable:false,quoteOccurrenceAmbiguous:false,sourceMappingAmbiguous:false,currencyAmbiguous:!c.currency,authorityEstablished:authority,productionVerified:false});
  bindings.push({bindingId:'binding:'+hash([candidateId,occurrence.id]),candidateId,factId,sourceOccurrenceId:occurrence.id,bodyHash:checked.hash,taskId:target.id,attemptId:geo.attemptId,record:occurrence.record});
 }analyses.push({sourceOccurrenceId:occurrence.id,bodyHash:checked.hash,geo,providerMarket:provider,candidateCount:raw.candidates.length,diagnostics:raw.diagnostics});checked.body=null;}
 const fm=new Map();for(const c of candidates){if(!fm.has(c.factId))fm.set(c.factId,{factId:c.factId,service:c.service,market:c.market,product:c.product,plan:c.plan,amountNormalized:c.amountNormalized,currency:c.currency,billingPeriod:c.billingPeriod,qualifier:c.qualifier,promotionOrTrial:c.promotionOrTrial,verificationLevel:c.verificationLevel,candidateIds:[],bodyHashes:[],attributionEvidence:[],productionVerified:false});const f=fm.get(c.factId);f.candidateIds.push(c.candidateId);f.bodyHashes.push(c.bodyHash);f.attributionEvidence.push({candidateId:c.candidateId,bodyHash:c.bodyHash,verificationLevel:c.verificationLevel,...c.attribution});f.verificationLevel=Math.max(f.verificationLevel,c.verificationLevel);}
 const facts=[...fm.values()].map(f=>({...f,candidateIds:unique(f.candidateIds),bodyHashes:unique(f.bodyHashes),marketEvidenceType:combineMarketEvidenceTypes(f.attributionEvidence.map(e=>e.marketEvidenceType))}));for(const f of facts)if(['CONFLICTING','UNRESOLVED','TASK_ONLY'].includes(f.marketEvidenceType))f.verificationLevel=Math.min(2,f.verificationLevel);
 const write=(d,n,x)=>fs.writeFileSync(d+'/'+n+'.json',JSON.stringify(x,null,2)+'\n',{flag:'wx'});write(corpus,'sources',{sources});write(output,'provider-price-intelligence',{priceEvidenceNeedsByTarget:Object.fromEntries(manifest.inventory.map(t=>[t.id,projectPriceEvidenceNeeds(t,priceIntelligence)]).filter(([,p])=>p)),version:1,observations:priceIntelligence,trustworthy:priceIntelligence.filter(p=>p.trustworthy).length,canonicalPromotion:false,offline:assertOffline()});
 write(output,'market-proof-research',{targets:Object.fromEntries(manifest.inventory.map(t=>[t.id,marketResearch(t,priceIntelligence,marketResources.get(t.id)??[])]))});
 const artifacts={manifest:{version:'LIVE_V2_DISCOVERY_INPUT',runId:manifest.id,capabilities:manifest.capabilities,productionVerified:false,historicalControlsNotInjected:true},candidates,facts,bindings,observations:analyses.map(a=>({id:a.sourceOccurrenceId,candidateCount:a.candidateCount})), 'sources-analyzed':analyses,'positive-controls':[],'historical-49':[],'concern-controls':[],summary:{candidateRows:candidates.length,factIdentities:facts.length,failures,offline:assertOffline()}};for(const[n,x]of Object.entries(artifacts))write(discovery,n,x);fs.writeFileSync(discovery+'/candidates.csv',csv(candidates),{flag:'wx'});
 // Bound DOM materialization to one canonical service/market domain. These domains
 // cannot share a canonical plan key; unioning their outputs does not select prices.
 const merged=Object.fromEntries(['candidates','facts','bindings','observations','sources-analyzed','monthly-plan-inventory','unresolved-monthly','canonical-conflicts','positive-controls','historical-49','concern-controls'].map(k=>[k,[]]));
 const keys=unique(candidates.map(c=>JSON.stringify([c.service,c.market])));fs.mkdirSync(output+'/shards');
 for(const [index,key]of keys.entries()){const selected=candidates.filter(c=>JSON.stringify([c.service,c.market])===key),ids=new Set(selected.map(c=>c.candidateId)),hashes=new Set(selected.map(c=>c.bodyHash)),shard=output+'/shards/'+String(index).padStart(4,'0');fs.mkdirSync(shard);fs.mkdirSync(shard+'/input');fs.mkdirSync(shard+'/corpus');
  for(const[n,x]of Object.entries(artifacts)){let v=x;if(n==='candidates')v=selected;else if(n==='facts')v=facts.filter(f=>f.candidateIds.some(id=>ids.has(id)));else if(n==='bindings')v=bindings.filter(b=>ids.has(b.candidateId));else if(n==='sources-analyzed')v=analyses.filter(a=>hashes.has(a.bodyHash));else if(n==='observations')v=[];write(shard+'/input',n,v);}
  write(shard+'/corpus','sources',{sources:sources.filter(s=>hashes.has(s.sha256))});runMonthly({inputDirectory:shard+'/input',corpusDirectory:shard+'/corpus',outputDirectory:shard+'/monthly',offerRoleRepair:true,componentOwnershipRepair:true});
  for(const n of Object.keys(merged))merged[n].push(...JSON.parse(fs.readFileSync(shard+'/monthly/'+n+'.json')));
 }
 fs.mkdirSync(output+'/monthly');for(const[n,x]of Object.entries(merged))write(output+'/monthly',n,x);
 const monthly={totalFacts:merged.facts.length,types:Object.fromEntries(unique(merged.facts.map(f=>f.commercial.type)).map(type=>[type,merged.facts.filter(f=>f.commercial.type===type).length])),monthlyPlanIdentities:merged['monthly-plan-inventory'].length,strongMonthlyPlanIdentities:merged['monthly-plan-inventory'].filter(p=>p.strongRecurringMonthly).length,sourceFailures:failures,offline:assertOffline(),productionVerified:false};write(output+'/monthly','summary',monthly);write(output+'/monthly','manifest',{version:'LIVE_V2_MONTHLY_UNION',runId:manifest.id,partition:'SERVICE_MARKET',partitions:keys,productionVerified:false});for(const name of ['candidates','monthly-plan-inventory'])fs.writeFileSync(output+'/monthly/'+name+'.csv',csv(merged[name]),{flag:'wx'});
 write(output,'currency-formatter-bindings',analyzeCurrencyResources({sources,candidates:merged.candidates,bindings:merged.bindings}));
 try{write(output,'code-dataflow-fallback',analyzeInterpretedRun(dir,output));}catch{write(output,'code-dataflow-fallback',{status:'UNRESOLVED',reason:'FALLBACK_ANALYSIS_FAILED_CLOSED',candidates:[],acquisitionPerformed:false});}
 write(output,'complete',{runId:manifest.id,monthlyStrong:monthly.strongMonthlyPlanIdentities,offline:assertOffline(),productionVerified:false});return {output,monthlyStrong:monthly.strongMonthlyPlanIdentities};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){try{console.log(JSON.stringify(interpret(process.argv[2])));}catch{console.error('V2_OFFLINE_REPLAY_FAILED; retained acquisition unchanged');process.exitCode=1;}}
