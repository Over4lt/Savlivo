import test from 'node:test';
import assert from 'node:assert/strict';
import {chooseInformationAction} from './information-routing.mjs';

const root='https://global.example/',country='https://de.provider.example/offers',hash='a'.repeat(64),sourceHash='b'.repeat(64);
const authority={hostname:'global.example',provider:'Provider',sourceType:'OFFICIAL_PROVIDER',sourceUrl:root,checkedAt:'2026-10-12T00:00:00.000Z'};
const observation={id:'v3-global',kind:'PROVIDER',url:root,sha256:hash,context:{transport:'DIRECT',networkGeography:'UNBOUND',representation:'PROVIDER_PAGE'}};
const truth={needs:[{id:'DE:PRICE_AMOUNT',proposition:'PRICE_AMOUNT',market:'DE',state:'UNRESOLVED'}],prices:{DE:{propositions:{}}}};
const bounds={managementReserveOnly:0,perServiceReads:4,perServiceSearches:2,perServiceAcquisitions:2,reads:80,searches:40,acquisitions:30,bytes:2*1024*1024,bytesPerPage:2*1024*1024};
const target=()=>({id:'provider-DE',service:'provider',serviceName:'Provider',market:'DE',researchObjective:'SERVICE_COVERAGE',smartResearch:{version:2},authorities:[authority],urls:[root],leads:[
 {url:root,title:'Provider',originKind:'SEED',frontierOrder:0},
 {url:country,title:'Germany',originKind:'CHILD',frontierOrder:1,navigationOnly:true,sourceBoundCandidate:true,continuationId:'nav-country',continuationKind:'ANCHOR',continuationScore:20,source:{observation:observation.id,bodySha256:hash,start:10,end:20,sha256:sourceHash},from:{url:root,bodyHash:hash,locator:{observation:observation.id,bodySha256:hash,start:10,end:20,sha256:sourceHash},mechanism:'V3_SOURCE_BOUND_CONTINUATION'},truthAuthority:'NONE',authoritative:false}
 ],reads:[{requestedUrl:root,url:root,outcome:'OK',bodyHash:hash,sourceIntegrity:{sha256:hash},accessDecisions:[{decision:'ALLOWED'}]}],queries:[],decisions:[],blockedOrigins:[],verified:[],capabilities:{direct:true,tavily:true,decodo:true,browser:false,groq:false},v3Observation:observation,v3Truth:truth,providerInterpretations:[{url:root,v3Observation:observation,v3Truth:truth}]});
const plan=t=>chooseInformationAction(t,{knowledge:{attempts:[{route:'DIRECT',url:root,completed:true}],blockedOrigins:[],unresolvedFields:['PRICE_AMOUNT']},urls:t.leads.map(row=>row.url),discoveryAllowed:true,discoveryQuery:'provider DE pricing',executionContext:{bounds,usage:{reads:1,searches:0,acquisitions:0,bytes:100}}});

test('source-bound continuation is reviewed before an unchanged provider root escalates to country transport',()=>{
 const t=target(),selected=plan(t);assert.equal(selected.route,'AUTHORITY_DISCOVERY');assert.equal(selected.reason,'SOURCE_BOUND_CONTINUATION_AVAILABLE');assert.equal(selected.url,country);assert.equal(selected.sourceBoundCandidates[0].truthAuthority,'NONE');
 const without=target();without.leads=without.leads.filter(row=>!row.sourceBoundCandidate);const fallback=plan(without);assert.equal(fallback.route,'DECODO');assert.equal(fallback.reason,'TARGET_MARKET_OBSERVATION_REQUIRED');assert.equal(fallback.url,root);
});

test('continuation loses routing eligibility when its retained parent hash is absent',()=>{
 const t=target();t.reads[0].bodyHash='c'.repeat(64);const selected=plan(t);assert.notEqual(selected.url,country);assert.equal(selected.sourceBoundCandidates.length,0);
});
