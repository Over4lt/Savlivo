import '../offline-replay/offline-guard.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {digest} from '../../research-v3/model.mjs';
import {reviewV2CandidateAuthority} from '../../research-v3/v2-candidate-authority-adapter.mjs';
import {authorityAcquisitionObjective,authorityAcquisitionRelevance,candidateAuthorityRouting,orderCandidateAuthorityRows} from './candidate-authority-routing.mjs';
import {executionBounds} from './execution-capabilities.mjs';
import {OpenWebResearch,rankPlannerLeads,runOpenWebResearch} from './open-web-discovery.mjs';
import {planResearch} from './research-planner.mjs';
import {hasProviderRoutingAuthority} from './provider-routing-authority.mjs';

const capabilities={direct:true,tavily:true,decodo:false,browser:false,groq:false};
function target(extra={}){return {id:'nimbus-price-DE',service:'nimbus',serviceName:'Nimbus',market:'DE',researchObjective:'SERVICE_COVERAGE',smartResearch:{version:2,navigationDepth:3},urls:[],authorities:[],gaps:['plan','amount','currency','cadence','priceRole','ownership','market'],reads:[],queries:[],leads:[],decisions:[],blockedOrigins:[],verified:[],capabilities:{...capabilities},...extra};}
const context=(reads=0)=>({bounds:{...executionBounds,perServiceReads:4,perServiceSearches:2},usage:{reads,searches:0,acquisitions:0}});
const selected=t=>{rankPlannerLeads(t);return planResearch(t,{unreadUrls:t.leads.map(lead=>lead.url),executionContext:context(t.reads.length)});};
const read=(url,body)=>({url,outcome:'OK',httpStatus:200,contentType:'text/html',truncated:false,body,sourceIntegrity:{sha256:digest(body)},accessDecisions:[{decision:'ALLOWED'}]});
const candidate=(url,body,serviceName='Nimbus')=>reviewV2CandidateAuthority({contractVersion:1,observationId:'candidate',target:{service:'nimbus',serviceName},page:{url,requestedUrl:url,outcome:'OK',httpStatus:200,contentType:'text/html',truncated:false,bodyHash:digest(body),sourceIntegrity:{sha256:digest(body)},rawSource:{text:body},accessDecisions:[{decision:'ALLOWED'}]}});
const structured=(name,url)=>`<script type="application/ld+json">${JSON.stringify({'@type':'Organization',name,url})}</script>`;

test('authority objective gives a rank-1 provider candidate bounded opportunity ahead of rank-0 third party',()=>{
 const t=target();t.leads=[{url:'https://article.example/review',title:'Nimbus subscription review',originKind:'SEARCH',rank:0},{url:'https://nimbus.example/membership',title:'Membership',originKind:'SEARCH',rank:1}];const p=selected(t);
 assert.equal(p.route,'AUTHORITY_DISCOVERY');assert.equal(p.objective,authorityAcquisitionObjective);assert.equal(p.url,'https://nimbus.example/membership');assert.equal(p.authorityCandidates[0].authorityRole,'SERVICE_HOST_AFFINITY');
});

test('unresolved support branch and thirty generic children cannot starve an independent candidate',()=>{
 const parent='https://help.example/faq',t=target({reads:[{requestedUrl:parent,url:parent,outcome:'OK',v3AuthorityReview:{status:'UNRESOLVED_PROVIDER_IDENTITY',reason:null,binding:null}}]});
 t.leads=[{url:parent,title:'Support',originKind:'SEARCH',rank:0},...Array.from({length:30},(_,childOrder)=>({url:`https://help.example/account/${childOrder}`,title:'Account',originKind:'CHILD',childOrder,navigationDepth:1,mechanism:'ANCHOR',from:{url:parent,bodyHash:'a'.repeat(64),mechanism:'ANCHOR'}})),{url:'https://independent.example/candidate',title:'Nimbus candidate',originKind:'SEARCH',rank:1}];
 const p=selected(t);assert.equal(p.url,'https://independent.example/candidate');assert.equal(p.authorityCandidates[0].originKind,'SEARCH');assert(p.authorityCandidates.slice(1).every(row=>row.originKind==='CHILD'));
});

test('strictly stronger identity child can preempt an independent weak candidate',()=>{
 const parent='https://directory.example/nimbus',t=target({reads:[{requestedUrl:parent,url:parent,outcome:'OK',v3AuthorityReview:{status:'UNRESOLVED_PROVIDER_IDENTITY',reason:null,binding:null}}]});
 const child={url:'https://identity.example/about-nimbus',title:'About Nimbus',originKind:'CHILD',childOrder:0,navigationDepth:1,mechanism:'ANCHOR',from:{url:parent,bodyHash:'b'.repeat(64),mechanism:'ANCHOR'}},independent={url:'https://news.example/nimbus',title:'Nimbus profile',originKind:'SEARCH',rank:1};t.leads=[independent,child];
 assert(authorityAcquisitionRelevance(t,child).tier<authorityAcquisitionRelevance(t,independent).tier);assert.equal(selected(t).url,child.url);
});

test('support and regional pages can still establish exact-host authority under unchanged V3 review',()=>{
 for(const url of ['https://support.nimbus.example/help','https://de.nimbus.example/about']){const decision=candidate(url,structured('Nimbus',new URL(url).origin+'/'));assert(decision.providerAuthorityBinding);assert.equal(decision.providerAuthorityBinding.host,new URL(url).hostname);assert.equal(decision.providerAuthorityBinding.scope,'EXACT_HOST_PROVIDER_SOURCING');}
});

test('third-party commercial routing metadata cannot establish authority',()=>{
 const url='https://comparison.example/nimbus-pricing',body='<title>Nimbus subscription pricing</title><main>Independent comparison.</main>',decision=candidate(url,body);
 assert.equal(decision.providerAuthorityBinding,null);assert.equal(decision.candidateObservation.authority,'UNREVIEWED_CANDIDATE');
});

test('robots and incomplete child failures consume reads while remaining generic siblings yield to an independent candidate',()=>{
 for(const [outcome,reason]of [['ACCESS_CONTROL_STOP','CANDIDATE_SOURCE_NOT_RETAINED'],['ERROR','CANDIDATE_ACQUISITION_INCOMPLETE'],['OK','CANDIDATE_REDIRECT_HOST_CHANGED']]){const parent='https://help.example/start',failed='https://help.example/login',failedBranch=outcome!=='ACCESS_CONTROL_STOP',t=target({reads:[{requestedUrl:parent,url:parent,outcome:'OK',v3AuthorityReview:{status:'UNRESOLVED_PROVIDER_IDENTITY'}},{requestedUrl:failed,url:failed,outcome,v3AuthorityReview:{status:'UNRESOLVED_PROVIDER_IDENTITY',reason}}]});t.leads=[{url:failedBranch?'https://sibling.example/account':'https://help.example/account',title:'Account',originKind:'CHILD',childOrder:1,from:{url:failedBranch?failed:parent,bodyHash:'c'.repeat(64)}},{url:'https://independent.example/nimbus',title:'Nimbus',originKind:'SEARCH',rank:2}];const p=selected(t);assert.equal(t.reads.length,2);assert.equal(p.url,'https://independent.example/nimbus');const childRow=p.authorityCandidates.find(row=>row.originKind==='CHILD');if(failedBranch)assert.equal(childRow.branchStatus,'FAILED_PARENT_BRANCH');else assert.equal(childRow,undefined);}
});

test('stable search rank, child order and persisted order deterministically break ties',()=>{
 const t=target(),a={url:'https://a.example/nimbus',title:'Nimbus',originKind:'SEARCH',rank:1,frontierOrder:3},b={url:'https://b.example/nimbus',title:'Nimbus',originKind:'SEARCH',rank:0,frontierOrder:4};t.leads=[a,b];assert.equal(selected(t).url,b.url);
 const children=[{url:'https://child.example/nimbus-b',originKind:'CHILD',childOrder:1,frontierOrder:6},{url:'https://child.example/nimbus-a',originKind:'CHILD',childOrder:0,frontierOrder:5}].map((lead,index)=>({...lead,...candidateAuthorityRouting(t,lead,index)}));assert.equal(orderCandidateAuthorityRows(children)[0].childOrder,0);
 const restarted=JSON.parse(JSON.stringify(t));assert.equal(selected(restarted).url,b.url);
});

test('last-capacity fairness preserves an equal-tier independent opportunity',()=>{
 const t=target(),child={url:'https://child.example/nimbus',originKind:'CHILD',childOrder:0},independent={url:'https://independent.example/nimbus',originKind:'SEARCH',rank:9},rows=[child,independent].map((lead,index)=>({url:lead.url,...candidateAuthorityRouting(t,lead,index)}));
 assert.equal(orderCandidateAuthorityRows(rows,{remainingReads:1})[0].originKind,'SEARCH');
});

test('four Direct reads remain hard, failed reads receive no refund, and exhaustion stays explicit',()=>{
 const reads=Array.from({length:4},(_,i)=>({requestedUrl:`https://attempt-${i}.example/page`,url:`https://attempt-${i}.example/page`,outcome:'ERROR'})),t=target({reads});t.leads=[{url:'https://nimbus.example/about',title:'About Nimbus',originKind:'SEARCH',rank:0}];const p=selected(t);
 assert.equal(p.route,'STOP');assert.equal(p.reason,'DIRECT_BUDGET_EXHAUSTED');assert.equal(p.budgetBlocked.length,1);assert.equal(executionBounds.perServiceReads,4);
});

test('child-only authority remains reachable through retained unresolved navigation',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'candidate-authority-child-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));const parent='https://directory.example/nimbus',child='https://nimbus.example/about',parentBody=`<main>Directory</main><a href="${child}">About Nimbus</a>`,childBody=structured('Nimbus','https://nimbus.example/'),x=target();
 const calls=[],state=await runOpenWebResearch({directory:root,targets:[x],maxActions:3,search:async()=>{calls.push('SEARCH');return {results:[{url:parent,title:'Nimbus directory'}]};},read:async({url})=>{calls.push(url);return read(url,url===parent?parentBody:childBody);}}),current=state.targets[0];
 const childLead=current.leads.find(lead=>lead.url===child);assert.deepEqual(calls,['SEARCH',parent,child]);assert.equal(childLead.originKind,'CHILD');assert.equal(childLead.navigationDepth,1);assert.equal(childLead.mechanism,'ANCHOR');assert.equal(childLead.from.url,parent);assert.equal(childLead.from.bodyHash,digest(parentBody));assert(childLead.from.locator);assert.equal(hasProviderRoutingAuthority(current),true);assert.equal(current.reads[1].v3AuthorityReview.status,'PROVIDER_BOUND');
});

test('frontier cap keeps a newly discovered stronger identity child without raising the cap',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'candidate-authority-cap-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));const x=target(),session=new OpenWebResearch(root,[x]),current=session.target(x.id);current.leads=Array.from({length:40},(_,index)=>({url:`https://generic-${index}.example/page`,title:'Generic candidate',originKind:'CHILD',childOrder:index,frontierOrder:index,from:{url:'https://directory.example/nimbus'}}));
 session.add(current,{url:'https://nimbus.example/about',title:'About Nimbus',originKind:'CHILD',childOrder:40,from:{url:'https://directory.example/nimbus'}});
 assert.equal(current.leads.length,40);assert(current.leads.some(lead=>lead.url==='https://nimbus.example/about'));
});

test('generic fixtures carry no provider-specific production knowledge',()=>{
 const source=fs.readFileSync(new URL('./candidate-authority-routing.mjs',import.meta.url),'utf8');assert(!/wahoo|chess|wahoofitness/i.test(source));
});
