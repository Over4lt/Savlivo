import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {buildWorkingModel,rankResearchActions,workingCapacity} from './working-model.mjs';
import {createReasoner} from './reasoner.mjs';
import {createKnowledge,addDestination,pricePropositions,context,checkpoint,restore,canonical,digest} from './model.mjs';
import {evaluate} from './truth.mjs';import {runResearch,availableActions} from './engine.mjs';
import {parseAcquisitionRobots,evaluateAcquisitionRobots} from './acquisition-robots.mjs';
const objective={kind:'PRICE',serviceId:'club',serviceName:'Aurora',providerHosts:['provider.example'],markets:['US'],seeds:['https://provider.example/']};
function add(k,path,family,score=10,role='UNKNOWN',state=null){return addDestination(k,{url:'https://provider.example'+path,depth:1,needs:pricePropositions,grounding:{kind:'PROVIDER_LINK',observation:'source'},discovery:{score,family,research:{role},...(state?{state}:{})}});}
const rows=k=>{const offered=availableActions(k,{DIRECT(){},DECODO(){}});const wm=buildWorkingModel(k,offered.truth);return rankResearchActions({...k,workingModel:wm,truth:offered.truth,actions:offered.actions});};
for(const script of ['料金','الاشتراك','Plans','Abonnements','요금'])test('general family saturation beats superficially high score '+script,()=>{
 const k=createKnowledge({objective,permissions:{DECODO:true}});k.destinations=[];
 for(let i=0;i<7;i++)add(k,'/collection/'+i,'repeated',20);
 add(k,'/opaque-'+encodeURIComponent(script),'distinct',15);
 for(let i=0;i<3;i++)k.attempts.push({id:'consumed'+i,status:'COMPLETED',action:{kind:'ACQUIRE',url:'https://provider.example/collection/'+i,context:context('DECODO','US')}});
 const r=rows(k);assert.equal(r[0].family,'distinct');assert.ok(r.some(r=>r.family==='repeated'&&r.factors.familySaturation<0));
});
test('different billing state is valuable without URL truth or expected answer',()=>{
 const k=createKnowledge({objective,permissions:{DECODO:true}});k.destinations=[];add(k,'/surface?choice=one','states',20,'STATE',{group:'states',variant:'one',selected:true});add(k,'/surface?choice=two','states',8,'STATE',{group:'states',variant:'two',selected:false});add(k,'/help','help',20,'SUPPORT');
 const r=rows(k);assert.equal(r[0].expectedInformation,'Discriminate source-exposed provider state');assert.equal(evaluate(k).established,false);assert.equal(evaluate(k).eligibility.US.result,'UNRESOLVED');
});
test('working-model checkpoint and next decision reproduce without advisory re-query',()=>{
 const k=createKnowledge({objective,permissions:{DIRECT:true,DECODO:true}});add(k,'/surface','surface');k.workingModel=buildWorkingModel(k,evaluate(k));const restored=restore(checkpoint(k));assert.deepEqual(restored.workingModel,k.workingModel);assert.deepEqual(rows(restored),rows(k));assert.equal(canonical(evaluate(k)),canonical(evaluate(restored)));
});
for(const n of [127,128,129,1024])test('working capacities '+n,()=>{const k=createKnowledge({objective,bounds:{candidateDestinations:2048}});for(let i=0;i<n;i++)add(k,'/'+i,'family'+i,10,'STATE',{group:'family'+i,variant:String(i)});k.workingModel={history:Array.from({length:1000},()=>({signature:'old'})),decisions:Array.from({length:1000},()=>({selected:'old'}))};const w=buildWorkingModel(k,evaluate(k));assert.ok(w.resources.length<=workingCapacity.resources);assert.ok(w.families.length<=workingCapacity.families);assert.ok(w.hypotheses.length<=workingCapacity.hypotheses);assert.ok(w.history.length<=workingCapacity.history);assert.ok(w.decisions.length<=workingCapacity.decisions);assert.ok(w.variants.length<=workingCapacity.variants);});
test('100% confidence, mutation of research history and hypothetical monthly state cannot establish truth',()=>{
 const k=createKnowledge({objective});k.workingModel=buildWorkingModel(k,evaluate(k));for(const h of k.workingModel.hypotheses){h.confidence=1;h.kind='MONTHLY_SUBSCRIPTION_ESTABLISHED';}k.workingModel.objective.eligibility.US={result:'ELIGIBLE'};assert.equal(evaluate(k).eligibility.US.result,'UNRESOLVED');assert.equal(evaluate(k).established,false);
});
test('reasoner acts on copies, cannot edit evidence or counters through beliefs',async()=>{
 const k=await runResearch({objective,permissions:{DIRECT:true},bounds:{actions:1},reasoner:s=>{s.workingModel.objective.unresolved=[];s.truth.established=true;s.usage.actions=-100;return {actionId:s.actions[0].id,reason:'Test advisory isolation'};},capabilities:{DIRECT:a=>({url:a.url,context:a.context,body:'{"serviceId":"club","offers":[]}',outcome:'OK'})}});assert.equal(k.usage.actions,1);assert.equal(evaluate(k).established,false);assert.equal(k.trace.find(t=>t.event==='RESEARCH_DECISION').unresolved.length,7);
});
const policies=JSON.parse(readFileSync(new URL('campaign-iii-policy.test-fixtures.json',import.meta.url)));
for(const p of policies)test('exact Campaign III policy '+p.case,()=>{assert.equal(digest(p.body),p.sha256);assert.equal(p.oldFailure.diagnostics.reason,'INVALID_PATH');const parsed=parseAcquisitionRobots(p.body);assert.equal(evaluateAcquisitionRobots(parsed,p.target).decision,'ALLOWED');assert.equal(evaluateAcquisitionRobots(parsed,'https://'+new URL(p.target).hostname+'/login').decision,p.case==='10'?'DISALLOWED':'ALLOWED');});
for(const [pattern,url,expected]of [['*.gif$','/folder/a.gif','DISALLOWED'],['*.gif$','/folder/a.gif?x=1','ALLOWED'],['*?blocked=1','/path?blocked=1','DISALLOWED'],['*/private/','/en/private/file','DISALLOWED'],['/café','/caf%C3%A9','DISALLOWED'],['/%7euser','/~user','DISALLOWED'],['/%2Fsecret','//secret','ALLOWED']])test('robots generalized octet/wildcard '+pattern+' '+url,()=>assert.equal(evaluateAcquisitionRobots(parseAcquisitionRobots('User-agent: *\nDisallow: '+pattern),'https://provider.example'+url).decision,expected));
test('Allow wins equal specificity and explicit denial remains denial',()=>{const p=parseAcquisitionRobots('User-agent: *\nDisallow: /*.png$\nAllow: /*.png$\nDisallow: /private');assert.equal(evaluateAcquisitionRobots(p,'https://provider.example/x.png').decision,'ALLOWED');assert.equal(evaluateAcquisitionRobots(p,'https://provider.example/private').decision,'DISALLOWED');});
test('working model changes no account propositions',()=>{const k=createKnowledge({objective}),before=evaluate(k).accountAccess;k.workingModel={hypotheses:[{kind:'LOGIN',confidence:1},{kind:'MANAGEMENT'},{kind:'CANCEL'}]};assert.deepEqual(evaluate(k).accountAccess,before);});
