import test from 'node:test';
import assert from 'node:assert/strict';
import {applyResearchHandoff} from './reviewed-cohort-execution.mjs';

const target={id:'example-price-DE',service:'example',serviceName:'Example',market:'DE',urls:[],leads:[],authorities:[]};
const handoff={kind:'V4_TO_V3_RESEARCH_HANDOFF',provider:'Example',targetMarket:'DE',researchLeads:{candidatePlans:[{suggestedId:'v4:one',plan:'Individual',amount:10.99,currency:'EUR',truthAuthority:'NONE'}],candidateUrls:['https://example.test/de/pricing'],citations:['https://example.test/de/pricing'],unresolvedGaps:['verification'],truthAuthority:'NONE'},adaptiveTargetPatch:{urls:['https://example.test/de/pricing'],researchCandidateLineage:[{originSuggestedId:'v4:one',plan:'Individual',sourceUrl:'https://example.test/de/pricing',sourceHash:null,sourceEvidence:'price lead',truthAuthority:'NONE'}],leads:[{url:'https://example.test/de/pricing',originSuggestedIds:['v4:one'],truthAuthority:'NONE',authoritative:false,origin:'GOOGLE_AI_V4'}]}};

test('V4 research handoff adds bounded leads without granting provider or Truth authority',()=>{
 const result=applyResearchHandoff(target,handoff);assert.deepEqual(result.urls,['https://example.test/de/pricing']);assert.equal(result.leads[0].authoritative,false);assert.equal(result.researchCandidateLineage[0].truthAuthority,'NONE');assert.equal(result.v4ResearchHandoff.truthAuthority,'NONE');assert.deepEqual(result.authorities,[]);assert.deepEqual(target.urls,[]);
});

test('handoff refuses target mismatch, credentialed URLs and promoted leads',()=>{
 for(const bad of [
  {...handoff,targetMarket:'NO'},
  {...handoff,provider:'Other'},
  {...handoff,adaptiveTargetPatch:{...handoff.adaptiveTargetPatch,urls:['https://user:pass@example.test/']}},
  {...handoff,adaptiveTargetPatch:{...handoff.adaptiveTargetPatch,leads:[{...handoff.adaptiveTargetPatch.leads[0],authoritative:true}]}}
 ])assert.throws(()=>applyResearchHandoff(target,bad),/HANDOFF_RESEARCH_SCOPE/);
});
