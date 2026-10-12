import test from 'node:test';
import assert from 'node:assert/strict';
import {runTarget,offlineCapabilities} from './runner.mjs';
import {interpretBillingFixture} from './billing-fixtures.test-support.mjs';
import {createLiveNavigationAdvisor} from './live-navigation-advice.mjs';
import {evaluate} from './truth.mjs';
import {checkpoint} from './model.mjs';

const robots=host=>({url:`https://${host}/robots.txt`,transport:'DIRECT',status:404,contentType:'text/plain',body:''});
const page=(url,body)=>({url,transport:'DIRECT',body});
const shell=(name,links='')=>`<html><head><title>${name}</title></head><body><main><h1>${name}</h1>${links}</main></body></html>`;
const price=name=>shell(name,'<p>Personal consumer subscription price EUR 12 per month. Billed monthly. Available in DE.</p>');
const input=({serviceName='Nova',providerHost='global.example',seeds=[`https://${providerHost}/`],fixtures,bounds={actions:4,acquisitions:4,searches:0,modelCalls:4}})=>({
 objective:{kind:'PRICE',serviceId:serviceName.toLowerCase(),serviceName,providerHosts:[providerHost],markets:['DE'],seeds},
 provider:{reviewed:true,serviceId:serviceName.toLowerCase(),hosts:[providerHost]},permissions:{DIRECT:true},bounds,fixtures,planning:{initialPerspective:'AUTO'}
});
const run=async(spec,hooks={})=>{const fixture=input(spec);return runTarget({input:fixture,capabilities:offlineCapabilities(fixture),interpret:interpretBillingFixture,...hooks});};

test('A global source can continue through a source-bound country host to offerings under normal authority review',async()=>{
 const global='https://global.example/',country='https://de.nova.example/',offer=country+'choice',fr='https://fr.nova.example/',gb='https://uk.nova.example/';
 const owned=`<html><head><title>Nova membership</title><link rel="canonical" href="${country}"></head><body><main><h1>Nova</h1><p>We operate Nova membership and provide our own subscriptions.</p><a href="/choice">Subscriptions</a></main><footer>© Nova 2026. All rights reserved.</footer></body></html>`;
 const result=await run({fixtures:[robots('global.example'),page(global,shell('Nova',`<nav><a href="${fr}">France</a><a href="${gb}">United Kingdom</a><a href="${country}">Germany</a></nav>`)),robots('de.nova.example'),page(country,owned),page(offer,price('Nova')),robots('fr.nova.example'),page(fr,shell('Nova France')),robots('uk.nova.example'),page(gb,shell('Nova UK'))]});
 assert.deepEqual(result.knowledge.observations.slice(0,3).map(row=>row.url),[global,country,offer]);
 assert.equal(result.knowledge.observations[1].kind,'CANDIDATE');assert.equal(result.knowledge.observations[2].kind,'PROVIDER');
 assert.ok(result.knowledge.objective.providerHosts.includes('de.nova.example'));
 assert.ok(result.knowledge.authorityBindings.some(row=>row.host==='de.nova.example'&&row.kind==='AUTONOMOUS_FIRST_PARTY_PRESENTATION'));
 assert.equal(result.result.truth.established,true);
 assert.ok(result.knowledge.sourceBoundCandidateRoutes.some(row=>row.url===country&&row.truthAuthority==='NONE'));
 const selectorOnly=evaluate({...result.knowledge,observations:result.knowledge.observations.slice(0,1)});assert.equal(selectorOnly.prices.DE.propositions.TARGET_MARKET.state,'UNRESOLVED');
});

test('B a source-owned home to plans continuation needs no URL keyword',async()=>{
 const home='https://global.example/',opaque=home+'x7';
 const result=await run({fixtures:[robots('global.example'),page(home,shell('Nova','<nav><a href="/x7">Choose</a></nav>')),page(opaque,price('Nova'))],bounds:{actions:2,acquisitions:2,searches:0,modelCalls:4}});
 assert.deepEqual(result.knowledge.observations.map(row=>row.url),[home,opaque]);assert.equal(result.result.truth.established,true);
 assert.equal(result.knowledge.destinations.find(row=>row.url===opaque).grounding.kind,'PROVIDER_LINK');
});

test('C structural ambiguity invokes bounded navigation advice and only reorders observed IDs',async()=>{
 const home='https://global.example/',a=home+'x-a',b=home+'x-b';let calls=0;
 const navigate=createLiveNavigationAdvisor({env:{OPENAI_API_KEY:'test-only',SAVLIVO_V3_RESEARCH_MODEL:'offline'},fetchImpl:async(_url,options)=>{calls++;const request=JSON.parse(options.body),observed=JSON.parse(request.input[1].content[0].text),selected=observed.candidates.find(row=>row.destination===b),rankedCandidates=[{candidateId:selected.candidateId,needIds:observed.objective.unresolvedNeeds.map(row=>row.id),role:'PRICING',stateIntent:'MONTHLY_PAYMENT',sourceReferences:[selected.sourceReference],rationale:'The supplied source candidate is useful.'}];return new Response(JSON.stringify({id:'response',model:'offline',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({rankedCandidates})}]}]}),{status:200,headers:{'content-type':'application/json'}});}});
 const result=await run({fixtures:[robots('global.example'),page(home,shell('Nova','<nav><a href="/x-a">Choose</a><a href="/x-b">Choose</a></nav>')),page(a,shell('Nova','Information')),page(b,price('Nova'))],bounds:{actions:2,acquisitions:2,searches:0,modelCalls:4}},{navigate});
 assert.equal(calls,1);assert.deepEqual(result.knowledge.observations.map(row=>row.url),[home,b]);assert.equal(result.result.truth.established,true);
 assert.ok(result.knowledge.trace.some(row=>row.event==='NAVIGATION_ADVICE'&&row.truthAuthority==='NONE'));
});

test('D live navigation advice rejects an invented candidate identity',async()=>{
 const advisor=createLiveNavigationAdvisor({env:{OPENAI_API_KEY:'test-only',SAVLIVO_V3_RESEARCH_MODEL:'offline'},fetchImpl:async()=>new Response(JSON.stringify({id:'response',model:'offline',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({rankedCandidates:[{candidateId:'invented',needIds:['DE:PRICE_AMOUNT'],role:'PRICING',stateIntent:'MONTHLY_PAYMENT',sourceReferences:['invented:hash'],rationale:'Invented'}]})}]}]}),{status:200,headers:{'content-type':'application/json'}})});
 const candidates=[{id:'observed',url:'https://global.example/x',label:'Choose',kind:'ANCHOR',context:'NAVIGATION',locale:null,source:{observation:'o',bodySha256:'a'.repeat(64),start:1,end:2,sha256:'b'.repeat(64)}}],needs=[{id:'DE:PRICE_AMOUNT',proposition:'PRICE_AMOUNT',market:'DE',state:'UNRESOLVED'}];
 await assert.rejects(()=>advisor(candidates,needs,{objective:{kind:'PRICE',markets:['DE']}}),/RESEARCH_ADVICE_RESPONSE_REJECTED/);
});

test('E an observed third-party destination remains candidate-only and cannot inherit provider authority',async()=>{
 const home='https://global.example/',third='https://reviews.example/nova',externals=[third,'https://payments.example/checkout','https://apps.example/nova','https://reseller.example/nova','https://region.nova.example/'];
 const links=externals.map((url,index)=>`<a href="${url}">External ${index}</a>`).join('');
 const result=await run({fixtures:[robots('global.example'),page(home,shell('Nova',`<nav>${links}</nav>`)),...externals.flatMap(url=>[robots(new URL(url).hostname),page(url,'<html><head><title>Independent destination</title></head><body><article>Third-party information about subscriptions.</article></body></html>')])],bounds:{actions:2,acquisitions:2,searches:0,modelCalls:0}});
 assert.equal(result.knowledge.observations.at(-1).kind,'CANDIDATE');assert.equal(result.knowledge.observations.at(-1).authority,'UNREVIEWED_CANDIDATE');
 assert.deepEqual(result.knowledge.objective.providerHosts,['global.example']);assert.equal(result.knowledge.authorityBindings.length,0);assert.equal(evaluate(result.knowledge).established,false);
 assert.deepEqual(new Set(result.knowledge.sourceBoundCandidateRoutes.map(row=>row.host)),new Set(externals.map(url=>new URL(url).hostname)));assert.ok(result.knowledge.sourceBoundCandidateRoutes.every(row=>row.truthAuthority==='NONE'));
});

test('source-bound candidate scope resumes only from its intact checkpoint provenance',async()=>{
 const home='https://global.example/',candidate='https://candidate.example/';
 const fixture=input({fixtures:[robots('global.example'),page(home,shell('Nova',`<a href="${candidate}">Continue</a>`)),robots('candidate.example'),page(candidate,shell('Independent'))],bounds:{actions:2,acquisitions:2,searches:0,modelCalls:0}}),first=await runTarget({input:fixture,capabilities:offlineCapabilities(fixture),interpret:interpretBillingFixture});
 const resumed=await runTarget({input:fixture,snapshot:checkpoint(first.knowledge),capabilities:offlineCapabilities(fixture),interpret:interpretBillingFixture});
 assert.deepEqual(resumed.knowledge.sourceBoundCandidateRoutes,first.knowledge.sourceBoundCandidateRoutes);assert.deepEqual(resumed.result.truth,first.result.truth);
});
