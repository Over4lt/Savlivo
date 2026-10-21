import '../offline-replay/offline-guard.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import pngjs from 'pngjs';
import {browserRenderLimits,createPlaywrightRenderedCapability} from '../../research-v3/browser-render.mjs';
import {adaptV2CurrentSource} from '../../research-v3/v2-current-source-adapter.mjs';
import {authorityBinding} from '../../research-v3/discovery-authority.mjs';
import {digest} from '../../research-v3/model.mjs';
import {evaluate} from '../../research-v3/truth.mjs';
import {hybridRenderedLimits,planHybridRenderedAcquisition,runHybridRenderedAcquisition} from './hybrid-rendered-acquisition.mjs';
import {safeRenderedControl} from '../../research-v3/rendered-interactions.mjs';
import {projectEstablishedV3Offerings} from '../inventory/v3-result-projection.mjs';
import {compileVisualObservation} from '../../research-v3/live-visual.mjs';
import {createProviderPricingRouteMemory,learnProviderPricingRoutesFromTarget,providerPricingStrategiesForTarget} from './hybrid-provider-resource-memory.mjs';
import {publishPricingRouteMemory,publishPricingMethodOutcomes,loadPricingRouteMemory} from '../storage/pricing-route-memory.mjs';
import {readBrowserPricingRouteEvidence} from './browser-pricing-route-evidence.mjs';

const {PNG}=pngjs,host='provider.example',url=`https://${host}/pricing`,service='fixture',serviceName='Example service',market='NO';
const objective={kind:'PRICE',serviceId:service,serviceName,providerHosts:[host],markets:[market],seeds:[url]};
const product={product:{id:'monthly',name:'Monthly',productType:'SUBSCRIPTION',consumer:true,subscription:{length:1,unit:'months'}},totalAmountWithTaxes:{amount:'7999',currencyCode:'NOK'}};
const establishedBody=`<html><head><title>${serviceName}</title></head><body><script>const data = ${JSON.stringify({offeredProducts:{months:[product]},currenciesSubunit:{NOK:2}})};</script></body></html>`;
const threePlanBody=`<html><head><title>${serviceName}</title></head><body><script>const data = ${JSON.stringify({offeredProducts:{months:[product,{...product,product:{...product.product,id:'standard',name:'Standard'},totalAmountWithTaxes:{amount:'9999',currencyCode:'NOK'}},{...product,product:{...product.product,id:'premium',name:'Premium'},totalAmountWithTaxes:{amount:'12999',currencyCode:'NOK'}}]},currenciesSubunit:{NOK:2}})};</script></body></html>`;
const insufficientBody=`<html><title>${serviceName}</title><body>Membership information requires another state.</body></html>`;
const target=(extra={})=>({id:'fixture-no',service,serviceName,market,researchObjective:'SERVICE_COVERAGE',smartResearch:{version:2},urls:[url],leads:[{url,title:'Pricing',rank:0}],authorities:[{provider:serviceName,hostname:host,sourceType:'OFFICIAL_PROVIDER',checkedAt:'2026-01-01'}],gaps:['amount'],reads:[],queries:[],decisions:[],capabilities:{direct:true,tavily:false,decodo:true,browser:true,groq:false},...extra});
const parent=()=>({id:'ordinary-parent',kind:'PROVIDER',url,context:{transport:'DIRECT',networkGeography:'UNBOUND',representation:'PROVIDER_PAGE'},outcome:'OK',body:insufficientBody,sha256:digest(insufficientBody)});
const temp=t=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'phase4-browser-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));return dir;};
const png=()=>{const image=new PNG({width:800,height:600,colorType:6,inputColorType:6,inputHasAlpha:true});image.data.fill(255);return PNG.sync.write(image);};

function fakeChromium({body=establishedBody,renderedBody=body,postConsentBody=establishedBody,finalUrl=url,country='NO',consent=false,consentLabel='Reject all',overlayAfterReject=false,completionLabels=[],robotsRedirect=false,additionalRequests=[]}={}) {
 const state={contexts:[],routes:[],gotos:[],clicks:0,completionClicks:0};
 const chromium={async launch(){return {version:()=> 'offline-playwright',async close(){},async newContext(options){state.contexts.push(options);let routeHandler;
  const context={request:{async get(requested){if(requested.includes('ipwho.is'))return {status:()=>200,body:async()=>Buffer.from(JSON.stringify({success:true,ip:'203.0.113.9',country_code:country})),headers:()=>({})};if(robotsRedirect&&requested.endsWith('/csp/robots.txt'))return {status:()=>200,body:async()=>Buffer.from('User-agent: *\nAllow: /'),headers:()=>({})};if(robotsRedirect&&requested.endsWith('/robots.txt'))return {status:()=>301,body:async()=>Buffer.alloc(0),headers:()=>({location:'/csp/robots.txt'})};return {status:()=>404,body:async()=>Buffer.alloc(0),headers:()=>({})};}},async route(_pattern,handler){routeHandler=handler;},async close(){},async newPage(){let clicked=false,completed=false;const dom=()=>[{text:serviceName,role:'h1',ariaLabel:null,contextText:null,groupId:null,selected:null,disabled:null,bboxPx:[1,1,100,20]},...(consent&&!clicked?[{text:consentLabel,role:'button',ariaLabel:null,contextText:'Cookie consent preferences',consentDialogName:'Your Privacy Settings',groupId:'consent',selected:null,disabled:false,bboxPx:[10,40,120,30]}]:[]),...(clicked&&overlayAfterReject&&!completed?completionLabels.map((text,index)=>({text,role:'button',ariaLabel:text,contextText:null,consentDialogName:'Privacy Preference Center',groupId:'completion',selected:null,disabled:false,bboxPx:[10+index*130,40,120,30]})):[])];return {on(){},url:()=>finalUrl,async goto(destination){state.gotos.push(destination);const requests=[[destination,'document',{}],['https://assets.example/app.js','script',{}],['https://api.example/data','fetch',{}],['https://assets.example/card.png','image',{}],...additionalRequests];for(const [requestUrl,type,details] of requests){let continued=false,aborted=false;await routeHandler({request:()=>({url:()=>requestUrl,method:()=>details.method??'GET',resourceType:()=>type,headers:()=>details.headers??{},postData:()=>details.postData??null}),continue:async()=>{continued=true;},abort:async()=>{aborted=true;}});state.routes.push({requestUrl,type,continued,aborted,method:details.method??'GET'});}return {status:()=>200,body:async()=>Buffer.from(body),headers:()=>({'content-type':'text/html'})};},async content(){return clicked?postConsentBody:renderedBody;},async waitForLoadState(){},async evaluate(fn){return fn.name==='consentDialogNames'?(clicked&&overlayAfterReject&&!completed?['Privacy Preference Center']:[]):String(fn).includes('createTreeWalker')?dom():{width:800,height:600};},locator(){return {async evaluateAll(){return [0];},nth(){return {async count(){return 1;},async isEnabled(){return true;},async click(){if(clicked){completed=true;state.completionClicks++;}clicked=true;state.clicks++;}};}};},async screenshot(){return png();}};}};
  return context;}};}};
 return {chromium,state};
}

function capability(options={}) {
 const fake=fakeChromium(options),browser=createPlaywrightRenderedCapability({chromium:fake.chromium,proxyFor:context=>({server:'http://decodo.invalid:7000',username:'fixture-country-'+context.networkGeography.toLowerCase(),password:'fixture'}),hostAllowed:async()=>true,clock:()=> '2026-10-09T10:00:00.000Z',limits:{...browserRenderLimits,consentSettleTimeoutMs:20}});
 return {browser,state:fake.state};
}

function reacquisition(marketCode){
 const link={id:'global-pricing',url,kind:'DIRECT_SOURCE',marketScope:'GLOBAL',marketCode:null,enabled:true,truthAuthority:'NONE'};
 const need={kind:'DECODO_BROWSER_REACQUISITION',url,transport:'DECODO',market:marketCode,sourceHash:null,researchLinkId:link.id};
 const current=target({id:'price-research:fixture:'+marketCode,market:marketCode,operationsObjective:'PRICE_RESEARCH',researchLinks:[link],demonstratedRendering:true,renderingNeed:need,acquisitionOutcomes:[{url,channel:'PRICE_RESEARCH_DECODO',researchLinkId:link.id,classification:'ACQUISITION_FAILED',responseTooLarge:true,sourceClassification:{status:'UNKNOWN_SOURCE',sourceHash:null},countryV3Evaluation:{status:'UNRESOLVED'}}],researchLinkOutcomes:[{id:link.id,result:'BROWSER_CONTINUATION_REQUIRED',targetMarket:marketCode,decodoAttempted:true}]});
 return {current,need,parent:{id:'routing-only',kind:'ROUTING_HINT',url,context:{transport:'DECODO',networkGeography:marketCode,representation:'ROUTING_ONLY'},outcome:'UNOBSERVED'},objective:{...objective,markets:[marketCode]}};
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

test('verified retained provider family permits Browser only for its exact country source',()=>{
 const familyUrl='https://help.example.com/pricing',source={...parent(),url:familyUrl},withoutHistorical=target({authorities:[],providerSourceIdentityHosts:['example.com'],acquisitionOutcomes:[{sourceClassification:{status:'PROVIDER_SOURCE',finalUrl:familyUrl,sourceHash:source.sha256},countryV3Evaluation:{status:'EVALUATED',receiptStatus:'HASH_VERIFIED',geoClass:'G1'}}]});
 assert.equal(planHybridRenderedAcquisition(withoutHistorical,{url:familyUrl,transport:'DECODO',parent:source}).scheduled,true);
 assert.equal(planHybridRenderedAcquisition(withoutHistorical,{url:familyUrl,transport:'DECODO',parent:{...source,sha256:'0'.repeat(64)}}).reason,'EXACT_HOST_AUTHORITY_REQUIRED');
 assert.equal(planHybridRenderedAcquisition(withoutHistorical,{url:familyUrl,transport:'DIRECT',parent:source}).reason,'EXACT_HOST_AUTHORITY_REQUIRED');
});

test('V2 reserves action browser network and country before V3 execution',async t=>{
 const directory=temp(t),base=capability(),wrapped=async(...args)=>{const rows=fs.readFileSync(path.join(directory,'journal.jsonl'),'utf8');for(const kind of ['actions','browserActions','networkRequests','countryActions'])assert.match(rows,new RegExp(`"kind":"${kind}"`));assert.match(rows,/"ACTION_STARTED"/);return base.browser(...args);};wrapped.close=base.browser.close;
 const result=await runHybridRenderedAcquisition({directory,target:target(),objective,parent:parent(),transport:'DECODO',browser:wrapped});assert.equal(result.outcome,'OBSERVED',JSON.stringify(result));assert.equal(result.usage.actions,1);assert.equal(result.usage.browserActions,1);assert.equal(result.usage.countryActions,1);assert.equal(result.usage.networkRequests,hybridRenderedLimits.perAttemptNetworkRequests);assert.equal(result.usage.actualNetworkRequests,7);
});

test('same-origin robots redirect permits the checked rendered pricing route',async t=>{
 const c=capability({robotsRedirect:true}),result=await runHybridRenderedAcquisition({directory:temp(t),target:target(),objective,parent:parent(),transport:'DECODO',browser:c.browser});
 assert.equal(result.outcome,'OBSERVED',JSON.stringify(result));
 const ledger=JSON.parse(fs.readFileSync(path.join(result.artifacts.root,result.networkSession.ledgerRef.file)));
 assert.equal(ledger.filter(row=>row.resourceType==='robots').length,2);
});

test('Browser retains the populated DOM instead of the original network shell',async t=>{
 const c=capability({body:insufficientBody,renderedBody:establishedBody}),result=await runHybridRenderedAcquisition({directory:temp(t),target:target(),objective,parent:parent(),transport:'DECODO',browser:c.browser});
 assert.equal(result.outcome,'OBSERVED');assert.equal(result.observation.sha256,digest(establishedBody));assert.equal(result.v3Truth.established,true);
 assert.deepEqual(result.sourceHashes,{mainDocument:digest(insufficientBody),renderedDom:digest(establishedBody)});
});

test('bounded reject action retains rendered source and lets V3 establish three plans',async t=>{
 const c=capability({body:insufficientBody,consent:true,postConsentBody:threePlanBody}),result=await runHybridRenderedAcquisition({directory:temp(t),target:target(),objective,parent:parent(),transport:'DECODO',browser:c.browser});
 assert.equal(result.outcome,'OBSERVED',JSON.stringify(result));assert.equal(c.state.clicks,1);
 assert.equal(result.consent.outcome,'COMPLETED');assert.equal(result.usage.browserActions,2);
 assert(result.artifacts.prior?.refs['page.html']);assert.equal(result.v3Truth.established,true);
 assert.equal(result.v3SuggestedCandidates.length,3);assert(result.v3SuggestedCandidates.every(row=>row.provenance==='V3_SOURCE_RESEARCH'));
 assert.equal(projectEstablishedV3Offerings({...target(),...result}).length,3);
 assert.equal(result.observation.sha256,digest(threePlanBody));
 assert.equal(result.observation.renderedArtifacts[0].journey.interactions[0].kind,'COOKIE_REJECT');
});

test('consent control is ignored when rendered pricing is already established',async t=>{
 const c=capability({consent:true}),result=await runHybridRenderedAcquisition({directory:temp(t),target:target(),objective,parent:parent(),transport:'DECODO',browser:c.browser});
 assert.equal(result.outcome,'OBSERVED');assert.equal(c.state.clicks,0);assert.equal(result.consent,null);
});

test('an unqualified No control cannot trigger a consent click',async t=>{
 const c=capability({body:insufficientBody,consent:true,consentLabel:'No'}),result=await runHybridRenderedAcquisition({directory:temp(t),target:target(),objective,parent:parent(),transport:'DECODO',browser:c.browser});
 assert.equal(result.outcome,'OBSERVED');assert.equal(c.state.clicks,0);assert.equal(result.v3Truth.established,false);
});

test('consent policy recognizes reject and necessary-only controls only inside consent UI',()=>{
 const control=text=>({text,role:'button',disabled:false,bboxPx:[1,1,80,20],contextText:'Cookie privacy consent preferences'});
 for(const label of ['Reject','Reject all','Decline','Decline all','Only necessary','Necessary only','Continue without accepting'])assert.equal(safeRenderedControl(control(label),'COOKIE_REJECT'),true,label);
 for(const label of ['No','Accept all','Close','Buy now'])assert.equal(safeRenderedControl(control(label),'COOKIE_REJECT'),false,label);
 assert.equal(safeRenderedControl({...control('Reject all'),contextText:null},'COOKIE_REJECT'),false);
});

test('remaining consent overlay cannot be marked complete without an explicit safe control',async t=>{
 const c=capability({body:insufficientBody,consent:true,overlayAfterReject:true,completionLabels:[]}),result=await runHybridRenderedAcquisition({directory:temp(t),target:target(),objective,parent:parent(),transport:'DECODO',browser:c.browser});
 assert.equal(result.consent.outcome,'UNRESOLVED');assert.equal(result.consent.actions,1);assert.equal(c.state.clicks,1);assert.equal(c.state.completionClicks,0);
});

test('one source-bound close control completes consent in at most two actions',async t=>{
 const c=capability({body:insufficientBody,consent:true,overlayAfterReject:true,completionLabels:['Close preference center']}),result=await runHybridRenderedAcquisition({directory:temp(t),target:target(),objective,parent:parent(),transport:'DECODO',browser:c.browser});
 assert.equal(result.consent.outcome,'COMPLETED',JSON.stringify(result.consent));assert.equal(result.consent.actions,2);assert.equal(c.state.clicks,2);assert.equal(c.state.completionClicks,1);
});

for(const completionLabels of [['Close preference center','Done'],['Subscribe now'],['Manage account']])test(`ambiguous or unsafe consent completion ${completionLabels.join(', ')} stops`,async t=>{
 const c=capability({body:insufficientBody,consent:true,overlayAfterReject:true,completionLabels}),result=await runHybridRenderedAcquisition({directory:temp(t),target:target(),objective,parent:parent(),transport:'DECODO',browser:c.browser});
 assert.equal(result.consent.outcome,'UNRESOLVED');assert.equal(result.consent.actions,1);assert.equal(c.state.completionClicks,0);
});

test('DECODO constrains every relevant request to one proxied browser context and canonical country receipt',async t=>{
 const c=capability(),result=await runHybridRenderedAcquisition({directory:temp(t),target:target(),objective,parent:parent(),transport:'DECODO',browser:c.browser});
 assert.equal(c.state.contexts.length,1);assert.equal(c.state.contexts[0].proxy.server,'http://decodo.invalid:7000');assert.ok(c.state.routes.every(row=>row.continued&&!row.aborted));
 assert.deepEqual(new Set(result.networkSession.requestCount&&JSON.parse(fs.readFileSync(path.join(result.artifacts.root,result.networkSession.ledgerRef.file))).map(row=>row.resourceType)),new Set(['robots','geography','document','script','fetch','image']));
 const ledger=JSON.parse(fs.readFileSync(path.join(result.artifacts.root,result.networkSession.ledgerRef.file)));assert.ok(ledger.every(row=>row.transport==='DECODO'&&row.requestedCountry==='NO'&&row.sessionBinding===result.networkSession.sessionBinding));
 assert.equal(result.acquisition.countryReceipt.kind,'V3_VERIFIED_COUNTRY_RECEIPT');assert.equal(result.observation.context.networkGeography,'NO');
});

for(const marketCode of ['NO','SE','DK'])test(`failed Decodo ${marketCode} source gets one fresh Browser session through the same country proxy`,async t=>{
 const input=reacquisition(marketCode),currency={NO:'NOK',SE:'SEK',DK:'DKK'}[marketCode],body=establishedBody.replaceAll('NOK',currency),c=capability({body,country:marketCode});
 assert.equal(planHybridRenderedAcquisition(input.current,{url,transport:'DECODO',parent:input.parent}).scheduled,true);
 const result=await runHybridRenderedAcquisition({directory:temp(t),target:input.current,objective:input.objective,parent:input.parent,transport:'DECODO',browser:c.browser});
 assert.equal(result.outcome,'OBSERVED',JSON.stringify(result));assert.equal(c.state.contexts.length,1);assert.equal(c.state.contexts[0].proxy.username,'fixture-country-'+marketCode.toLowerCase());
 assert.equal(result.acquisition.countryReceipt.verifiedCountry,marketCode);assert.equal(result.observation.sha256,digest(body));assert.equal(result.observation.context.networkGeography,marketCode);
 const ledger=JSON.parse(fs.readFileSync(path.join(result.artifacts.root,result.networkSession.ledgerRef.file)));assert(ledger.every(row=>row.transport==='DECODO'&&row.requestedCountry===marketCode&&row.sessionBinding===result.networkSession.sessionBinding));
 assert.equal(result.v3Truth.established,true);assert.equal(result.v3SuggestedCandidates.length,1);
});

test('routing hint cannot fabricate a parent body, skip the failed Decodo proof, or reuse wrong country',async t=>{
 const input=reacquisition('NO'),browser=capability().browser;
 for(const current of [{...input.current,acquisitionOutcomes:[]},{...input.current,blockedOrigins:[new URL(url).origin]},{...input.current,capabilities:{...input.current.capabilities,decodo:false}}])assert.notEqual(planHybridRenderedAcquisition(current,{url,transport:'DECODO',parent:input.parent}).scheduled,true);
 const denied={...input.current,acquisitionOutcomes:[{...input.current.acquisitionOutcomes[0],responseTooLarge:false,accessBlocked:true}]};
 assert.equal(planHybridRenderedAcquisition(denied,{url,transport:'DECODO',parent:input.parent}).scheduled,false);
 assert.equal(planHybridRenderedAcquisition(input.current,{url,transport:'DECODO',parent:{...input.parent,body:'invented'}}).reason,'DECODO_BROWSER_FAILURE_PROOF_REQUIRED');
 const mismatch=capability({country:'SE'}),result=await runHybridRenderedAcquisition({directory:temp(t),target:input.current,objective:input.objective,parent:input.parent,transport:'DECODO',browser:mismatch.browser});
 assert.equal(result.outcome,'ACQUISITION_FAILED');assert.equal(result.v3Truth,undefined);assert.equal(result.truthState,'UNRESOLVED');
});

test('NO country proof admits an explicit USD monthly charge without converting it to NOK',async t=>{
 const input=reacquisition('NO'),body=establishedBody.replaceAll('NOK','USD'),c=capability({body,country:'NO'}),result=await runHybridRenderedAcquisition({directory:temp(t),target:input.current,objective:input.objective,parent:input.parent,transport:'DECODO',browser:c.browser});
 assert.equal(result.outcome,'OBSERVED',JSON.stringify(result));assert.equal(result.observation.sha256,digest(body));assert.equal(result.acquisition.countryReceipt.verifiedCountry,'NO');assert.equal(result.v3Truth.established,true,JSON.stringify(result.v3Truth.needs));assert.equal(result.v3Truth.prices.NO.propositions.CURRENCY.value,'USD');assert.equal(result.v3Truth.prices.NO.propositions.TARGET_MARKET.value,'NO');
});

test('currency alone never proves or disproves market when provider content names another country',async t=>{
 const input=reacquisition('NO'),base=capability({body:establishedBody.replaceAll('NOK','USD'),country:'NO'}),browser=async(...args)=>({...await base.browser(...args),marketSelector:{kind:'PROVIDER_MARKET_SELECTOR',code:'GB',label:'Current country GB'}});browser.close=base.browser.close;
 const result=await runHybridRenderedAcquisition({directory:temp(t),target:input.current,objective:input.objective,parent:input.parent,transport:'DECODO',browser});
 assert.equal(result.outcome,'MARKET_MISMATCH');assert.equal(result.reason,'BROWSER_PROVIDER_MARKET_CONFLICT');assert.equal(result.acquisition.countryReceipt.verifiedCountry,'NO');assert.equal(result.v3Truth,undefined);
});

test('a provider-displayed country contradicting the Decodo target blocks V3 admission',async t=>{
 const input=reacquisition('SE'),base=capability({body:establishedBody.replaceAll('NOK','SEK'),country:'SE'}),browser=async(...args)=>({...await base.browser(...args),marketSelector:{kind:'PROVIDER_MARKET_SELECTOR',code:'NO',label:'Current country NO'}});browser.close=base.browser.close;
 const result=await runHybridRenderedAcquisition({directory:temp(t),target:input.current,objective:input.objective,parent:input.parent,transport:'DECODO',browser});
 assert.equal(result.outcome,'MARKET_MISMATCH');assert.equal(result.reason,'BROWSER_PROVIDER_MARKET_CONFLICT');assert.equal(result.v3Truth,undefined);assert(result.artifacts.refs['page.html']);
});

test('source-bound Decodo plus Browser success teaches a reusable method, never a reusable price receipt',async t=>{
 const directory=temp(t),input=reacquisition('NO'),priceRows=[['Standard',79],['Plus',109],['Premium',139]].map(([name,amount])=>`<tr><td>${name}</td><td><p>Monthly: NOK ${amount}</p><p>Annual: NOK ${amount*10}</p><button>Select a plan</button></td></tr>`).join(''),pricePage=`<html><head><title>Example service plans</title><meta name="description" content="Example service subscriptions and monthly plans"></head><body><h1>Example service plans</h1><h2>Pricing (NOK)</h2><table>${priceRows}</table></body></html>`,c=capability({body:pricePage}),result=await runHybridRenderedAcquisition({directory:path.join(directory,'hybrid-rendered'),target:input.current,objective:input.objective,parent:input.parent,transport:'DECODO',browser:c.browser});
 assert.equal(result.v3Truth.established,true);
 const learnedTarget={...input.current,decisions:[{url,eligible:true,route:'DECODO',acquisitionReserved:true},{url,eligible:true,route:'BROWSER',acquisitionReserved:true}],renderingOutcomes:[{url,transport:'DECODO',sourceHash:null,outcome:'OBSERVED',actionId:result.actionId,artifacts:result.artifacts}],providerInterpretations:[{url,renderedAcquisition:true,v3Observation:result.v3Observation,v3Truth:result.v3Truth}]};
 assert.equal(readBrowserPricingRouteEvidence({directory,target:learnedTarget,interpretation:learnedTarget.providerInterpretations[0]}).sha256,result.observation.sha256);
 const memory=createProviderPricingRouteMemory(),rows=learnProviderPricingRoutesFromTarget({memory,target:learnedTarget,directory});assert.equal(rows.length,1);assert.equal(memory.provenMethods[0].method,'BROWSER');assert.equal(rows[0].sources[0].sha256,result.observation.sha256);
 const root=temp(t),jobId='11111111-1111-4111-8111-111111111111',recordedAt=new Date().toISOString();publishPricingRouteMemory(root,rows,{jobId,checkpoint:'priority-research-links',market:'NO',recordedAt,acquiredAt:result.freshAt});
 const checkpoint=path.join(temp(t),'adaptive-state.json');fs.writeFileSync(checkpoint,JSON.stringify({targets:{[learnedTarget.id]:learnedTarget},services:{[service]:{used:{acquisitions:2}}}}));
 assert.equal(publishPricingMethodOutcomes(root,{jobId,checkpoint:'priority-research-links',service,market:'NO',recordedAt,checkpointFile:checkpoint,confirmedSuccessUrls:[url],confirmedSuccessMethods:{[url]:'BROWSER'}}).published,1);
 const loaded=loadPricingRouteMemory(root,{services:[service]}),strategies=providerPricingStrategiesForTarget(loaded,input.current);assert(strategies.some(row=>row.method==='BROWSER'&&row.market==='NO'&&row.url===url));
 assert(strategies.every(row=>!Object.hasOwn(row,'countryReceipt')&&!Object.hasOwn(row,'price')));
});

test('visual interpretation runs once after HTML/DOM parsing and retains source-bound evidence',async t=>{
 const source='<html><title>Example service</title><body>Plans appear after rendering</body></html>',c=capability({body:source,renderedBody:source}),nodes=[
  {id:'dom-0',text:serviceName,role:'h1',bboxPx:[20,20,220,30]},
  {id:'dom-1',text:'Monthly',role:'h2',bboxPx:[30,110,180,24]},
  {id:'dom-2',text:'NOK 79.99/month',role:'span',bboxPx:[30,150,180,24]},
  {id:'dom-3',text:'Billed NOK 79.99 every month',role:'span',bboxPx:[30,190,300,24]},
 ];
 const base=c.browser,visual=async({observation,artifact,overview,dom,objective:currentObjective})=>({envelope:compileVisualObservation({serviceNodeId:'dom-0',offerings:[{nameNodeId:'dom-1',audience:'CONSUMER',relationship:'SUBSCRIPTION',charges:[{nodeIds:['dom-2'],amountText:'79.99',currencyText:'NOK',cadenceText:'/month',cadenceUnit:'MONTHLY',role:'ORDINARY',paymentNodeIds:['dom-3'],paymentText:'Billed NOK 79.99 every month',paymentCadence:'MONTHLY',priceKind:'CHARGE'}]}],globalNodeIds:[],uncertainties:[]},{observation,artifact,overview,dom,objective:currentObjective,requestHash:digest('request'),responseHash:digest('response'),responseModel:'fixture',createdAt:'2026-10-09T10:00:00.000Z'})});
 let calls=0;const browser=async(...args)=>{const result=await base(...args);result.dom=nodes;return result;};browser.close=base.close;
 const result=await runHybridRenderedAcquisition({directory:temp(t),target:target(),objective,parent:parent(),transport:'DECODO',browser,interpretVisual:async input=>{calls++;return visual(input);}});
 assert.equal(result.outcome,'OBSERVED',JSON.stringify(result));assert.equal(calls,1);assert.equal(result.usage.visualRequests,1);assert.equal(result.visualStatus,'PROJECTED');assert.equal(result.observation.visualEvidence.length,1);assert(result.artifacts.refs['visual-evidence.json']);
 assert.equal(result.v3Truth.established,true);
});

test('interactive Research link follows one acquired provider anchor in the same Decodo country context',async t=>{
 const destination=`https://${host}/plans`,body=`<html><a href="/plans">Choose plans</a></html>`,source={...parent(),body,sha256:digest(body)},need={kind:'RENDERED_REPRESENTATION',url,transport:'DECODO',market,sourceHash:source.sha256,navigationUrl:destination},x=target({demonstratedRendering:true,renderingNeed:need}),c=capability({finalUrl:destination}),result=await runHybridRenderedAcquisition({directory:temp(t),target:x,objective,parent:source,transport:'DECODO',browser:c.browser});
 assert.equal(result.outcome,'OBSERVED',JSON.stringify(result));assert.deepEqual(c.state.gotos,[url,destination]);assert.equal(result.observation.url,destination);assert.equal(result.acquisition.countryReceipt.verifiedCountry,'NO');assert.equal(c.state.contexts.length,1);
 const ledger=JSON.parse(fs.readFileSync(path.join(result.artifacts.root,result.networkSession.ledgerRef.file)));assert(ledger.every(row=>row.transport==='DECODO'&&row.requestedCountry==='NO'));assert(ledger.some(row=>row.urlHash===digest(destination)));
});

test('DIRECT browser stays unbound and uses no proxy or country reservation',async t=>{
 const c=capability(),result=await runHybridRenderedAcquisition({directory:temp(t),target:target(),objective,parent:parent(),transport:'DIRECT',browser:c.browser});assert.equal(result.outcome,'OBSERVED');assert.equal(c.state.contexts[0].proxy,undefined);assert.deepEqual(result.acquisition,{route:'DIRECT'});assert.deepEqual(result.observation.context,{transport:'DIRECT',networkGeography:'UNBOUND',representation:'PROVIDER_PAGE'});assert.equal(result.usage.countryActions,0);
});

test('Browser admits a bounded same-origin read-only JSON content POST but no mutation or cross-origin POST',async t=>{
 const json=method=>({method:'POST',headers:{'content-type':'application/json; charset=utf-8'},postData:JSON.stringify({method,params:{}})}),c=capability({additionalRequests:[
  [`https://${host}/api/execute`,'fetch',json('loadArticle')],
  [`https://${host}/api/execute`,'fetch',json('submitPurchase')],
  ['https://other.example/api/execute','fetch',json('loadArticle')],
  [`https://${host}/api/execute`,'document',json('loadArticle')]
 ]}),result=await runHybridRenderedAcquisition({directory:temp(t),target:target(),objective,parent:parent(),transport:'DIRECT',browser:c.browser});
 assert.equal(result.outcome,'OBSERVED');assert.deepEqual(c.state.routes.slice(-4).map(row=>row.continued),[true,false,false,false]);
 const ledger=JSON.parse(fs.readFileSync(path.join(result.artifacts.root,result.networkSession.ledgerRef.file)));
 assert.equal(ledger.filter(row=>row.method==='POST').length,1);assert.equal(ledger.find(row=>row.method==='POST').resourceType,'fetch');
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

test('C rendered provider observation emits source-bound commercial continuations for the common frontier projection',async t=>{
 const destination=`https://${host}/memberships`,body=`<html><head><title>${serviceName}</title></head><body><a href="${destination}">Membership pricing</a></body></html>`,fixture=capability({body}),result=await runHybridRenderedAcquisition({directory:temp(t),target:target(),objective,parent:parent(),transport:'DIRECT',browser:fixture.browser});
 assert.equal(result.outcome,'OBSERVED');const continuation=result.v3Continuations.find(row=>row.url===destination);assert(continuation);assert.equal(continuation.truthAuthority,'NONE');assert.equal(continuation.source.observation,result.v3Observation.id);assert.equal(continuation.source.bodySha256,result.v3Observation.sha256);
});
