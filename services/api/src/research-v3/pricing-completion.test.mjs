import test from 'node:test';
import assert from 'node:assert/strict';
import {createLiveSemanticInterpreter} from './legacy-live-semantic.test-support.mjs';
import {runTarget,offlineCapabilities} from './runner.mjs';
import {checkpoint,restore} from './model.mjs';
import {evaluate} from './truth.mjs';
import {fixtureInput,evidenceFixtures,wireCompletion} from './evidence-fixtures.test-support.mjs';
const oracle=evidenceFixtures.find(f=>f.key==='retained-oracle');
async function execute(f=oracle,change=()=>{},country=true) {
 const source={...f,html:'<main>'+f.html+'</main>'},input={...fixtureInput(source,{country,bounds:{actions:2,modelCalls:4}}),planning:{initialPerspective:'AUTO'},semantic:{mode:'LIVE'}},calls=[];
 const interpret=await createLiveSemanticInterpreter({env:{GROQ_API_KEY:'offline-key',SAVLIVO_V3_SEMANTIC_MODEL:'offline-model'},fetchImpl:async(url,options)=>{
  const payload=JSON.parse(options.body),r=JSON.parse(payload.messages[1].content),w=wireCompletion(r,source);
  for(const o of w.offers){o.serviceRef=r.knownObservationService?.reference??null;o.association='UNKNOWN';}
  for(const c of w.charges){const support=r.segments.find(s=>c.sources.includes(s.id)&&s.text.includes(c.cadenceText??'')&&r.numbers.some(n=>n.id===c.amountRef&&n.segment===s.id));c.cadenceSources=support?[support.id]:[];c.cadenceKind=c.role==='INTRODUCTORY'?'DURATION':c.cadence==='UNKNOWN'?'UNKNOWN':'RECURRENCE';}
  try{change(w,r);}catch(e){if(e.status===429)return new Response(JSON.stringify({error:{code:'rate_limit_exceeded',type:'rate_limit_error',message:'offline'}}),{status:429,headers:{'content-type':'application/json'}});throw e;}calls.push({payload,r,w});
  return new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify(w)}}]}),{headers:{'content-type':'application/json'}});
 }});
 return {...await runTarget({input,interpret,capabilities:offlineCapabilities(input)}),calls};
}
test('faithful complete pricing path: UNKNOWN cannot veto native service; one acquisition and one SDK call suffice',async()=>{
 const run=await execute(oracle,(w,r)=>{w.serviceSources=[];for(const c of w.charges){c.currency=null;c.cadenceText=null;}w.charges[1].cadenceSources=[r.numbers.find(n=>n.id===w.charges[1].amountRef).segment];});
 assert.equal(run.result.truth.established,true);assert.notEqual(run.result.catalog.state,'CATALOG_EXHAUSTED');assert.equal(run.result.usage.acquisitions,1);assert.equal(run.result.usage.modelCalls,1);assert.equal(run.calls.length,1);
 const p=run.result.truth.prices.JP.propositions;assert.equal(p.PRICE_AMOUNT.value,1080);assert.equal(p.CURRENCY.value,'JPY');assert.equal(p.MONTHLY_CADENCE.state,'ESTABLISHED');assert.equal(p.TARGET_MARKET.value,'JP');
 const e=run.knowledge.observations[0].evidence.envelope;assert.equal(e.offers[0].charges[0].role,'INTRODUCTORY');assert.equal(e.offers[0].charges[0].money.amount,0);assert.equal(e.offers[0].transitions[0].kind,'RECURS_AFTER_INTRO');assert.ok(e.offers[0].charges[1].support.every(s=>run.knowledge.observations[0].body.slice(s.start,s.end)===s.quote));assert.equal(evaluate(restore(checkpoint(run.knowledge))).established,true);
});
for(const f of evidenceFixtures)test('v4 granular source recurrence / UNKNOWN service '+f.key+' '+f.language,async()=>{
 const r=await execute(f);assert.equal(r.result.truth.established,f.expected!==undefined);
});
test('bad legacy cadence copy does not discard amount/currency; recurrence sources own the expression',async()=>{
 const r=await execute(oracle,(w,r)=>{w.charges[1].cadenceText='1ヶ月間';w.charges[1].cadenceSources=[r.numbers.find(n=>n.id===w.charges[1].amountRef).segment];});assert.equal(r.result.truth.established,true);
});
test('introductory display support cannot veto separately sourced ordinary monthly payment',async()=>{
 const separate={...oracle,html:oracle.html.replace('1ヶ月間￥0、その後は月額￥1,080。','1ヶ月間￥0').replace('キャンペーン期間終了後は月額￥1,080','その後は月額￥1,080')};
 const r=await execute(separate,(w,r)=>{w.relations=[];w.charges[1].sources=w.charges[1].sources.filter(id=>id!==r.numbers.find(n=>n.id===w.charges[0].amountRef).segment);w.charges[1].cadenceSources=[r.numbers.find(n=>n.id===w.charges[0].amountRef).segment];w.charges[1].cadenceText=null;});assert.equal(r.result.truth.established,true);assert.equal(r.result.truth.prices.JP.propositions.MONTHLY_CADENCE.state,'UNRESOLVED');assert.equal(r.result.truth.prices.JP.propositions.PRICE_AMOUNT.value,1080);const payment=r.result.truth.prices.JP.propositions.PRICE_AMOUNT.evidence[0].reference.source.payment;assert.equal(payment.kind,'ACTUAL_PAYMENT');assert.ok(payment.support.some(s=>s.quote.includes('1,080')));
});
test('duration display label does not veto independently supported monthly payment',async()=>{
 const r=await execute(oracle,w=>{w.charges[1].cadenceKind='DURATION';});assert.equal(r.result.truth.established,true);assert.equal(r.result.truth.prices.JP.propositions.MONTHLY_CADENCE.state,'UNRESOLVED');assert.equal(r.result.truth.prices.JP.propositions.PRICE_AMOUNT.evidence[0].reference.source.payment.kind,'ACTUAL_PAYMENT');
});
for(const key of ['trial-only','benefit','discount-intro','annual','annual-equivalent','installment'])test('wrong ordinary classification cannot bypass protected source semantics '+key,async()=>{
 let f=evidenceFixtures.find(f=>f.key===key);if(key==='benefit')f={...f,html:'<section><p>Personal subscription includes a benefit of BRL 29,90 in credits, not a subscription price.</p></section>',plans:f.plans.map(p=>({...p,anchor:'Personal subscription',charges:p.charges.map(c=>({...c,cadence:{unit:'MONTHLY',expression:'subscription'}}))}))};
 const r=await execute(f,w=>{w.relations=[];for(const c of w.charges)c.role='ORDINARY_RECURRING';});
 if(key==='discount-intro')assert.notEqual(r.result.truth.prices[f.market].propositions.PRICE_AMOUNT.value,5);else assert.equal(r.result.truth.established,false);
});
test('model service ambiguity cannot retract native authoritative title',async()=>{const r=await execute(oracle,w=>{w.serviceAmbiguous=true;w.serviceSources=[];});assert.equal(r.result.truth.established,true);});
test('DIRECT language/currency/path cannot establish market',async()=>{const r=await execute(oracle,()=>{},false);assert.equal(r.result.truth.prices.JP.propositions.TARGET_MARKET.state,'UNRESOLVED');});
test('trial purchase destination mislabeled LOGIN stays unresolved and does not block pricing',async()=>{
 const f={...oracle,html:oracle.html.replace('</section>','<a href="/purchase/offer/trial">1ヶ月間￥0で体験</a></section>')};
 const r=await execute(f,(w,i)=>{const d=i.destinations[0];w.accounts=[{id:'falseLogin',destination:d.id,role:'LOGIN',sources:d.segments,ambiguous:false}];});assert.equal(r.result.truth.established,true);assert.equal(r.result.truth.accountAccess.LOGIN.state,'UNRESOLVED');assert.ok(r.knowledge.observations[0].interpretation.rejected.some(x=>x.reason==='DESTINATION_ROLE_UNSUPPORTED'));
});
for(const mode of ['partial','malformed','unsupportedRole','rateLimit'])test('insufficient '+mode+' remains bounded and never manufactures contradiction',async()=>{
 const r=await execute(oracle,w=>{if(mode==='partial')w.charges=[];if(mode==='malformed')w.truthState='ESTABLISHED';if(mode==='unsupportedRole')for(const c of w.charges)c.ambiguous=true;if(mode==='rateLimit')throw Object.assign(Error('offline'),{status:429,error:{code:'rate_limit_exceeded'}});});assert.equal(r.result.truth.established,false);assert.ok(r.result.usage.modelCalls<=4);assert.ok(Object.values(r.result.truth.prices.JP.propositions).every(p=>p.state!=='CONTRADICTED'));
});
test('bad free-text display cadence is rejected without vetoing supported payment',async()=>{
 const r=await execute(oracle,w=>{w.relations=[];w.charges[1].cadenceSources=[];w.charges[1].cadenceText='not-in-source';});assert.equal(r.result.truth.established,true);assert.equal(r.result.truth.prices.JP.propositions.PRICE_AMOUNT.value,1080);assert.equal(r.result.truth.prices.JP.propositions.CURRENCY.value,'JPY');assert.equal(r.result.truth.prices.JP.propositions.MONTHLY_CADENCE.state,'UNRESOLVED');assert.equal(r.result.truth.prices.JP.propositions.PRICE_AMOUNT.evidence[0].reference.source.payment.kind,'ACTUAL_PAYMENT');assert.ok(r.knowledge.observations[0].interpretation.rejected.some(x=>x.proposition==='CADENCE'));
});
test('rate limit makes model unavailable in checkpoint and prevents immediate repeated calls',async()=>{
 const r=await execute(oracle,()=>{throw Object.assign(Error('rate limited'),{status:429,error:{code:'rate_limit_exceeded'}});});assert.equal(r.calls.length,0);assert.equal(r.result.usage.modelCalls,1);assert.equal(restore(checkpoint(r.knowledge)).semanticUnavailable.status,429);assert.equal(r.result.truth.prices.JP.propositions.PRICE_AMOUNT.state,'UNRESOLVED');
});
test('false account statements supported only by a pricing CTA do not establish login or management',async()=>{
 const r=await execute(oracle,(w,i)=>{const sources=[i.numbers.find(n=>n.id===w.charges[1].amountRef).segment];w.accountStatements=[{operation:'LOGIN',access:'ACCOUNT',polarity:'AFFIRMED',sources,ambiguous:false},{operation:'MANAGE_SUBSCRIPTION',access:'POST_LOGIN',polarity:'AFFIRMED',sources,ambiguous:false}];});assert.equal(r.result.truth.established,true);assert.equal(r.result.truth.service.ACCOUNT_LOGIN_EXISTS.state,'UNRESOLVED');assert.equal(r.result.truth.service.MEMBERSHIP_MANAGEMENT_EXISTS.state,'UNRESOLVED');
});
test('forged recurrence source cannot enter local projection',async()=>{
 const r=await execute(oracle,w=>{w.charges[1].cadenceSources=['s_invented'];});assert.equal(r.result.truth.established,false);const t=r.result.trace.find(t=>t.code==='WIRE_REFERENCE_INVALID');assert.equal(t.diagnostics.field,'charges[1].cadenceSources[0]');assert.equal(t.diagnostics.expectedNamespace,'segment');
});
test('independently explicit ordinary charge does not need an optional temporal link to be perfect',async()=>{
 const r=await execute(oracle,w=>{w.relations[0].ambiguous=true;});assert.equal(r.result.truth.established,true);assert.ok(r.knowledge.observations[0].interpretation.rejected.some(x=>x.reason==='TRANSITION_UNSUPPORTED_OR_AMBIGUOUS'));
});
test('a subsequent-only classification still requires validated introductory relationship',async()=>{
 const r=await execute(oracle,w=>{w.charges[1].role='SUBSEQUENT';w.relations[0].ambiguous=true;});assert.equal(r.result.truth.established,false);
});

test('live-shaped redundant monetary cadence support does not erase sufficient recurrence',async()=>{
 const r=await execute(oracle,(w,i)=>{const c=w.charges[1],own=i.numbers.find(n=>n.id===c.amountRef).segment,other=i.segments.find(s=>s.id!==own&&s.text.includes('1,080'));assert.ok(other);c.sources=[own,other.id];c.cadenceSources=[own,other.id];c.cadenceText=null;});
 assert.equal(r.result.truth.established,true);assert.notEqual(r.result.catalog.state,'CATALOG_EXHAUSTED');assert.equal(r.result.usage.acquisitions,1);assert.equal(r.result.usage.modelCalls,1);
});
test('non-applicable redundant cadence support does not erase applicable support',async()=>{
 const r=await execute(oracle,(w,i)=>{const c=w.charges[1],own=i.numbers.find(n=>n.id===c.amountRef).segment,other=i.numbers.find(n=>n.id===w.charges[0].amountRef).segment;c.sources=[own];c.cadenceSources=[other,own];c.cadenceText=null;});assert.equal(r.result.truth.established,true);
});

test('amount and recurring cadence compose across charge-bound segments',async()=>{
 const f={...evidenceFixtures[0],html:'<article><h2>Reader</h2><p>For individuals: our subscription price is USD 14.99.</p><p>This Reader subscription renews every month.</p></article>',plans:evidenceFixtures[0].plans.map(p=>({...p,container:true}))};
 const r=await execute(f,(w,i)=>{const c=w.charges[0],amount=i.numbers.find(n=>n.id===c.amountRef),recurrence=i.segments.find(s=>s.text==='This Reader subscription renews every month.');assert.notEqual(amount.segment,recurrence.id);c.cadenceSources=[recurrence.id];c.cadenceKind='RECURRENCE';c.cadenceText=null;});assert.equal(r.result.truth.established,true);
});
test('source-bound foreign account label is not required to match English labels or conventional routes',async()=>{
 const f={...oracle,html:oracle.html.replace('</section>','<a href="/session/start">Se connecter</a></section>')};const r=await execute(f,(w,i)=>{const d=i.destinations[0];w.accounts=[{id:'login',destination:d.id,role:'LOGIN',sources:d.segments,ambiguous:false}];});assert.equal(r.result.truth.accountAccess.LOGIN.state,'ESTABLISHED');assert.equal(r.result.truth.established,true);
});
