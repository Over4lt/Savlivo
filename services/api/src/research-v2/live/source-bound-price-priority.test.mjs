import test from 'node:test';
import assert from 'node:assert/strict';
import {sourceBoundPriceRoutingBonus} from './source-bound-price-priority.mjs';
import {rankPlannerLeads} from './open-web-discovery.mjs';
import {planResearch} from './research-planner.mjs';

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
 return {id:`price-research:max:${market}`,service:'max',serviceName:'Max',market,operationsObjective:'PRICE_RESEARCH',researchObjective:'SERVICE_COVERAGE',smartResearch:{version:2},leads:[lead(row.change,'Change an HBO Max-billed subscription'),lead(row.plans,'All about HBO Max plans')],sourceBoundContinuationParents:[{id:row.observation,sha256:row.hash,accepted:true,context:{transport:'DECODO',networkGeography:market}}],acquisitionOutcomes:[{sourceClassification:{status:'PROVIDER_SOURCE',sourceHash:row.hash},countryV3Evaluation:{status:'EVALUATED',receiptStatus:'HASH_VERIFIED',geoClass:'G1'}}],successfulResearchLinkHints:[hint],authorities:[],reads:[],queries:[],decisions:[],verified:[],blockedOrigins:[],gaps:['amount'],capabilities:{direct:true,decodo:true,tavily:false,browser:false}};
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
