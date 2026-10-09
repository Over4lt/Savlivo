import test from 'node:test';
import assert from 'node:assert/strict';
import {reviewCandidateAuthority,structuredExactOriginBounds} from './provider-authority-review.mjs';
import {runTarget,offlineCapabilities} from './runner.mjs';
import {checkpoint,digest,providerBound} from './model.mjs';
import {evaluate} from './truth.mjs';
import {interpretBillingFixture} from './billing-fixtures.test-support.mjs';

const name='Aurora Club',host='aurora.example',url=`https://${host}/membership`;
const objective={kind:'PRICE',serviceId:'aurora-club',serviceName:name,providerHosts:[],candidateHosts:[host],markets:['US'],seeds:[url]};
const owned=`<html><main><h1>${name} membership</h1><p>We operate ${name} membership and provide our own classes.</p><p>Personal consumer subscription price USD 12 per month.</p></main><footer>© ${name} 2026. All rights reserved.</footer></html>`;
const product=`<html><main><h1>${name} product</h1><p>Our ${name} subscription provides classes and content to members.</p></main><footer>© ${name} 2026.</footer></html>`;
const jsonLd=value=>`<script type="application/ld+json">${JSON.stringify(value)}</script>`;
const structured=jsonLd({'@context':'https://schema.org','@type':'Organization','@id':'https://aurora.example/#organization',name,url:'https://aurora.example'});
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

test('bounded exact target Organization URL establishes exact-host authority without a footer',()=>{
    const body=`<html><head><link rel="canonical" href="${url}">${structured}</head><main>${name} membership</main></html>`,binding=review(body);
    assert.equal(binding?.host,host);assert.equal(binding.reason,'STRUCTURED_EXACT_ORIGIN_IDENTITY');assert.equal(binding.scope,'EXACT_HOST_PROVIDER_SOURCING');
    for(const source of binding.locators.structuredSources)assert.equal(digest(body.slice(source.start,source.end)),source.sha256);assert.equal(binding.locators.representation.normalizedUrl,'https://aurora.example/');
});

test('bounded same-document @graph and @id resolution joins one Organization representation',()=>{
    const body=jsonLd({'@context':'https://schema.org','@graph':[{'@id':'#provider','@type':'https://schema.org/Corporation',name},{'@id':'#provider',url:'https://aurora.example/about'}]}),binding=review(body);
    assert.equal(binding?.reason,'STRUCTURED_EXACT_ORIGIN_IDENTITY');assert.equal(binding.host,host);assert.equal(binding.locators.representation.id,'#provider');
});

test('minimized retained Chess-shaped presentations use the same exact-origin invariant',()=>{
    const chessName='Chess.com',chessHost='www.chess.com',org={'@context':'https://schema.org','@type':'Organization','@id':'https://www.chess.com/#organization',name:chessName,url:'https://www.chess.com'},rows=[
        ['root','https://www.chess.com/',`<title>Chess.com - Play Chess Online</title>${jsonLd(org)}<main>Play Chess Online</main><footer>Chess.com, LLC © 2026</footer>`],
        ['play','https://www.chess.com/play',`<title>Play Chess Online - Chess.com</title>${jsonLd(org)}<main>Play online</main>`],
        ['membership','https://www.chess.com/membership',`<title>Premium Membership - Chess.com</title>${jsonLd(org)}<main>Choose a Plan</main>`],
        ['family','https://www.chess.com/family',`${jsonLd(org)}${jsonLd({'@type':'Article',mainEntityOfPage:{'@id':'https://www.chess.com/family'},publisher:{'@type':'Organization',name:chessName}})}<main>Our Friends & Family Plan</main><footer>Copyright 2026 Chess.com, LLC.</footer>`],
    ];
    for(const [id,chessUrl,body]of rows){const o={...observation(body),id,url:chessUrl},binding=reviewCandidateAuthority(o,{...objective,serviceId:'chess-com',serviceName:chessName,candidateHosts:[chessHost],seeds:[chessUrl]});assert.equal(binding?.reason,'STRUCTURED_EXACT_ORIGIN_IDENTITY',id);assert.equal(binding.host,chessHost,id);}
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

test('structured identity path rejects incomplete unrelated copied and publisher-only representations',()=>{
    const cases=[
        jsonLd({'@type':'Organization',name,logo:'https://aurora.example/logo.png'}),
        `${jsonLd({'@type':'Organization',name:'Daily Review',url:'https://aurora.example'})}<main>${name} review and logo</main>`,
        jsonLd({'@type':'Article',publisher:{'@type':'Organization',name,url:'https://aurora.example'}}),
        jsonLd({'@type':'Organization',name,url:'https://real-provider.example'}),
        jsonLd({'@type':'Organization',name:'App Store',url:'https://aurora.example',sameAs:['https://real-provider.example']}),
        jsonLd({'@type':'Organization',name,logo:'x',sameAs:['https://aurora.example']}),
        `<link rel="canonical" href="${url}"><main>${name}</main>`,
        `<script>window.data=${JSON.stringify({'@type':'Organization',name,url:'https://aurora.example'})}</script>`,
        `<!-- ${jsonLd({'@type':'Organization',name,url:'https://aurora.example'})} -->`,
        `<template>${jsonLd({'@type':'Organization',name,url:'https://aurora.example'})}</template>`,
    ];
    for(const body of cases)assert.equal(review(body),null,body.slice(0,200));
});

test('third-party commercial and infrastructure Organization records cannot borrow target mentions',()=>{
    for(const operator of ['Daily Review','Gear Reseller','Payments Processor','App Store','Static CDN','Support SaaS','Authentication Provider','Multi Tenant Pages']){
        const body=`${jsonLd({'@type':'Organization',name:operator,url:'https://aurora.example'})}<main>${name} logo, membership and official-looking profile</main>`;
        assert.equal(review(body),null,operator);
    }
    const copied=jsonLd({'@type':'Organization',name,url:'https://aurora.example'}),lookalike={...objective,candidateHosts:['aurora-club.pages.example'],seeds:['https://aurora-club.pages.example/membership']},o={...observation(copied),url:'https://aurora-club.pages.example/membership'};
    assert.equal(reviewCandidateAuthority(o,lookalike),null,'multi-tenant hostname and copied real-provider URL cannot establish the tenant host');
});

test('structured conflicts canonical contradictions malformed data and non-affiliation fail closed',()=>{
    const exact={'@type':'Organization',name,url:'https://aurora.example'};
    for(const body of [
        `${jsonLd(exact)}${jsonLd({'@type':'Organization',name,url:'https://other.example'})}`,
        `<link rel="canonical" href="https://other.example/membership">${jsonLd(exact)}`,
        '<script type="application/ld+json">{"@type":"Organization",</script>',
        `${jsonLd(exact)}<main>We are not affiliated with ${name}.</main>`,
    ])assert.equal(review(body),null);
    assert.equal(review(`<link rel="canonical" href="${url}">${jsonLd(exact)}`)?.reason,'STRUCTURED_EXACT_ORIGIN_IDENTITY','same-host canonical is non-authoritative and non-contradictory');
});

test('structured JSON-LD byte depth and total-node bounds fail closed',()=>{
    const oversized=jsonLd({'@type':'Organization',name,url:'https://aurora.example',description:'x'.repeat(structuredExactOriginBounds.scriptBytes)});
    let nested={};for(let index=0;index<structuredExactOriginBounds.depth+2;index++)nested={next:nested};
    const deep=jsonLd({'@type':'Organization',name,url:'https://aurora.example',nested});
    const excessive=jsonLd({'@context':'https://schema.org','@graph':[{'@type':'Organization',name,url:'https://aurora.example'},...Array.from({length:structuredExactOriginBounds.nodes},()=>({}))]});
    for(const body of [oversized,deep,excessive])assert.equal(review(body),null);
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

test('structured authority checkpoint revalidates the same proof and stays outside Truth',async()=>{
    const body=`<main>${name} membership</main>${structured}`,input=fixture(body,{actions:1,acquisitions:1,searches:0,modelCalls:0}),first=await execute(input),saved=checkpoint(first.knowledge),binding=first.knowledge.authorityBindings[0];
    assert.equal(binding.reason,'STRUCTURED_EXACT_ORIGIN_IDENTITY');assert.equal(first.knowledge.observations[0].kind,'CANDIDATE');assert.equal(first.result.truth.established,false);
    const resumed=await execute(input,{snapshot:saved});assert.deepEqual(resumed.knowledge.authorityBindings,[binding]);assert.deepEqual(resumed.knowledge.objective.providerHosts,[host]);
    const changed=structuredClone(saved);changed.payload.authorityBindings[0].locators.representation.normalizedUrl='https://other.example/';changed.sha256=digest(changed.payload);await assert.rejects(()=>execute(input,{snapshot:changed}),/RESUME_AUTHORITY_MISMATCH/);
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
