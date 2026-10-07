import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createKnowledge,context,digest,checkpoint,restore,pricePropositions} from './model.mjs';
import {queryFamilies,extractNavigation} from './discovery.mjs';
import {researchState,exhaustionDiagnosis,strategistCapacity} from './research-strategist.mjs';
import {structuredSources} from './structured-material.mjs';
import {semanticMaterial} from './source.mjs';
import {selectSemanticPlan,materialForUnit} from './semantic-units.mjs';
import {providerStates,stateCapacity} from './provider-states.mjs';
import {evaluate} from './truth.mjs';
import {runTarget} from './runner.mjs';
import {buildWorkingModel,rankResearchActions} from './working-model.mjs';
const objective={kind:'PRICE',serviceId:'lumen',serviceName:'Lumen Studio',providerHosts:['provider.example'],markets:['JP'],seeds:['https://provider.example/']};
const obs=(body,contentType='text/html',id='raw')=>({id,kind:'PROVIDER',url:objective.seeds[0],format:'WEB',context:context('DIRECT'),outcome:'OK',truncated:false,completeness:'COMPLETE',body,sha256:digest(body),contentType,candidates:[]});
const knowledge=()=>createKnowledge({objective,permissions:{DIRECT:true,TAVILY:true}});
const needs=pricePropositions.map(p=>'JP:'+p);
test('provider observation causes a query absent before acquisition, not a fourth fixed template',()=>{
 const k=knowledge(),before=queryFamilies(objective,'JP',needs,k).map(a=>a.query);
 k.observations.push(obs('<html lang="ja"><h1>光会員の契約とお支払い</h1></html>'));
 const after=queryFamilies(objective,'JP',needs,k);assert.ok(after.some(a=>a.query.includes('光会員の契約とお支払い')&&!before.includes(a.query)));
 k.observations.push(obs('<h2>OrbitPlus customer recurring terms</h2>','text/html','second'));assert.ok(queryFamilies(objective,'JP',needs,k).some(a=>a.query.includes('OrbitPlus')));
 assert.ok(after.find(a=>a.family.startsWith('learned-')).strategist.provenance.observation==='raw');
});
for(const [lang,text]of [['ja','契約と月ごとのお支払い'],['ko','정기 결제 안내'],['ar','خيارات الاشتراك والدفع'],['pt','Opções de pagamento recorrente']])test('source-derived multilingual vocabulary stays research-only '+lang,()=>{
 const k=knowledge();k.observations.push(obs(`<html lang="${lang}"><h2>${text}</h2></html>`));const q=queryFamilies(objective,'JP',needs,k).find(a=>a.family.startsWith('learned-'));assert.ok(q.query.includes(text));assert.equal(q.strategist.truthAuthority,'NONE');assert.equal(evaluate(k).eligibility.JP.result,'UNRESOLVED');assert.equal(evaluate(k).prices.JP.propositions.TARGET_MARKET.state,'UNRESOLVED');
});
test('search vocabulary is retained and consumes one meaningful learned query identity',()=>{
 const k=knowledge();k.researchResults=[{url:'https://provider.example/help',title:'Zeta agreement hub',snippet:'USD 1 monthly',action:'search'}];const a=queryFamilies(objective,'JP',needs,k).find(a=>a.family.startsWith('learned-'));k.attempts.push({action:a});assert.ok(!queryFamilies(objective,'JP',needs,k).some(b=>b.query===a.query));assert.equal(evaluate(k).established,false);
});
test('vocabulary and clue state have finite bounds and survive checkpoints',()=>{
 const k=knowledge();for(let i=0;i<100;i++)k.observations.push(obs('<h1>Heading '+i+'</h1>','text/html','o'+i));const s=researchState(k);assert.ok(s.vocabulary.length<=strategistCapacity.vocabulary);k.workingModel=buildWorkingModel(k,evaluate(k));assert.deepEqual(restore(checkpoint(k)).workingModel,k.workingModel);
});
const catalog={props:{catalog:{name:'Lumen Studio',plans:[{label:'Standard',currency:'CAD',charge:23,paymentPeriod:'month',credit:7},{label:'Extended',currency:'CAD',charge:180,paymentPeriod:'year',effectiveCost:15}]}}};
for(const mode of ['hydration','inert','json'])test('structured '+mode+' preserves exact catalog parent, values and source paths',()=>{
 const raw=JSON.stringify(catalog),body=mode==='json'?raw:`<title>Lumen Studio</title><script ${mode==='hydration'?'id="__NEXT_DATA__"':'type="application/json"'}>${raw}</script>`;
 const o=obs(body,mode==='json'?'application/json':'text/html'),s=structuredSources(body,o.contentType),m=semanticMaterial(o),p=selectSemanticPlan(o,objective);
 assert.ok(s.regions.length);assert.ok(s.regions.some(r=>body.slice(r.start,r.end).includes('paymentPeriod')&&r.pointer!==undefined));assert.ok(m.presentations.some(p=>p.structuredPath!==undefined));assert.ok(p.units.length);
 assert.ok(p.units.some(u=>materialForUnit(o,u).segments.some(s=>s.text.includes('effectiveCost')&&s.text.includes('credit'))));assert.equal(evaluate({...knowledge(),observations:[o]}).established,false);
});
test('structured Japanese keys and numerical currency remain bounded research material',()=>{
 const o=obs(JSON.stringify({商品:'光会員',通貨:'JPY',支払:1700,特典:500}),'application/json');assert.ok(structuredSources(o.body,o.contentType).regions.length);assert.ok(selectSemanticPlan(o,objective).units.length);assert.equal(evaluate({...knowledge(),observations:[o]}).eligibility.JP.result,'UNRESOLVED');
});
test('JSON strings containing HTML do not become HTML destinations or visible presentations',()=>{
 const o=obs(JSON.stringify({price:20,currency:'CAD',note:'<a href="/purchase">Pay monthly</a>'}),'application/json');assert.ok(semanticMaterial(o).presentations.every(p=>p.tag==='script-data'));
});
test('source-visible endpoint is owned, pointer-bound and never itself truth',()=>{
 const o=obs('<script type="application/json">'+JSON.stringify({apiUrl:'/public/catalog',endpoint:'https://attacker.example/list',price:8})+'</script>');const n=extractNavigation(o,objective,pricePropositions);const c=n.candidates.find(c=>c.url.endsWith('/public/catalog'));assert.ok(c);assert.ok(c.source.pointer);assert.equal(c.source.sha256,digest(o.body.slice(c.source.start,c.source.end)));assert.ok(!n.candidates.some(c=>c.url.includes('attacker')));assert.equal(evaluate({...knowledge(),observations:[o]}).eligibility.JP.result,'UNRESOLVED');
});
test('malformed or oversized JSON cannot silently invent complete regions',()=>{
 assert.equal(structuredSources('<script type="application/json">{"price":10</script>').regions.length,0);const s=structuredSources(JSON.stringify({padding:'x'.repeat(270000),price:10}),'application/json');assert.equal(s.limited,true);assert.equal(s.regions.length,0);
});
test('selected state after alternatives limit survives without global offer invalidation',()=>{
 const alternatives=Array.from({length:stateCapacity.variants+5},(_,i)=>`<option value="${i}" ${i===stateCapacity.variants+4?'selected':''}>Locale ${i}</option>`).join('');const o=obs('<title>Lumen Studio</title><section><select>'+alternatives+'</select><p>Personal subscription USD 27 billed monthly.</p></section>');const state=providerStates(o);assert.equal(state.limited,true);assert.ok(state.groups[0].variants.some(v=>v.selected&&v.value===String(stateCapacity.variants+4)));assert.ok(selectSemanticPlan(o,objective).units.length);
});
test('oversized qualifier still invalidates its own offer region',()=>{
 const o=obs('<section><label><input type="radio" checked>Billed annually '+ 'condition '.repeat(200)+'</label><p>USD 9 per month.</p></section>');assert.equal(selectSemanticPlan(o,objective).units.length,0);
});
test('irrelevant bounded navigation noise cannot starve a complete local price region',()=>{
 const o=obs('<title>Lumen Studio</title><nav>'+Array.from({length:500},(_,i)=>'<a href="/feature-'+i+'">Marketing feature</a>').join('')+'</nav><section><h2>Consumer</h2><p>USD 27 charged monthly.</p></section>');const p=selectSemanticPlan(o,objective);assert.ok(p.units.some(u=>materialForUnit(o,u).segments.some(s=>s.text.includes('27 charged monthly'))));
});
test('model failure leaves immutable material, native candidates and uncertainty intact',()=>{
 const o=obs('<title>Lumen Studio</title><p>Consumer subscription USD 27 charged monthly.</p>');o.interpretation={kind:'UNDERSTANDING_UNAVAILABLE',status:429};const k=knowledge();k.observations.push(o);const s=researchState(k);assert.equal(s.unprocessed.length,1);assert.equal(o.sha256,digest(o.body));assert.ok(selectSemanticPlan(o,objective).units.length);assert.equal(evaluate(k).eligibility.JP.result,'UNRESOLVED');assert.equal(exhaustionDiagnosis(k).kind,'UNDERSTANDING_UNAVAILABLE');
});
for(const kind of ['shell','blocked','failed','empty'])test('exhaustion diagnosis is scoped and never ineligible '+kind,()=>{
 const k=knowledge();if(kind==='shell')k.observations.push(obs('<h1>Loading</h1><script id="__NEXT_DATA__">{"price":"{price}"}</script>'));if(kind==='blocked')k.policyBlocks.push({scope:'URL',value:objective.seeds[0]});if(kind==='failed')k.attempts.push({status:'FAILED',action:{kind:'ACQUIRE'}});const s=exhaustionDiagnosis(k);assert.notEqual(s.kind,'OBJECTIVE_RESOLVED');assert.equal(evaluate(k).eligibility.JP.result,'UNRESOLVED');
});
test('full offline research adapts from newly acquired terminology to a newly discovered source',async()=>{
 const root=objective.seeds[0],seen=[];const input={objective,provider:{reviewed:true,serviceId:objective.serviceId,hosts:objective.providerHosts},permissions:{DIRECT:true,TAVILY:true},bounds:{actions:8,acquisitions:3,searches:6}};
 const capabilities={DIRECT:async a=>({url:a.url,context:a.context,format:'WEB',contentType:'text/html',body:a.url===root?'<title>Lumen Studio</title><h1>光会員のお支払い案内</h1>':'<title>Lumen Studio</title><p>Personal consumer subscription USD 27 billed monthly.</p>',outcome:'OK'}),TAVILY:async a=>{seen.push(a.query);return {results:a.query.includes('光会員のお支払い案内')?[{url:root+'contract',title:'Contract'}]:[]};}};
 const r=await runTarget({input,capabilities});assert.ok(seen.some(q=>q.includes('光会員のお支払い案内')));assert.ok(r.knowledge.observations.some(o=>o.url===root+'contract'));assert.equal(r.result.truth.prices.JP.propositions.TARGET_MARKET.state,'UNRESOLVED');assert.equal(r.result.truth.eligibility.JP.result,'UNRESOLVED');
});
const {runResearch}=await import('./engine.mjs');
const {createCapabilities}=await import('./capabilities.mjs');
test('retained inspection after cooldown consumes no second provider acquisition',async()=>{
 let calls=0,gets=0;const interpret=async()=>{calls++;const error=Object.assign(Error('offline failure'),calls===1?{status:429,v3Diagnostics:{retryAfterMs:0}}:{status:400});throw error;};interpret.semanticPlan=selectSemanticPlan;interpret.semanticUnits=()=>true;interpret.semanticAdapter={role:'EVIDENCE_UNDERSTANDING',mode:'OFFLINE'};
 const body='<title>Lumen Studio</title><p>Personal consumer subscription USD 27 per month.</p>';
 const k=await runResearch({objective,permissions:{DIRECT:true},bounds:{actions:4},interpret,capabilities:{DIRECT:async a=>{gets++;return {url:a.url,context:a.context,format:'WEB',contentType:'text/html',body,outcome:'OK'};}}});
 assert.equal(gets,1);assert.equal(calls,2);assert.equal(k.usage.acquisitions,1);assert.equal(k.usage.inspections,1);assert.ok(k.attempts.some(a=>a.action.kind==='INSPECT'));assert.equal(k.observations[0].body,body);assert.ok(k.observations[0].candidates.length);assert.equal(evaluate(k).eligibility.JP.result,'UNRESOLVED');assert.deepEqual(evaluate(restore(checkpoint(k))),evaluate(k));
});
test('advisory failure cannot set semantic cooldown or erase native source material',async()=>{
 const body='<title>Lumen Studio</title><p>Personal consumer subscription USD 27 per month.</p><nav>'+Array.from({length:8},(_,i)=>`<a href="/different-${i}">Other</a>`).join('')+'</nav>';
 const interpret=async()=>[];interpret.researchAdvisor=async()=>{throw Object.assign(Error('offline advisory unavailable'),{status:429,v3Diagnostics:{retryAfterMs:30000}});};
 const k=await runResearch({objective,permissions:{DIRECT:true},bounds:{actions:1},interpret,capabilities:{DIRECT:async a=>({url:a.url,context:a.context,format:'WEB',contentType:'text/html',body,outcome:'OK'})}});
 assert.equal(k.semanticUnavailable,undefined);assert.equal(k.researchAdviceUnavailable.status,429);assert.equal(k.observations[0].body,body);assert.ok(k.destinations.length>1);
});
test('duplicate source yield and geography choice have independent explainable factors',()=>{
 const k=knowledge();const same='<title>Lumen Studio</title><p>Welcome</p>';k.observations=[obs(same,'text/html','one'),{...obs(same,'text/html','two'),url:'https://provider.example/copy'}];const truth=evaluate(k),wm=buildWorkingModel(k,truth);const actions=['DIRECT','DECODO'].map(transport=>({id:transport,kind:'ACQUIRE',url:objective.seeds[0],context:context(transport,transport==='DECODO'?'JP':undefined),needs}));const ranked=rankResearchActions({workingModel:wm,objective,truth,destinations:k.destinations,observations:k.observations,actions});assert.ok(ranked.every(r=>r.factors.duplicate<0));assert.ok(ranked.find(r=>r.actionId==='DECODO').factors.geography>0);assert.equal(evaluate(k).prices.JP.propositions.TARGET_MARKET.state,'UNRESOLVED');
});
test('state journeys reuse exit binding within bounds, independent fetches remain distinct',async()=>{
 const reply=(body,type='text/html')=>({status:200,body:Buffer.from(body),headers:{'content-type':type},tlsVerified:true});const hop=async r=>r.url.hostname==='ipwho.is'?reply(JSON.stringify({success:true,ip:'93.184.216.34',country_code:'JP'}),'application/json'):r.url.pathname==='/robots.txt'?reply('User-agent: *\nAllow: /','text/plain'):reply('<h1>Lumen Studio</h1>');
 const caps=createCapabilities({objective,permissions:{DECODO:true},network:{resolveHost:async()=>[{address:'93.184.216.34',family:4}]},decodo:{username:'fixtureaccount',password:'fixturepassword',requestHop:hop}}),limits={maxBytes:100000,maxRequests:12};
 const a={kind:'ACQUIRE',url:objective.seeds[0],context:context('DECODO','JP'),journey:'state-'+ 'a'.repeat(24)};const first=await caps.DECODO(a,limits),second=await caps.DECODO({...a,url:objective.seeds[0]+'state'},limits),other=await caps.DECODO({...a,journey:undefined},limits);
 assert.equal(first.outcome,'OK');assert.equal(second.transport.binding,first.transport.binding);assert.notEqual(other.transport.binding,first.transport.binding);assert.equal(first.transport.verification,'BRACKET_VERIFIED');assert.equal(second.transport.sessionMode,'SOURCE_STATE_JOURNEY');assert.ok(!JSON.stringify(first.transport).includes('fixturepassword'));
});
test('research beliefs and strongest candidate scores cannot create source evidence',()=>{
 const k=knowledge(),before=evaluate(k);k.workingModel={researchConfidence:1,hypotheses:[{monthly:true,market:'JP',amount:27}],expectedInformationValue:999};k.researchResults=[{url:'https://provider.example/?billing=monthly',title:'JPY 27 billed monthly in Japan',snippet:'Actual monthly subscription',confidence:1,truthAuthority:'NONE'}];assert.deepEqual(evaluate(k),before);
});
test('empty search conversion exposes a reviewed provider root instead of claiming exhaustion',async()=>{
 const bare={...objective,seeds:[]};let gets=0;const k=await runResearch({objective:bare,permissions:{DIRECT:true,TAVILY:true},bounds:{actions:5},capabilities:{TAVILY:async()=>({results:[]}),DIRECT:async a=>{gets++;return {context:a.context,url:a.url,outcome:'OK',format:'WEB',contentType:'text/html',body:'<title>Lumen Studio</title><p>Welcome</p>'};}}});assert.equal(gets,1);assert.ok(k.trace.some(t=>t.event==='RESEARCH_BOOTSTRAP'));assert.equal(evaluate(k).eligibility.JP.result,'UNRESOLVED');
});
