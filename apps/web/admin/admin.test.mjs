import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";
const source=readFileSync(new URL("admin.js",import.meta.url),"utf8");
class Element {
  children=[];listeners={};value="";hidden=false;textContent="";options=[];
  append(...children){this.children.push(...children);this.options.push(...children);}
  replaceChildren(...children){this.children=children;}
  addEventListener(name,handler){this.listeners[name]=handler;}
  setAttribute(key,value){this[key]=value;}
  set innerHTML(_){throw new Error("HTML injection");}
}
function harness(fetch, credentials, page={hostname:"localhost",protocol:"http:",origin:"http://localhost:8080"}) {
  const nodes=Object.fromEntries(["login","register","enrollment","revoke","message","dashboard","filters","market","logout","results"].map(id=>[id,new Element()]));
  nodes.market.options=[new Element()];
  const mockCredential={id:"AA",rawId:new Uint8Array([0]).buffer,type:"public-key",getClientExtensionResults:()=>({}),response:{clientDataJSON:new Uint8Array([0]).buffer,authenticatorData:new Uint8Array([0]).buffer,signature:new Uint8Array([0]).buffer,userHandle:new Uint8Array([0]).buffer,attestationObject:new Uint8Array([0]).buffer}};
  const context={location:page,document:{getElementById:id=>nodes[id],createElement:()=>new Element(),createElementNS:()=>new Element()},
    window:{addEventListener:()=>{},PublicKeyCredential:function(){}},navigator:{credentials:credentials??{get:async()=>mockCredential,create:async()=>mockCredential}},
    fetch:async(url,options)=>url.endsWith("authenticate/options")?response({challengeId:"test",options:{challenge:"AA",rpId:page.hostname,userVerification:"required"}}):fetch(url,options),
    atob,btoa,AbortController,AbortSignal,setTimeout:()=>1,clearTimeout:()=>{},encodeURIComponent};
  vm.runInNewContext(source,context);return nodes;
}
const response=(data,status=200)=>({ok:status===200,status,json:async()=>data});
const overview={markets:[["NO","Norway","NOK"]],collectionEnabled:false,catalogServices:43,newUsers:123456,notes:["<script>bad()</script>"],
  dataQuality:{selectableMarkets:30,registryRows:364,persistedPrices:[]},serviceDistribution:[],events:[{event:"PRIVATE_EVENT_SENTINEL",count:10,actors:10}],entitlements:[],subscriptions:[]};
const submit={preventDefault(){}};
test("Analytics navigation is available after authentication without bypassing disabled reporting",async()=>{
  const requests=[];
  const nodes=harness(async url=>{requests.push(url);return url.endsWith("authenticate/verify")
    ? response({token:"adm_test",expiresInSeconds:900}) : response({...overview,analyticsV2Enabled:false});});
  await nodes.login.listeners.submit(submit);
  const descendants=e=>[e,...e.children.flatMap(descendants)];
  const elements=descendants(nodes.results);
  assert.ok(elements.some(e=>e.href==="#analytics"&&e.textContent==="Analytics"));
  assert.ok(elements.some(e=>e.id==="analytics"));
  assert.ok(elements.some(e=>e.textContent.includes("ANALYTICS_V2_REPORTING_ENABLED")));
  assert.equal(requests.some(url=>url.includes("/analytics")),false);
  await nodes.logout.listeners.click();
  assert.equal(nodes.results.children.length,0);
});
test("production client has only the fixed API target, including reads and logout",async()=>{
  const requests=[];const page={hostname:"admin.savlivo.com",protocol:"https:",origin:"https://admin.savlivo.com",search:"?api=https://evil.invalid"};
  const nodes=harness(async(url,options)=>{requests.push({url,options});return response(url.endsWith("authenticate/verify")?{token:"adm_test",expiresInSeconds:900}:overview);},undefined,page);
  await nodes.login.listeners.submit(submit);await nodes.logout.listeners.click();
  assert.ok(requests.length>=3);
  assert.ok(requests.every(({url,options})=>url.startsWith("https://savlivo-api.onrender.com/v1/admin/")&&options.credentials==="omit"&&options.cache==="no-store"));
  assert.equal(nodes.dashboard.hidden,true);
});
test("production hostname variants and non-HTTPS origins are rejected before network access",()=>{
  for(const origin of ["http://admin.savlivo.com","https://admin.savlivo.com:444","https://admin.savlivo.com.evil.invalid","https://savlivo.com"]) {
    const url=new URL(origin);let calls=0;
    assert.throws(()=>harness(async()=>{calls++;},undefined,{origin,hostname:url.hostname,protocol:url.protocol}),/HTTPS_REQUIRED|ADMIN_ORIGIN_DENIED/);
    assert.equal(calls,0);
  }
});
test("admin-only deployment headers restrict production connections and prohibit framing/caching",()=>{
  const headers=readFileSync(new URL("deploy/webhuset-admin.htaccess",import.meta.url),"utf8");
  for(const value of ["connect-src https://savlivo-api.onrender.com;","frame-ancestors 'none'","X-Frame-Options \"DENY\"","X-Content-Type-Options \"nosniff\"","Referrer-Policy \"no-referrer\"","Cache-Control \"no-store\"","publickey-credentials-get=(self)","publickey-credentials-create=(self)","Options -Indexes"])assert.ok(headers.includes(value),value);
  assert.doesNotMatch(headers.split("\n").filter(line=>!line.startsWith("#")).join("\n"),/http:\/\/localhost|<IfModule|includeSubDomains|preload/);
  const html=readFileSync(new URL("index.html",import.meta.url),"utf8");
  assert.match(html,/connect-src https:\/\/savlivo-api\.onrender\.com http:\/\/localhost:3000/);
  assert.doesNotMatch(source,/localStorage|sessionStorage|URLSearchParams|innerHTML/);
});
test("admin client uses memory token, uses native passkey, renders data as text, and sends bounded filters",async()=>{
  const requests=[];const nodes=harness(async(url,options)=>{requests.push({url,options});return response(url.endsWith("authenticate/verify")?{token:"adm_test",expiresInSeconds:900}:overview);});
  await nodes.login.listeners.submit(submit);
  assert.equal(nodes.login.hidden,true);
  assert.equal(requests[1].options.headers.Authorization,"Bearer adm_test");
  assert.match(requests[1].url,/overview\?market=$/);
  assert.equal(requests[0].options.credentials,"omit");
  const texts=element=>[element.textContent,...element.children.flatMap(texts)];
  assert.ok(texts(nodes.results).includes("<script>bad()</script>")); // Text, never parsed as HTML.
  assert.equal(texts(nodes.results).join(" ").includes("PRIVATE_EVENT_SENTINEL"),false);
  assert.equal(texts(nodes.results).join(" ").includes("123456"),false);
});
test("logout clears sensitive view immediately and rejects late dashboard result",async()=>{
  let complete;let reads=0;
  const nodes=harness(async(url,options)=>{
    if(options.method==="DELETE")return response({ok:true});
    if(url.endsWith("authenticate/verify"))return response({token:"adm_test",expiresInSeconds:900});
    if(++reads===1)return response(overview);
    return new Promise(resolve=>{complete=()=>resolve(response(overview));});
  });
  await nodes.login.listeners.submit(submit);
  nodes.filters.listeners.submit(submit);
  const logout=nodes.logout.listeners.click();
  assert.equal(nodes.dashboard.hidden,true);assert.equal(nodes.results.children.length,0);
  complete();await logout;await new Promise(resolve=>setImmediate(resolve));
  assert.equal(nodes.results.children.length,0);
});
test("expired session hides dashboard and clears aggregates",async()=>{
  let reads=0;
  const nodes=harness(async(url)=>url.endsWith("authenticate/verify")?response({token:"adm_test",expiresInSeconds:900}):response(overview,++reads===1?200:401));
  await nodes.login.listeners.submit(submit);nodes.filters.listeners.submit(submit);
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(nodes.dashboard.hidden,true);assert.equal(nodes.results.children.length,0);assert.match(nodes.message.textContent,/expired/);
});
test("late unauthorized logout cannot clear a newer authenticated session",async()=>{
  let finishLogout;let logins=0;
  const nodes=harness(async(url,options)=>{
    if(options.method==="DELETE")return new Promise(resolve=>{finishLogout=()=>resolve(response({},401));});
    if(url.endsWith("authenticate/verify"))return response({token:`adm_${++logins}`,expiresInSeconds:900});
    return response(overview);
  });
  await nodes.login.listeners.submit(submit);
  const logout=nodes.logout.listeners.click();
  await nodes.login.listeners.submit(submit);
  finishLogout();await logout;
  assert.equal(nodes.dashboard.hidden,false);assert.ok(nodes.results.children.length>0);
});
test("admin refuses a non-local insecure page before accepting credentials",()=>{
  let calls=0;const nodes={login:new Element(),register:new Element(),message:new Element()};
  assert.throws(()=>vm.runInNewContext(source,{location:{protocol:"http:",hostname:"savlivo.com"},
    document:{getElementById:id=>nodes[id]},fetch:()=>{calls++;}}),/HTTPS_REQUIRED/);
  assert.equal(nodes.login.hidden,true);assert.equal(calls,0);
});

test("hosted HTTPS admin page refuses legacy password entry before any request",()=>{
  let calls=0;const nodes={login:new Element(),register:new Element(),message:new Element()};
  assert.throws(()=>vm.runInNewContext(source,{location:{protocol:"https:",hostname:"savlivo.com"},
    document:{getElementById:id=>nodes[id]},fetch:()=>{calls++;}}),/ADMIN_ORIGIN_DENIED/);
  assert.equal(nodes.login.hidden,true);assert.equal(calls,0);
});

test("registration sends operator grant only as authorization, clears it, and never grants a session",async()=>{
  const requests=[];
  const nodes=harness(async(url,options)=>{requests.push({url,options});return response(url.endsWith("register/options")?{challengeId:"registration",options:{challenge:"AA",user:{id:"AA",name:"Admin",displayName:"Admin"},rp:{id:"localhost",name:"Admin"}}}:{ok:true});});
  nodes.enrollment.value="adm_operator-grant";
  await nodes.register.listeners.submit(submit);
  assert.equal(nodes.enrollment.value,"");assert.equal(requests[0].options.headers.Authorization,"Bearer adm_operator-grant");
  assert.equal(requests[0].options.body,"{}");assert.equal(requests[1].options.headers.Authorization,undefined);
  assert.equal(nodes.dashboard.hidden,true);assert.match(nodes.message.textContent,/registered/);
});
test("cancelled native authentication sends no assertion and opens no dashboard",async()=>{
  let writes=0;const nodes=harness(async()=>{writes++;return response({});},{get:async()=>{throw new Error("NotAllowedError");}});
  nodes.dashboard.hidden=true;await nodes.login.listeners.submit(submit);
  assert.equal(writes,0);assert.equal(nodes.dashboard.hidden,true);assert.match(nodes.message.textContent,/cancelled/);
});

test("brand heading uses the unchanged official logo and narrowly permits its static path",()=>{
  const html=readFileSync(new URL("index.html",import.meta.url),"utf8");
  assert.match(html,/<h1 class="brand-heading"><img src="logo\.png" alt="" width="40" height="40"><span>Savlivo Internal Analytics<\/span><\/h1>/);
  assert.deepEqual(readFileSync(new URL("logo.png",import.meta.url)),readFileSync(new URL("../assets/logo.png",import.meta.url)));
  const headers=readFileSync(new URL("deploy/webhuset-admin.htaccess",import.meta.url),"utf8");
  const rule=headers.match(/^RewriteRule !([^ ]+) - \[F,L\]$/m);
  assert.ok(rule);
  const allowed=new RegExp(rule[1]);
  for(const path of ["","index.html","admin.js","admin.css","logo.png"])assert.ok(allowed.test(path),path);
  for(const path of ["other.png","logo.png/private","assets/logo.png","admin.test.mjs",".env"])assert.equal(allowed.test(path),false,path);
  for(const policy of [headers,html])assert.ok(policy.includes("img-src 'self';"));
  assert.ok(headers.includes("default-src 'none';"));
  const css=readFileSync(new URL("admin.css",import.meta.url),"utf8");
  assert.match(css,/\.brand-heading\{display:flex;align-items:center;gap:\.4em\}/);
  assert.match(css,/width:1\.25em;height:1\.25em;object-fit:contain;flex-shrink:0/);
});

const analytics={range:"30d",months:["2026-08"],collectionEnabled:false,semantics:"Best effort",current:{state:"available",total:1,preview:0,manual:0,premium:1,paid:1,paidPercentage:100,percentages:{preview:0,manual:0,premium:100}},
 history:[{period:"2026-09-09",plans:{state:"available",preview:0,manual:0,premium:1,observedAt:"2026-09-09T01:00:00Z"},flows:{ai_success:1}}],
 unavailable:{activeUsers:"No foreground signal",retention:"No D7/D30 signal",noResult:"Not instrumented",push:"No delivery receipts",technicalHealth:"No request logging"}};
test("v2 renders exact global one, native graph and honest unavailable states without cross-filters",async()=>{
  const requests=[];const nodes=harness(async(url)=>{requests.push(url);if(url.endsWith("authenticate/verify"))return response({token:"adm_test",expiresInSeconds:900});
    if(url.includes("analytics/segments"))return response({state:"unavailable",report:"top-services",month:"2026-08",reason:"insufficient history"});
    if(url.includes("analytics?"))return response(analytics);return response({...overview,analyticsV2Enabled:true});});
  await nodes.login.listeners.submit(submit);
  const texts=e=>[e.textContent,...e.children.flatMap(texts)];const all=texts(nodes.results).join(" ");
  assert.match(all,/Current accounts: 1/);assert.match(all,/Paid-plan membership: 1/);assert.match(all,/D7 \/ D30 retention: unavailable/);
  assert.ok(requests.includes("http://localhost:3000/v1/admin/analytics?range=30d"));assert.ok(requests.some(url=>url.endsWith("segments?report=top-services&month=2026-08")));
  assert.equal(requests.filter(url=>url.includes("analytics")).some(url=>url.includes("market=")),false);
  assert.doesNotMatch(source,/innerHTML|localStorage|sessionStorage|https:\/\/.*chart/);
  assert.ok(all.includes("Plan history values"));assert.ok(all.includes("insufficient history"));
});
test("logout rejects late v2 response and preserves existing memory-only session behavior",async()=>{
  let finish;const nodes=harness(async(url,options)=>{
    if(options.method==="DELETE")return response({ok:true});
    if(url.endsWith("authenticate/verify"))return response({token:"adm_test",expiresInSeconds:900});
    if(url.includes("analytics?"))return new Promise(resolve=>{finish=()=>resolve(response(analytics));});
    return response({...overview,analyticsV2Enabled:true});});
  const login=nodes.login.listeners.submit(submit);await new Promise(resolve=>setImmediate(resolve));
  assert.ok(finish);await nodes.logout.listeners.click();finish();await login;
  assert.equal(nodes.results.children.length,0);assert.equal(nodes.dashboard.hidden,true);
});

for(const [name,flows,expected] of [
  ["missing outcomes",{ai_success:7},["7","Unavailable","Unavailable","Unavailable","Unavailable","Unavailable"]],
  ["observed zero",{ai_success:7,ai_failure:0,ai_fallback:0},["7","0","0","7","0.0%","0.0%"]],
  ["observed failure",{ai_success:7,ai_failure:1,ai_fallback:0},["7","1","0","8","12.5%","0.0%"]],
  ["all unavailable",{},["Unavailable","Unavailable","Unavailable","Unavailable","Unavailable","Unavailable"]],
  ["zero denominator",{ai_success:0,ai_failure:0,ai_fallback:0},["0","0","0","0","Unavailable","Unavailable"]],
  ["incomplete denominator",{ai_failure:1,ai_fallback:0},["Unavailable","1","0","Unavailable","Unavailable","Unavailable"]],
  ["null is unavailable",{ai_success:7,ai_failure:null,ai_fallback:null},["7","Unavailable","Unavailable","Unavailable","Unavailable","Unavailable"]],
  ["nonfinite rejected",{ai_success:Infinity,ai_failure:0,ai_fallback:0},["Unavailable","0","0","Unavailable","Unavailable","Unavailable"]],
  ["NaN rejected",{ai_success:NaN,ai_failure:0,ai_fallback:0},["Unavailable","0","0","Unavailable","Unavailable","Unavailable"]],
  ["overflow denominator",{ai_success:Number.MAX_SAFE_INTEGER,ai_failure:1,ai_fallback:0},[String(Number.MAX_SAFE_INTEGER),"1","0","Unavailable","Unavailable","Unavailable"]]
])test(`AI outcome presentation: ${name}`,async()=>{
  const data={...analytics,history:[{...analytics.history[0],flows}]};
  const nodes=harness(async url=>{
    if(url.endsWith("authenticate/verify"))return response({token:"adm_test",expiresInSeconds:900});
    if(url.includes("analytics/segments"))return response({state:"unavailable",report:"top-services",month:"2026-08",reason:"insufficient history"});
    if(url.includes("analytics?"))return response(data);
    return response({...overview,analyticsV2Enabled:true});
  });
  await nodes.login.listeners.submit(submit);
  const texts=e=>[e.textContent,...e.children.flatMap(texts)],all=texts(nodes.results).join(" ");
  const [success,failure,fallback,total,failureRate,fallbackRate]=expected;
  for(const text of [`AI route completions: ${success};`,`AI route failures: ${failure}.`,`Recorded AI requests: ${total};`,`offline navigation fallbacks: ${fallback}.`,`Recorded failure rate: ${failureRate};`,`recorded fallback rate: ${fallbackRate}.`])assert.ok(all.includes(text),text);
  assert.doesNotMatch(all,/NaN%|Infinity%/);
});
test('Operations authentication checks have bounded timeouts beyond the old ten-second limit',()=>{
 const block=source.slice(source.indexOf('function operationsRequestTimeout('),source.indexOf('async function request('));const timeout=vm.runInNewContext(block+'; operationsRequestTimeout');
 assert.equal(timeout('v2-operations/preflight'),630000);assert.equal(timeout('v2-operations/start'),630000);assert.equal(timeout('v2-operations/targeting'),30000);assert.equal(timeout('overview'),10000);assert.equal(timeout('v2-operations/other'),10000);assert(source.includes('AbortSignal.timeout(operationsRequestTimeout(path))'));
});
