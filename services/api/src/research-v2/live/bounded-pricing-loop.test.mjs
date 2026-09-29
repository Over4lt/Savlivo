import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {createHash} from 'node:crypto';
import {runAdaptiveCampaign,initializeAdaptiveState,assessAdaptiveService} from '../inventory/adaptive-campaign.mjs';
import {interpretDirectProvider} from './direct-provider-evidence.mjs';
import {providerNavigation} from './provider-navigation.mjs';
import {discoveryActions,nextDiscoveryQuery} from './research-planner.mjs';
import {projectPriceEvidenceNeeds} from '../intelligence/price-evidence-needs.mjs';
const repo=process.cwd(),root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'bounded-price-loop-')));
// Normal workers run from this disposable root, keeping evidence references exact.
for(const name of ['docs','services'])fs.symlinkSync(path.join(repo,name),path.join(root,name));
process.chdir(root);after(()=>{process.chdir(repo);fs.rmSync(root,{recursive:true,force:true});});
const home='https://provider.example/',hash=s=>createHash('sha256').update(s).digest('hex');
const authority={hostname:'provider.example',provider:'Lumen',sourceType:'OFFICIAL_PROVIDER',sourceUrl:home,checkedAt:'2026-09-29T00:00:00Z'};
const target=()=>({id:'lumen-price-US',service:'lumen',serviceName:'Lumen',market:'US',researchObjective:'SERVICE_COVERAGE',smartResearch:{version:2},urls:[home],authorities:[authority],capabilities:{direct:true,tavily:true,decodo:false,browser:false,groq:false}});
const offer=(text='USD 10/month',market='US')=>'<html><head><meta property="og:locale" content="en-'+market+'"></head><body><article><h2>Personal</h2><p>'+text+'</p></article><script id="__NEXT_DATA__" type="application/json">'+JSON.stringify({props:{pageProps:{basePageProps:{country:market,market:market.toLowerCase()},metadata:{country:market,market:market.toLowerCase(),locale:'en-'+market}}},query:{market:market.toLowerCase()}})+'</script></body></html>';
let counter=0;
function scenario({pages,results=[],t=target(),limits,readOverride}={}){
 const directory=path.join(root,'campaign-'+counter++),calls=[],interpretations=[];
 const args={directory,manifest:{targets:[t],conditionalFollowupTargets:[]},...(limits?{limits}:{}),createAdapters:async()=>({
  read:async a=>{calls.push({route:'DIRECT',url:a.url});assert(Object.hasOwn(pages,a.url),'ungrounded acquisition '+a.url);if(readOverride)return readOverride(a);const body=pages[a.url];return {url:a.url,outcome:'OK',httpStatus:200,body,authority:{status:'CONFIGURED_REVIEWED',...t.authorities[0]},sourceIntegrity:{sha256:hash(body)},accessDecisions:[{decision:'ALLOWED'}]};},
  search:async a=>{calls.push({route:'DISCOVERY',query:a.query});return {results};},
  classify:async()=>({eligible:true}),
  consumeProvider:async a=>{const r=await interpretDirectProvider(a);interpretations.push(r);return r;},
  acquire:async()=>assert.fail('unexpected paid acquisition')
 })};
 return {args,calls,interpretations,t,run:async()=>runAdaptiveCampaign(args)};
}
function established(s,f){const t=s.targets[f.t.id];assert.equal(t.verified.length,1,JSON.stringify({calls:f.calls,stop:s.services[f.t.service].stop,marketProof:t.marketProof,needs:t.priceEvidenceNeeds,interpretations:f.interpretations.map(r=>({url:r.url,blockers:r.blockers}))}));assert.equal(t.verified[0].amount,'10');assert.equal(t.verified[0].currency,f.t.market==='NO'?'NOK':'USD');assert.equal(s.services[f.t.service].stop.reason,'HIGH_SUFFICIENT');for(const r of f.interpretations){const v=JSON.parse(fs.readFileSync(r.runDirectory+'/interpretation-0001/targeted-verification.json'));assert(v.sourceChecks.every(c=>c.status==='HASH_VERIFIED'));assert.equal(v.offline.externalNetwork,0);}return t;}

test('navigation frontier closes old top-two loss through real acquisition, interpreter and verifier',async()=>{
 const body='<a href="/plans">Plans</a><a href="/membership">Membership</a><a href="/us/pricing">Pricing</a>';
 const legacy=providerNavigation(target(),body,home).links;assert.deepEqual(legacy.map(l=>l.url),[home+'plans',home+'membership'],'old selection discarded the reachable price');
 const f=scenario({pages:{[home]:body,[home+'plans']:'<p>About the service</p>',[home+'membership']:'<p>Membership information</p>',[home+'us/pricing']:offer()}}),s=await f.run();established(s,f);
 assert.deepEqual(f.calls,[{route:'DIRECT',url:home},{route:'DIRECT',url:home+'us/pricing'}]);assert.equal(s.services.lumen.used.reads,2);const n=f.calls.length;await f.run();assert.equal(f.calls.length,n,'completed resume does not repeat actions');
});
test('provider-scoped discovery acquires a relevant reviewed destination without brand words; snippets never verify',async()=>{
 const f=scenario({pages:{[home]:'<p>Welcome</p>',[home+'us/pricing']:offer()},results:[{url:home+'us/pricing',title:'Plans',content:'USD 1/month invented search snippet'},{url:'https://external.example/pricing',title:'Lumen plans'},{url:home+'news',title:'Lumen news'}]});
 const s=await f.run();established(s,f);assert.deepEqual(f.calls.map(c=>c.route),['DIRECT','DISCOVERY','DIRECT']);assert.equal(f.calls[2].url,home+'us/pricing');assert.equal(s.targets[f.t.id].leads.some(l=>l.url.includes('external.example')||l.url.endsWith('/news')),false);
});
test('verifier-produced market need drives discovery, provider acquisition and normal establishment',async()=>{
 const f=scenario({pages:{[home]:'<article><h2>Personal</h2><p>USD 10/month</p></article>',[home+'us/membership']:offer()},results:[{url:home+'us/membership',title:'Membership terms'}]});
 const s=await f.run();established(s,f);assert(f.interpretations[0].verified.length===0);assert(f.calls.some(c=>c.route==='DISCOVERY'));assert.equal(f.calls.at(-1).url,home+'us/membership');
});
test('post-verification navigation can address a newly grounded market need without a search',async()=>{
 const f=scenario({pages:{[home]:'<article><h2>Personal</h2><p>USD 10/month</p></article><a href="/us/terms">Country availability terms</a>',[home+'us/terms']:offer()}});
 const s=await f.run();established(s,f);assert.deepEqual(f.calls.map(c=>c.route),['DIRECT','DIRECT']);assert.equal(f.calls[1].url,home+'us/terms');
});
test('grounded market navigation filters foreign locale, establishes only target provider presentation',async()=>{
 const f=scenario({pages:{[home]:'<a href="/en-ca/pricing">Plans Canada</a><a href="/us/pricing">Plans United States</a>',[home+'us/pricing']:offer()}});
 const s=await f.run();established(s,f);assert.equal(f.calls.length,2);assert.equal(f.calls[1].url,home+'us/pricing');
});
test('true exhaustion is finite, deterministic and idempotent after resume',async()=>{
 const f=scenario({pages:{[home]:'<p>Welcome</p>'}}),s=await f.run();assert.equal(s.targets[f.t.id].verified.length,0);assert.equal(s.services.lumen.stop.reason,'DISCOVERY_EXHAUSTED');assert.deepEqual(f.calls.map(c=>c.route),['DIRECT','DISCOVERY','DISCOVERY']);assert.equal(new Set(f.calls.filter(c=>c.query).map(c=>c.query)).size,2);await f.run();assert.equal(f.calls.length,3);
});
test('interruption after persisted navigation resumes the same frontier without rereading the homepage',async()=>{
 const f=scenario({pages:{[home]:'<a href="/us/pricing?utm_source=one">Plans</a><a href="/us/pricing#plans">Plans</a>',[home+'us/pricing']:offer()}});
 await assert.rejects(runAdaptiveCampaign({...f.args,onTransition:e=>{if(e==='NATIVE_RESULT_PERSISTED')throw Error('INTERRUPT');}}),/INTERRUPT/);
 const s=await f.run();established(s,f);assert.deepEqual(f.calls.map(c=>c.url),[home,home+'us/pricing']);
});
test('500 links remain a bounded ranked queue, irrelevant and unreviewed URLs never enter it',()=>{
 const body=Array.from({length:500},(_,i)=>'<a href="/pricing/'+i+'">Plans</a>').join('')+'<a href="https://evil.example/pricing">Plans</a><a href="/logout">Logout</a><a href="/news">News</a>';
 const n=providerNavigation(target(),body,home);assert.equal(n.frontier.length,40);assert.equal(n.omittedDestinations,460);assert(n.frontier.every(l=>l.url.startsWith(home+'pricing/')));assert(n.frontier.every(l=>l.evidenceStatus==='DISCOVERY_LEAD_ONLY'&&!l.authoritative));
});
test('existing read budget limits the frontier; no speculative destination is requested',async()=>{
 const f=scenario({pages:{[home]:'<a href="/us/pricing">Plans</a>',[home+'us/pricing']:offer()},limits:{reads:1}}),s=await f.run();assert.equal(s.services.lumen.used.reads,1);assert.equal(f.calls.length,1);assert.equal(s.targets[f.t.id].verified.length,0);
});
test('genuine provider access stop admits neither navigation nor Decodo',async()=>{
 const t=target();t.capabilities.decodo=true;const f=scenario({t,pages:{[home]:''},readOverride:async()=>({url:home,outcome:'ACCESS_CONTROL_STOP',failure:{code:'ACCESS_CONTROL'},accessDecisions:[{decision:'DISALLOWED'}],body:'<a href="/us/pricing">Plans</a>'})});const s=await f.run();assert.equal(f.calls.length,1);assert.equal(s.services.lumen.used.acquisitions,0);assert.equal(s.targets[t.id].verified.length,0);
});
for(const [name,text,market] of [['wrong market','USD 10/month','CA'],['missing cadence','USD 10','US'],['benefit value','Member benefits worth USD 10/month','US'],['credit','Monthly credit USD 10','US'],['zero','USD 0/month','US']])test('normal verifier remains authoritative: '+name,async()=>{
 const t=target();t.urls=[home+'us/pricing'];t.capabilities.tavily=false;const f=scenario({t,pages:{[home+'us/pricing']:offer(text,market)}}),s=await f.run();assert.equal(s.targets[t.id].verified.length,0);assert.notEqual(s.services.lumen.stop.reason,'HIGH_SUFFICIENT');
});
test('all researchable need families remain finite; first need cannot hide a distinct current need',()=>{
 const t=target(),keys=['service','provenance','plan','amount','currency','billingInterval','recurringSemantics','ordinaryPriceRole','offerOwnership','offerPresentation','market'];
 t.priceEvidenceNeeds=projectPriceEvidenceNeeds(t,[{service:t.service,plan:'Personal',amount:10,currency:'USD',billingInterval:{normalized:'P1M'},commercialRole:'RECURRING_MONTHLY',market:null,marketApplicability:{requestedMarket:'US'},source:{kind:'ORIGINAL_PROVIDER',url:home,hash:'a'.repeat(64),path:'$/offer'},fields:Object.fromEntries(keys.map(k=>[k,{status:['offerPresentation','market'].includes(k)?'UNKNOWN':'ESTABLISHED'}])),blockers:['EMBEDDED_OFFER_ACTIVATION_UNRESOLVED']}]);
 const actions=discoveryActions(t);assert.equal(actions.length,4);assert.deepEqual(new Set(actions.map(a=>a.need)),new Set(['offerPresentation','market']));
 const history=actions.slice(0,2).map(a=>({route:'DISCOVERY',query:a.query.toUpperCase().replaceAll(' ','  '),completed:true}));assert.equal(nextDiscoveryQuery(t,history),actions[2].query);
 history.push(...actions.slice(2).map(a=>({route:'DISCOVERY',query:a.query,rejected:true})));for(let i=0;i<100;i++)assert.equal(nextDiscoveryQuery(t,history),null);
});

test('unseen membership service and another market use the same bounded loop',async()=>{
 const t={...target(),id:'harbor-NO',service:'harbor',serviceName:'Harbor Club',market:'NO',category:'fitness',authorities:[{...authority,provider:'Harbor Club'}]};
 const f=scenario({t,pages:{[home]:'<a href="/no/pricing">Priser og medlemskap</a>',[home+'no/pricing']:offer('NOK 10/month','NO')}}),s=await f.run();established(s,f);assert.equal(f.calls.length,2);assert.equal(s.services.harbor.used.searches,0);
});
test('research information links cannot bypass hidden/form, external, editorial or destructive exclusions',()=>{
 const t={...target(),marketProof:{objectives:[{status:'MARKET_NOT_VERIFIED'}]}},body='<a hidden href="/terms">Terms</a><form><a href="/billing">Billing terms</a></form><a href="/business/terms">Business terms</a><a href="https://external.example/terms">Country terms</a><a href="/terms?action=delete">Country terms</a><a href="/us/terms">Country terms</a>';
 const n=providerNavigation(t,body,home);assert.deepEqual(n.frontier.map(l=>l.url),[home+'us/terms']);
});

test('a bounded frontier is reported as a capacity stop, never semantic exhaustion',()=>{
 const t=target();t.reads=[{requestedUrl:home,url:home,outcome:'OK',navigation:{omittedDestinations:4}}];t.queries=discoveryActions(t).map(a=>({query:a.query}));t.leads=[{url:home,title:'Provider',rank:0}];
 const a=assessAdaptiveService(initializeAdaptiveState({targets:[t],conditionalFollowupTargets:[]}),t.service);assert.equal(a.next,null);assert.equal(a.stop.reason,'PRICING_NAVIGATION_BOUND_REACHED');assert.equal(a.stop.kind,'BLOCKED');
});
