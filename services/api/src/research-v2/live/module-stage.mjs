// Explicitly budgeted post-interpretation host stage. Never imported by offline worker.
import fs from 'node:fs';import path from 'node:path';import {spawn} from 'node:child_process';
import {CatalogModuleBudget} from '../code-dataflow/catalog-module-budget.mjs';
import {ResourceBudget,acquireMissingModules} from '../code-dataflow/module-controller.mjs';
import {references,sha256} from '../code-dataflow/module-resources.mjs';
import {createModuleAcquirer} from './acquire-module-resource.mjs';
import {iterateMarketRunRecords} from '../../research-v1/market-run-store.mjs';
const read=p=>JSON.parse(fs.readFileSync(p));
export async function verifyRetainedRun(dir){const output=fs.readdirSync(dir).filter(n=>/^interpretation-\d+$/.test(n)).sort().at(-1);if(!output)throw Error('INTERPRETATION_REQUIRED');return new Promise((resolve,reject)=>{const child=spawn(process.execPath,['docs/catalog/global-47/research-v2/targeted-frontier-worker.mjs',dir,output],{env:{PATH:process.env.PATH??''},stdio:['ignore','ignore','ignore']});child.on('error',reject);child.on('exit',n=>n===0?resolve(read(dir+'/'+output+'/targeted-verification.json')):reject(Error('VERIFICATION_WORKER_FAILED')));});}
export async function runModuleStage({dir,inventory,runtime,bundle,acquireEndpoint,resolveHost}){
 const dest=path.join(dir,'module-fallback');fs.mkdirSync(dest);const write=(name,x)=>{const p=dest+'/'+name+'.json';fs.writeFileSync(p+'.pending',JSON.stringify(x,null,2)+'\n');fs.renameSync(p+'.pending',p);};
 const event=(type,data)=>{const fd=fs.openSync(dest+'/journal.jsonl','a');fs.writeSync(fd,JSON.stringify({type,...data})+'\n');fs.fsyncSync(fd);fs.closeSync(fd);};
 const scheduler=new CatalogModuleBudget(s=>write('usage',s)),output=fs.readdirSync(dir).filter(n=>/^interpretation-\d+$/.test(n)).sort().at(-1),rows=read(dir+'/'+output+'/code-dataflow-fallback.json'),records=[...iterateMarketRunRecords(dir+'/journal')].filter(r=>r.type==='RESPONSE_CAPTURED'&&r.payload.status===200),results=[];
 if(!Array.isArray(rows)){write('results',{status:'FIELD_GAP_ANALYSIS_UNAVAILABLE'});return [];}
 const acquirer=createModuleAcquirer({runtime,bundle,root:dest+'/acquisitions',event,resolveHost});
 // Round-robin service order prevents a many-market provider consuming the run.
 const groups=new Map();for(const t of [...inventory].sort((a,b)=>Number(rows.some(r=>r.service===b.service&&r.activation?.active))-Number(rows.some(r=>r.service===a.service&&r.activation?.active)))){if(!groups.has(t.service))groups.set(t.service,[]);groups.get(t.service).push(t);}const scheduled=[];while([...groups.values()].some(g=>g.length))for(const g of groups.values())if(g.length)scheduled.push(g.shift());
 for(const t of scheduled){const gap=rows.find(r=>r.service===t.service&&r.market===t.market);if(!gap?.activation?.active)continue;
  const parents=records.filter(r=>r.payload.target?.taskId===t.id&&/text\/html/.test(r.payload.contentType??'')).map(r=>({url:r.payload.url,kind:'HTML',code:fs.readFileSync(dir+'/'+r.payload.bodyFile,'utf8'),sha256:r.payload.bodyHash,depth:0,record:r.sequence})).filter(p=>sha256(p.code)===p.sha256);
  const authorities=t.authorities.filter(a=>a.discoveryDomainBinding?.validated||a.sourceUrl&&a.checkedAt).map(a=>({hostname:a.hostname,validated:true,reference:a}));
  const ref=parents.flatMap(p=>references(p).references).filter(r=>/pric|plans|subscription|acquisition|pages\/index/i.test(r.url)&&!/analytics|tracker|marketingtech|captcha|\/akam\//i.test(r.url)).sort((a,b)=>a.url.localeCompare(b.url,'en'))[0];
  const pageRefs=parents.flatMap(p=>references(p).references);
  const cached=records.filter(r=>r.payload.target?.taskId===t.id&&pageRefs.some(p=>p.url===r.payload.url)&&r.payload.bytes>0&&/javascript|application\/json/.test(r.payload.contentType??'')).map(r=>({url:r.payload.url,code:fs.readFileSync(dir+'/'+r.payload.bodyFile,'utf8'),sha256:r.payload.bodyHash,providerControlled:authorities.some(a=>a.hostname===new URL(r.payload.url).hostname),parentEvidence:pageRefs.find(p=>p.url===r.payload.url),depth:pageRefs.find(p=>p.url===r.payload.url).depth}));
  if(!ref&&!cached.length)continue;
  const input={ordinaryAcquisitionComplete:true,interpretationComplete:true,fieldAssessment:gap.fieldAssessment,providerCodeRelevant:true,modules:cached,entries:cached.map(m=>m.url),authorities};
  const budget=scheduler.startTarget(t.id);if(!budget){event('CATALOG_MODULE_BOUND_STOP',{target:t.id});break;}
  const state=await acquireMissingModules({target:t,input,parents,bootstrapUrls:ref?[ref.url]:[],budget,acquire:acquirer,persist:s=>write(t.id,{...s,modules:s.modules.map(({code,...m})=>m)})});
  scheduler.finishTarget(t.id,Math.min(200000,state.analysisWork));
  const endpoints=[];
  for(const c of state.endpointCandidates.slice(0,1)){
   if(!c.acquisitionEligible||!c.authority||!c.proofChain?.length)continue;
   try{budget.execution('endpoint',c.url);}catch{break;}event('ENDPOINT_PROOF',c);
   endpoints.push(await acquireEndpoint({target:t,candidate:c,budget,root:dest+'/endpoints'}));
  }
  results.push({target:t.id,status:state.status,endpoints});write('results',results);if(scheduler.run.state.stop)break;
 }
 write('results',results);scheduler.save();return results;
}
