import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn,spawnSync} from 'node:child_process';
import {once} from 'node:events';
import {pathToFileURL} from 'node:url';
import {runtimeConfiguration,repositoryRoot,featureGates} from './production-runtime.mjs';
import {executionSpawnOptions} from '../src/v2-operations/poller-runtime.mjs';
const runtimeUrl=new URL('./production-runtime.mjs',import.meta.url).href;
const pollerUrl=new URL('../src/v2-operations/poller-runtime.mjs',import.meta.url).href;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,ms=8000){const end=Date.now()+ms;while(!fn()){if(Date.now()>end)throw Error('TEST_WAIT_TIMEOUT');await sleep(25);}}
const live=pid=>{try{process.kill(pid,0);return true;}catch{return false;}};
function fixture(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'savlivo-supervisor-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));return dir;}
function write(dir,name,body){const f=path.join(dir,name);fs.writeFileSync(f,body);return f;}
function launch(t,dir,specs,{graceMs=1200,env={}}={}){
 const driver=write(dir,'driver.mjs',`import {supervise} from ${JSON.stringify(runtimeUrl)};process.exitCode=await supervise({children:${JSON.stringify(specs)},cwd:${JSON.stringify(repositoryRoot)},env:process.env,graceMs:${graceMs}});`);
 const child=spawn(process.execPath,[driver],{cwd:repositoryRoot,env:{...process.env,...env},stdio:['ignore','pipe','pipe']});
 let output='';child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>output+=b);
 const finished=once(child,'exit');
 t.after(()=>{if(live(child.pid))child.kill('SIGKILL');for(const e of output.split('\n'))try{const row=JSON.parse(e);if(row.event==='CHILD_STARTED')try{process.kill(-row.pid,'SIGKILL');}catch{}}catch{}});
 return {child,finished,output:()=>output};
}
const idle=(dir,name)=>write(dir,name+'.mjs',`import fs from 'node:fs';fs.writeFileSync(${JSON.stringify(path.join(dir,name+'.pid'))},String(process.pid));for(const s of ['SIGTERM','SIGINT'])process.on(s,()=>{fs.writeFileSync(${JSON.stringify(path.join(dir,name+'.signal'))},s);process.exit(0);});setInterval(()=>{},1000);`);

test('production commands: built API plus source mature poller, root cwd, flags default OFF',()=>{
 const c=runtimeConfiguration({PATH:process.env.PATH});assert.equal(c.cwd,path.resolve(repositoryRoot));assert(c.children[0].args[0].endsWith('/services/api/dist/services/api/src/server.js'));assert.deepEqual(c.children[1].args.slice(0,2),['--import','tsx']);assert.equal(c.children[1].args.at(-1),'--poll');assert.equal(c.children[1].ipc,true);for(const gate of featureGates)assert.equal(c.env[gate],'false');
});
test('explicit activation is preserved, invalid gate/root fails closed',()=>{assert.equal(runtimeConfiguration({ANALYTICS_V2_RUN_CONTROL_ENABLED:'true'}).env.ANALYTICS_V2_RUN_CONTROL_ENABLED,'true');assert.throws(()=>runtimeConfiguration({ANALYTICS_V2_RUN_CONTROL_ENABLED:'yes'}),/FEATURE_GATE/);assert.throws(()=>runtimeConfiguration({V2_OPERATIONS_REPOSITORY_ROOT:'/wrong'}),/ROOT_MISMATCH/);});
test('supervised execution children stay in poller group; standalone stays detached',()=>{assert.equal(executionSpawnOptions(true).detached,false);assert.equal(executionSpawnOptions(false).detached,true);});
for(const signal of ['SIGTERM','SIGINT'])test('supervisor forwards '+signal+' and waits for both children',async t=>{
 const dir=fixture(t),api=idle(dir,'api'),poller=idle(dir,'poller');const run=launch(t,dir,[{name:'api',args:[api]},{name:'poller',args:[poller],ipc:true}]);await until(()=>fs.existsSync(path.join(dir,'api.pid'))&&fs.existsSync(path.join(dir,'poller.pid')));run.child.kill(signal);const [code]=await run.finished;assert.equal(code,0,run.output());for(const name of ['api','poller']){assert.equal(fs.readFileSync(path.join(dir,name+'.signal'),'utf8'),signal);assert.equal(live(Number(fs.readFileSync(path.join(dir,name+'.pid')))),false);}
});
test('unexpected even-successful child exit terminates sibling and fails service for host restart',async t=>{
 const dir=fixture(t),api=idle(dir,'api'),bad=write(dir,'exits.mjs',`setTimeout(()=>process.exit(0),200);`);const run=launch(t,dir,[{name:'api',args:[api]},{name:'poller',args:[bad]}]);const [code]=await run.finished;assert.equal(code,1,run.output());assert.equal(live(Number(fs.readFileSync(path.join(dir,'api.pid')))),false);
});
test('shutdown deadline kills stubborn poller and same-group research descendant',async t=>{
 const dir=fixture(t),api=idle(dir,'api'),grand=write(dir,'grand.mjs',`import fs from 'node:fs';process.on('SIGTERM',()=>{});fs.writeFileSync(${JSON.stringify(path.join(dir,'grand.pid'))},String(process.pid));setInterval(()=>{},1000);`),bad=write(dir,'stubborn.mjs',`import {spawn} from 'node:child_process';spawn(process.execPath,[${JSON.stringify(grand)}],{stdio:'ignore'});process.on('SIGTERM',()=>{});setInterval(()=>{},1000);`);
 const run=launch(t,dir,[{name:'api',args:[api]},{name:'poller',args:[bad]}],{graceMs:250});await until(()=>fs.existsSync(path.join(dir,'grand.pid')));run.child.kill('SIGTERM');await run.finished;assert.match(run.output(),/SHUTDOWN_DEADLINE/);await until(()=>!live(Number(fs.readFileSync(path.join(dir,'grand.pid')))));
});
test('poller drains an active local execution to its checkpoint before exiting',async t=>{
 const dir=fixture(t),job=write(dir,'job.mjs',`import fs from 'node:fs';fs.writeFileSync(${JSON.stringify(path.join(dir,'job.pid'))},String(process.pid));process.on('SIGTERM',()=>setTimeout(()=>{fs.writeFileSync(${JSON.stringify(path.join(dir,'checkpoint.json'))},JSON.stringify({requests:7,pending:null}));process.exit(0);},100));setInterval(()=>{},1000);`);
 const poller=write(dir,'drain.mjs',`import {spawn} from 'node:child_process';import fs from 'node:fs';import {runPoller,executionSpawnOptions} from ${JSON.stringify(pollerUrl)};const children=new Set();await runPoller({children,heartbeat:s=>fs.writeFileSync(${JSON.stringify(path.join(dir,'heartbeat'))},s),tick:async()=>{if(children.size)return;const c=spawn(process.execPath,[${JSON.stringify(job)}],{stdio:'ignore',...executionSpawnOptions()});children.add(c);},intervalMs:50,drainMs:500});`);
 const run=launch(t,dir,[{name:'poller',args:[poller],ipc:true}]);await until(()=>fs.existsSync(path.join(dir,'job.pid')));run.child.kill('SIGTERM');const [code]=await run.finished;assert.equal(code,0,run.output());assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir,'checkpoint.json'))),{requests:7,pending:null});assert.equal(fs.readFileSync(path.join(dir,'heartbeat'),'utf8'),'STOPPED');
});
for(const read of ['false','true'])test('real worker with controls OFF heartbeats and preserves queued work/ledger, read='+read,async t=>{
 const dir=fixture(t),state=path.join(dir,'state');fs.mkdirSync(state);const store=JSON.stringify({version:1,schedules:[],jobs:[{id:'queued-work',status:'QUEUED',origin:'ADMIN'},{id:'scheduled-work',status:'QUEUED',origin:'SCHEDULED'}],preflights:[],events:[]});fs.writeFileSync(path.join(state,'state.json'),store);fs.writeFileSync(path.join(state,'network.jsonl'),'historical-ledger-do-not-change');
 const guard=write(dir,'no-network.mjs',`import {createRequire,syncBuiltinESMExports} from 'node:module';import fs from 'node:fs';const require=createRequire(import.meta.url);const denied=()=>{fs.writeFileSync(${JSON.stringify(path.join(dir,'NETWORK_ATTEMPT'))},new Error('NETWORK_ATTEMPT').stack);throw Error('NO_TEST_NETWORK');};for(const [m,methods]of Object.entries({http:['request','get'],https:['request','get'],net:['connect','createConnection'],tls:['connect'],dns:['lookup','resolve']})){const mod=require('node:'+m);const local=args=>{let a=args[0];while(Array.isArray(a))a=a[0];return typeof a==='string'?a.startsWith('/'):typeof a?.path==='string'&&a.path.startsWith('/')&&!a.port&&!a.host;};for(const k of methods){const original=mod[k];mod[k]=m==='net'?function(...args){return local(args)?original.apply(this,args):denied();}:denied;}if(m==='net'){const original=mod.Socket.prototype.connect;mod.Socket.prototype.connect=function(...args){return local(args)?original.apply(this,args):denied();};}}globalThis.fetch=denied;syncBuiltinESMExports();`);
 const c=runtimeConfiguration({PATH:process.env.PATH,ANALYTICS_V2_OPERATIONS_ENABLED:read,V2_OPERATIONS_STATE_ROOT:state});
 for(let restart=0;restart<2;restart++){
  const api=idle(dir,'api'),run=launch(t,dir,[{name:'api',args:[api]},c.children[1]],{env:{...c.env,NODE_OPTIONS:'--import='+pathToFileURL(guard).href},graceMs:1800});
  await until(()=>{try{const h=JSON.parse(fs.readFileSync(path.join(state,'worker.json')));return h.status==='RUNNING'&&h.pid!==Number(fs.existsSync(path.join(dir,'old-pid'))?fs.readFileSync(path.join(dir,'old-pid')):0);}catch{return false;}});
  const h=JSON.parse(fs.readFileSync(path.join(state,'worker.json')));assert.equal(h.manual,false);assert.equal(h.scheduling,false);assert.equal(h.supervised,true);fs.writeFileSync(path.join(dir,'old-pid'),String(h.pid));run.child.kill('SIGTERM');assert.equal((await run.finished)[0],0,run.output());
  assert.equal(fs.existsSync(path.join(dir,'NETWORK_ATTEMPT')),false,fs.existsSync(path.join(dir,'NETWORK_ATTEMPT'))?fs.readFileSync(path.join(dir,'NETWORK_ATTEMPT'),'utf8'):run.output());assert.equal(fs.readFileSync(path.join(state,'state.json'),'utf8'),store);assert.equal(fs.readFileSync(path.join(state,'network.jsonl'),'utf8'),'historical-ledger-do-not-change');assert.equal(fs.existsSync(path.join(state,'execution.lock')),false);
 }
});
test('runtime corpus ignored; immutable reviewed inputs outside corpus are not ignored',()=>{
 for(const f of ['.savlivo/research-v2/test/network.jsonl','.savlivo/v2-operations/state.json','.savlivo/v2-operations-inputs/test.json'])assert.equal(spawnSync('git',['check-ignore','-q',f],{cwd:repositoryRoot}).status,0);
 assert.equal(spawnSync('git',['check-ignore','-q','docs/catalog/global-47/research-v2/v15-mature-handoff-20260921/lifecycle-input.json'],{cwd:repositoryRoot}).status,1);
});
test('tsx runtime dependency and lockfile agree without package version upgrades',()=>{const pkg=JSON.parse(fs.readFileSync(new URL('../package.json',import.meta.url)));const lock=JSON.parse(fs.readFileSync(new URL('../../../package-lock.json',import.meta.url)));assert(pkg.dependencies.tsx);assert.equal(pkg.devDependencies.tsx,undefined);assert.equal(lock.packages['services/api'].dependencies.tsx,pkg.dependencies.tsx);assert.equal(lock.packages['node_modules/tsx'].dev,undefined);assert.equal(pkg.scripts.start,'node scripts/production-runtime.mjs');});
test('supervised poller drains V2 children when launcher IPC disappears unexpectedly',async t=>{
 const dir=fixture(t),job=write(dir,'job.mjs',`import fs from 'node:fs';fs.writeFileSync(${JSON.stringify(path.join(dir,'job.pid'))},String(process.pid));process.on('SIGTERM',()=>{fs.writeFileSync(${JSON.stringify(path.join(dir,'checkpoint'))},'saved');process.exit(0);});setInterval(()=>{},1000);`);
 const poller=write(dir,'orphan-guard.mjs',`import {spawn} from 'node:child_process';import fs from 'node:fs';import {runPoller,executionSpawnOptions} from ${JSON.stringify(pollerUrl)};fs.writeFileSync(${JSON.stringify(path.join(dir,'poller.pid'))},String(process.pid));const children=new Set();await runPoller({children,heartbeat:()=>{},tick:async()=>{if(children.size)return;children.add(spawn(process.execPath,[${JSON.stringify(job)}],{stdio:'ignore',...executionSpawnOptions()}));},intervalMs:50,drainMs:500});`);
 const run=launch(t,dir,[{name:'poller',args:[poller],ipc:true}]);await until(()=>fs.existsSync(path.join(dir,'job.pid')));run.child.kill('SIGKILL');await run.finished;await until(()=>!live(Number(fs.readFileSync(path.join(dir,'poller.pid'))))&&!live(Number(fs.readFileSync(path.join(dir,'job.pid')))));assert.equal(fs.readFileSync(path.join(dir,'checkpoint'),'utf8'),'saved');
});
test('missing configured genesis bootstrap fails before API or poller spawn',()=>{
 const r=spawnSync(process.execPath,[new URL('./production-runtime.mjs',import.meta.url).pathname],{cwd:repositoryRoot,encoding:'utf8',env:{...process.env,V2_OPERATIONS_REPOSITORY_ROOT:repositoryRoot,V2_OPERATIONS_LIFECYCLE_INPUT:'.savlivo/absent-genesis-deployment-test-input.json',ANALYTICS_V2_OPERATIONS_ENABLED:'false',ANALYTICS_V2_RUN_CONTROL_ENABLED:'false',ANALYTICS_V2_SCHEDULING_ENABLED:'false'}});
 assert.equal(r.status,1);assert.match(r.stderr,/GENESIS_DEPLOYMENT_MISSING_OR_UNSAFE_FILE/);assert(!r.stdout.includes('CHILD_STARTED'));
});
