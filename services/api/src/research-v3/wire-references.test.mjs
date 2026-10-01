import test from 'node:test';
import assert from 'node:assert/strict';
import {digest} from './model.mjs';
import {selectSemanticUnits} from './semantic-units.mjs';
import {evidenceRequest,projectEvidence} from './evidence.mjs';
import {wireInput,wireReferenceRegistry,validateWireReferences,reconstructWire,wireSummary,parseSemanticWire} from './semantic-wire.mjs';
import {evidenceFixtures,fixtureInput,wireCompletion} from './evidence-fixtures.test-support.mjs';
const fixture=evidenceFixtures.find(f=>f.key==='retained-oracle');
function setup() {
 const f={...fixture,html:'<main>'+fixture.html.replace('</section>','<a href="/account">Account</a></section>')+'</main>'},input=fixtureInput(f),body=input.fixtures.at(-1).body;
 const o={id:'observation',kind:'PROVIDER',format:'WEB',body,sha256:digest(body),url:input.objective.seeds[0],httpStatus:200,outcome:'OK',context:{transport:'DECODO',networkGeography:'JP'},transport:{requestedCountry:'JP',verifiedCountry:'JP',verification:'BRACKET_VERIFIED'},contentType:'text/html'};
 const unit=selectSemanticUnits(o,input.objective)[0],r=evidenceRequest(o,input.objective,unit),i=wireInput(r),w=wireCompletion(i,f);
 w.serviceSources=[];w.offers[0].serviceRef=i.knownObservationService.reference;w.offers[0].association='PRIMARY_SERVICE';for(const c of w.charges)c.currency=null;
 return {r,i,w,o,input};
}
const namespaces=['segment','presentation','number','currency','destination','observation_service','offer','charge','account'];
for(const ns of namespaces)test('typed registry resolves every exposed/returned '+ns+' ID unchanged',()=>{
 const {r,i,w}=setup();w.accounts=i.destinations.map((d,j)=>({id:'a'+j,destination:d.id,role:'ACCOUNT',sources:d.segments,ambiguous:false}));
 const registry=wireReferenceRegistry(r,w);assert.ok(registry.ids(ns).length);
 for(const id of registry.ids(ns))assert.ok(registry.resolve(ns,id));
 for(const other of namespaces.filter(n=>n!==ns))for(const id of registry.ids(other))assert.throws(()=>registry.resolve(ns,id,{field:'test'}),e=>e.v3Diagnostics.expectedNamespace===ns&&e.v3Diagnostics.reason==='WRONG_NAMESPACE');
});
const supportFields=[['serviceSources',(w,ids)=>w.serviceSources=ids],['charges[0].sources',(w,ids)=>w.charges[0].sources=ids],['relations[0].sources',(w,ids)=>w.relations[0].sources=ids],['offers[0].marketStatements[0].sources',(w,ids)=>w.offers[0].marketStatements=[{country:'JP',polarity:'INCLUDED',sources:ids,ambiguous:false}]],['populations[0].sources',(w,ids,i)=>w.populations=[{scope:'SERVICE_TOTAL',measure:'USERS',kind:'EXACT',countRef:i.numbers[0].id,count:i.numbers[0].values[0],scale:1,scaleText:null,sources:ids,ambiguous:false}]],['accountStatements[0].sources',(w,ids)=>w.accountStatements=[{operation:'LOGIN',access:'ACCOUNT',polarity:'AFFIRMED',sources:ids,ambiguous:false}]],['accounts[0].sources',(w,ids,i)=>w.accounts=[{id:'a0',destination:i.destinations[0].id,role:'ACCOUNT',sources:ids,ambiguous:false}]]];
for(const [field,set] of supportFields)test('every supplied segment resolves in '+field,()=>{
 const {r,i,w}=setup();for(const s of i.segments){const copy=structuredClone(w);set(copy,[s.id,s.id],i);assert.doesNotThrow(()=>validateWireReferences(r,copy));}
 const bad=structuredClone(w);set(bad,[i.presentations[0].id],i);assert.throws(()=>reconstructWire(r,bad),e=>e.message==='WIRE_REFERENCE_INVALID'&&e.v3Diagnostics.field===field+'[0]'&&e.v3Diagnostics.expectedNamespace==='segment'&&e.v3Diagnostics.exposedInRequest===true);
});
for(const [field,ns,set,rows] of [
 ['offers[0].presentation','presentation',(w,id)=>w.offers[0].presentation=id,i=>i.presentations],
 ['offers[0].serviceRef','observation_service',(w,id)=>w.offers[0].serviceRef=id,i=>[{id:i.knownObservationService.reference}]],
 ['charges[0].amountRef','number',(w,id)=>w.charges[0].amountRef=id,i=>i.numbers],
 ['charges[0].currencyRef','currency',(w,id)=>w.charges[0].currencyRef=id,i=>i.currencies],
 ['accounts[0].destination','destination',(w,id)=>w.accounts=[{id:'a0',destination:id,role:'ACCOUNT',sources:[],ambiguous:false}],i=>i.destinations],
 ['populations[0].countRef','number',(w,id)=>w.populations=[{scope:'SERVICE_TOTAL',measure:'USERS',kind:'EXACT',countRef:id,count:1,scale:1,scaleText:null,sources:[],ambiguous:false}],i=>i.numbers]
])test('compatible field accepts all supplied '+field+' references; rejects foreign IDs precisely',()=>{
 const {r,i,w}=setup();for(const row of rows(i)){const copy=structuredClone(w);set(copy,row.id);assert.doesNotThrow(()=>validateWireReferences(r,copy));}
 for(const bad of ['unknown','other-observation-ref']){const copy=structuredClone(w);set(copy,bad);assert.throws(()=>reconstructWire(r,copy),e=>e.v3Diagnostics.field===field&&e.v3Diagnostics.expectedNamespace===ns&&e.v3Diagnostics.exposedInRequest===false&&e.v3Diagnostics.availableReferences.length>0);}
});
test('semantic owners and relation endpoints resolve in explicit object namespaces',()=>{
 const {r,w}=setup();for(const o of w.offers){const copy=structuredClone(w);copy.charges[0].offer=o.id;assert.doesNotThrow(()=>validateWireReferences(r,copy));}
 for(const c of w.charges)for(const endpoint of ['from','to']){const copy=structuredClone(w);copy.relations[0][endpoint]=c.id;assert.doesNotThrow(()=>validateWireReferences(r,copy));}
 w.accounts=[{id:'a0',destination:wireInput(r).destinations[0].id,role:'ACCOUNT',sources:[],ambiguous:false}];w.relations=[{from:'a0',to:'a0',kind:'AUTHENTICATES_TO',sources:[],ambiguous:false}];assert.doesNotThrow(()=>validateWireReferences(r,w));
 w.relations[0].to=w.charges[0].id;assert.throws(()=>reconstructWire(r,w),e=>e.message==='WIRE_RELATION_INVALID'&&e.v3Diagnostics.field==='relations[0].to'&&e.v3Diagnostics.expectedNamespace==='account');
});
test('all reference-bearing fields survive the safe wire summary',()=>{
 const {r,i,w}=setup();w.accounts=[{id:'a0',destination:i.destinations[0].id,role:'ACCOUNT',sources:[i.segments[0].id],ambiguous:false}];w.populations=[{countRef:i.numbers[0].id,sources:[i.segments[0].id]}];w.accountStatements=[{sources:[i.segments[0].id]}];w.serviceSources=[i.segments[0].id];
 const summary=wireSummary(r,w);for(const key of ['serviceSources','accounts','populations','accountStatements'])assert.deepEqual(summary[key].map?.(x=>typeof x==='string'?x:x.sources)??summary[key],w[key].map(x=>typeof x==='string'?x:x.sources));assert.equal(summary.accounts[0].destination,w.accounts[0].destination);assert.equal(summary.populations[0].countRef,w.populations[0].countRef);
});
test('faithful primary-service/null-currency fragment reconstructs all references without repeated title support',()=>{
 const {r,w,o,input}=setup(),e=reconstructWire(r,w),p=projectEvidence(o,input.objective,e,r.unit);
 assert.equal(p.error,undefined);assert.equal(e.offers[0].charges[0].money.amount,0);assert.equal(e.offers[0].charges[0].role,'INTRODUCTORY');assert.equal(e.offers[0].charges[1].money.amount,1080);assert.equal(e.offers[0].charges[1].money.currency,'JPY');assert.equal(e.offers[0].transitions[0].kind,'RECURS_AFTER_INTRO');
});
test('reference IDs stable through serialization, parsing, selection and request restoration',()=>{
 const {r,w}=setup(),copy=JSON.parse(JSON.stringify(r));assert.deepEqual(wireInput(copy),wireInput(r));assert.deepEqual(wireInput(setup().r),wireInput(r));assert.deepEqual(reconstructWire(copy,parseSemanticWire(JSON.stringify(w)).wire),reconstructWire(r,w));
});
test('duplicate valid support references normalize without creating additional evidence',()=>{
 const {r,w}=setup(),a=reconstructWire(r,w);for(const c of w.charges)c.sources.push(...c.sources);for(const rel of w.relations)rel.sources.push(...rel.sources);assert.deepEqual(reconstructWire(r,w),a);
});
test('actual SDK mock / safe diagnostics / checkpoint retain every failed reference field',async()=>{
 const {createLiveSemanticInterpreter}=await import('./live-semantic.mjs'),{runTarget,offlineCapabilities}=await import('./runner.mjs'),{checkpoint,restore}=await import('./model.mjs');
 const f={...fixture,html:'<main>'+fixture.html+'</main>'},input={...fixtureInput(f,{bounds:{actions:1,modelCalls:1}}),semantic:{mode:'LIVE'}};
 const interpret=await createLiveSemanticInterpreter({env:{GROQ_API_KEY:'offline-placeholder',SAVLIVO_V3_SEMANTIC_MODEL:'offline-model'},fetchImpl:async(url,options)=>{
  const request=JSON.parse(JSON.parse(options.body).messages[1].content),wire=wireCompletion(request,f);wire.serviceSources=['s_invented'];
  return new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify(wire)}}]}),{headers:{'content-type':'application/json'}});
 }});
 const run=await runTarget({input,interpret,capabilities:offlineCapabilities(input)}),failed=run.result.trace.find(t=>t.code==='WIRE_REFERENCE_INVALID');assert.ok(failed);assert.equal(failed.diagnostics.field,'serviceSources[0]');assert.equal(failed.diagnostics.reference,'s_invented');assert.equal(failed.diagnostics.expectedNamespace,'segment');assert.equal(failed.diagnostics.exposedInRequest,false);assert.deepEqual(failed.diagnostics.wire.serviceSources,['s_invented']);assert.equal(run.result.truth.established,false);
 assert.deepEqual(restore(checkpoint(run.knowledge)).trace.find(t=>t.code==='WIRE_REFERENCE_INVALID').diagnostics,failed.diagnostics);
});
test('faithful pricing crosses actual mocked SDK with system service and null currency references',async()=>{
 const {createLiveSemanticInterpreter}=await import('./live-semantic.mjs'),{runTarget,offlineCapabilities}=await import('./runner.mjs'),{checkpoint,restore}=await import('./model.mjs'),{evaluate}=await import('./truth.mjs');
 const f={...fixture,html:'<main>'+fixture.html+'</main>'},input={...fixtureInput(f,{bounds:{actions:1,modelCalls:1}}),semantic:{mode:'LIVE'}};let count=0;
 const interpret=await createLiveSemanticInterpreter({env:{GROQ_API_KEY:'offline-placeholder',SAVLIVO_V3_SEMANTIC_MODEL:'offline-model'},fetchImpl:async(url,options)=>{
  count++;const payload=JSON.parse(options.body);assert.equal(payload.response_format.json_schema.name,'v3_semantic_unit_v4');
  const request=JSON.parse(payload.messages[1].content),wire=wireCompletion(request,f);wire.serviceSources=[];for(const o of wire.offers){o.serviceRef=request.knownObservationService.reference;o.association='PRIMARY_SERVICE';}for(const c of wire.charges)c.currency=null;
  return new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify(wire)}}]}),{headers:{'content-type':'application/json'}});
 }});
 const run=await runTarget({input,interpret,capabilities:offlineCapabilities(input)});assert.equal(count,1);assert.equal(run.result.stop.reason,'OBJECTIVE_ESTABLISHED');assert.equal(run.result.truth.established,true);const p=run.result.truth.prices.JP.propositions;assert.equal(p.PRICE_AMOUNT.value,1080);assert.equal(p.CURRENCY.value,'JPY');assert.equal(p.TARGET_MARKET.value,'JP');assert.equal(evaluate(restore(checkpoint(run.knowledge))).established,true);
});
test('malformed reference text is classified without retaining arbitrary generation content',()=>{
 const {r,w}=setup();w.serviceSources=['arbitrary free text'];assert.throws(()=>reconstructWire(r,w),e=>e.message==='WIRE_REFERENCE_INVALID'&&e.v3Diagnostics.reference===null&&e.v3Diagnostics.reason==='MALFORMED_REFERENCE');
 w.serviceSources=[];w.offers[0].id='arbitrary free text';assert.throws(()=>reconstructWire(r,w),/WIRE_ID_INVALID/);
});
