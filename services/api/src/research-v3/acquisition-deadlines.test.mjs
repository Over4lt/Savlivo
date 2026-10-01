import test from 'node:test';
import assert from 'node:assert/strict';
import {createCapabilities} from './capabilities.mjs';
import {EventEmitter} from 'node:events';
import {boundedOperation,safeOrigin,directHop} from './acquisition-io.mjs';
import {runTarget} from './runner.mjs';
import {restore,checkpoint} from './model.mjs';

const objective={kind:'PRICE',serviceId:'orchard',serviceName:'Orchard Club',providerHosts:['provider.example'],markets:['FR'],seeds:['https://provider.example/plans']};
const action={id:'offline-action',url:objective.seeds[0],context:{transport:'DECODO',networkGeography:'FR'}};
const limits={maxRequests:32,maxBytes:262144};
const flush=async()=>{for(let i=0;i<100;i++)await Promise.resolve();};
function fakeTiming(){let now=0,id=0;const tasks=new Map();return {now:()=>now,set(fn,ms){tasks.set(++id,{fn,at:now+ms});return id;},clear(id){tasks.delete(id);},get size(){return tasks.size;},advance(ms){const end=now+ms;for(;;){const next=[...tasks].filter(([,t])=>t.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!next)break;now=next[1].at;tasks.delete(next[0]);next[1].fn();}now=end;}};}
const reply=(body,type='text/html',status=200,headers={})=>({status,body:Buffer.from(body),headers:{'content-type':type,...headers},tlsVerified:true});
function fixture({stall,phase='HEADERS',fail,acquisitionTimeoutMs=90,redirect=false}={}){
 const timing=fakeTiming(),calls=[];let probes=0;
 const hop=async r=>{
  const purpose=r.url.hostname==='ipwho.is'?(++probes===1?'GEO_PRE':'GEO_POST'):r.url.pathname==='/robots.txt'?'ROBOTS':'PROVIDER';
  calls.push({purpose,r});r.onConnect?.();
  if(phase!=='CONNECT_TLS')r.onTarget?.();
  if(purpose===stall){if(phase==='BODY')r.onBytes?.(2);return new Promise(()=>{});}
  if(purpose===fail)throw Object.assign(Error('arbitrary private detail'),{code:'ECONNRESET'});
  if(purpose.startsWith('GEO_'))return reply(JSON.stringify({success:true,ip:'93.184.216.34',country_code:'FR'}),'application/json');
  if(purpose==='ROBOTS')return reply('User-agent: *\nAllow: /','text/plain');
  if(redirect&&r.url.pathname==='/plans')return reply('','text/html',302,{location:'/monthly'});
  return reply('<h1>Orchard Club</h1><p>Consumer subscription EUR 12 per month.</p>');
 };
 const caps=createCapabilities({objective,permissions:{DECODO:true,DIRECT:true},timeoutMs:15,acquisitionTimeoutMs,timing,network:{resolveHost:async()=>[{address:'93.184.216.34',family:4}],requestOnce:hop},decodo:{username:'fixtureuser',password:'fixturepassword',requestHop:hop}});
 return {timing,calls,caps};
}

test('fresh bounded geography / robots / provider / geography requests have an exact safe ledger',async()=>{
 const f=fixture({redirect:true}),r=await f.caps.DECODO(action,limits);
 assert.equal(r.outcome,'OK');assert.equal(r.transport.verification,'BRACKET_VERIFIED');
 assert.deepEqual(r.requestLedger.map(x=>x.purpose),['GEO_PRE','ROBOTS','PROVIDER','PROVIDER','GEO_POST']);
 assert.equal(r.accounting.requests,5);assert.equal(r.requestLedger.reduce((n,x)=>n+x.bytes,0),r.accounting.bytes);
 assert.deepEqual(r.requestLedger.map(x=>x.sequence),[1,2,3,4,5]);assert.equal(r.requestLedger[3].redirectFrom,3);
 assert.ok(r.requestLedger.every(x=>x.state==='COMPLETED'&&x.deadlineMs===15&&x.acquisitionDeadlineMs===90));
 assert.equal(new Set(f.calls.map(x=>x.r.signal)).size,5);assert.ok(f.calls.every(x=>x.r.signal.aborted));assert.equal(f.timing.size,0);
 const text=JSON.stringify(r.requestLedger);for(const secret of ['fixtureuser','fixturepassword','fields=','country_code'])assert.equal(text.includes(secret),false);
});
for(const [purpose,phase,code] of [
 ['GEO_PRE','HEADERS','GEO_PRE_HEADERS_TIMEOUT'],['ROBOTS','HEADERS','ROBOTS_HEADERS_TIMEOUT'],
 ['PROVIDER','CONNECT_TLS','PROVIDER_CONNECT_TLS_TIMEOUT'],['PROVIDER','HEADERS','PROVIDER_HEADERS_TIMEOUT'],
 ['PROVIDER','BODY','PROVIDER_BODY_TIMEOUT'],['GEO_POST','HEADERS','GEO_POST_HEADERS_TIMEOUT']
])test(`phase deadline retains ${code}`,async()=>{
 const f=fixture({stall:purpose,phase}),pending=f.caps.DECODO(action,limits);await flush();f.timing.advance(15);await flush();const r=await pending;
 assert.equal(r.failure.code,code);const row=r.requestLedger.at(-1);assert.equal(row.purpose,purpose);assert.equal(row.phase,phase);assert.equal(row.elapsedMs,15);assert.equal(row.failure,code);assert.equal(row.state,'FAILED');
 assert.equal(r.requestLedger.length,r.accounting.requests);assert.equal(f.timing.size,0);assert.equal(r.body,'');
});
test('parent acquisition deadline remains finite and wins over a longer child deadline',async()=>{
 const f=fixture({stall:'PROVIDER',acquisitionTimeoutMs:10}),pending=f.caps.DECODO(action,limits);await flush();f.timing.advance(10);await flush();const r=await pending;
 assert.equal(r.failure.code,'ACQUISITION_DEADLINE_EXCEEDED');assert.equal(r.requestLedger.at(-1).failure,r.failure.code);assert.equal(f.timing.size,0);
});
test('explicit caller cancellation is distinguished from phase and parent deadlines',async()=>{
 const f=fixture({stall:'PROVIDER'}),controller=new AbortController(),pending=f.caps.DECODO(action,{...limits,signal:controller.signal});await flush();controller.abort('user cancellation');const r=await pending;
 assert.equal(r.failure.code,'EXPLICIT_CANCELLATION');assert.equal(f.timing.size,0);
});
test('network failure retains normalized phase and excludes arbitrary exception messages',async()=>{
 const f=fixture({fail:'PROVIDER'}),r=await f.caps.DECODO(action,limits);
 assert.equal(r.failure.code,'NETWORK_FAILED');assert.equal(r.failure.requestSequence,3);assert.equal(r.failure.phase,'HEADERS');assert.equal(JSON.stringify(r).includes('arbitrary private detail'),false);
});
test('request budget dispatches and accounts only allowed actual hops',async()=>{
 const f=fixture(),r=await f.caps.DECODO(action,{...limits,maxRequests:2});assert.equal(r.accounting.requests,2);assert.equal(f.calls.length,2);assert.equal(r.requestLedger.length,2);assert.equal(r.failure.kind,'CAPACITY');
});
test('DNS deadline is phase-specific and does not consume HTTP request budget',async()=>{
 const timing=fakeTiming(),caps=createCapabilities({objective,permissions:{DIRECT:true},timeoutMs:15,acquisitionTimeoutMs:90,timing,network:{resolveHost:()=>new Promise(()=>{}),requestOnce:()=>assert.fail('no DNS result')}});
 const pending=caps.DIRECT({...action,context:{transport:'DIRECT',networkGeography:'UNBOUND'}},limits);await flush();timing.advance(15);const r=await pending;
 assert.equal(r.failure.code,'PROVIDER_DNS_TIMEOUT');assert.equal(r.failure.phase,'DNS');assert.equal(r.accounting.requests,0);assert.deepEqual(r.requestLedger,[]);assert.equal(timing.size,0);
});
test('successful operations just before deadlines clear timers and later requests get fresh signals',async()=>{
 const timing=fakeTiming(),parent=new AbortController();let complete,first;
 const p=boundedOperation({signal:parent.signal,timeoutMs:15,timing,phase:()=> 'PROVIDER_BODY',run:s=>{first=s.signal;return new Promise(resolve=>{complete=resolve;});}});
 await flush();timing.advance(14);complete('ok');assert.equal(await p,'ok');assert.equal(timing.size,0);timing.advance(100);assert.equal(parent.signal.aborted,false);
 const second=await boundedOperation({signal:parent.signal,timeoutMs:15,timing,phase:()=> 'GEO_POST_HEADERS',run:s=>{assert.notEqual(s.signal,first);assert.equal(s.signal.aborted,false);return 'next';}});
 assert.equal(second,'next');assert.equal(timing.size,0);
});
test('sequential slow subrequests do not share a single request deadline',async()=>{
 const timing=fakeTiming(),signals=[];let completed=0;
 const caps=createCapabilities({objective,permissions:{DECODO:true},timeoutMs:15,acquisitionTimeoutMs:90,timing,network:{resolveHost:async()=>[{address:'93.184.216.34',family:4}]},decodo:{username:'fixtureuser',password:'fixturepassword',requestHop:r=>{signals.push(r.signal);return new Promise(resolve=>timing.set(()=>{completed++;resolve(r.url.hostname==='ipwho.is'?reply(JSON.stringify({success:true,ip:'93.184.216.34',country_code:'FR'}),'application/json'):r.url.pathname==='/robots.txt'?reply('','text/plain',404):reply('<h1>Orchard Club</h1>'));},10));}}});
 const pending=caps.DECODO(action,limits);await flush();for(let i=0;i<4;i++){timing.advance(10);await flush();}
 const r=await pending;assert.equal(r.outcome,'OK');assert.equal(completed,4);assert.equal(r.acquisitionTiming.elapsedMs,40);assert.deepEqual(r.requestLedger.map(x=>x.elapsedMs),[10,10,10,10]);assert.equal(new Set(signals).size,4);assert.equal(timing.size,0);
});
test('failed acquisition ledger and reservations survive checkpoint restoration',async()=>{
 const f=fixture({fail:'PROVIDER'});let saved;
 const input={objective,provider:{reviewed:true,serviceId:objective.serviceId,hosts:objective.providerHosts},permissions:{DIRECT:true},planning:{initialPerspective:'UNBOUND'},bounds:{actions:1}};
 const r=await runTarget({input,capabilities:f.caps,save:async s=>{saved=s;}});
 const restored=restore(checkpoint(r.knowledge));assert.equal(restored.attempts[0].status,'FAILED');assert.equal(restored.attempts[0].requestLedger.length,2);assert.equal(restored.attempts[0].requestLedger[1].failure,'NETWORK_FAILED');assert.equal(restored.usage.networkRequests,2);
 assert.ok(restored.trace.some(x=>x.event==='ACQUISITION_LEDGER'));assert.equal(restore(saved).attempts[0].requestLedger.length,2);
});
test('ledger origin sanitizer discards userinfo, paths, query parameters and fragments',()=>{
 assert.equal(safeOrigin('https://private-user:private-password@provider.example/account?token=private-token#private'),'https://provider.example');assert.equal(safeOrigin('not a URL'),null);
});

function directFixture(headers={'content-type':'text/html'}){
 const request=new EventEmitter(),response=new EventEmitter(),socket=new EventEmitter();let options;
 response.statusCode=200;response.headers=headers;response.destroy=()=>{response.destroyed=true;};request.destroy=()=>{request.destroyed=true;};
 const requestImpl=(o,callback)=>{options=o;request.end=()=>{request.emit('socket',socket);socket.emit('secureConnect');callback(response);};return request;};
 return {request,response,requestImpl,get options(){return options;}};
}
test('direct hop exposes received headers before a stalled first body byte and cleans sockets on abort',async()=>{
 const f=directFixture(),timing=fakeTiming(),phases=[];let status;
 const pending=boundedOperation({timeoutMs:15,timing,phase:()=> 'PROVIDER_'+phases.at(-1),run:s=>directHop({url:new URL(objective.seeds[0]),address:'93.184.216.34',family:4,signal:s.signal,maxBytes:100,onBodyBytes:()=>{},onPhase:p=>phases.push(p),onHeaders:n=>{status=n;},userAgent:'offline',requestImpl:f.requestImpl})});
 await flush();assert.equal(status,200);assert.equal(phases.at(-1),'BODY');timing.advance(15);await assert.rejects(pending,{code:'PROVIDER_BODY_TIMEOUT'});assert.equal(f.request.destroyed,true);assert.equal(f.response.destroyed,true);assert.equal(timing.size,0);
 let pinned;f.options.lookup('ignored',{},(_error,address)=>{pinned=address;});assert.equal(pinned,'93.184.216.34');assert.equal(f.options.rejectUnauthorized,true);
});
test('direct hop streams bounded bytes and retains no sensitive response headers',async()=>{
 const f=directFixture({'content-type':'text/html','set-cookie':'private-cookie'}),controller=new AbortController();let count=0;
 const pending=directHop({url:new URL(objective.seeds[0]),address:'93.184.216.34',family:4,signal:controller.signal,maxBytes:20,onBodyBytes:n=>{count+=n;},onPhase:()=>{},onHeaders:()=>{},userAgent:'offline',requestImpl:f.requestImpl});
 f.response.emit('data',Buffer.from('test'));f.response.emit('end');const r=await pending;assert.equal(count,4);assert.equal(r.body.toString(),'test');assert.equal(r.headers['set-cookie'],undefined);assert.equal(controller.signal.aborted,false);assert.equal(f.request.destroyed,true);
});
test('direct hop rejects unsupported content and declared oversize before reading a body',async()=>{
 for(const [headers,code] of [[{'content-type':'text/html','content-length':'100'},'RESPONSE_TOO_LARGE'],[{'content-type':'application/pdf'},'UNSUPPORTED_CONTENT'],[{'content-type':'text/html','content-encoding':'gzip'},'UNSUPPORTED_ENCODING']]){
  const f=directFixture(headers);await assert.rejects(directHop({url:new URL(objective.seeds[0]),address:'93.184.216.34',family:4,maxBytes:20,onBodyBytes:()=>assert.fail('no body'),onPhase:()=>{},onHeaders:()=>{},userAgent:'offline',requestImpl:f.requestImpl}),{code});assert.equal(f.request.destroyed,true);assert.equal(f.response.destroyed,true);
 }
});
test('expired operations ignore late body callbacks rather than changing ledger or byte accounting',async()=>{
 const f=fixture({stall:'PROVIDER',phase:'BODY'}),pending=f.caps.DECODO(action,limits);await flush();f.timing.advance(15);const r=await pending,before=JSON.stringify(r);const request=f.calls.at(-1).r;
 request.onBytes(100);request.onTarget();assert.equal(JSON.stringify(r),before);assert.equal(f.timing.size,0);
});

test('simultaneous parent and child deadlines retain the first cause exactly once',async()=>{
 const timing=fakeTiming(),parent=new AbortController();let failures=0;
 timing.set(()=>parent.abort('ACQUISITION_DEADLINE_EXCEEDED'),15);
 const pending=boundedOperation({signal:parent.signal,timeoutMs:15,timing,phase:()=> 'PROVIDER_BODY',onFailure:()=>{failures++;},run:()=>new Promise(()=>{})});
 await flush();timing.advance(15);await assert.rejects(pending,{code:'ACQUISITION_DEADLINE_EXCEEDED'});assert.equal(failures,1);assert.equal(timing.size,0);
});
test('cancellation before scheduled dispatch cannot start a request',async()=>{
 const timing=fakeTiming(),parent=new AbortController();const pending=boundedOperation({signal:parent.signal,timeoutMs:15,timing,phase:()=> 'PROVIDER_HEADERS',run:()=>assert.fail('cancelled before dispatch')});
 parent.abort();await assert.rejects(pending,{code:'EXPLICIT_CANCELLATION'});assert.equal(timing.size,0);
});
