import test from 'node:test';
import assert from 'node:assert/strict';
import {initializeAdaptiveState,targetExecutionContext} from '../inventory/adaptive-campaign.mjs';
import {alreadyAccountedSameCampaignRead,directAcquisitionReads,executableAction,executionBounds} from './execution-capabilities.mjs';

const campaign='a'.repeat(64),otherCampaign='b'.repeat(64),sha='c'.repeat(64),observation='provider-seed-resource:fixture',provider='https://provider.example/subscription',continuation='https://de.provider.example/subscription';
const key=[observation,provider,sha].join(':');
const reuse=()=>({url:provider,requestedUrl:provider,outcome:'OK',httpStatus:200,contentType:'text/html',truncated:false,bodyHash:sha,bodyFile:`bodies/${sha}.txt`,sourceIntegrity:{sha256:sha},accessDecisions:[{decision:'ALLOWED'}],sameCampaignEvidenceReuse:{campaign,observation,sha256:sha,networkRequests:0,bytes:0,acquisitions:0}});
const target=(reads=[reuse()])=>({id:'fixture-price-DE',service:'fixture',serviceName:'Fixture',market:'DE',researchObjective:'SERVICE_COVERAGE',smartResearch:{version:2},urls:[continuation],leads:[{url:continuation,title:'DE subscription',sourceBoundCandidate:true,truthAuthority:'NONE',authoritative:false}],authorities:[],providerSeedAuthorityHandoff:{contractVersion:1,serviceProof:{observation:{id:observation,url:provider,sha256:sha}}},currentCampaignEvidenceCampaign:campaign,currentCampaignEvidenceReuses:[key],gaps:['amount'],reads,queries:[],decisions:[],verified:[],blockedOrigins:[],capabilities:{direct:true,tavily:false,decodo:true,browser:false,groq:false}});
const initial=reads=>({actions:reads,reads,searches:0,acquisitions:0,retainedReviews:0,bytes:300});
const contextFor=(t,reads=3)=>{const state=initializeAdaptiveState({targets:[t],conditionalFollowupTargets:[]},{limits:{reads:4,searches:0,acquisitions:2,bytes:1024},budgetScope:'CAMPAIGN',initialUsage:initial(reads)}),current=state.targets[t.id];return {state,current,context:targetExecutionContext(state,current)};};
const action={route:'AUTHORITY_DISCOVERY',url:continuation};

test('same-campaign retained observation is semantic state without a second Direct charge',()=>{
 const t=target(),{state,current,context}=contextFor(t);assert.equal(alreadyAccountedSameCampaignRead(current,current.reads[0]),true);assert.equal(directAcquisitionReads(current).length,0);assert.equal(state.initialUsage.reads,3);assert.equal(context.usage.reads,0);assert.equal(context.usage.bytes,0);assert.equal(context.usage.acquisitions,0);assert.equal(context.bounds.perServiceReads,1);assert.equal(executableAction(current,action,context).executable,true);
 const fresh={url:continuation,requestedUrl:continuation,outcome:'OK',acquisitionBytes:11};const completed=target([reuse(),fresh]),next=contextFor(completed),cap=executableAction(next.current,{route:'DIRECT',url:'https://de.provider.example/next'},next.context);assert.equal(directAcquisitionReads(next.current).length,1);assert.equal(next.state.initialUsage.reads+next.state.services.fixture.used.reads,4);assert.equal(next.context.usage.bytes,11);assert.equal(cap.executable,false);assert.equal(cap.reason,'DIRECT_BUDGET_EXHAUSTED');
});

test('checkpoint serialization preserves the one-charge identity',()=>{
 const restored=JSON.parse(JSON.stringify(target()));assert.equal(directAcquisitionReads(restored).length,0);const {state,current,context}=contextFor(restored);assert.equal(state.initialUsage.reads,3);assert.equal(context.bounds.perServiceReads,1);assert.equal(executableAction(current,action,context).executable,true);
});

test('stale or invalid retained rows cannot claim free reuse',()=>{
 for(const change of [row=>{row.stale=true;},row=>{row.bodyHash='d'.repeat(64);},row=>{row.outcome='ERROR';},row=>{row.sameCampaignEvidenceReuse.bytes=1;}]){const t=target(),row=t.reads[0];change(row);assert.equal(alreadyAccountedSameCampaignRead(t,row),false);assert.equal(directAcquisitionReads(t).length,1);}
});

test('another campaign cannot obtain an exemption from matching URL and body hash',()=>{
 const t=target();t.reads[0].sameCampaignEvidenceReuse.campaign=otherCampaign;assert.equal(directAcquisitionReads(t).length,1);t.reads[0].sameCampaignEvidenceReuse.campaign=campaign;t.currentCampaignEvidenceCampaign=otherCampaign;assert.equal(directAcquisitionReads(t).length,1);
});

test('multiple projections of one accounted observation neither charge again nor create extra capacity',()=>{
 const t=target([reuse(),reuse()]),{current,context}=contextFor(t);assert.equal(directAcquisitionReads(current).length,0);assert.equal(executableAction(current,action,context).executable,true);current.reads.push({url:continuation,requestedUrl:continuation,outcome:'OK'});assert.equal(directAcquisitionReads(current).length,1);assert.equal(executableAction(current,{route:'DIRECT',url:'https://de.provider.example/next'},{...context,usage:{...context.usage,reads:1}}).reason,'DIRECT_BUDGET_EXHAUSTED');
});

test('four inherited genuine reads leave reuse available but block every new Direct acquisition',()=>{
 const {current,context}=contextFor(target(),4);assert.equal(directAcquisitionReads(current).length,0);assert.equal(context.bounds.perServiceReads,0);const cap=executableAction(current,action,context);assert.equal(cap.executable,false);assert.equal(cap.reason,'DIRECT_BUDGET_EXHAUSTED');assert.deepEqual(executionBounds.perServiceReads,4);
});
