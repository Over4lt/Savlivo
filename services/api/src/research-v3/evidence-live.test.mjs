import test from 'node:test';
import assert from 'node:assert/strict';
import {createLiveSemanticInterpreter,liveSemanticContract} from './live-semantic.mjs';
import {configuredInterpreter,prepareLive,runTarget,offlineCapabilities} from './runner.mjs';
import {checkpoint} from './model.mjs';
import {evidenceFixtures,fixtureInput,wireCompletion} from './evidence-fixtures.test-support.mjs';
const f=evidenceFixtures.find(f=>f.key==='discount-intro');
const env={SAVLIVO_V3_SEMANTIC_MODEL:'offline-model'};
const input=()=>({...fixtureInput(f),semantic:{mode:'LIVE'}});
async function runMock(reply,options={}) {
 const calls=[],i=input();
 const client={chat:{completions:{create:async(p,{signal})=>{
  const r=JSON.parse(p.messages[1].content);calls.push({p,r,signal});
  return reply?reply(r,signal):{choices:[{finish_reason:'stop',message:{content:JSON.stringify(wireCompletion(r,f))}}]};
 }}}};
 const interpret=await createLiveSemanticInterpreter({env,client,...options});
 return {...await runTarget({input:i,interpret,capabilities:offlineCapabilities(i)}),calls,interpret,input:i};
}
test('live contract: source understanding from original material, no translation call or truth verdict',async()=>{
 const run=await runMock(),{p,r}=run.calls[0];
 assert.equal(run.result.truth.established,true);assert.equal(run.calls.length,1);assert.equal(run.knowledge.semanticAdapter.role,'EVIDENCE_UNDERSTANDING');
 assert.equal('objective' in r,false);assert.equal('observation' in r,false);assert.equal('translation' in r,false);assert.equal('sha256' in r,false);
 assert.equal(p.response_format.type,'json_schema');assert.equal(p.response_format.json_schema.strict,true);
 assert.equal(p.response_format.json_schema.name,'v3_semantic_unit_v3');assert.equal(p.max_completion_tokens,8192);
 const contract=liveSemanticContract(r);assert.deepEqual(Object.keys(contract.properties).sort(),['accountStatements','accounts','charges','language','offers','populations','relations','serviceAmbiguous','serviceSources']);
 assert.equal(JSON.stringify(contract).includes('ESTABLISHED'),false);assert.equal(JSON.stringify(contract).includes('verified'),false);
});
for(const [name,reply,code] of [
 ['refusal',()=>({choices:[{finish_reason:'stop',message:{refusal:'PRIVATE_REFUSAL'}}]}),'UNDERSTANDING_REFUSAL'],
 ['truncation',()=>({choices:[{finish_reason:'length',message:{content:'{}'}}]}),'UNDERSTANDING_RESPONSE_INCOMPLETE'],
 ['malformed JSON',()=>({choices:[{finish_reason:'stop',message:{content:'{bad'}}]}),'UNDERSTANDING_JSON_INVALID'],
 ['truth verdict',r=>{const e=wireCompletion(r,f);e.state='ESTABLISHED';return {choices:[{finish_reason:'stop',message:{content:JSON.stringify(e)}}]};},'WIRE_FIELDS_INVALID'],
 ['timeout',()=>new Promise(()=>{}),'UNDERSTANDING_TIMEOUT']
])test('live understanding '+name+' is scoped and safely classified',async()=>{
 const run=await runMock(reply,{timeoutMs:10});assert.equal(run.result.truth.established,false);assert.equal(run.result.usage.modelCalls,2);assert.ok(run.result.trace.some(t=>t.code===code));assert.equal(JSON.stringify(run.result).includes('PRIVATE_REFUSAL'),false);
});
test('live preflight remains fail-closed and never dispatches',async()=>{
 let calls=0;const client={chat:{completions:{create:()=>{calls++;}}}};
 const deps=await prepareLive(input(),{env:{...env,DECODO_USERNAME:'offline-user',DECODO_PASSWORD:'offline-password'},client});
 assert.equal(calls,0);assert.equal(deps.interpret.semanticAdapter.role,'EVIDENCE_UNDERSTANDING');
 await assert.rejects(configuredInterpreter(input(),()=>[],{}),/ADAPTER_REQUIRED/);
 await assert.rejects(configuredInterpreter(input(),undefined,env),/CREDENTIAL_REQUIRED/);
});
test('real SDK exercised through offline fetch: strict evidence mode and no retry',async()=>{
 let calls=0;const i=input();
 const interpret=await createLiveSemanticInterpreter({env:{...env,GROQ_API_KEY:'offline-not-a-secret'},fetchImpl:async(url,options)=>{
  calls++;assert.equal(String(url),'https://api.groq.com/openai/v1/chat/completions');assert.equal(options.redirect,'error');
  const p=JSON.parse(options.body),r=JSON.parse(p.messages[1].content);assert.equal(p.response_format.json_schema.name,'v3_semantic_unit_v3');
  return new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify(wireCompletion(r,f))}}]}),{headers:{'content-type':'application/json'}});
 }});
 const {result}=await runTarget({input:i,interpret,capabilities:offlineCapabilities(i)});assert.equal(result.truth.established,true);assert.equal(calls,1);assert.equal(interpret.semanticAdapter.maxRetries,0);
});
test('SDK model/schema error preserves only safe status/code, with no SDK retry',async()=>{
 let calls=0;const i=input();i.bounds={modelCalls:1};
 const interpret=await createLiveSemanticInterpreter({env:{...env,GROQ_API_KEY:'offline-not-a-secret'},fetchImpl:async()=>{calls++;return new Response(JSON.stringify({error:{message:'PRIVATE_API_MESSAGE',code:'json_validate_failed'}}),{status:400,headers:{'content-type':'application/json'}});}});
 const {result}=await runTarget({input:i,interpret,capabilities:offlineCapabilities(i)});
 assert.equal(calls,1);assert.equal(result.usage.modelCalls,1);assert.equal(result.truth.established,false);
 assert.ok(result.trace.some(t=>t.code==='UNDERSTANDING_API_ERROR'&&t.status===400&&t.apiCode==='json_validate_failed'));assert.equal(JSON.stringify(result).includes('PRIVATE_API_MESSAGE'),false);
});
test('checkpoint cannot silently resume through a different live semantic role/model',async()=>{
 const run=await runMock();const interpret=await createLiveSemanticInterpreter({env:{SAVLIVO_V3_SEMANTIC_MODEL:'changed-model'},client:{chat:{completions:{create:()=>assert.fail('no call')}}}});
 await assert.rejects(runTarget({input:run.input,interpret,capabilities:offlineCapabilities(run.input),snapshot:checkpoint(run.knowledge)}),/RESUME_SEMANTIC_ADAPTER_MISMATCH/);
});
