import {firstEstablishedUsage,firstEstablishedAttempts} from './catalog-progress.test-support.mjs';
import {interpretBillingFixture} from './billing-fixtures.test-support.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createKnowledge,addDestination,checkpoint,restore,digest,context,actionIdentity,pricePropositions} from './model.mjs';
import {extractNavigation,extractSitemap,queryFamilies,discoveryCapacity,rankCandidate} from './discovery.mjs';
import {navigationOwned,validateNamespaces} from './discovery-authority.mjs';
import {runResearch,availableActions} from './engine.mjs';
import {runTarget,offlineCapabilities} from './runner.mjs';
import {createReasoner} from './reasoner.mjs';
import {evaluate} from './truth.mjs';
import {interpretWeb} from './source.mjs';
import {parseAcquisitionRobots,evaluateAcquisitionRobots} from './acquisition-robots.mjs';
const host='provider.example',home='https://'+host+'/',price=home+'plans';
const objective=(extra={})=>({kind:'PRICE',serviceId:'orchard',serviceName:'Orchard Club',providerHosts:[host],markets:['JP'],seeds:[home],...extra});
const html=(text='',links='')=>`<html><head><title>Orchard Club</title></head><body><h1>Orchard Club</h1><p>${text}${text.includes("per month")?" Billed monthly.":""}</p>${links}</body></html>`;
const sufficient=(currency='JPY',market='JP')=>html(`Personal consumer subscription price ${currency} 1400 per month. Available in ${market}.`);
const observation=(body,extra={})=>({id:'observation-1',url:home,body,sha256:digest(body),outcome:'OK',completeness:'COMPLETE',format:'WEB',contentType:'text/html',truncated:false,context:context('DIRECT'),...extra});
function fixtureInput(pages,extra={}) {
    const o=extra.objective??objective(),permissions=extra.permissions??{DIRECT:true};
    const fixtures=Object.entries(pages).flatMap(([url,value])=>{
        const data=typeof value==='string'?{body:value}:value;
        return ['DIRECT','DECODO'].map(transport=>({url,transport,...(transport==='DECODO'?{country:o.markets[0]}:{}),...data}));
    });
    const origins=new Set(Object.keys(pages).map(u=>new URL(u).origin));
    for(const origin of origins)if(!pages[origin+'/robots.txt'])for(const transport of ['DIRECT','DECODO'])fixtures.push({url:origin+'/robots.txt',body:'User-agent: *\nAllow: /',contentType:'text/plain',transport,...(transport==='DECODO'?{country:o.markets[0]}:{})});
    return {objective:o,provider:{reviewed:true,serviceId:o.serviceId,hosts:o.providerHosts},permissions,fixtures,planning:{initialPerspective:'AUTO'},...extra};
}
async function site(pages,extra={},hooks={}) {
    const input=fixtureInput(pages,extra);
    return runTarget({input,interpret:interpretBillingFixture,capabilities:offlineCapabilities(input),...hooks});
}
const amounts=r=>r.result.truth.prices[r.result.objective.markets[0]].propositions;
const extract=body=>extractNavigation(observation(body),objective(),pricePropositions);

test('simple provider completes without discovery despite many source links',async()=>{
    const r=await site({[home]:sufficient()+Array.from({length:300},(_,i)=>`<a href="/plans/${i}">Plans</a>`).join('')});
    assert.ok(r.result.trace.some(t=>t.event==='OBSERVATION'&&t.evaluations?.established));assert.equal(firstEstablishedUsage(r.result).actions,1);assert.equal(firstEstablishedUsage(r.result).searches,0);assert.ok(r.knowledge.destinations.length>1);assert.ok(r.knowledge.observations[0].navigation.length);assert.notEqual(r.result.catalog.state,'CATALOG_EXHAUSTED');
});
test('internal pricing page crosses acquisition and unchanged native truth',async()=>{
    const r=await site({[home]:html('Welcome','<nav><a href="/news">News</a><a href="/plans">Subscription plans</a></nav>'),[price]:sufficient()});
    assert.deepEqual(r.knowledge.observations.map(o=>o.url),[home,price]);assert.equal(r.result.truth.established,true);assert.equal(r.knowledge.destinations.find(d=>d.url===price).grounding.source.bodySha256,r.knowledge.observations[0].sha256);
});
for(const label of ['料金を見る','요금 안내','الاشتراك','Планы','Abonnements','Μελών'])test('structural navigation survives unseen label '+label,async()=>{
    const path=home+'surface-7',r=await site({[home]:html('Welcome',`<nav><a href="/surface-7">${label}</a></nav>`),[path]:sufficient()});
    assert.equal(r.result.truth.established,true);assert.equal(firstEstablishedUsage(r.result).acquisitions,2);assert.equal(r.knowledge.destinations.find(d=>d.url===path).discovery.label,label);
});
test('explicit locale hints rank target but do not veto other language destinations',async()=>{
    const b=html('','<link rel="alternate" hreflang="de-DE" href="/de"><link rel="alternate" hreflang="ja-JP" href="/jp-surface">');
    const plan=extract(b);assert.equal(plan.candidates[0].url,home+'jp-surface');assert.equal(plan.candidates.length,2);
    const r=await site({[home]:b,[home+'jp-surface']:html('Personal consumer subscription price JPY 1400 per month.')},{permissions:{DECODO:true}});
    assert.equal(r.result.truth.established,true);assert.equal(r.knowledge.observations[1].transport.verification,'BRACKET_VERIFIED');assert.equal(amounts(r).TARGET_MARKET.evidence[0].reference.marketContext.basis,'VERIFIED_COUNTRY_OBSERVATION');
});
test('same URL country presentations remain separate after navigation',async()=>{
    const o=objective({markets:['JP','AU'],seeds:[price]}),k=await runResearch({objective:o,permissions:{DIRECT:true,DECODO:true},reasoner:createReasoner(),capabilities:{DIRECT:a=>({url:a.url,context:a.context,body:JSON.stringify({serviceId:'orchard',offers:[]}),outcome:'OK'}),DECODO:a=>({url:a.url,context:a.context,body:JSON.stringify({serviceId:'orchard',offers:[{id:'ordinary',amount:a.context.networkGeography==='JP'?100:200,currency:'USD',cadence:'MONTHLY',billingCadence:'MONTHLY',consumer:true,relationship:'SUBSCRIPTION',role:'ORDINARY',market:a.context.networkGeography}]}),outcome:'OK'})}});
    assert.equal(evaluate(k).established,true);assert.equal(k.usage.countryAcquisitions,2);assert.equal(new Set(k.observations.map(o=>o.id)).size,2);
});
test('search needed: finite family discovers provider material, snippet is not evidence',async()=>{
    const r=await site({[home]:html('Welcome'),[price]:sufficient()},{permissions:{DIRECT:true,TAVILY:true},discoveries:[{url:price,content:'JPY 9 per month in JP'}]});
    assert.equal(r.result.truth.established,true);assert.equal(amounts(r).PRICE_AMOUNT.value,1400);assert.deepEqual(firstEstablishedAttempts(r.knowledge).map(a=>a.action.kind),['ACQUIRE','DISCOVER','ACQUIRE']);
});
test('finite query family identities cannot be expanded by paraphrases or need changes',async()=>{
    const k=await runResearch({objective:objective({seeds:[]}),permissions:{TAVILY:true},capabilities:{TAVILY:()=>({results:[]})}});
    assert.equal(firstEstablishedUsage(k).searches,3);assert.equal(k.stop.reason,'SEMANTIC_EXHAUSTION');
    const f=queryFamilies(objective(),'JP',['JP:PRICE_AMOUNT']);assert.equal(new Set(f.map(actionIdentity)).size,3);assert.equal(actionIdentity(f[0]),actionIdentity({...f[0],query:'paraphrase',needs:['JP:CURRENCY']}));
    const offered=availableActions(createKnowledge({objective:objective({seeds:[]}),permissions:{TAVILY:true}}),{TAVILY:()=>{}},[{...f[0],family:'infinite-new-family'}]);assert.ok(offered.evaluated.some(r=>r.reason==='INVALID_DISCOVERY_FAMILY'));
});
test('bounded optional homepage bootstrap uses reviewed hosts rather than guessed pricing routes',async()=>{
    const r=await site({[home]:sufficient()},{objective:objective({seeds:[]}),discovery:{bootstrapRoots:true}});assert.equal(r.result.truth.established,true);assert.equal(r.knowledge.destinations[0].grounding.kind,'PROVIDER_ROOT');
});
test('misleading search snippet and URL cannot establish price',async()=>{
    const r=await site({[home]:html('Welcome'),[price]:html('A client shell')},{permissions:{DIRECT:true,TAVILY:true},discoveries:[{url:price,content:'JPY 1080 per month, available in JP'}]});assert.equal(r.result.truth.established,false);assert.equal(amounts(r).PRICE_AMOUNT.state,'UNRESOLVED');
});
test('multiple pages rank current objective but do not borrow plan evidence',async()=>{
    const r=await site({[home]:html('','<nav><a href="/account">Account</a><a href="/plans">Subscription plans</a><a href="/news">News</a></nav>'),[price]:sufficient()});assert.equal(firstEstablishedUsage(r.result).acquisitions,2);assert.equal(r.knowledge.observations[1].url,price);assert.equal(amounts(r).PRICE_AMOUNT.evidence[0].reference.observation,r.knowledge.observations[1].id);
});
test('duplicate normalization retains distinct provenance and meaningful query selectors',async()=>{
    const r=await site({[home]:html('','<a href="/plans#buy">Plans</a><a href="/plans?utm_source=nav">Plans</a><link rel="canonical" href="/plans">'),[price]:sufficient()});
    const d=r.knowledge.destinations.find(d=>d.url===price);assert.equal(firstEstablishedUsage(r.result).acquisitions,2);assert.equal(d.provenance.length,3);
    const p=extract('<a href="/p?plan=A">A</a><a href="/p?plan=B">B</a>');assert.equal(new Set(p.candidates.map(c=>c.url)).size,2);
});
test('discovered legitimate redirect uses normal bounded acquisition and ancestry',async()=>{
    const r=await site({[home]:html('','<a href="/plans">Plans</a>'),[price]:{status:301,location:'/current'},[home+'current']:sufficient()});assert.equal(r.result.truth.established,true);assert.equal(r.knowledge.observations[1].url,home+'current');assert.ok(r.knowledge.observations[1].redirects.length);
});
test('multi-megabyte discovered page retains late price, model capacity remains independent',async()=>{
    const r=await site({[home]:html('','<a href="/plans">Plans</a>'),[price]:'<!--'+'x'.repeat(3*1024*1024)+'-->'+sufficient()});assert.equal(r.result.truth.established,true);assert.ok(r.knowledge.observations[1].bytes>3*1024*1024);assert.equal(r.result.usage.modelCalls,0);assert.equal(r.knowledge.observations[1].truncated,false);
});
test('sitemap index -> sitemap -> provider price uses bounded ordinary acquisition',async()=>{
    const index=home+'map-index.xml',map=home+'map.xml';
    const r=await site({[home]:html('','<link rel="sitemap" href="/map-index.xml">'),[index]:{body:`<sitemapindex><sitemap><loc>${map}</loc></sitemap></sitemapindex>`,contentType:'application/xml'},[map]:{body:`<urlset><url><loc>${price}</loc></url></urlset>`,contentType:'application/xml'},[price]:sufficient()});
    assert.equal(r.result.truth.established,true);assert.equal(firstEstablishedUsage(r.result).sitemapAcquisitions,2);assert.equal(firstEstablishedUsage(r.result).acquisitions,4);assert.deepEqual(r.knowledge.observations.map(o=>o.url),[home,price]);assert.equal(r.knowledge.navigationResources.length,2);
});
test('robots sitemap declaration retains independently acquired source, policy unchanged',async()=>{
    const robots=home+'robots.txt',map=home+'map.xml';
    const r=await site({[robots]:{body:`User-agent: *\nAllow: /\nSitemap: ${map}\n`,contentType:'text/plain'},[home]:html('Welcome'),[map]:{body:`<urlset><url><loc>${price}</loc></url></urlset>`,contentType:'text/xml'},[price]:sufficient()});
    assert.equal(r.result.truth.established,true);assert.ok(r.knowledge.navigationResources.some(o=>o.kind==='ROBOTS'));assert.equal(r.knowledge.destinations.find(d=>d.url===map).grounding.kind,'ROBOTS_SITEMAP');
    const p=parseAcquisitionRobots('User-agent: *\nDisallow: /private\nSitemap: '+map);assert.equal(evaluateAcquisitionRobots(p,home+'private').decision,'DISALLOWED');assert.equal(p.sitemaps.length,1);
});
test('sitemap prose/price and paths are navigation only, never price evidence',async()=>{
    const map=home+'map.xml',r=await site({[home]:html('','<link rel="sitemap" href="/map.xml">'),[map]:{body:`<urlset><url><loc>${price}</loc><note>Personal consumer subscription price JPY 1400 per month. Available in JP.</note></url></urlset>`,contentType:'application/xml'},[price]:html('Client shell')});assert.equal(amounts(r).PRICE_AMOUNT.state,'UNRESOLVED');assert.equal(r.knowledge.navigationResources.length,1);assert.equal(r.result.truth.established,false);
});
for(const bad of ['<!DOCTYPE urlset [<!ENTITY bad SYSTEM "file:///private/a">]><urlset/>','<html>pricing</html>','<urlset><loc>https://unowned.example/plans</loc></urlset>'])test('sitemap unsafe or irrelevant input stays outside truth '+bad.slice(0,20),()=>{
    const o=observation(bad);if(bad.startsWith('<urlset>'))assert.equal(extractSitemap(o,objective(),pricePropositions).candidates.length,0);else assert.throws(()=>extractSitemap(o,objective(),pricePropositions),/SITEMAP_UNSUPPORTED/);
});
test('sitemap capacity caps examined entries independently of frontier and acquisitions',()=>{
    const body='<urlset>'+Array.from({length:discoveryCapacity.sitemapEntries+2},(_,i)=>`<url><loc>${home+i}</loc></url>`).join('')+'</urlset>',p=extractSitemap(observation(body),objective(),pricePropositions);assert.equal(p.candidates.length,discoveryCapacity.sitemapEntries);assert.equal(p.limited,true);
});
for(const n of [0,1,64,2047,2048,2049])test('extraction boundary '+n,()=>{
    const p=extract(Array.from({length:n},(_,i)=>`<a href="/${i}">Link ${i}</a>`).join(''));assert.equal(p.candidates.length,Math.min(n,discoveryCapacity.extracted));assert.equal(p.limited,n>discoveryCapacity.extracted);
});
for(const kind of ['script','style','template'])test('hidden executable container is not a destination '+kind,()=>assert.equal(extract(`<${kind}><a href="/plans">Plans</a></${kind}>`).candidates.length,0));
test('inert declared structured navigation, accessible label, options and GET forms are source-owned',()=>{
    const body='<script type="application/ld+json">{"@type":"SiteNavigationElement","name":"契約","url":"/choice"}</script><a href="/screen" aria-label="Abonnement"><img alt="Other"></a><option value="/local" lang="fr-FR">FR</option><form method="get" action="/lookup" aria-label="Search"></form><form method="post" action="/pay"></form><script type="application/json">{"apiUrl":"/invented","url":"/also-invented"}</script>';
    const p=extract(body);assert.equal(p.candidates.length,6);assert.ok(p.candidates.every(c=>c.source.sha256===digest(body.slice(c.source.start,c.source.end))));assert.equal(p.candidates.find(c=>c.url.endsWith('/screen')).label,'Abonnement');assert.ok(p.candidates.find(c=>c.kind==='STRUCTURED_NAVIGATION').source.pointer!==undefined);
});
for(const url of ['http://provider.example/plans','https://attacker.example/plans','https://provider.example.attacker.example/plans','javascript:alert(1)','https://127.0.0.1/plans','/go?next=https%3A%2F%2Fattacker.example%2F'])test('unsafe/unreviewed navigation '+url,()=>assert.equal(extract(`<a href="${url}">Plans</a>`).candidates.length,0));
test('source integrity or incomplete observation cannot yield navigation',()=>{for(const changes of [{sha256:'forged'},{truncated:true},{completeness:'INCOMPLETE'},{outcome:'ERROR'}])assert.deepEqual(extractNavigation(observation('<a href="/plans">Plans</a>',changes),objective(),pricePropositions).candidates,[]);});
const namespace={domain:'provider.example',reviewed:true,scope:'OWNED_DNS_NAMESPACE',reference:'operator-owned-namespace-review'};
test('reviewed namespace covers www/localized/product/support hosts, not sibling domains',()=>{
    const o=objective({providerNamespaces:[namespace]});validateNamespaces(o);
    for(const h of ['www.provider.example','locale.provider.example','products.provider.example','support.provider.example'])assert.equal(navigationOwned(o,'https://'+h+'/'),true);
    for(const h of ['other.example','provider.example.attacker.example','unreviewed-provider.example'])assert.equal(navigationOwned(o,'https://'+h+'/'),false);
    assert.equal(navigationOwned(objective(),'https://www.provider.example/'),false);
});
test('related official domains require explicit review, a link cannot confer authority',()=>{
    const o=objective({providerHosts:[host,'official-related.example']});assert.equal(navigationOwned(o,'https://official-related.example/'),true);assert.equal(navigationOwned(objective(),'https://official-related.example/'),false);
});
for(const change of [{reviewed:false},{scope:'SUFFIX_GUESS'},{reference:''},{domain:'attacker.example'},{domain:'https://provider.example'},{domain:'provider.example/path'}])test('bad namespace permission '+JSON.stringify(change),()=>assert.throws(()=>createKnowledge({objective:objective({providerNamespaces:[{...namespace,...change}]})}),/INVALID_PROVIDER_NAMESPACE/));
test('reviewed subdomain acquired normally, exact authority materialized and restored',async()=>{
    const target='https://support.provider.example/plans',o=objective({providerNamespaces:[namespace]});let saved;
    const input=fixtureInput({[home]:html('','<nav><a href="'+target+'">Plans</a></nav>'),[target]:sufficient()},{objective:o});
    const r=await runTarget({input,interpret:interpretBillingFixture,capabilities:offlineCapabilities(input),save:s=>{saved=s;}});assert.equal(r.result.truth.established,true);assert.ok(r.knowledge.objective.providerHosts.includes('support.provider.example'));assert.equal(r.knowledge.authorityBindings[0].reference,namespace.reference);
    const resumed=await runTarget({input,interpret:interpretBillingFixture,snapshot:saved,capabilities:offlineCapabilities(input)});assert.deepEqual(resumed.result.truth,r.result.truth);
    const wrong={...input,objective:{...o,providerNamespaces:[]}};await assert.rejects(()=>runTarget({input:wrong,snapshot:saved,capabilities:offlineCapabilities(input)}),/RESUME_OBJECTIVE_MISMATCH/);
});
test('different grounded destination recovers failed acquisition without retrying failed URL/context',async()=>{
    const pages={ [home]:html('','<nav><a href="/plans-failed">Plans</a><a href="/plans-ok">Plans</a></nav>'),[home+'plans-ok']:sufficient() },input=fixtureInput(pages),caps=offlineCapabilities(input),real=caps.DIRECT;
    caps.DIRECT=async (a,limits)=>a.url.endsWith('plans-failed')?{failure:{kind:'ACQUISITION',code:'PROVIDER_HEADERS_TIMEOUT'},accounting:{requests:1,bytes:0,decodedBytes:0,retainedBytes:0}}:real(a,limits);
    // Stable explicit advisory priority for the first failure, then the surviving destination.
    const r=await runTarget({input,interpret:interpretBillingFixture,capabilities:caps,navigate:rows=>rows.filter(c=>c.url.endsWith('plans-failed')).map(c=>({candidateId:c.id,needs:pricePropositions}))});
    assert.equal(r.result.truth.established,true);assert.equal(r.knowledge.attempts.filter(a=>a.action.url?.endsWith('plans-failed')).length,1);assert.ok(r.knowledge.trace.some(t=>t.event==='GROUNDED_FAILURE_RECOVERY'));
});
test('advisory selection cannot invent href, assert truth or mutate permissions',async()=>{
    const r=await site({[home]:html('','<nav><a href="/surface">契約</a></nav>'),[home+'surface']:html('Client shell')},{},{navigate:(rows,needs)=>{rows[0].url=home+'invented';needs.length=0;return [{candidateId:'forged',url:price,needs:pricePropositions,truthState:'ESTABLISHED'},{candidateId:rows[0].id,needs:pricePropositions,amount:1080,currency:'JPY',market:'JP'}];}});
    assert.equal(r.result.truth.established,false);assert.equal(r.knowledge.destinations.some(d=>d.url===home+'invented'),false);assert.equal(amounts(r).PRICE_AMOUNT.state,'UNRESOLVED');
});
test('advisory dependency failure preserves native navigation',async()=>{const r=await site({[home]:html('','<nav><a href="/surface">契約</a></nav>'),[home+'surface']:sufficient()},{},{navigate:async()=>{throw Error('offline model unavailable');}});assert.equal(r.result.truth.established,true);assert.ok(r.knowledge.trace.some(t=>t.event==='NAVIGATION_ADVICE_UNAVAILABLE'));});
for(const discovery of [{kind:'SEARCH',label:'JPY 1080 monthly JP',score:20},{kind:'SITEMAP_ENTRY',label:'plans',locale:'ja-JP',score:20},{kind:'MODEL_ADVICE',label:'verified',score:20}])test('identical admitted source/evidence truth invariant despite '+discovery.kind,async()=>{
    const r=await site({[home]:sufficient()}),before=evaluate(r.knowledge),k=restore(checkpoint(r.knowledge));k.destinations[0].discovery=discovery;k.destinations[0].grounding={kind:'DISCOVERY_RESULT',snippet:'JPY 1 monthly'};k.trace.push({event:'UNTRUSTED_ADVICE',established:true});assert.deepEqual(evaluate(k),before);assert.equal(evaluate(k).prices.JP.propositions.PRICE_AMOUNT.value,1400);
});
for(const text of ['Japanese language 日本語 only','JPY currency only','/jp/ market path','Personal consumer subscription JPY 1400 per month.'])test('discovery cannot establish independent market '+text,async()=>{
    const r=await site({[home]:html(text,'<a href="/jp/pricing">JPY plans</a>'),[home+'jp/pricing']:html(text)});assert.equal(amounts(r).TARGET_MARKET.state,'UNRESOLVED');assert.equal(r.result.truth.established,false);
});
test('frontier bound preserves seeds and attempted sources, replaces only lower-value unattempted candidates',()=>{
    const k=createKnowledge({objective:objective(),bounds:{candidateDestinations:3}});
    for(const [path,score]of [['a',1],['b',2],['c',10]])addDestination(k,{url:home+path,depth:1,needs:pricePropositions,grounding:{kind:'PROVIDER_LINK',observation:'o'},discovery:{score}});
    assert.equal(k.destinations.length,3);assert.ok(k.destinations.some(d=>d.url===home));assert.ok(!k.destinations.some(d=>d.url===home+'a'));assert.ok(k.trace.some(t=>t.event==='FRONTIER_REPLACED'));
});
test('bounded provenance merge and context-aware checkpoints preserve exact candidate identities',()=>{
    const k=createKnowledge({objective:objective(),bounds:{discoveryProvenance:2}}),plan=extract('<nav><a href="/plans">Plans</a><link rel="canonical" href="/plans"></nav>');
    for(let i=0;i<5;i++)addDestination(k,{url:price,depth:1,needs:pricePropositions,grounding:{kind:'PROVIDER_LINK',observation:'o',pointer:'/x/'+i},discovery:plan.candidates[0]});
    assert.equal(k.destinations[1].provenance.length,2);assert.deepEqual(restore(checkpoint(k)).destinations,k.destinations);assert.deepEqual(extract('<nav><a href="/plans">Plans</a><link rel="canonical" href="/plans"></nav>').candidates,JSON.parse(JSON.stringify(plan.candidates)));
    assert.notEqual(actionIdentity({kind:'ACQUIRE',url:price,context:context('DIRECT')}),actionIdentity({kind:'ACQUIRE',url:price,context:context('DECODO','JP')}));
});
test('sitemap bound and navigation-depth exhaustion do not masquerade as truth',async()=>{
    const map=home+'map.xml';for(const bounds of [{sitemapAcquisitions:0},{navigationDepth:0}]){const r=await site({[home]:html('','<link rel="sitemap" href="/map.xml">'),[map]:{body:`<urlset><loc>${price}</loc></urlset>`,contentType:'text/xml'},[price]:sufficient()},{bounds});assert.equal(r.result.truth.established,false);assert.equal(r.result.stop.reason,'CAPACITY_BOUND_REACHED');}
});

test('faithful semantic SDK price path remains unchanged after provider navigation',async()=>{
    const {createLiveSemanticInterpreter}=await import('./legacy-live-semantic.test-support.mjs');
    const {evidenceFixtures,fixtureInput:semanticInput,wireCompletion}=await import('./evidence-fixtures.test-support.mjs');
    const oracle=evidenceFixtures.find(f=>f.key==='retained-oracle'),input=semanticInput({...oracle,html:'<main>'+oracle.html+'</main>'});
    input.objective.seeds=[home];input.semantic={mode:'LIVE'};
    for(const transport of ['DIRECT','DECODO'])input.fixtures.push({url:home,transport,...(transport==='DECODO'?{country:'JP'}:{}),body:`<html><title>${oracle.name}</title><body><nav><a href="/plans">料金を見る</a></nav></body></html>`});
    let calls=0;const exposed=[];
    const interpret=await createLiveSemanticInterpreter({env:{GROQ_API_KEY:'offline-key',SAVLIVO_V3_SEMANTIC_MODEL:'offline-model'},fetchImpl:async(_url,options)=>{
        const payload=JSON.parse(options.body),r=JSON.parse(payload.messages[1].content);calls++;exposed.push(r);
        // Existing semantic scheduling can inspect a small seed too; it must not manufacture pricing.
        const pricing=r.segments.some(s=>s.text.includes('1,080'));
        const w=wireCompletion(r,pricing?oracle:{...oracle,plans:[]});for(const o of w.offers){o.serviceRef=r.knownObservationService?.reference??null;o.association='UNKNOWN';}
        return new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify(w)}}]}),{headers:{'content-type':'application/json'}});
    }});
    const result=await runTarget({input,interpret,capabilities:offlineCapabilities(input)});
    assert.equal(result.result.truth.established,true);assert.notEqual(result.result.catalog.state,'CATALOG_EXHAUSTED');assert.equal(calls,2);assert.equal(exposed.filter(r=>r.segments.some(s=>s.text.includes('1,080'))).length,1);assert.equal(firstEstablishedUsage(result.result).acquisitions,2);
    const p=result.result.truth.prices.JP.propositions;assert.equal(p.PRICE_AMOUNT.value,1080);assert.equal(p.CURRENCY.value,'JPY');assert.equal(p.MONTHLY_CADENCE.state,'ESTABLISHED');assert.equal(p.TARGET_MARKET.value,'JP');
    const o=result.knowledge.observations.find(o=>o.evidence?.envelope.offers.length),offer=o.evidence.envelope.offers[0];assert.equal(offer.charges[0].role,'INTRODUCTORY');assert.equal(offer.charges[0].money.amount,0);assert.equal(offer.charges[1].role,'ORDINARY');assert.equal(o.transport.verification,'BRACKET_VERIFIED');
    assert.deepEqual(evaluate(restore(checkpoint(result.knowledge))),result.result.truth);assert.equal(firstEstablishedUsage(result.result).searches,0);
});
test('advisory hook deadline falls back to a bounded native frontier',async()=>{
    const r=await site({[home]:html('','<nav><a href="/surface">契約</a></nav>'),[home+'surface']:sufficient()},{},{navigate:()=>new Promise(()=>{})});
    assert.equal(r.result.truth.established,true);assert.ok(r.knowledge.trace.some(t=>t.event==='NAVIGATION_ADVICE_UNAVAILABLE'));
});
test('malformed capability interpretation does not trigger discovery failover or expose exception text',async()=>{
    const k=await runResearch({objective:objective({seeds:[home,price]}),permissions:{DIRECT:true},capabilities:{DIRECT:()=>{throw Error('secret arbitrary generation');}}});assert.equal(k.stop.code,'CAPABILITY_INTERNAL_ERROR');assert.equal(firstEstablishedUsage(k).actions,1);assert.equal(JSON.stringify(k).includes('secret arbitrary generation'),false);
});
for(const extra of [{candidateDestinations:0},{candidateDestinations:1},{navigationDepth:0},{sitemapAcquisitions:0}])test('finite discovery bounds '+JSON.stringify(extra),()=>{
    if(extra.candidateDestinations===0){assert.throws(()=>createKnowledge({objective:objective(),bounds:extra}),/INVALID_MARKETS/);return;}
    const k=createKnowledge({objective:objective(),bounds:extra});assert.equal(k.bounds.candidateDestinations,extra.candidateDestinations??128);assert.ok(k.destinations.length<=k.bounds.candidateDestinations);
});
test('search family exhaustion is stable across checkpoint and cannot redispatch',async()=>{
    const settings={objective:objective({seeds:[]}),permissions:{TAVILY:true},capabilities:{TAVILY:()=>({results:[]})}},k=await runResearch(settings),restored=restore(checkpoint(k));restored.stop=null;const resumed=await runResearch({...settings,knowledge:restored});assert.equal(resumed.usage.searches,3);assert.equal(resumed.stop.reason,'SEMANTIC_EXHAUSTION');
});
test('source candidate identities distinguish observations and acquisition countries',()=>{
    const body='<nav><a href="/plans">Plans</a></nav>',a=extractNavigation(observation(body,{id:'direct'}),objective(),pricePropositions),b=extractNavigation(observation(body,{id:'country',context:context('DECODO','JP')}),objective(),pricePropositions);assert.notEqual(a.candidates[0].id,b.candidates[0].id);assert.equal(a.candidates[0].source.sha256,b.candidates[0].source.sha256);
});
test('unrecognized labels do not erase account proposition separation',async()=>{
    const r=await site({[home]:html('Personal consumer subscription price JPY 1400 per month. Available in JP.','<nav><a href="/buy">Subscribe now</a></nav>')});assert.equal(r.result.truth.established,true);assert.equal(r.result.truth.accountAccess.LOGIN.state,'UNRESOLVED');assert.equal(r.result.truth.accountAccess.MANAGE.state,'UNRESOLVED');assert.equal(r.result.truth.accountAccess.CANCEL.state,'UNRESOLVED');
});

test('redirect to an explicitly reviewed namespace host preserves country/transport and exact authority',async()=>{
    const target='https://locale.provider.example/current',o=objective({providerNamespaces:[namespace]}),r=await site({[home]:{status:302,location:target},[target]:html('Personal consumer subscription price JPY 1400 per month.')},{objective:o,permissions:{DECODO:true}});
    assert.equal(r.result.truth.established,true);assert.equal(r.knowledge.observations[0].url,target);assert.equal(r.knowledge.observations[0].transport.verifiedCountry,'JP');assert.ok(r.knowledge.authorityBindings.some(b=>b.host==='locale.provider.example'));
});
test('malformed sitemap root is retained as navigation failure, never admitted evidence',async()=>{
    const map=home+'map.xml',r=await site({[home]:html('','<link rel="sitemap" href="/map.xml">'),[map]:{body:`<urlset><loc>${price}</loc>`,contentType:'text/xml'}});assert.equal(r.result.truth.established,false);assert.equal(r.result.stop.code,'SITEMAP_UNSUPPORTED');assert.equal(r.knowledge.observations.length,1);
});
test('country observation context is never synthesized by a locale candidate or advisory ranking',async()=>{
    const r=await site({[home]:html('','<link rel="alternate" hreflang="ja-JP" href="/jp/pricing">'),[home+'jp/pricing']:html('Personal consumer subscription price JPY 1400 per month.')});assert.equal(amounts(r).TARGET_MARKET.state,'UNRESOLVED');assert.ok(r.knowledge.observations.every(o=>o.context.transport==='DIRECT'&&o.context.networkGeography==='UNBOUND'));
});

test('unseeded reviewed provider starts at homepage without search capability or guessed routes',async()=>{const r=await site({[home]:sufficient()},{objective:objective({seeds:[]})});assert.equal(r.result.truth.established,true);assert.equal(firstEstablishedUsage(r.result).acquisitions,1);assert.equal(r.knowledge.destinations[0].grounding.kind,'PROVIDER_ROOT');});
for(const key of ['access_token','api_key','password','authorization','secret','session_token'])test('sensitive URL navigation parameter not retained '+key,()=>assert.equal(extract(`<a href="/plans?${key}=sensitive-value">Plans</a>`).candidates.length,0));

test('country transport failure does not erase useful distinct DIRECT action or retry COUNTRY',async()=>{
    const input=fixtureInput({[home]:sufficient()},{permissions:{DIRECT:true,DECODO:true}}),caps=offlineCapabilities(input);caps.DECODO=async()=>({failure:{kind:'ACQUISITION',code:'PROVIDER_HEADERS_TIMEOUT'},accounting:{requests:1,bytes:0,decodedBytes:0,retainedBytes:0}});
    const r=await runTarget({input,interpret:interpretBillingFixture,capabilities:caps});assert.equal(r.result.truth.established,true);assert.deepEqual(r.knowledge.attempts.map(a=>a.action.context.transport),['DECODO','DIRECT']);assert.equal(r.knowledge.observations[0].context.networkGeography,'UNBOUND');assert.equal(amounts(r).TARGET_MARKET.evidence[0].reference.marketContext,undefined);assert.equal(amounts(r).TARGET_MARKET.value,'JP');
});

test('explicit inert navigation remains preferred over newly discovered endpoint hypotheses',async()=>{
    const body=html('','<script type="application/json">{"navigation":{"items":[{"label":"الاشتراك","href":"/selection"}]},"apiUrl":"/api/pricing"}</script>'),r=await site({[home]:body,[home+'selection']:sufficient()});assert.equal(r.result.truth.established,true);assert.equal(firstEstablishedUsage(r.result).acquisitions,2);assert.ok(r.knowledge.destinations.some(d=>d.url===home+'api/pricing'&&d.grounding.kind==='PROVIDER_LINK'));
});
test('language-only alternate tag is not treated as an explicit region subtag',()=>{
    const c={url:price,label:'',kind:'ALTERNATE',context:'CONTENT',locale:'ja'},score=rankCandidate(c,objective());assert.equal(score,rankCandidate({...c,locale:null},objective()));
});

test('search and robots-derived candidates reject sensitive navigation parameters before frontier retention',()=>{
    for(const kind of ['DISCOVERY_RESULT','ROBOTS_SITEMAP','PROVIDER_LINK']){const k=createKnowledge({objective:objective()});assert.equal(addDestination(k,{url:price+'?access_token=unsafe-value',depth:1,needs:pricePropositions,grounding:{kind}}),'UNSAFE_NAVIGATION_PARAMETER');assert.equal(k.destinations.length,1);}
});
test('structured navigation pointer expansion has a finite bound',()=>{
    const data={navigation:{['x'.repeat(discoveryCapacity.jsonPointer+1)]:{href:'/plans'}}},p=extract('<script type="application/json">'+JSON.stringify(data)+'</script>');assert.equal(p.candidates.length,0);assert.equal(p.limited,true);
});

for(const code of ['WIRE_BYTE_BOUND','DECOMPRESSION_BOUND','HEADERS_TOO_LARGE','REDIRECT_LIMIT'])test('per-resource capacity '+code+' leaves a different grounded provider candidate usable',async()=>{
    const input=fixtureInput({[home]:html('','<nav><a href="/plans-failed">Plans</a><a href="/plans-ok">Plans</a></nav>'),[home+'plans-ok']:sufficient()}),caps=offlineCapabilities(input),real=caps.DIRECT;
    caps.DIRECT=async(a,limits)=>a.url.endsWith('plans-failed')?{failure:{kind:'CAPACITY',code},accounting:{requests:1,bytes:64,decodedBytes:64,retainedBytes:0}}:real(a,limits);
    const r=await runTarget({input,interpret:interpretBillingFixture,capabilities:caps,navigate:rows=>rows.filter(c=>c.url.endsWith('plans-failed')).map(c=>({candidateId:c.id,needs:pricePropositions}))});assert.equal(r.result.truth.established,true);assert.equal(r.knowledge.attempts.filter(a=>a.status==='FAILED').length,1);assert.ok(r.result.usage.bytes>=64);assert.ok(r.knowledge.limitsHit.includes('acquisitionResourceCapacity'));assert.equal(r.knowledge.observations.some(o=>o.url.endsWith('plans-failed')),false);
});
test('global transport budget stays terminal despite another grounded destination',async()=>{
    const k=await runResearch({objective:objective({seeds:[home,price]}),permissions:{DIRECT:true},bounds:{bytes:64},capabilities:{DIRECT:()=>({failure:{kind:'CAPACITY',code:'WIRE_BYTE_BOUND'},accounting:{requests:1,bytes:65,decodedBytes:0,retainedBytes:0}})}});assert.equal(k.stop.reason,'CAPACITY_BOUND_REACHED');assert.equal(firstEstablishedUsage(k).actions,1);assert.equal(k.observations.length,0);
});

for(const placement of ['before','after'])test('source-owned base URL resolves relative navigation '+placement+' anchor',async()=>{
    const base='<base href="/catalog/">',anchor='<nav><a href="plans">Plans</a></nav>',body=placement==='before'?base+anchor:anchor+base,target=home+'catalog/plans',r=await site({[home]:html('',body),[target]:sufficient()});assert.equal(r.result.truth.established,true);const d=r.knowledge.destinations.find(d=>d.url===target),o=r.knowledge.observations[0],b=d.discovery.source.base;assert.equal(b.sha256,digest(o.body.slice(b.start,b.end)));
});
test('external base cannot manufacture provider-owned relative navigation; absolute reviewed link survives',()=>{
    const p=extract('<base href="https://unowned.example/"><a href="plans">Plans</a><a href="https://provider.example/plans">Plans</a>');assert.equal(p.candidates.length,1);assert.equal(p.candidates[0].url,price);
});
test('quoted greater-than in URL attributes and fake base in raw text retain correct destinations',()=>{
    const p=extract('<script>"<base href=\"https://unowned.example\">"</script><a href="/plans?comparison=5>4">Plans</a>');assert.equal(p.candidates.length,1);assert.equal(new URL(p.candidates[0].url).searchParams.get('comparison'),'5>4');
});

test('unsupported sitemap is scoped navigation failure, a different acquired provider page can complete',async()=>{
    const map=home+'map.xml',input=fixtureInput({[home]:html('','<link rel="sitemap" href="/map.xml"><a href="/surface">続きを読む</a>'),[map]:{body:'<html>Wrong sitemap body</html>',contentType:'text/html'},[home+'surface']:sufficient()});
    const r=await runTarget({input,interpret:interpretBillingFixture,capabilities:offlineCapabilities(input),navigate:rows=>rows.filter(c=>c.url===map).map(c=>({candidateId:c.id,needs:pricePropositions}))});assert.equal(r.result.truth.established,true);assert.ok(r.knowledge.attempts.some(a=>a.failure?.kind==='NAVIGATION'));assert.equal(r.knowledge.observations.length,2);
});
