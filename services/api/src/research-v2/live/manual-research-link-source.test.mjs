import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createDecodoProvider} from '../../../../../docs/catalog/global-47/research-v1/decodo-adapter.mjs';
import {v3ResultFromTarget} from '../../google-ai/admin-live-pipeline.mjs';
import {iterateMarketRunRecords} from '../../research-v1/market-run-store.mjs';
import {digest} from '../../research-v3/model.mjs';
import {DiscoveryJournal} from './online-discovery.mjs';
import {runOpenWebResearch} from './open-web-discovery.mjs';
import {createDiscoveryAcquirer} from './online-discovery-stage.mjs';
import {priceResearchAcquisitionCandidate} from './price-research-candidate.mjs';
import {planResearch} from './research-planner.mjs';
import {runLive} from './runner.mjs';

const origin='https://www.disneyplus.com';
const rootUrl=origin+'/';
const runtime={SAVLIVO_DECODO_ENABLED:'true',SAVLIVO_DECODO_APPROVED:'true',SAVLIVO_DECODO_ROUTING_MODE:'COMMON_GATEWAY',SAVLIVO_DECODO_COST_CLASS:'PAID',SAVLIVO_DECODO_CURRENCY:'USD',SAVLIVO_GEO_VERIFIER_APPROVED:'true',SAVLIVO_DECODO_ESTIMATED_COST:'0.10',SAVLIVO_DECODO_RESERVED_COST:'0.20',SAVLIVO_DECODO_LIVE_TASK_CEILING:'0.20',SAVLIVO_DECODO_LIVE_MARKET_CEILING:'0.20',SAVLIVO_DECODO_LIVE_RUN_CEILING:'0.40',DECODO_USERNAME:'fixture-user',DECODO_PASSWORD:'fixture-password'};
const response=(body,type='text/html',status=200,headers={})=>({status,headers:{'content-type':type,...headers},body:Buffer.from(body),tlsVerified:true});
const link=url=>({id:'11111111-1111-4111-8111-111111111111',url,kind:'DIRECT_SOURCE',marketScope:'GLOBAL',marketCode:null,enabled:true,truthAuthority:'NONE'});
const target=(market,url)=>({id:'disney-plus-'+market,service:'disney-plus',serviceName:'Disney+',market,operationsObjective:'PRICE_RESEARCH',researchObjective:'SERVICE_COVERAGE',smartResearch:{version:2},providerSourceIdentityHosts:['www.disneyplus.com'],authorities:[],urls:[],leads:[],knownCommercialUrls:[],reads:[],queries:[],decisions:[],verified:[],blockedOrigins:[],researchLinks:[link(url)],researchLinkOutcomes:[],capabilities:{direct:true,decodo:true,tavily:true,browser:true,groq:false},gaps:['plan','amount','currency','cadence','priceRole','ownership','market']});
const staticBody=(market,currency,base)=>`<!doctype html><html lang="en-${market}"><head><title>Plans and Pricing | Disney+ Help Center</title><meta name="description" content="Discover the different streaming plans Disney+ offers and how much Disney+ costs."></head><body><main><h1>Plans and Pricing</h1><p>Disney+ plans are billed monthly on the signup date.</p><h3>Pricing (${currency})</h3><ul>${['Standard with ads','Standard','Premium'].map((name,index)=>`<li><p><span>${name}: ${currency} ${base+index*5} / month</span></p></li>`).join('')}</ul><section><h2>Annual options</h2><p>${currency} ${base*10} / year, billed yearly. Monthly equivalent ${currency} ${(base*10/12).toFixed(2)} / month, billed yearly.</p></section><section><h2>Bundle options</h2><p>Disney+ + Other service bundle: ${currency} 99 / month.</p></section></main></body></html>`;
const fail=()=>assert.fail('Broad discovery ran before the manual source was inspected');

async function fixture(t,{market='US',requestedUrl=rootUrl,finalUrl=requestedUrl,body=staticBody(market,'USD',11),geoCountry=market,maxActions=1,render=null,robotsPolicy='User-agent: *\nAllow: /',robotsRedirect=false}={}){
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'manual-source-'));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
 const current=target(market,requestedUrl),wire=[];
 assert.deepEqual([planResearch(current).route,planResearch(current).url],['DECODO',requestedUrl]);
 const bundle=createDecodoProvider({env:runtime,resolveHost:async()=>[{address:'93.184.216.34',family:4}],requestHop:async r=>{
  const url=r.url.href;wire.push({url,country:r.targetCountry});let result;
  if(url===origin+'/robots.txt'&&robotsRedirect)result=response('','text/plain',302,{location:'/policy/robots.txt'});
  else if(url===origin+'/robots.txt'||url===origin+'/policy/robots.txt')result=response(robotsPolicy,'text/plain');
  else if(url==='https://ipwho.is/robots.txt')result=response('User-agent: *\nAllow: /','text/plain');
  else if(url==='https://ipwho.is/?fields=success,ip,country_code')result=response(JSON.stringify({success:true,ip:'93.184.216.34',country_code:geoCountry}),'application/json');
  else if(url===requestedUrl&&requestedUrl!==finalUrl)result=response('','text/html',302,{location:finalUrl});
  else if(url===finalUrl)result=response(body);
  else assert.fail(`Unexpected Decodo request: ${url}`);
  r.onBytes?.(result.body.length);return result;
 }});
 const acquirer=createDiscoveryAcquirer({runtime,bundle,root:path.join(directory,'runs'),runLive:args=>runLive({...args,clock:()=>new Date('2026-10-16T12:00:00.000Z').toISOString(),dependencies:{...args.dependencies,resolveHost:async()=>[{address:'93.184.216.34',family:4}]}})});
 const journal=new DiscoveryJournal(path.join(directory,'acquisition-budget'));
 const state=await runOpenWebResearch({directory:path.join(directory,'discovery'),targets:[current],maxActions,search:fail,read:fail,acquire:({target,candidate,maxBytes})=>acquirer({target,candidate:{url:candidate.url,acquisitionCandidate:priceResearchAcquisitionCandidate(target,candidate.url)},journal,maxBytes}),...(render?{render}:{} )});
 return {current:state.targets[0],wire,state,body,requestedUrl,finalUrl,market,runDirectory:path.join(directory,'runs',fs.readdirSync(path.join(directory,'runs'))[0])};
}

function assertRetainedSource(result){
 const {current,wire,body,requestedUrl,finalUrl,market,runDirectory}=result,outcome=current.acquisitionOutcomes[0],records=[...iterateMarketRunRecords(runDirectory+'/journal')],attempt=records.find(row=>row.type==='V2_ACQUISITION_RESULT').payload.result.attempts[0],retained=records.find(row=>row.type==='RESPONSE_CAPTURED'&&row.payload.url===finalUrl)?.payload;
 assert.equal(attempt.requestedUrl,requestedUrl);assert.equal(attempt.finalUrl,finalUrl);assert.equal(attempt.page.rawSource.text,body);assert.equal(attempt.page.sourceIntegrity.sha256,digest(body));
 assert.equal(retained?.bodyHash,digest(body));assert.equal(fs.readFileSync(path.join(runDirectory,retained.bodyFile),'utf8'),body);
 assert.equal(attempt.transportVerification.targetCountry,market);assert.equal(attempt.exitVerification.country,market);
 assert.equal(outcome.sourceClassification.status,'PROVIDER_SOURCE');assert.equal(outcome.sourceClassification.finalUrl,finalUrl);assert.equal(outcome.sourceClassification.sourceHash,digest(body));
 assert.equal(outcome.countryV3Evaluation.status,'EVALUATED');assert.equal(outcome.countryV3Evaluation.receiptStatus,'HASH_VERIFIED');assert.equal(outcome.countryV3Evaluation.geoClass,'G1');
 assert.equal(wire.filter(row=>row.url===requestedUrl).length,1);assert(wire.every(row=>row.country===market));
 return outcome;
}

test('one manual GLOBAL root source is acquired first and independently establishes US, GB and AU monthly plans',async t=>{
 const results=[];
 for(const [market,currency,base] of [['US','USD',11],['GB','GBP',12],['AU','AUD',13]]){
  const finalUrl=origin+`/${market.toLowerCase()}/plans`,result=await fixture(t,{market,finalUrl,body:staticBody(market,currency,base)}),outcome=assertRetainedSource(result),canonical=v3ResultFromTarget(result.current);
  assert.deepEqual(canonical.verified.map(row=>row.amount).sort((a,b)=>a-b),[base,base+5,base+10]);
  assert.equal(canonical.suggested.length,3);assert(canonical.suggested.every(row=>row.provenance==='V3_SOURCE_RESEARCH'));
  assert.equal(outcome.renderingRequired,false);assert.equal(result.current.demonstratedRendering,false);
  assert.equal(result.state.usage.searches,0);assert.equal(result.state.usage.reads,0);assert.equal(result.state.usage.acquisitions,1);
  assert.equal(result.current.researchLinkOutcomes[0].result,'VERIFIED');
  assert.equal(planResearch(result.current).route,'RETAINED_SUFFICIENT');
  results.push([outcome.sourceClassification.finalUrl,outcome.sourceClassification.sourceHash]);
 }
 assert.equal(new Set(results.map(row=>row[0])).size,3);assert.equal(new Set(results.map(row=>row[1])).size,3);
});

test('manual root, deep pricing and help article URLs all reach retained source and V3 before fallback',async t=>{
 for(const requestedUrl of [rootUrl,origin+'/pricing',origin+'/help/article']){
  const result=await fixture(t,{requestedUrl}),outcome=assertRetainedSource(result),canonical=v3ResultFromTarget(result.current);
  assert.equal(canonical.suggested.length,3);assert.equal(canonical.verified.length,3);assert.equal(outcome.renderingRequired,false);
  assert.equal(result.state.usage.searches+result.state.usage.reads,0);
 }
});

test('manual root with provider embedded plan state is interpreted without Browser',async t=>{
 const products=['Standard with ads','Standard','Premium'].map((name,index)=>({product:{id:`plan-${index}`,name,productType:'SUBSCRIPTION',consumer:true,subscription:{length:1,unit:'months'}},totalAmountWithTaxes:{amount:String((11+index*5)*100),currencyCode:'USD'}}));
 const body=`<html><head><title>Disney+ subscription plans</title></head><body><main><h1>Disney+ plans</h1></main><script>window.catalog=${JSON.stringify({currenciesSubunit:{USD:2},offeredProducts:{months:products}})};</script></body></html>`;
 const result=await fixture(t,{body}),outcome=assertRetainedSource(result),canonical=v3ResultFromTarget(result.current);
 assert.equal(canonical.suggested.length,3);assert.equal(canonical.verified.length,3);assert.equal(outcome.renderingRequired,false);
});

test('manual root with JSON-LD monthly offer is inspected as structured provider source',async t=>{
 const structured={'@context':'https://schema.org','@type':'SoftwareApplication',name:'Disney+',description:'Disney+ consumer streaming subscription',offers:['Standard with ads','Standard','Premium'].map((name,index)=>({'@type':'Offer',product:{id:`plan-${index}`,name,productType:'SUBSCRIPTION',consumer:true,subscription:{length:1,unit:'months'}},totalAmountWithTaxes:{amount:String((11+index*5)*100),currencyCode:'USD',scale:2}}))};
 const body=`<html><head><title>Disney+ subscription plans</title><script type="application/ld+json">${JSON.stringify(structured)}</script></head><body><main><h1>Disney+ plans</h1></main></body></html>`;
 const result=await fixture(t,{body}),outcome=assertRetainedSource(result),canonical=v3ResultFromTarget(result.current);
 assert.equal(canonical.suggested.length,3);assert.equal(canonical.verified.length,3);assert.equal(outcome.renderingRequired,false);
});

test('manual root app shell is inspected before Browser diagnosis, while ordinary no-price HTML permits bounded fallback',async t=>{
 const shell='<html><head><title>Disney+ plans</title></head><body><div id="app"></div><script src="/app.js"></script><script src="/pricing.js"></script></body></html>';
 const shellResult=await fixture(t,{body:shell}),shellOutcome=assertRetainedSource(shellResult);
 assert.equal(v3ResultFromTarget(shellResult.current).verified.length,0);assert.equal(shellOutcome.renderingRequired,true);assert.equal(shellResult.current.demonstratedRendering,true);
 const plainResult=await fixture(t,{body:'<html><head><title>Disney+ Help</title></head><body><main><p>Choose a plan to learn more.</p></main></body></html>'}),plainOutcome=assertRetainedSource(plainResult);
 assert.equal(v3ResultFromTarget(plainResult.current).verified.length,0);assert.equal(plainOutcome.renderingRequired,false);assert.equal(plainResult.current.researchLinkOutcomes[0].result,'PROVIDER_SOURCE_NO_VERIFIED');
 assert.notEqual(planResearch(plainResult.current)?.reason,'PRICE_RESEARCH_VERIFICATION_REQUIRED');
});

test('manual root survives irrelevant numeric robot group and checked same-origin robots redirect',async t=>{
 const result=await fixture(t,{robotsPolicy:'User-agent: 360spider\nDisallow: /\nUser-agent: *\nAllow: /',robotsRedirect:true}),outcome=assertRetainedSource(result),canonical=v3ResultFromTarget(result.current);
 assert.equal(canonical.suggested.length,3);assert.equal(canonical.verified.length,3);
 assert.equal(outcome.renderingRequired,false);
 assert.equal(result.wire.filter(row=>row.url===origin+'/robots.txt').length,1);
 assert.equal(result.wire.filter(row=>row.url===origin+'/policy/robots.txt').length,1);
});

test('manual root stays blocked when applicable robots policy disallows it',async t=>{
 const result=await fixture(t,{robotsPolicy:'User-agent: *\nDisallow: /'}),outcome=result.current.acquisitionOutcomes[0];
 assert.equal(outcome.classification,'POLICY_BLOCKED');assert.equal(v3ResultFromTarget(result.current).verified.length,0);
 assert.equal(result.wire.some(row=>row.url===rootUrl),false);
});

test('invalid G1 cannot establish a manual root source as canonical truth',async t=>{
 const result=await fixture(t,{geoCountry:'GB'});
 assert.equal(v3ResultFromTarget(result.current).verified.length,0);
 assert.notEqual(result.current.acquisitionOutcomes[0].countryV3Evaluation?.geoClass,'G1');
});

test('cross-provider redirect from a manual root remains outside Decodo source scope',async t=>{
 const result=await fixture(t,{finalUrl:'https://other-provider.example/pricing'});
 assert.equal(v3ResultFromTarget(result.current).verified.length,0);
 assert.notEqual(result.current.acquisitionOutcomes[0].sourceClassification?.status,'PROVIDER_SOURCE');
});
