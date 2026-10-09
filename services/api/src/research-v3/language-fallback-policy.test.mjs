import test from 'node:test';
import assert from 'node:assert/strict';
import {createLiveSemanticInterpreter} from './live-semantic.mjs';
import {runTarget,offlineCapabilities} from './runner.mjs';
import {evidenceFixtures,fixtureInput,wireCompletion} from './evidence-fixtures.test-support.mjs';
import {projectObservation} from './projection.mjs';
import {digest} from './model.mjs';

const fixture=evidenceFixtures.find(f=>f.key==='discount-intro');
const model='offline-model';
const run=async(input,interpret)=>runTarget({input:{...input,semantic:{mode:'LIVE'}},interpret,capabilities:offlineCapabilities(input)});
const rejecting=async()=>{let calls=0;const interpret=await createLiveSemanticInterpreter({env:{SAVLIVO_V3_SEMANTIC_MODEL:model},client:{chat:{completions:{create:async()=>{calls++;throw Error('UNEXPECTED_MODEL_CALL');}}}}});return {interpret,count:()=>calls};};

test('ordinary native English provider evidence needs no Groq',async()=>{
 const f={...fixture,name:'Aurora',market:'US',html:'<script type="application/json">'+JSON.stringify({records:[{name:'Personal',consumer:true,recurring:true,description:'USD 13 billed monthly'}]})+'</script>'};
 const input=fixtureInput(f,{bounds:{actions:1}}),{interpret,count}=await rejecting(),r=await run(input,interpret);
 assert.equal(count(),0);assert.equal(r.result.usage.modelCalls,0);
 assert.equal(r.result.truth.prices.US.propositions.PRICE_AMOUNT.value,13);
});

test('native research starts without Groq credential or model configuration',async()=>{
 const f={...fixture,name:'Aurora',market:'US',html:'<script type="application/json">'+JSON.stringify({records:[{name:'Personal',consumer:true,recurring:true,description:'USD 13 billed monthly'}]})+'</script>'};
 const input=fixtureInput(f,{bounds:{actions:1}}),interpret=await createLiveSemanticInterpreter({env:{}});
 const r=await run(input,interpret);
 assert.equal(r.result.usage.modelCalls,0);
 assert.equal(r.result.truth.prices.US.propositions.PRICE_AMOUNT.value,13);
});

test('explicit structured price, currency and billing period remain native',async()=>{
 const item={product:{id:'personal',name:'Personal',productType:'SUBSCRIPTION',consumer:true,subscription:{length:1,unit:'months'}},totalAmountWithTaxes:{amount:'7999',currencyCode:'NOK'}};
 const body='<html><head><title>Example service</title></head><body><script>const data = '+JSON.stringify({offeredProducts:{months:[item]},currenciesSubunit:{NOK:2}})+';</script></body></html>';
 const f={name:'Example service',market:'NO',html:''},input=fixtureInput(f,{bounds:{actions:1}});
 for(const row of input.fixtures)if(row.url.endsWith('/plans'))row.body=body;
 const {interpret,count}=await rejecting(),r=await run(input,interpret);
 assert.equal(count(),0);assert.equal(r.result.usage.modelCalls,0);
 assert.equal(r.result.truth.prices.NO.propositions.PRICE_AMOUNT.value,79.99);
 assert.ok(r.knowledge.observations[0].nativeStructured.facts.length);
});

test('commercial candidate and native link breadth cannot request pricing interpretation',async()=>{
 const body='<html><title>Aurora equipment</title><body><p>Consumer subscription USD 12 monthly, then USD 18 monthly.</p><nav>'+Array.from({length:16},(_,i)=>`<a href="/catalog/${i}">Membership ${i}</a>`).join('')+'</nav></body></html>';
 const input={objective:{kind:'PRICE',serviceId:'aurora',serviceName:'Aurora',providerHosts:[],candidateHosts:['lead.example','other.example'],markets:['US'],seeds:['https://lead.example/']},permissions:{DIRECT:true},bounds:{actions:1,acquisitions:1},fixtures:[{url:'https://lead.example/robots.txt',transport:'DIRECT',status:404,contentType:'text/plain',body:''},{url:'https://lead.example/',transport:'DIRECT',body}]};
 const {interpret,count}=await rejecting(),r=await run(input,interpret);
 assert.equal(count(),0);assert.equal(r.result.usage.modelCalls,0);
 assert.equal(r.knowledge.observations[0].kind,'CANDIDATE');
 assert.ok(r.result.trace.some(t=>t.event==='PROVIDER_FRONTIER'));
 assert.equal(r.result.truth.prices.US.propositions.PRICE_AMOUNT.state,'UNRESOLVED');
});

test('first-party candidate authority binds from native spans with no Groq configuration',async()=>{
 const host='aurora.example',url='https://'+host+'/',body='<html><main><h1>Aurora Club membership</h1><p>We operate Aurora Club membership and provide our own classes.</p></main><footer>© Aurora Club 2026.</footer></html>';
 const input={objective:{kind:'PRICE',serviceId:'aurora-club',serviceName:'Aurora Club',providerHosts:[],candidateHosts:[host],markets:['US'],seeds:[url]},permissions:{DIRECT:true},bounds:{actions:1,acquisitions:1},fixtures:[{url:'https://'+host+'/robots.txt',transport:'DIRECT',status:404,contentType:'text/plain',body:''},{url,transport:'DIRECT',body}]};
 const interpret=await createLiveSemanticInterpreter({env:{}}),r=await run(input,interpret);
 assert.equal(r.result.usage.modelCalls,0);assert.equal(r.knowledge.authorityBindings.length,1);
 const binding=r.knowledge.authorityBindings[0];assert.equal(binding.host,host);
 for(const span of Object.values(binding.locators))assert.equal(body.slice(span.start,span.end),span.quote);
 assert.equal(r.knowledge.observations[0].kind,'CANDIDATE');
 assert.equal(r.result.truth.service.SERVICE_IDENTITY.state,'UNRESOLVED');
});

test('material provider language gap invokes bounded source-bound help, with Truth final',async()=>{
 const input=fixtureInput(fixture,{bounds:{actions:1,modelCalls:2}});let calls=0;
 const interpret=await createLiveSemanticInterpreter({env:{SAVLIVO_V3_SEMANTIC_MODEL:model},client:{chat:{completions:{create:async payload=>{calls++;const request=JSON.parse(payload.messages[1].content);return {choices:[{finish_reason:'stop',message:{content:JSON.stringify(wireCompletion(request,fixture))}}]};}}}}});
 const r=await run(input,interpret),o=r.knowledge.observations[0];
 assert.equal(calls,1);assert.equal(r.result.usage.modelCalls,1);
 assert.ok(o.evidence||o.evidenceFragments?.length);
 assert.equal(o.sha256,digest(o.body));
 assert.ok(projectObservation(o,r.knowledge.objective).source.offers.length);
 assert.equal(r.result.truth.prices.FR.propositions.PRICE_AMOUNT.value,16.5);
});

test('missing Groq credential permits native startup and leaves a real language gap unresolved',async()=>{
 const input=fixtureInput(fixture,{bounds:{actions:1,modelCalls:2}});
 const interpret=await createLiveSemanticInterpreter({env:{SAVLIVO_V3_SEMANTIC_MODEL:model}});
 const r=await run(input,interpret);
 assert.equal(r.result.usage.modelCalls,1);
 assert.ok(r.result.trace.some(t=>t.code==='UNDERSTANDING_CREDENTIAL_UNAVAILABLE'));
 assert.equal(r.result.truth.prices.FR.propositions.PRICE_AMOUNT.state,'UNRESOLVED');
 assert.equal(r.knowledge.observations[0].sha256,digest(r.knowledge.observations[0].body));
});

test('Groq 429 leaves native projection intact and does not produce a contradiction',async()=>{
 const input=fixtureInput(fixture,{bounds:{actions:1,modelCalls:2}});let calls=0;
 const interpret=await createLiveSemanticInterpreter({env:{SAVLIVO_V3_SEMANTIC_MODEL:model},client:{chat:{completions:{create:async()=>{calls++;throw Object.assign(Error('private'),{status:429,error:{code:'rate_limit_exceeded'}});}}}}});
 const r=await run(input,interpret),o=r.knowledge.observations[0];
 assert.equal(calls,1);assert.equal(r.result.usage.modelCalls,1);
 assert.ok(r.result.trace.some(t=>t.status===429&&t.event==='UNDERSTANDING_UNAVAILABLE'));
 assert.equal(o.sha256,digest(o.body));assert.ok(o.candidates.some(c=>c.kind==='SERVICE'));
 assert.equal(r.result.truth.prices.FR.propositions.PRICE_AMOUNT.state,'UNRESOLVED');
 assert.ok(Object.values(r.result.truth.prices.FR.propositions).every(p=>p.state!=='CONTRADICTED'));
 assert.notEqual(r.result.catalog.state,'CATALOG_EXHAUSTED');
});
