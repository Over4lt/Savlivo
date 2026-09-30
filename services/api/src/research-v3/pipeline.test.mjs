import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {createCapabilities} from './capabilities.mjs';
import {runTarget,offlineCapabilities} from './runner.mjs';
import {runResearch} from './engine.mjs';
import {createReasoner} from './reasoner.mjs';
import {projectWebSource,interpretWeb} from './source.mjs';
import {evaluate} from './truth.mjs';
import {context,digest,restore} from './model.mjs';

const home='https://provider.example/',price='https://provider.example/plans';
const page=(paragraph,links='')=>`<!doctype html><html><head><title>Orchard Club</title></head><body><h1>Orchard Club</h1><p>${paragraph}</p>${links}</body></html>`;
const enough=(market='JP')=>page(`Personal consumer subscription price JPY 1400 per month. Available in ${market}.`);
const partial=()=>page('Personal consumer subscription price JPY 1400 per month.');
const input=(extra={})=>({objective:{kind:'PRICE',serviceId:'orchard',serviceName:'Orchard Club',providerHosts:['provider.example'],markets:['JP'],seeds:[price]},provider:{reviewed:true,serviceId:'orchard',hosts:['provider.example']},permissions:{DIRECT:true,DECODO:true,TAVILY:false},planning:{initialPerspective:'UNBOUND'},...extra});
const response=(body,status=200,type='text/html',headers={})=>({status,headers:{'content-type':type,...headers},body:Buffer.from(body),tlsVerified:true});
function fixture(config={}) {
    const calls=[],inputValue=config.input??input();let probes=0;
    const hop=async(r,country='UNBOUND')=>{
        const url=r.url.href; calls.push({url,country,contextUsername:r.username});
        if(url.startsWith('https://ipwho.is/'))return response(JSON.stringify({success:true,ip:config.changeExit&&++probes===2?'93.184.216.35':'93.184.216.34',country_code:config.wrongCountry??country}),200,'application/json');
        if(url.endsWith('/robots.txt'))return response(config.robots??'User-agent: *\nAllow: /',200,'text/plain');
        if(config.redirect&&url===price)return response('',302,'text/html',{location:config.redirect});
        return response((config.pages??{})[country]?.[url]??(country==='UNBOUND'?(config.direct??enough()):(config.geo??enough())));
    };
    const caps=createCapabilities({objective:inputValue.objective,permissions:inputValue.permissions,clock:()=> '2026-01-01T00:00:00.000Z',network:{resolveHost:async()=>[{address:'93.184.216.34',family:4}],requestOnce:r=>hop(r)},decodo:{username:'fixtureuser',password:'fixturepassword',requestHop:r=>hop(r,r.username.match(/-country-([a-z]{2})-session-/)[1].toUpperCase())},tavily:{apiKey:'fixture-search-key',fetchImpl:async(_url,options)=>{
        calls.push({search:JSON.parse(options.body)});
        return new Response(JSON.stringify({results:config.discoveries??[{url:price,content:'JPY 1 monthly in JP'}]}));
    }}});
    return {caps,calls,input:inputValue};
}
const execute=async config=>{const f=fixture(config);return {...await runTarget({input:f.input,capabilities:f.caps}),calls:f.calls};};

test('real HTML: Direct sufficient establishes one price without ceremonial Decodo',async()=>{
    const {result,knowledge,calls}=await execute();
    assert.equal(result.stop.reason,'OBJECTIVE_ESTABLISHED');
    assert.equal(result.usage.acquisitions,1);
    assert.equal(result.usage.networkRequests,2); // robots + provider
    assert.equal(calls.some(c=>c.country==='JP'),false);
    const ref=result.truth.prices.JP.propositions.PRICE_AMOUNT.evidence[0].reference;
    const observed=knowledge.observations[0];
    assert.equal(ref.source.sha256,digest(observed.body.slice(ref.source.start,ref.source.end)));
    assert.equal(observed.httpStatus,200);
    assert.equal(observed.requestedUrl,price);
    assert.equal(observed.contentType,'text/html');
    assert.ok(observed.body.includes('<p>'));
});

test('Direct HTTP 200 -> only market unknown -> same URL country-bound Decodo -> established',async()=>{
    const {result,knowledge,calls}=await execute({direct:partial()});
    assert.equal(result.stop.reason,'OBJECTIVE_ESTABLISHED');
    assert.deepEqual(knowledge.attempts[1].action.needs,['JP:TARGET_MARKET']);
    assert.deepEqual(knowledge.observations.map(o=>o.context),[context('DIRECT'),context('DECODO','JP')]);
    assert.equal(knowledge.observations[1].transport.verification,'BRACKET_VERIFIED');
    assert.equal(knowledge.observations[1].transport.verifiedCountry,'JP');
    const geoCalls=calls.filter(c=>c.country==='JP');
    assert.equal(geoCalls.length,4); // before + robots + page + after
    assert.equal(new Set(geoCalls.map(c=>c.contextUsername)).size,1);
    assert.equal(result.usage.networkRequests,6);
    assert.equal(JSON.stringify(result).includes('fixturepassword'),false);
    assert.equal(JSON.stringify(result).includes('fixtureuser'),false);
});

test('Decodo first is a normal information-value choice, with no Direct request',async()=>{
    const {result,knowledge,calls}=await execute({input:input({planning:{initialPerspective:'AUTO'}})});
    assert.equal(result.stop.reason,'OBJECTIVE_ESTABLISHED');
    assert.equal(knowledge.attempts[0].action.context.transport,'DECODO');
    assert.equal(calls.some(c=>c.country==='UNBOUND'),false);
});

test('Tavily destination enters provider acquisition; snippet price never enters truth',async()=>{
    const i=input({permissions:{DIRECT:true,TAVILY:true},objective:{...input().objective,seeds:[]}});
    const {result,knowledge,calls}=await execute({input:i});
    assert.deepEqual(knowledge.attempts.map(a=>a.action.kind),['DISCOVER','ACQUIRE']);
    assert.equal(result.truth.prices.JP.propositions.PRICE_AMOUNT.value,1400);
    assert.deepEqual(calls[0].search.include_domains,['provider.example']);
    assert.equal(JSON.stringify(knowledge).includes('JPY 1 monthly'),false);
    const limited=await execute({input:{...i,bounds:{actions:1}}});
    assert.equal(limited.result.stop.reason,'CAPACITY_BOUND_REACHED');
    assert.equal(limited.result.truth.prices.JP.propositions.PRICE_AMOUNT.state,'UNRESOLVED');
});

test('provider navigation: relevant link followed, irrelevant/external links rejected, no crawl',async()=>{
    const i=input({permissions:{DIRECT:true},objective:{...input().objective,seeds:[home]}});
    const intro=page('Welcome to Orchard Club.',`<a href="/news">News</a><a href="/plans">Membership plans</a><a href="https://elsewhere.example/">Subscribe elsewhere</a>`);
    const {result,knowledge}=await execute({input:i,pages:{UNBOUND:{[home]:intro,[price]:enough()}}});
    assert.equal(result.stop.reason,'OBJECTIVE_ESTABLISHED');
    assert.deepEqual(knowledge.observations.map(o=>o.url),[home,price]);
    assert.equal(knowledge.destinations.length,2);
    assert.equal(knowledge.destinations[1].grounding.kind,'PROVIDER_LINK');
});

test('navigation intelligence can classify an observed non-keyword anchor, never invent its URL',async()=>{
    const i=input({permissions:{DIRECT:true},objective:{...input().objective,seeds:[home]}});
    const f=fixture({input:i,pages:{UNBOUND:{[home]:page('Welcome.','<a href="/plans">Explore your possibilities</a>'),[price]:enough()}}});
    const {result}=await runTarget({input:i,capabilities:f.caps,navigate:(links,needs)=>[{index:links.findIndex(l=>l.label==='Explore your possibilities'),needs:needs.map(n=>n.proposition)},{index:999,url:'https://provider.example/invented',needs:['PRICE_AMOUNT']}]});
    assert.equal(result.stop.reason,'OBJECTIVE_ESTABLISHED');
    assert.equal(f.calls.some(c=>c.url?.endsWith('invented')),false);
});

test('wrong market remains unresolved; geo observation itself is not market evidence',async()=>{
    for(const geo of [enough('AU'),partial()]) {
        const {result,knowledge}=await execute({direct:partial(),geo});
        assert.notEqual(result.stop.reason,'OBJECTIVE_ESTABLISHED');
        assert.equal(result.truth.prices.JP.established,false);
        assert.equal(knowledge.observations.length,2);
        assert.equal(result.stop.reason,'SEMANTIC_EXHAUSTION');
    }
});

test('same observation context consumed; semantic exhaustion distinct from capacity',async()=>{
    const exhausted=await execute({direct:partial(),geo:partial()});
    assert.equal(exhausted.result.usage.actions,2);
    assert.equal(exhausted.result.stop.reason,'SEMANTIC_EXHAUSTION');
    assert.ok(exhausted.knowledge.decisions.at(-1).evaluated.some(r=>r.reason==='SEMANTIC_DUPLICATE'));
    const bounded=await execute({direct:partial(),input:input({bounds:{actions:1}})});
    assert.equal(bounded.result.stop.reason,'CAPACITY_BOUND_REACHED');
    const httpBound=await execute({input:input({bounds:{networkRequests:1}})});
    assert.equal(httpBound.result.stop.reason,'CAPACITY_BOUND_REACHED');
    assert.equal(httpBound.calls.length,1);
});

test('planner proposals cannot manufacture truth, contexts, permissions or destinations',async()=>{
    const f=fixture({direct:partial(),geo:partial()});
    const {result}=await runTarget({input:f.input,capabilities:f.caps,reasoner:state=>{
        state.truth.established=true;
        return {propositions:{TARGET_MARKET:'JP'},proposals:[{kind:'ACQUIRE',url:'https://provider.example/invented',context:context('DIRECT'),needs:['JP:TARGET_MARKET'],value:999,reason:'Invented'}]};
    }});
    assert.equal(result.truth.prices.JP.established,false);
    assert.equal(f.calls.some(c=>c.url?.endsWith('invented')),false);
});

test('unstructured negative price controls stay unresolved',async t=>{
    for(const [name,s] of Object.entries({
        annual:'Personal subscription JPY 12000 annually, equivalent JPY 1000 per month.',
        benefit:'Personal subscription benefit credit value JPY 1400 per month.',
        installment:'Personal subscription JPY 1400 per month in installment arithmetic.',
        trial:'Personal subscription trial price JPY 1400 per month.',
        zero:'Personal subscription price JPY 0 per month.',
        cadence:'Personal subscription price JPY 1400.',
        currency:'Personal subscription price $14 per month.',
        ambiguity:'Personal subscription price JPY 1400 or JPY 2400 per month.',
        unrelated:'Personal subscription price JPY 1400 per month.',
        illustrative:'Example personal subscription price JPY 1400 per month.',
        negated:'This is not a personal subscription price JPY 1400 per month.'
    }))await t.test(name,async()=>{
        const body=page(s+' Available in JP.').replaceAll('Orchard Club',name==='unrelated'?'Another Service':'Orchard Club');
        const {result}=await execute({input:input({permissions:{DIRECT:true}}),direct:body});
        assert.equal(result.truth.prices.JP.established,false);
    });
});

test('minimal service propositions extracted independently from real prose',async()=>{
    const objective={...input().objective,kind:'SERVICE_QUALIFICATION',markets:[]};
    const body=page('Orchard Club has over 120,000 members.')+'<p>Personal consumer monthly subscription.</p><p>Members can log in to their account.</p><p>Members can manage their subscription after logging in.</p>';
    const caps=createCapabilities({objective,permissions:{DIRECT:true},network:{resolveHost:async()=>[{address:'93.184.216.34',family:4}],requestOnce:async r=>r.url.pathname==='/robots.txt'?response('',404,'text/plain'):response(body)}});
    const k=await runResearch({objective,permissions:{DIRECT:true},capabilities:caps,interpret:interpretWeb});
    assert.equal(evaluate(k).admitted,true);
    assert.equal(evaluate(k).service.SERVICE_SIZE_100K_PLUS.state,'ESTABLISHED');
    assert.equal(k.stop.reason,'OBJECTIVE_ESTABLISHED');
});

test('robots denial prevents provider request and Decodo bypass; unsafe redirects never acquired',async()=>{
    const denied=await execute({robots:'User-agent: *\nDisallow: /'});
    assert.equal(denied.calls.length,1);
    assert.equal(denied.knowledge.observations[0].outcome,'POLICY_BLOCKED');
    const redirect=await execute({redirect:'https://elsewhere.example/plans'});
    assert.equal(redirect.calls.some(c=>c.url?.includes('elsewhere')),false);
    assert.equal(redirect.result.truth.prices.JP.established,false);
});

test('geo proof failure rejects country observation, never relabels unbound content',async()=>{
    const wrong=await execute({wrongCountry:'AU',input:input({planning:{initialPerspective:'COUNTRY'}})});
    assert.equal(wrong.result.stop.code,'GEO_COUNTRY_MISMATCH');
    assert.equal(wrong.knowledge.observations.length,0);
    assert.equal(wrong.calls.some(c=>c.url===price),false);
});

test('interpreted source ambiguity and source bindings are inspectable',()=>{
    const observation={body:page('Personal subscription price JPY 1400.'),contentType:'text/html'};
    const p=projectWebSource(observation,input().objective);
    assert.ok(p.ambiguities[0].reasons.includes('CADENCE_NOT_EXPLICIT'));
    assert.equal(p.source.offers[0].cadence,null);
    assert.ok(p.bindings['/offers/0'].end>p.bindings['/offers/0'].start);
});

test('checkpoint resume preserves real HTTP accounting and consumed Direct context',async()=>{
    const f=fixture({direct:partial()});let saved;
    await assert.rejects(runTarget({input:f.input,capabilities:f.caps,save:s=>{saved=s;if(s.payload.observations.length===1&&!s.payload.pending)throw Error('OFFLINE_INTERRUPT');}}),/OFFLINE_INTERRUPT/);
    const resumed=await runTarget({input:f.input,capabilities:f.caps,snapshot:saved});
    assert.equal(resumed.result.usage.networkRequests,6);
    assert.equal(f.calls.filter(c=>c.url===price&&c.country==='UNBOUND').length,1);
    assert.equal(restore(saved).usage.actions,1);
});

test('standalone offline fixture adapter runs the same complete pipeline',async()=>{
    const i=input({permissions:{DIRECT:true},fixtures:[{url:'https://provider.example/robots.txt',transport:'DIRECT',status:404,contentType:'text/plain',body:''},{url:price,transport:'DIRECT',body:enough()}]});
    const {result}=await runTarget({input:i,capabilities:offlineCapabilities(i)});
    assert.equal(result.stop.reason,'OBJECTIVE_ESTABLISHED');
    assert.equal(result.usage.networkRequests,2);
});

test('changed geo exit after acquisition withholds the entire provider observation',async()=>{
    const value=await execute({changeExit:true,input:input({planning:{initialPerspective:'COUNTRY'}})});
    assert.equal(value.result.stop.code,'GEO_BINDING_CHANGED');
    assert.equal(value.knowledge.observations.length,0);
    assert.equal(value.result.usage.networkRequests,4);
});

test('hidden/script material and navigation labels cannot establish provider truth',async()=>{
    const body=page('Welcome.')+'<div><div hidden><p>Personal subscription price JPY 1400 per month. Available in JP.</p></div></div><script>Personal subscription price JPY 1400 per month. Available in JP.</script><a href="/account">Members can manage their subscription after logging in</a>';
    const {result}=await execute({input:input({permissions:{DIRECT:true}}),direct:body});
    assert.equal(result.truth.prices.JP.established,false);
    assert.equal(result.truth.service.MEMBERSHIP_MANAGEMENT_EXISTS.state,'UNRESOLVED');
});

test('explicit country name can support market, but locale/currency/transport cannot',async()=>{
    const named=await execute({direct:enough('Japan')});
    assert.equal(named.result.truth.prices.JP.established,true);
    const unlocalized=await execute({direct:partial(),geo:partial()});
    assert.equal(unlocalized.result.truth.prices.JP.propositions.TARGET_MARKET.state,'UNRESOLVED');
});

test('explicit amount notation is read completely, never as a numeric prefix',async()=>{
    for(const [notation,wanted] of [['JPY1,400/month',1400],['EUR 14,99 per month',14.99],['EUR 1.400,99 per month',1400.99]]) {
        const {result}=await execute({direct:page('Personal consumer subscription price '+notation+'. Available in JP.')});
        assert.equal(result.truth.prices.JP.propositions.PRICE_AMOUNT.value,wanted);
        assert.equal(result.stop.reason,'OBJECTIVE_ESTABLISHED');
    }
});

test('private DNS and missing geo credentials fail without any provider HTTP dispatch',async()=>{
    const i=input({permissions:{DIRECT:true}});
    const capabilities=createCapabilities({objective:i.objective,permissions:i.permissions,network:{resolveHost:async()=>[{address:'127.0.0.1',family:4}],requestOnce(){assert.fail('Unsafe DNS must fail before dispatch');}}});
    const {result}=await runTarget({input:i,capabilities});
    assert.equal(result.stop.code,'UNSAFE_DNS');
    assert.equal(result.usage.networkRequests,0);
    const j=input({permissions:{DECODO:true}});
    const unavailable=await runTarget({input:j,capabilities:createCapabilities({objective:j.objective,permissions:j.permissions,network:{resolveHost(){assert.fail('Credentials checked first');}}})});
    assert.equal(unavailable.result.stop.code,'DECODO_CONFIGURATION_REQUIRED');
});

test('single-target CLI stays offline and emits final truth/accounting/trace',()=>{
    const dir=mkdtempSync(join(tmpdir(),'v3-pipeline-'));
    try {
        const i=input({permissions:{DIRECT:true},fixtures:[{url:'https://provider.example/robots.txt',transport:'DIRECT',status:404,contentType:'text/plain',body:''},{url:price,transport:'DIRECT',body:enough()}]});
        const path=join(dir,'input.json');writeFileSync(path,JSON.stringify(i));
        const runner=fileURLToPath(new URL('./runner.mjs',import.meta.url));
        const report=JSON.parse(execFileSync(process.execPath,[runner,'--offline',path],{encoding:'utf8',maxBuffer:1048576}));
        assert.equal(report.stop.reason,'OBJECTIVE_ESTABLISHED');
        assert.equal(report.usage.networkRequests,2);
        assert.equal(report.trace[0].event,'INITIAL');
        assert.throws(()=>execFileSync(process.execPath,[runner,'--live',path],{stdio:'pipe'}));
    } finally {rmSync(dir,{recursive:true,force:true});}
});
