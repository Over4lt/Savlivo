import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {digest} from '../../research-v3/model.mjs';
import {priceResearchAcquisitionCandidate} from './price-research-candidate.mjs';
import {classifyAcquiredSource,recordSuggestedSourceLifecycle} from './source-classification.mjs';
import {destinationInformation,priceResearchDecodoVerification} from './information-routing.mjs';
import {executableAction} from './execution-capabilities.mjs';
import {planResearch} from './research-planner.mjs';
import {runOpenWebResearch,rehydrateRetainedProviderAuthority} from './open-web-discovery.mjs';
import {validateDirectProviderPage,evaluateDirectProviderTruth} from './direct-provider-evidence.mjs';
import {hasProviderRoutingAuthority} from './provider-routing-authority.mjs';
import {createDiscoveryAcquirer} from './online-discovery-stage.mjs';
import {writeRoutingOnlySourceProof,requireRoutingOnlySourceProof} from './routing-only-source-proof.mjs';
import {openMarketRunStore} from '../../research-v1/market-run-store.mjs';
import {v3ResultFromTarget} from '../../google-ai/admin-live-pipeline.mjs';

const url='https://www.streamco.example/no/';
const body=`<html><script type="application/ld+json">${JSON.stringify({'@type':'Organization',name:'StreamCo',url:'https://www.streamco.example/'})}</script><main><h1>StreamCo subscriptions</h1><p>Basic NOK 99 per month, billed monthly.</p></main></html>`;
const target=(extra={})=>({id:'streamco-NO',service:'streamco',serviceName:'StreamCo',market:'NO',operationsObjective:'PRICE_RESEARCH',researchObjective:'SERVICE_COVERAGE',smartResearch:{version:2},urls:[url],leads:[{url,title:'StreamCo pricing',origin:'GOOGLE_AI_V4',originSuggestedIds:['v4:basic'],truthAuthority:'NONE',authoritative:false}],researchCandidateLineage:[{originSuggestedId:'v4:basic',sourceUrl:url,truthAuthority:'NONE',currentSourceWarning:'OFFICIAL_SOURCE_NOT_ACQUIRED'}],authorities:[],gaps:['amount'],reads:[],queries:[],decisions:[],verified:[],blockedOrigins:[],capabilities:{direct:true,tavily:false,decodo:true,browser:false},...extra});
const page=(value=body,finalUrl=url,requestedUrl=url)=>({url:finalUrl,requestedUrl,outcome:'OK',httpStatus:200,contentType:'text/html',truncated:false,bodyHash:digest(value),sourceIntegrity:{sha256:digest(value)},rawSource:{text:value},accessDecisions:[{decision:'ALLOWED'}]});
const classify=(value=body,finalUrl=url,requestedUrl=url)=>classifyAcquiredSource({target:target(),page:page(value,finalUrl,requestedUrl),body:value,observationId:'candidate-source-1'});
const temp=t=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'price-source-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));return dir;};

test('A/B/C/M/S/T: Suggested URL is bounded routing input, not authority, and plans Direct without an authority loop',()=>{
 const t=target();assert.equal(priceResearchAcquisitionCandidate(t,url).truthAuthority,'NONE');assert.equal(destinationInformation(t,url).eligible,true);
 assert.equal(hasProviderRoutingAuthority(t),false);assert.equal(executableAction(t,{route:'DIRECT',url}).executable,true);
 assert.equal(executableAction(t,{route:'DECODO',url,reason:'PRICE_RESEARCH_VERIFICATION_REQUIRED'}).executable,true);
 assert.deepEqual([planResearch(t).route,planResearch(t).reason],['DIRECT','PRICE_RESEARCH_SOURCE_CANDIDATE']);
 assert.equal(priceResearchDecodoVerification(t).status,'PENDING');assert.equal(t.researchCandidateLineage[0].truthAuthority,'NONE');
 assert.equal(priceResearchDecodoVerification(target({decodoVerification:{status:'UNAVAILABLE',url,reason:'PROVIDER_AUTHORITY_REJECTED'}})).status,'PENDING');
});

test('A: Suggested source URL survives when absent from urls and leads',async context=>{
 const x=target({urls:[],leads:[],capabilities:{direct:true,tavily:false,decodo:false,browser:false}});assert.equal(priceResearchAcquisitionCandidate(x,url)?.origin,'V4_SUGGESTED_SOURCE');
 const state=await runOpenWebResearch({directory:temp(context),targets:[x],search:async()=>{throw Error('UNEXPECTED_SEARCH');},read:async()=>page(),maxActions:1});
 assert.equal(state.targets[0].reads[0].requestedUrl,url);assert.equal(state.targets[0].leads.some(row=>row.url===url),true);
});

test('O: a market gap does not make a Suggested source URL ineligible or assert market truth',()=>{
 const t=target({marketProof:{version:1,objectives:[{key:'basic',status:'MARKET_NOT_VERIFIED',identity:{plan:'Basic'}}],sources:[],leads:[]}}),destination=destinationInformation(t,url);
 assert.equal(destination.eligible,true);assert.equal(destination.marketApplicabilityEstablished,false);assert.equal(planResearch(t).route,'DIRECT');
});

test('B/C: unsafe, irrelevant and blocked destinations cannot pass acquisition admission',()=>{
 const t=target();for(const candidate of ['http://localhost/pricing','https://127.0.0.1/pricing','file:///tmp/pricing','https://user:pass@streamco.example/no/'])assert.equal(priceResearchAcquisitionCandidate(t,candidate),null);
 assert.equal(executableAction(t,{route:'DIRECT',url:'http://localhost/pricing'}).reason,'INVALID_URL');
 assert.equal(executableAction(t,{route:'DECODO',url:'https://127.0.0.1/pricing',reason:'PRICE_RESEARCH_VERIFICATION_REQUIRED'}).reason,'INVALID_URL');
 assert.equal(priceResearchAcquisitionCandidate(t,'https://publisher.example/streamco'),null);
 assert.equal(executableAction(target({blockedOrigins:['https://www.streamco.example']}),{route:'DECODO',url,reason:'PRICE_RESEARCH_VERIFICATION_REQUIRED'}).reason,'PROVIDER_ACCESS_POLICY_STOP');
});

test('D/F/H/I/J/L: acquired body alone establishes provider classification; third party, unknown, spoof and redirect do not',()=>{
 const provider=classify();assert.equal(provider.status,'PROVIDER_SOURCE');assert.equal(provider.sourceHash,digest(body));assert.equal(provider.binding.host,'www.streamco.example');
 const help='https://help.streamco.example/pricing',helpBody=`<html><script type="application/ld+json">${JSON.stringify({'@type':'Organization',name:'StreamCo',url:'https://help.streamco.example/'})}</script><h1>StreamCo support pricing</h1></html>`;
 assert.equal(classify(helpBody,help,help).status,'PROVIDER_SOURCE');
 const third='https://best-streaming-blog.example/streamco-prices',article='<html><head><title>Best Streaming Blog</title></head><body><h1>StreamCo prices</h1><p>We publish an independent review; not affiliated with StreamCo.</p></body></html>';
 assert.equal(classify(article,third,third).status,'THIRD_PARTY_SOURCE');
 assert.equal(classify('<html><h1>StreamCo mentioned here</h1></html>').status,'UNKNOWN_SOURCE');
 assert.equal(classify('<html><h1>StreamCo</h1><footer>Not affiliated with StreamCo</footer></html>','https://streamco-prices.example/','https://streamco-prices.example/').status,'THIRD_PARTY_SOURCE');
 assert.equal(classify(body.replace('</html>','<footer>Not affiliated with StreamCo</footer></html>')).status,'THIRD_PARTY_SOURCE');
 assert.notEqual(classify(body,'https://publisher.example/article',url).status,'PROVIDER_SOURCE');
 const altered=page();altered.sourceIntegrity.sha256='0'.repeat(64);assert.equal(classifyAcquiredSource({target:target(),page:altered,body,observationId:'altered'}).status,'UNKNOWN_SOURCE');
});

test('P: current acquisition warning changes only for retained and classified source; Suggested truth stays NONE',()=>{
 const t=target();recordSuggestedSourceLifecycle(t,{status:'UNKNOWN_SOURCE',reason:'NO_ACCEPTED_PROVIDER_PROOF',requestedUrl:url,finalUrl:url,sourceHash:digest(body),observationId:'one'});
 assert.equal(t.researchCandidateLineage[0].currentSourceWarning,'SOURCE_IDENTITY_UNRESOLVED');
 recordSuggestedSourceLifecycle(t,classify());assert.equal(t.researchCandidateLineage[0].currentSourceWarning,null);
 assert.equal(t.researchCandidateLineage[0].sourceAcquisition.status,'PROVIDER_SOURCE');assert.equal(t.researchCandidateLineage[0].truthAuthority,'NONE');
 recordSuggestedSourceLifecycle(t,{status:'UNKNOWN_SOURCE',reason:'LATER_UNRESOLVED',requestedUrl:url,finalUrl:url,sourceHash:null,observationId:'retry'});
 assert.equal(t.researchCandidateLineage[0].sourceAcquisition.status,'PROVIDER_SOURCE');assert.equal(t.researchCandidateLineage[0].currentSourceWarning,null);
 const projected=v3ResultFromTarget(t);assert.equal(projected.sourceAcquisitions[0].status,'PROVIDER_SOURCE');assert.equal(projected.sourceAcquisitions[0].currentSourceWarning,null);assert.equal(projected.sourceAcquisitions[0].truthAuthority,'NONE');
});

test('D/R: Direct reads, classifies and sends the same retained body to normal V3 Truth; resume revalidates it',async t=>{
 const directory=temp(t),initial=target({capabilities:{direct:true,tavily:false,decodo:false,browser:false}});let reads=0,consumed=0;
 const adapters={directory,targets:[initial],search:async()=>{throw Error('UNEXPECTED_SEARCH');},read:async()=>{reads++;return page();},consumeProvider:async({target:current,page:retained,directory:dir})=>{consumed++;assert.equal(retained.sourceClassification.status,'PROVIDER_SOURCE');const validated=validateDirectProviderPage({target:current,page:retained,directory:dir}),v3=evaluateDirectProviderTruth({target:current,retained:validated});assert.equal(v3.v3Observation.sha256,digest(body));return {classification:'DIRECT_FIELDS_INSUFFICIENT',verified:[],v3Observation:v3.v3Observation,v3Truth:v3.v3Truth,blockers:[]};}};
 const first=await runOpenWebResearch({...adapters,maxActions:1}),current=first.targets[0];assert.equal(reads,1);assert.equal(consumed,1);assert.equal(current.reads[0].sourceClassification.status,'PROVIDER_SOURCE');
 assert.equal(current.researchCandidateLineage[0].currentSourceWarning,null);assert.equal(current.researchCandidateLineage[0].truthAuthority,'NONE');
 const restored=structuredClone(current);assert.equal(rehydrateRetainedProviderAuthority(directory,restored),1);assert.equal(hasProviderRoutingAuthority(restored),true);
 assert.equal(reads,1);
});

test('explicit third-party presentation blocks Direct provider interpretation even with provider-like metadata',async t=>{
 const thirdPartyBody=body.replace('</html>','<footer>Not affiliated with StreamCo</footer></html>'),directory=temp(t),x=target({capabilities:{direct:true,tavily:false,decodo:false,browser:false}});let consumed=0;
 const state=await runOpenWebResearch({directory,targets:[x],search:async()=>{throw Error('UNEXPECTED_SEARCH');},read:async()=>page(thirdPartyBody),consumeProvider:async()=>{consumed++;return {verified:[]};},maxActions:1});
 assert.equal(state.targets[0].reads[0].sourceClassification.status,'THIRD_PARTY_SOURCE');assert.equal(state.targets[0].researchCandidateLineage[0].currentSourceWarning,'THIRD_PARTY_SOURCE');assert.equal(consumed,0);assert.equal(hasProviderRoutingAuthority(state.targets[0]),false);
});

test('K/Q: Direct transport failure still permits one target-local Decodo attempt without reviewed authority',async t=>{
 const x=target(),calls=[];await runOpenWebResearch({directory:temp(t),targets:[x],search:async()=>{throw Error('UNEXPECTED_SEARCH');},read:async()=>({url,outcome:'UNRESOLVED',failure:{code:'TIMEOUT'}}),acquire:async args=>{calls.push(args);throw Error('DECODO_TIMEOUT');},maxActions:2});
 assert.equal(calls.length,1);assert.equal(calls[0].reason,'PRICE_RESEARCH_VERIFICATION_REQUIRED');assert.equal(calls[0].candidate.authority.truthAuthority,'NONE');
});

test('L: HTTP 200 with unresolved identity is retained and still permits bounded Decodo verification',async t=>{
 const x=target(),calls=[];const state=await runOpenWebResearch({directory:temp(t),targets:[x],search:async()=>{throw Error('UNEXPECTED_SEARCH');},read:async()=>page('<html><h1>StreamCo mentioned here</h1></html>'),acquire:async args=>{calls.push(args);return {classification:'ACQUISITION_FAILED',verified:[]};},maxActions:2});
 assert.equal(state.targets[0].reads[0].sourceClassification.status,'UNKNOWN_SOURCE');assert.equal(calls.length,1);assert.equal(state.targets[0].verified.length,0);
});

test('Decodo third-party body stays unverified before the offline interpreter runs',async t=>{
 const directory=temp(t),x=target(),article='<html><head><title>Best Streaming Blog</title></head><body>Independent review; not affiliated with StreamCo.</body></html>',source=page(article),journal={events:[],reserve:()=>1,append(){},settleBytes(){}};let interpreted=false;
 const acquirer=createDiscoveryAcquirer({runtime:{},bundle:{transport:{},verifier:{url:'https://exit.example/check'}},root:directory,runLive:async args=>{assert.equal(args.inventory[0].authorities.at(-1).routingOnly,true);assert.equal(typeof args.dependencies.interpret,'function');const child=path.join(directory,'child');fs.mkdirSync(child);const store=openMarketRunStore(path.join(child,'journal'));store.append('V2_ACQUISITION_RESULT',{target:{id:x.id},result:{outcome:'OBSERVED',attempts:[{outcome:'OBSERVED',page:source}]}});store.close();return {directory:child};},dependencies:{interpret:async()=>{interpreted=true;}}});
 const result=await acquirer({target:x,candidate:{url,acquisitionCandidate:priceResearchAcquisitionCandidate(x,url)},journal});
 assert.equal(result.sourceClassification.status,'THIRD_PARTY_SOURCE');assert.deepEqual(result.verified,[]);assert.equal(interpreted,false);
});

test('Decodo off-host redirect cannot inherit the candidate host provider identity',async t=>{
 const directory=temp(t),x=target(),redirected='https://publisher.example/streamco',source=page(body,redirected,url),journal={events:[],reserve:()=>1,append(){},settleBytes(){}};let interpreted=false;
 const acquirer=createDiscoveryAcquirer({runtime:{},bundle:{transport:{},verifier:{url:'https://exit.example/check'}},root:directory,runLive:async()=>{const child=path.join(directory,'child');fs.mkdirSync(child);const store=openMarketRunStore(path.join(child,'journal'));store.append('V2_ACQUISITION_RESULT',{target:{id:x.id},result:{outcome:'OBSERVED',attempts:[{outcome:'OBSERVED',requestedUrl:url,page:source}]}});store.close();return {directory:child};},dependencies:{interpret:async()=>{interpreted=true;}}});
 const result=await acquirer({target:x,candidate:{url,acquisitionCandidate:priceResearchAcquisitionCandidate(x,url)},journal});
 assert.equal(result.sourceClassification.status,'UNKNOWN_SOURCE');assert.deepEqual(result.verified,[]);assert.equal(interpreted,false);
});

test('routing-only Decodo checkpoint cannot be interpreted without intact provider classification proof',t=>{
 const directory=temp(t),x=target(),source=page(),classified=classify(),manifest={inventory:[{...x,authorities:[{hostname:'www.streamco.example',routingOnly:true}]}]};
 const store=openMarketRunStore(path.join(directory,'journal'));store.append('V2_ACQUISITION_RESULT',{target:{id:x.id},result:{outcome:'OBSERVED',attempts:[{outcome:'OBSERVED',page:source}]}});store.close();
 assert.throws(()=>requireRoutingOnlySourceProof(directory,manifest),/ROUTING_ONLY_SOURCE_PROOF_REQUIRED/);
 writeRoutingOnlySourceProof(directory,x,classified);assert.doesNotThrow(()=>requireRoutingOnlySourceProof(directory,manifest));
 const bad={...classified,sourceHash:'0'.repeat(64)};writeRoutingOnlySourceProof(directory,x,bad);assert.throws(()=>requireRoutingOnlySourceProof(directory,manifest),/ROUTING_ONLY_SOURCE_PROOF_INVALID/);
});

test('public no-robots-policy permission remains sufficient for source review; explicit disallow fails',()=>{
 const permitted=page();permitted.accessDecisions=[{decision:'NO_ROBOTS_POLICY'}];assert.equal(classifyAcquiredSource({target:target(),page:permitted,body,observationId:'no-robots'}).status,'PROVIDER_SOURCE');
 const denied=page();denied.accessDecisions=[{decision:'DISALLOWED'}];assert.equal(classifyAcquiredSource({target:target(),page:denied,body,observationId:'denied'}).status,'UNKNOWN_SOURCE');
});
