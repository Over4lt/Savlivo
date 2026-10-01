import test from 'node:test';
import assert from 'node:assert/strict';
import {createLiveTranslationInterpreter as createLiveSemanticInterpreter,liveTranslationContract as liveSemanticContract} from './live-semantic.mjs';
import {runTarget,configuredInterpreter,prepareLive,offlineCapabilities} from './runner.mjs';
import {fixtures,config,completion} from './translation-fixtures.mjs';
const env={SAVLIVO_V3_SEMANTIC_MODEL:'offline-model'};
async function execute(reply,options={}) {
 const f=fixtures[5],input={...config(f),semantic:{mode:'LIVE'}},calls=[];
 const client={chat:{completions:{create:async(p,{signal})=>{const r=JSON.parse(p.messages[1].content);calls.push({p,r,signal});return reply?reply(r,signal):{choices:[{finish_reason:'stop',message:{content:JSON.stringify(completion(r,f))}}]};}}}};
 const interpret=await createLiveSemanticInterpreter({env,client,...options});
 return {...await runTarget({input,interpret,capabilities:offlineCapabilities(input)}),calls};
}
test('Groq strict schema returns only text mappings, no proposition fields',async()=>{
 const run=await execute();assert.equal(run.result.truth.established,true);
 const {p,r}=run.calls[0];assert.equal(p.response_format.type,'json_schema');assert.equal(p.response_format.json_schema.strict,true);
 assert.deepEqual(Object.keys(liveSemanticContract(r).properties).sort(),['language','observationId','observationSha256','schema','segments']);
 assert.equal('objective' in r,false);assert.equal(run.knowledge.semanticAdapter.role,'TRANSLATION_ONLY');assert.equal(run.result.usage.modelCalls,1);
});
for(const [name,reply,code] of [
 ['JSON parsing',()=>({choices:[{finish_reason:'stop',message:{content:'{bad'}}]}),'TRANSLATION_JSON_INVALID'],
 ['refusal',()=>({choices:[{finish_reason:'stop',message:{refusal:'private'}}]}),'TRANSLATION_REFUSAL'],
 ['truncation',()=>({choices:[{finish_reason:'length',message:{content:'{}'}}]}),'TRANSLATION_RESPONSE_INCOMPLETE'],
 ['API failure',()=>{throw Object.assign(Error('SECRET_DIAGNOSTIC'),{status:400});},'TRANSLATION_API_ERROR'],
 ['timeout',()=>new Promise(()=>{}),'TRANSLATION_TIMEOUT']
])test('scoped '+name,async()=>{
 const run=await execute(reply,{timeoutMs:10});assert.equal(run.result.truth.established,false);assert.equal(run.result.usage.modelCalls,1);
 assert.ok(run.result.trace.some(t=>t.code===code));assert.equal(JSON.stringify(run.result).includes('SECRET_DIAGNOSTIC'),false);
});
test('live preflight fails closed, cannot substitute static or forged adapters',async()=>{
 const input={...config(fixtures[5]),semantic:{mode:'LIVE'}};
 await assert.rejects(configuredInterpreter(input,()=>[],{}),/ADAPTER_REQUIRED/);
 await assert.rejects(configuredInterpreter(input,undefined,{}),/CONFIGURATION_REQUIRED/);
 await assert.rejects(configuredInterpreter(input,undefined,env),/CREDENTIAL_REQUIRED/);
 let calls=0;const client={chat:{completions:{create:()=>{calls++;}}}};
 const deps=await prepareLive(input,{env,client});assert.equal(calls,0);assert.equal(deps.interpret.semanticAdapter.role,'EVIDENCE_UNDERSTANDING');
});
test('real SDK is exercised offline with retries disabled and fixed endpoint',async()=>{
 const f=fixtures[5],input={...config(f),semantic:{mode:'LIVE'}};let calls=0;
 const interpret=await createLiveSemanticInterpreter({env:{...env,GROQ_API_KEY:'offline-not-a-secret'},fetchImpl:async(url,options)=>{
 assert.equal(String(url),'https://api.groq.com/openai/v1/chat/completions');assert.equal(options.redirect,'error');calls++;
 const p=JSON.parse(options.body),r=JSON.parse(p.messages[1].content);
 return new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify(completion(r,f))}}]}),{headers:{'content-type':'application/json'}});
 }});
 const {result}=await runTarget({input,interpret,capabilities:offlineCapabilities(input)});assert.equal(result.truth.established,true);assert.equal(calls,1);assert.equal(interpret.semanticAdapter.maxRetries,0);
});
test('offline SDK HTTP error stays typed and is not automatically retried',async()=>{
 const input={...config(fixtures[5]),semantic:{mode:'LIVE'}};let calls=0;
 const interpret=await createLiveSemanticInterpreter({env:{...env,GROQ_API_KEY:'offline-not-a-secret'},fetchImpl:async()=>{calls++;return new Response(JSON.stringify({error:{message:'PRIVATE_API_DETAIL',type:'invalid_request_error'}}),{status:400,headers:{'content-type':'application/json'}});}});
 const {result}=await runTarget({input,interpret,capabilities:offlineCapabilities(input)});
 assert.equal(calls,1);assert.ok(result.trace.some(t=>t.code==='TRANSLATION_API_ERROR'&&t.status===400));assert.equal(JSON.stringify(result).includes('PRIVATE_API_DETAIL'),false);
});
test('offline SDK response byte limit fails safely',async()=>{
 const input={...config(fixtures[5]),semantic:{mode:'LIVE'}};
 const interpret=await createLiveSemanticInterpreter({env:{...env,GROQ_API_KEY:'offline-not-a-secret'},fetchImpl:async()=>new Response('x'.repeat(131073))});
 const {result}=await runTarget({input,interpret,capabilities:offlineCapabilities(input)});assert.equal(result.truth.established,false);assert.equal(result.usage.modelCalls,1);
});
