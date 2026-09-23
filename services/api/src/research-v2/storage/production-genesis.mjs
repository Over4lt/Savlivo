// New lineage from independently sealed sources; never a legacy exception.
import fs from 'node:fs';
import path from 'node:path';
import {canonical,digest,sha,safe,stableBytes,stableHash,jsonDigest,releaseValidationTemporaries,read,sealed,verifySeal} from './core.mjs';
import {closure} from './references.mjs';
import {inspectLifecycleInput} from '../inventory/reviewed-cohort-handoff.mjs';
import {resolveCapabilities} from '../capabilities/config.mjs';
import {lifecycleBudgets,lifecycleSeed} from '../inventory/lifecycle-continuation.mjs';
import {priceTargets} from '../inventory/reviewed-cohort-execution.mjs';
import {planResearch} from '../live/research-planner.mjs';
const schema='PRODUCTION_GENESIS_V1';
const fail=(code)=>{throw Error('GENESIS_'+code);};
function snapshot(root,file){const bytes=stableBytes(safe(root,file)),s=JSON.parse(bytes),{snapshotHash,...payload}=s;if(s.version!==1||!snapshotHash||jsonDigest(payload)!==snapshotHash)fail('INDEPENDENT_SEALED_SOURCE_REQUIRED');return {s,hash:sha(bytes)};}
function scope(root,input,source,expected){
 const h=inspectLifecycleInput(input,root),actual={cohort:h.cohort.manifest.serviceIds.length,baseline:h.baselineIds.length,reviewed:h.targets.length,retainedTargets:Object.keys(source.states??{}).length,historicalRequests:source.historicalRequests,parentRequests:source.parentRequests};
 if(digest(actual)!==digest(expected)||digest(source.cohort)!==digest(h.cohort.manifest.serviceIds)||source.cohort.some(id=>h.baselineIds.includes(id)))fail('SCOPE');
 // Validate each independently authenticated state file once per call, never once
 // per target. Retain only row references, not a cache of parsed state files.
 const groups=new Map();for(const [id,row]of Object.entries(source.states??{})){
  if(row.target?.id!==id||!source.cohort.includes(row.target.service)||!row.reference?.path)fail('STATE_PROVENANCE');
  const rows=groups.get(row.reference.path)??[];rows.push([id,row]);groups.set(row.reference.path,rows);
 }
 for(const [file,rows]of groups){releaseValidationTemporaries();const bytes=stableBytes(safe(root,file)),hash=sha(bytes),state=JSON.parse(bytes);
  for(const [id,row]of rows)if(hash!==row.reference.hash||digest(state.targets?.[id])!==digest(row.target))fail('STATE_PROVENANCE');
 }
 for(const parent of source.parents??[]){const summary=read(safe(root,parent.directory+'/summary.json')),p=parent.directory+'/network.jsonl',events=fs.existsSync(safe(root,p))?String(stableBytes(safe(root,p))).trim().split('\n').filter(Boolean).map(JSON.parse):[];if(summary.executionComplete!==true||summary.additionalRequests!==events.length||parent.requests!==events.length||events.some(e=>!source.cohort.includes(e.service)))fail('ACCOUNTING');}
 if((source.parents??[]).reduce((n,p)=>n+p.requests,0)!==source.parentRequests||h.summary.historicalRequests!==source.historicalRequests)fail('ACCOUNTING');
 return h;
}
function assertExclusions(entries,excluded){if(!Array.isArray(excluded)||!excluded.length||excluded.some(e=>!e.path||!/^[a-f0-9]{64}$/.test(e.sha256??'')||e.reason!=='UNSEALED_HISTORICAL_CONTROL_SNAPSHOT_NOT_USED_AS_GENESIS_INPUT'))fail('EXCLUSION_SCHEMA');if(entries.some(e=>excluded.some(x=>e.path===x.path||e.sha256===x.sha256)))fail('UNTRUSTED_INPUT');}
export function validateProductionGenesis(root,file,{full=true,onTiming=()=>{}}={}){
 let timingAt=performance.now();const timed=stage=>{const now=performance.now();onTiming({stage,durationMs:Math.round(now-timingAt)});timingAt=now;};
 const g=read(safe(root,file)),{genesisHash,...payload}=g;if(g.schema!==schema||genesisHash!==digest(payload)||g.lineage.kind!=='NEW_PRODUCTION_GENESIS'||g.lineage.continuesHistoricalSnapshot!==false)fail('SEAL');
 assertExclusions(g.protectedReferences.entries,g.excludedUntrustedHistoricalArtifacts);
 timed('genesis-seal');
 for(const e of g.protectedReferences.entries)if(stableHash(safe(root,e.path))!==e.sha256)fail('DEPENDENCY_HASH:'+e.path);
 timed('protected-file-hashes');
 const receipt=verifySeal(g.protectedReferences,'V2_FINALIZED_REFERENCES_V1');if(receipt.boundaryKind!==schema)fail('REFERENCE_BOUNDARY');
 if(full){const r=closure(root,g.sourceRoots,{genesisArchive:true});if(!r.complete)fail('CLOSURE:'+r.errors.join(';'));if(digest(r.entries.map(e=>[e.path,e.sha256]))!==digest(receipt.entries.map(e=>[e.path,e.sha256])))fail('CLOSURE_CHANGED');}
 timed('reference-closure');releaseValidationTemporaries();
 const source=snapshot(root,g.stateSource.path);if(source.hash!==g.stateSource.sha256)fail('SOURCE_HASH');const h=scope(root,g.lifecycle.originalInput,source.s,g.expected);
 timed('source-scope-accounting');
 if(digest(resolveCapabilities(h.config.capabilities))!==digest(g.capabilities)||digest(g.cohort)!==digest(source.s.cohort))fail('CAPABILITIES_OR_COHORT');
 const inputBytes=stableBytes(safe(root,g.lifecycle.productionInput));if(sha(inputBytes)!==g.lifecycle.productionInputHash)fail('PRODUCTION_INPUT_HASH');const config=JSON.parse(inputBytes);
 if(config.productionGenesis!==file||config.runsRoot!==g.lifecycle.executionRoot||config.runsRoot===h.config.runsRoot||digest(resolveCapabilities(config.capabilities))!==digest(g.capabilities))fail('NEW_EXECUTION_NAMESPACE');
 if(digest(g.budgets)!==digest(lifecycleBudgets(h)))fail('BUDGET_POLICY');
 timed('capabilities-budgets');
 return {root:path.resolve(root),genesis:g,source:source.s,handoff:h};
}
export function buildProductionGenesis({root,destination,snapshotPath,lifecycleInput,expected,excluded,createdAt,creationIdentity,versions}){
 if(!Number.isFinite(Date.parse(createdAt))||Date.parse(createdAt)>Date.now()+1000||!creationIdentity||!versions?.engine||!versions?.policy)fail('CREATION_IDENTITY');
 const dest=path.resolve(destination);if(dest===path.resolve(root)||dest.startsWith(path.resolve(root)+path.sep)||fs.existsSync(dest))fail('ISOLATED_NEW_DESTINATION_REQUIRED');
 const source=snapshot(root,snapshotPath),h=scope(root,lifecycleInput,source.s,expected);
 const sourceRoots=[{path:snapshotPath,format:'SNAPSHOT',classification:'PERMANENT_HISTORY',reason:'INDEPENDENT_SEALED_GENESIS_SOURCE'},{path:lifecycleInput,format:'JSON',classification:'PERMANENT_CANONICAL',reason:'FROZEN_LIFECYCLE'}];
 const r=closure(root,sourceRoots,{genesisArchive:true});if(!r.complete)fail('CLOSURE:'+JSON.stringify({errors:r.errors,owner:r.errorReference,field:r.errorField}));assertExclusions(r.entries,excluded);
 const id=digest({schema,source:source.hash,input:sha(stableBytes(safe(root,lifecycleInput))),createdAt,creationIdentity,versions}),file='.savlivo/research-v2/storage/genesis/'+id+'.json',productionInput='.savlivo/v2-operations-inputs/genesis-'+id+'.json',executionRoot='.savlivo/research-v2/production-runs/'+id;
 const capabilities=resolveCapabilities(h.config.capabilities),config={...h.config,capabilities,runsRoot:executionRoot,productionGenesis:file};
 const inputBytes=Buffer.from(canonical(config)),entries=r.entries.map(({identity,...e})=>e);
 const protectedReferences=sealed({schema:'V2_FINALIZED_REFERENCES_V1',boundaryKind:schema,complete:true,runId:'genesis:'+id,createdAt,versions,cohort:source.s.cohort,baseline:h.baselineIds,capabilities,roots:sourceRoots,entries,rootGeneration:r.rootGeneration,unknownRequiredDependencies:0});
 const records=[];const add=(field,value,sourcePath,sourceHash,resolution='INDEPENDENTLY_AUTHENTICATED')=>records.push({field,reconstructedValueHash:digest(value),independentSource:sourcePath,independentSourceHash:sourceHash,productionRequired:true,genesisResolution:resolution});
 for(const c of h.cohort.candidates)add('identity.'+c.slug,c,h.config.universe,h.inputHashes[h.config.universe]);
 for(const t of h.targets)add('reviewedAuthority.'+t.service,t,h.config.reviewedBindings,h.inputHashes[h.config.reviewedBindings]);
 for(const [id,row]of Object.entries(source.s.states)){add('retainedTarget.'+id,row.target,row.reference.path,row.reference.hash);for(const dimension of ['authorities','catalogEligibility','catalogCapabilityProofs','verified','quarantinedVerified','researchMemory'])add('retainedTarget.'+id+'.'+dimension,row.target[dimension]??null,row.reference.path,row.reference.hash,row.target[dimension]===undefined?'UNKNOWN_NOT_INVENTED':'INDEPENDENTLY_AUTHENTICATED');}
 for(const [id,rows]of Object.entries(source.s.sources))add('sources.'+id,rows,snapshotPath,source.hash);
 for(const field of ['quarantine','historicalRequests','parentRequests','parents'])add(field,source.s[field],snapshotPath,source.hash);
 add('capabilities',capabilities,lifecycleInput,h.inputHashes[lifecycleInput],'CURRENT_EXPLICIT_GENESIS_PERMISSIONS_NOT_HISTORICAL_USAGE');
 const budgets=lifecycleBudgets(h);add('newRunBudget',budgets,lifecycleInput,h.inputHashes[lifecycleInput],'NEW_BOUNDED_RUN_NOT_RESUMED_ALLOCATION');
 const payload={schema,genesisIdentity:id,createdAt,creationIdentity,versions,lineage:{kind:'NEW_PRODUCTION_GENESIS',continuesHistoricalSnapshot:false},sourceRoots,stateSource:{path:snapshotPath,sha256:source.hash},lifecycle:{originalInput:lifecycleInput,productionInput,productionInputHash:sha(inputBytes),executionRoot},cohort:source.s.cohort,baselineExcluded:h.baselineIds,expected,capabilities,budgets,historicalCapabilityUsage:null,accounting:{historicalRequests:source.s.historicalRequests,parentRequests:source.s.parentRequests,parents:source.s.parents,meaning:'IMPORTED_AUTHENTICATED_HISTORY_NOT_NEW_RUN_BUDGET'},quarantineReferences:source.s.quarantine,fieldProvenance:records,protectedReferences,excludedUntrustedHistoricalArtifacts:excluded};
 const g={...payload,genesisHash:digest(payload)};
 fs.mkdirSync(dest,{recursive:false});
 for(const e of entries){const from=safe(root,e.path),to=safe(dest,e.path);fs.mkdirSync(path.dirname(to),{recursive:true});fs.copyFileSync(from,to,fs.constants.COPYFILE_EXCL);if(sha(stableBytes(to))!==e.sha256)fail('EXPORT_RACE');}
 for(const [p,bytes]of [[productionInput,inputBytes],[file,Buffer.from(canonical(g))]]){const target=safe(dest,p);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,bytes,{flag:'wx',mode:0o600});}
 validateProductionGenesis(dest,file);
 const manifest=sealed({schema:'PRODUCTION_GENESIS_EXPORT_V1',genesis:file,genesisHash:g.genesisHash,productionInput,files:[...entries.map(e=>({path:e.path,sha256:e.sha256,bytes:e.bytes,classification:e.classification})),{path:productionInput,sha256:sha(inputBytes),bytes:inputBytes.length,classification:'PERMANENT_CANONICAL'},{path:file,sha256:sha(canonical(g)),bytes:Buffer.byteLength(canonical(g)),classification:'PERMANENT_CANONICAL'}],sourceFootprintInspected:r.logicalBytes,brokenReferences:0});
 fs.writeFileSync(path.join(dest,'genesis-export.json'),canonical(manifest),{flag:'wx'});return {genesis:g,manifest};
}
export function validateGenesisExport(root){const m=verifySeal(read(safe(root,'genesis-export.json')),'PRODUCTION_GENESIS_EXPORT_V1');for(const e of m.files)if(stableHash(safe(root,e.path))!==e.sha256)fail('EXPORT_HASH');const result=validateProductionGenesis(root,m.genesis);if(result.genesis.genesisHash!==m.genesisHash)fail('EXPORT_GENESIS_HASH');return result;}
export function prepareGenesisActions(validated){
 const {genesis:g,source,handoff:h}=validated;if(!validated.root)fail('ISOLATED_ROOT_REQUIRED');const markets=h.config.researchScopes?read(safe(validated.root,h.config.researchScopes)).researchMarkets:{};
 for(const c of h.cohort.candidates)if(!markets[c.slug]?.length&&c.markets?.length)markets[c.slug]=[...c.markets];
 const targets=[...h.targets,...priceTargets(h.targets,markets,g.cohort)].map(t=>lifecycleSeed({...t,capabilities:g.capabilities},source));
 return {cohort:g.cohort.length,baselineExcluded:g.baselineExcluded.length,reviewed:h.targets.length,retainedTargets:Object.keys(source.states).length,budget:lifecycleBudgets(h),requestsConsumed:0,executionStarted:false,plans:targets.map(t=>({target:t.id,service:t.service,market:t.market,plan:planResearch(t)}))};
}
