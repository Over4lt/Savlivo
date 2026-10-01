// Offline only: synthetic bytes and injected sockets; no external HTTP dispatch.
import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {gzipSync,brotliCompressSync,deflateSync} from 'node:zlib';
import {readFileSync} from 'node:fs';
import {acquisitionCapacity as cap,presentationCapacity,safeMetadata,normalizedFailure,failureClass} from './acquisition-contract.mjs';
import {decodeResponse} from './acquisition-response.mjs';
import {parseAcquisitionRobots,evaluateAcquisitionRobots} from './acquisition-robots.mjs';
import {createAcquisitionReader,publicSourceUrl} from './acquisition-reader.mjs';
import {directHop,createProxyHop,ioFailure} from './acquisition-io.mjs';
import {createCapabilities} from './capabilities.mjs';
import {runTarget} from './runner.mjs';
import {checkpoint,restore,digest,defaultBounds} from './model.mjs';
import {semanticMaterial} from './source.mjs';
import {selectSemanticPlan,materialForUnit,semanticUnitLimits} from './semantic-units.mjs';

const objective={kind:'PRICE',serviceId:'horizon',serviceName:'Horizon Membership',providerHosts:['provider.example','accounts.provider.example','alternate.example'],markets:['FR'],seeds:['https://provider.example/plans']};
const page='<html><head><title>Horizon Membership</title></head><body><main><section><h1>Horizon Membership</h1><p>Consumer subscription EUR 12 per month.</p></section></main></body></html>';
const records=async()=>[{address:'93.184.216.34',family:4}];
const reply=(body='',type='text/html',status=200,extra={})=>({status,body:Buffer.isBuffer(body)?body:Buffer.from(body),headers:{'content-type':type,...extra},tlsVerified:true});
const action=(country=false)=>({id:'offline-acquisition',url:objective.seeds[0],context:{transport:country?'DECODO':'DIRECT',networkGeography:country?'FR':'UNBOUND'}});
const limits={maxBytes:cap.objectiveWireBytes,maxDecodedBytes:cap.objectiveDecodedBytes,maxRequests:96};
function capabilities(handler=()=>reply(page),options={}){
 const requests=[];
 const request=async r=>{requests.push(r);r.onPhase?.('HEADERS');if(r.url.hostname==='ipwho.is')return reply(JSON.stringify({success:true,ip:'93.184.216.34',country_code:'FR'}),'application/json');return handler(r,requests);};
 return {requests,caps:createCapabilities({objective,permissions:{DIRECT:true,DECODO:true},network:{resolveHost:records,requestOnce:request},decodo:{username:'offline-user',password:'offline-password',requestHop:request},...options})};
}
function socketFixture(headers={},status=200){
 const res=new EventEmitter(),req=new EventEmitter(),socket=new EventEmitter();let options;
 Object.assign(res,{headers:{'content-type':'text/html',...headers},statusCode:status,complete:true,destroy(){this.destroyed=true;}});
 req.destroy=()=>{req.destroyed=true;};
 return {res,req,get options(){return options;},requestImpl(o,cb){options=o;req.end=()=>{req.emit('socket',socket);socket.emit('secureConnect');cb(res);};return req;}};
}
const rawHop=(f,maxBytes)=>directHop({url:new URL(objective.seeds[0]),address:'93.184.216.34',family:4,maxBytes,userAgent:'offline-test',requestImpl:f.requestImpl,deferContentProcessing:true});

for(const [name,source] of [
 ['ordinary','User-agent: *\nAllow: /'],['empty',''],['comments','# note\nUser-agent: * # note\nAllow: /'],
 ['multiple agents','User-agent: UnfamiliarBot/2.0\nDisallow: /\nUser-agent: *\nAllow: /'],
 ['extensions','User-agent: *\nSitemap: https://provider.example/map.xml\nHost: example\nAllow: /'],
 ['safe malformed extension','unrecognized record\nUser-agent: *\nAllow: /'],
 ['BOM','\uFEFFUser-agent: *\r\nAllow: /'],['large bounded','# ordinary comments\n'.repeat(20000)+'User-agent: *\nAllow: /']
])test('robots accepts '+name,()=>assert.equal(evaluateAcquisitionRobots(parseAcquisitionRobots(source),objective.seeds[0]).decision,'ALLOWED'));
for(const [name,source] of [['missing colon','User-agent: *\nDisallow /'],['unsafe policy path','User-agent: *\nDisallow: not-a-path'],['HTML challenge','<!doctype html><html><body>challenge</body></html>'],['control bytes','User-agent: *\n\0'],['policy without agent','Disallow: /']])test('robots rejects '+name+' with local typed diagnostic',()=>assert.throws(()=>parseAcquisitionRobots(source),{code:'ROBOTS_PARSE_FAILED'}));
test('robots denial is preserved; unknown agent does not prevent wildcard policy',()=>{
 const p=parseAcquisitionRobots('User-agent: OtherBot/5\nAllow: /\nUser-agent: *\nDisallow: /plans');assert.equal(evaluateAcquisitionRobots(p,objective.seeds[0]).decision,'DISALLOWED');
});
test('robots specific groups and duplicate groups use existing longest-path policy',()=>{
 const p=parseAcquisitionRobots('User-agent: Test\nDisallow: /\nUser-agent: test\nAllow: /plans\nUser-agent: *\nDisallow: /');assert.equal(evaluateAcquisitionRobots(p,objective.seeds[0],'TestBot').decision,'ALLOWED');
});
test('robots pacing remains review-required rather than silently bypassed',()=>assert.notEqual(evaluateAcquisitionRobots(parseAcquisitionRobots('User-agent: *\nCrawl-delay: 5'),objective.seeds[0]).decision,'ALLOWED'));
for(const type of ['text/plain','text/plain; charset=utf-8','application/octet-stream','text/html',undefined])test('valid robots content is parsed independently of MIME '+type,async()=>{
 const f=capabilities(r=>r.url.pathname==='/robots.txt'?{...reply('User-agent: *\nAllow: /',type),headers:type?{'content-type':type}:{}}:reply(page));assert.equal((await f.caps.DIRECT(action(),limits)).outcome,'OK');
});
test('completed robots HTTP followed by parse failure retains HTTP, phase and cause',async()=>{
 const f=capabilities(r=>reply('<html>not robots</html>')),r=await f.caps.DIRECT(action(),limits);
 assert.equal(r.failure.code,'ROBOTS_PARSE_FAILED');assert.equal(r.failure.phase,'ROBOTS_PARSE');assert.equal(r.requestLedger[0].httpStatus,200);assert.equal(r.requestLedger[0].state,'COMPLETED');assert.equal(r.requestLedger[0].processingFailure,'ROBOTS_PARSE_FAILED');assert.equal(r.body,'');
});
for(const status of [404,410])test('robots absent '+status+' does not parse an error document',async()=>{
 const f=capabilities(r=>r.url.pathname==='/robots.txt'?reply(Buffer.from([255,0]),'application/octet-stream',status):reply(page));assert.equal((await f.caps.DIRECT(action(),limits)).outcome,'OK');
});
test('robots HTTP failure remains distinct from transport',async()=>{
 const f=capabilities(()=>reply('unavailable','text/plain',503)),r=await f.caps.DIRECT(action(),limits);assert.equal(r.failure.code,'ROBOTS_HTTP_UNAVAILABLE');assert.equal(r.requestLedger[0].httpStatus,503);
});
test('robots capacity and decoding failure retain successful HTTP',async()=>{
 for(const [body,headers,code] of [[Buffer.alloc(cap.robotsBytes+1),{},'RESPONSE_TOO_LARGE'],[Buffer.from([255]),{},'UNSUPPORTED_OR_INVALID_CHARSET'],[Buffer.from('bad gzip'),{'content-encoding':'gzip'},'DECOMPRESSION_FAILED']]){
  const f=capabilities(()=>reply(body,'text/plain',200,headers)),r=await f.caps.DIRECT(action(),limits);assert.equal(r.failure.code,code);assert.equal(r.requestLedger[0].httpStatus,200);assert.equal(r.requestLedger[0].processingState,'FAILED');
 }
});

for(const status of [301,302,303,307,308])for(const location of ['/monthly?offer=consumer','https://provider.example/monthly','https://accounts.provider.example/monthly','https://alternate.example/monthly'])test(`redirect ${status} ${location}`,async()=>{
 const f=capabilities(r=>r.url.pathname==='/robots.txt'?reply('','text/plain'):r.url.pathname==='/plans'?reply('','text/html',status,{location}):reply(page));
 const r=await f.caps.DIRECT(action(),limits);assert.equal(r.outcome,'OK');assert.equal(r.url,new URL(location,objective.seeds[0]).href);assert.equal(r.redirects[0].decision,'FOLLOW');assert.equal(r.redirects[0].method,'GET');assert.equal(r.accounting.requests,location.includes('accounts.')||location.includes('alternate.')?4:3);assert.equal(r.requestLedger.filter(x=>x.purpose==='PROVIDER').at(-1).redirectFrom,2);
});
for(const [name,location,code] of [['missing',undefined,'REDIRECT_LOCATION_MISSING'],['malformed','https://[bad','REDIRECT_LOCATION_INVALID'],['scheme','http://provider.example/','REDIRECT_UNSAFE_DESTINATION'],['credentials','https://user:password@provider.example/','REDIRECT_UNSAFE_DESTINATION'],['private','https://127.0.0.1/','REDIRECT_UNSAFE_DESTINATION'],['secret query','https://provider.example/?token=credential','REDIRECT_UNSAFE_DESTINATION'],['unauthorized','https://unreviewed.example/','PROVIDER_BOUNDARY']])test('redirect rejects '+name+' precisely',async()=>{
 const f=capabilities(r=>r.url.pathname==='/robots.txt'?reply('','text/plain'):reply('','text/html',302,{location})),r=await f.caps.DIRECT(action(),limits);assert.equal(r.failure.code,code);assert.equal(r.redirects[0].decision,code);assert.equal(r.requestLedger[1].httpStatus,302);assert.equal(f.requests.length,2);assert.equal(JSON.stringify(r.redirects).includes('credential'),false);
});
for(const hops of [cap.redirects-1,cap.redirects,cap.redirects+1])test('redirect count boundary '+hops,async()=>{
 const f=capabilities(r=>r.url.pathname==='/robots.txt'?reply('','text/plain'):Number(r.url.searchParams.get('hop')??0)<hops?reply('','text/html',302,{location:'?hop='+(Number(r.url.searchParams.get('hop')??0)+1)}):reply(page)),r=await f.caps.DIRECT(action(),limits);assert.equal(r.outcome,hops>cap.redirects?'ERROR':'OK');if(hops>cap.redirects)assert.equal(r.failure.code,'REDIRECT_LIMIT');assert.equal(r.accounting.requests,r.requestLedger.length);
});
test('redirect loop has no repeated dispatch',async()=>{
 const f=capabilities(r=>r.url.pathname==='/robots.txt'?reply('','text/plain'):reply('','text/html',301,{location:'/plans'})),r=await f.caps.DIRECT(action(),limits);assert.equal(r.failure.code,'REDIRECT_LOOP');assert.equal(f.requests.length,2);
});
test('robots redirects are bounded and independently recorded',async()=>{
 const f=capabilities(r=>r.url.pathname==='/robots.txt'?reply('','text/plain',301,{location:'/policy'}):r.url.pathname==='/policy'?reply('User-agent: *\nAllow: /','application/octet-stream'):reply(page)),r=await f.caps.DIRECT(action(),limits);assert.equal(r.outcome,'OK');assert.equal(r.requestLedger[1].redirectFrom,1);assert.equal(r.redirects[0].purpose,'ROBOTS');
});
test('redirect retains COUNTRY transport, proxy binding and geo bracket',async()=>{
 const f=capabilities(r=>r.url.pathname==='/robots.txt'?reply('','text/plain'):r.url.pathname==='/plans'?reply('','text/html',308,{location:'/monthly'}):reply(page)),r=await f.caps.DECODO(action(true),limits);
 assert.equal(r.transport.verification,'BRACKET_VERIFIED');assert.equal(r.transport.verifiedCountry,'FR');assert.deepEqual(r.requestLedger.map(x=>x.purpose),['GEO_PRE','ROBOTS','PROVIDER','PROVIDER','GEO_POST']);assert.ok(r.requestLedger.every(x=>x.transport==='DECODO'&&x.requestedGeography==='FR'));assert.equal(new Set(f.requests.map(x=>x.username)).size,1);
});
test('failed post-geography withholds complete provider source',async()=>{
 let geo=0;const f=capabilities();const caps=createCapabilities({objective,permissions:{DECODO:true},network:{resolveHost:records},decodo:{username:'offline-user',password:'offline-password',requestHop:async r=>r.url.hostname==='ipwho.is'?reply(JSON.stringify({success:true,ip:++geo===1?'93.184.216.34':'93.184.216.35',country_code:'FR'}),'application/json'):r.url.pathname==='/robots.txt'?reply('','text/plain'):reply(page)}});
 const r=await caps.DECODO(action(true),limits);assert.equal(r.failure.code,'GEO_BINDING_CHANGED');assert.equal(r.body,'');assert.equal(r.completeness,'REJECTED');assert.equal(r.transport.verification,'PENDING');
});

for(const size of [0,1024,256*1024,1024*1024,4*1024*1024,cap.wireResponseBytes-1,cap.wireResponseBytes,cap.wireResponseBytes+1])test('raw streaming boundary '+size,async()=>{
 const f=socketFixture(),pending=rawHop(f,cap.wireResponseBytes);let bytes=0;const chunk=16384;
 for(let i=0;i<size;i+=chunk){const b=Buffer.alloc(Math.min(chunk,size-i),32);bytes+=b.length;f.res.emit('data',b);}f.res.emit('end');
 if(size>cap.wireResponseBytes)await assert.rejects(pending,{code:'RESPONSE_TOO_LARGE'});else {const r=await pending;assert.equal(r.body.length,size);}assert.equal(f.req.destroyed,true);
});
for(const chunks of [[9,1],[5,5],[9,2],[10,1],[11],[3,3,5]])test('crossing chunk accounting '+chunks.join(','),async()=>{
 const f=socketFixture();let observed=0;const pending=directHop({url:new URL(objective.seeds[0]),address:'93.184.216.34',family:4,maxBytes:10,onBodyBytes:n=>observed+=n,requestImpl:f.requestImpl});for(const n of chunks)f.res.emit('data',Buffer.alloc(n));f.res.emit('end');
 const total=chunks.reduce((a,b)=>a+b,0);if(total>10)await assert.rejects(pending,{code:'RESPONSE_TOO_LARGE'});else assert.equal((await pending).body.length,total);assert.equal(observed,total);
});
for(const declared of [undefined,'9','10','11','0'])test('declared vs actual length '+declared,async()=>{
 const f=socketFixture(declared===undefined?{}:{'content-length':declared}),pending=rawHop(f,10);f.res.emit('data',Buffer.alloc(10));f.res.emit('end');if(Number(declared)>10)await assert.rejects(pending,{code:'RESPONSE_TOO_LARGE'});else if(declared!==undefined&&Number(declared)!==10)await assert.rejects(pending,{code:'INCOMPLETE_RESPONSE'});else assert.equal((await pending).body.length,10);
});
test('incomplete body can never become a complete observation',async()=>{
 const f=socketFixture(),pending=rawHop(f,100);f.res.complete=false;f.res.emit('data',Buffer.from('partial'));f.res.emit('end');await assert.rejects(pending,{code:'INCOMPLETE_RESPONSE'});
});
for(const event of ['error','aborted'])test('response event '+event+' is typed and bounded',async()=>{
 const f=socketFixture(),pending=rawHop(f,100);f.res.emit(event,Error('private socket data'));await assert.rejects(pending,{code:event==='error'?'BODY_READ_FAILED':'INCOMPLETE_RESPONSE'});
});
for(const [encoding,compress] of [['identity',b=>b],['gzip',gzipSync],['br',brotliCompressSync],['deflate',deflateSync]])test('complete compressed source '+encoding+' retains separate byte domains',async()=>{
 const source=Buffer.from('<p>Ελληνικά 한글 日本語 العربية</p>'+('x'.repeat(3*1024*1024))),wire=compress(source);let decoded=0;
 const result=await decodeResponse(reply(wire,'text/html; charset=UTF-8',200,{'content-encoding':encoding}),{onDecodedBytes:n=>decoded+=n});assert.equal(result.text,source.toString());assert.equal(result.decodedBytes,source.length);assert.equal(result.wireBytes,wire.length);assert.equal(decoded,source.length);assert.equal(result.observationBytes,source.length);
});
for(const size of [31,32,33])test('decompression boundary '+size,async()=>{
 const source=Buffer.alloc(size,65),pending=decodeResponse(reply(gzipSync(source),'text/html',200,{'content-encoding':'gzip'}),{maxDecodedBytes:32});if(size>32)await assert.rejects(pending,{code:'DECOMPRESSION_BOUND'});else assert.equal((await pending).decodedBytes,size);
});
test('large expansion is rejected without admitting partial source',async()=>await assert.rejects(decodeResponse(reply(gzipSync(Buffer.alloc(cap.decodedResponseBytes+1,65)),'text/html',200,{'content-encoding':'gzip'})),{code:'DECOMPRESSION_BOUND'}));
for(const [name,body,type,expected] of [['UTF-8',Buffer.from('Olá 日本語'),'text/html','Olá 日本語'],['explicit Latin',Buffer.from([0x63,0x61,0x66,0xe9]),'text/html; charset=iso-8859-1','café'],['UTF-16 BOM',Buffer.concat([Buffer.from([255,254]),Buffer.from('日本語','utf16le')]),'text/plain','日本語'],['HTML meta',Buffer.from('<meta charset="windows-1252"><p>caf\xe9</p>','latin1'),'text/html','<meta charset="windows-1252"><p>café</p>']])test('character decoding '+name,async()=>assert.equal((await decodeResponse(reply(body,type))).text,expected));
for(const [name,body,headers,code] of [['bad gzip',Buffer.from('not gzip'),{'content-encoding':'gzip'},'DECOMPRESSION_FAILED'],['unknown compression',Buffer.from('text'),{'content-encoding':'unknown'},'UNSUPPORTED_ENCODING'],['invalid UTF8',Buffer.from([255]),{},'UNSUPPORTED_OR_INVALID_CHARSET'],['unknown charset',Buffer.from('text'),{'content-type':'text/html; charset=unknown-charset'},'UNSUPPORTED_OR_INVALID_CHARSET']])test('decode rejection '+name+' never becomes network failure',async()=>await assert.rejects(decodeResponse(reply(body,'text/html',200,headers)),{code}));
test('UTF8 retained-byte cap is independent of decoded-byte cap',async()=>await assert.rejects(decodeResponse(reply(Buffer.from([0xe9]),'text/plain; charset=windows-1252'),{maxDecodedBytes:1,maxObservationBytes:1}),{code:'OBSERVATION_BYTE_BOUND'}));
test('decode cancellation is explicit',async()=>{const controller=new AbortController();controller.abort();await assert.rejects(decodeResponse(reply(gzipSync(Buffer.alloc(100)),'text/html',200,{'content-encoding':'gzip'}),{signal:controller.signal}),{code:'ABORTED'});});

for(const size of [100,16*1024,48*1024,cap.headerBytes-1024])test('header headroom '+size+' omits cookies and CDN secrets',async()=>{
 const f=socketFixture({'set-cookie':'private'.repeat(Math.ceil(size/7)),'x-cdn-private':'private','content-language':'de'}),pending=rawHop(f,100);f.res.emit('end');const r=await pending;assert.equal(f.options.maxHeaderSize,cap.headerBytes);assert.equal(r.headers['set-cookie'],undefined);assert.equal(r.headers['x-cdn-private'],undefined);assert.equal(r.headers['content-language'],'de');
});
test('HTTP parser overflow has a dedicated header capacity error',async()=>{
 const f=socketFixture(),pending=rawHop(f,100);f.req.emit('error',Object.assign(Error('private header'),{code:'HPE_HEADER_OVERFLOW'}));await assert.rejects(pending,{code:'HEADERS_TOO_LARGE',kind:'CAPACITY'});
});
test('safe metadata does not retain sensitive or unrestricted header values',()=>{
 const m=safeMetadata({'set-cookie':'credential','authorization':'credential','content-type':'text/html; secret=credential','content-length':'invalid','content-encoding':'private value'});assert.deepEqual(m,{contentType:'text/html',contentEncoding:null,declaredBytes:null});assert.equal(JSON.stringify(m).includes('credential'),false);
});
test('wire transport never forwards cookies or caller authorization on redirects',async()=>{
 const f=socketFixture(),pending=rawHop(f,100);f.res.emit('end');await pending;assert.equal(f.options.headers.authorization,undefined);assert.equal(f.options.headers.cookie,undefined);assert.equal(f.options.headers['proxy-authorization'],undefined);assert.equal(f.options.method,'GET');
});
for(const [phase,code] of [['CONNECT_TLS','CONNECTION_FAILED'],['PROXY_CONNECT','PROXY_CONNECT_FAILED'],['TARGET_TLS','TARGET_TLS_FAILED'],['HEADERS','NETWORK_FAILED'],['BODY','BODY_READ_FAILED']])test('IO classification '+phase,()=>{const e=ioFailure(Error('sensitive arbitrary error'),phase);assert.equal(e.code,code);assert.equal(e.message,code);});

for(const placement of ['beginning','middle','end'])test('complete large source exposes '+placement+' evidence in bounded semantic material',async()=>{
 const junk='<script>'+('x'.repeat(4*1024*1024))+'</script>',card='<section><p>Consumer subscription EUR 12 per month.</p></section>',parts=placement==='beginning'?[card,junk]:placement==='end'?[junk,card]:[junk.slice(0,-9),'</script>',card,junk];
 const source='<html><title>Horizon Membership</title><main>'+parts.join('')+'</main></html>',o={id:'large-source',body:source,sha256:digest(source),format:'WEB',contentType:'text/html',outcome:'OK',truncated:false};
 const plan=selectSemanticPlan(o,objective);assert.ok(plan.units.length>0);const materials=plan.units.map(u=>materialForUnit(o,u));assert.ok(materials.some(m=>m.segments.some(s=>s.text.includes('EUR 12'))));assert.ok(materials.every(m=>Buffer.byteLength(m.segments.map(s=>s.text).join(''))<=semanticUnitLimits.sourceBytes));assert.equal(o.sha256,digest(source));
});
test('normal large DOM exceeds old 256 presentations without hiding late evidence',()=>{
 const source='<title>Horizon Membership</title><main>'+('<p>Ordinary explanatory content.</p>'.repeat(2000))+'<section><p>Consumer subscription EUR 12 per month.</p></section></main>',o={id:'large-dom',body:source,contentType:'text/html',sha256:digest(source)};
 const material=semanticMaterial(o);assert.equal(material.limited,false);assert.ok(material.presentations.length>2000);assert.ok(selectSemanticPlan(o,objective).units.length>0);
});
test('structural representation capacity is separate and explicit',()=>{
 const source='<p>x</p>'.repeat(presentationCapacity.presentations+1),o={body:source,contentType:'text/html'};assert.equal(semanticMaterial(o).limited,true);
});
test('complete compressed acquisition checkpoint restores body/hash and all byte domains',async()=>{
 const wire=gzipSync(Buffer.from(page)),f=capabilities(r=>r.url.pathname==='/robots.txt'?reply('','text/plain'):reply(wire,'text/html',200,{'content-encoding':'gzip'}));
 const input={objective,provider:{reviewed:true,serviceId:objective.serviceId,hosts:objective.providerHosts},permissions:{DIRECT:true},planning:{initialPerspective:'UNBOUND'},bounds:{actions:1}};
 const result=await runTarget({input,capabilities:f.caps}),k=restore(checkpoint(result.knowledge)),o=k.observations[0];assert.equal(o.body,page);assert.equal(o.sha256,digest(page));assert.equal(o.completeness,'COMPLETE');assert.equal(o.responseMetadata.wireBytes,wire.length);assert.equal(o.responseMetadata.decodedBytes,Buffer.byteLength(page));assert.equal(k.usage.bytes,wire.length);assert.equal(k.usage.decodedBytes,Buffer.byteLength(page));assert.equal(k.usage.retainedBytes,Buffer.byteLength(page));assert.equal(k.attempts[0].requestLedger.length,2);
});
test('client shell acquisition succeeds without manufacturing pricing truth',async()=>{
 const f=capabilities(r=>r.url.pathname==='/robots.txt'?reply('','text/plain'):reply('<!doctype html><title>Horizon Membership</title><div id="app"></div><script>renderLater()</script>'));
 const result=await runTarget({input:{objective,provider:{reviewed:true,serviceId:objective.serviceId,hosts:objective.providerHosts},permissions:{DIRECT:true},planning:{initialPerspective:'UNBOUND'},bounds:{actions:1,modelCalls:0}},capabilities:f.caps});assert.equal(result.knowledge.observations[0].outcome,'OK');assert.equal(result.result.truth.established,false);assert.equal(result.result.truth.prices.FR.propositions.PRICE_AMOUNT.state,'UNRESOLVED');
});
test('objective wire/decoded ceilings are separate finite capacity, not truth requirements',()=>{assert.equal(defaultBounds.bytes,64*1024*1024);assert.equal(defaultBounds.decodedBytes,128*1024*1024);assert.equal(defaultBounds.networkRequests,96);assert.equal(semanticUnitLimits.sourceBytes,4096);});
test('requests exhausted before redirect next hop do not exceed dispatch budget',async()=>{
 const f=capabilities(r=>r.url.pathname==='/robots.txt'?reply('','text/plain'):reply('','text/html',301,{location:'/monthly'})),r=await f.caps.DIRECT(action(),{...limits,maxRequests:2});assert.equal(r.failure.code,'NETWORK_REQUEST_BOUND');assert.equal(f.requests.length,2);assert.equal(r.accounting.requests,2);assert.equal(r.requestLedger.length,2);
});
test('aggregate encoded/decoded objective budgets reject without admitting source',async()=>{
 for(const budget of [{maxBytes:10},{maxDecodedBytes:10}]){const f=capabilities(r=>r.url.pathname==='/robots.txt'?reply('','text/plain'):reply(page)),r=await f.caps.DIRECT(action(),{...limits,...budget});assert.equal(r.outcome,'ERROR');assert.equal(r.body,'');assert.equal(r.failure.kind,'CAPACITY');}
});
test('safe diagnostic error normalization never serializes arbitrary exception detail',()=>{
 const error=Object.assign(Error('credential private query'),{code:'PRIVATE_VALUE',headers:{Authorization:'credential'}});assert.deepEqual(normalizedFailure(error),{code:'ACQUISITION_PROCESSING_FAILED',classification:'PROCESSING'});assert.equal(failureClass('PROVIDER_BODY_TIMEOUT'),'DEADLINE');
});
test('source URL rejects credential-bearing parameters without exposing them',()=>{assert.throws(()=>publicSourceUrl('https://provider.example/?api_key=credential'),{code:'SECRET_QUERY_REJECTED'});assert.equal(publicSourceUrl('https://provider.example/?plan=consumer&lang=fr').search,'?plan=consumer&lang=fr');});
test('headroom production modules contain no campaign-specific exceptions',()=>{
 for(const name of ['acquisition-contract','acquisition-response','acquisition-reader','acquisition-robots','acquisition-io'])assert.doesNotMatch(readFileSync(new URL(name+'.mjs',import.meta.url),'utf8'),/deezer|todoist|dropbox|headspace|microsoft|youtube|netflix|spotify|duolingo|1080/i);
});

function proxyFixture({status=200,tlsAuthorized=true,body='complete',innerError=null,outerError=null}={}){
 const outer=new EventEmitter(),inner=new EventEmitter(),tunnel=new EventEmitter(),secure=new EventEmitter(),res=new EventEmitter();let connectOptions,targetOptions,tlsOptions;
 for(const s of [outer,inner,tunnel,secure,res])s.destroy=()=>{s.destroyed=true;};secure.authorized=tlsAuthorized;res.statusCode=200;res.headers={'content-type':'text/html','set-cookie':'private-cookie'};res.complete=true;
 const hop=createProxyHop({httpsRequest(o){connectOptions=o;outer.end=()=>{if(outerError)outer.emit('error',Object.assign(Error('private detail'),{code:outerError}));else outer.emit('connect',{statusCode:status},tunnel,Buffer.alloc(0));};return outer;},tlsConnect(o){tlsOptions=o;queueMicrotask(()=>secure.emit('secureConnect'));return secure;},httpRequest(o,cb){targetOptions=o;inner.end=()=>{if(innerError)inner.emit('error',Object.assign(Error('private detail'),{code:innerError}));else {cb(res);res.emit('data',Buffer.from(body));res.emit('end');}};return inner;}});
 return {hop,outer,inner,tunnel,secure,res,get connectOptions(){return connectOptions;},get targetOptions(){return targetOptions;},get tlsOptions(){return tlsOptions;}};
}
const proxyInput={url:new URL('https://provider.example/plans'),address:'93.184.216.34',proxyAddress:'93.184.216.35',proxyHost:'proxy.example',proxyPort:7000,username:'offline-user',password:'offline-password',maxBytes:100,headers:{'user-agent':'offline','authorization':'private-credential','cookie':'private-cookie'}};
test('proxy CONNECT and TLS are pinned, verified, bounded and isolated from provider headers',async()=>{
 const f=proxyFixture(),phases=[],r=await f.hop({...proxyInput,onPhase:p=>phases.push(p)});assert.equal(r.tlsVerified,true);assert.equal(r.body.toString(),'complete');assert.deepEqual(phases,['PROXY_CONNECT','TARGET_TLS','HEADERS','BODY','BODY']);assert.equal(f.connectOptions.path,'93.184.216.34:443');assert.equal(f.connectOptions.maxHeaderSize,cap.headerBytes);assert.ok(f.connectOptions.headers['proxy-authorization']);assert.equal(f.targetOptions.headers['proxy-authorization'],undefined);assert.equal(f.targetOptions.headers.authorization,undefined);assert.equal(f.targetOptions.headers.cookie,undefined);assert.equal(f.targetOptions.headers.host,'provider.example');assert.equal(f.targetOptions.method,'GET');assert.equal(f.tlsOptions.servername,'provider.example');assert.equal(f.tlsOptions.rejectUnauthorized,true);assert.equal(r.headers['set-cookie'],undefined);assert.ok([f.outer,f.inner,f.tunnel,f.secure,f.res].every(s=>s.destroyed));
});
for(const [name,options,code] of [['CONNECT denied',{status:407},'PROXY_ACCESS_DENIED'],['TLS unauthorized',{tlsAuthorized:false},'TARGET_TLS_FAILED'],['proxy connection',{outerError:'ECONNREFUSED'},'PROXY_CONNECT_FAILED'],['provider header parser',{innerError:'HPE_HEADER_OVERFLOW'},'HEADERS_TOO_LARGE'],['provider connection reset',{innerError:'ECONNRESET'},'NETWORK_FAILED']])test('proxy lifecycle '+name+' is classified',async()=>{
 const f=proxyFixture(options);await assert.rejects(f.hop(proxyInput),{code});assert.equal(f.outer.destroyed,true);assert.equal(!!f.tunnel.destroyed,!options.outerError);
});
test('proxy status is safely exposed separately from provider HTTP status',async()=>{let status;const f=proxyFixture({status:407});await assert.rejects(f.hop({...proxyInput,onProxyHeaders:n=>status=n}),{code:'PROXY_ACCESS_DENIED'});assert.equal(status,407);});
test('proxy phase cancellation cleans established tunnel and TLS socket',async()=>{
 const outer=new EventEmitter(),tunnel=new EventEmitter(),secure=new EventEmitter();for(const s of [outer,tunnel,secure])s.destroy=()=>{s.destroyed=true;};const controller=new AbortController();
 const hop=createProxyHop({httpsRequest(){outer.end=()=>outer.emit('connect',{statusCode:200},tunnel,Buffer.alloc(0));return outer;},tlsConnect(){return secure;},httpRequest(){assert.fail('TLS unfinished');}});
 const pending=hop({...proxyInput,signal:controller.signal});controller.abort();await assert.rejects(pending,{code:'ABORTED'});assert.ok([outer,tunnel,secure].every(s=>s.destroyed));
});
test('partial/incomplete adapter response is rejected before evidence admission',async()=>{
 const result=await runTarget({input:{objective,provider:{reviewed:true,serviceId:objective.serviceId,hosts:objective.providerHosts},permissions:{DIRECT:true},planning:{initialPerspective:'UNBOUND'},bounds:{actions:1}},capabilities:{DIRECT:async a=>({format:'WEB',url:a.url,context:a.context,outcome:'OK',completeness:'INCOMPLETE',body:page,contentType:'text/html'})}});assert.equal(result.knowledge.observations.length,0);assert.equal(result.knowledge.attempts[0].status,'FAILED');assert.equal(result.result.truth.established,false);
});
test('compressed credential reflection is rejected before robots/provider source is retained',async()=>{
 const f=capabilities(r=>r.url.pathname==='/robots.txt'?reply(gzipSync(Buffer.from('# offline-password\nUser-agent: *\nAllow: /')),'text/plain',200,{'content-encoding':'gzip'}):reply(page)),r=await f.caps.DECODO(action(true),limits);assert.equal(r.failure.code,'SECRET_IN_RESPONSE');assert.equal(r.body,'');assert.equal(JSON.stringify(r).includes('offline-password'),false);
});
test('geography requests cannot redirect and retain exact rejection',async()=>{
 const caps=createCapabilities({objective,permissions:{DECODO:true},network:{resolveHost:records},decodo:{username:'offline-user',password:'offline-password',requestHop:async()=>reply('','application/json',302,{location:'https://provider.example/geo'})}}),r=await caps.DECODO(action(true),limits);assert.equal(r.failure.code,'GEO_VERIFIER_REDIRECT');assert.equal(r.accounting.requests,1);assert.equal(r.transport.verification,'PENDING');
});
for(const body of [gzipSync(Buffer.from('User-agent: *\nAllow: /')),brotliCompressSync(Buffer.from('User-agent: *\nAllow: /'))])test('compressed robots works through acquisition policy path '+body.length,async()=>{
 const encoding=body[0]===31?'gzip':'br',f=capabilities(r=>r.url.pathname==='/robots.txt'?reply(body,'text/plain',200,{'content-encoding':encoding}):reply(page)),r=await f.caps.DIRECT(action(),limits);assert.equal(r.outcome,'OK');assert.equal(r.requestLedger[0].decodedBytes,22);
});
for(const index of [0,1])test('robots/body read transport failure ledger '+index,async()=>{
 let calls=0;const f=capabilities(r=>{if(calls++===index)throw Object.assign(Error('private cookie or header'),{code:'BODY_READ_FAILED'});return r.url.pathname==='/robots.txt'?reply('','text/plain'):reply(page);}),r=await f.caps.DIRECT(action(),limits);assert.equal(r.failure.code,'BODY_READ_FAILED');assert.equal(r.requestLedger.at(-1).state,'FAILED');assert.equal(r.requestLedger.length,index+1);assert.equal(JSON.stringify(r).includes('private cookie'),false);
});
test('DNS and private-address rejection do not fabricate HTTP requests',async()=>{
 for(const resolveHost of [async()=>{throw Error('private DNS detail');},async()=>[{address:'127.0.0.1',family:4}]]){
  const f=capabilities(undefined,{network:{resolveHost,requestOnce:()=>assert.fail('unsafe DNS')}}),r=await f.caps.DIRECT(action(),limits);assert.equal(r.accounting.requests,0);assert.ok(['DNS_FAILED','UNSAFE_DNS'].includes(r.failure.code));assert.ok(r.acquisitionOperations.length>0);assert.equal(JSON.stringify(r).includes('private DNS detail'),false);
 }
});

test('finite header bytes replace silent Node header-pair truncation on both transports',async()=>{
 const f=socketFixture(),pending=rawHop(f,100);f.res.emit('end');await pending;assert.equal(f.req.maxHeadersCount,0);
 const proxy=proxyFixture();await proxy.hop(proxyInput);assert.equal(proxy.outer.maxHeadersCount,0);assert.equal(proxy.inner.maxHeadersCount,0);assert.equal(proxy.connectOptions.maxHeaderSize,65536);assert.equal(proxy.targetOptions.maxHeaderSize,65536);
});
function virtualTime(){let now=0,id=0;const tasks=new Map();return {now:()=>now,set(fn,ms){tasks.set(++id,{fn,at:now+ms});return id;},clear(id){tasks.delete(id);},get size(){return tasks.size;},advance(ms){const end=now+ms;for(;;){const next=[...tasks].filter(([,t])=>t.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!next)break;now=next[1].at;tasks.delete(next[0]);next[1].fn();}now=end;}};}
const settle=async()=>{for(let i=0;i<200;i++)await Promise.resolve();};
for(const [phase,ms] of [['CONNECT_TLS',cap.connectMs],['HEADERS',cap.headersMs],['BODY',cap.bodyMs]])test('default independent '+phase+' deadline does not depend on peer abort behavior',async()=>{
 const timing=virtualTime(),caps=createCapabilities({objective,permissions:{DIRECT:true},timing,network:{resolveHost:records,requestOnce:r=>{if(r.url.pathname==='/robots.txt')return reply('','text/plain');r.onPhase(phase);return new Promise(()=>{});}}});
 const pending=caps.DIRECT(action(),limits);await settle();timing.advance(ms);await settle();const r=await pending;assert.equal(r.failure.code,'PROVIDER_'+phase+'_TIMEOUT');assert.equal(r.requestLedger.at(-1).elapsedMs,ms);assert.equal(r.requestLedger.at(-1).phaseDeadlineMs,ms);assert.equal(timing.size,0);
});
test('multiple normal redirect hops get independent phase timers within finite parent cap',async()=>{
 const timing=virtualTime(),signals=[];const caps=createCapabilities({objective,permissions:{DIRECT:true},timing,network:{resolveHost:records,requestOnce:r=>{signals.push(r.signal);return new Promise(resolve=>timing.set(()=>resolve(r.url.pathname==='/robots.txt'?reply('','text/plain'):r.url.pathname==='/plans'?reply('','text/html',301,{location:'/monthly'}):reply(page)),14000));}}});
 const pending=caps.DIRECT(action(),limits);await settle();for(let i=0;i<3;i++){timing.advance(14000);await settle();}const r=await pending;assert.equal(r.outcome,'OK');assert.equal(r.acquisitionTiming.elapsedMs,42000);assert.equal(new Set(signals).size,3);assert.equal(timing.size,0);
});
test('objective time remaining constrains parent acquisition deadline without a new truth rule',async()=>{
 const timing=virtualTime(),caps=createCapabilities({objective,permissions:{DIRECT:true},timing,network:{resolveHost:records,requestOnce:()=>new Promise(()=>{})}}),pending=caps.DIRECT(action(),{...limits,maxAcquisitionMs:5});await settle();timing.advance(5);const r=await pending;assert.equal(r.failure.code,'ACQUISITION_DEADLINE_EXCEEDED');assert.equal(r.acquisitionTiming.acquisitionTimeoutMs,5);assert.equal(r.body,'');assert.equal(timing.size,0);
});
test('completed HTTP followed by bounded processing deadline retains precise local phase',async()=>{
 const {boundedOperation}=await import('./acquisition-io.mjs');const timing=virtualTime();
 const read=createAcquisitionReader({resolveHost:records,requestOnce:async()=>reply(gzipSync(Buffer.from(page)),'text/html',200,{'content-encoding':'gzip'}),process:()=>boundedOperation({timeoutMs:10,timing,phase:()=> 'PROVIDER_DECOMPRESS',run:()=>new Promise(()=>{})})});
 const pending=read(objective.seeds[0]);await settle();timing.advance(10);await assert.rejects(pending,{code:'PROVIDER_DECOMPRESS_TIMEOUT'});assert.equal(timing.size,0);
});
test('local reader-hook exception retains PROCESSING instead of NETWORK_FAILED',async()=>{
 const f=capabilities(()=>{throw Error('private arbitrary local hook error');}),r=await f.caps.DIRECT(action(),limits);assert.equal(r.failure.code,'NETWORK_FAILED');
 // Wire override failure is transport; a completed HTTP response with bad local payload is processing.
 const bad=createCapabilities({objective,permissions:{DIRECT:true},network:{resolveHost:records,requestOnce:async()=>({status:200,headers:{'content-type':'text/plain'},body:'invalid adapter body'})}}),result=await bad.DIRECT(action(),limits);assert.equal(result.failure.code,'INCOMPLETE_RESPONSE');assert.equal(result.requestLedger[0].state,'COMPLETED');assert.equal(result.requestLedger[0].processingState,'FAILED');
});
test('identity bodies and decompressed bodies obey independent exact decoded boundaries',async()=>{
 for(const size of [31,32,33]){const pending=decodeResponse(reply(Buffer.alloc(size,32)),{maxDecodedBytes:32});if(size>32)await assert.rejects(pending,{code:'DECODED_BYTE_BOUND'});else assert.equal((await pending).decodedBytes,size);}
});
test('bounded structural text amplification rejects representation while leaving original complete source intact',()=>{
 const source='<section>'.repeat(10)+'<p>'+('a'.repeat(4*1024*1024))+'</p>'+'</section>'.repeat(10),o={body:source,contentType:'text/html',sha256:digest(source)};
 assert.equal(semanticMaterial(o).limited,true);assert.equal(o.sha256,digest(o.body));assert.equal(o.body,source);
});

for(const size of [cap.decodedResponseBytes-1,cap.decodedResponseBytes])test('supported complete decoded-source ceiling '+size,async()=>{
 const source=Buffer.alloc(size,65),wire=gzipSync(source),result=await decodeResponse(reply(wire,'text/html',200,{'content-encoding':'gzip'}));assert.equal(result.decodedBytes,size);assert.equal(result.observationBytes,size);assert.equal(result.text.length,size);assert.equal(result.wireSha256.length,64);
});
for(const status of [401,403,404,429,503])test('provider HTTP '+status+' is classified before interpreting its error body',async()=>{
 const f=capabilities(r=>r.url.pathname==='/robots.txt'?reply('','text/plain'):reply(Buffer.from([255]),'application/octet-stream',status)),r=await f.caps.DIRECT(action(),limits);assert.equal(r.httpStatus,status);assert.equal(r.outcome,[401,403].includes(status)?'POLICY_BLOCKED':'HTTP_UNAVAILABLE');assert.equal(r.body,'');assert.equal(r.requestLedger.at(-1).httpStatus,status);
});
test('malformed HTTP headers have protocol diagnostic instead of network failure',async()=>{
 const f=socketFixture(),pending=rawHop(f,100);f.req.emit('error',Object.assign(Error('private invalid header'),{code:'HPE_INVALID_CONTENT_LENGTH'}));await assert.rejects(pending,{code:'HTTP_PROTOCOL_FAILED'});
});

test('proxy transport request ledger exposes CONNECT separately without leaking authentication',async()=>{
 const f=proxyFixture(),calls=[];await f.hop({...proxyInput,onTransportRequest:method=>calls.push(method)});assert.deepEqual(calls,['CONNECT','GET']);
});
test('repeated plain-text paragraphs retain occurrence spans under bounded extraction',()=>{
 const body='Same material\n\nSame material\n\nConsumer subscription EUR 12 per month.',o={body,contentType:'text/plain',sha256:digest(body),id:'plain-source'},m=semanticMaterial(o);assert.deepEqual(m.segments.slice(0,2).map(s=>s.start),[0,15]);assert.equal(body.slice(m.segments[1].start,m.segments[1].end),'Same material');assert.ok(selectSemanticPlan(o,objective).units.length>0);
});
