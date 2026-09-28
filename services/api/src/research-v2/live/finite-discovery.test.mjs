import '../offline-replay/offline-guard.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {createHash} from 'node:crypto';
import {contextualQuery,nextDiscoveryQuery,discoveryQueryIdentity,planResearch} from './research-planner.mjs';
import {createResearchMemory} from './research-memory.mjs';
import {runOpenWebResearch} from './open-web-discovery.mjs';
import {executionBounds} from './execution-capabilities.mjs';
import {initializeAdaptiveState,assessAdaptiveService,runAdaptiveCampaign} from '../inventory/adaptive-campaign.mjs';
import {lifecycleBudgets} from '../inventory/lifecycle-continuation.mjs';
const digest=x=>createHash('sha256').update(x).digest('hex');
function fixture(t,kind='catalog'){
 const cwd=process.cwd(),root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'finite-discovery-')));process.chdir(root);t.after(()=>{process.chdir(cwd);fs.rmSync(root,{recursive:true,force:true});});
 const service=kind==='catalog'?'club':'publication',url='https://provider.example/report';
 const target={id:service,service,serviceName:service,market:kind==='catalog'?null:'DE',researchObjective:kind==='catalog'?'CATALOG_ONLY':'SERVICE_COVERAGE',smartResearch:{version:2},urls:[url],authorities:[{hostname:'provider.example',provider:service,sourceType:'OFFICIAL_PROVIDER',checkedAt:'2026-01-01'}],gaps:kind==='catalog'?['LOGIN','WEB_MANAGEMENT']:['market'],reads:[],queries:[],decisions:[],capabilities:{direct:true,tavily:true,decodo:false,browser:false,groq:false}};
 const old={...target,reads:[{requestedUrl:url,url,outcome:'OK'}],queries:[0,1].map(i=>({query:contextualQuery(target,i)}))};
 fs.writeFileSync('history.json',JSON.stringify(old));const reference={path:root+'/history.json',hash:digest(fs.readFileSync('history.json'))};
 target.researchMemory=createResearchMemory(old,reference);
 if(kind==='catalog')target.gaps=['WEB_MANAGEMENT'];
 else target.marketProof={version:1,objectives:[{key:'plan',status:'MARKET_NOT_VERIFIED',identity:{plan:'Basic'}}],sources:[],leads:[]};
 return {root,target,old,manifest:{targets:[target],conditionalFollowupTargets:[]}};
}
const forbidden=async()=>{throw Error('UNEXPECTED_ACQUISITION');};
for(const kind of ['catalog','market'])test('historical count does not exhaust new existing '+kind+' query family; controller dispatches it',async t=>{
 const f=fixture(t,kind),p=planResearch(f.target);assert.equal(p.route,'DISCOVERY');assert(!f.old.queries.some(q=>q.query===p.query));
 const a=assessAdaptiveService(initializeAdaptiveState(f.manifest),f.target.service);assert.equal(a.next.plan.query,p.query);
 const calls=[];const state=await runAdaptiveCampaign({directory:f.root+'/campaign',manifest:f.manifest,createAdapters:async()=>({search:async({query})=>{calls.push(query);return {results:[]};},read:forbidden}),maxActions:1});
 assert.deepEqual(calls,[p.query]);assert.equal(state.services[f.target.service].used.searches,1);assert.equal(state.targets[f.target.id].queries[0].query,p.query);
 assert.deepEqual(state.targets[f.target.id].verified,[],'search never becomes evidence');
});
test('ACP oracle remains exhausted when both applicable families were tried',t=>{
 const f=fixture(t);const target={...f.target,service:'acp',id:'acp',serviceName:'ACP',gaps:['LOGIN','WEB_MANAGEMENT'],urls:['https://revista.acp.pt/Relatorio_Contas_2025/13/'],authorities:[{hostname:'revista.acp.pt',provider:'ACP',sourceType:'OFFICIAL_PROVIDER',checkedAt:'2026-01-01'}]};
 const queries=[{query:'ACP official account login manage subscription site:revista.acp.pt'},{query:'ACP subscription membership billing account management site:revista.acp.pt'}];
 target.researchMemory=createResearchMemory({...target,queries,reads:[{requestedUrl:target.urls[0],url:target.urls[0],outcome:'OK'}]},f.target.researchMemory.references[0]);
 assert.equal(planResearch(target).reason,'DISCOVERY_EXHAUSTED');
});
test('finite exhaustion suppresses exact and cosmetic repeats, rejected actions and wording loops',t=>{
 const {target}=fixture(t);const first=contextualQuery(target,0),second=contextualQuery(target,1);
 const history=[{route:'DISCOVERY',query:first,completed:true}];assert.equal(nextDiscoveryQuery(target,history),second);
 const cosmetic=q=>'  '+q.toUpperCase().replaceAll(' ',' \n  ')+'  ';
 history[0].query=cosmetic(first);assert.equal(nextDiscoveryQuery(target,history),second);
 history.push({route:'DISCOVERY',query:cosmetic(second),rejected:true});
 for(let i=0;i<100;i++){assert.equal(nextDiscoveryQuery(target,history),null);history.push({route:'DISCOVERY',query:cosmetic(i%2?first:second),completed:true});}
 assert.equal(discoveryQueryIdentity('ＡＢＣ “x”'),discoveryQueryIdentity('abc "x"'));
});
test('new relevant destination still wins before finite discovery exhaustion',t=>{
 const {target}=fixture(t);target.researchMemory.attempts.push(...[0,1].map(i=>({route:'DISCOVERY',query:contextualQuery(target,i),completed:true,reference:target.researchMemory.references[0]})));
 assert.equal(planResearch(target).reason,'DISCOVERY_EXHAUSTED');target.urls.push('https://provider.example/help/billing');assert.equal(planResearch(target).route,'DIRECT');
});
test('capability and current action budgets are never bypassed by historical novelty',t=>{
 const {target,manifest}=fixture(t);assert.equal(planResearch({...target,capabilities:{...target.capabilities,tavily:false}}).reason,'CAPABILITY_DISABLED_TAVILY');
 const state=initializeAdaptiveState(manifest,{limits:{searches:0}});assert.equal(assessAdaptiveService(state,target.service).stop.kind,'BUDGET_LIMITED');
 for(const bounds of [{...executionBounds,perServiceSearches:0},{...executionBounds,searches:0}])assert.equal(planResearch(target,{executionContext:{bounds,usage:{reads:0,searches:0,acquisitions:0}}}).reason,'DISCOVERY_BUDGET_EXHAUSTED');
});
test('complete dispatch, interruption/resume and terminal reread preserve consumed allowance and finite actions',async t=>{
 const {root,target,manifest}=fixture(t),calls=[],args={directory:root+'/resume',manifest,createAdapters:async()=>({search:async({query})=>{calls.push(query);return {results:[]};},read:forbidden})};
 await assert.rejects(runAdaptiveCampaign({...args,onTransition:event=>{if(event==='NATIVE_RESULT_PERSISTED')throw Error('SIMULATED_INTERRUPTION');}}),/SIMULATED_INTERRUPTION/);
 const first=calls[0],checkpoint=JSON.parse(fs.readFileSync(root+'/resume/adaptive-state.json'));assert(checkpoint.pending);
 const state=await runAdaptiveCampaign(args);assert.deepEqual(calls,[first,contextualQuery(target,1)]);assert.equal(state.services[target.service].used.searches,2);assert.equal(state.fingerprint,checkpoint.fingerprint);
 assert.equal(state.services[target.service].stop.reason,'DISCOVERY_EXHAUSTED');assert.equal(state.complete,true);assert.deepEqual(state.targets[target.id].verified,[]);
 const bytes=fs.readFileSync(root+'/resume/adaptive-state.json');await runAdaptiveCampaign(args);assert.equal(calls.length,2);assert.deepEqual(fs.readFileSync(root+'/resume/adaptive-state.json'),bytes);
});
test('per-service action allowance stays shared across targets and retained history grants no refund',async t=>{
 const f=fixture(t),calls=[],target2={...f.target,id:'alternative',urls:[]};
 const state=await runAdaptiveCampaign({directory:f.root+'/bounded',manifest:{targets:[f.target,target2],conditionalFollowupTargets:[]},limits:{searches:1},createAdapters:async()=>({search:async a=>{calls.push(a.query);return {results:[]};},read:forbidden})});
 assert.equal(calls.length,1);assert.equal(state.services[f.target.service].used.searches,1);assert.equal(state.services[f.target.service].stop.kind,'BUDGET_LIMITED');
});
test('shared controller search ceiling still bounds multiple services',async t=>{
 const f=fixture(t),other={...f.target,id:'other',service:'other',serviceName:'Other',urls:[],researchMemory:undefined,authorities:[{...f.target.authorities[0],provider:'Other'}]},calls=[];
 const state=await runOpenWebResearch({directory:f.root+'/controller',targets:[f.target,other],bounds:{searches:1},search:async a=>{calls.push(a.query);return {results:[]};},read:forbidden});assert.equal(calls.length,1);assert.equal(state.usage.searches,1);
});
test('durable request-bound refusal stays budget-limited and is not replenished on resume',async t=>{
 const f=fixture(t),budget=lifecycleBudgets({cohort:{manifest:{serviceIds:['club','candidate']}},targets:[f.target],rows:[{service:'candidate',providerReview:{selectedCandidate:{url:'https://candidate.example'}}}]});assert.deepEqual(budget,{byService:{club:36,candidate:4},total:40});
 let attempts=0;const args={directory:f.root+'/ledger',manifest:f.manifest,isolateFailures:true,createAdapters:async()=>({search:async()=>{attempts++;throw Error('HANDOFF_REQUEST_BOUND');},read:forbidden})};
 const state=await runAdaptiveCampaign(args);assert.equal(state.services.club.stop.kind,'BUDGET_LIMITED');assert.equal(state.services.club.failedAction.requiresReview,false);await runAdaptiveCampaign(args);assert.equal(attempts,1);
});
