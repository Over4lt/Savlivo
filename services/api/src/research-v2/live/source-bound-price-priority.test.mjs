import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {sourceBoundPriceRoutingBonus,sourceBoundPriceDecodoContinuation} from './source-bound-price-priority.mjs';
import {OpenWebResearch,rankPlannerLeads,runOpenWebResearch} from './open-web-discovery.mjs';
import {planResearch} from './research-planner.mjs';
import {executableAction} from './execution-capabilities.mjs';
import {createTavilyDiscovery} from './tavily-discovery.mjs';
import {priceResearchAcquisitionCandidate} from './price-research-candidate.mjs';
import {DiscoveryJournal} from './online-discovery.mjs';
import {digest} from '../../research-v3/model.mjs';
import {evaluateCountryProviderTruth} from './provider-source-v3.mjs';
import {projectEstablishedV3Offerings} from '../inventory/v3-result-projection.mjs';
import {openMarketRunStore} from '../../research-v1/market-run-store.mjs';

// Frozen routing metadata from job 31c8a14f. These hashes bind the retained
// country pages; article URLs and labels are hints, not acquired price bodies.
const retained={
 IE:{hash:'b99c26961b4be759d2a4b35a27ca071c620b8a7611a72be6e4eeb3cfb40c1af7',observation:'country-v3-b99c26961b4be759d2a4b35a',change:'https://help.hbomax.com/ie/Answer/Detail/000002528',plans:'https://help.hbomax.com/ie/Answer/Detail/000002547'},
 NZ:{hash:'25ef2edef2f454e33e97747cbc3733dab29ff91f0ec46658f58e868249d72e74',observation:'country-v3-25ef2edef2f454e33e97747c',change:'https://help.hbomax.com/nz/Answer/Detail/000002528',plans:'https://help.hbomax.com/nz/Answer/Detail/000002547'}
};
const hint={id:'44444444-4444-4444-8444-444444444444',serviceId:'max',url:'https://help.hbomax.com/us/Answer/Detail/000002547?pubDate=20260926',marketScope:'MARKET_SPECIFIC',marketCode:'US',enabled:true,truthAuthority:'NONE',lastResult:'VERIFIED'};
function fixture(market){
 const row=retained[market],source={bodySha256:row.hash,observation:row.observation,start:100,end:200,sha256:'a'.repeat(64)},from={url:`https://help.hbomax.com/${market.toLowerCase()}/Home/Index`,bodyHash:row.hash,observation:row.observation,mechanism:'V3_SOURCE_BOUND_CONTINUATION',locator:{observation:row.observation,bodySha256:row.hash,start:source.start,end:source.end,sha256:source.sha256}};
 const lead=(url,title)=>({url,title,sourceBoundCandidate:true,from,source,originKind:'CHILD',evidenceStatus:'DISCOVERY_LEAD_ONLY',authoritative:false,truthAuthority:'NONE'});
 return {id:`price-research:max:${market}`,service:'max',serviceName:'Max',market,operationsObjective:'PRICE_RESEARCH',researchObjective:'SERVICE_COVERAGE',smartResearch:{version:2},providerSourceIdentityHosts:['www.max.com'],leads:[lead(row.change,'Change an HBO Max-billed subscription'),lead(row.plans,'All about HBO Max plans')],sourceBoundContinuationParents:[{id:row.observation,url:from.url,sha256:row.hash,accepted:true,context:{transport:'DECODO',networkGeography:market}}],acquisitionOutcomes:[{url:from.url,sourceClassification:{status:'PROVIDER_SOURCE',finalUrl:from.url,sourceHash:row.hash},countryV3Evaluation:{status:'EVALUATED',receiptStatus:'HASH_VERIFIED',geoClass:'G1'}}],successfulResearchLinkHints:[hint],authorities:[],reads:[],queries:[],decisions:[],verified:[],blockedOrigins:[],gaps:['amount'],capabilities:{direct:true,decodo:true,tavily:false,browser:false}};
}

for(const market of ['IE','NZ'])test(`${market}: retained provider plans article outranks subscription-management article`,()=>{
 const target=fixture(market),[change,plans]=target.leads;
 assert.equal(sourceBoundPriceRoutingBonus(target,change),0);
 assert.equal(sourceBoundPriceRoutingBonus(target,plans),-30);
 rankPlannerLeads(target);
 assert(plans.navigationPriority<change.navigationPriority);
 const decision=planResearch(target,{unreadUrls:target.leads.map(row=>row.url)});
 assert.equal(decision.url,plans.url,JSON.stringify({route:decision.route,reason:decision.reason,candidates:decision.candidates?.map(row=>({url:row.url,value:row.value})),authorityCandidates:decision.authorityCandidates?.map(row=>({url:row.url,tier:row.authorityRelevanceTier,branch:row.branchPreference}))}));
 assert.equal(target.leads.length,2,'no URL is generated or persisted');
});

test('provider-authored pricing title still ranks ahead of management without a sibling hint',()=>{
 const target=fixture('IE');target.successfulResearchLinkHints=[];
 assert.equal(sourceBoundPriceRoutingBonus(target,target.leads[1]),-10);
 assert.equal(sourceBoundPriceRoutingBonus(target,target.leads[0]),0);
});

test('missing or conflicting G1 evidence, cross-service hint and wrong-market paths cannot earn priority',()=>{
 const target=fixture('IE'),plan=target.leads[1];
 for(const change of [
  value=>{value.sourceBoundContinuationParents=[];},
  value=>{value.sourceBoundContinuationParents[0].context.networkGeography='NZ';},
  value=>{value.acquisitionOutcomes[0].countryV3Evaluation.receiptStatus='UNRESOLVED';},
  value=>{value.acquisitionOutcomes[0].sourceClassification.sourceHash='b'.repeat(64);},
  value=>{value.leads[1].sourceBoundCandidate=false;},
  value=>{value.leads[1].source.bodySha256='c'.repeat(64);}
 ]){const value=structuredClone(target);change(value);assert.equal(sourceBoundPriceRoutingBonus(value,value.leads[1]),0);}
 const other=structuredClone(target);other.successfulResearchLinkHints[0].serviceId='netflix';assert.equal(sourceBoundPriceRoutingBonus(other,other.leads[1]),-10);
 const wrong=structuredClone(target);wrong.leads[1].url=wrong.leads[1].url.replace('/ie/','/nz/');assert.equal(sourceBoundPriceRoutingBonus(wrong,wrong.leads[1]),0);
 const foreign=structuredClone(target);foreign.leads[1].url='https://other.example/ie/Answer/Detail/000002547';assert.equal(sourceBoundPriceRoutingBonus(foreign,foreign.leads[1]),0);
 const management=structuredClone(target);management.leads[1].title='Change annual plans';assert.equal(sourceBoundPriceRoutingBonus(management,management.leads[1]),0);
 assert.equal(sourceBoundPriceRoutingBonus(target,{...plan,title:'All about HBO Max plans'}),-30);
});

test('no documented AT pricing article remains no candidate',()=>{
 const at={...fixture('IE'),market:'AT',leads:[],sourceBoundContinuationParents:[],acquisitionOutcomes:[]};
 assert.equal(sourceBoundPriceRoutingBonus(at,{url:'https://help.hbomax.com/at-de',title:'Help'}),0);
 assert.deepEqual(at.leads,[]);
});

const directArticle=(target,lead,hash='d'.repeat(64))=>{target.reads.push({requestedUrl:lead.url,url:lead.url,outcome:'OK',httpStatus:200,truncated:false,bodyHash:hash,sourceIntegrity:{sha256:hash},sourceClassification:{status:'PROVIDER_SOURCE',sourceHash:hash}});return target;};

test('complete Direct price article continues to its own bounded IE Decodo acquisition before generic pages',async t=>{
 const target=fixture('IE'),article=target.leads[1],directHash='d'.repeat(64);
 directArticle(target,article,directHash);
 target.leads.push({url:'https://help.hbomax.com/ie/terms',title:'Terms of use'});
 target.decisions.push({url:'https://help.hbomax.com/',route:'DECODO',acquisitionReserved:true});
 const proof=sourceBoundPriceDecodoContinuation(target,article),plan=planResearch(target);
 assert.deepEqual(proof,{url:article.url,parentObservation:retained.IE.observation,parentHash:retained.IE.hash,directSourceHash:directHash});
 assert.deepEqual([plan.route,plan.reason,plan.url],['DECODO','SOURCE_BOUND_PRICE_DECODO_CONTINUATION',article.url]);
 assert.equal(executableAction(target,plan).executable,true);
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'source-bound-price-decodo-'));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
 const session=new OpenWebResearch(directory,[target]);Object.assign(session.target(target.id),{reads:target.reads,decisions:target.decisions,acquisitionOutcomes:target.acquisitionOutcomes});session.state.usage.acquisitions=1;session.save();
 const calls=[];const result=await runOpenWebResearch({directory,targets:[target],maxActions:1,read:async()=>assert.fail('no extra Direct'),search:async()=>assert.fail('no discovery'),acquire:async({target:selected,candidate,route,reason})=>{
  calls.push({market:selected.market,url:candidate.url,route,reason});
  return {classification:'COMMERCIAL_FIELDS_INSUFFICIENT',verified:[],sourceClassification:{status:'PROVIDER_SOURCE',sourceHash:'e'.repeat(64)},countryV3Evaluation:{status:'EVALUATED',sourceHash:'e'.repeat(64),receiptStatus:'HASH_VERIFIED',geoClass:'G1'},acquisitionBytes:100};
 }});
 assert.deepEqual(calls,[{market:'IE',url:article.url,route:'DECODO',reason:'SOURCE_BOUND_PRICE_DECODO_CONTINUATION'}]);
 assert.equal(result.usage.acquisitions,2);
 assert.deepEqual(result.targets[0].acquisitionOutcomes.at(-1).sourceBoundPriceContinuation,proof);
 assert.equal(result.targets[0].acquisitionOutcomes.at(-1).sourceHash,null,'parent hash is never assigned to the new article');
 assert.equal(executableAction(result.targets[0],plan).reason,'EQUIVALENT_RESOURCE_ALREADY_ATTEMPTED');
});

test('price continuation fails closed without matching provenance, official Direct source or remaining acquisition budget',()=>{
 const target=directArticle(fixture('IE'),fixture('IE').leads[1]);
 const article=target.leads[1],action={route:'DECODO',url:article.url,reason:'SOURCE_BOUND_PRICE_DECODO_CONTINUATION'};
 assert.equal(executableAction(target,action).executable,true);
 for(const change of [
  value=>{value.sourceBoundContinuationParents=[];},
  value=>{value.acquisitionOutcomes[0].countryV3Evaluation.receiptStatus='UNRESOLVED';},
  value=>{value.leads[1].url='https://other.example/ie/Answer/Detail/000002547';},
  value=>{value.leads[1].url='https://help.hbomax.com/nz/Answer/Detail/000002547';},
  value=>{value.reads[0].sourceIntegrity.sha256='0'.repeat(64);},
  value=>{value.reads[0].sourceClassification.status='UNKNOWN_SOURCE';},
  value=>{value.reads[0].httpStatus=403;}
 ]){const value=structuredClone(target);change(value);assert.equal(executableAction(value,action).executable,false);}
 const blocked=structuredClone(target);blocked.blockedOrigins.push('https://help.hbomax.com');assert.equal(executableAction(blocked,action).reason,'PROVIDER_ACCESS_POLICY_STOP');
 const spent=structuredClone(target);spent.decisions.push({url:'https://help.hbomax.com/',route:'DECODO',acquisitionReserved:true},{url:'https://help.hbomax.com/ie/other',route:'DECODO',acquisitionReserved:true});assert.equal(executableAction(spent,action).reason,'DECODO_BUDGET_EXHAUSTED');
 const unrelated=structuredClone(target);unrelated.service='other';unrelated.serviceName='Other';unrelated.successfulResearchLinkHints=[];assert.equal(sourceBoundPriceDecodoContinuation(unrelated,unrelated.leads[1])?.url,article.url,'routing remains generic for a correctly bound provider source');
});

const reservedContinuation=()=>{
 const target=fixture('IE'),article=target.leads[1];directArticle(target,article);
 const proof=sourceBoundPriceDecodoContinuation(target,article);
 target.decisions.push({url:article.url,route:'DECODO',routingReason:'SOURCE_BOUND_PRICE_DECODO_CONTINUATION',acquisitionReserved:true,sourceBoundPriceContinuation:proof});
 return {target,article,proof,candidate:{url:article.url,authority:priceResearchAcquisitionCandidate(target,article.url)}};
};

test('routing dispatch reaches the actual bounded Decodo adapter for a source-bound price article',async t=>{
 const {target,article}=reservedContinuation();target.decisions=[{url:'https://help.hbomax.com/',route:'DECODO',acquisitionReserved:true}];
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'source-bound-adapter-'));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
 const session=new OpenWebResearch(directory+'/controller',[target]);Object.assign(session.target(target.id),{reads:target.reads,decisions:target.decisions,acquisitionOutcomes:target.acquisitionOutcomes,sourceBoundContinuationParents:target.sourceBoundContinuationParents,providerSourceIdentityHosts:target.providerSourceIdentityHosts});session.state.usage.acquisitions=1;session.save();
 let children=0;const adapter=(await createTavilyDiscovery({inventory:[target],searchEnabled:false})).bind({dir:directory,runtime:{},bundle:{transport:{},verifier:{url:'https://exit.example/check'}},runLive:async args=>{
  children++;assert.equal(args.maxRetries,0);assert.equal(args.onlineDiscovery,false);
  assert.deepEqual(args.inventory[0].urls,[article.url]);
  assert.equal(args.inventory[0].onlineDiscoveryProof.url,article.url,'the article, never the parent, is acquired');
  throw Error('SIMULATED_CHILD_STOP');
 }});
 const state=await runOpenWebResearch({directory:directory+'/controller',targets:[target],maxActions:1,read:async()=>assert.fail('Direct article is already retained'),search:async()=>assert.fail('no search'),acquire:adapter.acquire});
 assert.equal(children,1,'the real adapter reaches the bounded child transport');
 assert.equal(state.targets[0].acquisitionOutcomes.at(-1).blockers[0],'SIMULATED_CHILD_STOP');
 assert.equal(state.targets[0].verified.length,0,'a parent G1 receipt never promotes the article');
 const journal=fs.readFileSync(path.join(directory,'open-web-discovery/acquisition-budget/discovery-journal.jsonl'),'utf8');
 assert.match(journal,/PRICE_RESEARCH_DECODO_ADMITTED/);
});

test('simulated article acquisition needs its own IE G1 receipt before unchanged V3 establishes four plans',async t=>{
 const {target,article}=reservedContinuation();target.decisions=[{url:'https://help.hbomax.com/',route:'DECODO',acquisitionReserved:true}];
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'source-bound-article-v3-'));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
 const session=new OpenWebResearch(directory+'/controller',[target]);Object.assign(session.target(target.id),{reads:target.reads,decisions:target.decisions,acquisitionOutcomes:target.acquisitionOutcomes,sourceBoundContinuationParents:target.sourceBoundContinuationParents,providerSourceIdentityHosts:target.providerSourceIdentityHosts});session.state.usage.acquisitions=1;session.save();
 // The article and G1 receipt here are synthetic. They cannot represent the
 // retained production body or confer Verified status outside this test.
 const item=(name,price)=>`<li class="listitem"><p><a class="link">${name}</a> - €${price}/month</p></li>`;
 const body=`<html lang="en"><head><title>HBO Max | All about HBO Max plans</title></head><body><script>HHURL.config.selectedCountry = "IE";</script><span>Ireland</span><h1>All about HBO Max plans</h1><section><p>You can subscribe to HBO Max through many providers.</p><p>Plan pricing varies by country.</p><p>Here are the HBO Max plans:</p><div class="itemizedlist"><ul class="itemizedlist">${item('Basic with Ads','5.99')}${item('Standard with Ads','6.99')}${item('Standard','10.99')}${item('Premium','15.99')}</ul></div><p>HBO Max Standard with Ads Upgrade for €1/month.</p><p>Annual plan €99.99/year.</p></section></body></html>`;
 const hash=digest(body),id='simulated-ie-article',receipt=(url,bodySha256)=>({url,bodySha256,bindingRef:id,bindingChanged:false,destinationMode:'PINNED_CONNECT',continuityRef:'same-session'});
 const geo={classification:'G1',reasons:[],targetCountry:'IE',geoCountry:'IE',bodyHash:hash,sourceUrl:article.url,attemptId:id,transport:{providerId:'decodo',method:'APPROVED_PROXY',mode:'SESSION',bindingRef:id},receiptIndexes:{before:0,response:1,after:2},geoProofHashes:{before:'1'.repeat(64),after:'2'.repeat(64)}};
 const sourceCheck={hash,status:'HASH_VERIFIED',receipt:{intact:true,bodyHash:hash,service:'max',serviceEstablished:true,bindingEstablished:true,sourceUrl:article.url,geo}};
 const page={url:article.url,requestedUrl:article.url,outcome:'OK',httpStatus:200,contentType:'text/html',targetCountry:'IE',sourceIntegrity:{sha256:hash},rawSource:{text:body},accessDecisions:[{decision:'ALLOWED'}],authority:{status:'CONFIGURED_REVIEWED',hostname:'help.hbomax.com',provider:'Max',sourceType:'OFFICIAL_PROVIDER',sourceUrl:article.url,checkedAt:'2026-10-19T00:00:00.000Z'}};
 const attempt={id,providerId:'decodo',method:'APPROVED_PROXY',mode:'SESSION',targetCountry:'IE',bindingRef:id,sessionRef:id+'-session',requestedUrl:article.url,finalUrl:article.url,outcome:'OBSERVED',cleanup:'RELEASED',receipts:[receipt('https://exit.example/before','1'.repeat(64)),receipt(article.url,hash),receipt('https://exit.example/after','2'.repeat(64))],transportVerification:{version:2,level:'BRACKET_VERIFIED',providerId:'decodo',bindingRef:id,targetCountry:'IE',before:{status:'MATCH',country:'IE'},after:{status:'MATCH',country:'IE'},target:{finalUrl:article.url,outcome:'OK'},equality:true,continuity:'NO_OBSERVED_CHANGE',conflicts:[]},page};
 let children=0;const adapter=(await createTavilyDiscovery({inventory:[target],searchEnabled:false})).bind({dir:directory,runtime:{},bundle:{transport:{},verifier:{url:'https://exit.example/check'}},runLive:async args=>{
  children++;assert.deepEqual(args.inventory[0].urls,[article.url]);
  const child=path.join(directory,'simulated-child');fs.mkdirSync(child);const store=openMarketRunStore(path.join(child,'journal'));
  store.append('V2_ACQUISITION_RESULT',{target:{id:target.id},result:{outcome:'OBSERVED',attempts:[attempt]}});store.close();return {directory:child};
 },dependencies:{interpret:async()=>{},verifyRetainedRun:async()=>({usable:true,monetaryFacts:4,verified:[],sourceChecks:[sourceCheck],priceEvidenceNeedsByTarget:{}}),evaluateVerifiedCountryRun:({target:current})=>evaluateCountryProviderTruth({target:current,sourceCheck,attempt})}});
 const state=await runOpenWebResearch({directory:directory+'/controller',targets:[target],maxActions:1,read:async()=>assert.fail('Direct already retained'),search:async()=>assert.fail('no search'),acquire:adapter.acquire});
 const result=state.targets[0],established=projectEstablishedV3Offerings(result);
 assert.equal(children,1);assert.deepEqual(established.map(row=>[row.name,row.ordinaryRecurringPrice.amount,row.ordinaryRecurringPrice.currency]),[['Basic with Ads',5.99,'EUR'],['Standard with Ads',6.99,'EUR'],['Standard',10.99,'EUR'],['Premium',15.99,'EUR']]);
 assert.equal(result.v3Observation.sha256,hash,'the article gets its own hash and G1');
 assert.notEqual(hash,retained.IE.hash,'the parent receipt cannot bind the article');
 const missing=structuredClone(sourceCheck);missing.receipt.intact=false;assert.throws(()=>evaluateCountryProviderTruth({target,sourceCheck:missing,attempt}),/COUNTRY_PROVIDER_RECEIPT_INVALID/);
});

test('the adapter rejects ungrounded or changed continuations before any Decodo child',async t=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'source-bound-adapter-negative-'));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
 let children=0;const adapter=(await createTavilyDiscovery({inventory:[fixture('IE')],searchEnabled:false})).bind({dir:directory,runtime:{},bundle:{transport:{},verifier:{url:'https://exit.example/check'}},runLive:async()=>{children++;throw Error('UNEXPECTED_CHILD');}});
 const scenarios=[
  value=>{value.target.sourceBoundContinuationParents=[];},
  value=>{value.target.acquisitionOutcomes[0].countryV3Evaluation.receiptStatus='UNRESOLVED';},
  value=>{value.target.sourceBoundContinuationParents[0].sha256='0'.repeat(64);},
  value=>{value.target.sourceBoundContinuationParents[0].url='https://help.hbomax.com/de/Home/Index';},
  value=>{value.target.acquisitionOutcomes[0].sourceClassification.finalUrl='https://help.hbomax.com/de/Home/Index';},
  value=>{value.target.leads[1].source.sha256='0'.repeat(64);},
  value=>{value.target.service='netflix';value.target.serviceName='Netflix';},
  value=>{value.target.market='NZ';},
  value=>{value.target.providerSourceIdentityHosts=[];},
  value=>{value.target.reads[0].sourceIntegrity.sha256='0'.repeat(64);},
  value=>{value.target.decisions[0].sourceBoundPriceContinuation.directSourceHash='0'.repeat(64);},
  value=>{value.target.decisions[0].sourceBoundPriceContinuation=null;},
  value=>{value.target.decisions.push(structuredClone(value.target.decisions[0]));},
  value=>{value.target.decisions.push({url:'https://help.hbomax.com/ie/other',route:'DECODO',acquisitionReserved:true},{url:'https://help.hbomax.com/ie/other2',route:'DECODO',acquisitionReserved:true});},
  value=>{value.target.acquisitionOutcomes.push({url:value.article.url});},
  value=>{value.target.blockedOrigins.push('https://help.hbomax.com');},
  value=>{value.candidate.authority=null;},
  value=>{value.candidate.url='https://other.example/ie/Answer/Detail/000002547';}
 ];
 for(const change of scenarios){const value=reservedContinuation();change(value);await assert.rejects(adapter.acquire({target:value.target,candidate:value.candidate,route:'DECODO',reason:'SOURCE_BOUND_PRICE_DECODO_CONTINUATION'}),/SOURCE_BOUND_PRICE_CONTINUATION_REQUIRED/);}
 await assert.rejects(adapter.acquire({target:reservedContinuation().target,candidate:reservedContinuation().candidate,route:'DECODO',reason:'UNFOUNDED_DECODO'}),/DISCOVERY_ACQUISITION_FAILURE_PROOF_REQUIRED/);
 assert.equal(children,0);
});

test('adapter page budget stops a fully documented continuation before transport',async t=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'source-bound-adapter-budget-'));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
 const {target,candidate}=reservedContinuation(),journal=new DiscoveryJournal(path.join(directory,'open-web-discovery/acquisition-budget'));
 for(let i=0;i<3;i++)journal.reserve(target.id,'pages');
 let children=0;const adapter=(await createTavilyDiscovery({inventory:[target],searchEnabled:false})).bind({dir:directory,runtime:{},bundle:{transport:{},verifier:{url:'https://exit.example/check'}},runLive:async()=>{children++;throw Error('UNEXPECTED_CHILD');}});
 const result=await adapter.acquire({target,candidate,route:'DECODO',reason:'SOURCE_BOUND_PRICE_DECODO_CONTINUATION'});
 assert.equal(result.classification,'BUDGET_STOP');assert.equal(children,0);
});
