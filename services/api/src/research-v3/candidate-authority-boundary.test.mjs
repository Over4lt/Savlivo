import test from 'node:test';
import assert from 'node:assert/strict';
import {runTarget,offlineCapabilities} from './runner.mjs';
import {availableActions} from './engine.mjs';
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
const execute=(fixture,options={})=>runTarget({input:fixture,capabilities:offlineCapabilities(fixture),interpret:interpretBillingFixture,...options});
const manyLinks=hosts=>hosts.flatMap(host=>[
    robots(host),
    page(`https://${host}/start`,`<html><body><h1>Fixture equipment</h1>${Array.from({length:15},(_,i)=>`<a href="/membership/${i}">Membership option ${i}</a>`).join('')}</body></html>`),
    ...Array.from({length:15},(_,i)=>page(`https://${host}/membership/${i}`,'<html><body>Information about membership.</body></html>')),
]);
const ownedCandidate=deep=>`<html><body><main><h1>${serviceName}</h1><p>We operate ${serviceName} membership and provide our own classes.</p><a href="${deep}">Membership details</a></main><footer>© ${serviceName} 2026. All rights reserved.</footer></body></html>`;
const sequencedReasoner=sequence=>{let index=0;const missing=[];return {missing,reasoner:({actions})=>{if(index===sequence.length)return {};const selected=actions.find(action=>action.url===sequence[index]);if(selected){index++;return {actionId:selected.id};}missing.push({wanted:sequence[index],available:actions.map(action=>action.url??action.query)});return {};}};};

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

test('candidate breadth precedes attractive same-host links under a three-acquisition bound',async()=>{
    const hosts=['north.example','south.example','west.example'];
    const fixture=input({candidateHosts:hosts,seeds:hosts.map(host=>`https://${host}/start`),fixtures:manyLinks(hosts),bounds:{actions:3,acquisitions:3,searches:0,modelCalls:0}});
    const {knowledge,result}=await execute(fixture);
    assert.equal(knowledge.attempts.length,3);
    assert.deepEqual(new Set(knowledge.attempts.map(a=>new URL(a.action.url).hostname)),new Set(hosts));
    assert(knowledge.attempts.every(a=>new URL(a.action.url).pathname==='/start'));
    assert(knowledge.observations.every(o=>o.kind==='CANDIDATE'&&o.authority==='UNREVIEWED_CANDIDATE'));
    assert.deepEqual(knowledge.objective.providerHosts,[]);assert.equal(result.truth.established,false);
    assert.equal(result.catalog.state,'CAPACITY');assert.equal(result.stop.reason,'CAPACITY_BOUND_REACHED');
});

test('failed candidate acquisition counts as exploration and other hosts proceed',async()=>{
    const hosts=['north.example','south.example','west.example'],failed='south.example';
    const fixtures=manyLinks(hosts).map(row=>row.url===`https://${failed}/start`?{...row,status:302,location:'https://north.example/other',body:''}:row);
    const fixture=input({candidateHosts:hosts,seeds:hosts.map(host=>`https://${host}/start`),fixtures,bounds:{actions:3,acquisitions:3,searches:0,modelCalls:0}});
    const reasoner=({actions})=>({actionId:actions.find(a=>a.kind==='ACQUIRE'&&new URL(a.url).hostname===failed)?.id});
    const {knowledge,result}=await execute(fixture,{reasoner});
    assert.equal(new URL(knowledge.attempts[0].action.url).hostname,failed);
    assert.equal(knowledge.attempts[0].status,'FAILED');assert.equal(knowledge.attempts[0].failure.code,'PROVIDER_BOUNDARY');
    assert.deepEqual(new Set(knowledge.attempts.map(a=>new URL(a.action.url).hostname)),new Set(hosts));
    assert.equal(knowledge.usage.acquisitions,3);assert.equal(result.truth.established,false);
});

test('same-host candidate navigation remains available after initial host breadth',async()=>{
    const hosts=['north.example','south.example','west.example'];
    const fixture=input({candidateHosts:hosts,seeds:hosts.map(host=>`https://${host}/start`),fixtures:manyLinks(hosts),bounds:{actions:4,acquisitions:4,searches:0,modelCalls:0}});
    const {knowledge,result}=await execute(fixture);
    assert.deepEqual(new Set(knowledge.attempts.slice(0,3).map(a=>new URL(a.action.url).hostname)),new Set(hosts));
    assert.match(new URL(knowledge.attempts[3].action.url).pathname,/^\/membership\/\d+$/);
    assert(hosts.includes(new URL(knowledge.attempts[3].action.url).hostname));
    assert(knowledge.observations.every(o=>o.kind==='CANDIDATE'&&o.authority==='UNREVIEWED_CANDIDATE'));
    assert.equal(result.truth.established,false);assert.equal(result.catalog.state,'CAPACITY');
});

test('autonomous authority mid-breadth preserves remaining initial-host attempts before provider depth',async()=>{
    const hosts=['first.example','authority.example','third.example','fourth.example'],starts=hosts.map(host=>`https://${host}/start`),deep='https://authority.example/membership/deep';
    const fixtures=hosts.flatMap((host,index)=>[robots(host),page(starts[index],host==='authority.example'?ownedCandidate('/membership/deep'):'<html><body>Candidate information.</body></html>'),...(host==='authority.example'?[page(deep)]:[])]);
    const fixture=input({candidateHosts:hosts,seeds:starts,fixtures,bounds:{actions:5,acquisitions:5,searches:0,modelCalls:0}}),sequence=[starts[0],starts[1],starts[2],starts[3],deep],control=sequencedReasoner(sequence);
    const {knowledge}=await execute(fixture,{reasoner:control.reasoner});
    assert.deepEqual(control.missing,[]);assert.deepEqual(knowledge.attempts.map(row=>row.action.url),sequence);
    assert.deepEqual(knowledge.objective.providerHosts,['authority.example']);assert.deepEqual(new Set(knowledge.objective.candidateHosts),new Set(['first.example','third.example','fourth.example']));
    assert.equal(knowledge.authorityBindings.length,1);assert.equal(knowledge.authorityBindings[0].kind,'AUTONOMOUS_FIRST_PARTY_PRESENTATION');
    const source=knowledge.observations.find(row=>row.id===knowledge.authorityBindings[0].observation),provider=knowledge.observations.find(row=>row.url===deep);
    assert.equal(source.kind,'CANDIDATE');assert.equal(source.authority,'UNREVIEWED_CANDIDATE');assert.equal(source.context.representation,'CANDIDATE_PAGE');
    assert.equal(provider.kind,'PROVIDER');assert.equal(provider.context.representation,'PROVIDER_PAGE');
    assert.equal(knowledge.usage.modelCalls,0);
});

test('failed first attempt still satisfies mid-authority breadth and bounds may leave later coverage unfinished',async()=>{
    const hosts=['authority.example','failed.example','third.example','bounded.example'],starts=hosts.map(host=>`https://${host}/start`),deep='https://authority.example/membership/deep';
    const fixtures=hosts.flatMap((host,index)=>[robots(host),host==='failed.example'?{url:starts[index],transport:'DIRECT',status:302,location:'https://outside.example/',body:''}:page(starts[index],host==='authority.example'?ownedCandidate('/membership/deep'):'<html><body>Candidate information.</body></html>'),...(host==='authority.example'?[page(deep)]:[])]);
    const fixture=input({candidateHosts:hosts,seeds:starts,fixtures,bounds:{actions:3,acquisitions:3,searches:0,modelCalls:0}}),sequence=starts.slice(0,3),control=sequencedReasoner(sequence);
    const {knowledge,result}=await execute(fixture,{reasoner:control.reasoner});
    assert.deepEqual(control.missing,[]);assert.deepEqual(knowledge.attempts.map(row=>row.action.url),sequence);
    assert.equal(knowledge.attempts[1].status,'FAILED');assert.equal(knowledge.attempts[1].failure.code,'PROVIDER_BOUNDARY');
    assert.equal(knowledge.attempts.filter(row=>new URL(row.action.url).hostname==='failed.example').length,1);
    assert.deepEqual(knowledge.objective.providerHosts,['authority.example']);assert.equal(knowledge.observations.find(row=>row.url===starts[0]).kind,'CANDIDATE');
    assert(!knowledge.attempts.some(row=>row.action.url===deep));assert(!knowledge.attempts.some(row=>row.action.url===starts[3]));
    assert.equal(result.stop.reason,'CAPACITY_BOUND_REACHED');assert(result.stop.bounds.includes('acquisitions'));assert.equal(knowledge.usage.modelCalls,0);
});

test('reviewed provider action frontier keeps same-host links alongside other roots',()=>{
    const providerHosts=['north.example','south.example'],seeds=providerHosts.map(host=>`https://${host}/start`);
    const k=createKnowledge({objective:{kind:'PRICE',serviceId,serviceName,providerHosts,markets:[market],seeds},permissions:{DIRECT:true}});
    const descendant='https://north.example/membership/1';
    assert.equal(addDestination(k,{url:descendant,depth:1,needs:pricePropositions,grounding:{kind:'PROVIDER_LINK',observation:'prior'}}),'ADMITTED');
    k.attempts.push({id:'prior',action:{kind:'ACQUIRE',url:seeds[0]},status:'COMPLETED'});
    const urls=new Set(availableActions(k,{DIRECT:async()=>({})}).actions.filter(a=>a.kind==='ACQUIRE').map(a=>a.url));
    assert(urls.has(descendant));assert(urls.has(seeds[1]));
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
