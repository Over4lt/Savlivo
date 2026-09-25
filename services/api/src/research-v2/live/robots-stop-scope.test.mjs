import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {OpenWebResearch,runOpenWebResearch} from './open-web-discovery.mjs';
import {parseV2Robots,evaluateV2Robots} from './robots-policy.mjs';
import {acquisitionEscalation} from './provider-access-gap.mjs';
const origin='https://provider.example',parent=origin+'/membership',denied=parent+'/one',sibling=origin+'/plans';
const target={id:'fixture-price-DE',service:'fixture',serviceName:'Fixture',market:'DE',researchObjective:'SERVICE_COVERAGE',smartResearch:{version:2},capabilities:{direct:true,decodo:true,tavily:false,browser:false,groq:false},authorities:[{hostname:'provider.example',provider:'Fixture',sourceType:'OFFICIAL_PROVIDER',checkedAt:'2026-09-25'}],urls:[parent],gaps:['market'],marketProof:{objectives:[{key:'price-identity',identity:{plan:'Basic'},status:'MARKET_NOT_VERIFIED',missingFact:'MARKET_PROOF'}]}};
function fixture(t){const d=fs.mkdtempSync(path.join(os.tmpdir(),'robots-scope-'));t.after(()=>fs.rmSync(d,{recursive:true,force:true}));return new OpenWebResearch(d,[target]);}
function stop(policy='User-agent: *\nDisallow: /membership/one',url=denied){return {url,outcome:'ACCESS_CONTROL_STOP',failure:{code:'ROBOTS_ACCESS_STOP'},accessDecisions:[{targetUrl:url,...evaluateV2Robots(parseV2Robots(policy),url)}]};}
function reachedDenied(s){const a=s.next();assert.equal(a.url,parent);s.accept(a.id,{url:parent,outcome:'OK'});s.add(s.target(target.id),{url:denied,title:'Membership availability',rank:0});const b=s.next();assert.equal(b.url,denied);return b;}
test('path robots denial preserves independent market-proof sibling and Direct preference',async t=>{
 const s=fixture(t),a=reachedDenied(s),blocked=stop();assert.equal(blocked.accessDecisions[0].decision,'DISALLOWED');assert.equal(acquisitionEscalation({page:blocked}).eligible,false);
 s.accept(a.id,blocked);s.add(s.target(target.id),{url:sibling,title:'Membership market terms',rank:0});s.save();
 const resumed=new OpenWebResearch(s.directory,[target]),next=resumed.next();assert.equal(next.type,'READ');assert.equal(next.url,sibling);assert.equal(resumed.target(target.id).researchPlan.objective,'MARKET_PROOF');assert.deepEqual(resumed.target(target.id).blockedOrigins,[]);
 let direct=0,decodo=0;const state=await runOpenWebResearch({directory:s.directory,targets:[target],maxActions:1,search:async()=>{throw Error('TAVILY_OFF');},read:async({url})=>{assert.equal(url,sibling);assert.equal(evaluateV2Robots(parseV2Robots('User-agent: *\nDisallow: /membership/one'),url).decision,'ALLOWED');direct++;return {url,outcome:'OK'};},classify:async()=>({eligible:true}),acquire:async()=>{decodo++;throw Error('NO_ESCALATION');}});
 assert.equal(direct,1);assert.equal(decodo,0);assert.equal(state.targets[0].reads.filter(r=>r.requestedUrl===denied).length,1);assert.equal(state.usage.reads,3);
});
for(const [name,change] of [['missing decisions',r=>delete r.accessDecisions],['origin disallow',r=>Object.assign(r,stop('User-agent: *\nDisallow: /'))],['uncertain policy',r=>r.accessDecisions[0].decision='ROBOTS_INVALID'],['explicit prohibition',r=>Object.assign(r.accessDecisions[0],{decision:'REVIEW_REQUIRED',reason:'EXPLICIT_PROVIDER_PROHIBITION'})]])test(name+' retains conservative origin stop',t=>{const s=fixture(t),a=reachedDenied(s),r=stop();change(r);s.accept(a.id,r);assert(s.target(target.id).blockedOrigins.includes(origin));});

for(const policy of ['invalid','disallow','prohibition'])test('redirect '+policy+' blocks policy origin, not allowed source origin',async t=>{
 const {createV2RobotsPublicAdapter}=await import('./robots-policy.mjs');
 const second='https://account.provider.example',calls=[];
 const reply=(body,status=200,type='text/plain',headers={})=>({status,headers:{'content-type':type,...headers},body:Buffer.from(body)});
 const adapter=createV2RobotsPublicAdapter({network:{resolveHost:async()=>[{address:'93.184.216.34',family:4}],requestOnce:async({url})=>{
  calls.push(url.href);
  if(url.pathname==='/robots.txt')return url.origin===origin?reply('User-agent: *\nAllow: /'):policy==='invalid'?reply('<html>Application</html>',200,'text/html'):reply(policy==='disallow'?'User-agent: *\nDisallow: /':'# automated access prohibited\nUser-agent: *\nAllow: /');
  if(url.href===parent)return reply('',302,'text/plain',{location:second+'/membership/one'});
  assert.equal(url.href,sibling);return reply('<p>Membership terms</p>',200,'text/html');
 }}});
 const s=fixture(t),a=s.next(),response=await adapter.read({url:a.url,targetCountry:'DE'});
 assert.equal(response.failure.code,'ROBOTS_ACCESS_STOP');assert.equal(response.accessDecisions[0].decision,'ALLOWED');
 if(policy==='invalid'){assert.equal(response.accessDecisions[1].reason,'ROBOTS_NOT_TEXT_PLAIN');assert.equal(response.accessDecisions[1].httpStatus,200);assert(response.accessDecisions[1].bodyHash);}
 assert.equal(adapter.statistics().pageRequests,1);assert.equal(adapter.statistics().robotsRequests,2);assert(!calls.includes(second+'/membership/one'));
 s.accept(a.id,response);s.add(s.target(target.id),{url:sibling,title:'Membership market terms',rank:0});s.save();
 const resumed=new OpenWebResearch(s.directory,[target]);assert.deepEqual(resumed.target(target.id).blockedOrigins,[second]);
 const next=resumed.next();assert.equal(next.type,'READ');assert.equal(next.url,sibling);assert.equal(resumed.target(target.id).researchPlan.objective,'MARKET_PROOF');
 assert.equal(acquisitionEscalation({page:response}).eligible,false);
 const allowed=await adapter.read({url:next.url,targetCountry:'DE'});assert.equal(allowed.outcome,'OK');resumed.accept(next.id,allowed);
 assert.equal(calls.filter(u=>u===parent).length,1);assert(!calls.includes(second+'/membership/one'));
});
for(const field of ['origin','robotsUrl','targetUrl'])test('unbound redirect '+field+' retains conservative fallback',t=>{
 const s=fixture(t),a=s.next(),r={url:parent,outcome:'ACCESS_CONTROL_STOP',failure:{code:'ROBOTS_ACCESS_STOP'},accessDecisions:[{targetUrl:parent,origin,robotsUrl:origin+'/robots.txt',decision:'ALLOWED'},{targetUrl:'https://account.provider.example/private',origin:'https://account.provider.example',robotsUrl:'https://account.provider.example/robots.txt',decision:'ROBOTS_INVALID',reason:'ROBOTS_NOT_TEXT_PLAIN'}]};
 delete r.accessDecisions[1][field];s.accept(a.id,r);assert.deepEqual(s.target(target.id).blockedOrigins,[origin]);
});
