import '../offline-replay/offline-guard.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import pngjs from 'pngjs';
import {createPlaywrightRenderedCapability} from '../../research-v3/browser-render.mjs';
import {adaptV2CurrentSource} from '../../research-v3/v2-current-source-adapter.mjs';
import {authorityBinding} from '../../research-v3/discovery-authority.mjs';
import {digest} from '../../research-v3/model.mjs';
import {evaluate} from '../../research-v3/truth.mjs';
import {planHybridRenderedAcquisition,runHybridRenderedAcquisition} from './hybrid-rendered-acquisition.mjs';

const {PNG}=pngjs,host='provider.example',url=`https://${host}/pricing`,service='fixture',serviceName='Example service',market='NO';
const objective={kind:'PRICE',serviceId:service,serviceName,providerHosts:[host],markets:[market],seeds:[url]};
const product={product:{id:'monthly',name:'Monthly',productType:'SUBSCRIPTION',consumer:true,subscription:{length:1,unit:'months'}},totalAmountWithTaxes:{amount:'7999',currencyCode:'NOK'}};
const establishedBody=`<html><head><title>${serviceName}</title></head><body><script>const data = ${JSON.stringify({offeredProducts:{months:[product]},currenciesSubunit:{NOK:2}})};</script></body></html>`;
const insufficientBody=`<html><title>${serviceName}</title><body>Membership information requires another state.</body></html>`;
const target=(extra={})=>({id:'fixture-no',service,serviceName,market,researchObjective:'SERVICE_COVERAGE',smartResearch:{version:2},urls:[url],leads:[{url,title:'Pricing',rank:0}],authorities:[{provider:serviceName,hostname:host,sourceType:'OFFICIAL_PROVIDER',checkedAt:'2026-01-01'}],gaps:['amount'],reads:[],queries:[],decisions:[],capabilities:{direct:true,tavily:false,decodo:true,browser:true,groq:false},...extra});
const parent=()=>({id:'ordinary-parent',kind:'PROVIDER',url,context:{transport:'DIRECT',networkGeography:'UNBOUND',representation:'PROVIDER_PAGE'},outcome:'OK',body:insufficientBody,sha256:digest(insufficientBody)});
const temp=t=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'phase4-browser-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));return dir;};
const png=()=>{const image=new PNG({width:800,height:600,colorType:6,inputColorType:6,inputHasAlpha:true});image.data.fill(255);return PNG.sync.write(image);};

function fakeChromium({body=establishedBody,finalUrl=url,country='NO'}={}) {
 const state={contexts:[],routes:[]};
 const chromium={async launch(){return {version:()=> 'offline-playwright',async close(){},async newContext(options){state.contexts.push(options);let routeHandler;
  const context={request:{async get(requested){if(requested.includes('ipwho.is'))return {status:()=>200,body:async()=>Buffer.from(JSON.stringify({success:true,ip:'203.0.113.9',country_code:country}))};return {status:()=>404,body:async()=>Buffer.alloc(0)};}},async route(_pattern,handler){routeHandler=handler;},async close(){},async newPage(){let evaluations=0;return {on(){},url:()=>finalUrl,async goto(){for(const [requestUrl,type] of [[url,'document'],['https://assets.example/app.js','script'],['https://api.example/data','fetch'],['https://assets.example/card.png','image']]){let continued=false,aborted=false;await routeHandler({request:()=>({url:()=>requestUrl,method:()=> 'GET',resourceType:()=>type}),continue:async()=>{continued=true;},abort:async()=>{aborted=true;}});state.routes.push({requestUrl,type,continued,aborted});}return {status:()=>200,body:async()=>Buffer.from(body),headers:()=>({'content-type':'text/html'})};},async waitForLoadState(){},async evaluate(){evaluations++;return evaluations===1?{width:800,height:600}:[{text:serviceName,role:'h1',ariaLabel:null,contextText:null,groupId:null,selected:null,disabled:null,bboxPx:[1,1,100,20]}];},async screenshot(){return png();}};}};
  return context;}};}};
 return {chromium,state};
}

function capability(options={}) {
 const fake=fakeChromium(options),browser=createPlaywrightRenderedCapability({chromium:fake.chromium,proxyFor:()=>({server:'http://decodo.invalid:7000',username:'fixture',password:'fixture'}),hostAllowed:async()=>true,clock:()=> '2026-10-09T10:00:00.000Z'});
 return {browser,state:fake.state};
}

function native(body=establishedBody) {
 const sha256=digest(body),input={contractVersion:1,observationId:'native',target:{service,serviceName,market},page:{url,requestedUrl:url,outcome:'OK',httpStatus:200,contentType:'text/html',bodyHash:sha256,sourceIntegrity:{sha256},rawSource:{text:body},accessDecisions:[{decision:'ALLOWED'}]},providerAuthority:{status:'AUTHORITATIVE_PROVIDER',binding:authorityBinding(objective,url)},acquisition:{route:'DECODO',countryReceipt:{contractVersion:1,kind:'V3_VERIFIED_COUNTRY_RECEIPT',transport:'DECODO',verification:'BRACKET_VERIFIED',requestedCountry:market,verifiedCountry:market}}};
 return adaptV2CurrentSource(input,objective);
}

test('V2 plan selects one bounded browser capability only after rendering is diagnosed',()=>{
 const planned=planHybridRenderedAcquisition(target(),{url,transport:'DECODO'});assert.equal(planned.scheduled,true);assert.equal(planned.plan.route,'PARK_RENDERING');assert.equal(planned.route,'BROWSER');
 const disabled=target();disabled.capabilities.browser=false;assert.equal(planHybridRenderedAcquisition(disabled,{url,transport:'DECODO'}).reason,'BROWSER_DISABLED');
 const sufficient=target({researchObjective:'CATALOG_ONLY',loginManageEstablished:true});assert.equal(planHybridRenderedAcquisition(sufficient,{url,transport:'DIRECT'}).scheduled,false);
});

test('V2 reserves action browser network and country before V3 execution',async t=>{
 const directory=temp(t),base=capability(),wrapped=async(...args)=>{const rows=fs.readFileSync(path.join(directory,'journal.jsonl'),'utf8');for(const kind of ['actions','browserActions','networkRequests','countryActions'])assert.match(rows,new RegExp(`"kind":"${kind}"`));assert.match(rows,/"ACTION_STARTED"/);return base.browser(...args);};wrapped.close=base.browser.close;
 const result=await runHybridRenderedAcquisition({directory,target:target(),objective,parent:parent(),transport:'DECODO',browser:wrapped});assert.equal(result.outcome,'OBSERVED',JSON.stringify(result));assert.equal(result.usage.actions,1);assert.equal(result.usage.browserActions,1);assert.equal(result.usage.countryActions,1);assert.equal(result.usage.networkRequests,256);assert.equal(result.usage.actualNetworkRequests,7);
});

test('DECODO constrains every relevant request to one proxied browser context and canonical country receipt',async t=>{
 const c=capability(),result=await runHybridRenderedAcquisition({directory:temp(t),target:target(),objective,parent:parent(),transport:'DECODO',browser:c.browser});
 assert.equal(c.state.contexts.length,1);assert.equal(c.state.contexts[0].proxy.server,'http://decodo.invalid:7000');assert.ok(c.state.routes.every(row=>row.continued&&!row.aborted));
 assert.deepEqual(new Set(result.networkSession.requestCount&&JSON.parse(fs.readFileSync(path.join(result.artifacts.root,result.networkSession.ledgerRef.file))).map(row=>row.resourceType)),new Set(['robots','geography','document','script','fetch','image']));
 const ledger=JSON.parse(fs.readFileSync(path.join(result.artifacts.root,result.networkSession.ledgerRef.file)));assert.ok(ledger.every(row=>row.transport==='DECODO'&&row.requestedCountry==='NO'&&row.sessionBinding===result.networkSession.sessionBinding));
 assert.equal(result.acquisition.countryReceipt.kind,'V3_VERIFIED_COUNTRY_RECEIPT');assert.equal(result.observation.context.networkGeography,'NO');
});

test('DIRECT browser stays unbound and uses no proxy or country reservation',async t=>{
 const c=capability(),result=await runHybridRenderedAcquisition({directory:temp(t),target:target(),objective,parent:parent(),transport:'DIRECT',browser:c.browser});assert.equal(result.outcome,'OBSERVED');assert.equal(c.state.contexts[0].proxy,undefined);assert.deepEqual(result.acquisition,{route:'DIRECT'});assert.deepEqual(result.observation.context,{transport:'DIRECT',networkGeography:'UNBOUND',representation:'PROVIDER_PAGE'});assert.equal(result.usage.countryActions,0);
});

for(const [label,mutate,reason] of [
 ['requested country alone',result=>{result.page.transport={kind:'DECODO',requestedCountry:'NO'};},'BROWSER_COUNTRY_PROVENANCE_INVALID'],
 ['mismatched verified country',result=>{result.page.transport.verifiedCountry='SE';},'BROWSER_COUNTRY_PROVENANCE_INVALID'],
 ['missing verification',result=>{delete result.page.transport.verification;},'BROWSER_COUNTRY_PROVENANCE_INVALID'],
 ['one request escapes direct',result=>{result.browserLedger[3].transport='DIRECT';result.networkSession.ledgerSha256=digest(result.browserLedger);},'BROWSER_NETWORK_ESCAPE'],
])test(label+' fails closed before V3 admission',async t=>{const base=capability(),browser=async(...args)=>{const result=await base.browser(...args);mutate(result);return result;};browser.close=base.browser.close;const result=await runHybridRenderedAcquisition({directory:temp(t),target:target(),objective,parent:parent(),transport:'DECODO',browser});assert.equal(result.outcome,'ACQUISITION_FAILED');assert.equal(result.reason,reason);assert.equal(result.truthState,'UNRESOLVED');});

test('browser cannot establish authority and cross-host navigation fails closed',async t=>{
 const noAuthority=target({authorities:[]});let called=0;const browser=async()=>{called++;};assert.equal((await runHybridRenderedAcquisition({directory:temp(t),target:noAuthority,objective,parent:parent(),transport:'DIRECT',browser})).reason,'EXACT_HOST_AUTHORITY_REQUIRED');assert.equal(called,0);
 const c=capability({finalUrl:'https://other.example/pricing'}),result=await runHybridRenderedAcquisition({directory:temp(t),target:target(),objective,parent:parent(),transport:'DIRECT',browser:c.browser});assert.equal(result.outcome,'ACQUISITION_FAILED');assert.equal(result.truthState,'UNRESOLVED');
});

test('rendered and native equivalent source use the same V3 projection and Truth',async t=>{
 const c=capability(),rendered=await runHybridRenderedAcquisition({directory:temp(t),target:target(),objective,parent:parent(),transport:'DECODO',browser:c.browser}),a=evaluate({objective,observations:[native()]}),b=evaluate({objective,observations:[rendered.observation]});
 assert.equal(a.established,true);assert.equal(b.established,true);for(const proposition of ['PRICE_AMOUNT','CURRENCY','MONTHLY_SUBSCRIPTION','TARGET_MARKET'])assert.deepEqual(b.prices.NO.propositions[proposition].state,a.prices.NO.propositions[proposition].state);assert.ok(rendered.observation.renderedArtifacts.length);assert.ok(rendered.observation.candidates.some(row=>row.kind==='OFFER'));
});

test('insufficient rendered evidence remains unresolved and failure is never contradiction',async t=>{
 const c=capability({body:insufficientBody}),result=await runHybridRenderedAcquisition({directory:temp(t),target:target(),objective,parent:parent(),transport:'DECODO',browser:c.browser}),truth=evaluate({objective,observations:[result.observation]});assert.equal(truth.established,false);assert.ok(Object.values(truth.prices.NO.propositions).every(row=>row.state!=='CONTRADICTED'));
 const failed=async()=>{throw Error('BROWSER_DOWN');},failure=await runHybridRenderedAcquisition({directory:temp(t),target:target(),objective,parent:parent(),transport:'DIRECT',browser:failed});assert.deepEqual({outcome:failure.outcome,truthState:failure.truthState},{outcome:'ACQUISITION_FAILED',truthState:'UNRESOLVED'});
});

test('large artifacts are separate and checkpoint journal contains compact references only',async t=>{
 const directory=temp(t),c=capability(),result=await runHybridRenderedAcquisition({directory,target:target(),objective,parent:parent(),transport:'DIRECT',browser:c.browser}),journal=fs.readFileSync(path.join(directory,'journal.jsonl'),'utf8');assert.equal(journal.includes(establishedBody),false);assert.equal(journal.includes(result.observation.renderedArtifacts[0].image.bytesBase64),false);for(const ref of Object.values(result.artifacts.refs))assert.equal(fs.existsSync(path.join(result.artifacts.root,ref.file)),true);
});

test('later refresh has a fresh action session and country receipt while the old run cannot rerun',async t=>{
 const firstDir=temp(t),firstCap=capability(),first=await runHybridRenderedAcquisition({directory:firstDir,target:target(),objective,parent:parent(),transport:'DECODO',browser:firstCap.browser});const againCap=capability(),again=await runHybridRenderedAcquisition({directory:firstDir,target:target(),objective,parent:parent(),transport:'DECODO',browser:againCap.browser});assert.equal(again.reason,'RENDERED_ACQUISITION_ALREADY_COMPLETED');
 const secondCap=capability(),second=await runHybridRenderedAcquisition({directory:temp(t),target:target(),objective,parent:parent(),transport:'DECODO',browser:secondCap.browser,clock:()=> '2026-10-09T11:00:00.000Z'});assert.notEqual(first.actionId,second.actionId);assert.notEqual(first.networkSession.sessionBinding,second.networkSession.sessionBinding);assert.equal(second.acquisition.countryReceipt.verification,'BRACKET_VERIFIED');
});

test('retry budget exhaustion terminates explicitly without unbounded execution',async t=>{
 let calls=0;const browser=async()=>{calls++;throw Error('BROWSER_DOWN');},limits={actions:1,browserActions:1,networkRequests:4,countryActions:1,retries:1,perAttemptNetworkRequests:4},result=await runHybridRenderedAcquisition({directory:temp(t),target:target(),objective,parent:parent(),transport:'DIRECT',browser,limits});assert.equal(calls,1);assert.equal(result.outcome,'ACQUISITION_FAILED');assert.equal(result.reason,'HYBRID_BROWSER_ACTIONS_BOUND');assert.equal(result.bounded,true);
});
