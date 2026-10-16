import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {digest} from '../research-v3/model.mjs';
import {evaluateCountryProviderTruth} from '../research-v2/live/provider-source-v3.mjs';
import {classifyAcquiredSource} from '../research-v2/live/source-classification.mjs';
import {projectEstablishedV3Offerings} from '../research-v2/inventory/v3-result-projection.mjs';
import {runOpenWebResearch} from '../research-v2/live/open-web-discovery.mjs';
import {runAdminV4FirstResearch,v3ResultFromTarget} from './admin-live-pipeline.mjs';
import {researchMonthlyRecurringWithRecovery} from './monthly-recurring.mjs';

const url='https://help.example.com/en/plans';
const link={id:'11111111-1111-4111-8111-111111111111',url,kind:'DIRECT_SOURCE',marketScope:'GLOBAL',marketCode:null,enabled:true,truthAuthority:'NONE'};
const body='<html><head><title>Plans and Pricing | Example Help Center</title><meta name="description" content="Discover the different streaming plans Example offers and how much Example costs."></head><body><main><h1>Plans and Pricing</h1><p>Example plans are billed monthly on the signup date. We do not offer annual plans.</p><h3>Pricing (Norwegian Krone)</h3><ul><li>Basic: NOK 119 / month</li><li>Standard: NOK 149 / month<ul><li>Extra member: NOK 49 / month</li></ul></li><li>Premium: NOK 219 / month</li></ul></main></body></html>';
const target={id:'price-research:example:NO',service:'example',serviceName:'Example',market:'NO'};

function countryResult(){
 const hash=digest(body),attemptId='decodo-country-attempt',continuityRef='decodo-session',beforeHash='1'.repeat(64),afterHash='2'.repeat(64);
 const receipt=(receiptUrl,bodySha256)=>({url:receiptUrl,bodySha256,bindingRef:attemptId,bindingChanged:false,destinationMode:'PINNED_CONNECT',continuityRef});
 const attempt={id:attemptId,providerId:'decodo',method:'APPROVED_PROXY',mode:'SESSION',targetCountry:'NO',bindingRef:attemptId,sessionRef:continuityRef,requestedUrl:url,finalUrl:url,outcome:'OBSERVED',cleanup:'RELEASED',receipts:[receipt('https://exit.example/before',beforeHash),receipt(url,hash),receipt('https://exit.example/after',afterHash)],transportVerification:{version:2,level:'BRACKET_VERIFIED',providerId:'decodo',bindingRef:attemptId,targetCountry:'NO',before:{status:'MATCH',country:'NO'},after:{status:'MATCH',country:'NO'},target:{finalUrl:url,outcome:'OK'},equality:true,continuity:'NO_OBSERVED_CHANGE',conflicts:[]},page:{url,requestedUrl:null,outcome:'OK',httpStatus:200,contentType:'text/html',targetCountry:'NO',sourceIntegrity:{sha256:hash},rawSource:{text:body},accessDecisions:[{decision:'ALLOWED'}],authority:{status:'CONFIGURED_REVIEWED',hostname:'help.example.com',provider:'Example',sourceType:'OFFICIAL_PROVIDER',sourceUrl:url}}};
 const sourceCheck={hash,status:'HASH_VERIFIED',receipt:{intact:true,bodyHash:hash,service:'example',serviceEstablished:true,bindingEstablished:true,sourceUrl:url,geo:{classification:'G1',reasons:[],targetCountry:'NO',geoCountry:'NO',bodyHash:hash,sourceUrl:url,attemptId,transport:{providerId:'decodo',method:'APPROVED_PROXY',mode:'SESSION',bindingRef:attemptId},receiptIndexes:{before:0,response:1,after:2},geoProofHashes:{before:beforeHash,after:afterHash}}}};
 const sourceTarget={...target,providerSourceIdentityHosts:['example.com'],authorities:[]},sourceClassification=classifyAcquiredSource({target:sourceTarget,page:{...attempt.page,requestedUrl:url,bodyHash:hash},body,observationId:'decodo-country-source'});
 return {hash,sourceClassification,evaluated:evaluateCountryProviderTruth({target:sourceTarget,sourceCheck,attempt})};
}

test('HTTP 402 plus a country-bound Research link retains three V3 Suggested and three canonical Verified across runs',async context=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'http-402-country-source-'));context.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
 const persisted=new Map();let strictCalls=0;
 for(let run=1;run<=3;run++){
  const result=await runAdminV4FirstResearch({targets:[target],apiKey:'fixture-key',acquireGoogle:async args=>researchMonthlyRecurringWithRecovery({...args,fetchImpl:async()=>{strictCalls++;return new Response('{}',{status:402});}}),persistSuggested:async()=>({}),loadSuggested:async()=>[],loadVerified:async()=>[...persisted.values()].map(row=>structuredClone(row)),persistVerified:async rows=>{for(const row of rows)persisted.set(row.planSlug,structuredClone(row));return {persisted:rows.length};},runDownstream:async({handoffs})=>{
   assert.equal(handoffs[target.id].researchLeads.candidatePlans.length,0);
   const researchTarget={...target,operationsObjective:'PRICE_RESEARCH',researchObjective:'SERVICE_COVERAGE',smartResearch:{version:2},providerSourceIdentityHosts:['example.com'],authorities:[],researchLinks:[link],researchLinkOutcomes:[],urls:[],leads:[],knownCommercialUrls:[],reads:[],queries:[],decisions:[],verified:[],blockedOrigins:[],gaps:['amount'],capabilities:{direct:false,tavily:false,decodo:true,browser:false,groq:false}};
   const state=await runOpenWebResearch({directory:path.join(directory,'run-'+run),targets:[researchTarget],maxActions:1,search:async()=>assert.fail('Tavily disabled'),read:async()=>assert.fail('Direct disabled'),acquire:async({route,candidate})=>{
    assert.equal(route,'DECODO');assert.equal(candidate.authority.truthAuthority,'NONE');assert.equal(candidate.researchLinkId,link.id);
    const {hash,sourceClassification,evaluated}=countryResult();assert.equal(sourceClassification.status,'PROVIDER_SOURCE');assert.equal(sourceClassification.reason,'SAME_PROVIDER_REGISTRABLE_DOMAIN');return {...evaluated,classification:'VERIFIED_OUTPUT',sourceClassification,countryV3Evaluation:{status:'EVALUATED',sourceHash:hash,receiptStatus:'HASH_VERIFIED',geoClass:'G1'},verified:[]};
   }});
   const current=state.targets[0];assert.equal(current.researchLinkOutcomes[0].result,'VERIFIED');assert.equal(current.v3SuggestedCandidates.length,3);assert.equal(projectEstablishedV3Offerings(current).length,3);assert.equal(v3ResultFromTarget(current).verified.length,3);return {result:{targets:{[target.id]:current}},v3Results:{[target.id]:v3ResultFromTarget(current)}};
  }});
  const final=result.targets[0];assert.equal(final.googleStatus,'GOOGLE_AI_ACCESS_FAILURE');assert.equal(final.strictGeminiRequests,1);assert.equal(final.simplifiedRecoveryRequests,0);assert.equal(final.earlySuggestedPersisted,0);
  assert.deepEqual(final.planCounts,{suggestedPlans:3,verifiedPlans:3});assert.equal(final.combined.plans.length,3);assert.equal(final.combined.resultClass,'VERIFIED');assert.equal(final.researchLinks[0].result,'VERIFIED');
  assert(final.combined.suggested.every(row=>row.provenance==='V3_SOURCE_RESEARCH'&&row.sourceHash===digest(body)&&row.researchEvidence.sourceBound===true&&row.researchEvidence.observationId));
  assert(final.combined.verified.every(row=>row.provenance==='V3_VERIFIED'||row.provenance==='EXISTING_VERIFIED'));assert.equal(persisted.size,3);
 }
 assert.equal(strictCalls,3);
});
