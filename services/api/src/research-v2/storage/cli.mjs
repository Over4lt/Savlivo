// Offline storage maintenance only. There is deliberately no destructive command.
import fs from 'node:fs';
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
 for(const p of files(root,config.runsRoot).filter(p=>/\/lifecycle-control-[^/]+\/[^/]+\.json$/.test(p)))roots.push({path:p,format:'SNAPSHOT',classification:'RESUME_CRITICAL',reason:'CONTINUATION_FINGERPRINT'});
 if(fs.existsSync(safe(root,operations)))roots.push({path:operations,format:'TREE',classification:'RESUME_CRITICAL',reason:'OPERATIONS_JOBS_SCHEDULES_AND_RESUME'});
 const history='.savlivo/research-v2/storage/history';if(fs.existsSync(safe(root,history)))roots.push({path:history,format:'TREE',classification:'PERMANENT_HISTORY',reason:'PERMANENT_ANALYTICS'});
 return {schema:'V2_STORAGE_ROOTS_V1',roots,runs,scan:['.savlivo'],coordination:[operations+'/state.json',operations+'/execution.lock',operations+'/control.lock'],candidates:[]};
}
export function main(args){const [command,...rest]=args,opts={};for(let i=0;i<rest.length;i+=2){if(!rest[i]?.startsWith('--')||!rest[i+1]||opts[rest[i]])throw Error('STORAGE_ARGUMENTS');opts[rest[i]]=rest[i+1];}
 const root=path.resolve(opts['--root']??process.cwd());
 if(command==='rebuild-history'){const result=rebuildHistoryIndex(root);console.log(JSON.stringify({runs:result.rows.length}));return result;}
 if(command==='validate-export'){console.log(JSON.stringify(validateBootstrap(opts['--destination']),null,2));return;}
 if(command==='export'){const result=buildBootstrap({root,destination:opts['--destination'],spec:read(opts['--spec']),createdAt:opts['--at'],sourceIdentity:opts['--source-identity']});console.log(JSON.stringify({valid:true,files:result.included.length,bytes:result.totalBootstrapLogicalBytes,brokenReferences:0},null,2));return;}
 if(command!=='inventory'&&command!=='gc-dry-run')throw Error('Usage: inventory|gc-dry-run --root <repo> --input <lifecycle.json> [--output <new-directory>] OR export|validate-export');
 const spec=opts['--spec']?read(opts['--spec']):lifecycleRoots(root,opts['--input']),plan=inventory(root,spec,{now:opts['--at']??new Date().toISOString()});
 if(opts['--output']){const dest=path.resolve(opts['--output']);if(fs.existsSync(dest)&&fs.readdirSync(dest).length)throw Error('STORAGE_REPORT_DESTINATION_NOT_EMPTY');immutable(path.join(dest,'inventory.json'),canonical(plan));}
 const {rows,duplicateCandidates,contentHash,...summary}=plan;
 if(opts['--publish-index']==='true'){
  const store='.savlivo/research-v2/storage',metrics=sealed({...summary,schema:'V2_STORAGE_METRICS_V1'}),file=store+'/inventories/'+metrics.contentHash+'.json';immutable(safe(root,file),canonical(metrics));
  const pointer=safe(root,store+'/latest-inventory.json'),temp=pointer+'.next-'+metrics.contentHash;immutable(temp,canonical({path:file,sha256:sha(stableBytes(safe(root,file)))}));fs.renameSync(temp,pointer);
 }
 console.log(JSON.stringify({...summary,disk:diskStatus(path.join(root,'.savlivo'))},null,2));return plan;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)main(process.argv.slice(2));
