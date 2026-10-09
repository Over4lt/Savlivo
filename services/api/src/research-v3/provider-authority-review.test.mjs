import test from 'node:test';
import assert from 'node:assert/strict';
import {reviewCandidateAuthority} from './provider-authority-review.mjs';
import {runTarget,offlineCapabilities} from './runner.mjs';
import {checkpoint,digest,providerBound} from './model.mjs';
import {evaluate} from './truth.mjs';
import {interpretBillingFixture} from './billing-fixtures.test-support.mjs';

const name='Aurora Club',host='aurora.example',url=`https://${host}/membership`;
const objective={kind:'PRICE',serviceId:'aurora-club',serviceName:name,providerHosts:[],candidateHosts:[host],markets:['US'],seeds:[url]};
const owned=`<html><main><h1>${name} membership</h1><p>We operate ${name} membership and provide our own classes.</p><p>Personal consumer subscription price USD 12 per month.</p></main><footer>© ${name} 2026. All rights reserved.</footer></html>`;
const product=`<html><main><h1>${name} product</h1><p>Our ${name} subscription provides classes and content to members.</p></main><footer>© ${name} 2026.</footer></html>`;
const observation=(body=owned,extra={})=>({id:'candidate-1',kind:'CANDIDATE',authority:'UNREVIEWED_CANDIDATE',url,context:{transport:'DIRECT',networkGeography:'UNBOUND',representation:'CANDIDATE_PAGE'},outcome:'OK',truncated:false,completeness:'COMPLETE',format:'WEB',httpStatus:200,access:[{decision:'ALLOWED'}],body,sha256:digest(body),...extra});
const review=(body,extra={})=>reviewCandidateAuthority(observation(body,extra),objective);
const robots={url:`https://${host}/robots.txt`,transport:'DIRECT',status:404,contentType:'text/plain',body:''};
const fixture=(body=owned,bounds={actions:2,acquisitions:2,searches:0,modelCalls:0})=>({objective,permissions:{DIRECT:true},bounds,fixtures:[robots,{url,transport:'DIRECT',body}]});
const execute=(input,extra={})=>runTarget({input,capabilities:offlineCapabilities(input),interpret:interpretBillingFixture,...extra});

test('first-party homepage and product presentation admit only the exact candidate host with audited spans',()=>{
    for(const body of [owned,product]){
        const binding=review(body);
        assert.equal(binding?.host,host);
        assert.equal(binding.kind,'AUTONOMOUS_FIRST_PARTY_PRESENTATION');
        assert.equal(binding.reason,'FIRST_PARTY_PRESENTATION');
        assert.equal(binding.serviceId,objective.serviceId);
        assert.equal(binding.url,url);
        assert.equal(binding.bodySha256,digest(body));
        for(const locator of Object.values(binding.locators)){
            assert.equal(body.slice(locator.start,locator.end),locator.quote);
            assert.equal(digest(locator.quote),locator.sha256);
        }
    }
});

test('a differently named publisher can explicitly identify its own operated service',()=>{
    const body=`<main><p>Aurora Holdings operates ${name} and provides its membership service.</p></main><footer>© Aurora Holdings 2026.</footer>`;
    assert.equal(review(body)?.host,host);
    assert.equal(review(body.replace('operates','reviews')),null);
});

test('reseller, editorial, non-affiliation, platform and ambiguous same-name pages remain candidates',()=>{
    const pages=[
        `<main>We sell ${name} memberships and ship the provider's products.</main><footer>© Gear Shop 2026</footer>`,
        `<main>Our review of ${name} subscription compares other services.</main><footer>© Daily Review 2026</footer>`,
        `<main>We operate ${name} membership. We are not affiliated with ${name}.</main><footer>© ${name} 2026</footer>`,
        `<main>Our listing of ${name} app is hosted here. Follow ${name}.</main><footer>© App Store 2026</footer>`,
        `<main>Our profile lists ${name} content.</main><footer>© Social Network 2026</footer>`,
        `<title>${name}</title><main>${name} subscriptions are available here.</main><footer>© ${name} 2026</footer>`,
        `<main>We sell ${name} membership and products.</main><footer>© ${name} 2026</footer>`,
    ];
    for(const body of pages)assert.equal(review(body),null,body);
});

test('policy, integrity, completeness and final exact-host prerequisites fail closed',()=>{
    for(const extra of [
        {outcome:'POLICY_BLOCKED'}, {body:'',sha256:digest('')}, {truncated:true},
        {completeness:'INCOMPLETE'}, {httpStatus:503}, {access:[{decision:'DISALLOWED'}]},
        {sha256:'wrong'}, {url:'https://sibling.aurora.example/membership'},
        {url:'https://redirect.example/membership'}, {context:{representation:'PROVIDER_PAGE'}},
    ])assert.equal(reviewCandidateAuthority(observation(owned,extra),objective),null);
});

test('model failure and positive suggestions do not override native source proof',()=>{
    assert.equal(reviewCandidateAuthority(observation(owned,{interpretation:{kind:'UNDERSTANDING_FAILED',status:429}}),objective)?.host,host);
    assert.equal(reviewCandidateAuthority(observation('<main>Aurora Club</main>',{interpretation:{kind:'EVIDENCE',verdict:'FIRST_PARTY',confidence:1}}),objective),null);
});

test('promotion keeps its source candidate and admits only later provider observations into Truth',async()=>{
    const input=fixture();
    const {knowledge,result}=await execute(input);
    assert.deepEqual(knowledge.objective.providerHosts,[host]);
    assert.deepEqual(knowledge.objective.candidateHosts,[]);
    assert.equal(knowledge.authorityBindings.length,1);
    assert.equal(knowledge.authorityBindings[0].kind,'AUTONOMOUS_FIRST_PARTY_PRESENTATION');
    assert.equal(knowledge.observations[0].kind,'CANDIDATE');
    assert.equal(knowledge.observations[0].authority,'UNREVIEWED_CANDIDATE');
    assert.equal(knowledge.observations[0].context.representation,'CANDIDATE_PAGE');
    assert.equal(knowledge.observations[1].kind,'PROVIDER');
    assert.equal(knowledge.observations[1].context.representation,'PROVIDER_PAGE');
    assert.equal(providerBound(knowledge.objective,url),true);
    assert.equal(providerBound(knowledge.objective,'https://sibling.aurora.example/'),false);
    assert.equal(evaluate({...knowledge,observations:knowledge.observations.slice(0,1)}).established,false);
    assert.equal(result.truth.service.SERVICE_IDENTITY.state,'ESTABLISHED');
});

test('checkpoint resume revalidates autonomous source, exact host and decision',async()=>{
    const input=fixture(owned,{actions:1,acquisitions:1,searches:0,modelCalls:0});
    const first=await execute(input),saved=checkpoint(first.knowledge);
    assert.equal((await execute(input,{snapshot:saved})).knowledge.objective.providerHosts[0],host);
    for(const mutate of [
        payload=>{payload.authorityBindings[0].locators.relation.quote='forged';},
        payload=>{payload.observations[0].body+=' forged';},
        payload=>{payload.authorityBindings[0].host='sibling.aurora.example';},
        payload=>{payload.objective.providerHosts=['sibling.aurora.example'];},
    ]){
        const altered=structuredClone(saved);mutate(altered.payload);altered.sha256=digest(altered.payload);
        await assert.rejects(()=>execute(input,{snapshot:altered}),/RESUME_(AUTHORITY|OBJECTIVE)_MISMATCH/);
    }
});

test('a completed candidate checkpoint resumes with a provider-context acquisition',async()=>{
    const input=fixture();let saved;
    await assert.rejects(()=>execute(input,{save:snapshot=>{
        if(snapshot.payload.authorityBindings.length&&snapshot.payload.pending===null&&snapshot.payload.usage.actions===1){saved=snapshot;throw Error('SIMULATED_PROCESS_STOP');}
    }}),/SIMULATED_PROCESS_STOP/);
    assert.ok(saved);
    const resumed=await execute(input,{snapshot:saved});
    assert.deepEqual(resumed.knowledge.observations.map(o=>o.kind),['CANDIDATE','PROVIDER']);
    assert.equal(resumed.result.truth.service.SERVICE_IDENTITY.state,'ESTABLISHED');
});

test('reviewed provider routing remains its existing path',async()=>{
    const reviewed={...fixture(),objective:{...objective,providerHosts:[host],candidateHosts:[]},provider:{reviewed:true,serviceId:objective.serviceId,hosts:[host]}};
    const {knowledge}=await execute(reviewed);
    assert.equal(knowledge.observations[0].kind,'PROVIDER');
    assert.deepEqual(knowledge.authorityBindings,[]);
});
