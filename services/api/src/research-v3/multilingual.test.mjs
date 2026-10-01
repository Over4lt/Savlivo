import test from 'node:test';
import assert from 'node:assert/strict';
import {createTranslationInterpreter,projectTranslation,translationRequest,validateTranslation} from './translation.mjs';
import {runTarget,offlineCapabilities} from './runner.mjs';
import {checkpoint,restore} from './model.mjs';
import {evaluate} from './truth.mjs';
import {fixtures,config,completion} from './translation-fixtures.mjs';
async function execute(f,options={},complete) {
 const input=config(f,options),calls=[];
 const interpret=createTranslationInterpreter({complete:async r=>{calls.push(r);return complete?complete(r):completion(r,f);}});
 return {...await runTarget({input,capabilities:offlineCapabilities(input),interpret}),calls,input,interpret};
}
for(const f of fixtures)test(f.language+': faithful text -> same limited deterministic parser -> truth',async()=>{
 const {result,knowledge,calls}=await execute(f);
 assert.equal(result.truth.established,true);
 assert.equal(calls.length,f.language==='English'?0:1);
 assert.equal(result.truth.prices[f.market].propositions.PRICE_AMOUNT.state,'ESTABLISHED');
 if(calls.length){assert.equal('objective' in calls[0],false);assert.ok(knowledge.observations[0].translation);assert.equal(knowledge.observations[0].body,config(f).fixtures[1].body);}
});
for(const [name,mutate] of [
 ['observation',e=>e.observationId='forged'],['hash',e=>e.observationSha256='forged'],
 ['span',e=>e.segments[0].start++],['original',e=>e.segments[0].original+='changed'],
 ['proposition field',e=>e.amount=100],['numbers',e=>e.segments.at(-1).text=e.segments.at(-1).text.replace('1,400','1,500')],
 ['uncertainty',e=>e.segments.at(-1).status='UNCERTAIN']
])test('translation rejects '+name,async()=>{
 const f=fixtures[5];const {result,knowledge}=await execute(f,{},r=>{const e=completion(r,f);mutate(e);return e;});
 assert.equal(result.truth.established,false);assert.equal(knowledge.observations[0].translation,undefined);
 assert.ok(result.trace.some(t=>t.event==='TRANSLATION_UNAVAILABLE'));
});
test('checkpoint/resume revalidates translations, original spans and accounting',async()=>{
 const run=await execute(fixtures[5]);const snapshot=checkpoint(run.knowledge),k=restore(snapshot);
 assert.equal(evaluate(k).established,true);assert.equal(k.usage.modelCalls,1);
 const resumed=await runTarget({input:run.input,interpret:run.interpret,snapshot,capabilities:offlineCapabilities(run.input)});
 assert.equal(resumed.result.usage.modelCalls,1);
 k.observations[0].translation.envelope.segments.at(-1).text='forged';assert.equal(evaluate(k).established,false);
});
test('model budget zero still establishes already interpretable evidence',async()=>{
 const {result,calls}=await execute(fixtures[0],{bounds:{modelCalls:0}});assert.equal(result.truth.established,true);assert.equal(calls.length,0);
});
test('exhausted translation budget retains native evidence and remains bounded',async()=>{
 const {result,knowledge,calls}=await execute(fixtures[5],{bounds:{modelCalls:0}});
 assert.equal(calls.length,0);assert.equal(result.usage.modelCalls,0);assert.equal(result.truth.service.SERVICE_IDENTITY.state,'ESTABLISHED');assert.ok(knowledge.limitsHit.includes('modelCalls'));
});
test('translation failure is scoped: country action remains possible and native identity survives',async()=>{
 const {result,knowledge}=await execute(fixtures[5],{geo:true},()=>{throw Object.assign(Error('DO_NOT_PERSIST_PRIVATE_ERROR'),{status:429});});
 assert.equal(result.usage.acquisitions,2);assert.equal(result.usage.modelCalls,2);assert.equal(result.truth.service.SERVICE_IDENTITY.state,'ESTABLISHED');
 assert.equal(JSON.stringify(knowledge).includes('DO_NOT_PERSIST_PRIVATE_ERROR'),false);
 assert.ok(result.trace.some(t=>t.code==='TRANSLATION_API_ERROR'&&t.status===429));
 assert.equal(new Set(knowledge.observations.map(o=>o.id)).size,2);
 assert.deepEqual(knowledge.observations.map(o=>o.context.transport),['DIRECT','DECODO']);
});
for(const text of [
 'Harbor personal subscription: introductory USD 0 for first month, then USD 14.99 per month for customers in US.',
 'Harbor personal subscription USD 120 per year, equivalent USD 10 per month for customers in US.',
 'Harbor personal subscription gives a benefit worth USD 14.99 per month for customers in US.',
 'Harbor personal subscription USD 120 in installments of USD 10 per month for customers in US.',
 'Harbor personal subscription may cost USD 14.99; a separate donation is USD 3 per month for customers in US.',
 'Harbor is not a personal subscription: USD 14.99 per month for customers in US.'
])test('limited extraction remains unresolved rather than inventing relationships: '+text,async()=>{
 const f={...fixtures[0],original:text,translated:text};const {result}=await execute(f);assert.equal(result.truth.established,false);
});
test('language does not establish market; verified country contributes context without inventing prose',async()=>{
 const f={...fixtures[5],original:'読書室：個人向け定期購読、JPY 1,400、毎月。',translated:'読書室: personal subscription, JPY 1,400 per month.'};
 const direct=await execute(f);assert.equal(direct.result.truth.prices.JP.propositions.TARGET_MARKET.state,'UNRESOLVED');
 const {result,knowledge}=await execute(f,{geo:true});assert.equal(result.truth.prices.JP.propositions.TARGET_MARKET.value,'JP');
 assert.equal(knowledge.observations[1].context.networkGeography,'JP');
 assert.equal(knowledge.observations[1].translation.envelope.segments.some(s=>/in JP/.test(s.text)),false);
});
test('original evidence hash is authoritative even when derived artifact remains valid',async()=>{
 const run=await execute(fixtures[5]),o=run.knowledge.observations[0];o.body+='changed';assert.equal(evaluate(run.knowledge).established,false);
});
test('translation failure on a later observation does not erase native price evidence',async()=>{
 const f={...fixtures[0],original:'Harbor personal subscription costs USD 14.99 per month.',translated:'Harbor personal subscription costs USD 14.99 per month.'};
 const input=config(f,{geo:true});input.fixtures.at(-1).body='<html lang="und"><title>Harbor</title><p>翻訳できない資料</p></html>';
 const interpret=createTranslationInterpreter({complete:async()=>{throw Error('unavailable');}});
 const {result}=await runTarget({input,capabilities:offlineCapabilities(input),interpret});
 assert.equal(result.usage.acquisitions,2);assert.equal(result.usage.modelCalls,1);assert.equal(result.truth.prices.US.propositions.PRICE_AMOUNT.value,14.99);assert.equal(result.truth.prices.US.propositions.PRICE_AMOUNT.state,'ESTABLISHED');
});
test('retained Spotify presentation structure remains honestly unsupported, not injected',async()=>{
 const f={language:'Japanese',name:'Spotify Premium',market:'JP',original:'1ヶ月間￥0、その後は月額￥1,080。 キャンペーン期間終了後は月額￥1,080',translated:'For 1 month ¥0, then ¥1,080 per month. After the campaign period ends, ¥1,080 per month.'};
 const {result}=await execute(f,{geo:true});assert.equal(result.truth.established,false);
 assert.equal(result.truth.prices.JP.propositions.PRICE_AMOUNT.state,'UNRESOLVED');
});
test('faithful negation and introductory qualifiers are retained as text, not replaced with classifications',async()=>{
 const f={...fixtures[5],original:'読書室は定期購読ではありません。最初の1ヶ月はJPY 0、その後JPY 1,400。',translated:'読書室 is not a subscription. The first 1 month is JPY 0, then JPY 1,400.'};
 const {knowledge,result}=await execute(f);assert.equal(result.truth.established,false);
 const text=knowledge.observations[0].translation.envelope.segments.at(-1).text;
 assert.match(text,/not a subscription/);assert.match(text,/first 1 month/);assert.match(text,/then JPY 1,400/);
});
