import test from 'node:test';
import assert from 'node:assert/strict';
import {createLiveSemanticInterpreter,liveSemanticContract} from './live-semantic.mjs';
import {runTarget,configuredInterpreter,prepareLive,offlineCapabilities} from './runner.mjs';
import {checkpoint,restore,digest,context} from './model.mjs';
import {evaluate} from './truth.mjs';
import {semanticSchema} from './semantic.mjs';
import {semanticMaterial} from './source.mjs';

const url='https://provider.example/plans';
const text='読書室：日本居住者の個人向け定期購読。通常月額1,400 JPY、解約まで毎月自動更新。';
const body='<html><body><p>'+text+'</p></body></html>';
const modelEnv={SAVLIVO_V3_SEMANTIC_MODEL:'offline-contract-model'};
function input({geo=false,perspective='UNBOUND',bounds={}}={}) {
    const objective={kind:'PRICE',serviceId:'unseen-service',serviceName:'読書室',providerHosts:['provider.example'],markets:['JP'],seeds:[url]};
    return {objective,provider:{reviewed:true,serviceId:objective.serviceId,hosts:objective.providerHosts},permissions:{DIRECT:true,DECODO:geo,TAVILY:false},semantic:{mode:'LIVE'},planning:{initialPerspective:perspective},bounds,fixtures:[{url:'https://provider.example/robots.txt',transport:'DIRECT',contentType:'text/plain',body:'User-agent: *\nAllow: /'},{url,transport:'DIRECT',body},...(geo?[{url:'https://provider.example/robots.txt',transport:'DECODO',country:'JP',contentType:'text/plain',body:'User-agent: *\nAllow: /'},{url,transport:'DECODO',country:'JP',body}]:[])]};
}
function envelope(r,{market='JP',role='ORDINARY',cadence='MONTHLY',status='EXPLICIT'}={}) {
    const segment=r.material.segments[0];
    const presentation=r.material.presentations.filter(p=>p.start<=segment.start&&p.end>=segment.end).sort((a,b)=>(a.end-a.start)-(b.end-b.start))[0];
    const support=[{start:segment.start,end:segment.end,quote:segment.text}];
    const claims=[{scope:'SERVICE',presentation:null,field:'serviceId',value:'unseen-service',status:'EXPLICIT',support}];
    for(const [field,value] of Object.entries({amount:1400,currency:'JPY',cadence,consumer:true,relationship:'SUBSCRIPTION',role,amountDerivation:'EXPLICIT',market}))claims.push({scope:'OFFER',presentation:presentation.id,field,value,status:field==='cadence'?status:'EXPLICIT',support});
    return {schema:semanticSchema,observationId:r.observation.id,observationSha256:r.observation.sha256,language:'Japanese',claims};
}
async function adapter(complete,options={}) {
    const calls=[];
    const client={chat:{completions:{create:async(params,{signal})=>{
        const request=JSON.parse(params.messages[1].content);calls.push({params,signal,request});
        const e=await complete(request,signal);
        return {choices:[{finish_reason:'stop',message:{content:typeof e==='string'?e:JSON.stringify(e)}}]};
    }}}};
    return {interpret:await createLiveSemanticInterpreter({env:modelEnv,client,...options}),calls};
}
async function execute(complete=r=>envelope(r),{config={},adapterOptions={},save}={}) {
    const i=input(config),a=await adapter(complete,adapterOptions);
    return {...await runTarget({input:i,capabilities:offlineCapabilities(i),interpret:a.interpret,save}),...a,input:i};
}
function unestablished(result){assert.equal(result.truth.established,false);assert.notEqual(result.stop.reason,'OBJECTIVE_ESTABLISHED');}

test('live adapter strict Groq contract: multilingual candidates, source support and trace',async()=>{
    const {result,knowledge,calls}=await execute();
    assert.equal(result.truth.established,true);assert.equal(result.usage.modelCalls,1);
    const params=calls[0].params;
    assert.equal(params.response_format.type,'json_schema');assert.equal(params.response_format.json_schema.strict,true);assert.equal(params.max_completion_tokens,8192);
    assert.equal(knowledge.semanticAdapter.provider,'groq');assert.equal(knowledge.semanticAdapter.mode,'LIVE');
    assert.ok(result.trace.some(t=>t.event==='SEMANTIC_CALL_RESERVED'));
    assert.ok(result.trace.some(t=>t.candidateClaims?.length&&t.sourceSupport));
    assert.ok(result.trace.some(t=>t.evaluations&&t.changes.some(c=>c.to.state==='ESTABLISHED')));
});
test('candidate interpretation has no truth authority; deterministic evaluation rejects trial pricing',async()=>{
    const {result,knowledge}=await execute(r=>envelope(r,{role:'TRIAL'}));
    assert.ok(knowledge.observations[0].candidates.length);unestablished(result);
    assert.equal(result.truth.prices.JP.propositions.PRICE_AMOUNT.state,'UNRESOLVED');
});
for(const [label,mutate] of [
    ['fabricated quotation',e=>{e.claims[0].support[0].quote='invented';}],
    ['altered quotation',e=>{e.claims[0].support[0].quote+='!';}],
    ['fabricated span',e=>{e.claims[0].support[0].start++;}],
    ['wrong hash',e=>{e.observationSha256='0'.repeat(64);}],
    ['wrong observation reference',e=>{e.observationId='forged';}],
    ['unsupported certainty',e=>{e.claims[0].status='ESTABLISHED';}],
    ['malformed claim',e=>{e.claims[0].value={truth:true};}],
    ['extra reasoning metadata',e=>{e.reasoning='must not persist';}]
])test(label+' fails safely and leaves truth unresolved',async()=>{
    const {result,knowledge}=await execute(r=>{const e=envelope(r);mutate(e);return e;});
    unestablished(result);assert.equal(result.usage.modelCalls,1);assert.equal(result.truth.service.SERVICE_IDENTITY.state,'UNRESOLVED');
    assert.equal(knowledge.observations[0].candidates.length,0);assert.ok(!JSON.stringify(result).includes('must not persist'));
});
test('explicit ambiguity cannot become monthly certainty',async()=>{
    const {result}=await execute(r=>envelope(r,{status:'AMBIGUOUS'}));unestablished(result);
    assert.equal(result.truth.prices.JP.propositions.MONTHLY_CADENCE.state,'UNRESOLVED');
});
test('malformed JSON fails safely',async()=>{const {result}=await execute(()=>'{bad');unestablished(result);assert.equal(result.stop.code,'SEMANTIC_INTERPRETATION_FAILED');});
test('model failure is spent, unresolved and secret-safe',async()=>{
    const {result}=await execute(()=>{throw Error('private credential sentinel');});unestablished(result);
    assert.equal(result.usage.modelCalls,1);assert.ok(!JSON.stringify(result).includes('private credential sentinel'));
});
test('timeout aborts model, remains unresolved and preserves spent call',async()=>{
    let signal;
    const {result}=await execute((r,s)=>{signal=s;return new Promise(()=>{});},{adapterOptions:{timeoutMs:5}});
    unestablished(result);assert.equal(result.stop.code,'SEMANTIC_INTERPRETER_TIMEOUT');assert.equal(signal.aborted,true);assert.equal(result.usage.modelCalls,1);
});
test('Japanese language metadata alone cannot establish target market',async()=>{
    const {result}=await execute(r=>envelope(r,{market:null}));unestablished(result);
    assert.equal(result.truth.prices.JP.propositions.TARGET_MARKET.state,'UNRESOLVED');
});
test('Tavily snippet is never supplied to model or admitted as provider truth',async()=>{
    const i=input();i.objective.seeds=[];i.permissions.TAVILY=true;i.discoveries=[{url,content:'FABRICATED_SNIPPET_PRICE'}];
    const a=await adapter(r=>{assert.ok(!JSON.stringify(r).includes('FABRICATED_SNIPPET_PRICE'));return {...envelope(r),claims:[]};});
    const {result}=await runTarget({input:i,capabilities:offlineCapabilities(i),interpret:a.interpret});
    unestablished(result);assert.equal(a.calls.length,1);assert.equal(result.truth.service.SERVICE_IDENTITY.state,'UNRESOLVED');
});
test('requested live semantic mode cannot silently fall back; preflight performs no IO',async()=>{
    const i=input({geo:true});i.permissions.TAVILY=true;
    await assert.rejects(configuredInterpreter(i,()=>[],{}),/V3_LIVE_SEMANTIC_ADAPTER_REQUIRED/);
    await assert.rejects(configuredInterpreter(i,undefined,{}),/V3_LIVE_SEMANTIC_CONFIGURATION_REQUIRED/);
    await assert.rejects(configuredInterpreter(i,undefined,modelEnv),/V3_LIVE_SEMANTIC_CREDENTIAL_REQUIRED/);
    await assert.rejects(prepareLive(i,{env:modelEnv}),/V3_TAVILY_CONFIGURATION_REQUIRED/);
    const a=await adapter(r=>envelope(r));
    const deps=await prepareLive(i,{env:{...modelEnv,TAVILY_API_KEY:'offline',DECODO_USERNAME:'offline',DECODO_PASSWORD:'offline'},client:{chat:{completions:{create(){throw Error('preflight dispatched');}}}}});
    assert.deepEqual(Object.keys(deps.capabilities).sort(),['DECODO','DIRECT','TAVILY']);assert.equal(a.calls.length,0);assert.equal(deps.interpret.semanticAdapter.mode,'LIVE');
});
test('model count bound zero dispatches neither provider nor model; bound one prevents second model call',async()=>{
    const zero=await execute(r=>envelope(r),{config:{bounds:{modelCalls:0}}});
    assert.equal(zero.result.stop.reason,'CAPACITY_BOUND_REACHED');assert.equal(zero.result.usage.acquisitions,0);assert.equal(zero.calls.length,0);
    const one=await execute(r=>envelope(r,{market:null}),{config:{geo:true,bounds:{modelCalls:1}}});
    assert.equal(one.calls.length,1);assert.equal(one.result.usage.modelCalls,1);assert.equal(one.result.stop.reason,'CAPACITY_BOUND_REACHED');assert.deepEqual(one.result.stop.bounds,['modelCalls']);
});
test('resume preserves committed source bindings and call accounting; Direct success permits same-URL Decodo',async()=>{
    const saves=[];
    const first=await execute(r=>envelope(r,{market:r.observation.context.transport==='DIRECT'?null:'JP'}),{config:{geo:true,bounds:{modelCalls:2}},save:s=>saves.push(s)});
    const committed=saves.find(s=>s.payload.usage.modelCalls===1&&!s.payload.pending&&!s.payload.stop);
    assert.ok(committed);const restored=restore(committed);
    assert.deepEqual(restored.observations[0].semantic,first.knowledge.observations[0].semantic);
    const a=await adapter(r=>envelope(r));
    const resumed=await runTarget({input:first.input,capabilities:offlineCapabilities(first.input),interpret:a.interpret,snapshot:committed});
    assert.equal(resumed.result.usage.modelCalls,2);assert.equal(a.calls.length,1);assert.equal(resumed.result.truth.established,true);
    assert.deepEqual(resumed.knowledge.observations.map(o=>o.context),[context('DIRECT'),context('DECODO','JP')]);
    assert.notEqual(resumed.knowledge.observations[0].id,resumed.knowledge.observations[1].id);
    assert.deepEqual(resumed.knowledge.observations[0].semantic,restored.observations[0].semantic);
});
test('in-flight semantic reservation survives checkpoint; uncertain call never replays',async()=>{
    const saves=[];const first=await execute(()=>{throw Error('offline model failure');},{save:s=>saves.push(s)});
    const pending=saves.find(s=>s.payload.pending&&s.payload.usage.modelCalls===1);
    assert.ok(pending);const a=await adapter(r=>envelope(r));
    const resumed=await runTarget({input:first.input,capabilities:offlineCapabilities(first.input),interpret:a.interpret,snapshot:pending});
    assert.equal(resumed.result.stop.reason,'RECOVERY_REQUIRED');assert.equal(resumed.result.usage.modelCalls,1);assert.equal(a.calls.length,0);
});
test('Decodo-first remains possible with Direct permitted',async()=>{
    const {knowledge,result}=await execute(r=>envelope(r),{config:{geo:true,perspective:'COUNTRY'}});
    assert.equal(result.truth.established,true);assert.equal(knowledge.observations.length,1);assert.equal(knowledge.observations[0].context.transport,'DECODO');
});
test('clipped source qualifiers are rejected at adapter boundary',async()=>{
    const {result}=await execute(r=>{const e=envelope(r);for(const c of e.claims){c.support[0].quote=c.support[0].quote.slice(0,3);c.support[0].end=c.support[0].start+3;}return e;});
    unestablished(result);assert.equal(result.truth.service.SERVICE_IDENTITY.state,'UNRESOLVED');
});
test('accepted source binding is revalidated by deterministic evaluator after restore',async()=>{
    const {knowledge}=await execute();const k=restore(checkpoint(knowledge));
    k.observations[0].semantic.observationSha256='0'.repeat(64);
    assert.equal(evaluate(k).established,false);
});
test('strict contract is source-specific and never asks for hidden reasoning',()=>{
    const o={body,contentType:'text/html',id:'source',sha256:digest(body)};
    const schema=liveSemanticContract({observation:o});
    assert.equal(schema.additionalProperties,false);assert.deepEqual(schema.properties.observationId.enum,['source']);assert.ok(!JSON.stringify(schema).includes('reasoning'));
    assert.ok(semanticMaterial(o).segments.length);
});

test('actual existing Groq SDK uses bounded fetch, fixed endpoint, no retries; no network',async()=>{
    let requests=0;
    const interpret=await createLiveSemanticInterpreter({env:{...modelEnv,GROQ_API_KEY:'offline-sdk-key'},fetchImpl:async(endpoint,options)=>{
        requests++;assert.equal(String(endpoint),'https://api.groq.com/openai/v1/chat/completions');assert.equal(options.redirect,'error');
        const params=JSON.parse(options.body),r=JSON.parse(params.messages[1].content);
        return new Response(JSON.stringify({id:'offline',object:'chat.completion',created:0,model:modelEnv.SAVLIVO_V3_SEMANTIC_MODEL,choices:[{index:0,finish_reason:'stop',message:{role:'assistant',content:JSON.stringify(envelope(r))}}]}),{headers:{'content-type':'application/json'}});
    }});
    const i=input();const {result}=await runTarget({input:i,capabilities:offlineCapabilities(i),interpret});
    assert.equal(result.truth.established,true);assert.equal(requests,1);assert.equal(result.usage.modelCalls,1);assert.equal(interpret.semanticAdapter.maxRetries,0);
});
test('actual SDK HTTP failure is not retried and cannot establish truth',async()=>{
    let requests=0;
    const interpret=await createLiveSemanticInterpreter({env:{...modelEnv,GROQ_API_KEY:'offline-sdk-key'},fetchImpl:async()=>{requests++;return new Response('{"error":{"message":"offline failure"}}',{status:503});}});
    const i=input();const {result}=await runTarget({input:i,capabilities:offlineCapabilities(i),interpret});unestablished(result);assert.equal(requests,1);assert.equal(result.usage.modelCalls,1);
});
test('model HTTP response byte cap fails safely before parsing',async()=>{
    const interpret=await createLiveSemanticInterpreter({env:{...modelEnv,GROQ_API_KEY:'offline-sdk-key'},fetchImpl:async()=>new Response('x'.repeat(131073))});
    const i=input();const {result}=await runTarget({input:i,capabilities:offlineCapabilities(i),interpret});unestablished(result);assert.equal(result.usage.modelCalls,1);
});
test('a forged LIVE marker cannot substitute a legacy interpreter',async()=>{
    const fake=()=>[];fake.semanticAdapter={mode:'LIVE'};
    await assert.rejects(configuredInterpreter(input(),fake,{}),/V3_LIVE_SEMANTIC_ADAPTER_REQUIRED/);
});
test('truncated model completion fails instead of interpreting partial claims',async()=>{
    const client={chat:{completions:{create:async()=>({choices:[{finish_reason:'length',message:{content:'{}'}}]})}}};
    const interpret=await createLiveSemanticInterpreter({env:modelEnv,client});const i=input();
    const {result}=await runTarget({input:i,capabilities:offlineCapabilities(i),interpret});unestablished(result);
});
test('live resume rejects legacy/unaccounted checkpoints and changed models',async()=>{
    const first=await execute();const k=structuredClone(first.knowledge);
    delete k.semanticAdapter;delete k.usage.modelCalls;
    await assert.rejects(runTarget({input:first.input,interpret:first.interpret,snapshot:checkpoint(k)}),/RESUME_SEMANTIC_ADAPTER_MISMATCH/);
    const changed=await adapter(r=>envelope(r),{env:{SAVLIVO_V3_SEMANTIC_MODEL:'different-offline-model'}});
    await assert.rejects(runTarget({input:first.input,interpret:changed.interpret,snapshot:checkpoint(first.knowledge)}),/RESUME_SEMANTIC_ADAPTER_MISMATCH/);
});
test('SDK preparation validates credentials without performing HTTP requests',async()=>{
    let calls=0;const i=input({geo:true});i.permissions.TAVILY=true;
    const deps=await prepareLive(i,{env:{...modelEnv,GROQ_API_KEY:'offline-sdk-key',TAVILY_API_KEY:'offline',DECODO_USERNAME:'offline',DECODO_PASSWORD:'offline'},fetchImpl:async()=>{calls++;throw Error('must not dispatch');}});
    assert.equal(calls,0);assert.equal(deps.interpret.semanticAdapter.provider,'groq');
});
test('a later model failure preserves previously established source-bound facts',async()=>{
    const {result}=await execute(r=>{if(r.observation.context.transport==='DECODO')throw Error('offline second-call failure');return envelope(r,{market:null});},{config:{geo:true}});
    unestablished(result);assert.equal(result.usage.modelCalls,2);
    assert.equal(result.truth.service.SERVICE_IDENTITY.state,'ESTABLISHED');
    assert.equal(result.truth.prices.JP.propositions.PRICE_AMOUNT.state,'ESTABLISHED');
    assert.equal(result.truth.prices.JP.propositions.PRICE_AMOUNT.value,1400);
    assert.equal(result.truth.prices.JP.propositions.TARGET_MARKET.state,'UNRESOLVED');
});
