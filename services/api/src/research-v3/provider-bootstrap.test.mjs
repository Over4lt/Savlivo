import test from 'node:test';
import assert from 'node:assert/strict';
import {discoverCandidateHosts,researchInputFromCandidates,bootstrapBounds} from './provider-bootstrap.mjs';
import {runAutonomous} from './provider-bootstrap-runner.mjs';
import {runTarget,offlineCapabilities} from './runner.mjs';
import {interpretBillingFixture} from './billing-fixtures.test-support.mjs';
import {providerBound} from './model.mjs';

const service='Glacier Radio',market='GB';
const pageBody='<html><head><title>Membership</title></head><body><h1>Plans</h1>Personal consumer subscription price GBP 12 per month.</body></html>';
const search=urls=>async()=>({results:urls.map((url,index)=>({url,title:`Official provider ${index}`,content:'GBP 12 monthly',rank:index+1}))});
const discover=(urls,options={})=>discoverCandidateHosts({service,market,search:search(urls),...options});
const robots=host=>({url:`https://${host}/robots.txt`,transport:'DIRECT',status:404,contentType:'text/plain',body:''});
const page=url=>({url,transport:'DIRECT',body:pageBody});
const runOffline=async({input,capabilities})=>runTarget({input:{...input,semantic:{mode:'LEGACY_STATIC'}},capabilities,interpret:interpretBillingFixture});
const autonomous=async(urls,fixtures,overrides={})=>runAutonomous({service,market,env:{},bootstrap:{search:search(urls),read:async()=>{throw Error('bootstrap reader must not run');}},prepare:async input=>({capabilities:offlineCapabilities({...input,fixtures})}),run:runOffline,...overrides});

test('service and market yield bounded candidate hosts and exact research seeds',async()=>{
    const first='https://radio.example/plans',second='https://northstar.example/membership';
    const found=await discover([first,second]);
    assert.equal(found.status,'CANDIDATE_HOSTS_FOUND');
    assert.deepEqual(found.candidateHosts,['radio.example','northstar.example']);
    assert.deepEqual(found.seeds,[first,second]);
    assert.deepEqual(found.candidates.map(candidate=>candidate.searchRank),[1,2]);
    assert.deepEqual(found.candidates.map(candidate=>candidate.originKind),['SEARCH','SEARCH']);
    assert.deepEqual(found.searches.map(s=>s.query),['Glacier Radio official site','Glacier Radio GB official subscription']);
    assert(found.candidates.every(c=>c.truthAuthority==='NONE'));
    const input=researchInputFromCandidates(found);
    assert.deepEqual(input.objective.providerHosts,[]);assert.deepEqual(input.objective.candidateHosts,found.candidateHosts);
    assert.equal(input.provider,undefined);assert.equal(input.objective.marketEstablished,undefined);
});

test('autonomous runner starts normal V3 research without PROVIDER_BOUND or a bootstrap page read',async()=>{
    const url='https://radio.example/plans';let seen;
    const result=await autonomous([url],[robots('radio.example'),page(url)],{prepare:async input=>{seen=input;return {capabilities:offlineCapabilities({...input,fixtures:[robots('radio.example'),page(url)]})};}});
    assert.equal(result.bootstrap.status,'CANDIDATE_HOSTS_FOUND');
    assert.equal(seen.provider,undefined);assert.deepEqual(seen.objective.providerHosts,[]);
    assert.equal(result.knowledge.observations[0].kind,'CANDIDATE');
    assert.equal(result.knowledge.observations[0].authority,'UNREVIEWED_CANDIDATE');
    assert.equal(providerBound(result.knowledge.objective,url),false);
    assert.equal(result.result.truth.established,false);
    assert.equal(result.result.catalog.state,'CATALOG_UNRESOLVED');
    assert.equal(result.result.truth.prices.GB.propositions.PRICE_AMOUNT.state,'UNRESOLVED');
});

test('multiple discovered hosts are acquired independently with no authority transfer',async()=>{
    const first='https://first.example/plans',second='https://second.example/plans';
    const result=await autonomous([first,second],[robots('first.example'),page(first),robots('second.example'),page(second)]);
    assert.deepEqual(result.bootstrap.candidateHosts,['first.example','second.example']);
    assert.deepEqual(new Set(result.knowledge.observations.map(o=>o.url)),new Set([first,second]));
    assert(result.knowledge.observations.every(o=>o.kind==='CANDIDATE'&&o.authority==='UNREVIEWED_CANDIDATE'));
    assert.deepEqual(result.knowledge.objective.providerHosts,[]);
    assert.equal(result.result.truth.established,false);
    assert(result.knowledge.usage.acquisitions<=result.knowledge.bounds.acquisitions);
});

test('search title, snippet, rank and an apparent provider name cannot grant authority',async()=>{
    const url='https://comparison.example/review';
    const found=await discoverCandidateHosts({service,market,search:async()=>({results:[{url,title:'Official Glacier Radio',content:'Verified GBP 12 monthly',rank:1,provider:{reviewed:true}}]})});
    assert.deepEqual(found.candidateHosts,['comparison.example']);
    assert.equal(found.candidates[0].truthAuthority,'NONE');
    assert.equal(found.candidates[0].title,undefined);
    assert.deepEqual(researchInputFromCandidates(found).objective.providerHosts,[]);
    assert.equal(researchInputFromCandidates(found).provider,undefined);
});

test('zero usable candidates returns a bounded unresolved discovery without V3 execution',async()=>{
    let prepared=0,ran=0;
    const outcome=await runAutonomous({service,market,bootstrap:{search:search(['http://insecure.example/','https://127.0.0.1/','https://localhost/','https://safe.example/photo.png'])},prepare:async()=>{prepared++;},run:async()=>{ran++;},env:{}});
    assert.equal(outcome.bootstrap.status,'UNRESOLVED_CANDIDATE_DISCOVERY');
    assert.equal(outcome.bootstrap.reason,'NO_USABLE_CANDIDATE_HOSTS');
    assert.deepEqual(outcome.bootstrap.candidateHosts,[]);
    assert.equal(outcome.result,null);assert.equal(prepared,0);assert.equal(ran,0);
    assert.equal(outcome.bootstrap.searches.length,bootstrapBounds.searches);
});

test('search failure remains unresolved and exposes only a bounded failure code',async()=>{
    const outcome=await discoverCandidateHosts({service,market,search:async()=>{throw Error('private adapter detail');}});
    assert.equal(outcome.status,'UNRESOLVED_CANDIDATE_DISCOVERY');
    assert(outcome.searches.every(s=>s.failure==='SEARCH_UNAVAILABLE'));
    assert.equal(JSON.stringify(outcome).includes('private adapter detail'),false);
});

test('candidate selection has finite search, result, and host bounds',async()=>{
    let calls=0;
    const found=await discoverCandidateHosts({service,market,search:async()=>{calls++;return {results:Array.from({length:20},(_,i)=>({url:`https://host-${calls}-${i}.example/plans`}))};}});
    assert.equal(calls,2);assert.equal(found.searches.length,2);
    assert.equal(found.candidateHosts.length,12);assert.equal(found.candidates.length,12);
    assert.equal(found.limitReached,true);
    assert(found.searches.every(s=>s.count===8));
    await assert.rejects(()=>discoverCandidateHosts({service,market,search:search([]),bounds:{candidates:13}}),/INVALID_BOOTSTRAP_BOUND/);
});

test('unsafe and duplicate search leads are skipped without provider scoring',async()=>{
    const found=await discover(['https://one.example/start','https://one.example/other','https://second.example/plans','https://bad.example/?token=private','https://sibling.one.example/']);
    assert.deepEqual(found.candidateHosts,['one.example','second.example','sibling.one.example']);
    assert.deepEqual(found.seeds,['https://one.example/start','https://second.example/plans','https://sibling.one.example/']);
    assert(found.rejected.some(r=>r.reason==='SECRET_QUERY_REJECTED'));
});

test('candidate redirect cannot expand acquisition to a sibling host',async()=>{
    const url='https://radio.example/start';
    const result=await autonomous([url],[robots('radio.example'),{url,transport:'DIRECT',status:302,location:'https://sibling.radio.example/plans',body:''}]);
    assert.equal(result.knowledge.observations.length,0);
    assert.equal(result.knowledge.attempts[0].failure.code,'PROVIDER_BOUNDARY');
    assert.deepEqual(result.knowledge.objective.providerHosts,[]);
    assert.equal(result.result.truth.established,false);
});

test('candidate robots denial does not admit content or Truth',async()=>{
    const url='https://radio.example/plans';
    const result=await autonomous([url],[{url:'https://radio.example/robots.txt',transport:'DIRECT',body:'User-agent: *\nDisallow: /plans',contentType:'text/plain'}]);
    assert.equal(result.knowledge.observations[0]?.kind,'CANDIDATE');
    assert.notEqual(result.knowledge.observations[0]?.outcome,'OK');
    assert.equal(result.result.truth.established,false);
});

test('existing reviewed-provider objective still follows provider Truth rules',async()=>{
    const url='https://radio.example/plans';
    const input={objective:{kind:'PRICE',serviceId:'glacier-radio',serviceName:service,providerHosts:['radio.example'],markets:[market],seeds:[url]},provider:{reviewed:true,serviceId:'glacier-radio',hosts:['radio.example']},permissions:{DIRECT:true},bounds:{actions:1,acquisitions:1,searches:0,modelCalls:0},semantic:{mode:'LEGACY_STATIC'}};
    const reviewedPage={url,transport:'DIRECT',body:`<html><head><title>${service}</title></head><body><h1>${service}</h1>Personal consumer subscription price GBP 12 per month.</body></html>`};
    const {knowledge,result}=await runTarget({input,capabilities:offlineCapabilities({...input,fixtures:[robots('radio.example'),reviewedPage]}),interpret:interpretBillingFixture});
    assert.equal(knowledge.observations[0].kind,'PROVIDER');
    assert.equal(providerBound(knowledge.objective,url),true);
    assert.equal(result.truth.service.SERVICE_IDENTITY.state,'ESTABLISHED');
});
