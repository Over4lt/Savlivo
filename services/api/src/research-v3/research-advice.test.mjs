import test from 'node:test';import assert from 'node:assert/strict';
import {createLiveSemanticInterpreter} from './live-semantic.mjs';
import {runTarget,offlineCapabilities} from './runner.mjs';
import {checkpoint,restore} from './model.mjs';
import {evaluate} from './truth.mjs';
const rows=Array.from({length:64},(_,i)=>({id:'nav-'+i,label:'Unfamiliar navigation '+i,url:'https://provider.example/'+String(i).padEnd(1800,'x'),context:'NAVIGATION',state:null}));
const needs=[{id:'US:MONTHLY_SUBSCRIPTION',proposition:'MONTHLY_SUBSCRIPTION'}];
async function adapter(reply){const calls=[];const interpret=await createLiveSemanticInterpreter({env:{SAVLIVO_V3_SEMANTIC_MODEL:'offline'},client:{chat:{completions:{create:async p=>{calls.push(p);return reply(p);}}}}});return {interpret,calls};}
function result(content){return {choices:[{finish_reason:'stop',message:{content:JSON.stringify(content)}}]};}
test('research advice request and response are independently bounded, source IDs only',async()=>{
 const {interpret,calls}=await adapter(p=>{const input=JSON.parse(p.messages[1].content);return result({candidates:[{candidateId:input.candidates[0].candidateId,role:'STATE',stateIntent:'MONTHLY_PAYMENT',needs:['MONTHLY_SUBSCRIPTION'],confidence:1,verifiedPrice:999},{candidateId:'forged',role:'PRICING',stateIntent:'MONTHLY_PAYMENT',needs:['MONTHLY_SUBSCRIPTION']}]});});
 const advice=await interpret.researchAdvisor(rows,needs);assert.equal(calls.length,1);assert.ok(Buffer.byteLength(JSON.stringify(calls[0]))<=24576);assert.ok(JSON.parse(calls[0].messages[1].content).candidates.length<64);assert.equal(advice.length,1);assert.equal(advice[0].confidence,undefined);assert.equal(advice[0].verifiedPrice,undefined);assert.equal(advice.diagnostics.purpose,'RESEARCH_ONLY');
});
for(const code of [400,429,503])test('advisory external error remains failure with zero retry '+code,async()=>{const {interpret,calls}=await adapter(()=>{throw Object.assign(Error('PRIVATE_ERROR'),{status:code});});await assert.rejects(interpret.researchAdvisor(rows,needs),e=>e.status===code&&e.v3Diagnostics.purpose==='RESEARCH_ADVICE');assert.equal(calls.length,1);});
for(const content of [{candidates:Array(65).fill({})},{candidates:'bad'},{candidates:[{candidateId:'nav-0',role:'VERIFIED',stateIntent:'MONTHLY_PAYMENT',needs:['MONTHLY_SUBSCRIPTION']}] }])test('malformed or unsupported research classification cannot create an action '+JSON.stringify(content).slice(0,60),async()=>{
 const {interpret}=await adapter(()=>result(content));if(Array.isArray(content.candidates)&&content.candidates.length===1)assert.equal((await interpret.researchAdvisor(rows,needs)).length,0);else await assert.rejects(interpret.researchAdvisor(rows,needs),/RESEARCH_RESPONSE_INVALID/);
});
test('ordinary unresolved source invokes advice only within the shared model budget and checkpoints counters',async()=>{
 const objective={kind:'PRICE',serviceId:'club',serviceName:'Aurora',providerHosts:['provider.example'],markets:['US'],seeds:['https://provider.example/']};
 const body='<title>Aurora</title><main><nav>'+Array.from({length:12},(_,i)=>`<a href="/resource/${i}">Aurora ${i}</a>`).join('')+'</nav><p>Unresolved material</p></main>';
 const input={objective,provider:{reviewed:true,serviceId:'club',hosts:objective.providerHosts},permissions:{DECODO:true},bounds:{actions:1,modelCalls:2},fixtures:[{url:'https://provider.example/robots.txt',transport:'DECODO',country:'US',status:404,contentType:'text/plain',body:''},{url:objective.seeds[0],transport:'DECODO',country:'US',body}]};
 const {interpret,calls}=await adapter(p=>p.response_format.json_schema.name==='v3_research_advice_v1'?result({candidates:JSON.parse(p.messages[1].content).candidates.slice(0,24).map(c=>({candidateId:c.candidateId,role:'PRICING',stateIntent:'MONTHLY_PAYMENT',needs:['MONTHLY_SUBSCRIPTION']}))}):result({language:'en',serviceSources:['s0'],serviceAmbiguous:false,offers:[],charges:[],relations:[],accounts:[],populations:[],accountStatements:[]}));
 const r=await runTarget({input,interpret,capabilities:offlineCapabilities(input)});assert.equal(calls.length,2);assert.equal(r.result.usage.modelCalls,2);assert.equal(r.knowledge.researchAdvisoryCalls,1);assert.equal(r.result.truth.eligibility.US.result,'UNRESOLVED');assert.deepEqual(evaluate(restore(checkpoint(r.knowledge))),r.result.truth);assert.equal(restore(checkpoint(r.knowledge)).researchAdvisoryCalls,1);
});
