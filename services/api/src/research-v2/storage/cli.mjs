import {restoreGenesisFiles,registerGenesisOverlay,ensureGenesisRepositoryInputs,verifyGenesisPlacement} from './genesis-deployment.mjs';
// Offline storage maintenance only. There is deliberately no destructive command.
import fs from 'node:fs';
import {buildProductionGenesis,validateProductionGenesis,validateGenesisExport,prepareGenesisActions} from './production-genesis.mjs';
import {certifyLegacyBoundary,revalidateLegacyBoundary} from './legacy-boundary.mjs';
import {streamingInventory} from './stream-scan.mjs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {read,safe,canonical,immutable,sha,stableBytes,relative,files,sealed} from './core.mjs';
import {inventory,validatePlan} from './inventory.mjs';
import {buildBootstrap,validateBootstrap} from './bootstrap.mjs';
import {rebuildHistoryIndex} from './history.mjs';
import {receiptPath} from './finalize.mjs';
import {diskStatus} from './runtime.mjs';
export function lifecycleRoots(root,input,operations='.savlivo/v2-operations'){
 const config=read(safe(root,input)),runs=fs.existsSync(safe(root,config.runsRoot))?fs.readdirSync(safe(root,config.runsRoot)).filter(n=>fs.existsSync(safe(root,config.runsRoot+'/'+n+'/lineage.json'))).map(n=>({path:config.runsRoot+'/'+n,receipt:receiptPath(config.runsRoot+'/'+n)})):[];
 const roots=[{path:input,format:'JSON',classification:'PERMANENT_CANONICAL',reason:'CURRENT_LIFECYCLE_INPUT'}];
 for(const dir of fs.readdirSync(safe(root,config.runsRoot)).filter(n=>/^lifecycle-control-[a-f0-9]+$/.test(n)).sort())for(const name of fs.readdirSync(safe(root,config.runsRoot+'/'+dir)).filter(n=>n.endsWith('.json')).sort())roots.push({path:config.runsRoot+'/'+dir+'/'+name,format:'SNAPSHOT',classification:'RESUME_CRITICAL',reason:'CONTINUATION_FINGERPRINT'});
 if(fs.existsSync(safe(root,operations)))roots.push({path:operations,format:'TREE',classification:'RESUME_CRITICAL',reason:'OPERATIONS_JOBS_SCHEDULES_AND_RESUME'});
 const history='.savlivo/research-v2/storage/history';if(fs.existsSync(safe(root,history)))roots.push({path:history,format:'TREE',classification:'PERMANENT_HISTORY',reason:'PERMANENT_ANALYTICS'});
 return {schema:'V2_STORAGE_ROOTS_V1',roots,runs,scan:roots.map(r=>r.path),coordination:[operations+'/state.json',operations+'/execution.lock',operations+'/control.lock'],candidates:[]};
}
export function main(args){const [command,...rest]=args,opts={};for(let i=0;i<rest.length;i+=2){if(!rest[i]?.startsWith('--')||!rest[i+1]||opts[rest[i]])throw Error('STORAGE_ARGUMENTS');opts[rest[i]]=rest[i+1];}
 const root=path.resolve(opts['--root']??process.cwd());
 if(command==='genesis-restore'||command==='genesis-register-overlay'){
  const destination=path.resolve(opts['--destination']),expected=opts['--expected-genesis-hash'];let manifest;
  if(command==='genesis-restore'){const source=path.resolve(opts['--source']);validateGenesisExport(source);manifest=restoreGenesisFiles(source,destination,expected).manifest;}
  else manifest=read(opts['--manifest']);
  verifyGenesisPlacement(destination,manifest,expected);
  // Full native closure validation is mandatory before the persistent startup receipt.
  validateProductionGenesis(destination,manifest.genesis);
  const result=registerGenesisOverlay(destination,manifest,expected);console.log(JSON.stringify(result,null,2));return result;
 }
 if(command==='genesis-deployment-check'){const result=ensureGenesisRepositoryInputs(root,opts['--input'],{repair:false});console.log(JSON.stringify(result,null,2));return result;}
 if(command==='genesis-export'){const spec=read(opts['--spec']);if(spec.schema!=='PRODUCTION_GENESIS_INPUT_V1')throw Error('GENESIS_SPEC_SCHEMA');const r=buildProductionGenesis({...spec,root,destination:opts['--output']});console.log(JSON.stringify({genesisHash:r.genesis.genesisHash,files:r.manifest.files.length,productionInput:r.manifest.productionInput}));return r;}
 if(command==='genesis-validate'||command==='genesis-plan'){const r=validateGenesisExport(path.resolve(opts['--destination']));const result=command==='genesis-plan'?prepareGenesisActions(r):{valid:true,genesisHash:r.genesis.genesisHash,cohort:r.genesis.cohort.length,baselineExcluded:r.genesis.baselineExcluded.length};console.log(JSON.stringify(result,null,2));return result;}
 if(command==='certify-legacy'){const result=certifyLegacyBoundary({...read(opts['--spec']),root,destination:opts['--output']});console.log(JSON.stringify(result,null,2));return result;}
 if(command==='validate-legacy'){const result=revalidateLegacyBoundary(root,opts['--receipt']);console.log(JSON.stringify({complete:true,hash:result.contentHash}));return result;}
 if(command==='rebuild-history'){const result=rebuildHistoryIndex(root);console.log(JSON.stringify({runs:result.rows.length}));return result;}
 if(command==='validate-export'){console.log(JSON.stringify(validateBootstrap(opts['--destination']),null,2));return;}
 if(command==='export'){const result=buildBootstrap({root,destination:opts['--destination'],spec:read(opts['--spec']),createdAt:opts['--at'],sourceIdentity:opts['--source-identity']});console.log(JSON.stringify({valid:true,files:result.included.length,bytes:result.totalBootstrapLogicalBytes,brokenReferences:0},null,2));return;}
 if(command!=='inventory'&&command!=='gc-dry-run')throw Error('Usage: inventory|gc-dry-run --root <repo> --input <lifecycle.json> [--output <new-directory>] OR export|validate-export');
 const spec=opts['--spec']?read(opts['--spec']):lifecycleRoots(root,opts['--input']);
 if(opts['--stream']==='true'){
  if(!opts['--output']||opts['--publish-index'])throw Error('STORAGE_STREAM_REQUIRES_ISOLATED_REPORT');
  const dest=path.join(fs.realpathSync(path.dirname(path.resolve(opts['--output']))),path.basename(opts['--output']));const realRoot=fs.realpathSync(root);if(dest===realRoot||dest.startsWith(realRoot+path.sep))throw Error('STORAGE_STREAM_OUTPUT_MUST_BE_EXTERNAL');
  fs.mkdirSync(dest,{recursive:false});const fd=fs.openSync(path.join(dest,'rows.jsonl'),'wx',0o600);
  try{const result=streamingInventory(root,{...spec,scan:opts['--scan']?[opts['--scan']]:spec.scan},{limits:opts['--limits']?read(opts['--limits']):{},writeRow:r=>fs.writeSync(fd,JSON.stringify(r)+'\n'),progress:p=>process.stderr.write(JSON.stringify(p)+'\n')});immutable(path.join(dest,'inventory.json'),canonical(result));console.log(JSON.stringify(result,null,2));return result;}finally{fs.closeSync(fd);}
 }
 const plan=inventory(root,spec,{now:opts['--at']??new Date().toISOString()});
 if(opts['--output']){const dest=path.resolve(opts['--output']);if(fs.existsSync(dest)&&fs.readdirSync(dest).length)throw Error('STORAGE_REPORT_DESTINATION_NOT_EMPTY');immutable(path.join(dest,'inventory.json'),canonical(plan));}
 const {rows,duplicateCandidates,contentHash,...summary}=plan;
 if(opts['--publish-index']==='true'){
  const store='.savlivo/research-v2/storage',metrics=sealed({...summary,schema:'V2_STORAGE_METRICS_V1'}),file=store+'/inventories/'+metrics.contentHash+'.json';immutable(safe(root,file),canonical(metrics));
  const pointer=safe(root,store+'/latest-inventory.json'),temp=pointer+'.next-'+metrics.contentHash;immutable(temp,canonical({path:file,sha256:sha(stableBytes(safe(root,file)))}));fs.renameSync(temp,pointer);
 }
 console.log(JSON.stringify({...summary,disk:diskStatus(path.join(root,'.savlivo'))},null,2));return plan;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)main(process.argv.slice(2));
