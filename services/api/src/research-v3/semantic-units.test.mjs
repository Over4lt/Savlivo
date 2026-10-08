import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {digest,createKnowledge,context,checkpoint,restore} from './model.mjs';
import {selectSemanticUnits,materialForUnit,semanticUnitLimits} from './semantic-units.mjs';
import {evidenceRequest,createEvidenceInterpreter,projectEvidence} from './evidence.mjs';
import {createLiveSemanticInterpreter} from './live-semantic.mjs';
import {projectObservation} from './projection.mjs';
import {evaluate} from './truth.mjs';
import {runTarget,offlineCapabilities} from './runner.mjs';
import {evidenceFixtures,evidenceCompletion,fixtureInput} from './evidence-fixtures.test-support.mjs';
const f=evidenceFixtures.find(f=>f.key==='retained-oracle');
const nuisance='<aside>'+Array.from({length:80},(_,i)=>'<p>IRRELEVANT '+i+' '+ 'x'.repeat(500)+'</p>').join('')+'</aside>';
function observation(body,objective) {return {id:'observation',kind:'PROVIDER',format:'WEB',body,sha256:digest(body),url:objective.seeds[0],contentType:'text/html',context:context('DECODO',objective.markets[0]??'US'),outcome:'OK',httpStatus:200,truncated:false,transport:{verification:'BRACKET_VERIFIED',requestedCountry:objective.markets[0]??'US',verifiedCountry:objective.markets[0]??'US'}};}
function bigInput(fixture=f) {const input=fixtureInput(fixture);for(const row of input.fixtures)if(!row.url.endsWith('robots.txt'))row.body=row.body.replace('</body>',nuisance+'</body>');return input;}
async function run(input,complete,options={}) {const calls=[];const interpret=createEvidenceInterpreter({complete:async r=>{calls.push(r);return complete(r);}});return {...await runTarget({input,interpret,capabilities:offlineCapabilities(input),...options}),calls};}
test('large provider page selects bounded local presentation; unrelated page content is not sent',()=>{
 const input=bigInput(),o=observation(input.fixtures.at(-1).body,input.objective),units=selectSemanticUnits(o,input.objective);
 assert.ok(units.length&&units.length<=semanticUnitLimits.units);
 for(const unit of units){const r=evidenceRequest(o,input.objective,unit);assert.ok(Buffer.byteLength(JSON.stringify(r))<=8192);assert.ok(r.material.presentations.length<=16);assert.ok(r.material.segments.length<=64);assert.equal(JSON.stringify(r).includes('IRRELEVANT'),false);assert.equal(r.observation.sha256,o.sha256);}
 assert.ok(evidenceRequest(o,input.objective,units[0]).material.segments.some(s=>s.text.includes('1,080')));
 assert.deepEqual(selectSemanticUnits(o,input.objective),units);
});
test('Spotify oracle uses production selection -> mocked understanding -> binding -> deterministic truth',async()=>{
 const input=bigInput();const result=await run(input,r=>{assert.equal(JSON.stringify(r).includes('IRRELEVANT'),false);assert.ok(r.material.segments.some(s=>s.text.includes('1ヶ月間￥0、その後は月額￥1,080。')));return evidenceCompletion(r,f);});
 assert.equal(result.calls.length,1);assert.equal(result.result.truth.established,true);const p=result.result.truth.prices.JP.propositions;
 assert.equal(p.PRICE_AMOUNT.value,1080);assert.equal(p.CURRENCY.value,'JPY');assert.equal(p.MONTHLY_CADENCE.value,true);assert.equal(p.TARGET_MARKET.value,'JP');
 assert.equal(p.TARGET_MARKET.evidence[0].reference.marketContext.basis,'VERIFIED_COUNTRY_OBSERVATION');
 const source=projectObservation(result.knowledge.observations[0],input.objective).source;assert.equal(source.offers[0].role,'TRIAL');assert.equal(source.offers[0].amount,0);assert.equal(source.offers[1].role,'ORDINARY');
 assert.notEqual(result.result.catalog.state,'CATALOG_EXHAUSTED');
});
for(const [name,mutate] of [
 ['outside supplied unit',(e,o)=>{const s=o.body.indexOf('IRRELEVANT');e.service.support=[{start:s,end:s+10,quote:o.body.slice(s,s+10),translated:null}];}],
 ['invented source span',e=>e.offers[0].support[0].start++],
 ['wrong body hash',e=>e.observationSha256='wrong'],
 ['unsupported temporal edge',e=>{e.offers[0].charges[1].role='SUBSEQUENT';e.offers[0].transitions[0].from='missing';}],
 ['ambiguous temporal edge',e=>{e.offers[0].charges[1].role='SUBSEQUENT';e.offers[0].transitions[0].ambiguity=true;}]
])test('bounded graph rejects '+name,()=>{
 const input=bigInput(),o=observation(input.fixtures.at(-1).body,input.objective),unit=selectSemanticUnits(o,input.objective)[0],r=evidenceRequest(o,input.objective,unit),e=evidenceCompletion(r,f);mutate(e,o);
 const p=projectEvidence(o,input.objective,e,unit);assert.ok(p.error||!p.source.offers.some(v=>v.amount===1080&&v.role==='ORDINARY'));
});
for(const field of ['truthState','established','contradicted','verified','trustworthy','admitted','sufficient','objectiveComplete','finalMarket','confidence'])test('model cannot output authority field '+field,()=>{
 const input=bigInput(),o=observation(input.fixtures.at(-1).body,input.objective),unit=selectSemanticUnits(o,input.objective)[0],e=evidenceCompletion(evidenceRequest(o,input.objective,unit),f);e[field]=true;
 assert.equal(projectEvidence(o,input.objective,e,unit).error,'EVIDENCE_ENVELOPE_INVALID');
});
test('oversized indivisible presentation is not clipped into a stronger assertion',()=>{
 const input=fixtureInput(f),o=observation('<title>'+f.name+'</title><p>USD 10 '+ 'x'.repeat(20000)+'</p>',input.objective);assert.deepEqual(selectSemanticUnits(o,input.objective),[]);
});
test('multiple bounded units: first API failure preserves native identity; second succeeds without retry',async()=>{
 const other=evidenceFixtures.find(f=>f.key==='norwegian');const input=bigInput(other);
 for(const row of input.fixtures)if(!row.url.endsWith('robots.txt'))row.body=row.body.replace('<section>', '<section><p>USD 77 '+ 'x'.repeat(2800)+'</p></section><section>');
 let count=0;const result=await run(input,r=>{if(++count===1)throw Object.assign(Error('PRIVATE'),{status:413,error:{code:'rate_limit_exceeded'}});return evidenceCompletion(r,other);});
 assert.equal(count,2);assert.equal(result.result.truth.established,true);assert.equal(result.result.truth.service.SERVICE_IDENTITY.state,'ESTABLISHED');assert.ok(result.result.trace.some(t=>t.status===413&&t.apiCode==='rate_limit_exceeded'));assert.equal(JSON.stringify(result.result).includes('PRIVATE'),false);
 assert.deepEqual(result.knowledge.observations[0].semanticAttempts.map(a=>a.status),['FAILED','COMPLETED']);
});
test('unit attempts are reserved in checkpoints; exhausted model budget cannot dispatch another unit',async()=>{
 const other=evidenceFixtures.find(f=>f.key==='norwegian'),input=bigInput(other);input.bounds={modelCalls:1};for(const row of input.fixtures)if(!row.url.endsWith('robots.txt'))row.body=row.body.replace('<section>', '<section><p>USD 77 '+ 'x'.repeat(2800)+'</p></section><section>');
 const saved=[];const result=await run(input,()=>{throw Error('unavailable');},{save:s=>saved.push(s)});
 assert.equal(result.calls.length,1);assert.equal(result.result.usage.modelCalls,1);assert.equal(result.result.truth.established,false);assert.ok(saved.some(s=>s.payload.observations[0]?.semanticAttempts[0]?.status==='RESERVED'&&s.payload.usage.modelCalls===1));
 assert.equal(restore(checkpoint(result.knowledge)).usage.modelCalls,1);
});
test('successful bounded fragment survives reconstruction and checkpoint resume',async()=>{
 const input=bigInput(),result=await run(input,r=>evidenceCompletion(r,f)),k=restore(checkpoint(result.knowledge));assert.equal(evaluate(k).prices.JP.propositions.PRICE_AMOUNT.value,1080);
 k.observations[0].evidence.unit.presentationIds=[];assert.equal(evaluate(k).established,false);
});
test('safe API diagnostics retain request bounds, unit and provider category without raw message',async()=>{
 const input=bigInput();input.semantic={mode:'LIVE'};input.bounds={modelCalls:1};let calls=0;
 const interpret=await createLiveSemanticInterpreter({env:{SAVLIVO_V3_SEMANTIC_MODEL:'offline-model'},client:{chat:{completions:{create:async()=>{calls++;throw Object.assign(Error('PRIVATE_API_DETAIL'),{status:413,request_id:'req_offline',error:{code:'rate_limit_exceeded',type:'rate_limit_error'}});}}}}});
 const result=await runTarget({input,interpret,capabilities:offlineCapabilities(input)});const t=result.result.trace.find(t=>t.event==='UNDERSTANDING_UNAVAILABLE'&&t.status===413);
 assert.equal(calls,1);assert.equal(t.diagnostics.requestId,'req_offline');assert.equal(t.diagnostics.apiType,'rate_limit_error');assert.ok(t.diagnostics.requestBytes<=24576);assert.ok(t.diagnostics.unit);assert.equal(t.diagnostics.maxOutputTokens,8192);assert.equal(JSON.stringify(result.result).includes('PRIVATE_API_DETAIL'),false);
});
test('production selection and understanding contain no oracle/provider/country/currency branches',()=>{
 for(const file of ['semantic-units.mjs','evidence.mjs','live-semantic.mjs','engine.mjs'])assert.doesNotMatch(readFileSync(new URL(file,import.meta.url),'utf8'),/Spotify|spotify|Japanese|Japan|\bJPY\b|\bJP\b/);
});
test('units cannot combine independent fragment endpoints into an invented temporal relation',()=>{
 const input=bigInput(),o=observation(input.fixtures.at(-1).body,input.objective),unit=selectSemanticUnits(o,input.objective)[0],e=evidenceCompletion(evidenceRequest(o,input.objective,unit),f);
 e.offers[0].charges[1].role='SUBSEQUENT';e.offers[0].transitions[0].from='another-fragment-charge';
 assert.ok(projectEvidence(o,input.objective,e,unit).rejected.some(r=>r.reason==='TRANSITION_UNSUPPORTED_OR_AMBIGUOUS'));
});
test('unit-count capacity is explicit and never expands the global model budget',async()=>{
 const other=evidenceFixtures.find(f=>f.key==='norwegian'),input=bigInput(other);
 for(const row of input.fixtures)if(!row.url.endsWith('robots.txt'))row.body=row.body.replace('<section>',Array.from({length:6},(_,i)=>'<section><p>USD '+(70+i)+' '+'x'.repeat(2800)+'</p></section>').join('')+'<section>');
 const result=await run(input,()=>{throw Error('unavailable');});assert.equal(result.calls.length,result.knowledge.bounds.modelCalls);assert.ok(result.knowledge.limitsHit.includes('modelCalls'));assert.ok(result.knowledge.observations[0].semanticUnits.length>4);assert.equal(result.result.truth.established,false);
});
test('strict account schema never contains an invalid empty enum on a page without destinations',async()=>{
 const {liveSemanticContract}=await import('./live-semantic.mjs');const input=fixtureInput(f),o=observation(input.fixtures.at(-1).body,input.objective),r=evidenceRequest(o,input.objective,selectSemanticUnits(o,input.objective)[0]),schema=liveSemanticContract(r);
 assert.equal(JSON.stringify(schema).includes('"enum":[]'),false);assert.equal(schema.properties.accounts.type,'array');
});
for(const role of ['DISCOUNT','INSTALLMENT','TAX'])test('represented '+role+' amount does not establish ordinary recurring price',async()=>{
 const other=evidenceFixtures.find(f=>f.key==='norwegian'),input=fixtureInput(other);const result=await run(input,r=>{const e=evidenceCompletion(r,other);e.offers[0].charges[0].role=role;return e;});
 assert.equal(result.result.truth.prices.NO.propositions.PRICE_AMOUNT.state,'UNRESOLVED');assert.equal(result.result.truth.service.CONSUMER_MONTHLY_SUBSCRIPTION_EXISTS.state,'UNRESOLVED');
});
test('installed SDK error retains only sanitized x-request-id, never arbitrary response headers',async()=>{
 const input=bigInput();input.semantic={mode:'LIVE'};input.bounds={modelCalls:1};
 const interpret=await createLiveSemanticInterpreter({env:{SAVLIVO_V3_SEMANTIC_MODEL:'offline-model',GROQ_API_KEY:'offline-secret-value'},fetchImpl:async()=>new Response(JSON.stringify({error:{code:'rate_limit_exceeded',type:'rate_limit_error',message:'PRIVATE_BODY'}}),{status:413,headers:{'x-request-id':'req_fixture','x-private-header':'PRIVATE_HEADER'}})});
 const result=await runTarget({input,interpret,capabilities:offlineCapabilities(input)});const t=result.result.trace.find(t=>t.status===413);assert.equal(t.diagnostics.requestId,'req_fixture');assert.equal(JSON.stringify(result.result).includes('PRIVATE_HEADER'),false);assert.equal(JSON.stringify(result.result).includes('PRIVATE_BODY'),false);assert.equal(JSON.stringify(result.result).includes('offline-secret-value'),false);
});
test('unrelated local partial fragments cannot pool amount and cadence into one price',async()=>{
 const a={language:'English',name:'Harbor',market:'US',html:'<section><p>A: individual subscription USD 9.00; cadence unspecified.</p></section>',plans:[{name:'Member',anchor:'A:',charges:[{id:'c',money:{amount:9,amountText:'9.00',currency:'USD',currencyText:'USD'},cadence:{unit:'UNKNOWN',expression:null},role:'ORDINARY',derivation:'EXPLICIT',duration:null,qualifiers:[],ambiguity:false}]}]};
 const b={...a,plans:[{name:'Member',anchor:'B:',charges:[{id:'c',money:{amount:null,amountText:null,currency:null,currencyText:null},cadence:{unit:'MONTHLY',expression:'monthly'},role:'ORDINARY',derivation:'EXPLICIT',duration:null,qualifiers:[],ambiguity:false}]}]};
 const input=bigInput(a);for(const row of input.fixtures)if(!row.url.endsWith('robots.txt'))row.body=row.body.replace('</section>','<p>'+ 'x'.repeat(2800)+'</p></section><section><p>B: individual subscription monthly; USD 99 gift credit, ordinary charge unspecified.</p><p>'+'y'.repeat(2800)+'</p></section>');
 const result=await run(input,r=>evidenceCompletion(r,r.material.segments.some(s=>s.text.startsWith('A:'))?a:b));assert.equal(result.result.truth.established,false);assert.ok(result.knowledge.observations[0].evidenceFragments.length>0,JSON.stringify(result.result.trace.filter(t=>t.event.startsWith('UNDERSTANDING'))));assert.equal(result.result.truth.offers.some(o=>o.established),false);
});
