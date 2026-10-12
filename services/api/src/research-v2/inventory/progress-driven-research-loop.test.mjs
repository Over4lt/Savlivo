import '../offline-replay/offline-guard.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {providerOrBrandResearchTarget} from '../../research-v3/research-target.mjs';
import {createKnowledge,addDestination,context,digest,pricePropositions} from '../../research-v3/model.mjs';
import {availableActions,runResearch} from '../../research-v3/engine.mjs';
import {buildWorkingModel,rankResearchActions} from '../../research-v3/working-model.mjs';
import {evaluate} from '../../research-v3/truth.mjs';
import {runProviderSeedCampaign} from './provider-seed-campaign.mjs';
import {orderProviderSeedAuthorityCandidates} from './provider-seed-authority-routing.mjs';

const target=providerOrBrandResearchTarget({seedName:'Northstar',targetMarket:'DE'});
const authorityDiagnostic={decision:'UNRESOLVED',mechanisms:[{mechanism:'FIRST_PARTY_PROSE',outcome:'NO_MATCH'}]};
const candidate=(id,url,extra={})=>({candidateId:id,url,host:new URL(url).hostname,originKind:'SOURCE_BOUND_CONTINUATION',searchIndex:0,searchRank:0,insertionOrder:Number(id.replace(/\D/gu,''))||0,navigationDepth:1,score:extra.score??1,...extra});
const page=(url,body)=>({url,requestedUrl:url,outcome:'OK',httpStatus:200,contentType:'text/html',truncated:false,rawSource:{text:body},bodyHash:digest(body),sourceIntegrity:{sha256:digest(body)},accessDecisions:[{decision:'ALLOWED'}]});
const providerBody=url=>`<script type="application/ld+json">${JSON.stringify({'@type':'Organization',name:'Northstar',url})}</script>`;

test('authority gap chooses observed legal capability over generic identity presentation',()=>{
 const source={observation:'source',start:1,end:20},about=candidate('c1','https://northstar.example/a',{label:'About',source,score:20}),legal=candidate('c2','https://northstar.example/b',{label:'Terms and privacy',source,score:1}),rows=orderProviderSeedAuthorityCandidates(target,[about,legal],{authorityGap:{authorityTargetHost:'northstar.example',authorityDiagnostic}});
 assert.equal(rows[0].candidateId,legal.candidateId);assert.equal(rows[0].routing.authorityEvidenceCapability.kind,'LEGAL_OR_OPERATOR_DOCUMENT');
});

test('reverse authority case chooses explicit operator presentation over a terms resource',()=>{
 const source={observation:'source',start:1,end:20},about=candidate('c1','https://northstar.example/a',{label:'About — operated by Northstar GmbH',source,score:1}),terms=candidate('c2','https://northstar.example/b',{label:'Subscriber terms',source,score:20}),rows=orderProviderSeedAuthorityCandidates(target,[terms,about],{authorityGap:{authorityTargetHost:'northstar.example',authorityDiagnostic}});
 assert.equal(rows[0].candidateId,about.candidateId);assert.equal(rows[0].routing.authorityEvidenceCapability.kind,'EXPLICIT_RELATIONSHIP_PRESENTATION');
});

test('price objective candidate beats a generic root by objective progress value',()=>{
 const root=candidate('c1','https://northstar.example/',{originKind:'SEARCH',score:0,objectiveRelevance:0}),pricing=candidate('c2','https://northstar.example/choice',{originKind:'OBJECTIVE_SEARCH',score:8,objectiveIntent:'SUBSCRIPTION_PRICE',objectiveRelevance:8}),rows=orderProviderSeedAuthorityCandidates(target,[root,pricing]);
 assert.equal(rows[0].candidateId,pricing.candidateId);assert.equal(rows[0].routing.objectiveScore,8);
});

test('poor first search receives one justified objective refinement',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'progress-refinement-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));let searches=0;
 const exact='https://northstar.example/';
 const result=await runProviderSeedCampaign({directory:root,researchTarget:target,limits:{reads:1,searches:2},capabilities:{direct:true,tavily:true,decodo:false,browser:false,groq:false},createAdapters:async()=>({search:async()=>({results:++searches===1?[{url:'https://encyclopedia.example/northstar',title:'Northstar reference'}]:[{url:exact,title:'Northstar subscription plans'}]}),read:async({url})=>page(url,providerBody(url))})});
 assert.equal(searches,2);assert.equal(result.discovery.searches[1].kind,'OBJECTIVE_RESOURCE');assert.equal(result.providerAuthorityBinding.host,'northstar.example');
});

test('wrong or unresolved country observation leaves source-bound market action useful',()=>{
 const objective={kind:'PRICE',serviceId:'northstar',serviceName:'Northstar',providerHosts:['provider.example'],markets:['DE'],seeds:['https://provider.example/']},k=createKnowledge({objective,permissions:{DECODO:true}}),root='https://provider.example/',choice='https://provider.example/select-market';
 k.destinations=[];addDestination(k,{url:root,depth:0,needs:pricePropositions,grounding:{kind:'PROVIDER_ROOT',host:'provider.example'},discovery:{score:10,label:'Northstar'}});addDestination(k,{url:choice,depth:1,needs:pricePropositions,grounding:{kind:'PROVIDER_LINK',observation:'country-root'},discovery:{score:8,label:'Choose market',state:{group:'market-state',variant:'de',selected:false,observation:'country-root',bodySha256:'0'.repeat(64)}}});
 const body='<html><body>Choose your country</body></html>';k.observations.push({id:'country-root',kind:'PROVIDER',authority:'REVIEWED_PROVIDER',url:root,requestedUrl:root,context:context('DECODO','DE'),outcome:'OK',truncated:false,completeness:'COMPLETE',format:'WEB',contentType:'text/html',httpStatus:200,access:[{decision:'ALLOWED'}],body,sha256:digest(body)});k.attempts.push({id:'first-country',status:'COMPLETED',action:{kind:'ACQUIRE',url:root,context:context('DECODO','DE'),needs:['DE:TARGET_MARKET']}});
 const truth=evaluate(k);k.workingModel=buildWorkingModel(k,truth);const offered=availableActions(k,{DECODO(){}}),ranked=rankResearchActions({...k,truth,actions:offered.actions}),next=ranked.find(row=>offered.actions.find(action=>action.id===row.actionId)?.url===choice&&offered.actions.find(action=>action.id===row.actionId)?.context?.transport==='DECODO');
 assert.ok(next);assert.ok(next.factors.state>0);assert.equal(truth.eligibility.DE.result,'UNRESOLVED');
});

test('failed Direct candidate does not terminate while refined discovery can progress',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'progress-direct-failure-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));let searches=0,reads=0;const initial='https://northstar.example/',useful='https://northstar.example/company';
 const result=await runProviderSeedCampaign({directory:root,researchTarget:target,limits:{reads:2,searches:2},capabilities:{direct:true,tavily:true,decodo:false,browser:false,groq:false},createAdapters:async()=>({search:async()=>({results:++searches===1?[{url:initial,title:'Northstar official'}]:[{url:useful,title:'Northstar subscription company'}]}),read:async({url})=>{reads++;return url===initial?{url,requestedUrl:url,outcome:'UNRESOLVED',httpStatus:503,contentType:'text/html',truncated:false,accessDecisions:[{decision:'ALLOWED'}]}:page(url,providerBody(url));}})});
 assert.equal(searches,2);assert.equal(reads,2);assert.equal(result.providerAuthorityBinding.host,'northstar.example');
});

test('true exhaustion stops unresolved without repeating unavailable methods',async()=>{
 const objective={kind:'PRICE',serviceId:'northstar',serviceName:'Northstar',providerHosts:['provider.example'],markets:['DE'],seeds:[]},k=await runResearch({objective,permissions:{},capabilities:{}});
 assert.equal(k.stop.reason,'SEMANTIC_EXHAUSTION');assert.equal(k.usage.actions,0);assert.equal(k.gapStop.kind,'CAPABILITY');assert.equal(k.trace.filter(row=>row.event==='RESEARCH_DECISION').length,1);
});
