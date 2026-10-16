import test from 'node:test';
import assert from 'node:assert/strict';
import {digest,providerBound} from '../../research-v3/model.mjs';
import {baselineProviderSourceHosts,providerSourceDomainFamily} from '../../research-v3/provider-source-family.mjs';
import {classifyAcquiredSource} from './source-classification.mjs';
import {providerRoutingAuthority} from './provider-routing-authority.mjs';
import {runOpenWebResearch} from './open-web-discovery.mjs';
import {createDiscoveryAcquirer} from './online-discovery-stage.mjs';
import {priceResearchAcquisitionCandidate} from './price-research-candidate.mjs';
import {requireRoutingOnlySourceProof} from './routing-only-source-proof.mjs';
import {openMarketRunStore} from '../../research-v1/market-run-store.mjs';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';

const body='<html><head><title>Help and pricing</title></head><body><main><h1>Monthly plans</h1><p>Choose a subscription.</p></main></body></html>';
const target=(host='example.com',extra={})=>({id:'example-NO',service:'example',serviceName:'Example',market:'NO',operationsObjective:'PRICE_RESEARCH',researchObjective:'SERVICE_COVERAGE',smartResearch:{version:2},providerSourceIdentityHosts:[host],authorities:[],urls:[],leads:[],knownCommercialUrls:[],reads:[],queries:[],decisions:[],verified:[],blockedOrigins:[],gaps:['amount'],capabilities:{direct:false,tavily:false,decodo:true,browser:false,groq:false},...extra});
const page=(requestedUrl,finalUrl=requestedUrl,value=body)=>({url:finalUrl,requestedUrl,outcome:'OK',httpStatus:200,contentType:'text/html',truncated:false,bodyHash:digest(value),sourceIntegrity:{sha256:digest(value)},accessDecisions:[{decision:'ALLOWED'}]});
const classify=(t,requestedUrl,finalUrl=requestedUrl,value=body)=>classifyAcquiredSource({target:t,page:page(requestedUrl,finalUrl,value),body:value,observationId:'family-source'});

test('retained source identity uses public-suffix-aware established provider family',()=>{
 for(const [host,final] of [['example.com','help.example.com'],['www.example.com','support.example.com'],['example.co.uk','support.example.co.uk']]){
  const result=classify(target(host),`https://${final}/pricing`);assert.equal(result.status,'PROVIDER_SOURCE');assert.equal(result.reason,'SAME_PROVIDER_REGISTRABLE_DOMAIN');assert.equal(result.binding.establishedHost,host);
 }
 for(const final of ['evilexample.com','example.com.evil.com','notexample.com'])assert.equal(classify(target(),`https://${final}/pricing`).status,'UNKNOWN_SOURCE');
 assert.equal(classify(target('example.co.uk'),'https://example.co.uk.evil.com/pricing').status,'UNKNOWN_SOURCE');
 assert.equal(providerSourceDomainFamily(target(),'https://help.example.com/pricing')?.registrableDomain,'example.com');
});

test('only final retained URL determines family identity across redirects',()=>{
 const t=target(),start='https://help.example.com/pricing';
 assert.equal(classify(t,start,'https://support.example.com/plans').status,'PROVIDER_SOURCE');
 const away=classify(t,start,'https://partner-payments.example-thirdparty.com/prices');assert.equal(away.status,'UNKNOWN_SOURCE');assert.equal(away.reason,'FINAL_URL_OUTSIDE_PROVIDER_DOMAIN');
 const unowned=target('other.com',{providerSourceIdentityHosts:[],researchLinks:[{url:start,truthAuthority:'NONE'}]});assert.equal(classify(unowned,start).status,'UNKNOWN_SOURCE');
});

test('explicit third-party, competing identity, integrity and unusable responses override family',()=>{
 const t=target(),url='https://help.example.com/pricing';
 assert.deepEqual([classify(t,url,url,body+'<footer>Not affiliated with Example</footer>').status,classify(t,url,url,'<html><head><meta property="og:site_name" content="Other Provider"></head><body>Plans</body></html>').status],['THIRD_PARTY_SOURCE','THIRD_PARTY_SOURCE']);
 const tampered=page(url);tampered.sourceIntegrity.sha256='0'.repeat(64);assert.equal(classifyAcquiredSource({target:t,page:tampered,body,observationId:'bad'}).reason,'SOURCE_INTEGRITY_INVALID');
 const truncated=page(url);truncated.truncated=true;assert.equal(classifyAcquiredSource({target:t,page:truncated,body,observationId:'short'}).status,'UNKNOWN_SOURCE');
 const denied=page(url);denied.accessDecisions=[{decision:'DISALLOWED'}];assert.equal(classifyAcquiredSource({target:t,page:denied,body,observationId:'denied'}).status,'UNKNOWN_SOURCE');
});

test('canonical official source hosts are separate from manually entered Research links',()=>{
 assert(baselineProviderSourceHosts('netflix','Netflix').includes('www.netflix.com'));
 assert.deepEqual(baselineProviderSourceHosts('not-a-service','Not A Service'),[]);
 const t=target('example.com',{providerSourceIdentityHosts:[],authorities:[{hostname:'example.com',provider:'Example',sourceType:'OFFICIAL_PROVIDER',sourceUrl:'https://example.com/',checkedAt:'2026-10-01T00:00:00Z'}]});
 assert.equal(classify(t,'https://help.example.com/pricing').status,'PROVIDER_SOURCE');
 assert.equal(providerRoutingAuthority(t,'https://help.example.com/pricing'),null);
 assert.equal(providerBound({providerHosts:['example.com']},'https://help.example.com/pricing'),false);
 assert.equal(providerBound({providerHosts:['example.com']},'https://example.com/pricing'),true);
});

test('Research-link family source can record provider outcome without inventing Verified',async context=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'provider-family-link-'));context.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
 const url='https://help.example.com/pricing',link={id:'11111111-1111-4111-8111-111111111111',url,kind:'DIRECT_SOURCE',marketScope:'GLOBAL',marketCode:null,enabled:true,truthAuthority:'NONE'},t=target('example.com',{researchLinks:[link],researchLinkOutcomes:[],persistedVerifiedCount:0});
 const state=await runOpenWebResearch({directory,targets:[t],maxActions:1,search:async()=>assert.fail('Tavily disabled'),read:async()=>assert.fail('Direct disabled'),acquire:async({route,candidate})=>{assert.equal(route,'DECODO');assert.equal(candidate.authority.truthAuthority,'NONE');return {classification:'CONTENT_NOT_COMMERCIAL',sourceClassification:{status:classify(t,url).status,reason:'SAME_PROVIDER_REGISTRABLE_DOMAIN'},verified:[]};}});
 const current=state.targets[0];assert.equal(current.researchLinkOutcomes[0].result,'PROVIDER_SOURCE_NO_VERIFIED');assert.equal(current.verified.length,0);
});

test('legacy verifier rows cannot mark a Research link Verified without established V3 offerings',async context=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'provider-family-legacy-'));context.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
 const url='https://help.example.com/pricing',link={id:'44444444-4444-4444-8444-444444444444',url,kind:'DIRECT_SOURCE',marketScope:'GLOBAL',marketCode:null,enabled:true,truthAuthority:'NONE'},t=target('example.com',{researchLinks:[link],researchLinkOutcomes:[],persistedVerifiedCount:0});
 const state=await runOpenWebResearch({directory,targets:[t],maxActions:1,search:async()=>assert.fail('Tavily disabled'),read:async()=>assert.fail('Direct disabled'),acquire:async()=>({classification:'VERIFIED_OUTPUT',sourceClassification:{status:'PROVIDER_SOURCE',reason:'SAME_PROVIDER_REGISTRABLE_DOMAIN'},verified:[{plan:'Basic',amount:9.99,currency:'EUR'}]})});
 assert.equal(state.targets[0].researchLinkOutcomes[0].result,'PROVIDER_SOURCE_NO_VERIFIED');
});

test('three established V3 offerings mark a Research link Verified',async context=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'provider-family-v3-'));context.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
 const url='https://help.example.com/pricing',link={id:'55555555-5555-4555-8555-555555555555',url,kind:'DIRECT_SOURCE',marketScope:'GLOBAL',marketCode:null,enabled:true,truthAuthority:'NONE'},t=target('example.com',{researchLinks:[link],researchLinkOutcomes:[]}),established=value=>({state:'ESTABLISHED',value,evidence:[]}),offers=['Basic','Standard','Premium'].map((name,index)=>({id:name,name,market:'NO',propositions:{SERVICE_IDENTITY:established(true),PRICE_AMOUNT:established([119,149,219][index]),CURRENCY:established('NOK'),MONTHLY_SUBSCRIPTION:established(true),CONSUMER_SUBSCRIPTION:established(true),TARGET_MARKET:established('NO'),MONTHLY_CADENCE:established(true)}}));
 const state=await runOpenWebResearch({directory,targets:[t],maxActions:1,search:async()=>assert.fail('Tavily disabled'),read:async()=>assert.fail('Direct disabled'),acquire:async()=>({classification:'VERIFIED_OUTPUT',sourceClassification:{status:'PROVIDER_SOURCE',reason:'SAME_PROVIDER_REGISTRABLE_DOMAIN'},verified:[],v3Observation:{id:'country-observation',url,sha256:'a'.repeat(64),context:{transport:'DECODO',networkGeography:'NO'}},v3Truth:{needs:[],offers,eligibility:{NO:{result:'ELIGIBLE'}}}})});
 assert.equal(state.targets[0].researchLinkOutcomes[0].result,'VERIFIED');assert.equal(state.targets[0].verified.length,0);
});

test('Decodo Research-link acquisition revalidates family source proof before interpretation',async context=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'provider-family-decodo-'));context.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
 const url='https://help.example.com/pricing',link={id:'22222222-2222-4222-8222-222222222222',url,kind:'DIRECT_SOURCE',marketScope:'GLOBAL',marketCode:null,enabled:true,truthAuthority:'NONE'},t=target('example.com',{researchLinks:[link],researchLinkOutcomes:[],persistedVerifiedCount:0});
 let interpreted=false,inventory;
 const acquirer=createDiscoveryAcquirer({runtime:{},bundle:{transport:{},verifier:{url:'https://exit.example/check'}},root:directory,runLive:async args=>{
  inventory=args.inventory;assert.equal(inventory[0].authorities.at(-1).routingOnly,true);
  const child=path.join(directory,'child');fs.mkdirSync(child);const store=openMarketRunStore(path.join(child,'journal'));
  store.append('V2_ACQUISITION_RESULT',{target:{id:t.id},result:{outcome:'OBSERVED',attempts:[{outcome:'OBSERVED',requestedUrl:url,page:{...page(url),rawSource:{text:body}}}]}});store.close();return {directory:child};
 },dependencies:{interpret:async child=>{requireRoutingOnlySourceProof(child,{inventory});interpreted=true;},verifyRetainedRun:async()=>({verified:[],usable:false,monetaryFacts:0,sourceChecks:[],priceEvidenceNeedsByTarget:{}})}});
 const result=await acquirer({target:t,candidate:{url,acquisitionCandidate:priceResearchAcquisitionCandidate(t,url)},journal:{events:[],reserve:()=>1,append(){},settleBytes(){}}});
 assert.equal(result.sourceClassification.status,'PROVIDER_SOURCE');assert.equal(result.sourceClassification.reason,'SAME_PROVIDER_REGISTRABLE_DOMAIN');assert.equal(interpreted,true);assert.deepEqual(result.verified,[]);
 assert.equal(providerRoutingAuthority(t,url),null,'classification cannot authorize navigation');
});

async function retainedLinkFixture(context,{topOutcome='OBSERVED',kind='DIRECT_SOURCE',value=body,interpret=async()=>{},retained=true,integrityValid=true}={}){
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'retained-link-result-'));context.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
 const url='https://help.example.com/pricing',link={id:'33333333-3333-4333-8333-333333333333',url,kind,marketScope:'GLOBAL',marketCode:null,enabled:true,truthAuthority:'NONE'},t=target('example.com',{researchLinks:[link],researchLinkOutcomes:[],persistedVerifiedCount:0});
 const acquirer=createDiscoveryAcquirer({runtime:{},bundle:{transport:{},verifier:{url:'https://exit.example/check'}},root:directory,runLive:async()=>{
  const child=path.join(directory,'child');fs.mkdirSync(path.join(child,'raw'),{recursive:true});const hash=digest(value),bodyFile='raw/'+hash+'.body';fs.writeFileSync(path.join(child,bodyFile),value);const store=openMarketRunStore(path.join(child,'journal'));
  if(retained)store.append('RESPONSE_CAPTURED',{target:{taskId:t.id},url,status:200,contentType:'text/html',bodyHash:hash,bodyFile});
  const retainedPage={...page(url,url,value),rawSource:{text:value}};if(!integrityValid)retainedPage.sourceIntegrity.sha256='0'.repeat(64);
  store.append('V2_ACQUISITION_RESULT',{target:{id:t.id},result:{outcome:retained?topOutcome:'NETWORK_FAILED',attempts:retained?[{outcome:'OBSERVED',requestedUrl:url,page:retainedPage}]:[{outcome:'NETWORK_FAILED',requestedUrl:url,failure:'NETWORK_FAILED'}]}});store.close();return {directory:child};
 },dependencies:{interpret,verifyRetainedRun:async()=>({verified:[],usable:false,monetaryFacts:0,sourceChecks:[],priceEvidenceNeedsByTarget:{}})}});
 return acquirer({target:t,candidate:{url,acquisitionCandidate:priceResearchAcquisitionCandidate(t,url)},journal:{events:[],reserve:()=>1,append(){},settleBytes(){}}});
}

test('intact retained attempt prevents false acquisition failure when parent outcome differs',async context=>{
 const result=await retainedLinkFixture(context,{topOutcome:'FACT_REVIEW_REQUIRED'});
 assert.equal(result.acquired,true);assert.equal(result.classification,'CONTENT_NOT_COMMERCIAL');assert.equal(result.sourceClassification.status,'PROVIDER_SOURCE');assert.equal(result.sourceClassification.reason,'SAME_PROVIDER_REGISTRABLE_DOMAIN');assert.equal(result.verified.length,0);
});

test('provider source requiring Browser retains the rendering continuation',async context=>{
 const result=await retainedLinkFixture(context,{kind:'INTERACTIVE_ROUTE',value:'<html><body><button>Continue to plans</button></body></html>'});
 assert.equal(result.classification,'CONTENT_NOT_COMMERCIAL');assert.equal(result.sourceClassification.status,'PROVIDER_SOURCE');assert.equal(result.renderingRequired,true);assert.equal(result.renderingUrl,'https://help.example.com/pricing');
});

test('a provider Research link with a diagnosed shell schedules one Browser continuation',async context=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'provider-shell-browser-'));context.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
 const url='https://help.example.com/pricing',body='<html><body><webruntime-app></webruntime-app><script src="/app.js"></script><script>bootstrap()</script></body></html>',hash=digest(body),link={id:'66666666-6666-4666-8666-666666666666',url,kind:'DIRECT_SOURCE',marketScope:'GLOBAL',marketCode:null,enabled:true,truthAuthority:'NONE'},t=target('example.com',{researchLinks:[link],researchLinkOutcomes:[],capabilities:{direct:false,tavily:false,decodo:true,browser:true,groq:false}});
 let rendered=0;const state=await runOpenWebResearch({directory,targets:[t],maxActions:2,search:async()=>assert.fail('search'),read:async()=>assert.fail('read'),acquire:async()=>({classification:'CONTENT_NOT_COMMERCIAL',sourceClassification:{status:'PROVIDER_SOURCE',reason:'SAME_PROVIDER_REGISTRABLE_DOMAIN',finalUrl:url,sourceHash:hash},countryV3Evaluation:{status:'EVALUATED',receiptStatus:'HASH_VERIFIED',geoClass:'G1'},v3Observation:{id:'shell',kind:'PROVIDER',url,sha256:hash,context:{transport:'DECODO',networkGeography:'NO'},candidateCount:0},v3Truth:{established:false,needs:[{id:'price',state:'UNRESOLVED',proposition:'PRICE_AMOUNT',market:'NO'}],prices:{NO:{propositions:{PRICE_AMOUNT:{state:'UNRESOLVED'}}}}},runDirectory:'/retained',renderingRequired:true,verified:[]}),render:async({need})=>{rendered++;assert.equal(need.url,url);assert.equal(need.transport,'DECODO');return {outcome:'OBSERVED',actionId:'rendered',v3Observation:{id:'rendered',kind:'PROVIDER',url,sha256:'f'.repeat(64),context:{transport:'DECODO',networkGeography:'NO'}},v3Truth:{established:false,needs:[],prices:{NO:{propositions:{}}}},v3Catalog:{state:'CATALOG_UNRESOLVED'}};}});
 const current=state.targets[0];assert.equal(rendered,1,JSON.stringify({plan:current.researchPlan,need:current.renderingNeed,outcomes:current.researchLinkOutcomes,renderingOutcomes:current.renderingOutcomes}));assert.equal(current.researchLinkOutcomes[0].browserAttempted,true);assert.equal(current.renderingOutcomes[0].outcome,'OBSERVED');
});

test('interpretation failure remains distinct from Decodo acquisition failure',async context=>{
 const result=await retainedLinkFixture(context,{interpret:async()=>{throw Error('V2_INTERPRETATION_FAILED');}});
 assert.equal(result.classification,'INTERPRETATION_FAILED');assert.equal(result.acquired,true);assert.equal(result.sourceClassification.status,'PROVIDER_SOURCE');assert.deepEqual(result.blockers,['V2_INTERPRETATION_FAILED']);assert.equal(result.countryV3Evaluation.reason,'V2_INTERPRETATION_FAILED');assert.deepEqual(result.verified,[]);
});

test('no retained response and invalid integrity do not enter provider interpretation',async context=>{
 const missing=await retainedLinkFixture(context,{retained:false});assert.equal(missing.classification,'ACQUISITION_FAILED');assert.equal(missing.sourceClassification.reason,'SOURCE_NOT_RETAINED');assert.deepEqual(missing.blockers,['SOURCE_NOT_RETAINED']);
 const invalid=await retainedLinkFixture(context,{integrityValid:false});assert.equal(invalid.classification,'UNKNOWN_SOURCE');assert.equal(invalid.sourceClassification.reason,'SOURCE_INTEGRITY_INVALID');assert.equal(invalid.acquired,false);
});
