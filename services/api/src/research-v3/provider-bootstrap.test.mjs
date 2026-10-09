import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {bootstrapProvider,evaluateProviderCandidate,researchInputFromBinding} from './provider-bootstrap.mjs';
import {runAutonomous} from './provider-bootstrap-runner.mjs';
import {runTarget,offlineCapabilities} from './runner.mjs';
import {interpretBillingFixture} from './billing-fixtures.test-support.mjs';
import {createV2RobotsPublicAdapter} from '../research-v2/live/robots-policy.mjs';

const service='Glacier Radio',market='GB';
const body=(site,heading=service,extra='')=>`<html><head><title>${heading}</title><meta property="og:site_name" content="${site}"></head><body><main><h1>${heading}</h1>${extra}</main></body></html>`;
const direct=body(service);
const corporate=body('Northstar Media',service,'<script type="application/ld+json">{"@type":"Product","name":"Glacier Radio","provider":{"@type":"Organization","name":"Northstar Media"}}</script>');
const page=(url,html,extra={})=>({url,outcome:'OK',httpStatus:200,contentType:'text/html',rawSource:{text:html,contentType:'text/html'},sourceIntegrity:{sha256:createHash('sha256').update(html).digest('hex')},...extra});
const harness=(sites,urls=Object.keys(sites))=>({search:async()=>({results:urls.map(url=>({url,title:service}))}),read:async({url})=>sites[url]??{outcome:'UNRESOLVED'}});
const boot=(sites,urls)=>bootstrapProvider({service,market,...harness(sites,urls)});

test('service plus market discovers a clear exact-host provider and preserves source provenance',async()=>{
    const url='https://radio.example/';const result=await boot({[url]:page(url,direct)});
    assert.equal(result.status,'PROVIDER_BOUND');assert.equal(result.host,'radio.example');assert.equal(result.relation,'DIRECT_SERVICE_SITE');assert.equal(result.scope,'EXACT_HOST_IDENTITY_ONLY_NOT_MARKET');
    assert.equal(result.source.url,url);assert.equal(result.source.sha256,page(url,direct).sourceIntegrity.sha256);
    const input=researchInputFromBinding(result);assert.deepEqual(input.objective.providerHosts,['radio.example']);assert.deepEqual(input.objective.markets,['GB']);assert.equal(input.objective.marketEstablished,undefined);assert.equal(input.objective.providerNamespaces,undefined);
});
test('slug, punctuation, case, whitespace and trademark variants match ordinary display identity',()=>{
    for(const [requested,display] of [['consumer-reports','Consumer Reports™'],['the-globe-and-mail','The Globe and Mail'],['millie-s-library','Millie’s Library®'],['north-star','  NORTH   STAR  ']]){
        const url='https://provider.example/';
        const result=evaluateProviderCandidate({service:requested,candidate:{url},page:page(url,body(display,`${display} | Membership`))});
        assert.equal(result.status,'PROVIDER_BOUND',requested);
        assert.equal(result.diagnostics.identity.normalizedRequestedIdentity,requested.replace(/-/g,''));
    }
});
test('descriptive title suffix and first-party root presentation can establish identity without site metadata',()=>{
    const url='https://provider.example/';
    const html='<html><head><title>Consumer Reports — Membership and digital access</title></head><body><h1>Consumer Reports</h1></body></html>';
    const result=evaluateProviderCandidate({service:'consumer-reports',candidate:{url},page:page(url,html)});
    assert.equal(result.status,'PROVIDER_BOUND');assert.equal(result.diagnostics.identity.rootFirstPartyPresentation,true);
});
test('an explicit product/provider relationship can establish identity without service title or heading',()=>{
    const url='https://northstar.example/product';
    const html=body('Northstar Media','Subscription options','<script type="application/ld+json">{"@type":"Product","name":"Glacier Radio","provider":{"@type":"Organization","name":"Northstar Media"}}</script>');
    const result=evaluateProviderCandidate({service,candidate:{url},page:page(url,html)});
    assert.equal(result.status,'PROVIDER_BOUND');assert.equal(result.relation,'EXPLICIT_PRODUCT_PROVIDER');
    assert.equal(result.diagnostics.identity.titleMatches,false);
});
test('benign product and corporate WebSite and Organization names do not imply competing providers',()=>{
    const url='https://northstar.example/product';
    const structured='<script type="application/ld+json">{"@graph":[{"@type":"WebSite","name":"Northstar Media"},{"@type":"Organization","name":"Northstar Media Group"},{"@type":"Product","name":"Glacier Radio","provider":{"@type":"Organization","name":"Northstar Media"}}]}</script>';
    const result=evaluateProviderCandidate({service,candidate:{url},page:page(url,body(service,service,structured))});
    assert.equal(result.status,'PROVIDER_BOUND');assert.equal(result.relation,'EXPLICIT_PRODUCT_PROVIDER');
});
test('materially conflicting site identities remain unresolved',()=>{
    const url='https://other.example/';
    const structured='<script type="application/ld+json">{"@type":"WebSite","name":"Other Company"}</script>';
    const result=evaluateProviderCandidate({service,candidate:{url},page:page(url,body(service,service,structured))});
    assert.equal(result.reason,'COMPETING_SITE_IDENTITIES');
    assert.deepEqual(result.diagnostics.identity.siteNames,[service,'Other Company']);
    const partialRelation='<script type="application/ld+json">{"@graph":[{"@type":"WebSite","name":"Other Company"},{"@type":"Organization","name":"Northstar Media"},{"@type":"Product","name":"Glacier Radio","provider":{"@type":"Organization","name":"Northstar Media"}}]}</script>';
    assert.equal(evaluateProviderCandidate({service,candidate:{url},page:page(url,body(service,service,partialRelation))}).reason,'COMPETING_SITE_IDENTITIES');
});
test('plain review and comparison presentations are refused without structured Review markup',()=>{
    const url='https://reviews.example/';
    for(const heading of ['Glacier Radio Reviews','Reviews of Glacier Radio','Glacier Radio — Comparison of Alternatives']){
        const result=evaluateProviderCandidate({service,candidate:{url},page:page(url,body(service,heading))});
        assert.equal(result.reason,'THIRD_PARTY_PAGE',heading);
    }
    const ownName='The Review Room';
    assert.equal(evaluateProviderCandidate({service:ownName,candidate:{url},page:page(url,body(ownName,ownName))}).status,'PROVIDER_BOUND');
});
test('search result or model confidence alone cannot bind',async()=>{
    const url='https://radio.example/';assert.equal((await boot({},[url])).status,'UNRESOLVED_PROVIDER_IDENTITY');
    assert.equal(evaluateProviderCandidate({service,candidate:{url},page:{...page(url,body('Reviews Inc')),modelConfidence:1}}).status,'CANDIDATE');
});
test('unrelated same-name site with competing first-party identity stays unbound',async()=>{
    const url='https://other.example/';const result=await boot({[url]:page(url,body('Other Company'))});
    assert.equal(result.status,'UNRESOLVED_PROVIDER_IDENTITY');assert.equal(result.candidates[0].reason,'PROVIDER_PRODUCT_RELATIONSHIP_UNRESOLVED');
});
test('reseller, review, listing and marketplace pages are not provider sites',async()=>{
    for(const site of ['Affiliate Shop','Reader Reviews','Application Listing','Market Square']){
        const url='https://third.example/';const result=await boot({[url]:page(url,body(site,service))});
        assert.equal(result.status,'UNRESOLVED_PROVIDER_IDENTITY',site);
    }
    const url='https://reviews.example/';
    const listing=body(service,service,'<script type="application/ld+json">{"@type":"Review","name":"Glacier Radio"}</script>');
    assert.equal((await boot({[url]:page(url,listing)})).status,'UNRESOLVED_PROVIDER_IDENTITY');
});
test('explicit product and corporate relationship may bind without a matching domain string',async()=>{
    const url='https://northstar.example/product';const result=await boot({[url]:page(url,corporate)});
    assert.equal(result.status,'PROVIDER_BOUND');assert.equal(result.host,'northstar.example');assert.equal(result.relation,'EXPLICIT_PRODUCT_PROVIDER');
});
test('source-owned same-origin product link can recover from a nonmatching corporate root',async()=>{
    const root='https://northstar.example/',product=root+'product';
    const sites={[root]:page(root,body('Northstar Media','Northstar Media','<a href="/product">Glacier Radio</a>')),[product]:page(product,corporate)};
    const result=await boot(sites,[root]);assert.equal(result.status,'PROVIDER_BOUND');assert.equal(result.entryUrl,product);
});
test('normalized search query and source-link label route a slug to a same-origin product page',async()=>{
    const root='https://publisher.example/',product=root+'product',queries=[];
    const sites={[root]:page(root,body('Publisher House','Publisher House','<a href="/product">Consumer Reports Membership</a>')),[product]:page(product,body('Consumer Reports','Consumer Reports — Digital subscription'))};
    const result=await bootstrapProvider({service:'consumer-reports',market:'GB',search:async({query,target})=>{queries.push({query,target});return {results:[{url:root}]};},read:async({url})=>sites[url]});
    assert.equal(result.status,'PROVIDER_BOUND');assert.equal(result.entryUrl,product);
    assert.deepEqual(queries.map(q=>q.query),['consumer reports official site','consumer reports GB official subscription']);
    assert(queries.every(q=>q.target.market==='GB'));
});
test('materially competing clear hosts stay unresolved even if one ranks first',async()=>{
    const a='https://one.example/',b='https://two.example/';const result=await boot({[a]:page(a,direct),[b]:page(b,direct)});
    assert.equal(result.status,'UNRESOLVED_PROVIDER_IDENTITY');assert.equal(result.reason,'COMPETING_PROVIDER_HOSTS');
});
test('failed candidate acquisition recovers to a later clear source',async()=>{
    const failed='https://failed.example/',good='https://radio.example/';
    const result=await boot({[good]:page(good,direct)},[failed,good]);
    assert.equal(result.status,'PROVIDER_BOUND');assert.equal(result.host,'radio.example');assert.equal(result.candidates[0].status,'CANDIDATE');
});
test('reader exception is retained as a bounded failure code',async()=>{
    const url='https://failed.example/';
    const result=await bootstrapProvider({service,market,search:async()=>({results:[{url}]}),read:async()=>{throw Error('private adapter detail');}});
    assert.equal(result.status,'UNRESOLVED_PROVIDER_IDENTITY');
    assert.equal(result.candidates[0].diagnostics.acquisition.adapter.failureCode,'READ_EXCEPTION');
    assert.equal(JSON.stringify(result).includes('private adapter detail'),false);
});
test('the reused V2 public reader yields discovery-only intact page evidence',async()=>{
    const url='https://radio.example/',calls=[];
    const adapter=createV2RobotsPublicAdapter({authorities:[],retainRaw:true,maxReads:1,maxRequests:4,network:{authorityOrigins:[new URL(url).origin],maxRedirects:1,maxBytes:1048576,resolveHost:async()=>[{address:'93.184.216.34',family:4}],requestOnce:async({url:request})=>{
        calls.push(request.href);return {status:200,headers:{'content-type':request.pathname==='/robots.txt'?'text/plain':'text/html'},body:Buffer.from(request.pathname==='/robots.txt'?'User-agent: *\nAllow: /':direct)};
    }}});
    const result=await bootstrapProvider({service,market,search:async()=>({results:[{url,title:service}]}),read:request=>adapter.read({url:request.url,targetCountry:market,maxRedirects:1})});
    assert.equal(result.status,'PROVIDER_BOUND');assert.equal(result.host,'radio.example');assert.deepEqual(calls,['https://radio.example/robots.txt',url]);
});
test('foreign redirect, canonical and altered source bytes cannot grant a host',async()=>{
    const a='https://one.example/',b='https://two.example/';
    assert.equal(evaluateProviderCandidate({service,candidate:{url:a},page:page(b,direct)}).status,'CANDIDATE');
    const foreign=direct.replace('</head>','<link rel="canonical" href="https://other.example/"></head>');
    assert.equal(evaluateProviderCandidate({service,candidate:{url:a},page:page(a,foreign)}).reason,'FOREIGN_CANONICAL');
    assert.equal(evaluateProviderCandidate({service,candidate:{url:a},page:{...page(a,direct),sourceIntegrity:{sha256:'altered'}}}).status,'CANDIDATE');
});
test('non-intact and rejected intact candidates retain bounded diagnostics without page bodies',async()=>{
    const url='https://blocked.example/';
    const denied={url,outcome:'ACCESS_CONTROL_STOP',failure:{code:'ROBOTS_ACCESS_STOP'},httpStatus:403,contentType:'text/plain',redirectDiagnostic:{stage:'PAGE',httpStatus:302,limit:1,followed:1,destination:{valid:true,https:true,sameOrigin:false}},accessDecisions:[{decision:'DISALLOWED',reason:'APPLICABLE_RULE',boundary:'APPLICABLE_DISALLOW',httpStatus:200,rejectionDiagnostic:{stage:'ROBOTS',httpStatus:302}}],bodyDiagnostic:{stage:'STREAM',limit:1048576,receivedBytes:1048577}};
    const result=await boot({[url]:denied},[url]);const candidate=result.candidates[0];
    assert.equal(candidate.reason,'NO_INTACT_SAME_ORIGIN_PAGE');
    const {adapter,content}=candidate.diagnostics.acquisition;
    assert.equal(adapter.outcome,'ACCESS_CONTROL_STOP');
    assert.equal(adapter.failureCode,'ROBOTS_ACCESS_STOP');
    assert.equal(adapter.httpStatus,403);
    assert.equal(adapter.redirectDiagnostic.destination.sameOrigin,false);
    assert.equal(adapter.accessDecisions[0].decision,'DISALLOWED');
    assert.equal(content.type,'text/plain');
    assert.equal(content.bodyDiagnostic.receivedBytes,1048577);
    assert(candidate.diagnostics.acquisition.failedChecks.includes('outcomeOk'));
    const intact=evaluateProviderCandidate({service,candidate:{url},page:page(url,body('Other Company',service))});
    assert.equal(intact.reason,'PROVIDER_PRODUCT_RELATIONSHIP_UNRESOLVED');
    assert.equal(intact.diagnostics.identity.normalizedRequestedIdentity,'glacierradio');
    assert.deepEqual(intact.diagnostics.identity.siteNames,['Other Company']);
    assert.equal(JSON.stringify(candidate).includes('<html'),false);
});
test('bootstrap failure does not construct or run a V3 objective',async()=>{
    let prepared=0,ran=0;const url='https://unknown.example/';
    const result=await runAutonomous({service,market,bootstrap:harness({},[url]),prepare:async()=>{prepared++;},run:async()=>{ran++;}});
    assert.equal(result.bootstrap.status,'UNRESOLVED_PROVIDER_IDENTITY');assert.equal(result.result,null);assert.equal(prepared,0);assert.equal(ran,0);
});
test('bound provider enters existing V3 runner with unchanged Truth evaluation',async()=>{
    const url='https://radio.example/';let seen;
    const result=await runAutonomous({service,market,bootstrap:harness({[url]:page(url,direct)}),prepare:async input=>{
        seen=input;const fixtureInput={...input,semantic:{mode:'LEGACY_STATIC'},fixtures:[{url,transport:'DIRECT',body:body(service,service,'Personal consumer subscription price GBP 12 per month.')},{url:'https://radio.example/robots.txt',transport:'DIRECT',body:'User-agent: *\nAllow: /',contentType:'text/plain'}]};
        return {capabilities:offlineCapabilities(fixtureInput),fixtureInput};
    },run:async({input,capabilities})=>runTarget({input:{...input,semantic:{mode:'LEGACY_STATIC'}},capabilities,interpret:interpretBillingFixture})});
    assert.equal(result.bootstrap.status,'PROVIDER_BOUND');assert.deepEqual(seen.objective.providerHosts,['radio.example']);assert.equal(result.result.objective.serviceId,'glacier-radio');
    assert.equal(result.result.objective.markets[0],'GB');assert.equal(result.result.objective.providerHosts.length,1);
    assert.equal(result.result.truth.prices.GB.propositions.TARGET_MARKET.state,'UNRESOLVED');
});
