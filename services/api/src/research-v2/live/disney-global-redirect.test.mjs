import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createDecodoProvider} from '../../../../../docs/catalog/global-47/research-v1/decodo-adapter.mjs';
import {iterateMarketRunRecords} from '../../research-v1/market-run-store.mjs';
import {digest} from '../../research-v3/model.mjs';
import {DiscoveryJournal} from './online-discovery.mjs';
import {createDiscoveryAcquirer} from './online-discovery-stage.mjs';
import {priceResearchAcquisitionCandidate} from './price-research-candidate.mjs';
import {planResearch} from './research-planner.mjs';
import {runLive} from './runner.mjs';

const requestedUrl='https://help.disneyplus.com/en-GB/article/disneyplus-en-no-price?redirect=true';
const link={id:'11111111-1111-4111-8111-111111111111',url:requestedUrl,kind:'DIRECT_SOURCE',marketScope:'GLOBAL',marketCode:null,enabled:true,truthAuthority:'NONE'};
const cases={US:{currency:'USD',amount:'11'},GB:{currency:'GBP',amount:'12'},AU:{currency:'AUD',amount:'13'}};
const runtime={SAVLIVO_DECODO_ENABLED:'true',SAVLIVO_DECODO_APPROVED:'true',SAVLIVO_DECODO_ROUTING_MODE:'COMMON_GATEWAY',SAVLIVO_DECODO_COST_CLASS:'PAID',SAVLIVO_DECODO_CURRENCY:'USD',SAVLIVO_GEO_VERIFIER_APPROVED:'true',SAVLIVO_DECODO_ESTIMATED_COST:'0.10',SAVLIVO_DECODO_RESERVED_COST:'0.20',SAVLIVO_DECODO_LIVE_TASK_CEILING:'0.20',SAVLIVO_DECODO_LIVE_MARKET_CEILING:'0.20',SAVLIVO_DECODO_LIVE_RUN_CEILING:'0.40',DECODO_USERNAME:'fixture-user',DECODO_PASSWORD:'fixture-password'};
const response=(body,type='text/html',status=200,headers={})=>({status,headers:{'content-type':type,...headers},body:Buffer.from(body),tlsVerified:true});
const target=market=>({id:'disney-plus-'+market,service:'disney-plus',serviceName:'Disney+',market,operationsObjective:'PRICE_RESEARCH',researchObjective:'SERVICE_COVERAGE',smartResearch:{version:2},providerSourceIdentityHosts:['help.disneyplus.com'],authorities:[],urls:[],researchLinks:[link],researchLinkOutcomes:[],capabilities:{direct:true,decodo:true,tavily:false,browser:false,groq:false},gaps:['plan','amount','currency','cadence','priceRole','ownership','market']});

test('one GLOBAL redirect=true Disney+ route retains independent US, GB and AU Decodo sources for V3',async t=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'disney-global-redirect-'));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
 const observed=[];
 for(const [market,{currency,amount}] of Object.entries(cases)){
  const current=target(market),finalUrl=`https://help.disneyplus.com/en-${market}/article/disneyplus-${market.toLowerCase()}-price`;
  const prices=[Number(amount),Number(amount)+5,Number(amount)+10];
  const body=`<!doctype html><html lang="en-${market}"><head><title>Plans and Pricing | Disney+ Help Center</title><meta name="description" content="Discover the different streaming plans Disney+ offers and how much Disney+ costs."></head><body><main><h1>Plans and Pricing</h1><p>Disney+ plans are billed monthly on the signup date. We do not offer annual membership plans.</p><h3>Pricing (${currency})</h3><ul>${['Standard with ads','Standard','Premium'].map((name,index)=>`<li><p><span>${name}: ${currency} ${prices[index]} / month</span></p></li>`).join('')}</ul></main></body></html>`;
  assert.deepEqual([planResearch(current).route,planResearch(current).url],['DECODO',requestedUrl]);
  const wire=[];
  const bundle=createDecodoProvider({env:runtime,resolveHost:async()=>[{address:'93.184.216.34',family:4}],requestHop:async r=>{
   const url=r.url.href;wire.push({url,country:r.targetCountry});
   let result;
   if(url==='https://help.disneyplus.com/robots.txt')result=response('','text/plain',301,{location:'/csp/robots.txt'});
   else if(url==='https://help.disneyplus.com/csp/robots.txt'||url==='https://ipwho.is/robots.txt')result=response('User-agent: *\nAllow: /','text/plain');
   else if(url==='https://ipwho.is/?fields=success,ip,country_code')result=response(JSON.stringify({success:true,ip:'93.184.216.34',country_code:r.targetCountry}),'application/json');
   else if(url===requestedUrl)result=response('','text/html',302,{location:finalUrl});
   else if(url===finalUrl)result=response(body);
   else assert.fail(`Unexpected Decodo request: ${url}`);
   r.onBytes?.(result.body.length);return result;
  }});
  const root=path.join(directory,market),journal=new DiscoveryJournal(path.join(root,'discovery'));
  const acquirer=createDiscoveryAcquirer({runtime,bundle,root:path.join(root,'runs'),runLive:args=>runLive({...args,clock:()=>new Date('2026-10-16T12:00:00.000Z').toISOString(),dependencies:{...args.dependencies,resolveHost:async()=>[{address:'93.184.216.34',family:4}]}})});
  const result=await acquirer({target:current,candidate:{url:requestedUrl,acquisitionCandidate:priceResearchAcquisitionCandidate(current,requestedUrl)},journal});
  const records=[...iterateMarketRunRecords(result.runDirectory+'/journal')],attempt=records.find(row=>row.type==='V2_ACQUISITION_RESULT').payload.result.attempts[0];
  const retained=records.find(row=>row.type==='RESPONSE_CAPTURED'&&row.payload.url===finalUrl)?.payload;
  assert.equal(attempt.requestedUrl,requestedUrl);assert.equal(attempt.finalUrl,finalUrl);assert.deepEqual(attempt.redirects,[finalUrl]);
  assert.equal(attempt.page.rawSource.text,body);assert.equal(attempt.page.sourceIntegrity.sha256,digest(body));
  assert.equal(retained?.bodyHash,digest(body));assert.equal(fs.readFileSync(path.join(result.runDirectory,retained.bodyFile),'utf8'),body);
  assert.equal(attempt.transportVerification.level,'BRACKET_VERIFIED');assert.equal(attempt.transportVerification.targetCountry,market);
  assert.equal(attempt.exitVerification.country,market);assert(attempt.receipts.some(row=>row.url===finalUrl&&row.bodySha256===digest(body)));assert.equal(result.sourceClassification.status,'PROVIDER_SOURCE');
  assert.equal(result.sourceClassification.requestedUrl,requestedUrl);assert.equal(result.sourceClassification.finalUrl,finalUrl);assert.equal(result.sourceClassification.sourceHash,digest(body));
  assert.equal(result.countryV3Evaluation.status,'EVALUATED');assert.equal(result.countryV3Evaluation.receiptStatus,'HASH_VERIFIED');assert.equal(result.countryV3Evaluation.geoClass,'G1');
  assert.equal(result.v3Observation.url,finalUrl);assert.equal(result.v3Observation.sha256,digest(body));
  assert.deepEqual(result.v3Truth.offers.filter(offer=>offer.propositions.PRICE_AMOUNT?.state==='ESTABLISHED').map(offer=>[offer.propositions.PRICE_AMOUNT.value,offer.propositions.CURRENCY.value,offer.propositions.TARGET_MARKET.value]),prices.map(price=>[price,currency,market]),JSON.stringify({observation:result.v3Observation,truth:result.v3Truth}));
  assert(wire.every(row=>row.country===market));assert(wire.some(row=>row.url==='https://help.disneyplus.com/csp/robots.txt'));assert.equal(wire.filter(row=>row.url===requestedUrl).length,1);assert.equal(wire.filter(row=>row.url===finalUrl).length,1);
  observed.push([market,finalUrl,digest(body)]);
 }
 assert.equal(new Set(observed.map(row=>row[1])).size,3);assert.equal(new Set(observed.map(row=>row[2])).size,3);
});
