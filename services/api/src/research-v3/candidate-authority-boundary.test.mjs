import test from 'node:test';
import assert from 'node:assert/strict';
import {runTarget,offlineCapabilities} from './runner.mjs';
import {createKnowledge,addDestination,providerBound,digest,checkpoint,restore,pricePropositions} from './model.mjs';
import {evaluate} from './truth.mjs';
import {interpretBillingFixture} from './billing-fixtures.test-support.mjs';

const serviceId='fixture',serviceName='Fixture',market='US';
const body='<html><head><title>Fixture membership</title></head><body><h1>Fixture</h1>Personal consumer subscription price USD 12 per month.</body></html>';
const robots=host=>({url:`https://${host}/robots.txt`,transport:'DIRECT',status:404,contentType:'text/plain',body:''});
const page=(url,html=body)=>({url,transport:'DIRECT',body:html});
const input=({candidateHosts=[],providerHosts=[],seeds=[],fixtures=[],permissions={DIRECT:true},bounds={actions:2,acquisitions:2,searches:0,modelCalls:0},discoveries=[]}={})=>({
    objective:{kind:'PRICE',serviceId,serviceName,providerHosts,...(candidateHosts.length?{candidateHosts}:{}),markets:[market],seeds},
    ...(providerHosts.length?{provider:{reviewed:true,serviceId,hosts:providerHosts}}:{}),
    permissions,bounds,fixtures,discoveries,
});
const execute=fixture=>runTarget({input:fixture,capabilities:offlineCapabilities(fixture),interpret:interpretBillingFixture});

test('candidate-only exact host can be acquired while authority and Truth remain unresolved',async()=>{
    const url='https://lead.example/plans',fixture=input({candidateHosts:['lead.example'],seeds:[url],fixtures:[robots('lead.example'),page(url)],bounds:{actions:1,acquisitions:1,searches:0,modelCalls:0}});
    const {knowledge,result}=await execute(fixture),o=knowledge.observations[0];
    assert.equal(o.kind,'CANDIDATE');assert.equal(o.authority,'UNREVIEWED_CANDIDATE');assert.equal(o.url,url);
    assert.equal(o.context.representation,'CANDIDATE_PAGE');assert.equal(o.sha256,digest(o.body));assert.equal(o.outcome,'OK');
    assert.equal(providerBound(knowledge.objective,url),false);assert.deepEqual(knowledge.objective.providerHosts,[]);
    assert.equal(result.truth.service.SERVICE_IDENTITY.state,'UNRESOLVED');
    assert.equal(evaluate({...knowledge,observations:[{...o,kind:'PROVIDER'}]}).service.SERVICE_IDENTITY.state,'UNRESOLVED');
    for(const proposition of ['PRICE_AMOUNT','CURRENCY','MONTHLY_SUBSCRIPTION','TARGET_MARKET'])assert.equal(result.truth.prices.US.propositions[proposition].state,'UNRESOLVED');
    assert.equal(result.catalog.state,'CATALOG_UNRESOLVED');
});

test('a plausible candidate needs no matching title, heading, site name, or schema for acquisition',async()=>{
    const url='https://lead.example/membership';
    const fixture=input({candidateHosts:['lead.example'],seeds:[url],fixtures:[robots('lead.example'),page(url,'<html><body><p>Opaque membership page</p></body></html>')],bounds:{actions:1,acquisitions:1,searches:0,modelCalls:0}});
    const {knowledge}=await execute(fixture);
    assert.equal(knowledge.observations[0].kind,'CANDIDATE');assert.equal(knowledge.observations[0].outcome,'OK');
});

test('candidate-only objective can bootstrap its bounded root without a seed',async()=>{
    const root='https://lead.example/';
    const fixture=input({candidateHosts:['lead.example'],fixtures:[robots('lead.example'),page(root)],bounds:{actions:1,acquisitions:1,searches:0,modelCalls:0}});
    const {knowledge}=await execute(fixture);
    assert.equal(knowledge.destinations[0].grounding.kind,'CANDIDATE_ROOT');
    assert.equal(knowledge.observations[0].kind,'CANDIDATE');
});

test('reviewed provider acquisition retains existing Truth authority',async()=>{
    const url='https://provider.example/plans',fixture=input({providerHosts:['provider.example'],seeds:[url],fixtures:[robots('provider.example'),page(url)],bounds:{actions:1,acquisitions:1,searches:0,modelCalls:0}});
    const {knowledge,result}=await execute(fixture);
    assert.equal(knowledge.observations[0].kind,'PROVIDER');assert.equal(knowledge.observations[0].context.representation,'PROVIDER_PAGE');
    assert.equal(providerBound(knowledge.objective,url),true);assert.equal(result.truth.service.SERVICE_IDENTITY.state,'ESTABLISHED');
});

test('candidate and reviewed provider may coexist without candidate authority leakage',async()=>{
    const lead='https://lead.example/plans',official='https://provider.example/plans';
    const fixture=input({candidateHosts:['lead.example'],providerHosts:['provider.example'],seeds:[lead,official],fixtures:[robots('lead.example'),page(lead),robots('provider.example'),page(official)]});
    const {knowledge,result}=await execute(fixture);
    assert.deepEqual(new Set(knowledge.observations.map(o=>o.kind)),new Set(['CANDIDATE','PROVIDER']));
    assert.equal(providerBound(knowledge.objective,lead),false);assert.equal(providerBound(knowledge.objective,official),true);
    const withoutProvider={...knowledge,observations:knowledge.observations.filter(o=>o.kind==='CANDIDATE')};
    assert.equal(evaluate(withoutProvider).service.SERVICE_IDENTITY.state,'UNRESOLVED');
    assert.equal(result.truth.service.SERVICE_IDENTITY.state,'ESTABLISHED');
});

test('multiple candidate hosts are researched independently under finite action bounds',async()=>{
    const a='https://first.example/plans',b='https://second.example/plans';
    const fixture=input({candidateHosts:['first.example','second.example'],seeds:[a,b],fixtures:[robots('first.example'),page(a),robots('second.example'),page(b)]});
    const {knowledge,result}=await execute(fixture);
    assert.deepEqual(new Set(knowledge.observations.map(o=>o.url)),new Set([a,b]));
    assert(knowledge.observations.every(o=>o.kind==='CANDIDATE'&&o.authority==='UNREVIEWED_CANDIDATE'));
    assert.equal(knowledge.usage.acquisitions,2);assert.equal(result.truth.established,false);
    assert.deepEqual(knowledge.objective.providerHosts,[]);
});

test('candidate host neither admits sibling destinations nor unbounded host lists',()=>{
    const objective=input({candidateHosts:['lead.example'],seeds:['https://sibling.lead.example/plans']}).objective;
    const k=createKnowledge({objective});
    assert.equal(k.destinations.length,0);
    assert.equal(addDestination(k,{url:'https://sibling.lead.example/',depth:0,needs:pricePropositions,grounding:{kind:'CANDIDATE_SEED'}}),'OUTSIDE_PROVIDER_BOUNDARY');
    assert.throws(()=>createKnowledge({objective:{...objective,candidateHosts:Array.from({length:13},(_,i)=>`lead-${i}.example`)}}),/INVALID_CANDIDATE_HOST/);
    assert.throws(()=>createKnowledge({objective:{...objective,providerHosts:['lead.example']}}),/INVALID_CANDIDATE_HOST/);
});

test('an unreviewed runner input cannot smuggle a providerHost alongside candidates',async()=>{
    const fixture=input({candidateHosts:['lead.example'],providerHosts:['provider.example']});
    delete fixture.provider;
    await assert.rejects(()=>execute(fixture),/REVIEWED_SINGLE_TARGET_REQUIRED/);
});

test('redirect from a candidate to another candidate or reviewed provider is refused',async()=>{
    const lead='https://lead.example/plans';
    for(const destination of ['https://second.example/plans','https://provider.example/plans','https://sibling.lead.example/plans']){
        const fixture=input({candidateHosts:['lead.example','second.example'],providerHosts:['provider.example'],seeds:[lead],fixtures:[robots('lead.example'),{url:lead,transport:'DIRECT',status:302,location:destination,body:''}],bounds:{actions:1,acquisitions:1,searches:0,modelCalls:0}});
        const {knowledge,result}=await execute(fixture);
        assert.equal(knowledge.observations.length,0,destination);
        assert.equal(knowledge.attempts[0].status,'FAILED');
        assert.equal(knowledge.attempts[0].failure.code,'PROVIDER_BOUNDARY');
        assert.equal(providerBound(knowledge.objective,lead),false);
        assert.equal(result.truth.established,false);
    }
});

test('same-host candidate redirect stays unreviewed and retains final source URL',async()=>{
    const start='https://lead.example/start',final='https://lead.example/plans';
    const fixture=input({candidateHosts:['lead.example'],seeds:[start],fixtures:[robots('lead.example'),{url:start,transport:'DIRECT',status:302,location:final,body:''},page(final)],bounds:{actions:1,acquisitions:1,searches:0,modelCalls:0}});
    const {knowledge,result}=await execute(fixture);
    assert.equal(knowledge.observations[0]?.url,final);assert.equal(knowledge.observations[0]?.kind,'CANDIDATE');
    assert.equal(providerBound(knowledge.objective,final),false);assert.equal(result.truth.established,false);
});

test('search title, snippet, and rank only create discovery leads',async()=>{
    const url='https://lead.example/plans';
    const fixture=input({candidateHosts:['lead.example'],permissions:{TAVILY:true},bounds:{actions:1,searches:1,acquisitions:0,modelCalls:0},discoveries:[{url,title:'Official Fixture USD 12 monthly',content:'Confirmed price USD 12 in US',rank:1}]});
    const {knowledge,result}=await execute(fixture);
    assert.equal(knowledge.observations.length,0);assert.equal(knowledge.researchResults[0].truthAuthority,'NONE');
    assert.equal(knowledge.destinations[0].url,url);assert.equal(result.truth.established,false);
    assert.equal(result.truth.prices.US.propositions.TARGET_MARKET.state,'UNRESOLVED');
});

test('checkpoint and resume retain candidate status and reject changed candidate scope',async()=>{
    const url='https://lead.example/plans',fixture=input({candidateHosts:['lead.example'],seeds:[url],fixtures:[robots('lead.example'),page(url)],bounds:{actions:1,acquisitions:1,searches:0,modelCalls:0}});
    const first=await execute(fixture),snapshot=checkpoint(first.knowledge),restored=restore(snapshot);
    assert.deepEqual(restored.objective.candidateHosts,['lead.example']);assert.deepEqual(restored.objective.providerHosts,[]);
    assert.equal(restored.observations[0].kind,'CANDIDATE');assert.equal(evaluate(restored).established,false);
    const resumed=await runTarget({input:fixture,snapshot,capabilities:offlineCapabilities(fixture),interpret:interpretBillingFixture});
    assert.equal(resumed.knowledge.observations[0].authority,'UNREVIEWED_CANDIDATE');
    const changed=input({candidateHosts:['other.example'],seeds:[url],fixtures:fixture.fixtures,bounds:fixture.bounds});
    await assert.rejects(()=>runTarget({input:changed,snapshot,capabilities:offlineCapabilities(changed),interpret:interpretBillingFixture}),/RESUME_OBJECTIVE_MISMATCH/);
});

test('candidate acquisition keeps the existing robots and source-integrity boundary',async()=>{
    const url='https://lead.example/plans';
    const fixture=input({candidateHosts:['lead.example'],seeds:[url],fixtures:[{url:'https://lead.example/robots.txt',transport:'DIRECT',body:'User-agent: *\nDisallow: /plans',contentType:'text/plain'}],bounds:{actions:1,acquisitions:1,searches:0,modelCalls:0}});
    const {knowledge,result}=await execute(fixture);
    assert.equal(knowledge.observations[0]?.kind,'CANDIDATE');assert.notEqual(knowledge.observations[0]?.outcome,'OK');
    assert.equal(result.truth.established,false);assert.deepEqual(knowledge.objective.providerHosts,[]);
});
