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
function harness(fetch) {
  const nodes=Object.fromEntries(["login","email","password","message","dashboard","filters","days","market","logout","results"].map(id=>[id,new Element()]));
  nodes.days.value="30";nodes.market.options=[new Element()];nodes.password.value="test-password";nodes.email.value="admin@example.invalid";
  const context={location:{hostname:"localhost"},document:{getElementById:id=>nodes[id],createElement:()=>new Element()},
    window:{addEventListener:()=>{}},fetch,AbortSignal,setTimeout:()=>1,clearTimeout:()=>{},encodeURIComponent};
  vm.runInNewContext(source,context);return nodes;
}
const response=(data,status=200)=>({ok:status===200,status,json:async()=>data});
const overview={markets:[["NO","Norway","NOK"]],collectionEnabled:false,catalogServices:43,newUsers:null,notes:["No raw AI data"],
  dataQuality:{selectableMarkets:30,registryRows:364,persistedPrices:[]},serviceDistribution:[],events:[{event:"<script>bad()</script>",count:10,actors:10}],entitlements:[],subscriptions:[]};
const submit={preventDefault(){}};
test("admin client uses memory token, clears password, renders data as text, and sends bounded filters",async()=>{
  const requests=[];const nodes=harness(async(url,options)=>{requests.push({url,options});return response(url.endsWith("session")?{token:"adm_test",expiresInSeconds:900}:overview);});
  await nodes.login.listeners.submit(submit);
  assert.equal(nodes.password.value,"");assert.equal(nodes.login.hidden,true);
  assert.equal(requests[1].options.headers.Authorization,"Bearer adm_test");
  assert.match(requests[1].url,/days=30&market=$/);
  assert.equal(requests[0].options.credentials,"omit");
  const texts=element=>[element.textContent,...element.children.flatMap(texts)];
  assert.ok(texts(nodes.results).includes("<script>bad()</script>")); // Text, never parsed as HTML.
});
test("logout clears sensitive view immediately and rejects late dashboard result",async()=>{
  let complete;let reads=0;
  const nodes=harness(async(url,options)=>{
    if(options.method==="DELETE")return response({ok:true});
    if(url.endsWith("session"))return response({token:"adm_test",expiresInSeconds:900});
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
  const nodes=harness(async(url)=>url.endsWith("session")?response({token:"adm_test",expiresInSeconds:900}):response(overview,++reads===1?200:401));
  await nodes.login.listeners.submit(submit);nodes.filters.listeners.submit(submit);
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(nodes.dashboard.hidden,true);assert.equal(nodes.results.children.length,0);assert.match(nodes.message.textContent,/expired/);
});
test("late unauthorized logout cannot clear a newer authenticated session",async()=>{
  let finishLogout;let logins=0;
  const nodes=harness(async(url,options)=>{
    if(options.method==="DELETE")return new Promise(resolve=>{finishLogout=()=>resolve(response({},401));});
    if(url.endsWith("session"))return response({token:`adm_${++logins}`,expiresInSeconds:900});
    return response(overview);
  });
  await nodes.login.listeners.submit(submit);
  const logout=nodes.logout.listeners.click();
  await nodes.login.listeners.submit(submit);
  finishLogout();await logout;
  assert.equal(nodes.dashboard.hidden,false);assert.ok(nodes.results.children.length>0);
});
