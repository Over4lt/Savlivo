// Offline deployment check. Never starts the worker, scheduler or transport.
import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {settings} from './control.mjs';import {lifecyclePlan} from './lifecycle.mjs';
export function deploymentPreflight(env=process.env){
 const config=settings(env),checks=[];const check=(name,ok)=>checks.push({name,ok:!!ok});
 check('repositoryWorkingDirectory',process.cwd()===config.repo);
 for(const f of ['services/api/dist/services/api/src/server.js','services/api/src/v2-operations/worker.mjs','docs/catalog/global-47/research-v2/run-mature-v2.mjs','apps/web/admin/v2-operations.js'])check(f,fs.existsSync(path.join(config.repo,f)));
 try{import.meta.resolve('tsx');check('tsxRuntime',true);}catch{check('tsxRuntime',false);}
 for(const k of ['TAVILY_API_KEY','SAVLIVO_DECODO_USERNAME','SAVLIVO_DECODO_PASSWORD'])check(k,env[k]?.trim());
 check('lifecycleInputConfigured',config.lifecycleInput);let plan=null;
 if(config.lifecycleInput&&process.cwd()===config.repo)try{plan=lifecyclePlan(config,{objective:'MATURE_LIFECYCLE',scope:'FULL_CATALOG',services:[]});check('matureOfflinePreflight',true);}catch{check('matureOfflinePreflight',false);}
 try{fs.mkdirSync(config.root,{recursive:true,mode:0o700});fs.accessSync(config.root,fs.constants.R_OK|fs.constants.W_OK);check('operationsStateWritable',true);}catch{check('operationsStateWritable',false);}
 return {offline:true,networkCalls:0,ready:checks.every(c=>c.ok),checks,cohort:plan?.servicesConsidered??null,baselineExcluded:plan?.baselineExcluded??null,requestCeiling:plan?.totalSafetyCeiling??null,output:plan?.checkpoint??null,limitations:['Single host / shared persistent filesystem and PID namespace required','Process supervision, provider access and credential validity are not tested offline']};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){const result=deploymentPreflight();console.log(JSON.stringify(result,null,2));if(!result.ready)process.exitCode=1;}
