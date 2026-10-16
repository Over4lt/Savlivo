import test from 'node:test';
import assert from 'node:assert/strict';
import {applyResearchHandoff} from './reviewed-cohort-execution.mjs';
import {initializeAdaptiveState,assessAdaptiveService,v4VerificationStatus} from './adaptive-campaign.mjs';

const target={id:'example-price-DE',service:'example',serviceName:'Example',market:'DE',urls:[],leads:[],authorities:[]};
const handoff={kind:'V4_TO_V3_RESEARCH_HANDOFF',provider:'Example',targetMarket:'DE',researchLeads:{candidatePlans:[{suggestedId:'v4:one',plan:'Individual',amount:10.99,currency:'EUR',truthAuthority:'NONE'}],candidateUrls:['https://example.test/de/pricing'],citations:['https://example.test/de/pricing'],unresolvedGaps:['verification'],truthAuthority:'NONE'},adaptiveTargetPatch:{urls:['https://example.test/de/pricing'],researchCandidateLineage:[{originSuggestedId:'v4:one',plan:'Individual',sourceUrl:'https://example.test/de/pricing',sourceHash:null,sourceEvidence:'price lead',truthAuthority:'NONE'}],leads:[{url:'https://example.test/de/pricing',originSuggestedIds:['v4:one'],truthAuthority:'NONE',authoritative:false,origin:'GOOGLE_AI_V4'}]}};

test('V4 research handoff adds bounded leads without granting provider or Truth authority',()=>{
 const result=applyResearchHandoff(target,handoff);assert.deepEqual(result.urls,['https://example.test/de/pricing']);assert.equal(result.leads[0].authoritative,false);assert.equal(result.researchCandidateLineage[0].truthAuthority,'NONE');assert.equal(result.v4ResearchHandoff.truthAuthority,'NONE');assert.deepEqual(result.authorities,[]);assert.deepEqual(target.urls,[]);
 assert.deepEqual(result.v4VerificationRequirement,{kind:'SOURCE_BOUND_PRICE_VERIFICATION_REQUIRED',truthAuthority:'NONE',targetMarket:'DE',candidateSuggestedIds:['v4:one']});
});

test('V4 Suggested cannot satisfy adaptive completion without source-bound verification',()=>{
 const value=applyResearchHandoff({...target,researchObjective:'SERVICE_COVERAGE',smartResearch:{version:2},gaps:['plan','amount','currency','cadence','priceRole','ownership','market'],reads:[],queries:[],decisions:[],verified:[],blockedOrigins:[],capabilities:{direct:false,tavily:false,decodo:false,browser:false,groq:false}},handoff);
 value.retainedPriceReview={sourceBound:true,confidence:'HIGH',market:null,objective:'SERVICE_COVERAGE'};
 assert.deepEqual(v4VerificationStatus(value),{required:true,attempted:false,satisfied:false});
 const assessment=assessAdaptiveService(initializeAdaptiveState({targets:[value],conditionalFollowupTargets:[]}),'example');
 assert.equal(assessment.stop.kind,'RESEARCH_OPTIMAL_STOP');assert(['AUTHORITY_UNRESOLVED','CAPABILITY_DISABLED_TAVILY'].includes(assessment.stop.reason));
 value.reads=[{requestedUrl:'https://example.test/de/pricing',url:'https://example.test/de/pricing',outcome:'OK'}];assert.equal(v4VerificationStatus(value).attempted,true);
 value.retainedPriceReview={sourceBound:true,confidence:'HIGH',market:'DE',objective:'SERVICE_COVERAGE'};assert.equal(v4VerificationStatus(value).satisfied,true);
});

test('PRICE_RESEARCH legacy rows and retained review never satisfy V4 verification without V3 Truth',()=>{
 const value=applyResearchHandoff({...target,operationsObjective:'PRICE_RESEARCH',researchObjective:'SERVICE_COVERAGE',verified:[{plan:'Basic'}],retainedPriceReview:{sourceBound:true,market:'DE',confidence:'HIGH'}},handoff);
 assert.deepEqual(v4VerificationStatus(value),{required:true,attempted:false,satisfied:false});
});

test('handoff refuses target mismatch, credentialed URLs and promoted leads',()=>{
 for(const bad of [
  {...handoff,targetMarket:'NO'},
  {...handoff,provider:'Other'},
  {...handoff,adaptiveTargetPatch:{...handoff.adaptiveTargetPatch,urls:['https://user:pass@example.test/']}},
  {...handoff,adaptiveTargetPatch:{...handoff.adaptiveTargetPatch,leads:[{...handoff.adaptiveTargetPatch.leads[0],authoritative:true}]}}
 ])assert.throws(()=>applyResearchHandoff(target,bad),/HANDOFF_RESEARCH_SCOPE/);
});
