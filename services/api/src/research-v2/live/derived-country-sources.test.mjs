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
import {researchLinkPriorityTarget} from './retained-render-source.mjs';
import {runOpenWebResearch} from './open-web-discovery.mjs';

const fixture=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../research-v3/fixtures/max/de-homepage.html.gz');
const de={id:'11111111-1111-4111-8111-111111111111',serviceId:'max',url:'https://www.hbomax.com/de/de',kind:'DIRECT_SOURCE',marketScope:'MARKET_SPECIFIC',marketCode:'DE',enabled:true,truthAuthority:'NONE',lastResult:'VERIFIED'};
const global={...de,id:'22222222-2222-4222-8222-222222222222',url:'https://www.hbomax.com/',marketScope:'GLOBAL',marketCode:null,lastResult:'ACQUISITION_FAILED'};
const specific={...de,id:'33333333-3333-4333-8333-333333333333',url:'https://www.hbomax.com/es/es',marketCode:'ES'};
const target=(links,derived)=>researchLinkPriorityTarget({id:'price-research:max:ES',service:'max',serviceName:'Max',market:'ES',operationsObjective:'PRICE_RESEARCH',verified:[],researchLinks:links,researchLinkOutcomes:[],derivedCountryCandidates:derived,providerSourceIdentityHosts:['www.hbomax.com'],decisions:[],acquisitionOutcomes:[],capabilities:{direct:false,decodo:true,browser:false,tavily:false}}, {direct:false,decodo:true,browser:false,tavily:false});

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
