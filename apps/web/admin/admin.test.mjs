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
  set innerHTML(_){throw new Error("HTML injection");}
}
function harness(fetch, credentials, page={hostname:"localhost",protocol:"http:",origin:"http://localhost:8080"}) {
  const nodes=Object.fromEntries(["login","register","enrollment","revoke","message","dashboard","filters","market","logout","results"].map(id=>[id,new Element()]));
  nodes.market.options=[new Element()];
  const mockCredential={id:"AA",rawId:new Uint8Array([0]).buffer,type:"public-key",getClientExtensionResults:()=>({}),response:{clientDataJSON:new Uint8Array([0]).buffer,authenticatorData:new Uint8Array([0]).buffer,signature:new Uint8Array([0]).buffer,userHandle:new Uint8Array([0]).buffer,attestationObject:new Uint8Array([0]).buffer}};
  const context={location:page,document:{getElementById:id=>nodes[id],createElement:()=>new Element()},
    window:{addEventListener:()=>{},PublicKeyCredential:function(){}},navigator:{credentials:credentials??{get:async()=>mockCredential,create:async()=>mockCredential}},
    fetch:async(url,options)=>url.endsWith("authenticate/options")?response({challengeId:"test",options:{challenge:"AA",rpId:page.hostname,userVerification:"required"}}):fetch(url,options),
    atob,btoa,AbortController,AbortSignal,setTimeout:()=>1,clearTimeout:()=>{},encodeURIComponent};
  vm.runInNewContext(source,context);return nodes;
}
const response=(data,status=200)=>({ok:status===200,status,json:async()=>data});
const overview={markets:[["NO","Norway","NOK"]],collectionEnabled:false,catalogServices:43,newUsers:123456,notes:["<script>bad()</script>"],
  dataQuality:{selectableMarkets:30,registryRows:364,persistedPrices:[]},serviceDistribution:[],events:[{event:"PRIVATE_EVENT_SENTINEL",count:10,actors:10}],entitlements:[],subscriptions:[]};
const submit={preventDefault(){}};
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
