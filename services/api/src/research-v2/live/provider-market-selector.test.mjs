import '../offline-replay/offline-guard.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import pngjs from 'pngjs';
import {browserRenderLimits,createPlaywrightRenderedCapability,providerReadOnlyPost} from '../../research-v3/browser-render.mjs';
import {hybridRenderedLimits,runHybridRenderedAcquisition} from './hybrid-rendered-acquisition.mjs';
import {projectEstablishedV3Offerings} from '../inventory/v3-result-projection.mjs';
import {digest} from '../../research-v3/model.mjs';
import {chooseProviderMarketOption,marketName,validateProviderSelectedMarketReceipt} from '../../research-v3/provider-market-evidence.mjs';
import {interpretSubscriptionPage} from '../../research-v3/subscription-page.mjs';
import {retainedProviderSelectorAuthority,researchLinkPriorityTarget} from './retained-render-source.mjs';
import {runOpenWebResearch} from './open-web-discovery.mjs';
import {runAdaptiveCampaign} from '../inventory/adaptive-campaign.mjs';

const {PNG}=pngjs;
const url='https://help.orbit.com/en-GB/article/pricing?redirect=true';
const service='orbit',serviceName='Orbit';
const link={id:'11111111-1111-4111-8111-111111111111',url,kind:'DIRECT_SOURCE',marketScope:'GLOBAL',enabled:true,truthAuthority:'NONE'};
const shell='<html><head><title>Orbit Help</title><script src="/app.js"></script><script src="/other.js"></script></head><body><div id="app"></div></body></html>';
const selector=code=>`<button type="button" aria-haspopup="listbox" aria-label="Change country or language. Current country ${code}">Country</button>`;
const prices={US:{code:'USD',symbol:'USD ',amounts:[9.99,15.99,19.99]},NO:{code:'NOK',symbol:'NOK ',amounts:[79,109,139]},GB:{code:'GBP',symbol:'£',amounts:[6.99,10.99,13.99]},AU:{code:'AUD',symbol:'A$',amounts:[9.99,13.99,17.99]},CZ:{code:'CZK',symbol:'Kč ',amounts:[259,339,429]},TR:{code:'TRY',symbol:'TRY ',amounts:[99,149,199]}};
const source=(market,{bundle=false,annual=false}={})=>{
 const {symbol,amounts}=prices[market];
 const rows=['Standard','Plus','Premium'].map((name,index)=>`<tr><td>${name}</td><td><p>Monthly: ${symbol}${amounts[index]}</p><p>Annual: ${symbol}${amounts[index]*10}</p><button>Select a plan</button></td></tr>`).join('');
 return `<html><head><title>Orbit plans</title><meta name="description" content="Orbit subscriptions and monthly plans"></head><body>${selector(market)}<h1>Orbit plans</h1><h2>Pricing (${prices[market].code})</h2><table>${rows}${bundle?`<tr><td>Orbit + Sports bundle</td><td><p>Monthly: ${symbol}99</p><button>Select a plan</button></td></tr>`:''}${annual?`<tr><td>Annual only</td><td><p>Annual: ${symbol}499</p><button>Select a plan</button></td></tr>`:''}</table></body></html>`;
};
const target=(market,extra={})=>({id:'orbit-'+market,service,serviceName,market,operationsObjective:'PRICE_RESEARCH',researchObjective:'SERVICE_COVERAGE',smartResearch:{version:2},capabilities:{direct:true,tavily:false,decodo:true,browser:true,groq:false},authorities:[{provider:serviceName,hostname:'help.orbit.com',sourceType:'OFFICIAL_PROVIDER',sourceUrl:url,checkedAt:'2026-01-01'}],providerSourceIdentityHosts:['help.orbit.com'],urls:[url],leads:[{url,title:'Provider pricing',rank:0}],gaps:['plan','amount','currency','cadence','priceRole','ownership','market'],reads:[],queries:[],decisions:[],verified:[],blockedOrigins:[],researchLinks:[link],researchLinkOutcomes:[],persistedVerifiedCount:0,...extra});
const objective=market=>({kind:'PRICE',serviceId:service,serviceName,providerHosts:['help.orbit.com'],markets:[market],seeds:[url]});
const parent=()=>({id:'retained-shell',kind:'PROVIDER',url,context:{transport:'DIRECT',networkGeography:'UNBOUND',representation:'PROVIDER_PAGE'},outcome:'OK',body:shell,sha256:digest(shell)});
const temp=t=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'provider-market-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));return dir;};
const png=()=>{const image=new PNG({width:800,height:600,colorType:6,inputColorType:6,inputHasAlpha:true});image.data.fill(255);return PNG.sync.write(image);};
function capability(market,{selectorCount=1,options=['Norway (English)','United Kingdom (English)','Australia (English)','United States (English)'],selectedOptionLabels=[],documentLang=null,hiddenOptionIndexes=[],disabledOptionIndexes=[],unchanged=false,wrongState=false,crossOrigin=false,lateCrossOriginAfterScreenshot=false,robots='User-agent: *\nAllow: /',foreignPrices=false,initialSelected=null,blockingOverlay=false,contentDelayMs=0,contentNever=false,contentQuietMs=0,contentTimeoutMs=250,contentNoise=false,lateContentDuringScreenshot=false,shellAfterClick=false,extraRequests=0,articleReadRequired=false,revertAfterScreenshot=false}={}){
 const state={selectorClicks:0,optionClicks:0,clickedLabel:null,selected:initialSelected??(market==='NO'?'GB':'NO'),routes:[],contexts:[],contentReady:false,contentSamples:0,captureBeforeReady:0,noiseTicks:0,extraText:'',lateCrossOrigin:false,readPostContinued:false};
 const pre=foreignPrices?source('NO'):initialSelected===market?source(market):shell.replace('</body>',selector(state.selected)+'</body>');
 const finalBody=()=>shellAfterClick?`<html><body>${selector(state.selected)}<h1>Page not found</h1><p>${'Unavailable article. '.repeat(20)}</p></body></html>`:source(wrongState?'AU':state.selected,{bundle:true,annual:true}).replace('</body>',state.extraText+'</body>');
 const chromium={async launch(){return {version:()=> 'fixture-browser',async close(){},async newContext(config){state.contexts.push(config);let routeHandler;
  return {request:{async get(){return {status:()=>200,body:async()=>Buffer.from(robots),headers:()=>({})};}},async route(_pattern,handler){routeHandler=handler;},async close(){},async newPage(){return {
   on(){},url:()=>crossOrigin&&state.optionClicks||state.lateCrossOrigin?'https://other.example/pricing':url,
   async goto(destination){let continued=false;await routeHandler({request:()=>({url:()=>destination,method:()=> 'GET',resourceType:()=> 'document'}),continue:async()=>{continued=true;},abort:async()=>{}});state.routes.push({destination,continued});for(let i=0;i<extraRequests;i++)await routeHandler({request:()=>({url:()=>`https://help.orbit.com/assets/${i}.js`,method:()=> 'GET',resourceType:()=> 'script'}),continue:async()=>{},abort:async()=>{}});return {status:()=>continued?200:403,body:async()=>Buffer.from(shell),headers:()=>({'content-type':'text/html'})};},
   async content(){if(state.optionClicks&&!state.contentReady)state.captureBeforeReady++;return state.optionClicks?(state.contentReady?finalBody():shell.replace('</body>',selector(state.selected)+'</body>')):pre;},async waitForLoadState(){},
   async evaluate(fn){if(fn.name==='consentDialogNames')return blockingOverlay?['Privacy Preference Center']:[];if(fn.name==='providerDocumentLanguage')return documentLang;if(fn.name==='marketContentState'){state.contentSamples++;if(contentNoise)state.noiseTicks++;const body=state.optionClicks?(state.contentReady?finalBody():shell.replace('</body>',selector(state.selected)+'</body>')):pre;return {text:body.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim(),semantic:state.optionClicks?state.contentReady&&!shellAfterClick:foreignPrices||initialSelected===market,ready:true,busy:false};}return String(fn).includes('createTreeWalker')?[{text:'Orbit plans',role:'h1',bboxPx:[2,2,200,30],ariaLabel:null,contextText:null,groupId:null,selected:null,disabled:null}]:{width:800,height:600};},
   locator(query){if(query==='[role="option"][aria-selected="true"]')return {count:async()=>selectedOptionLabels.length,nth:i=>({isVisible:async()=>true,isEnabled:async()=>true,innerText:async()=>selectedOptionLabels[i]})};assert.equal(query,'button[aria-haspopup="listbox"]');return {count:async()=>selectorCount,nth:()=>({isVisible:async()=>true,getAttribute:async()=>`Change country or language. Current country ${state.selected}`,click:async options=>{if(blockingOverlay)throw Error('OVERLAY_INTERCEPTS_POINTER');if(!options?.trial)state.selectorClicks++;}})};},
   getByRole(role){assert.equal(role,'option');return {count:async()=>options.length,nth:i=>({isVisible:async()=>!hiddenOptionIndexes.includes(i),isEnabled:async()=>!disabledOptionIndexes.includes(i),innerText:async()=>options[i],click:async()=>{state.optionClicks++;state.clickedLabel=options[i];if(!unchanged)state.selected=market;if(articleReadRequired)await routeHandler({request:()=>({url:()=> 'https://help.orbit.com/api/execute',method:()=> 'POST',resourceType:()=> 'fetch',headers:()=>({'content-type':'application/json'}),postData:()=>JSON.stringify({method:'loadArticle',params:{country:market}})}),continue:async()=>{state.readPostContinued=true;},abort:async()=>{}});if(!contentNever&&(!articleReadRequired||state.readPostContinued)){if(contentDelayMs)setTimeout(()=>{state.contentReady=true;},contentDelayMs);else state.contentReady=true;}}})};},
   async screenshot(){if(lateContentDuringScreenshot&&state.optionClicks)state.extraText='<p>Additional provider article detail</p>';if(revertAfterScreenshot&&state.optionClicks)state.contentReady=false;if(lateCrossOriginAfterScreenshot&&state.optionClicks)state.lateCrossOrigin=true;return png();}
  };}};
 }};}};
 const browser=createPlaywrightRenderedCapability({chromium,hostAllowed:async()=>true,clock:()=> '2026-10-16T10:00:00.000Z',limits:{...browserRenderLimits,marketContentQuietMs:contentQuietMs,marketContentTimeoutMs:contentTimeoutMs,consentSettleTimeoutMs:20}});
 return {browser,state};
}
async function run(t,market,options={}){const c=capability(market,options),directory=temp(t),result=await runHybridRenderedAcquisition({directory,target:target(market),objective:objective(market),parent:parent(),transport:'DIRECT',browser:c.browser});return {...c,result,directory};}

test('Czech Republic alias preserves the selected English language and issues a CZ receipt',async t=>{
 const {result,state}=await run(t,'CZ',{initialSelected:'US',options:['United States (English)','Czech Republic (čeština)','Czech Republic (English)'],selectedOptionLabels:['United States (English)'],documentLang:'en-US'});
 assert.equal(state.clickedLabel,'Czech Republic (English)');assert.equal(result.marketSelection?.targetMarket,'CZ');
 assert.equal(projectEstablishedV3Offerings({...target('CZ'),...result}).length,3);
});

test('provider Turkey option selects canonical Türkiye and binds the final TR receipt',async t=>{
 assert.equal(marketName('TR'),'Türkiye');
 const {result,state}=await run(t,'TR',{initialSelected:'US',options:['United States (English)','Turkey (English)'],selectedOptionLabels:['United States (English)'],documentLang:'en-US'});
 assert.equal(state.clickedLabel,'Turkey (English)');
 assert.equal(result.marketSelection?.targetMarket,'TR');
 assert.equal(result.marketSelection?.selectedOption,'Turkey (English)');
 assert.equal(result.marketSelection?.finalSourceSha256,result.observation.sha256);
 assert.equal(result.v3Truth.established,true);
 assert.equal(projectEstablishedV3Offerings({...target('TR'),...result}).length,3);
});

for(const [label,options] of [['absent',['United States (English)','Germany (English)']],['ambiguous',['Turkey (English)','Turkey (Türkçe)']]])test(`${label} Turkey options produce no receipt or TR truth`,async t=>{
 const {result,state}=await run(t,'TR',{initialSelected:'US',options});
 assert.equal(state.optionClicks,0);
 assert.equal(result.marketSelection,null);
 assert.equal(result.v3Truth.established,false);
});

test('absent India option remains unresolved and retains bounded candidate diagnostics',async t=>{
 const {result,state,directory}=await run(t,'IN',{initialSelected:'US',options:['United States (English)','Czech Republic (English)','Singapore (English)']});
 assert.equal(state.optionClicks,0);assert.equal(result.marketSelection,null);
 const rows=fs.readFileSync(path.join(directory,'journal.jsonl'),'utf8').trim().split('\n').map(JSON.parse),decision=rows.find(row=>row.type==='PROVIDER_MARKET_ACTION_RESULT');
 assert.equal(decision.reason,'PROVIDER_MARKET_OPTION_UNRESOLVED');assert.equal(decision.selectorDiagnostic.reason,'TARGET_OPTION_ABSENT_OR_LABEL_MISMATCH');
 assert.equal(decision.selectorDiagnostic.targetMarket,'IN');assert.equal(decision.selectorDiagnostic.optionCount,3);
 assert.equal(decision.selectorDiagnostic.options.length,3);
});

for(const market of ['US','NO','GB','AU'])test(`${market} provider selector retains three monthly plans and source-bound market truth`,async t=>{
 const {result,state}=await run(t,market);
 assert.equal(result.outcome,'OBSERVED',JSON.stringify(result));assert.equal(result.marketSelection.targetMarket,market);
 assert.equal(result.v3Truth.established,true,JSON.stringify(result.v3Truth.needs));
 assert.deepEqual(result.v3SuggestedCandidates.map(row=>row.market),[market,market,market]);
 assert(result.v3SuggestedCandidates.every(row=>row.provenance==='V3_SOURCE_RESEARCH'&&row.sourceHash===result.observation.sha256));
 const verified=projectEstablishedV3Offerings({...target(market),...result});assert.equal(verified.length,3);
 assert.deepEqual(verified.map(row=>row.ordinaryRecurringPrice.currency),[prices[market].code,prices[market].code,prices[market].code]);
 assert.equal(state.selectorClicks,1);assert.equal(state.optionClicks,1);assert.equal(result.usage.browserActions,2);assert.equal(result.usage.countryActions,0);
 assert.equal(result.observation.context.transport,'DIRECT');assert.equal(result.v3Truth.offers.length,3);
 assert.equal(result.observation.marketSelection.finalSourceSha256,result.observation.sha256);
 assert.equal(result.artifacts.marketPrior.observation.sha256,digest(shell.replace('</body>',selector(market==='NO'?'GB':'NO')+'</body>')));
 assert.equal(result.v3Truth.offers.every(row=>row.propositions.TARGET_MARKET?.evidence?.some(e=>e.reference?.marketContext?.basis==='PROVIDER_SELECTED_MARKET')),true);
});

test('already-selected provider market issues a final source-bound receipt without a selector click',async t=>{
 const {result,state}=await run(t,'NO',{initialSelected:'NO'});
 assert.equal(result.outcome,'OBSERVED');assert.equal(state.selectorClicks,0);assert.equal(state.optionClicks,0);
 assert.equal(result.marketSelection.selectionMode,'ALREADY_SELECTED');assert.equal(result.marketSelection.selectedOption,null);
 assert.equal(result.marketSelection.preSelectedCode,'NO');assert.equal(result.marketSelection.selectedCode,'NO');
 assert.equal(result.marketSelection.finalSourceSha256,result.observation.sha256);
 assert.equal(validateProviderSelectedMarketReceipt(result.marketSelection,{observationId:result.observation.id,url:result.observation.url,body:result.observation.body,sourceHash:result.observation.sha256,targetMarket:'NO'}).targetMarket,'NO');
 assert.equal(result.v3SuggestedCandidates.length,3);assert.equal(projectEstablishedV3Offerings({...target('NO'),...result}).length,3);
});

for(const [market,english,other] of [
 ['NO','Norway (English)','Norway (Norsk)'],
 ['US','United States (English)','United States (Español)'],
])for(const ordered of [[english,other],[other,english]])test(`${market} preserves selected provider language independent of option order: ${ordered.join(', ')}`,async t=>{
 const {result,state}=await run(t,market,{initialSelected:'SE',options:['Sweden (English)',...ordered],selectedOptionLabels:['Sweden (English)'],documentLang:'en-GB'});
 assert.equal(result.marketSelection?.selectedOption,english);
 assert.equal(result.marketSelection?.targetMarket,market);
 assert.equal(state.clickedLabel,english);
 assert.equal(state.optionClicks,1);
 assert.equal(result.v3SuggestedCandidates.length,3);
 assert.equal(projectEstablishedV3Offerings({...target(market),...result}).length,3);
});

test('provider selected language outranks conflicting document language',()=>{
 assert.deepEqual(chooseProviderMarketOption({target:'US',currentCode:'SE',candidates:['United States (English)','United States (Español)'],selectedOptions:['Sweden (English)'],documentLang:'es'}),{index:0,basis:'SELECTED_OPTION_LANGUAGE'});
});

test('explicit document language resolves a same-country tie when selected option has no language',()=>{
 assert.deepEqual(chooseProviderMarketOption({target:'US',currentCode:'SE',candidates:['United States (English)','United States (Español)'],selectedOptions:['Sweden'],documentLang:'es'}),{index:1,basis:'DOCUMENT_LANGUAGE'});
 assert.deepEqual(chooseProviderMarketOption({target:'NO',currentCode:'SE',candidates:['Norway (English)','Norway (Norsk)'],selectedOptions:['Sweden'],documentLang:'no'}),{index:1,basis:'DOCUMENT_LANGUAGE'});
});

for(const [label,options] of [
 ['neither language matches',{options:['Norway (English)','Norway (Norsk)'],selectedOptionLabels:['Sweden (Français)'],documentLang:'fr'}],
 ['both options normalize to English',{options:['Norway (English)','Norway (en)'],selectedOptionLabels:['Sweden (English)'],documentLang:'en-GB'}],
 ['URL locale is the only language clue',{options:['Norway (English)','Norway (Norsk)']}],
 ['selected option conflicts with current country',{options:['Norway (English)','Norway (Norsk)'],selectedOptionLabels:['Germany (English)'],documentLang:'en-GB'}],
])test(`${label} leaves duplicate target options unresolved`,async t=>{
 const {result,state}=await run(t,'NO',{initialSelected:'SE',...options});
 assert.equal(state.optionClicks,0);assert.equal(result.marketSelection,null);
 assert.equal(result.v3Truth.established,false);
});

test('language cannot resolve candidates from different countries',()=>{
 assert.equal(chooseProviderMarketOption({target:'NO',currentCode:'SE',candidates:['Norway (English)','Sweden (English)'],selectedOptions:['Sweden (English)'],documentLang:'en-GB'}),null);
});

test('already-selected target with language variants remains zero-click',async t=>{
 const {result,state}=await run(t,'NO',{initialSelected:'NO',options:['Norway (English)','Norway (Norsk)'],selectedOptionLabels:['Norway (Norsk)'],documentLang:'no'});
 assert.equal(result.marketSelection?.selectionMode,'ALREADY_SELECTED');
 assert.equal(state.selectorClicks,0);assert.equal(state.optionClicks,0);
 assert.equal(result.v3SuggestedCandidates.length,3);
});

test('already-selected receipt rejects wrong selected state and stale final hash',async t=>{
 const {result}=await run(t,'NO',{initialSelected:'NO'}),receipt=result.marketSelection,context={observationId:result.observation.id,url:result.observation.url,body:result.observation.body,sourceHash:result.observation.sha256,targetMarket:'NO'};
 for(const change of [{preSelectedCode:'GB'},{selectedCode:'GB'},{finalSourceSha256:'0'.repeat(64)},{selectorLabel:'Current country GB'},{observationId:'other'}])assert.throws(()=>validateProviderSelectedMarketReceipt({...receipt,...change},context));
});

test('blocking consent overlay prevents selection and cannot produce a market receipt',async t=>{
 const {result,state}=await run(t,'GB',{blockingOverlay:true});
 assert.equal(result.outcome,'OBSERVED');assert.equal(result.marketSelection,null);assert.equal(result.v3Truth.established,false);
 assert.equal(state.selectorClicks,0);assert.equal(state.optionClicks,0);
});

test('provider-owned JSON article fetch is admitted while purchase and unrelated POSTs remain blocked',()=>{
 const request=(method,path,operation,{origin='https://help.orbit.com',type='fetch',contentType='application/json; charset=utf-8'}={})=>({method:()=>method,url:()=>origin+path,resourceType:()=>type,headers:()=>({'content-type':contentType}),postData:()=>JSON.stringify({method:operation,params:{}})});
 assert.equal(providerReadOnlyPost(request('POST','/api/execute','loadArticle'),'https://help.orbit.com'),true);
 assert.equal(providerReadOnlyPost(request('POST','/api/execute','getPlans'),'https://help.orbit.com'),true);
 assert.equal(providerReadOnlyPost(request('POST','/api/execute','submitPurchase'),'https://help.orbit.com'),false);
 assert.equal(providerReadOnlyPost(request('POST','/checkout','getPlans'),'https://help.orbit.com'),false);
 assert.equal(providerReadOnlyPost(request('POST','/api/execute','loadArticle',{origin:'https://other.example'}),'https://help.orbit.com'),false);
 assert.equal(providerReadOnlyPost(request('POST','/api/execute','loadArticle',{type:'document'}),'https://help.orbit.com'),false);
 assert.equal(providerReadOnlyPost(request('POST','/api/execute','loadArticle',{contentType:'text/plain'}),'https://help.orbit.com'),false);
 assert.equal(providerReadOnlyPost({...request('POST','/api/execute','loadArticle'),postData:()=>'{"query":"mutation ChangePlan { changePlan }"}'} ,'https://help.orbit.com'),false);
});

test('selector confirmation waits for asynchronous article content and binds the final post-screenshot hash',async t=>{
 const {result,state}=await run(t,'GB',{contentDelayMs:180,contentQuietMs:50,contentTimeoutMs:900,lateContentDuringScreenshot:true});
 assert.equal(result.outcome,'OBSERVED');assert.equal(state.optionClicks,1);assert(state.contentSamples>=4);
 assert.equal(state.captureBeforeReady,0);assert.equal(result.v3Truth.established,true);
 assert.equal(result.v3SuggestedCandidates.length,3);assert.equal(projectEstablishedV3Offerings({...target('GB'),...result}).length,3);
 assert.match(result.observation.body,/Additional provider article detail/);
 assert.equal(result.observation.sha256,digest(result.observation.body));
 assert.equal(result.marketSelection.finalSourceSha256,result.observation.sha256);
});

test('confirmed target without article content times out without a market receipt or fabricated truth',async t=>{
 const started=Date.now(),{result,state}=await run(t,'GB',{contentNever:true,contentTimeoutMs:180});
 assert(Date.now()-started<2000);assert.equal(state.optionClicks,1);assert.equal(state.captureBeforeReady,0);
 assert.equal(result.marketSelection,null);assert.equal(result.v3Truth.established,false);
 assert.equal(projectEstablishedV3Offerings({...target('GB'),...result}).length,0);
});

test('changed error shell with selected country cannot issue a provider market receipt',async t=>{
 const {result,state}=await run(t,'GB',{shellAfterClick:true,contentTimeoutMs:180});
 assert.equal(state.optionClicks,1);assert.equal(result.marketSelection,null);
 assert.equal(result.observation.url,url);assert.equal(result.v3Truth.established,false);
});

test('target article that reverts after screenshot cannot bind a final receipt',async t=>{
 const {result,state}=await run(t,'GB',{revertAfterScreenshot:true,contentTimeoutMs:180});
 assert.equal(state.optionClicks,1);assert.equal(result.marketSelection,null);
 assert.equal(projectEstablishedV3Offerings({...target('GB'),...result}).length,0);
});

test('bounded request allowance includes the provider article read after a busy app shell',async t=>{
 assert.equal(browserRenderLimits.requests,hybridRenderedLimits.perAttemptNetworkRequests);
 const {result,state}=await run(t,'AU',{extraRequests:275,articleReadRequired:true});
 assert.equal(state.readPostContinued,true);
 assert.equal(result.marketSelection?.targetMarket,'AU');
 assert(result.usage.actualNetworkRequests>256);
 assert(result.usage.actualNetworkRequests<=browserRenderLimits.requests);
 assert.equal(result.v3SuggestedCandidates.length,3);
 assert.equal(projectEstablishedV3Offerings({...target('AU'),...result}).length,3);
});

test('unrelated animation churn cannot extend a settled article wait indefinitely',async t=>{
 const {result,state}=await run(t,'AU',{contentNoise:true,contentQuietMs:50,contentTimeoutMs:600});
 assert.equal(result.v3Truth.established,true);assert(state.noiseTicks>1);assert.equal(state.optionClicks,1);
});

test('navigation after selector confirmation cannot bind a stale URL to final content',async t=>{
 const {result,state}=await run(t,'GB',{lateCrossOriginAfterScreenshot:true});
 assert.equal(state.optionClicks,1);assert.equal(result.marketSelection,null);assert.equal(result.v3Truth.established,false);
 assert.equal(projectEstablishedV3Offerings({...target('GB'),...result}).length,0);
});

test('URL locale and pre-selection NOK prices do not establish GB market truth',async t=>{
 const {result}=await run(t,'GB',{foreignPrices:true});assert.equal(result.v3Truth.established,true);assert.equal(result.v3SuggestedCandidates.length,3);assert(result.v3SuggestedCandidates.every(row=>row.market==='GB'&&row.currency==='GBP'));assert.equal(result.marketSelection.preSelectedCode,'NO');
});

for(const [label,options,selectorClicks,optionClicks] of [
 ['no selector',{selectorCount:0},0,0],['ambiguous selector',{selectorCount:2},0,0],['selector only in untrusted iframe',{selectorCount:0},0,0],['duplicate target options',{options:['United Kingdom (English)','United Kingdom (French)']},1,0],['target option absent',{options:['Norway (English)']},1,0],['selected state unchanged',{unchanged:true},1,1],['selected state wrong',{wrongState:true},1,1],['cross-provider navigation',{crossOrigin:true},1,1],
])test(`${label} yields no canonical market truth`,async t=>{
 const {result,state}=await run(t,'GB',options);assert.equal(result.outcome,'OBSERVED');assert.equal(result.marketSelection,null);assert.equal(result.v3Truth.established,false);assert.equal(projectEstablishedV3Offerings({...target('GB'),...result}).length,0);assert.equal(state.selectorClicks,selectorClicks);assert.equal(state.optionClicks,optionClicks);
});

for(const [label,optionFilter] of [
 ['hidden duplicate',{hiddenOptionIndexes:[1]}],
 ['disabled duplicate',{disabledOptionIndexes:[1]}],
])test(`${label} is not an actionable second market option`,async t=>{
 const {result,state}=await run(t,'GB',{options:['United Kingdom (English)','United Kingdom (French)'],...optionFilter});
 assert.equal(state.optionClicks,1);assert.equal(result.marketSelection?.targetMarket,'GB');
 assert.equal(result.marketSelection?.selectedOption,'United Kingdom (English)');
});

test('robots disallow prevents Browser before document request and clicks',async t=>{const {result,state}=await run(t,'GB',{robots:'User-agent: *\nDisallow: /'});assert.equal(result.outcome,'ACQUISITION_FAILED');assert.equal(state.routes.length,0);assert.equal(state.selectorClicks,0);});

test('market receipt requires exact target, observation, final source hash and provider control',async t=>{
 const {result}=await run(t,'GB'),receipt=result.marketSelection,context={observationId:result.observation.id,url:result.observation.url,body:result.observation.body,sourceHash:result.observation.sha256,targetMarket:'GB'};
 assert.equal(validateProviderSelectedMarketReceipt(receipt,context).targetMarket,'GB');
 for(const changed of [{targetMarket:'AU'},{observationId:'other'},{finalSourceSha256:'0'.repeat(64)},{selectedCode:'AU'},{providerHost:'other.example'}])assert.throws(()=>validateProviderSelectedMarketReceipt({...receipt,...changed},context));
 assert.throws(()=>validateProviderSelectedMarketReceipt(receipt,{...context,body:context.body+' '}));
 assert.throws(()=>validateProviderSelectedMarketReceipt(receipt,{...context,sourceHash:'0'.repeat(64)}));
});

test('annual charges and bundle rows stay out of three standalone monthly prices',()=>{
 const parsed=interpretSubscriptionPage({body:source('GB',{bundle:true,annual:true}),url,providerName:serviceName});assert.deepEqual(parsed.offerings.map(row=>row.name),['Standard','Plus','Premium']);assert(parsed.offerings.every(row=>row.charges.length===1&&row.charges[0].billingCadence==='MONTHLY'));
});

test('exact retained GLOBAL link routes Direct shell to Browser for a non-URL market',async t=>{
 const dir=temp(t),x=target('NO',{authorities:[]}),read=async()=>({url,outcome:'OK',httpStatus:200,contentType:'text/html',rawSource:{text:shell},sourceIntegrity:{sha256:digest(shell)},accessDecisions:[{decision:'ALLOWED'}]}),state=await runOpenWebResearch({directory:dir,targets:[x],maxActions:1,read,search:async()=>{throw Error('NO_SEARCH');},acquire:async()=>{throw Error('NO_DECODO');},render:async()=>{throw Error('NOT_YET');}});
 const current=state.targets[0];assert.equal(current.reads.length,1);assert.equal(current.renderingNeed?.transport,'DIRECT',JSON.stringify({plan:current.researchPlan,reads:current.reads,leads:current.leads,events:fs.readFileSync(dir+'/journal.jsonl','utf8')}));assert.equal(current.renderingNeed?.url,url);assert.equal(current.renderingNeed?.sourceHash,digest(shell));assert.equal(retainedProviderSelectorAuthority(current,{url,sourceHash:digest(shell)})?.registrableDomain,'orbit.com');
 assert.equal(current.researchLinkOutcomes.length,0);
});

test('successful GLOBAL selector route short-circuits Decodo, Gemini, Tavily and broad discovery',async t=>{
 const dir=temp(t),x=target('GB',{authorities:[]}),c=capability('GB'),calls={read:0,render:0,decodo:0,search:0};
 const state=await runOpenWebResearch({directory:dir,targets:[x],maxActions:10,
  read:async()=>{calls.read++;return {url,outcome:'OK',httpStatus:200,contentType:'text/html',rawSource:{text:shell},sourceIntegrity:{sha256:digest(shell)},accessDecisions:[{decision:'ALLOWED'}]};},
  render:async({target:current})=>{calls.render++;return runHybridRenderedAcquisition({directory:path.join(dir,'hybrid-rendered'),target:current,objective:objective('GB'),parent:parent(),transport:'DIRECT',browser:c.browser});},
  acquire:async()=>{calls.decodo++;throw Error('DECODO_SHOULD_NOT_RUN');},
  search:async()=>{calls.search++;throw Error('TAVILY_SHOULD_NOT_RUN');}});
 const current=state.targets[0];assert.deepEqual(calls,{read:1,render:1,decodo:0,search:0});
 assert.equal(projectEstablishedV3Offerings(current).length,3);
 assert.equal(current.v3SuggestedCandidates.length,3);
 assert.equal(current.renderingOutcomes[0].usage.browserActions,2);
 assert.equal(current.renderingOutcomes[0].usage.countryActions,0);
 assert.equal(current.researchLinkOutcomes[0].result,'VERIFIED');assert.equal(current.researchLinkOutcomes[0].transport,'DIRECT_BROWSER');
});

for(const market of ['US','NO','GB','AU'])test(`${market} priority campaign selects provider market before Decodo or discovery even with historical Verified`,async t=>{
 const directory=temp(t),caps=target(market).capabilities,priority=researchLinkPriorityTarget(target(market,{persistedVerifiedCount:market==='NO'?3:0}),caps),c=capability(market),calls={read:0,render:0,decodo:0,search:0};
 const state=await runAdaptiveCampaign({directory,manifest:{targets:[priority],conditionalFollowupTargets:[]},profile:'PRODUCTION',maxActions:3,createAdapters:async()=>({
  read:async()=>{calls.read++;return {url,outcome:'OK',httpStatus:200,contentType:'text/html',rawSource:{text:shell},sourceIntegrity:{sha256:digest(shell)},accessDecisions:[{decision:'ALLOWED'}]};},
  render:async({target:current,need})=>{calls.render++;assert.equal(need.transport,'DIRECT');return runHybridRenderedAcquisition({directory:path.join(directory,'hybrid-rendered'),target:current,objective:objective(market),parent:parent(),transport:'DIRECT',browser:c.browser});},
  acquire:async()=>{calls.decodo++;throw Error('DECODO_SHOULD_NOT_RUN');},
  search:async()=>{calls.search++;throw Error('TAVILY_SHOULD_NOT_RUN');}
 })});
 const current=state.targets[priority.id];assert.deepEqual(calls,{read:1,render:1,decodo:0,search:0});
 assert.deepEqual(state.decisionHistory.filter(row=>row.decision==='ACTIVATE').map(row=>row.plan.route),['DIRECT','PARK_RENDERING']);
 assert.equal(projectEstablishedV3Offerings(current).length,3);assert.equal(current.v3SuggestedCandidates.length,3);
 assert.equal(current.researchLinkOutcomes[0].result,'VERIFIED');assert.equal(c.state.optionClicks,1);
});

test('priority campaign permits one Decodo fallback when a provider selector is unavailable',async t=>{
 const directory=temp(t),caps=target('GB').capabilities,priority=researchLinkPriorityTarget(target('GB'),caps),c=capability('GB',{selectorCount:0}),calls={read:0,render:0,decodo:0,search:0};
 const state=await runAdaptiveCampaign({directory,manifest:{targets:[priority],conditionalFollowupTargets:[]},profile:'PRODUCTION',maxActions:3,createAdapters:async()=>({
  read:async()=>{calls.read++;return {url,outcome:'OK',httpStatus:200,contentType:'text/html',rawSource:{text:shell},sourceIntegrity:{sha256:digest(shell)},accessDecisions:[{decision:'ALLOWED'}]};},
  render:async({target:current,need})=>{calls.render++;return runHybridRenderedAcquisition({directory:path.join(directory,'hybrid-rendered'),target:current,objective:objective('GB'),parent:parent(),transport:need.transport,browser:c.browser});},
  acquire:async()=>{calls.decodo++;return {classification:'ACQUISITION_FAILED',sourceClassification:{status:'UNKNOWN_SOURCE'},verified:[],acquisitionBytes:0};},
  search:async()=>{calls.search++;throw Error('TAVILY_SHOULD_NOT_RUN');}
 })});
 assert.deepEqual(calls,{read:1,render:1,decodo:1,search:0},JSON.stringify(state.decisionHistory.map(row=>({route:row.plan.route,reason:row.reason,decision:row.decision,capability:row.capability}))));
 assert.deepEqual(state.decisionHistory.filter(row=>row.decision==='ACTIVATE').map(row=>row.plan.route),['DIRECT','PARK_RENDERING','DECODO']);
 assert.equal(c.state.optionClicks,0);assert.equal(projectEstablishedV3Offerings(state.targets[priority.id]).length,0);
});

test('pre-selection prices for another country remain unbound when target selection is unavailable',async t=>{
 const {result}=await run(t,'GB',{foreignPrices:true,options:['Norway (English)']});
 assert.equal(result.v3Truth.established,false);assert.equal(result.marketSelection,null);
 assert.equal(projectEstablishedV3Offerings({...target('GB'),...result}).length,0);
});

for(const [name,change] of [
 ['pre hash',receipt=>{receipt.preSourceSha256='0'.repeat(64);}],
 ['initial URL',receipt=>{receipt.initialUrl='https://help.orbit.com/other';}],
 ['final hash',receipt=>{receipt.finalSourceSha256='0'.repeat(64);}]
])test(`tampered ${name} cannot establish provider-selected market`,async t=>{
 const c=capability('GB'),browser=async(...args)=>{const result=await c.browser(...args);if(args[0].mode==='MARKET')change(result.marketSelection);return result;};browser.close=c.browser.close;
 const result=await runHybridRenderedAcquisition({directory:temp(t),target:target('GB'),objective:objective('GB'),parent:parent(),transport:'DIRECT',browser});
 assert.equal(result.outcome,'OBSERVED');assert.equal(result.marketSelection,null);assert.equal(result.v3Truth.established,false);
});

test('unresolved selector route falls back to one bounded Decodo link acquisition',async t=>{
 const dir=temp(t),c=capability('GB',{selectorCount:0}),calls={read:0,render:0,decodo:0,search:0};
 const state=await runOpenWebResearch({directory:dir,targets:[target('GB',{authorities:[]})],maxActions:3,
  read:async()=>{calls.read++;return {url,outcome:'OK',httpStatus:200,contentType:'text/html',rawSource:{text:shell},sourceIntegrity:{sha256:digest(shell)},accessDecisions:[{decision:'ALLOWED'}]};},
  render:async({target:current})=>{calls.render++;return runHybridRenderedAcquisition({directory:path.join(dir,'hybrid-rendered'),target:current,objective:objective('GB'),parent:parent(),transport:'DIRECT',browser:c.browser});},
  acquire:async()=>{calls.decodo++;return {classification:'ACQUISITION_FAILED',sourceClassification:{status:'UNKNOWN_SOURCE'},verified:[],acquisitionBytes:0};},
  search:async()=>{calls.search++;throw Error('BROAD_DISCOVERY_SHOULD_NOT_RUN');}});
 assert.deepEqual(calls,{read:1,render:1,decodo:1,search:0});
 assert.equal(projectEstablishedV3Offerings(state.targets[0]).length,0);
 assert.equal(state.targets[0].researchLinkOutcomes[0].decodoAttempted,true);
});


test('same-origin provider redirect keeps exact link routing; cross-provider redirect is rejected',()=>{
 const hash=digest(shell),finalUrl='https://help.orbit.com/en-GB/article/pricing',row={requestedUrl:url,url:finalUrl,outcome:'OK',bodyHash:hash,sourceIntegrity:{sha256:hash},bodyFile:`bodies/${hash}.txt`,accessDecisions:[{decision:'ALLOWED'}]};
 assert.equal(retainedProviderSelectorAuthority(target('GB',{reads:[row]}),{url:finalUrl,sourceHash:hash})?.registrableDomain,'orbit.com');
 assert.equal(retainedProviderSelectorAuthority(target('GB',{reads:[{...row,url:'https://other.example/pricing'}]}),{url:'https://other.example/pricing',sourceHash:hash}),null);
});
