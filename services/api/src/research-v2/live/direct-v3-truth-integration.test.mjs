import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {digest} from '../../research-v3/model.mjs';
import {authorityBinding} from '../../research-v3/discovery-authority.mjs';
import {adaptV2CurrentSource} from '../../research-v3/v2-current-source-adapter.mjs';
import {evaluate} from '../../research-v3/truth.mjs';
import {interpretDirectProvider,evaluateDirectProviderTruth} from './direct-provider-evidence.mjs';
import {TargetResearchFailure} from './target-research-failure.mjs';
import {runOpenWebResearch} from './open-web-discovery.mjs';
import {planResearch} from './research-planner.mjs';

const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'direct-v3-truth-')));after(()=>fs.rmSync(root,{recursive:true,force:true}));
const service='aurora',serviceName='Aurora',market='NO',host='provider.example',url=`https://${host}/no/membership`;
const authority={hostname:host,provider:serviceName,sourceType:'OFFICIAL_PROVIDER',sourceUrl:url,checkedAt:'2026-10-09T00:00:00.000Z'};
const target=(extra={})=>({id:'aurora-no',service,serviceName,market,researchObjective:'SERVICE_COVERAGE',smartResearch:{version:2},urls:[url],authorities:[authority],gaps:['amount'],reads:[],queries:[],decisions:[],capabilities:{direct:true,tavily:false,decodo:true,browser:false,groq:false},...extra});
const product=(id='gold',extra={})=>({product:{id,name:'Gold',productType:'PRODUCT_TYPE_MEMBERSHIP',consumer:true,subscription:{length:1,unit:'months'}},totalAmount:{amount:'6399',currencyCode:'NOK'},taxAmount:{amount:'1600',currencyCode:'NOK'},totalAmountWithTaxes:{amount:'7999',currencyCode:'NOK'},incentive:{name:'BAU Trial',freeTime:{length:7,unit:'days'}},...extra});
const html=(products=[product()])=>`<html lang="nb-NO"><head><title>${serviceName}</title></head><body><script>window.catalog=${JSON.stringify({currenciesSubunit:{NOK:2},offeredProducts:{months:products}})};</script></body></html>`;
const legacy=()=>({priceEvidenceNeedsByTarget:{},verified:[],usable:false,monetaryFacts:6,blockers:['STRUCTURAL_OWNERSHIP_WEAK','PROMOTION_QUALIFIER_UNRESOLVED','CONFLICTING_MONTHLY_AMOUNTS']});
const noOp=async()=>{};
function fixture(body=html(),extra={}){
 const directory=fs.mkdtempSync(path.join(root,'case-')),hash=digest(body);fs.mkdirSync(path.join(directory,'bodies'));fs.writeFileSync(path.join(directory,'bodies',hash+'.txt'),body);
 const page={url,requestedUrl:url,outcome:'OK',httpStatus:200,contentType:'text/html; charset=utf-8',truncated:false,bodyHash:hash,bodyFile:'bodies/'+hash+'.txt',sourceIntegrity:{sha256:hash},accessDecisions:[{decision:'ALLOWED'}],authority:{status:'CONFIGURED_REVIEWED',...authority},...extra};
 return {directory,target:target(),page,body};
}
async function direct(f){return interpretDirectProvider({...f,interpret:noOp,verify:async()=>legacy()});}

test('valid Direct source reaches existing V3 adapter and Truth when legacy verifies zero rows',async()=>{
 const f=fixture(),result=await direct(f),price=result.v3Truth.prices.NO;
 assert.equal(result.verified.length,0);assert.deepEqual(result.blockers,legacy().blockers);
 assert.equal(result.v3Observation.kind,'PROVIDER');assert(result.v3Observation.candidateCount>0);assert(result.v3Observation.nativeStructuredFacts>0);assert.equal(result.v3Catalog.state,'CATALOG_UNRESOLVED');assert.equal(result.v3Catalog.offeringState,'OFFERING_FOUND');assert.equal(result.v3Catalog.scope,'UNRESOLVED');
 assert.equal(price.propositions.SERVICE_IDENTITY.state,'ESTABLISHED');assert.equal(price.propositions.PRICE_AMOUNT.value,79.99);assert.equal(price.propositions.CURRENCY.value,'NOK');assert.equal(price.propositions.MONTHLY_SUBSCRIPTION.value,true);assert.equal(price.propositions.CONSUMER_SUBSCRIPTION.value,true);
 assert.equal(price.propositions.PRICE_AMOUNT.contradictions.length,0,'gross and pre-tax remain distinct monetary roles');
 assert.equal(price.propositions.TARGET_MARKET.state,'UNRESOLVED');assert.deepEqual(result.v3Truth.needs,[{id:'NO:TARGET_MARKET',proposition:'TARGET_MARKET',market:'NO',offerId:'gold',state:'UNRESOLVED'}]);
});

test('production Direct consume path preserves V3 Truth and exposes existing semantic market route',async t=>{
 const directory=fs.mkdtempSync(path.join(root,'open-web-'));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));const body=html(),hash=digest(body),t0=target();
 const state=await runOpenWebResearch({directory,targets:[t0],maxActions:1,search:async()=>({results:[]}),read:async()=>({url,requestedUrl:url,outcome:'OK',httpStatus:200,contentType:'text/html',truncated:false,body,sourceIntegrity:{sha256:hash},accessDecisions:[{decision:'ALLOWED'}],authority:{status:'CONFIGURED_REVIEWED',...authority}}),classify:async()=>({eligible:true,url,authority:{validated:true,hostname:host}}),consumeProvider:args=>interpretDirectProvider({...args,interpret:noOp,verify:async()=>legacy()})});
 const current=state.targets[0];assert.equal(current.verified.length,0);assert.equal(current.v3Truth.prices.NO.propositions.PRICE_AMOUNT.value,79.99);assert.equal(current.v3Catalog.state,'CATALOG_UNRESOLVED');assert.equal(current.providerInterpretations[0].v3Truth.needs[0].proposition,'TARGET_MARKET');assert.equal(current.providerInterpretations[0].v3Catalog.state,'CATALOG_UNRESOLVED');
 assert.equal(current.providerRoutingProgress[0].meaning,'ROUTING_ONLY_NOT_EVIDENCE');assert.equal(current.providerRoutingProgress[0].outcome,'PROGRESS');assert(current.providerRoutingProgress[0].categories.includes('OFFER_IDENTITY'));
 assert.equal(current.marketProof.meaning,'V3_TRUTH_NEEDS_PLANNING_ONLY');assert.equal(current.marketProof.objectives[0].status,'MARKET_NOT_VERIFIED');
 const plan=planResearch(current);assert.equal(plan.route,'DECODO');assert.equal(plan.reason,'TARGET_MARKET_OBSERVATION_REQUIRED');
 current.retainedPriceReview={sourceBound:true,confidence:'HIGH',market:'NO',objective:'SERVICE_COVERAGE',amount:'79.99',currency:'NOK'};const withLegacy=planResearch(current);assert.equal(withLegacy.route,'DECODO','legacy V2 sufficiency cannot veto a V3 market need');assert.equal(withLegacy.reason,'TARGET_MARKET_OBSERVATION_REQUIRED');
});

test('Direct remains market-unbound despite localized path, language, requested market and currency',async()=>{
 const result=await direct(fixture());assert.deepEqual(result.v3Observation.context,{transport:'DIRECT',networkGeography:'UNBOUND',representation:'PROVIDER_PAGE'});assert.equal(result.v3Truth.prices.NO.propositions.TARGET_MARKET.state,'UNRESOLVED');
});

test('valid existing country receipt establishes market through unchanged V3 semantics',()=>{
 const body=html(),sha256=digest(body),objective={kind:'PRICE',serviceId:service,serviceName,providerHosts:[host],markets:[market],seeds:[url]},input={contractVersion:1,observationId:'country-follow-up',target:{service,serviceName,market},page:{url,requestedUrl:url,outcome:'OK',httpStatus:200,contentType:'text/html',bodyHash:sha256,sourceIntegrity:{sha256},rawSource:{text:body},accessDecisions:[{decision:'ALLOWED'}]},providerAuthority:{status:'AUTHORITATIVE_PROVIDER',binding:authorityBinding(objective,url)},acquisition:{route:'DECODO',countryReceipt:{contractVersion:1,kind:'V3_VERIFIED_COUNTRY_RECEIPT',transport:'DECODO',verification:'BRACKET_VERIFIED',requestedCountry:market,verifiedCountry:market}}};
 const observation=adaptV2CurrentSource(input,objective),truth=evaluate({objective,observations:[observation]});assert.equal(truth.prices.NO.propositions.TARGET_MARKET.value,'NO');assert.equal(truth.established,true);
});

test('Direct V3 boundary fails closed for incomplete source and unsafe price semantics',async()=>{
 const incomplete=fixture(html(),{truncated:true});assert.throws(()=>evaluateDirectProviderTruth({target:incomplete.target,retained:{...incomplete.page,rawSource:{text:incomplete.body}}}),/DIRECT_PROVIDER_SOURCE_INCOMPLETE/);
 for(const [name,body,check] of [
  ['trial-only',html([{product:{id:'trial',name:'Trial',productType:'SUBSCRIPTION',consumer:true,subscription:{length:1,unit:'months'}},trialPrice:{amount:'100',currencyCode:'NOK'}}]),truth=>truth.prices.NO.propositions.PRICE_AMOUNT.state==='UNRESOLVED'],
  ['discount-only',html([{product:{id:'discount',name:'Discount',productType:'SUBSCRIPTION',consumer:true,subscription:{length:1,unit:'months'}},discountAmount:{amount:'100',currencyCode:'NOK'}}]),truth=>truth.prices.NO.propositions.PRICE_AMOUNT.state==='UNRESOLVED'],
  ['annual-equivalent',html([{product:{id:'annual',name:'Annual',productType:'SUBSCRIPTION',consumer:true,subscription:{length:1,unit:'years'}},totalAmountWithTaxes:{amount:'95988',currencyCode:'NOK'},monthlyEquivalent:{amount:'7999',currencyCode:'NOK'}}]),truth=>truth.prices.NO.propositions.MONTHLY_SUBSCRIPTION.state==='UNRESOLVED'],
  ['addon',html([{product:{id:'addon',name:'Addon',productType:'ADDON',consumer:true,subscription:{length:1,unit:'months'}},totalAmountWithTaxes:{amount:'7999',currencyCode:'NOK'}}]),truth=>truth.prices.NO.propositions.PRICE_AMOUNT.state==='UNRESOLVED'],
  ['sponsorship',html([{product:{id:'sponsor',name:'Sponsor',productType:'SPONSORSHIP',consumer:true,subscription:{length:1,unit:'months'}},totalAmountWithTaxes:{amount:'7999',currencyCode:'NOK'}}]),truth=>truth.prices.NO.propositions.PRICE_AMOUNT.state==='UNRESOLVED'],
  ['unrelated-plan',html([{product:{id:'study',name:'Study Plan',productType:'COURSE',consumer:true,subscription:{length:1,unit:'months'}},totalAmountWithTaxes:{amount:'7999',currencyCode:'NOK'}}]),truth=>truth.prices.NO.propositions.PRICE_AMOUNT.state==='UNRESOLVED'],
  ['same-role-conflict',html([product('same'),product('same',{totalAmountWithTaxes:{amount:'8999',currencyCode:'NOK'}})]),truth=>truth.prices.NO.propositions.PRICE_AMOUNT.state==='CONTRADICTED']
 ]){const result=await direct(fixture(body));assert.equal(check(result.v3Truth),true,name);}
});

test('exact-host editorial evidence for another service cannot create V3 price Truth',async()=>{
 const body=html().replace(`<title>${serviceName}</title>`,'<title>Other Company</title>'),result=await direct(fixture(body));assert.equal(result.v3Truth.prices.NO.propositions.SERVICE_IDENTITY.state,'UNRESOLVED');assert.equal(result.v3Truth.prices.NO.propositions.PRICE_AMOUNT.state,'UNRESOLVED');
});

test('Direct validation still rejects unresolved authority, sibling host, tampering and denied access',async()=>{
 for(const [name,change,pattern] of [
  ['authority',f=>{f.page.authority.status='UNKNOWN';},/DIRECT_PROVIDER_AUTHORITY_REQUIRED/],
  ['sibling',f=>{f.page.url='https://support.provider.example/no/membership';},/DIRECT_PROVIDER_IDENTITY_MISMATCH/],
  ['tamper',f=>{f.page.bodyHash='0'.repeat(64);},/DIRECT_PROVIDER_HASH_MISMATCH/],
  ['denied',f=>{f.page.accessDecisions=[{decision:'DENIED'}];},/DIRECT_PROVIDER_POLICY_UNPROVEN/]
 ]){const f=fixture();change(f);await assert.rejects(()=>direct(f),pattern,name);}
 await assert.rejects(()=>direct(fixture(html(),{outcome:'ACCESS_CONTROL_STOP',httpStatus:null,authority:{status:'UNKNOWN'}})),error=>error instanceof TargetResearchFailure&&error.message==='DIRECT_PROVIDER_AUTHORITY_REQUIRED');
});
