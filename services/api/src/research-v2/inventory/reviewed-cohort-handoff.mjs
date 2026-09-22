// Thin cohort/evidence adapter to the existing reviewed-authority and adaptive V2 path.
// No authority inference, transport or automatic review approval.
import fs from 'node:fs';
import path from 'node:path';
import {loadCohort,json,digest,runDirectory} from './new-service-controller.mjs';
import {prepareAuthorityUniverse} from './provider-authority-bootstrap.mjs';
import {loadProviderSourceRegistry} from '../live/provider-source-registry.mjs';
import {officialCandidate} from '../live/online-discovery.mjs';
import {validateDirectProviderPage} from '../live/direct-provider-evidence.mjs';
import {reconcileProviderInput,writeProviderReviewBatch} from './provider-review-input.mjs';
export const handoffDirectory='docs/catalog/global-47/research-v2/v15-mature-handoff-20260921';
export const previousAuthority='.savlivo/research-v2/universe-expansion/provider-authority-bootstrap-20260918T230000';
export const additionalRequestLimit=36; // Two existing objectives × (four reads × four HTTP + two searches).
const read=p=>json(p),shaFile=p=>digest(fs.readFileSync(p));
export function baseTargets(candidates){return candidates.map(c=>({id:c.slug+'-catalog',service:c.slug,serviceName:c.name,scope:c.disposition,market:null,marketApplicabilityEstablished:false,currency:null,urls:[],authorities:[],researchObjective:'CATALOG_ONLY',smartResearch:{version:2,navigationDepth:3},gaps:['LOGIN','WEB_MANAGEMENT']}));}
export function reviewedTargets(candidates,document,root=process.cwd()) {
 const universe={new_include:candidates.filter(c=>c.disposition==='NEW_INCLUDE'),research:candidates.filter(c=>c.disposition==='RESEARCH')};
 return prepareAuthorityUniverse({universe,targets:baseTargets(candidates),document,root});
}
export function admitRetained({target,page,directory,registry}) {
 const decision=officialCandidate(target,{url:page.url,label:'consumer subscription account pricing',method:'RETAINED_PROVIDER'},registry.domains);
 if(!decision.eligible)return {accepted:false,reason:decision.reason};
 const authority=target.authorities.find(a=>a.hostname===new URL(page.url).hostname&&a.provider===target.serviceName);
 if(!authority)return {accepted:false,reason:'EXACT_PROVIDER_BINDING_REQUIRED'};
 try {
  // Explicit reviewed ownership reclassifies a retained source; acquisition timestamps/policy/hash stay intact.
  const rebound={...page,sourceType:authority.sourceType,authority:{status:'CONFIGURED_REVIEWED',...authority},authorityReconciliation:{previous:page.authority??null,ownershipReview:authority.ownershipReview,originalCheckedAt:page.checkedAt}};
  validateDirectProviderPage({target,page:rebound,directory});
  return {accepted:true,page:rebound};
 }catch(e){return {accepted:false,reason:e.message};}
}
export function retainedCandidate(c,p) {
 // Review queue prioritization ONLY; this predicate cannot create an authority.
 const identity=(p.observations??[]).filter(o=>o.fact==='identity').map(o=>o.quote??'').join(' ');
 const norm=s=>s.normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');
 const name=norm(c.name),host=norm(new URL(p.url).hostname),published=norm(identity);
 const cues=[name,...c.aliases??[]].map(norm).filter(s=>s.length>=3);
 return p.outcome==='OK'&&p.httpStatus===200&&!!p.bodyFile&&cues.some(n=>host.includes(n)||published.includes(n));
}
export function inspectHandoff({root=process.cwd(),document}={}) {
 const cohort=loadCohort(root),old=path.join(root,runDirectory),checkpoint=read(old+'/checkpoint.json'),manifest=read(old+'/run-manifest.json');
 if(Object.keys(checkpoint.services).join('|')!==cohort.manifest.serviceIds.join('|')||manifest.cohort.join('|')!==cohort.manifest.serviceIds.join('|'))throw Error('HANDOFF_COHORT_CHANGED');
 const ledger=fs.readFileSync(old+'/network.jsonl','utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
 if(ledger.length!==checkpoint.requests||ledger.some(e=>!checkpoint.services[e.service]))throw Error('HANDOFF_REQUEST_ACCOUNTING');
 const inherited=read(path.join(root,previousAuthority,'reviewed-provider-bindings.json'));
 const priorManifest=read(path.join(root,previousAuthority,'manifest.json'));
 if(shaFile(path.join(root,previousAuthority,'reviewed-provider-bindings.json'))!==priorManifest.outputHashes['reviewed-provider-bindings.json'])throw Error('HANDOFF_HISTORICAL_REVIEW_CHANGED');
 const existing=inherited.bindings.filter(b=>cohort.candidates.some(c=>c.slug===b.service&&c.name===b.serviceName));
 const reviews=document??{schemaVersion:1,scope:'SHADOW_RESEARCH_ONLY',bindings:existing};
 const derived=reviewedTargets(cohort.candidates,reviews,root),registry=loadProviderSourceRegistry({targets:derived.launchTargets,root});
 const files=[runDirectory+'/checkpoint.json',runDirectory+'/network.jsonl',runDirectory+'/run-manifest.json',previousAuthority+'/reviewed-provider-bindings.json'];
 const rows=[],reuse={SAFELY_REUSABLE:0,AFTER_AUTHORITY_REVIEW:0,UNSUITABLE:0,REQUIRES_FRESH_ACQUISITION:0};
 for(const c of cohort.candidates){
  const relative=runDirectory+'/services/'+c.slug,dir=path.join(root,relative),pages=read(dir+'/pages.json');files.push(relative+'/pages.json');
  const target=derived.launchTargets.find(t=>t.service===c.slug),candidates=[],materials=[];
  pages.forEach((p,i)=>{
   if(p.bodyFile){if(!/^bodies\/[a-f0-9]{64}\.txt$/.test(p.bodyFile))throw Error('HANDOFF_BODY_PATH');files.push(relative+'/'+p.bodyFile);if(shaFile(dir+'/'+p.bodyFile)!==p.bodyHash)throw Error('HANDOFF_BODY_CHANGED');}
   const plausible=retainedCandidate(c,p);if(plausible)candidates.push({pageIndex:i,url:p.url,host:new URL(p.url).hostname,bodyHash:p.bodyHash,evidence:{format:'NATIVE_PUBLIC_PAGE_V1',path:relative+'/pages.json',sha256:shaFile(dir+'/pages.json'),pageIndex:i,sourceUrl:p.url,locator:null,excerpt:null},meaning:'REVIEW_CANDIDATE_NOT_AUTHORITY'});
   const admission=target?admitRetained({target,page:p,directory:dir,registry}):{accepted:false,reason:'OWNERSHIP_UNPROVEN'};
   const category=admission.accepted?'SAFELY_REUSABLE':p.outcome!=='OK'?'REQUIRES_FRESH_ACQUISITION':plausible?'AFTER_AUTHORITY_REVIEW':'UNSUITABLE';reuse[category]++;
   materials.push({pageIndex:i,url:p.url,bodyHash:p.bodyHash??null,category,reason:admission.reason??'EXISTING_DIRECT_PROVIDER_VALIDATOR_PASSED',plausibleIdentityCue:plausible});
  });
  const distinct=new Set(candidates.map(p=>p.host));
  const status=target?'REVIEWED_READY':c.researchInput?.identityReviewRequired||distinct.size>1?'AMBIGUOUS_REVIEW_REQUIRED':candidates.length?'CANDIDATE_AWAITING_REVIEW':'UNRESOLVED';
  rows.push({service:c.slug,name:c.name,status,reason:target?'EXISTING_EXACT_SERVICE_REVIEW_REUSED':c.researchInput?.identityReviewRequired?'INPUT_IDENTITY_REVIEW_REMAINS':distinct.size>1?'MULTIPLE_EXACT_HOST_CANDIDATES_NOT_AUTOMATICALLY_MERGED':candidates.length?'RETAINED_IDENTITY_CUE_ONLY':'NO_QUALIFYING_RETAINED_IDENTITY_CUE',researchMarketHints:c.markets,candidates,materials});
 }
 const inputHashes=Object.fromEntries([...new Set(files)].sort().map(f=>[f,shaFile(path.join(root,f))]));
 const counts=Object.fromEntries(['REVIEWED_READY','CANDIDATE_AWAITING_REVIEW','AMBIGUOUS_REVIEW_REQUIRED','UNRESOLVED'].map(s=>[s,rows.filter(r=>r.status===s).length]));
 const inputFile=path.join(root,handoffDirectory,'provider-workbook-input.json');
 let providerInput;
 if(fs.existsSync(inputFile)){
  const correctionsFile=path.join(root,handoffDirectory,'provider-input-corrections.json');
  const findingsFile=path.join(root,handoffDirectory,'pending-review-findings.json');
  providerInput=reconcileProviderInput({input:read(inputFile),corrections:fs.existsSync(correctionsFile)?read(correctionsFile):{},findings:fs.existsSync(findingsFile)?read(findingsFile):{},cohort,rows,document:reviews,root});
  rows.splice(0,rows.length,...providerInput.rows);
  // Discovery guidance changes must not silently retain an old continuation fingerprint.
  inputHashes[handoffDirectory+'/provider-workbook-input.json']=shaFile(inputFile);
  if(fs.existsSync(correctionsFile))inputHashes[handoffDirectory+'/provider-input-corrections.json']=shaFile(correctionsFile);
  if(fs.existsSync(findingsFile))inputHashes[handoffDirectory+'/pending-review-findings.json']=shaFile(findingsFile);
  if(providerInput.summary.counts.CONFLICT)throw Error('HANDOFF_REVIEWED_BINDING_CONFLICT: '+rows.filter(r=>r.status==='CONFLICT').map(r=>r.service).join(','));
 }
 return {cohort,document:reviews,targets:derived.launchTargets,rows,inputHashes,summary:{cohort:188,baselineExcluded:275,bindings:providerInput?.summary.counts??counts,retainedOnlyDispositionCounts:counts,providerInput:providerInput?.summary,retainedMaterials:reuse,historicalRequests:ledger.length,historicalSearches:checkpoint.searches,historicalReads:checkpoint.reads,fullCohortLiveReady:counts.REVIEWED_READY===188,networkCalls:0,additionalRequestCeiling:derived.launchTargets.length*additionalRequestLimit,maximumAfterAllReviews:188*additionalRequestLimit,priceMarketScope:'Operator research scope or retained verified applicability required; spreadsheet hints are not availability',reviewRequired:counts.REVIEWED_READY<188}};
}
export function prepareHandoff(root=process.cwd()) {
 const dir=path.join(root,handoffDirectory);fs.mkdirSync(dir,{recursive:true});
 if(!fs.existsSync(dir+'/research-scope.json'))fs.writeFileSync(dir+'/research-scope.json',JSON.stringify({researchMarkets:{}},null,2)+'\n',{flag:'wx'});
 const file=dir+'/reviewed-provider-bindings.json',report=inspectHandoff({root,document:fs.existsSync(file)?read(file):undefined});
 // Never overwrite operator review decisions on repeated preparation.
 if(!fs.existsSync(file))fs.writeFileSync(file,JSON.stringify(report.document,null,2)+'\n',{flag:'wx'});
 for(const [name,value]of Object.entries({'review-worklist.json':report.rows,'preflight.json':report.summary,'source-manifest.json':{version:1,cohort:report.cohort.manifest.serviceIds,inputHashes:report.inputHashes,reviewHash:shaFile(file),historicalRequests:report.summary.historicalRequests}}))fs.writeFileSync(dir+'/'+name,JSON.stringify(value,null,2)+'\n');
 writeProviderReviewBatch(dir,report);
 return report;
}

// Generic frozen-universe input to the same reviewed target handoff.
export function inspectLifecycleInput(file,root=process.cwd()){
 const readAt=f=>read(path.resolve(root,f)),hashAt=f=>shaFile(path.resolve(root,f));
 const config=readAt(file),manifest=readAt(config.cohortManifest),universe=readAt(config.universe),document=readAt(config.reviewedBindings),ids=manifest.serviceIds,candidates=[...universe.new_include,...universe.research];
 if(config.version!==1||!config.frozenHashes||Object.entries(config.frozenHashes).some(([f,h])=>hashAt(f)!==h)||!config.frozenHashes[config.cohortManifest]||!config.frozenHashes[config.universe])throw Error('LIFECYCLE_FROZEN_INPUT');
 if(!/^\.savlivo\/research-v2\/[a-zA-Z0-9/_-]+$/.test(config.runsRoot)||config.runsRoot.includes('..'))throw Error('LIFECYCLE_OUTPUT_SCOPE');
 const baseline=universe.existing.map(s=>s.service??s.slug);if(!Array.isArray(ids)||ids.length!==manifest.expectedServices||new Set(ids).size!==ids.length||ids.some(id=>baseline.includes(id))||digest([...ids].sort())!==digest(candidates.map(c=>c.slug).sort()))throw Error('LIFECYCLE_COHORT_SCOPE');
 const aliases=new Map();for(const c of candidates){if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(c.slug))throw Error('LIFECYCLE_ID');for(const label of [c.slug,c.name,...c.aliases??[]]){const k=label.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');if(aliases.has(k)&&aliases.get(k)!==c.slug)throw Error('LIFECYCLE_ALIAS_COLLISION');aliases.set(k,c.slug);}}
 if(config.executionServices!==undefined&&(!Array.isArray(config.executionServices)||!config.executionServices.length||new Set(config.executionServices).size!==config.executionServices.length||config.executionServices.some(id=>!ids.includes(id))))throw Error('LIFECYCLE_EXECUTION_SCOPE');
 const derived=reviewedTargets(candidates,document,root),work=config.providerWorklist?readAt(config.providerWorklist):[],rows=ids.map(id=>({service:id,providerReview:work.find(w=>w.service===id)?.providerReview??{}}));
 if(work.some(w=>!ids.includes(w.service))||new Set(work.map(w=>w.service)).size!==work.length)throw Error('LIFECYCLE_CANDIDATE_SCOPE');
 if(config.productionGenesis&&!/^\.savlivo\/research-v2\/storage\/genesis\/[a-f0-9]{64}\.json$/.test(config.productionGenesis))throw Error('LIFECYCLE_GENESIS_PATH');
 let historicalRequests=0;const files=[file,config.cohortManifest,config.universe,config.reviewedBindings,...[config.providerWorklist,config.researchScopes,config.quarantineFile,config.productionGenesis].filter(Boolean)];
 if(config.legacyDirectory){const ledger=config.legacyDirectory+'/network.jsonl',checkpoint=config.legacyDirectory+'/checkpoint.json',events=fs.readFileSync(path.resolve(root,ledger),'utf8').trim().split('\n').filter(Boolean).map(JSON.parse),state=readAt(checkpoint);if(events.some(e=>!ids.includes(e.service))||state.requests!==events.length)throw Error('LIFECYCLE_LEGACY_LEDGER');historicalRequests=events.length;files.push(ledger,checkpoint);}
 return {config,baselineIds:baseline,cohort:{manifest,candidates},document,targets:derived.launchTargets.filter(t=>!config.executionServices||config.executionServices.includes(t.service)),rows:rows.filter(r=>!config.executionServices||config.executionServices.includes(r.service)),inputHashes:Object.fromEntries(files.map(f=>[path.relative(root,path.resolve(root,f)),hashAt(f)])),summary:{cohort:ids.length,baselineExcluded:baseline.length,historicalRequests}};
}
