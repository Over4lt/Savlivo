import {childDiagnostic,operationsDiagnostic} from './diagnostics.mjs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
// Read-only targeting projection. The mature executor still owns research and admission.
import fs from 'node:fs';
import path from 'node:path';
import {inspectLifecycleInput} from '../research-v2/inventory/reviewed-cohort-handoff.mjs';
import {deploymentContract} from '../research-v2/storage/genesis-deployment.mjs';
import {safe,read,sha,stableBytes,digest,jsonDigest} from '../research-v2/storage/core.mjs';

export const presets = Object.freeze([
 ['ALL','All eligible'], ['UNRESOLVED','Unresolved'], ['HUMAN_REVIEW','Needs human review'],
 ['REVIEWED','Reviewed providers'], ['RETAINED','Retained work'],
]);
const unique = values => [...new Set(values)].sort();
const error = code => { throw Object.assign(new Error(code), {status:400}); };
const matchesPreset = (s,p) => p==='ALL'||(p==='UNRESOLVED'&&s.researchComplete!==true)||
 (p==='HUMAN_REVIEW'&&s.humanReview)||(p==='REVIEWED'&&s.reviewed)||(p==='RETAINED'&&s.retainedTargets>0);

export function projectTargeting({handoff,scopes,states={},latest=[],categories=[],identity}) {
 const ids=handoff.cohort.manifest.serviceIds, baseline=new Set(handoff.baselineIds);
 const reviewed=new Set(handoff.targets.map(t=>t.service)), labels=new Map(categories.map(c=>[c.id,c.name]));
 const rows=ids.map(id=>{
  const c=handoff.cohort.candidates.find(c=>c.slug===id);
  if(!c||baseline.has(id))error('TARGETING_COHORT_MISMATCH');
  const final=latest.find(s=>s.service_id===id), retained=Object.values(states).filter(s=>s.target?.service===id);
  const markets=unique(scopes[id]?.length?scopes[id]:c.markets??[]);
  if(markets.some(m=>! /^[A-Z]{2}$/.test(m)))error('TARGETING_MARKET_SCHEMA');
  return {service:id,name:c.name,aliases:c.aliases??[],providerNames:unique(handoff.targets.filter(t=>t.service===id).flatMap(t=>(t.authorities??[]).map(a=>a.provider).filter(Boolean))),
   eligible:true,selectable:true,markets,categories:unique(c.categories??(c.category?[c.category]:[])),
   reviewed:reviewed.has(id),humanReview:!reviewed.has(id)||!!final?.humanReview?.length,
   researchComplete:final?.researchComplete??null,retainedTargets:retained.length,
   state:final?.finalStatus??(reviewed.has(id)?'REVIEWED_READY':'HUMAN_REVIEW_REQUIRED')};
 });
 const facets=(key,label)=>unique(rows.flatMap(s=>s[key])).map(id=>({id,name:label(id),services:rows.filter(s=>s[key].includes(id)).length}));
 const countryNames=new Intl.DisplayNames(['en'],{type:'region'});
 const result={version:1,marketMeaning:'Investigation scopes, not verified availability or provider origin.',
  categoryMeaning:'Recorded frozen-universe categories; no inferred classifications.',
  presets:presets.map(([id,name])=>({id,name,services:rows.filter(s=>matchesPreset(s,id)).length})),
  facets:{markets:facets('markets',id=>countryNames.of(id)??id),categories:facets('categories',id=>labels.get(id)??id)},
  counts:{eligible:rows.length,baselineExcluded:baseline.size,reviewed:rows.filter(s=>s.reviewed).length,humanReview:rows.filter(s=>s.humanReview).length,
   retainedServices:rows.filter(s=>s.retainedTargets>0).length,retainedTargets:rows.reduce((n,s)=>n+s.retainedTargets,0),unscopedServices:rows.filter(s=>!s.markets.length).length},rows};
 return {...result,revision:digest({identity,result})};
}

export function loadTargeting(settings){
 const root=settings.repo, file=path.isAbsolute(settings.lifecycleInput??'')?path.relative(root,settings.lifecycleInput):settings.lifecycleInput;
 if(!file)error('TARGETING_REQUIRES_MATURE_LIFECYCLE');
 const config=read(safe(root,file));
 // Authenticate the root and every input consumed by this projection. The native
 // Execution validates the entire protected closure; browsing never scans it.
 // No snapshot creation/replay, transport, capability initialization or historical fallback.
 let genesis=null;
 if(config.productionGenesis){
  const g=read(safe(root,config.productionGenesis));
  if(!/^[a-f0-9]{64}$/.test(g.genesisHash??''))error('TARGETING_GENESIS_HASH');
  const bundle='.savlivo/research-v2/storage/deployment/'+g.genesisHash+'/manifest.json';
  const contract=deploymentContract(root,read(safe(root,bundle)),g.genesisHash);
  if(file!==g.lifecycle.productionInput||config.runsRoot!==g.lifecycle.executionRoot)error('TARGETING_GENESIS_NAMESPACE');
  const entry=g.protectedReferences.entries.find(e=>e.path===g.stateSource.path);
  const bytes=stableBytes(safe(root,g.stateSource.path));
  if(!entry||entry.sha256!==g.stateSource.sha256||sha(bytes)!==entry.sha256)error('TARGETING_STATE_HASH');
  const source=JSON.parse(bytes),{snapshotHash,...payload}=source;
  if(!snapshotHash||jsonDigest(payload)!==snapshotHash||digest(source.cohort)!==digest(g.cohort))error('TARGETING_STATE_SEAL');
  genesis={genesis:contract.genesis,source};
 }
 const handoff=inspectLifecycleInput(file,root);
 if(genesis){for(const [p,h]of Object.entries(handoff.inputHashes)){if(p===file){if(h!==genesis.genesis.lifecycle.productionInputHash)error('TARGETING_INPUT_HASH');continue;}if(p===config.productionGenesis)continue;if(genesis.genesis.protectedReferences.entries.find(e=>e.path===p)?.sha256!==h)error('TARGETING_DEPENDENCY_HASH');}}
 const scopes=config.researchScopes?read(safe(root,config.researchScopes)).researchMarkets:{};
 const states={...(genesis?.source.states??{})},latest=[],known=new Set(), fingerprints=[];
 const runs=safe(root,config.runsRoot);
 // Only this lifecycle's namespace. Never scan unrelated historical runs/control snapshots.
 const files=fs.existsSync(runs)?fs.readdirSync(runs).map(n=>config.runsRoot+'/'+n).filter(d=>fs.existsSync(safe(root,d+'/final-dispositions.json'))).sort((a,b)=>fs.statSync(safe(root,b+'/final-dispositions.json')).mtimeMs-fs.statSync(safe(root,a+'/final-dispositions.json')).mtimeMs||a.localeCompare(b)):[];
 for(const d of files){
  const lineage=read(safe(root,d+'/lineage.json'));
  if(digest(lineage.cohort)!==digest(handoff.cohort.manifest.serviceIds))error('TARGETING_RUN_COHORT');
  const finals=stableBytes(safe(root,d+'/final-dispositions.json'));
  fingerprints.push([d,sha(finals)]);
  for(const s of JSON.parse(finals).services??[]){if(!handoff.cohort.manifest.serviceIds.includes(s.service_id))error('TARGETING_RUN_SERVICE');if(!known.has(s.service_id)){latest.push(s);known.add(s.service_id);}}
  for(const phase of ['catalog','pricing']){const f=d+'/'+phase+'/adaptive-state.json';if(fs.existsSync(safe(root,f)))for(const [id,target]of Object.entries(read(safe(root,f)).targets??{})){if(!handoff.cohort.manifest.serviceIds.includes(target.service))error('TARGETING_TARGET_SERVICE');if(!states[id])states[id]={target};}}
 }
 // Existing canonical taxonomy is a JSON literal in the authenticated contracts input.
 const taxonomy='packages/contracts/src/catalog.ts';let categories=[];
 if(fs.existsSync(safe(root,taxonomy))){const bytes=stableBytes(safe(root,taxonomy));const expected=genesis?.genesis.protectedReferences.entries.find(e=>e.path===taxonomy);if(genesis&&(!expected||sha(bytes)!==expected.sha256))error('TARGETING_TAXONOMY_HASH');const literal=String(bytes).match(/export const catalogCategories = (\[[\s\S]*?\]) as const;/);if(literal)categories=JSON.parse(literal[1]);}
 return projectTargeting({handoff,scopes,states,latest,categories,identity:{inputs:handoff.inputHashes,genesis:genesis?.genesis.genesisHash??null,fingerprints}});
}

export function selectTargeting(model,value={}){
 if(!value||Array.isArray(value)||Object.keys(value).some(k=>!['preset','markets','categories','services','q'].includes(k)))error('INVALID_TARGETING');
 const preset=value.preset??'ALL', q=value.q??'', markets=value.markets??[],categories=value.categories??[],services=value.services??null;
 if(!presets.some(([id])=>id===preset)||typeof q!=='string'||q.length>200)error('INVALID_TARGETING');
 for(const [key,values]of [['markets',markets],['categories',categories]])if(!Array.isArray(values)||new Set(values).size!==values.length||values.some(v=>!model.facets[key].some(f=>f.id===v)))error('INVALID_TARGETING_FACET');
 if(services!==null&&(!Array.isArray(services)||new Set(services).size!==services.length||services.some(id=>!model.rows.some(s=>s.service===id&&s.eligible))))error('INVALID_LIFECYCLE_SELECTION');
 const matching=model.rows.filter(s=>s.eligible&&matchesPreset(s,preset)&&(!markets.length||s.markets.some(m=>markets.includes(m)))&&(!categories.length||s.categories.some(c=>categories.includes(c)))&&(!q||[s.name,s.service,...s.aliases,...s.providerNames].join(' ').toLowerCase().includes(q.toLowerCase())));
 const rows=matching.filter(s=>services===null||services.includes(s.service)).map(s=>({...s,researchMarkets:markets.length?s.markets.filter(m=>markets.includes(m)):s.markets}));
 return {revision:model.revision,targeting:{preset,markets:[...markets].sort(),categories:[...categories].sort(),q,services:services===null?null:[...services].sort()},
  matchingServices:matching.length,selectedServices:rows.length,serviceMarketTargets:rows.reduce((n,s)=>n+s.researchMarkets.length,0),unscopedServices:rows.filter(s=>!s.researchMarkets.length).length,
  matching,rows,services:rows.map(s=>s.service),researchMarkets:Object.fromEntries(rows.map(s=>[s.service,s.researchMarkets]))};
}

// Authenticate in a short-lived bounded process; retain only the compact read model
// in the HTTP process, never the 77 MB sealed source and its parsed graphs.
export function loadTargetingIsolated(settings){
 const child=spawnSync(process.execPath,['--expose-gc','--max-old-space-size=512','--import',import.meta.resolve('tsx'),fileURLToPath(import.meta.url),'--read-model'],{cwd:settings.repo,input:JSON.stringify({repo:settings.repo,lifecycleInput:settings.lifecycleInput}),encoding:'utf8',timeout:120000,maxBuffer:4*1024*1024,env:process.env});
 if(child.error||child.status!==0)throw Object.assign(Error('TARGETING_READ_MODEL_FAILED'),{code:child.error?.code,operationsDiagnostic:{...childDiagnostic(child),stage:'targeting-read-model'}});
 return JSON.parse(child.stdout);
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)&&process.argv[2]==='--read-model'){
 try{process.stdout.write(JSON.stringify(loadTargeting(JSON.parse(fs.readFileSync(0,'utf8')))));}catch(e){console.error(JSON.stringify(operationsDiagnostic(e,'targeting-read-model')));process.exitCode=1;}
}
