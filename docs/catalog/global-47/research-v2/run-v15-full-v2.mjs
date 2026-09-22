#!/usr/bin/env node
// --preflight checks credentials and local files only. Only --live constructs research adapters.
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {loadCohort,ensureOutput,runController,validateCheckpoint,stages,bounds,runDirectory} from '../../../../services/api/src/research-v2/inventory/new-service-controller.mjs';
export function parseMode(args){if(args.length!==1||!['--plan','--preflight','--live'].includes(args[0]))throw Error('Usage: node --import tsx docs/catalog/global-47/research-v2/run-v15-full-v2.mjs --plan|--preflight|--live');return args[0];}
export async function preflight({checkCredentials=true,root=process.cwd(),credentialCheck}={}) {
 const cohort=loadCohort(root),output=ensureOutput(root);
 validateCheckpoint(output,cohort);
 for(const file of ['services/api/src/research-v2/live/new-service-runtime.mjs','services/api/src/research-v2/live/new-service-analysis-worker.mjs','services/api/src/research-v2/live/interpret.mjs','docs/catalog/global-47/research-v2/targeted-frontier-worker.mjs'])if(!fs.existsSync(path.join(root,file)))throw Error('STAGE_DEPENDENCY_MISSING');
 let credentials=null;
 if(checkCredentials){const check=credentialCheck??(await import('../../../../services/api/src/research-v2/live/new-service-runtime.mjs')).runtimeCredentials;const c=await check();credentials={available:c.available,source:c.source};}
 return {cohort,summary:{selected:cohort.candidates.length,baselineExcluded:275,stages,output:runDirectory,onlineStarted:false,networkCalls:0,
  pipelineReady:false,liveReady:false,retired:'Use run-v15-mature-v2.mjs after explicit provider-binding review; this historical stage queue is not a valid full V2 path.',credentials:credentials??{status:'NOT_CHECKED'},
  bounds:{...bounds,totalRequestCeiling:188*bounds.requestsPerService},decodo:false,browser:false,production:false,priceRequiredForEligibility:false,
  authorityPolicy:'Unreviewed sources may be acquired as discovery. Existing evidence authority rules remain mandatory; unproven ownership is REVIEW_REQUIRED, never auto-granted.',
  resume:'Repeat the same --live command. Completed stages/results are reused; ambiguous dispatched operations are not retried automatically.'}};
}
export async function main(args=process.argv.slice(2)) {
 const mode=parseMode(args);
 if(mode==='--live')throw Error('RUNTIME_PARALLEL_CONTROLLER_RETIRED_USE_REVIEWED_MATURE_HANDOFF');
 const check=await preflight({checkCredentials:mode!=='--plan'});
 console.log(JSON.stringify(check.summary,null,2));
 if(mode!=='--live'){if(mode==='--preflight'&&!check.summary.liveReady)process.exitCode=1;return check.summary;}
 if(!check.summary.liveReady)throw Error('RUNTIME_CREDENTIALS_MISSING');
 let stop=false;const requestStop=()=>{stop=true;console.log('Safe stop requested; finishing the current bounded operation. Repeat the same command to resume.');};
 process.on('SIGINT',requestStop);process.on('SIGTERM',requestStop);
 try{const {runtimeCredentials,createNewServiceRuntime}=await import('../../../../services/api/src/research-v2/live/new-service-runtime.mjs');
  const credentials=await runtimeCredentials();
  const adapter=await createNewServiceRuntime({key:credentials.key,candidates:check.cohort.candidates});
  return await runController({cohort:check.cohort,directory:ensureOutput(),adapter,shouldStop:()=>stop,onProgress:event=>console.log(JSON.stringify(event))});
 }finally{process.off('SIGINT',requestStop);process.off('SIGTERM',requestStop);}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)main().catch(e=>{console.error(/^(COHORT_|APPROVED_|BASELINE_|CANDIDATE_|ALIAS_|MANIFEST_|UNBOUND_|RUNTIME_|RESUME_|CONTROLLER_|INVALID_|CHECKPOINT_|Usage:)/.test(e.message)?e.message:'V15_CONTROLLER_STOPPED: inspect local checkpoints; exception details withheld.');process.exitCode=1;});
