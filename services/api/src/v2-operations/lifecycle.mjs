import {deploymentContract,validateGenesisExecutionSelection} from '../research-v2/storage/genesis-deployment.mjs';
import {freezeLeads,readLeadSnapshot,leadContext} from '../research-v2/human-leads/snapshot.mjs';
import {diagnosticContext} from './diagnostics.mjs';
import {inspectLifecycleInput} from '../research-v2/inventory/reviewed-cohort-handoff.mjs';
import {lifecycleBudgets} from '../research-v2/inventory/lifecycle-continuation.mjs';
import {verifyAdmittedLeads} from '../research-v2/human-leads/snapshot.mjs';
import {resolveCapabilities,capabilityPreflight} from '../research-v2/capabilities/config.mjs';
// Control-plane adapter only: preflight and execution use the CLI's mature entrypoint.
import fs from 'node:fs';
import path from 'node:path';
import {safePath,hash,json} from './artifacts.mjs';
export function lifecyclePlan(settings,input,selection=null){
 const context=diagnosticContext(settings.diagnosticContext),preparationStarted=performance.now();
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
 const contextLeads=leadContext(derived,settings.repo);
 const storeFile=path.join(settings.root,'state.json');
 derived.humanLeadSnapshot=Object.hasOwn(input,'humanLeadSnapshot')?input.humanLeadSnapshot:freezeLeads(settings.repo,contextLeads,fs.existsSync(storeFile)?JSON.parse(fs.readFileSync(storeFile,'utf8')).humanLeads??[]:[]);
 const leadSnapshot=readLeadSnapshot(settings.repo,derived.humanLeadSnapshot,contextLeads);
 const file=path.join(directory,hash(derived)+'.json');if(!fs.existsSync(file))fs.writeFileSync(file,JSON.stringify(derived,null,2),{flag:'wx',mode:0o600});else if(hash(json(file))!==hash(derived))throw Error('LIFECYCLE_INPUT_CHANGED');
 console.error(JSON.stringify({...context,event:'V2_NATIVE_CHECK_STAGE',stage:'derived-input',status:'FINISHED',durationMs:Math.round(performance.now()-preparationStarted),rssBytes:process.memoryUsage().rss,heapUsedBytes:process.memoryUsage().heapUsed,maxRssKiB:process.resourceUsage().maxRSS}));
 if(derived.productionGenesis){const g=json(safePath(settings.repo,derived.productionGenesis)),exportManifest=json(safePath(settings.repo,'.savlivo/research-v2/storage/deployment/'+g?.genesisHash+'/manifest.json'));const contract=deploymentContract(settings.repo,exportManifest,g?.genesisHash);validateGenesisExecutionSelection(settings.repo,path.relative(settings.repo,file),derived,contract.genesis);}
 const handoff=inspectLifecycleInput(file,settings.repo),check=capabilityPreflight(capabilities);
 const binding={version:1,scope:input.scope,researchMarkets:input.researchMarkets??null,input:file,inputHash:hash(fs.readFileSync(file,'utf8')),inputHashes:handoff.inputHashes,capabilities,services:selected,humanLeadSnapshot:derived.humanLeadSnapshot,budget:lifecycleBudgets(handoff)};
 const p={validation:'DEFERRED_TO_EXECUTION',servicesSelected:selected.length,baselineExcluded:handoff.baselineIds.length,reviewed:handoff.targets.length,humanReview:selected.length-handoff.targets.length,maximumNewRequests:binding.budget.total,liveReady:check.ready,capabilityCheck:check,networkCalls:0,onlineStarted:false};
 console.error(JSON.stringify({...context,event:'PREFLIGHT_FAST',durationMs:Math.round(performance.now()-preparationStarted),integrityValidation:'PENDING_EXECUTION'}));

 return {humanLeads:leadSnapshot.leads.map(({createdBy,note,...l})=>l),config:{humanLeadSnapshot:derived.humanLeadSnapshot,objective:'MATURE_LIFECYCLE',scope:input.scope,services:input.services??[],capabilities,...(input.researchMarkets!==undefined?{researchMarkets:input.researchMarkets}:{})},manifest:{humanLeadSnapshot:derived.humanLeadSnapshot,capabilities,objective:'MATURE_LIFECYCLE',catalog:[],targets:[],lifecycle:{input:file,output:null,inputHash:binding.inputHash,admission:binding},limits:{totalRequests:p.maximumNewRequests}},source:null,catalogHash:hash(binding),actionable:p.servicesSelected,servicesConsidered:p.servicesSelected,servicesExpectedNetwork:null,totalSafetyCeiling:p.maximumNewRequests,baselineExcluded:p.baselineExcluded,reviewed:p.reviewed,humanReview:p.humanReview,liveReady:p.liveReady,capabilityCheck:p.capabilityCheck,discovery:capabilities.tavily,decodo:capabilities.decodo,browser:capabilities.browser,runner:'mature lifecycleMain',checkpoint:null,preflight:p};
}

// Admission binds intent and small immutable inputs; it is not an integrity receipt.
export function verifyExecutionBinding(repo,job,manifest){
 if(!manifest.lifecycle?.inputHash||hash(fs.readFileSync(safePath(repo,manifest.lifecycle.input),'utf8'))!==manifest.lifecycle.inputHash)throw Error('EXECUTION_INPUT_CHANGED');
 verifyAdmittedLeads(repo,job.config,manifest);
 const b=manifest.lifecycle?.admission;
 if(!b){if(job.admissionHash)throw Error('EXECUTION_BINDING_MISSING');return;} // Legacy jobs still receive full execution validation.
 if(b.version!==1||job.config.scope!==b.scope||hash(job.config.researchMarkets??null)!==hash(b.researchMarkets)||job.admissionHash!==hash(b)||b.input!==manifest.lifecycle.input||b.inputHash!==manifest.lifecycle.inputHash||hash(job.config.capabilities)!==hash(b.capabilities)||hash(manifest.capabilities)!==hash(b.capabilities)||manifest.limits?.totalRequests!==b.budget.total||hash(job.config.humanLeadSnapshot)!==hash(b.humanLeadSnapshot))throw Error('EXECUTION_BINDING_MISMATCH');
 if(job.config.scope==='SELECTED_SERVICES'&&hash([...job.config.services].sort())!==hash([...b.services].sort()))throw Error('EXECUTION_SCOPE_MISMATCH');
 for(const [file,expected] of Object.entries(b.inputHashes)){if(hash(fs.readFileSync(safePath(repo,file),'utf8'))!==expected)throw Error('EXECUTION_INPUT_CHANGED');}
 if(hash(fs.readFileSync(safePath(repo,b.input),'utf8'))!==b.inputHash)throw Error('EXECUTION_INPUT_CHANGED');
}
