import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {projectSourceBoundContinuations} from './source-bound-continuation-projection.mjs';
import {planResearch} from './research-planner.mjs';
import {OpenWebResearch} from './open-web-discovery.mjs';
import {campaignAttemptedUrls} from '../inventory/provider-seed-campaign.mjs';

const host='provider.example',foreign=`https://${host}/en/no/memberships`,targetUrl=`https://${host}/en/de/memberships`,pricing=`https://${host}/pricing`,hash='a'.repeat(64);
const authority={hostname:host,provider:'Example Provider',sourceType:'OFFICIAL_PROVIDER',sourceUrl:foreign,checkedAt:'2026-10-13T00:00:00.000Z'};
const truth=()=>({prices:{DE:{propositions:{}}},needs:[{id:'DE:PRICE_AMOUNT',proposition:'PRICE_AMOUNT',market:'DE',offerId:null,state:'UNRESOLVED'}]});
const parent=(transport='DIRECT',url=foreign,id='parent',sha256=hash)=>({id,kind:'PROVIDER',url,sha256,context:{transport,networkGeography:transport==='DECODO'?'DE':'UNBOUND',representation:'PROVIDER_PAGE'}});
const outcome=({transport='DIRECT',url=foreign,destination=targetUrl,id='parent',sha256=hash,context='MARKET',locale='de-DE',state={market:'DE'}}={})=>{const p=parent(transport,url,id,sha256),source={observation:id,bodySha256:sha256,start:3,end:23,sha256:'b'.repeat(64)};return {v3Observation:p,v3Truth:truth(),v3Continuations:[{id:'continuation-'+id,url:destination,kind:'ANCHOR',label:'German memberships',locale,context,score:24,needs:['PRICE_AMOUNT'],authority:null,source,state,signals:{market:true},truthAuthority:'NONE'}]};};
function target(extra={}){return {id:'example-DE',service:'example',serviceName:'Example Provider',market:'DE',researchObjective:'SERVICE_COVERAGE',smartResearch:{version:2},urls:[foreign],knownCommercialUrls:[foreign],authorities:[authority],gaps:['amount','market'],reads:[],queries:[],decisions:[],verified:[],blockedOrigins:[],leads:[],capabilities:{direct:true,tavily:false,decodo:true,browser:true,groq:false},v3Truth:truth(),providerSeedCandidateServiceContext:{objectiveResource:{url:foreign},objectiveLeads:[]},...extra};}
const addTo=t=>lead=>{if(!t.leads.some(row=>row.url===lead.url))t.leads.push(lead);};

test('A direct continuation is projected into the active frontier as research-only provenance',()=>{
 const value=target(),result=projectSourceBoundContinuations({target:value,outcome:outcome(),add:addTo(value)}),lead=value.leads[0];
 assert.deepEqual(result,{considered:1,projected:1,rejected:[]});assert.equal(lead.url,targetUrl);assert.equal(lead.sourceBoundCandidate,true);assert.equal(lead.truthAuthority,'NONE');assert.equal(lead.authoritative,false);assert.equal(lead.canContributeEvidence,false);assert.equal(lead.from.observation,'parent');assert.equal(lead.from.bodyHash,hash);assert.equal(lead.continuationResearchContext.targetMarket,'DE');
});

test('B country continuation uses the same projection and accepted acquisition parent',()=>{
 const acquired=outcome({transport:'DECODO'}),value=target({providerInterpretations:[{url:foreign,v3Observation:acquired.v3Observation,v3Truth:acquired.v3Truth}],acquisitionOutcomes:[{url:foreign,channel:'DIRECT_THEN_GEO',routingReason:'TARGET_MARKET_OBSERVATION_REQUIRED',sourceHash:hash,transport:'DECODO'}],decisions:[{url:foreign,route:'DECODO',acquisitionReserved:true}]});
 projectSourceBoundContinuations({target:value,outcome:acquired,add:addTo(value)});const plan=planResearch(value,{unreadUrls:value.leads.map(row=>row.url)});assert.equal(value.leads[0].continuationAcquisitionContext.transport,'DECODO');assert.equal(plan.url,targetUrl);assert.equal(plan.route,'DIRECT');
});

test('D target-state continuation outranks external search for the current market gap',()=>{
 const acquired=outcome({transport:'DECODO'}),value=target({capabilities:{direct:true,tavily:true,decodo:true,browser:false,groq:false},providerInterpretations:[{url:foreign,v3Observation:acquired.v3Observation,v3Truth:acquired.v3Truth}],acquisitionOutcomes:[{url:foreign,channel:'DIRECT_THEN_GEO',routingReason:'TARGET_MARKET_OBSERVATION_REQUIRED',sourceHash:hash,transport:'DECODO'}],decisions:[{url:foreign,route:'DECODO',acquisitionReserved:true}]});
 projectSourceBoundContinuations({target:value,outcome:acquired,add:addTo(value)});const plan=planResearch(value,{unreadUrls:value.leads.map(row=>row.url)});assert.equal(plan.reason,'TARGET_MARKET_STATE_CONTINUATION_AVAILABLE');assert.equal(plan.discoveryRequired,false);assert.equal(plan.url,targetUrl);
});

test('E cross-host continuation stays research-only and receives no inherited authority',()=>{
 const destination='https://related-provider.example/pricing',value=target({capabilities:{direct:true,tavily:true,decodo:true,browser:false,groq:false}}),acquired=outcome({destination,context:'PRICE',locale:null,state:null});projectSourceBoundContinuations({target:value,outcome:acquired,add:addTo(value)});value.providerInterpretations=[{url:foreign,v3Observation:acquired.v3Observation,v3Truth:acquired.v3Truth}];
 const plan=planResearch(value,{unreadUrls:value.leads.map(row=>row.url)}),lead=value.leads[0];assert.equal(plan.route,'AUTHORITY_DISCOVERY');assert.equal(plan.url,destination);assert.equal(lead.truthAuthority,'NONE');assert.equal(lead.authoritative,false);assert.equal(Object.hasOwn(lead,'providerAuthorityBinding'),false);
});

test('F duplicate projected continuation does not create another frontier row',t=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'continuation-dedup-'));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));const session=new OpenWebResearch(directory,[target()]),value=session.state.targets[0],project=()=>projectSourceBoundContinuations({target:value,outcome:outcome(),add:lead=>session.add(value,lead)});session.add(value,{url:targetUrl,title:'Generic navigation'});project();project();const rows=value.leads.filter(row=>row.url===targetUrl);assert.equal(rows.length,1);assert.equal(rows[0].sourceBoundCandidate,true);assert.equal(rows[0].truthAuthority,'NONE');
});

test('G a materially changed resource state remains a separate executable lead',()=>{
 const value=target(),second=`https://${host}/en/de/plans`;projectSourceBoundContinuations({target:value,outcome:outcome(),add:addTo(value)});projectSourceBoundContinuations({target:value,outcome:outcome({destination:second,id:'second-parent',sha256:'c'.repeat(64)}),add:addTo(value)});assert.deepEqual(value.leads.map(row=>row.url),[targetUrl,second]);
});

test('H inner authority handoff attempts enter the campaign-wide exact-resource history',()=>{
 const inner='https://provider.example/legal/operator',history=campaignAttemptedUrls({candidateReviews:[{url:foreign,finalUrl:foreign}],authorityResearch:[{reads:[{url:inner,finalUrl:inner,status:'UNRESOLVED_PROVIDER_IDENTITY'}]}]});assert.equal(history.has(foreign),true);assert.equal(history.has(inner),true);assert.equal(history.size,2);
});

test('I a late useful continuation revives an exhausted-looking frontier',()=>{
 const value=target({urls:[],knownCommercialUrls:[]});let plan=planResearch(value,{unreadUrls:[]});assert.equal(plan.route,'STOP');projectSourceBoundContinuations({target:value,outcome:outcome({destination:pricing,context:'PRICE',locale:null,state:null}),add:addTo(value)});plan=planResearch(value,{unreadUrls:value.leads.map(row=>row.url)});assert.equal(plan.route,'DIRECT');assert.equal(plan.url,pricing);
});

test('J attempted projected continuations produce a clean semantic stop',()=>{
 const value=target({urls:[],knownCommercialUrls:[]});projectSourceBoundContinuations({target:value,outcome:outcome({destination:pricing,context:'PRICE',locale:null,state:null}),add:addTo(value)});value.reads.push({requestedUrl:pricing,url:pricing,outcome:'OK',bodyHash:'d'.repeat(64),sourceIntegrity:{sha256:'d'.repeat(64)}});const plan=planResearch(value,{unreadUrls:value.leads.map(row=>row.url)});assert.equal(plan.route,'STOP');assert.notEqual(plan.reason,'NO_USEFUL_PROVIDER_DESTINATION');
});
