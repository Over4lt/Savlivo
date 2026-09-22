#!/usr/bin/env node
import {resolveCapabilities,capabilityPreflight} from '../../../../services/api/src/research-v2/capabilities/config.mjs';
import fs from 'node:fs';import path from 'node:path';import {pathToFileURL} from 'node:url';
import {prepareHandoff,inspectHandoff,handoffDirectory,inspectLifecycleInput} from '../../../../services/api/src/research-v2/inventory/reviewed-cohort-handoff.mjs';
import {priceTargets,continuationLocation,executeHandoff,validateReviewedContinuation} from '../../../../services/api/src/research-v2/inventory/reviewed-cohort-execution.mjs';
import {snapshotLifecycle,lifecycleBudgets} from '../../../../services/api/src/research-v2/inventory/lifecycle-continuation.mjs';
import {digest,json} from '../../../../services/api/src/research-v2/inventory/new-service-controller.mjs';
import {readTavilyKeychain} from '../../../../services/api/src/research-v2/live/tavily-search.mjs';
export function modeOf(args){const filtered=args.filter(a=>!['--candidate-round','--reviewed-continuation'].includes(a));if(args.filter(a=>a==='--reviewed-continuation').length>1||args.includes('--candidate-round')&&args.includes('--reviewed-continuation')||args.filter(a=>a==='--candidate-round').length>1||filtered.length!==1||!['--prepare-review','--check','--plan','--replay','--live'].includes(filtered[0]))throw Error('Usage: node --import tsx docs/catalog/global-47/research-v2/run-v15-mature-v2.mjs --prepare-review|--check|--plan|--replay|--live');return filtered[0];}
export async function main(args=process.argv.slice(2)){
 if(args.includes('--lifecycle'))return lifecycleMain(args);

 const mode=modeOf(args),candidateRound=args.includes('--candidate-round'),reviewedContinuation=args.includes('--reviewed-continuation');
 if(reviewedContinuation&&mode==='--prepare-review')throw Error('HANDOFF_CONTINUATION_MODE');
 if(mode==='--prepare-review'){
  const handoff=prepareHandoff();const file=handoffDirectory+'/research-scope.json';if(!fs.existsSync(file))fs.writeFileSync(file,JSON.stringify({researchMarkets:{}},null,2)+'\n',{flag:'wx'});
  console.log(JSON.stringify(handoff.summary,null,2));return handoff.summary;
 }
 const document=JSON.parse(fs.readFileSync(handoffDirectory+'/reviewed-provider-bindings.json')),researchMarkets=JSON.parse(fs.readFileSync(handoffDirectory+'/research-scope.json')).researchMarkets;
 const continuation=reviewedContinuation?JSON.parse(fs.readFileSync(handoffDirectory+'/reviewed-continuation.json')):null;
 const handoff=inspectHandoff({document}),prices=priceTargets(handoff.targets,researchMarkets,handoff.cohort.manifest.serviceIds),location=continuationLocation(handoff,researchMarkets,candidateRound,null,continuation);
 if(continuation)validateReviewedContinuation(handoff,researchMarkets,continuation);
 const ready=reviewedContinuation||candidateRound||(handoff.targets.length===188&&new Set(prices.map(t=>t.service)).size===188);
 const summary={...handoff.summary,liveReady:ready,candidateRound,readinessMeaning:candidateRound?'BOUNDED_CANDIDATE_ACQUISITION_PLUS_REVIEWED_NATIVE_RESEARCH_NOT_ALL188_TRUSTED':'FULL_REVIEWED_COHORT',candidateAcquisitionServices:handoff.rows.filter(r=>!handoff.targets.some(t=>t.service===r.service)&&r.providerReview.selectedCandidate).length,unresolvedIdentityServices:handoff.rows.filter(r=>!r.providerReview.selectedCandidate&&!handoff.targets.some(t=>t.service===r.service)).length,pricingScopedServices:new Set(prices.map(t=>t.service)).size,output:location.directory,onlineStarted:false,credentials:'CHECKED_ONLY_AFTER_LIVE_SCOPE_GATES',blockers:candidateRound?[]:[...(handoff.targets.length<188?['REVIEWED_PROVIDER_BINDINGS_REQUIRED']:[]),...(new Set(prices.map(t=>t.service)).size<188?['EXPLICIT_RESEARCH_MARKET_SCOPES_REQUIRED']:[])]};
 if(candidateRound)summary.additionalRequestCeiling=handoff.targets.length*36+summary.candidateAcquisitionServices*4;
 if(continuation)Object.assign(summary,{readinessMeaning:'EXPLICIT_104_REVIEWED_CONTINUATION_84_EXCLUDED',candidateAcquisitionServices:0,additionalRequestCeiling:104*36,blockers:[]});
 console.log(JSON.stringify(summary,null,2));if(mode==='--check')return summary;
 // No credential/transport construction until all actual starting-state prerequisites pass.
 if(mode==='--live'&&!ready)throw Error('HANDOFF_FULL_COHORT_NOT_READY');
 let key;if(mode==='--live'){key=process.env.TAVILY_API_KEY?.trim()||await readTavilyKeychain();if(!key)throw Error('HANDOFF_TAVILY_CREDENTIAL_REQUIRED');}
 let stop=false;const requestStop=()=>{stop=true;console.log('Stopping after current native action; reuse this command to resume.');};
 process.on('SIGINT',requestStop);process.on('SIGTERM',requestStop);
 try{return await executeHandoff({handoff,researchMarkets,directory:location.directory,mode:mode.slice(2),key,shouldStop:()=>stop,candidateRound,continuation});}finally{process.off('SIGINT',requestStop);process.off('SIGTERM',requestStop);}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)main().catch(e=>{console.error(/^(HANDOFF_|AUTHORITY_|Usage:)/.test(e.message)?e.message:'HANDOFF_STOPPED: inspect local review inputs; no fallback to old controller.');process.exitCode=1;});

export async function lifecycleMain(args,control={}){
 const at=args.indexOf('--input'),file=at>=0?args[at+1]:null,rest=args.filter((a,i)=>i!==at&&i!==at+1&&a!=='--lifecycle');
 if(!file||rest.length!==1||!['--check','--live'].includes(rest[0])||args.length!==4)throw Error('Usage: --lifecycle --input <frozen-input.json> --check|--live');
 const h=inspectLifecycleInput(file);h.config.capabilities=resolveCapabilities(h.config.capabilities);const capabilityCheck=capabilityPreflight(h.config.capabilities);const markets=structuredClone(h.config.researchScopes?json(h.config.researchScopes).researchMarkets:{});
 // Explicit project market hints are research scopes only, never availability.
 for(const c of h.cohort.candidates)if(!markets[c.slug]?.length&&c.markets?.length)markets[c.slug]=[...c.markets];
 priceTargets(h.targets,markets,h.cohort.manifest.serviceIds);
 const codeFiles=dir=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?codeFiles(path.join(dir,e.name)):e.isFile()&&e.name.endsWith('.mjs')?[path.join(dir,e.name)]:[]);
 const codeHash=digest(codeFiles('services/api/src/research-v2').sort().map(f=>[f,digest(fs.readFileSync(f))]));
 const lifecycle=snapshotLifecycle({handoff:h,researchMarkets:markets,runsRoot:h.config.runsRoot,baselineIds:h.baselineIds,legacyDirectory:h.config.legacyDirectory,quarantine:h.config.quarantineFile?json(h.config.quarantineFile).entries:[],codeHash});
 const location=continuationLocation(h,markets,false,null,null,lifecycle);
 const preflight={servicesSelected:h.config.executionServices?.length??h.cohort.manifest.serviceIds.length,cohort:h.cohort.manifest.serviceIds.length,reviewed:h.targets.length,humanReview:(h.config.executionServices?.length??h.cohort.manifest.serviceIds.length)-h.targets.length,baselineExcluded:h.baselineIds.length,capabilityCheck,capabilities:h.config.capabilities,liveReady:capabilityCheck.ready,output:location.directory,maximumNewRequests:lifecycleBudgets(h).total,historicalRequests:lifecycle.historicalRequests,parentRequests:lifecycle.parentRequests,networkCalls:0,onlineStarted:false,credentials:'VALIDATED_AT_LIVE_START'};
 if(control.expectedOutput&&control.expectedOutput!==location.directory)throw Error('LIFECYCLE_CHECKPOINT_CHANGED');
 console.log(JSON.stringify(preflight,null,2));if(rest[0]==='--check')return preflight;
 if(!capabilityCheck.ready)throw Error('LIFECYCLE_CAPABILITY_UNAVAILABLE');
 const key=h.config.capabilities.tavily?process.env.TAVILY_API_KEY?.trim():null;
 let stop=false;const halt=()=>{stop=true;console.log('Stopping after current mature action; use the same command to resume.');};process.on('SIGINT',halt);process.on('SIGTERM',halt);
 try{return await executeHandoff({handoff:h,researchMarkets:markets,directory:location.directory,mode:'live',key,shouldStop:()=>stop||control.shouldStop?.()===true,lifecycle});}finally{process.off('SIGINT',halt);process.off('SIGTERM',halt);}
}
