import {childDiagnostic} from './diagnostics.mjs';
import {resolveCapabilities} from '../research-v2/capabilities/config.mjs';
// Control-plane adapter only: preflight and execution use the CLI's mature entrypoint.
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {safePath,hash,json} from './artifacts.mjs';
// Full Genesis validation is cohort-wide even for a single selected service.
export const nativeCheckTimeoutMs=600_000;
export function lifecyclePlan(settings,input,selection=null){
 const preparationStarted=performance.now();
 if(input.objective!=='MATURE_LIFECYCLE'||!['FULL_CATALOG','UNRESOLVED_ONLY','SELECTED_SERVICES'].includes(input.scope))throw Error('LIFECYCLE_REQUIRES_FROZEN_COHORT');
 if(!settings.lifecycleInput)throw Error('LIFECYCLE_INPUT_NOT_CONFIGURED');
 const source=safePath(settings.repo,settings.lifecycleInput),sourceConfig=json(source),ids=json(safePath(settings.repo,sourceConfig.cohortManifest)).serviceIds;
 let selected=ids;
 if(input.scope==='SELECTED_SERVICES'){selected=input.services;if(!Array.isArray(selected)||!selected.length||new Set(selected).size!==selected.length||selected.some(id=>!ids.includes(id)))throw Error('INVALID_LIFECYCLE_SELECTION');selected=ids.filter(id=>selected.includes(id));}
 // Unresolved-only uses the engine's explicit researchComplete flag, never a UI inference.
 if(input.scope==='UNRESOLVED_ONLY'){const root=safePath(settings.repo,sourceConfig.runsRoot);const finals=fs.existsSync(root)?fs.readdirSync(root).map(n=>path.join(root,n,'final-dispositions.json')).filter(f=>fs.existsSync(f)).sort((a,b)=>fs.statSync(b).mtimeMs-fs.statSync(a).mtimeMs):[];const complete=new Set();const seen=new Set();for(const f of finals)for(const s of json(f)?.services??[]){if(seen.has(s.service_id))continue;seen.add(s.service_id);if(s.researchComplete===true)complete.add(s.service_id);}selected=ids.filter(id=>!complete.has(id));}
 if(!selected.length)throw Error('NO_UNRESOLVED_LIFECYCLE_SERVICES');
 const capabilities=resolveCapabilities(input.capabilities);const derived={...sourceConfig,capabilities,executionServices:selected},directory=safePath(settings.repo,'.savlivo/v2-operations-inputs');fs.mkdirSync(directory,{recursive:true,mode:0o700});
 // Narrow investigation markets through the existing researchScopes input contract.
 // Service-wide authority/login/manage work remains service-wide; no availability claim.
 if(input.researchMarkets?.length){if(!selection||hash([...selection.services].sort())!==hash([...selected].sort()))throw Error('TARGETING_PREVIEW_MISMATCH');const scope={researchMarkets:selection.researchMarkets};const scopeFile=path.join(directory,hash(scope)+'.json');if(!fs.existsSync(scopeFile))fs.writeFileSync(scopeFile,JSON.stringify(scope,null,2),{flag:'wx',mode:0o600});else if(hash(json(scopeFile))!==hash(scope))throw Error('LIFECYCLE_SCOPE_CHANGED');derived.researchScopes=path.relative(settings.repo,scopeFile);}
 const file=path.join(directory,hash(derived)+'.json');if(!fs.existsSync(file))fs.writeFileSync(file,JSON.stringify(derived,null,2),{flag:'wx',mode:0o600});else if(hash(json(file))!==hash(derived))throw Error('LIFECYCLE_INPUT_CHANGED');
 console.error(JSON.stringify({event:'V2_NATIVE_CHECK_STAGE',stage:'derived-input',status:'FINISHED',durationMs:Math.round(performance.now()-preparationStarted)}));
 const started=performance.now();
 const result=spawnSync(process.execPath,['--import','tsx','docs/catalog/global-47/research-v2/run-mature-v2.mjs','--input',file,'--check'],{cwd:settings.repo,encoding:'utf8',timeout:nativeCheckTimeoutMs,maxBuffer:4*1024*1024,env:process.env});
 for(const line of String(result.stderr??'').split('\n'))try{const t=JSON.parse(line);if(t.event==='V2_NATIVE_CHECK_STAGE'&&/^[a-z-]{1,48}$/.test(t.stage)&&['STARTED','FINISHED'].includes(t.status))console.error(JSON.stringify({event:t.event,stage:t.stage,status:t.status,...(Number.isFinite(t.durationMs)&&t.durationMs>=0?{durationMs:t.durationMs}:{})}));}catch{}
 console.error(JSON.stringify({event:'V2_NATIVE_CHECK_COMPLETED',durationMs:Math.round(performance.now()-started),timeoutMs:nativeCheckTimeoutMs,success:!result.error&&result.status===0}));
 if(result.error||result.status!==0)throw Object.assign(Error('MATURE_LIFECYCLE_PREFLIGHT_FAILED'),{operationsDiagnostic:childDiagnostic(result)});
 const p=JSON.parse(result.stdout),output=safePath(settings.repo,p.output);
 if(p.networkCalls!==0||p.onlineStarted!==false||p.servicesSelected!==selected.length)throw Error('INVALID_LIFECYCLE_PREFLIGHT');
 return {config:{objective:'MATURE_LIFECYCLE',scope:input.scope,services:input.services??[],capabilities,...(input.researchMarkets!==undefined?{researchMarkets:input.researchMarkets}:{})},manifest:{capabilities,objective:'MATURE_LIFECYCLE',catalog:[],targets:[],lifecycle:{input:file,output:p.output,inputHash:hash(fs.readFileSync(file,'utf8'))},limits:{totalRequests:p.maximumNewRequests}},source:null,catalogHash:hash(p),actionable:p.servicesSelected,servicesConsidered:p.servicesSelected,servicesExpectedNetwork:null,totalSafetyCeiling:p.maximumNewRequests,baselineExcluded:p.baselineExcluded,reviewed:p.reviewed,humanReview:p.humanReview,liveReady:p.liveReady,capabilityCheck:p.capabilityCheck,discovery:capabilities.tavily,decodo:capabilities.decodo,browser:capabilities.browser,runner:'mature lifecycleMain',checkpoint:output,preflight:p};
}
