import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {gunzipSync} from 'node:zlib';
import {digest} from '../../research-v3/model.mjs';
import {derivedCountrySourceCandidates} from './derived-country-sources.mjs';
import {nextResearchLink,prepareResearchLinkPlan} from './research-link-routing.mjs';
import {executableAction} from './execution-capabilities.mjs';
import {researchLinkPriorityTarget} from './retained-render-source.mjs';
import {runOpenWebResearch} from './open-web-discovery.mjs';

const fixture=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../research-v3/fixtures/max/de-homepage.html.gz');
const de={id:'11111111-1111-4111-8111-111111111111',serviceId:'max',url:'https://www.hbomax.com/de/de',kind:'DIRECT_SOURCE',marketScope:'MARKET_SPECIFIC',marketCode:'DE',enabled:true,truthAuthority:'NONE',lastResult:'VERIFIED'};
const us={...de,id:'44444444-4444-4444-8444-444444444444',url:'https://help.hbomax.com/us/Answer/Detail/000002547?pubDate=20260926',marketCode:'US'};
const gbUrl='https://help.hbomax.com/gb/Answer/Detail/000002547';
const global={...de,id:'22222222-2222-4222-8222-222222222222',url:'https://www.hbomax.com/',marketScope:'GLOBAL',marketCode:null,lastResult:'ACQUISITION_FAILED'};
const specific={...de,id:'33333333-3333-4333-8333-333333333333',url:'https://www.hbomax.com/es/es',marketCode:'ES'};
const target=(links,derived)=>researchLinkPriorityTarget({id:'price-research:max:ES',service:'max',serviceName:'Max',market:'ES',operationsObjective:'PRICE_RESEARCH',verified:[],researchLinks:links,researchLinkOutcomes:[],derivedCountryCandidates:derived,providerSourceIdentityHosts:['www.hbomax.com'],decisions:[],acquisitionOutcomes:[],capabilities:{direct:false,decodo:true,browser:false,tavily:false}}, {direct:false,decodo:true,browser:false,tavily:false});
const gbTarget=(links,derived)=>({...target(links,derived),id:'price-research:max:GB',market:'GB'});

test('retained GB pricing article is a bounded Max-only candidate ahead of the Global homepage',()=>{
 const rows=derivedCountrySourceCandidates({service:'max',market:'GB',patternLinks:[us],researchLinks:[global]});
 assert.deepEqual(rows.map(row=>row.url),[gbUrl]);
 assert.equal(rows[0].sourceLinkId,us.id);
 assert.equal(rows[0].providerRouteEvidenceSha256,'1f5bf27614ea6257a61dc23aaf76d902183688e65b42cb3a3b20d75fe5aa9983');
 assert.equal(nextResearchLink(gbTarget([global],rows)).url,gbUrl);
 assert.equal(nextResearchLink(gbTarget([global],rows)).route,'DECODO');
 assert.deepEqual(derivedCountrySourceCandidates({service:'max',market:'GB'}).map(row=>row.url),[gbUrl]);
 assert.deepEqual(derivedCountrySourceCandidates({service:'netflix',market:'GB',patternLinks:[us]}),[]);
 assert.deepEqual(derivedCountrySourceCandidates({service:'max',market:'IE',patternLinks:[us]}),[]);
 assert.deepEqual(derivedCountrySourceCandidates({service:'max',market:'GB',patternLinks:[us],attemptedUrls:[gbUrl]}),[]);
});

test('exact GB Research Link outranks the inferred article without duplicate acquisition',()=>{
 const exact={...us,id:'55555555-5555-4555-8555-555555555555',url:gbUrl,marketCode:'GB'};
 const rows=derivedCountrySourceCandidates({service:'max',market:'GB',patternLinks:[us],researchLinks:[exact,global]});
 assert.deepEqual(rows,[]);
 const current=gbTarget([exact,global],rows);
 assert.equal(nextResearchLink(current).url,gbUrl);
 current.researchLinkOutcomes.push({id:exact.id});
 assert.equal(nextResearchLink(current).url,global.url);
});

test('same-job Max retry skips a previously country-bound unpriced provider page',()=>{
 const rows=derivedCountrySourceCandidates({service:'max',market:'GB'}),current=gbTarget([],rows),action=nextResearchLink(current),context={available:{decodo:true,direct:false,browser:false},bounds:{acquisitions:2,bytes:2*1024*1024,bytesPerPage:2*1024*1024,perServiceAcquisitions:2},usage:{acquisitions:0,bytes:0}};
 assert.equal(executableAction(current,action,context).executable,true);
 current.priorNoProgressProviderUrls=[gbUrl];
 assert.equal(executableAction(current,action,context).reason,'EQUIVALENT_RESOURCE_ALREADY_ATTEMPTED');
 assert.equal(executableAction(current,{route:'DECODO',reason:'TARGET_MARKET_OBSERVATION_REQUIRED',url:gbUrl},context).reason,'EQUIVALENT_RESOURCE_ALREADY_ATTEMPTED');
 assert.equal(prepareResearchLinkPlan(current,context),null);
 assert.deepEqual(current.derivedCountrySourceOutcomes.map(row=>row.url),[gbUrl]);
});

test('same-job no-progress memory blocks another service only for price research',()=>{
 const url='https://help.example.com/de/plans',current={...gbTarget([],[]),service:'example',market:'DE',priorNoProgressProviderUrls:[url],providerSourceIdentityHosts:['help.example.com'],capabilities:{direct:false,decodo:true}},action={route:'DECODO',reason:'PRICE_RESEARCH_VERIFICATION_REQUIRED',url},context={available:{decodo:true},bounds:{acquisitions:2,bytes:2*1024*1024,bytesPerPage:2*1024*1024,perServiceAcquisitions:2},usage:{acquisitions:0,bytes:0}};
 assert.equal(executableAction(current,action,context).reason,'EQUIVALENT_RESOURCE_ALREADY_ATTEMPTED');
 assert.equal(executableAction({...current,operationsObjective:'SERVICE_COVERAGE'},action,context).reason!=='EQUIVALENT_RESOURCE_ALREADY_ATTEMPTED',true);
});

test('offline Max retry does not issue another Decodo request for the same unpriced URL',async t=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'max-unpriced-retry-'));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
 const rows=derivedCountrySourceCandidates({service:'max',market:'GB'}),current={...gbTarget([],rows),researchObjective:'SERVICE_COVERAGE',smartResearch:{version:2},urls:[],leads:[],authorities:[],gaps:['amount'],reads:[],queries:[],blockedOrigins:[],priorNoProgressProviderUrls:[gbUrl]},requested=[];
 const state=await runOpenWebResearch({directory,targets:[current],maxActions:1,search:async()=>{throw Error('PAID_DISCOVERY_NOT_ALLOWED');},read:async()=>{throw Error('DIRECT_NOT_ALLOWED');},acquire:async({candidate})=>{requested.push(candidate.url);throw Error('DUPLICATE_DECODO_REQUEST');}});
 assert.deepEqual(requested,[]);
 assert.equal(state.targets[0].derivedCountrySourceOutcomes[0].reason,'EQUIVALENT_RESOURCE_ALREADY_ATTEMPTED');
});

test('only a proven response body limit is carried as terminal Max acquisition routing memory',async t=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'max-body-limit-'));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
 const current={...gbTarget([global],[]),researchObjective:'SERVICE_COVERAGE',smartResearch:{version:2},urls:[],leads:[],authorities:[],gaps:['amount'],reads:[],queries:[],blockedOrigins:[]};
 const state=await runOpenWebResearch({directory,targets:[current],maxActions:1,search:async()=>assert.fail('search'),read:async()=>assert.fail('read'),acquire:async()=>({classification:'ACQUISITION_FAILED',sourceClassification:{status:'UNKNOWN_SOURCE',reason:'SOURCE_NOT_RETAINED'},policy:[{attempts:[{failure:{code:'RESPONSE_TOO_LARGE'}}]}],verified:[],acquisitionBytes:0})});
 assert.equal(state.targets[0].acquisitionOutcomes[0].responseTooLarge,true);
});

test('provider-authored DE route map supports bounded ES Spanish and English candidates',()=>{
 const body=gunzipSync(fs.readFileSync(fixture)).toString('utf8');
 assert.equal(digest(body),'f6a618d5ab14ea3ce06b599756f707eccb12855b5430d03fc6625a4f5caf00df');
 for(const route of ['es/es','es/en'])assert(body.includes(`"${route}":{"url":"/${route}"`));
 assert(body.includes('<link rel="canonical" href="https://www.hbomax.com/de/de"'));
 const rows=derivedCountrySourceCandidates({service:'max',market:'ES',patternLinks:[de],researchLinks:[global]});
 assert.deepEqual(rows.map(row=>row.url),['https://www.hbomax.com/es/es','https://www.hbomax.com/es/en']);
 assert(rows.every(row=>row.origin==='SAME_SERVICE_PROVIDER_ROUTE'&&row.sourceLinkId===de.id));
 assert.equal(nextResearchLink(target([global],rows)).url,rows[0].url);
});

test('exact ES link outranks inferred routes; repeated and configured URLs are deduplicated',()=>{
 const rows=derivedCountrySourceCandidates({service:'max',market:'ES',patternLinks:[de],researchLinks:[specific,global]});
 assert.deepEqual(rows.map(row=>row.url),['https://www.hbomax.com/es/en']);
 const current=target([specific,global],rows);
 assert.equal(nextResearchLink(current).url,specific.url);
 current.researchLinkOutcomes.push({id:specific.id});
 assert.equal(nextResearchLink(current).url,rows[0].url);
 current.acquisitionOutcomes.push({url:rows[0].url,classification:'ACQUISITION_FAILED'});
 assert.equal(nextResearchLink(current).url,global.url);
 assert.deepEqual(derivedCountrySourceCandidates({service:'max',market:'ES',patternLinks:[de],attemptedUrls:['https://www.hbomax.com/es/es']} ).map(row=>row.url),['https://www.hbomax.com/es/en']);
});

test('inference rejects unrelated services, unverified links, unsupported language and arbitrary URL replacement',()=>{
 const derive=(service,link,market='ES')=>derivedCountrySourceCandidates({service,market,patternLinks:[link]});
 assert.deepEqual(derive('netflix',de),[]);
 for(const invalid of [{...de,serviceId:'netflix'},{...de,lastResult:'ACQUISITION_FAILED'},{...de,url:'https://www.hbomax.com/de/fr'},{...de,url:'https://www.hbomax.com/help/de/de'},{...de,url:'https://www.hbomax.com/de/de?market=DE'},{...de,url:'https://other.example/de/de'}]){
  const rows=derive('max',invalid);assert.deepEqual(rows.map(row=>row.url),['https://www.hbomax.com/es/es','https://www.hbomax.com/es/en']);assert(rows.every(row=>row.sourceLinkId===null&&row.origin==='CHECKED_IN_PROVIDER_ROUTE_MAP'));
 }
 assert.deepEqual(derive('max',de,'XX'),[]);
});

test('provider-authored route map supplies Max ES candidates even without any Admin Research Link',()=>{
 const rows=derivedCountrySourceCandidates({service:'max',market:'ES'});
 assert.deepEqual(rows.map(row=>row.url),['https://www.hbomax.com/es/es','https://www.hbomax.com/es/en']);
 assert(rows.every(row=>row.sourceLinkId===null&&row.origin==='CHECKED_IN_PROVIDER_ROUTE_MAP'));
 assert.equal(nextResearchLink(target([],rows)).url,rows[0].url);
});

test('derived route is a Decodo candidate only, preserves budgets and stops after its own attempt',()=>{
 const rows=derivedCountrySourceCandidates({service:'max',market:'ES',patternLinks:[de]});
 const current=target([global],rows);
 assert.deepEqual(current.knownCommercialUrls,rows.map(row=>row.url));
 const first=prepareResearchLinkPlan(current,{available:{decodo:true,direct:false,browser:false},bounds:{acquisitions:2,bytes:2*1024*1024,bytesPerPage:2*1024*1024,perServiceAcquisitions:2},usage:{acquisitions:0,bytes:0}});
 assert.equal(first.route,'DECODO');assert.equal(first.researchLinkId,undefined);assert.equal(first.truthAuthority,'NONE');
 current.acquisitionOutcomes.push({url:first.url,classification:'CONTENT_NOT_COMMERCIAL'});
 assert.equal(nextResearchLink(current).url,rows[1].url);
 current.acquisitionOutcomes.push({url:rows[1].url,classification:'CONTENT_NOT_COMMERCIAL'});
 assert.equal(nextResearchLink(current).url,global.url);
 assert.equal(current.acquisitionOutcomes.length,2);
});

test('offline Max ES campaign dispatches a derived Decodo URL before the Global homepage',async t=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'max-derived-route-'));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
 const rows=derivedCountrySourceCandidates({service:'max',market:'ES',patternLinks:[de]}),current={...target([global],rows),researchObjective:'SERVICE_COVERAGE',smartResearch:{version:2},urls:[],leads:[],authorities:[],gaps:['plan','amount','currency','cadence','priceRole','ownership','market'],reads:[],queries:[],blockedOrigins:[],persistedVerifiedCount:0};
 const requested=[];
 const state=await runOpenWebResearch({directory,targets:[current],maxActions:1,search:async()=>{throw Error('PAID_DISCOVERY_NOT_ALLOWED');},read:async()=>{throw Error('DIRECT_NOT_ALLOWED');},acquire:async({candidate,target:selected})=>{requested.push([candidate.url,selected.market]);return {classification:'CONTENT_NOT_COMMERCIAL',sourceClassification:{status:'PROVIDER_SOURCE'},verified:[]};}});
 assert.deepEqual(requested,[['https://www.hbomax.com/es/es','ES']]);
 assert.equal(state.targets[0].acquisitionOutcomes[0].researchLinkId,null);
 assert.equal(state.targets[0].researchLinkOutcomes.length,0);
});
