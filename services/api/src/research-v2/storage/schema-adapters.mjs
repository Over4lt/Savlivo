// Recognize versioned contracts, never grant path semantics by field name alone.
import path from 'node:path';
import {safe,read,sha,stableBytes,files} from './core.mjs';
const stages=['IDENTITY_SUBSCRIPTION','MARKETS','LOGIN','MANAGEMENT','CANCELLATION','PRICING','VALIDATION'];
// Keep unchanged subgraphs shared with the parsed document; validate every locator.
function adaptLocators(v){
 if(Array.isArray(v)){const rows=v.map(adaptLocators);return rows.every((x,i)=>x===v[i])?v:rows;}
 if(!v||typeof v!=='object')return v;
 let changed=false;const rows=Object.entries(v).map(([k,x])=>{
  if(k==='path'&&typeof x==='string'&&x.startsWith('$/')){if(!/^\$(?:\/[a-zA-Z0-9_:@#.-]+(?:\[\d+\])?)+$/.test(x))throw Error('STORAGE_DOM_LOCATOR_SCHEMA');changed=true;return ['domLocator',x];}
  const value=adaptLocators(x);if(value!==x)changed=true;return [k,value];
 });return changed?Object.fromEntries(rows):v;
}
function priorInterpretations(root,target,base,references){
 if(!target?.providerInterpretations)return target;
 if(!Array.isArray(target.providerInterpretations))throw Error('STORAGE_PRIOR_INTERPRETATIONS_SCHEMA');
 return {...target,providerInterpretations:target.providerInterpretations.map(p=>{if(p.runDirectory==null)return p;safe(root,p.runDirectory);if(typeof p.url!=='string'||!Array.isArray(p.blockers))throw Error('STORAGE_PRIOR_INTERPRETATIONS_SCOPE');if(!p.runDirectory.startsWith(base+'/direct-acquisitions/direct-')){if(!target.id)throw Error('STORAGE_PRIOR_INTERPRETATIONS_SCOPE');const m=read(safe(root,p.runDirectory+'/manifest.json'));if(!target.id||m.version!=='RESEARCH_V2_LIVE_V1'||!m.inventory?.some(t=>t.id===target.id&&t.service===target.service&&t.market===target.market))throw Error('STORAGE_PRIOR_INTERPRETATIONS_SCOPE');}references.push({path:p.runDirectory,format:'TREE',classification:'REFERENCED_EVIDENCE',reason:'PRIOR_PROVIDER_INTERPRETATION'});const {runDirectory,...rest}=p;return rest;})};
}
export function adaptDocument(root,value,owner){
 if(value?.version===1&&value.productionGenesis&&value.cohortManifest&&value.universe&&value.frozenHashes){if(!/^\.savlivo\/research-v2\/storage\/genesis\/[a-f0-9]{64}\.json$/.test(value.productionGenesis))throw Error('STORAGE_GENESIS_INPUT_PATH');const {productionGenesis,...rest}=value;return {value:rest,references:[{path:productionGenesis,format:'JSON',classification:'PERMANENT_CANONICAL',reason:'PRODUCTION_GENESIS_TRUST_ROOT'}],schema:'GENESIS_LIFECYCLE_INPUT_V1'};}
 if(/\/services\/[a-z0-9-]+\/result\.json$/.test(owner)&&value?.productionPromoted===false&&value.stages&&typeof value.service==='string'){
  const run=path.posix.dirname(path.posix.dirname(path.posix.dirname(owner))),checkpointPath=run+'/checkpoint.json',checkpoint=read(safe(root,checkpointPath)),entry=checkpoint.services?.[value.service];
  if(checkpoint.version!==1||!entry||JSON.stringify(entry.stages)!==JSON.stringify(value.stages)||owner!==run+'/services/'+value.service+'/result.json')throw Error('STORAGE_CONTROLLER_RESULT_SCHEMA');
  const mapped={};for(const [stage,result]of Object.entries(value.stages)){if(!stages.includes(stage))throw Error('STORAGE_CONTROLLER_RESULT_SCHEMA');if(result.artifact!==undefined&&result.artifact!==`services/${value.service}/${stage}.json`)throw Error('STORAGE_CONTROLLER_ARTIFACT_SCOPE');mapped[stage]={...result,...(result.artifact?{artifact:run+'/'+result.artifact}:{})};}
  return {value:{...value,stages:mapped},references:[{path:checkpointPath,format:'JSON',classification:'PERMANENT_HISTORY',reason:'CONTROLLER_RESULT_CHECKPOINT'}],schema:'CONTROLLER_SERVICE_RESULT_V1'};
 }
 if(owner.endsWith('/summary.json')&&value?.cohort===188&&Array.isArray(value.serviceResults)&&JSON.stringify(value.stages)===JSON.stringify(stages)&&value.productionPromoted===false&&value.priceRequiredForCatalogEligibility===false){
  const run=path.posix.dirname(owner),checkpointPath=run+'/checkpoint.json',checkpoint=read(safe(root,checkpointPath));if(checkpoint.version!==1||value.serviceResults.length!==Object.keys(checkpoint.services).length)throw Error('STORAGE_CONTROLLER_SUMMARY_SCHEMA');
  const serviceResults=value.serviceResults.map(row=>{if(JSON.stringify(row.stages)!==JSON.stringify(checkpoint.services?.[row.service]?.stages))throw Error('STORAGE_CONTROLLER_SUMMARY_SCHEMA');const mapped={};for(const [stage,result]of Object.entries(row.stages)){if(!stages.includes(stage)||result.artifact!==undefined&&result.artifact!==`services/${row.service}/${stage}.json`)throw Error('STORAGE_CONTROLLER_ARTIFACT_SCOPE');mapped[stage]={...result,...(result.artifact?{artifact:run+'/'+result.artifact}:{})};}return {...row,stages:mapped};});
  return {value:{...value,serviceResults},references:[{path:checkpointPath,format:'JSON',classification:'PERMANENT_HISTORY',reason:'CONTROLLER_SUMMARY_CHECKPOINT'}],schema:'CONTROLLER_SUMMARY_V1'};
 }
 if(/\/services\/[a-z0-9-]+\/operations\/[a-f0-9]{64}\.json$/.test(owner)&&value?.kind==='READ'&&value.status==='COMPLETE'&&value.result?.bodyFile){
  if(path.posix.basename(owner)!==sha(JSON.stringify([value.kind,value.key]))+'.json'||value.result.bodyFile!==`bodies/${value.result.bodyHash}.txt`||!/^[a-f0-9]{64}$/.test(value.result.bodyHash??''))throw Error('STORAGE_CONTROLLER_OPERATION_SCHEMA');
  const {bodyFile,...result}=value.result;return {value:{...value,result:{...result,bodyReference:{path:path.posix.dirname(path.posix.dirname(owner))+'/'+bodyFile,sha256:result.bodyHash}}},references:[],schema:'CONTROLLER_READ_OPERATION_V1'};
 }
 if(owner.endsWith('/reviewed-continuation-states.json')&&value&&typeof value==='object'){
  const manifestPath=path.posix.dirname(owner)+'/reviewed-continuation.json',manifest=read(safe(root,manifestPath));if(manifest.schemaVersion!==1||manifest.mode!=='REVIEWED_ONLINE_CONTINUATION'||manifest.statesFile!==owner||manifest.inputHashes?.[owner]!==sha(stableBytes(safe(root,owner))))throw Error('STORAGE_REVIEWED_STATES_SCHEMA');
  const references=[],states={};for(const [id,t]of Object.entries(value)){if(t.id!==id||!Array.isArray(t.reads)||t.reads.length!==0||!t.continuationPriorUsage?.source?.path)throw Error('STORAGE_REVIEWED_STATES_SCHEMA');states[id]=priorInterpretations(root,t,path.posix.dirname(owner),references);}
  references.push({path:manifestPath,format:'JSON',classification:'PERMANENT_HISTORY',reason:'REVIEWED_STATES_FINGERPRINT'});
  return {value:states,references,schema:'REVIEWED_CONTINUATION_STATES_V1'};
 }
 if(owner.endsWith('/retained-reconciliation.json')&&value?.schemaVersion===1&&value.mode==='OFFLINE_REPLAY_ONLY'&&Array.isArray(value.services)){
  const a=adaptDocument(root,{cohort:value.services,reconciliation:value},path.posix.dirname(owner)+'/lineage.json');return {value:a.value.reconciliation,references:a.references,schema:'RETAINED_RECONCILIATION_V1'};
 }
 if(owner.endsWith('/provider-workbook-input.json')&&value?.sheet==='Provider Homepage Candidates'){
  if(typeof value.source!=='string'||!value.source.endsWith('.xlsx')||!/^[a-f0-9]{64}$/.test(value.sha256??'')||!Array.isArray(value.rows)||value.rows.length!==188||new Set(value.rows.map(r=>r.service_id)).size!==188||value.rows.some(r=>typeof r.service_id!=='string'))throw Error('STORAGE_PROVIDER_WORKBOOK_EXTRACT_SCHEMA');
  const {source,...rest}=value;return {value:rest,references:[],schema:'PROVIDER_HOMEPAGE_WORKBOOK_EXTRACT_V1',provenanceOnly:['source']};
 }
 if(owner.endsWith('/acquisition-budget/discovery-journal.jsonl')&&value?.type==='DIRECT_INTERPRETED'&&Number.isSafeInteger(value.sequence)&&typeof value.target==='string'&&Array.isArray(value.blockers)){
  const base=path.posix.dirname(path.posix.dirname(owner));safe(root,value.runDirectory);if(!value.runDirectory.startsWith(base+'/direct-acquisitions/direct-'))throw Error('STORAGE_DISCOVERY_JOURNAL_SCOPE');const {runDirectory,...rest}=value;return {value:rest,references:[{path:runDirectory,format:'TREE',classification:'REFERENCED_EVIDENCE',reason:'DIRECT_INTERPRETED_DISCOVERY_EVENT'}],schema:'DIRECT_INTERPRETED_DISCOVERY_EVENT_V1'};
 }
 if(value?.status==='REJECTED_INVALID_PRICE_INTERPRETATION'&&value.originalVerified?.version==='V2_FIELD_VERIFICATION_V1'&&value.source&&value.sourceHash){const a=adaptDocument(root,{schemaVersion:1,scope:'EXACT_RETAINED_INTERPRETATIONS_ONLY',entries:[value]},owner);return {value:a.value.entries[0],references:a.references,schema:'EXACT_RETAINED_INTERPRETATION_DECISION_V1'};}
 if(owner.endsWith('/reconciled-pricing-projection.json')&&value?.meaning==='OFFLINE_RECONCILED_EVIDENCE_NOT_SCHEDULER_CHECKPOINT'&&value.productionPromoted===false&&value.targets){
  if(typeof value.source!=='string'||!value.source.endsWith('/pricing/adaptive-state.json')||sha(stableBytes(safe(root,value.source)))!==value.sourceHash)throw Error('STORAGE_PRICING_PROJECTION_SOURCE');
  const original=read(safe(root,value.source)),adapted=adaptDocument(root,{...original,targets:value.targets},value.source),{source,sourceHash,...rest}=value;
  return {value:{...rest,targets:adapted.value.targets,sourceReference:{path:source,sha256:sourceHash}},references:adapted.references,schema:'RECONCILED_PRICING_PROJECTION_V1'};
 }
 if(owner.endsWith('/lineage.json')&&value?.reconciliation?.schemaVersion===1&&value.reconciliation.mode==='OFFLINE_REPLAY_ONLY'&&Array.isArray(value.cohort)){
  const r=value.reconciliation;if(!Array.isArray(r.services)||!r.sources||r.services.some(id=>!value.cohort.includes(id))||JSON.stringify(Object.keys(r.sources).sort())!==JSON.stringify([...r.services].sort()))throw Error('STORAGE_RECONCILIATION_SCHEMA');
  const sources=Object.entries(r.sources).map(([service,directory])=>{safe(root,directory);if(directory!==r.parentDirectory+'/bootstrap/'+service)throw Error('STORAGE_RECONCILIATION_SOURCE_SCOPE');return {service,directory};});
  return {value:{...value,reconciliation:{...r,sources}},references:[],schema:'RECONCILED_CONTINUATION_LINEAGE_V1'};
 }
 if(owner.endsWith('/open-web-discovery/state.json')&&value?.version===1&&Array.isArray(value.targets)&&value.usage&&value.cache){const references=[];return {value:{...value,targets:value.targets.map(t=>priorInterpretations(root,t,path.posix.dirname(owner),references))},references,schema:'OPEN_WEB_STATE_V1'};}
 if(owner.endsWith('/open-web-discovery/journal.jsonl')&&value?.type==='PROVIDER_INTERPRETATION'&&typeof value.target==='string'&&value.outcome){const references=[],t=priorInterpretations(root,{providerInterpretations:[value.outcome]},path.posix.dirname(owner),references);return {value:{...value,outcome:t.providerInterpretations[0]},references,schema:'OPEN_WEB_PROVIDER_INTERPRETATION_EVENT_V1'};}
 if(value?.version==='RESEARCH_V2_LIVE_V1'&&owner.endsWith('/manifest.json')&&owner.includes('/direct-acquisitions/direct-')&&Array.isArray(value.inventory)&&value.productionVerified===false){
  const base=owner.slice(0,owner.lastIndexOf('/direct-acquisitions/'));
  const inventory=value.inventory.map(t=>({...t,...(t.reads?{reads:t.reads.map(p=>{if(!p.bodyFile)return p;if(p.bodyFile!==`bodies/${p.bodyHash}.txt`||!/^[a-f0-9]{64}$/.test(p.bodyHash??''))throw Error('STORAGE_LIVE_MANIFEST_BODY_SCOPE');const {bodyFile,...rest}=p;return {...rest,bodyReference:{path:base+'/'+bodyFile,sha256:p.bodyHash}};})}:{})}));
  const references=[];return {value:{...value,inventory:inventory.map(t=>priorInterpretations(root,t,base,references))},references,schema:'RESEARCH_V2_DIRECT_MANIFEST_V1'};
 }
 if(/\/adaptive-state(?: 2)?\.json$/.test(owner)&&value?.version===1&&value.targets&&Array.isArray(value.serviceOrder)&&Array.isArray(value.initialIds)&&value.services){
  const base=path.posix.dirname(owner),references=[],targets={};
  for(const [id,target]of Object.entries(value.targets)){
   if(target.id!==id||!/^[a-z0-9-]+$/i.test(id))throw Error('STORAGE_ADAPTIVE_TARGET_SCHEMA');
   const reads=(target.reads??[]).map(p=>{if(!p.bodyFile)return p;if(p.bodyFile!==`bodies/${p.bodyHash}.txt`||!/^[a-f0-9]{64}$/.test(p.bodyHash??''))throw Error('STORAGE_ADAPTIVE_BODY_SCOPE');const location=base+'/targets/'+id+'/open-web-discovery/'+p.bodyFile;if(sha(stableBytes(safe(root,location)))!==p.bodyHash)throw Error('STORAGE_ADAPTIVE_BODY_HASH');const {bodyFile,...rest}=p;return {...rest,bodyReference:{path:location,sha256:p.bodyHash}};});
   const providerInterpretations=(target.providerInterpretations??[]).map(p=>{if(!p.runDirectory)return p;safe(root,p.runDirectory);
    if(!p.runDirectory.startsWith(base+'/targets/'+id+'/')){const m=read(safe(root,p.runDirectory+'/manifest.json'));if(m.version!=='RESEARCH_V2_LIVE_V1'||!m.inventory?.some(t=>t.id===id&&t.service===target.service&&t.market===target.market))throw Error('STORAGE_ADAPTIVE_CHILD_SCOPE');}
    references.push({path:p.runDirectory,format:'TREE',classification:'REFERENCED_EVIDENCE',reason:'ADAPTIVE_PROVIDER_INTERPRETATION'});const {runDirectory,...rest}=p;return rest;});
   targets[id]={...target,...(target.reads?{reads}:{}),...(target.providerInterpretations?{providerInterpretations}:{})};
  }
  return {value:{...value,targets},references,schema:'ADAPTIVE_CAMPAIGN_STATE_V1'};
 }
 if(typeof value?.factId==='string'&&value.factId.startsWith('fact:')&&Array.isArray(value.candidateIds)&&Array.isArray(value.bodyHashes)&&Array.isArray(value.attributionEvidence)&&value.productionVerified===false){
  const adapted=adaptDocument(root,{version:'V2_FIELD_VERIFICATION_V1',fact:value},owner);return {value:adapted.value.fact,references:[],schema:'OFFLINE_RECOVERY_FACT_V1'};
 }
 if(typeof value?.robotsUrl==='string'&&value.rule?.path!==undefined){
  if(!/^https?:\/\//.test(value.robotsUrl)||!['allow','disallow'].includes(value.rule.directive)||typeof value.rule.path!=='string'||!value.rule.path.startsWith('/'))throw Error('STORAGE_ROBOTS_RULE_SCHEMA');
  const {path:robotsPattern,...rest}=value.rule;return {value:{...value,rule:{...rest,robotsPattern}},references:[],schema:'ROBOTS_ACCESS_DECISION_V1'};
 }
 if(value?.version===1&&/^[a-f0-9]{64}$/.test(value.bodyHash??'')&&Array.isArray(value.records)&&Array.isArray(value.diagnostics)&&value.records.every(r=>typeof r.pattern==='string'&&Array.isArray(r.fields)&&Array.isArray(r.scopePaths))){
  const adapted=adaptDocument(root,{version:'V2_FIELD_VERIFICATION_V1',records:value.records},owner);return {value:{...value,records:adapted.value.records},references:[],schema:'PROVIDER_MARKET_ANALYSIS_V1'};
 }
 if(Number.isFinite(value?.value)&&['DAY','WEEK','MONTH','YEAR'].includes(value?.unit)&&typeof value.originalWording==='string'&&typeof value.recurringPresentation==='boolean'&&/^[a-f0-9]{64}$/.test(value.bodyHash??'')&&typeof value.path==='string'&&value.path.startsWith('$/')){
  if(!/^\$(?:\/[a-zA-Z0-9_:@#.-]+(?:\[\d+\])?)+$/.test(value.path))throw Error('STORAGE_DOM_LOCATOR_SCHEMA');const {path:domLocator,...rest}=value;return {value:{...rest,domLocator},references:[],schema:'COMMERCIAL_BILLING_INTERVAL_V1'};
 }
 if(/\/price-[a-f0-9]{64}\.json$/.test(owner)&&value?.channel==='DIRECT_PROVIDER'&&typeof value.acquired==='boolean'&&Array.isArray(value.verified)&&Array.isArray(value.blockers)){
  const base=path.posix.dirname(owner),directory=value.runDirectory;safe(root,directory);
  if(!directory.startsWith(base+'/direct-acquisitions/direct-')||directory.slice((base+'/direct-acquisitions/').length).includes('/'))throw Error('STORAGE_DIRECT_INTERPRETATION_SCOPE');
  const {runDirectory,...rest}=value;return {value:rest,references:[{path:directory,format:'TREE',classification:'REFERENCED_EVIDENCE',reason:'DIRECT_INTERPRETATION_CHILD'}],schema:'DIRECT_INTERPRETATION_RESULT_V1'};
 }
 if(value?.version==='MARKET_RUN_STORE_V1'&&/\/journal\/record-\d{8}\.json$/.test(owner)){
  const {hash,...payload}=value;
  if(sha(JSON.stringify(payload))!==hash||!Number.isSafeInteger(value.sequence)||value.sequence<1||!owner.endsWith('/record-'+String(value.sequence).padStart(8,'0')+'.json'))throw Error('STORAGE_JOURNAL_HASH');
  const references=[];
  if(value.sequence>1){const previous=path.posix.dirname(owner)+'/record-'+String(value.sequence-1).padStart(8,'0')+'.json',record=read(safe(root,previous));if(record.hash!==value.previous)throw Error('STORAGE_JOURNAL_CHAIN');references.push({path:previous,format:'JSON',classification:'REFERENCED_EVIDENCE',reason:'JOURNAL_PREVIOUS'});}else if(value.previous!==null)throw Error('STORAGE_JOURNAL_CHAIN');
  if(value.type!=='V2_ACQUISITION_RESULT')return {value,references,schema:'MARKET_RUN_STORE_V1'};
  const attempts=value.payload?.result?.attempts;if(!Array.isArray(attempts))throw Error('STORAGE_ACQUISITION_RECORD_SCHEMA');
  const page=p=>{if(!p)return p;const {bodyFile,...rest}=p;if(bodyFile){if(!/^bodies\/[a-f0-9]{64}\.txt$/.test(bodyFile)||typeof p.rawSource?.text!=='string'||sha(p.rawSource.text)!==p.bodyHash)throw Error('STORAGE_INLINE_BODY_INTEGRITY');}return {...rest,...(p.structuredResources?{structuredResources:p.structuredResources.map(page)}:{})};};
  let target=value.payload.target;
  if(target?.reads?.some(p=>p.bodyFile)){
   const split=owner.lastIndexOf('/direct-acquisitions/');if(split<0)throw Error('STORAGE_JOURNAL_TARGET_SCOPE');const base=owner.slice(0,split);
   target={...target,reads:target.reads.map(p=>{if(!p.bodyFile)return p;if(p.bodyFile!==`bodies/${p.bodyHash}.txt`||!/^[a-f0-9]{64}$/.test(p.bodyHash??''))throw Error('STORAGE_JOURNAL_TARGET_SCOPE');const {bodyFile,...rest}=p;return {...rest,bodyReference:{path:base+'/'+bodyFile,sha256:p.bodyHash}};})};
  }
  if(target?.providerInterpretations){const split=owner.lastIndexOf('/direct-acquisitions/');if(split<0)throw Error('STORAGE_JOURNAL_TARGET_SCOPE');target=priorInterpretations(root,target,owner.slice(0,split),references);}
  return {value:{...value,payload:{...value.payload,...(target?{target}:{}),result:{...value.payload.result,attempts:attempts.map(a=>({...a,...(a.page?{page:page(a.page)}:{})}))}}},references,schema:'MARKET_RUN_STORE_V1_INLINE_ACQUISITION'};
 }
 if(value?.version==='EXPERIMENTAL_MONTHLY_DOMAIN_V1'&&value.method==='READ_ALL_PERSISTED_CANDIDATES_AND_HASH_VERIFIED_OWNING_SOURCE_STRUCTURE_NO_REEXTRACTION'&&owner.endsWith('/monthly/manifest.json')){
  const base=path.posix.dirname(path.posix.dirname(owner)),input=base+'/input',corpus=base+'/corpus';
  for(const [v,expected]of [[value.inputDirectory,input],[value.corpusDirectory,corpus]])if(typeof v!=='string'||v.includes('..')||!(v===expected||path.isAbsolute(v)&&v.endsWith('/'+expected)))throw Error('STORAGE_MONTHLY_INPUT_SCOPE');
  if(!value.inputHashes||!/^[a-f0-9]{64}$/.test(value.sourceIndexHash))throw Error('STORAGE_MONTHLY_SCHEMA');
  const refs=Object.entries(value.inputHashes).map(([name,hash])=>{if(!/^[a-z0-9-]+\.json$/.test(name)||!/^[a-f0-9]{64}$/.test(hash))throw Error('STORAGE_MONTHLY_SCHEMA');return {path:input+'/'+name,sha256:hash,format:'JSON',classification:'REFERENCED_EVIDENCE',reason:'MONTHLY_V1_HASHED_INPUT'};});
  refs.push({path:corpus+'/sources.json',sha256:value.sourceIndexHash,format:'JSON',classification:'REFERENCED_EVIDENCE',reason:'MONTHLY_V1_SOURCE_INDEX'});
  const {inputDirectory,corpusDirectory,inputHashes,...rest}=value;
  return {value:rest,references:refs,schema:'EXPERIMENTAL_MONTHLY_DOMAIN_V1'};
 }
 if(owner.endsWith('/provider-price-intelligence.json')&&value?.version===1&&value.canonicalPromotion===false&&Array.isArray(value.observations)){
  const adapted=adaptDocument(root,{version:'V2_FIELD_VERIFICATION_V1',observations:value.observations},owner);
  return {value:{...value,observations:adapted.value.observations},references:[],schema:'PROVIDER_PRICE_INTELLIGENCE_V1'};
 }
 if(value?.version==='V2_FIELD_VERIFICATION_V1'||(value?.version===2&&typeof value.requestedMarket==='string'&&typeof value.productOwnershipEstablished==='boolean'&&typeof value.marketApplicabilityEstablished==='boolean')||(typeof value?.candidateId==='string'&&typeof value?.structuredPath==='string'&&typeof value?.rawEvidenceSnippet==='string'&&/^[a-f0-9]{64}$/.test(value?.bodyHash??'')&&['HTML','JSON','SCRIPT_LITERAL'].includes(value.sourceType))){
  return {value:adaptLocators(value),references:[],schema:'V2_FIELD_VERIFICATION_V1'};
 }
 if(owner.endsWith('/checkpoint.json')&&value?.version===1&&value.services&&typeof value.fingerprint==='string'&&['requests','searches','reads'].every(k=>Number.isSafeInteger(value[k]))){
  // new-service-controller V1 stores stage artifacts relative to its run,
  // not relative to the repository's services/ source directory.
  const run=path.posix.dirname(owner),manifestPath=run+'/run-manifest.json',manifest=read(safe(root,manifestPath));
  if(manifest.version!==1||manifest.fingerprint!==value.fingerprint||JSON.stringify(manifest.stages)!==JSON.stringify(stages)||!Array.isArray(manifest.cohort)||JSON.stringify(Object.keys(value.services))!==JSON.stringify(manifest.cohort))throw Error('STORAGE_CONTROLLER_CHECKPOINT_SCHEMA');
  const services={};
  for(const [id,service]of Object.entries(value.services)){
   if(service.id!==id||!/^[a-z0-9-]+$/.test(id)||!service.stages)throw Error('STORAGE_CONTROLLER_CHECKPOINT_SCHEMA');
   const mapped={};
   for(const [stage,result]of Object.entries(service.stages)){
    if(!stages.includes(stage))throw Error('STORAGE_CONTROLLER_CHECKPOINT_SCHEMA');
    if(result.artifact===undefined){if(result.status!=='FAILED')throw Error('STORAGE_CONTROLLER_CHECKPOINT_SCHEMA');mapped[stage]=result;continue;}
    if(result.artifact!==`services/${id}/${stage}.json`)throw Error('STORAGE_CONTROLLER_ARTIFACT_SCOPE');
    const target=run+'/'+result.artifact;stableBytes(safe(root,target));
    mapped[stage]={...result,artifact:target};
   }
   services[id]={...service,stages:mapped};
  }
  return {value:{...value,services},references:[{path:manifestPath,format:'JSON',classification:'PERMANENT_HISTORY',reason:'CONTROLLER_CHECKPOINT_V1_SCHEMA'}],schema:'CONTROLLER_CHECKPOINT_V1'};
 }
 if(owner.endsWith('/discovery-input.json')&&value?.mainSheet==='V15 Gate'){
  const manifestPath=path.posix.dirname(owner)+'/manifest.json',m=read(safe(root,manifestPath));
  if(m.version!==1||m.authorityBootstrap!==1||m.scope!=='NEW_SERVICES_ONLY'||m.inputHashes?.[owner]!==sha(stableBytes(safe(root,owner)))||m.workbookSha256!==value.sha256||!/^[a-f0-9]{64}$/.test(value.sha256)||typeof value.source!=='string'||!value.source.endsWith('.xlsx')||value.rows?.length!==215||!Array.isArray(value.sidepoolRows))throw Error('STORAGE_DISCOVERY_EXTRACT_SCHEMA');
  // The frozen extraction contains all input rows; prepare-v15-new-services reads
  // rows/mainSheet/sha256, never source. Keep original bytes, ignore only this
  // authenticated historical locator for filesystem traversal/portability.
  const {source,...data}=value;
  return {value:data,references:[{path:manifestPath,sha256:sha(stableBytes(safe(root,manifestPath))),format:'JSON',classification:'PERMANENT_CANONICAL',reason:'FROZEN_WORKBOOK_EXTRACT_AUTHENTICATION'}],schema:'FROZEN_DISCOVERY_WORKBOOK_EXTRACT_V1',provenanceOnly:['source']};
 }

 if(value?.version==='V2_ADDITIVE_CANDIDATES_V1'){
  if(!Array.isArray(value.existing)||!Array.isArray(value.exclude))throw Error('STORAGE_ADDITIVE_SCHEMA');
  const references=[];
  function transform(v){if(Array.isArray(v))return v.map(transform);if(!v||typeof v!=='object')return v;const result={};for(const [k,x]of Object.entries(v)){
   if((k==='reference'||k==='marketAuthority')&&typeof x==='string'&&/^(docs|packages)\//.test(x)){
    const [p,...fragment]=x.split('#');safe(root,p);if(!/\.(json|ts)$/.test(p))throw Error('STORAGE_ADDITIVE_REFERENCE');
    references.push({path:p,format:p.endsWith('.ts')?'CODE':'JSON',classification:'PERMANENT_HISTORY',reason:owner+':'+k});
    result[k+'Locator']=fragment.join('#');
   }else result[k]=transform(x);
  }return result;}
  return {value:transform(value),references,schema:'V2_ADDITIVE_CANDIDATES_V1'};
 }
 if(value?.schemaVersion===1&&value.scope==='EXACT_RETAINED_INTERPRETATIONS_ONLY'){
  if(!Array.isArray(value.entries))throw Error('STORAGE_QUARANTINE_SCHEMA');
  const entries=value.entries.map(e=>{
   if(typeof e.source!=='string'||!e.source.endsWith('/adaptive-state.json')||!/^[a-f0-9]{64}$/.test(e.sourceHash)||e.status!=='REJECTED_INVALID_PRICE_INTERPRETATION')throw Error('STORAGE_QUARANTINE_SCHEMA');
   safe(root,e.source);const {source,sourceHash,...rest}=e;
   if(rest.originalVerified?.version!=='V2_FIELD_VERIFICATION_V1')throw Error('STORAGE_QUARANTINE_VERIFICATION_SCHEMA');
   function locators(v){if(Array.isArray(v))return v.map(locators);if(!v||typeof v!=='object')return v;const result={};for(const [k,x]of Object.entries(v)){
    if(k==='path'&&typeof x==='string'&&x.startsWith('$/')){if(!/^\$(?:\/[a-zA-Z0-9_:@#.-]+(?:\[\d+\])?)+$/.test(x))throw Error('STORAGE_DOM_LOCATOR_SCHEMA');result.domLocator=x;}
    else result[k]=locators(x);
   }return result;}
   return {...rest,originalVerified:locators(rest.originalVerified),sourceReference:{path:source,sha256:sourceHash}};
  });return {value:{...value,entries},references:[],schema:'EXACT_RETAINED_INTERPRETATIONS_V1'};
 }
 if(value?.version!==1||value?.authorityBootstrap!==1||value?.scope!=='NEW_SERVICES_ONLY')return {value,references:[],schema:null};
 if(!Array.isArray(value.serviceIds)||new Set(value.serviceIds).size!==value.expectedServices||value.serviceIds.length!==value.expectedServices||!value.inputHashes||!value.outputHashes)throw Error('STORAGE_DISCOVERY_MANIFEST_SCHEMA');
 const c=value.controller;
 if(c?.version!==1||JSON.stringify(c.stages)!==JSON.stringify(stages)||c.automaticAuthorityGrants!==false||c.unknownEvidenceRemainsUnresolved!==true||c.entrypoint!=='docs/catalog/global-47/research-v2/run-v15-full-v2.mjs')throw Error('STORAGE_DISCOVERY_CONTROLLER_SCHEMA');
 safe(root,c.entrypoint);
 const references=[{path:c.entrypoint,format:'CODE',classification:'PERMANENT_HISTORY',reason:owner+':controller.entrypoint (historical code provenance, not an execution instruction)'}];
 for(const [name,hash]of Object.entries(value.outputHashes)){
  if(!/^[a-z0-9-]+\.json$/.test(name)||!/^[a-f0-9]{64}$/.test(hash))throw Error('STORAGE_DISCOVERY_OUTPUT_SCHEMA');
  references.push({path:owner.slice(0,owner.lastIndexOf('/')+1)+name,sha256:hash,format:'JSON',classification:'PERMANENT_HISTORY',reason:owner+':outputHashes'});
 }
 // Preserve scanning of every other field, including unknown future path-bearing fields.
 const {entrypoint,...controller}=c;
 return {value:{...value,controller,outputHashes:undefined},references,schema:'DISCOVERY_MANIFEST_V1_AUTHORITY_BOOTSTRAP_1'};
}

// The legacy snapshot contract fingerprints inputHashes. Source bodyFile is relative
// to its acquisition directory, NOT the directory containing the snapshot itself.
export function adaptSnapshot(root,snapshot){
 if(snapshot.version!==1||!snapshot.inputHashes||!Array.isArray(snapshot.cohort)||!snapshot.sources||!Array.isArray(snapshot.parents))throw Error('STORAGE_LIFECYCLE_SNAPSHOT_SCHEMA');
 const locals=new Map();
 const local=p=>{if(locals.has(p))return locals.get(p);const original=p;if(p.startsWith(root+'/'))p=p.slice(root.length+1);safe(root,p);locals.set(original,p);return p;};
 const inputHashes=snapshot.inputHashes;
 const sources=Object.fromEntries(Object.entries(snapshot.sources).map(([service,items])=>{
  if(!snapshot.cohort.includes(service)||!Array.isArray(items))throw Error('STORAGE_LIFECYCLE_SOURCE_SCOPE');
  return [service,items.map(item=>{
   const {directory,page,...unknown}=item;local(directory);
   if(!page||typeof page!=='object')throw Error('STORAGE_LIFECYCLE_SOURCE_SCHEMA');
   const {bodyFile,...fields}=page;
   if(!bodyFile)return {...unknown,page:fields};
   if(!/^bodies\/[a-f0-9]{64}\.txt$/.test(bodyFile)||!/^[a-f0-9]{64}$/.test(page.bodyHash))throw Error('STORAGE_LIFECYCLE_BODY_REFERENCE');
   const raw=directory+'/'+bodyFile,p=local(raw);
   if((inputHashes[raw]??inputHashes[p])!==page.bodyHash)throw Error('STORAGE_LIFECYCLE_BODY_NOT_FINGERPRINTED');
   return {...unknown,page:{...fields,bodyReference:{path:p,sha256:page.bodyHash}}};
  })];
 }));
 const parents=snapshot.parents.map(p=>{const {directory,...rest}=p;local(directory);return rest;});
 function stateReferences(v){
  if(Array.isArray(v)){const rows=v.map(stateReferences);return rows.every((x,i)=>x===v[i])?v:rows;}if(!v||typeof v!=='object')return v;
  if(v.version==='V2_FIELD_VERIFICATION_V1'){
   v=adaptLocators(v);
  }
  const result={};for(const [k,x]of Object.entries(v))if(k!=='bodyFile'){
   if(k==='quarantinedVerified'){
    if(!Array.isArray(x))throw Error('STORAGE_QUARANTINE_STATE_SCHEMA');
    result[k]=x.map(row=>{const {decision,...rest}=row;const q=adaptDocument(root,{schemaVersion:1,scope:'EXACT_RETAINED_INTERPRETATIONS_ONLY',entries:[decision]},'snapshot-quarantine').value.entries[0];return {...stateReferences(rest),decision:stateReferences(q)};});
   }else if(k==='rule'&&v.robotsUrl&&x?.path!==undefined){
    if(!/^https?:\/\//.test(v.robotsUrl)||!['allow','disallow'].includes(x.directive)||typeof x.path!=='string'||!x.path.startsWith('/'))throw Error('STORAGE_ROBOTS_RULE_SCHEMA');
    const {path:robotsPattern,...rest}=x;result.rule={...stateReferences(rest),robotsPattern};
   }else result[k]=stateReferences(x);
  }
  if(v.bodyFile){
   const matches=Object.values(snapshot.sources).flat().filter(s=>s.page?.bodyFile===v.bodyFile&&s.page?.bodyHash===v.bodyHash&&s.page?.url===v.url);
   if(!matches.length)throw Error('STORAGE_LIFECYCLE_STATE_BODY_UNRESOLVED');
   result.bodyReferences=matches.map(s=>({path:local(s.directory+'/'+s.page.bodyFile),sha256:v.bodyHash}));
  }return Object.keys(result).length===Object.keys(v).length&&Object.keys(result).every(k=>Object.hasOwn(v,k)&&result[k]===v[k])?v:result;
 }
 const states=Object.fromEntries(Object.entries(snapshot.states).map(([id,state])=>{
  const target=state.target;if(!target?.providerInterpretations)return [id,state];
  if(!Array.isArray(target.providerInterpretations))throw Error('STORAGE_PROVIDER_INTERPRETATION_SCHEMA');
  const providerInterpretations=target.providerInterpretations.map(item=>{
   if(item.runDirectory==null)return item;
   if(typeof item.url!=='string'||!/^https?:\/\//.test(item.url)||!Array.isArray(item.blockers)||typeof item.needsGeo!=='boolean')throw Error('STORAGE_PROVIDER_INTERPRETATION_SCHEMA');
   const directory=local(item.runDirectory);
   if(!snapshot.parents.some(p=>directory.startsWith(local(p.directory)+'/'))||!directory.includes('/direct-acquisitions/direct-'))throw Error('STORAGE_CHILD_RUN_SCOPE');
   const expected=Object.keys(inputHashes).filter(p=>local(p).startsWith(directory+'/')).map(local).sort();
   const actual=files(root,directory).sort();
   if(!expected.length||JSON.stringify(expected)!==JSON.stringify(actual))throw Error('STORAGE_CHILD_RUN_NOT_FINGERPRINTED');
   const {runDirectory,...rest}=item;
   return {...rest,childRunReferences:expected.map(p=>({path:p,sha256:inputHashes[p]??inputHashes[root+'/'+p]}))};
  });return [id,{...state,target:{...target,providerInterpretations}}];
 }));
 const quarantine=adaptDocument(root,{schemaVersion:1,scope:'EXACT_RETAINED_INTERPRETATIONS_ONLY',entries:snapshot.quarantine??[]},'snapshot-quarantine').value.entries;
 return stateReferences({...snapshot,sources,parents,states,quarantine});
}
