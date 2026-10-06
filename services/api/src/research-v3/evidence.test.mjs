import test from 'node:test';
import assert from 'node:assert/strict';
import {createEvidenceInterpreter,projectEvidence,evidenceRequest} from './evidence.mjs';
import {runTarget,offlineCapabilities} from './runner.mjs';
import {createKnowledge,context,digest,checkpoint,restore} from './model.mjs';
import {runResearch} from './engine.mjs';
import {selectSemanticUnits} from './semantic-units.mjs';
import {projectWebSource} from './source.mjs';
import {evaluate,truthContract} from './truth.mjs';
import {evidenceFixtures,fixtureInput,evidenceCompletion,url} from './evidence-fixtures.test-support.mjs';
const fixture=key=>evidenceFixtures.find(f=>f.key===key);
async function execute(f,{input=fixtureInput(f),mutate=e=>e,complete,timeoutMs=30000,save}={}) {
 const calls=[];
 const interpret=createEvidenceInterpreter({timeoutMs,complete:async(r,options)=>{calls.push(r);return complete?complete(r,options):mutate(evidenceCompletion(r,f));}});
 if(input.objective.kind==='SERVICE_QUALIFICATION') {const knowledge=await runResearch({objective:input.objective,permissions:input.permissions,bounds:input.bounds,interpret,capabilities:offlineCapabilities(input),save});return {knowledge,result:{truth:evaluate(knowledge),usage:knowledge.usage,stop:knowledge.stop,trace:knowledge.trace},input,calls,interpret};}
 return {...await runTarget({input,interpret,capabilities:offlineCapabilities(input),save}),input,calls,interpret};
}
for(const f of evidenceFixtures)test(f.key+': '+f.language+' presentation follows the general evidence/truth path',async()=>{
 const {result,knowledge,calls}=await execute(f);
 assert.equal(result.truth.established,f.expected!==undefined);
 assert.equal(result.usage.modelCalls,f.expected!==undefined?1:2);assert.equal(calls.length,result.usage.modelCalls);
 assert.ok(knowledge.observations[0].evidence);
 if(f.expected!==undefined){const expected=Array.isArray(f.expected)?f.expected:[f.expected];assert.ok(expected.includes(result.truth.prices[f.market].propositions.PRICE_AMOUNT.value));}
 assert.equal(knowledge.observations[0].context.networkGeography,f.market);
});
test('formal contract: no agreement/proof repetition; missing and failed understanding are not contradiction',()=>{
 assert.equal(truthContract.singleObservationMaySuffice,true);assert.equal(truthContract.modelAgreementRequired,false);assert.equal(truthContract.absenceRetracts,false);
});
test('candidate evidence has no state authority: only deterministic evaluation admits one presentation',async()=>{
 const f=fixture('free-intro'),run=await execute(f);const o=run.knowledge.observations[0];
 const k=createKnowledge({objective:run.input.objective});k.observations=[structuredClone(o)];k.observations[0].candidates=[];
 assert.equal(evaluate(k).established,false);k.observations[0].candidates=projectEvidence(o,k.objective).candidates;
 assert.equal(evaluate(k).established,true);assert.equal(run.result.usage.acquisitions,1);
});
for(const [name,mutate] of [
 ['truth state',e=>e.state='ESTABLISHED'],['verified',e=>e.verified=true],['admission',e=>e.admitted=true],['sufficiency',e=>e.sufficient=true],
 ['observation reference',e=>e.observationId='forged'],['hash',e=>e.observationSha256='forged'],
 ['quotation',e=>e.offers[0].charges[1].support[0].quote+='forged'],['span',e=>e.offers[0].charges[1].support[0].start++],
 ['fabricated amount',e=>e.offers[0].charges[1].money.amount=999],['wrong presentation',e=>e.offers[0].presentation='forged'],
 ['unsupported transition',e=>e.offers[0].transitions[0].support=[]],['missing transition',e=>e.offers[0].transitions=[]],
 ['ambiguous relationship',e=>e.offers[0].transitions[0].ambiguity=true]
])test('rejects '+name+' without granting ordinary recurring truth',async()=>{
 const run=await execute(fixture('free-intro'),{mutate:e=>{mutate(e);return e;}});assert.equal(run.result.truth.established,false);
 assert.notEqual(run.result.truth.prices.DE.propositions.PRICE_AMOUNT.value,12.9);
});
test('COUNTRY context is sufficient market context, Direct is not; language never supplies country',async()=>{
 const f=fixture('norwegian');const bound=await execute(f),direct=await execute(f,{input:fixtureInput(f,{country:false})});
 assert.equal(bound.result.truth.prices.NO.propositions.TARGET_MARKET.value,'NO');assert.equal(direct.result.truth.prices.NO.propositions.TARGET_MARKET.state,'UNRESOLVED');
 const ref=bound.result.truth.prices.NO.propositions.TARGET_MARKET.evidence[0].reference;
 assert.equal(ref.marketContext.basis,'VERIFIED_COUNTRY_OBSERVATION');assert.equal(direct.result.truth.prices.NO.propositions.PRICE_AMOUNT.value,149);
 const o=bound.knowledge.observations[0];o.transport.verifiedCountry='AU';assert.equal(evaluate(bound.knowledge).prices.NO.propositions.TARGET_MARKET.state,'UNRESOLVED');
 o.context.transport='DIRECT';o.transport.verifiedCountry='NO';assert.equal(evaluate(bound.knowledge).prices.NO.propositions.TARGET_MARKET.state,'UNRESOLVED');
});
test('explicit wrong-market provider evidence takes precedence over network country',async()=>{
 const run=await execute(fixture('wrong-market'));assert.equal(run.result.truth.prices.PT.propositions.TARGET_MARKET.state,'CONTRADICTED');
});
test('ambiguous market cannot inherit country certainty',async()=>{
 const run=await execute(fixture('norwegian'),{mutate:e=>{e.offers[0].market.ambiguity=true;return e;}});assert.equal(run.result.truth.prices.NO.propositions.TARGET_MARKET.state,'UNRESOLVED');
});
test('trial introduction is separate; ordinary subsequent positive amount wins',async()=>{
 for(const key of ['free-intro','discount-intro','retained-oracle']) {
  const f=fixture(key),run=await execute(f),p=run.result.truth.prices[f.market];
  assert.equal(p.established,true);assert.equal(p.propositions.PRICE_AMOUNT.value,f.expected);
  const source=projectEvidence(run.knowledge.observations[0],run.input.objective).source;
  assert.equal(source.offers[0].role,'TRIAL');assert.equal(source.offers[1].role,'ORDINARY');assert.notEqual(source.offers[0].amount,source.offers[1].amount);
 }
});
test('multiple plans and unrelated amounts cannot pool money/cadence relationships',async()=>{
 const plans=await execute(fixture('multiple-plans'));
 const ordinary=plans.result.truth.offers.filter(o=>o.propositions.PRICE_AMOUNT.state==='ESTABLISHED');
 assert.equal(ordinary.length,2);assert.equal(new Set(ordinary.map(o=>o.id)).size,2);assert.deepEqual(ordinary.map(o=>o.propositions.PRICE_AMOUNT.value).sort((a,b)=>a-b),[7,13]);
 const other=await execute(fixture('unrelated-money'));assert.equal(other.result.truth.prices.GB.propositions.PRICE_AMOUNT.value,18);
 assert.equal(other.result.truth.offers.some(o=>o.propositions.PRICE_AMOUNT.value===300),false);
});
test('actual incompatible observations contradict the same offer; later missing evidence does not retract',async()=>{
 const f=fixture('ordinary'),run=await execute(f),k=restore(checkpoint(run.knowledge));const original=k.observations[0];
 const missing={...structuredClone(original),id:'missing',body:'<p>No pricing information here.</p>',evidence:undefined,candidates:[]};missing.sha256=digest(missing.body);k.observations.push(missing);
 assert.equal(evaluate(k).prices.US.propositions.PRICE_AMOUNT.state,'ESTABLISHED');
 const changed=structuredClone(original);changed.id='new-observation';changed.body=changed.body.replace('14.99','15.99');changed.sha256=digest(changed.body);
 const nextFixture={...f,plans:f.plans.map(p=>({...p,charges:p.charges.map(c=>({...c,money:{...c.money,amount:15.99,amountText:'15.99'}}))}))};
 changed.evidence.unit=selectSemanticUnits(changed,k.objective)[0];changed.evidence.envelope=evidenceCompletion(evidenceRequest(changed,k.objective,changed.evidence.unit),nextFixture);changed.evidence.envelope.offers[0].charges[0].id='different-local-link-id';k.observations.push(changed);
 assert.equal(evaluate(k).prices.US.propositions.PRICE_AMOUNT.state,'CONTRADICTED');
});
test('understanding failure remains scoped, preserves native identity and permits same-URL country action',async()=>{
 const f=fixture('norwegian'),input=fixtureInput(f);input.planning.initialPerspective='UNBOUND';
 const run=await execute(f,{input,complete:()=>{throw Object.assign(Error('PRIVATE_ERROR'),{status:429});}});
 assert.equal(run.result.usage.acquisitions,2);assert.equal(run.result.usage.modelCalls,1);assert.equal(run.result.truth.service.SERVICE_IDENTITY.state,'ESTABLISHED');
 assert.equal(run.result.truth.prices.NO.propositions.PRICE_AMOUNT.state,'UNRESOLVED');assert.equal(JSON.stringify(run.knowledge).includes('PRIVATE_ERROR'),false);
 assert.deepEqual(run.knowledge.observations.map(o=>o.context.transport),['DIRECT','DECODO']);assert.notEqual(run.knowledge.observations[0].id,run.knowledge.observations[1].id);
});
test('failure does not erase already usable native price facts',async()=>{
 const f=fixture('norwegian'),input=fixtureInput(f);input.planning.initialPerspective='UNBOUND';
 input.fixtures[1].body='<title>Fjord</title><p>Personal subscription price NOK 149 per month.</p>';
 const run=await execute(f,{input,complete:()=>{throw Error('unavailable');}});
 assert.equal(run.result.usage.modelCalls,2);assert.equal(run.result.truth.eligibility.NO.result,'UNRESOLVED');
});
test('model budget zero still allows native evidence; missing understanding stays bounded',async()=>{
 const f=fixture('norwegian'),input=fixtureInput(f,{bounds:{modelCalls:0}});
 const missing=await execute(f,{input});assert.equal(missing.calls.length,0);assert.equal(missing.result.usage.modelCalls,0);assert.equal(missing.result.stop.reason,'CAPACITY_BOUND_REACHED');
 input.fixtures.at(-1).body='<title>Fjord</title><p>Personal subscription price NOK 149 per month.</p>';
 const native=await execute(f,{input});assert.equal(native.calls.length,0);assert.equal(native.result.truth.established,false);assert.equal(native.result.truth.eligibility.NO.result,'UNRESOLVED');
});
test('checkpoint/resume preserves source bindings and spent understanding reservations',async()=>{
 const f=fixture('free-intro');let reserved;
 const run=await execute(f,{save:s=>{if(s.payload.observations.at(-1)?.interpretation?.kind==='UNDERSTANDING_PENDING')reserved=s;}});
 const snapshot=checkpoint(run.knowledge),k=restore(snapshot);assert.equal(evaluate(k).established,true);assert.equal(k.usage.modelCalls,1);
 const resumed=await runTarget({input:run.input,interpret:run.interpret,capabilities:offlineCapabilities(run.input),snapshot});assert.equal(resumed.result.usage.modelCalls,1);
 assert.equal(reserved.payload.usage.modelCalls,1);assert.equal(reserved.payload.observations[0].evidence,undefined);
 k.observations[0].evidence.envelope.offers[0].charges[1].support[0].quote+='tampered';assert.equal(evaluate(k).established,false);
 const interrupted=await runTarget({input:run.input,interpret:run.interpret,capabilities:offlineCapabilities(run.input),snapshot:reserved});assert.equal(interrupted.result.usage.modelCalls,1);
});
test('Tavily snippets cannot become authoritative evidence, even with a candidate graph',async()=>{
 const f=fixture('free-intro'),run=await execute(f);run.knowledge.observations[0].kind='DISCOVERY';assert.equal(evaluate(run.knowledge).established,false);
});
test('malformed output and timeout leave truth unresolved, with typed safe failures',async()=>{
 for(const [complete,code] of [[()=>'{bad','UNDERSTANDING_JSON_INVALID'],[()=>new Promise(()=>{}),'UNDERSTANDING_TIMEOUT']]) {
  const run=await execute(fixture('norwegian'),{complete,timeoutMs:10});assert.equal(run.result.truth.established,false);assert.equal(run.result.usage.modelCalls,2);assert.ok(run.result.trace.some(t=>t.code===code));
 }
});
test('independently explicit ordinary recurrence needs no redundant introductory transition gate',async()=>{
 const run=await execute(fixture('free-intro'),{mutate:e=>{e.offers[0].charges[1].role='ORDINARY';e.offers[0].transitions=[];return e;}});
 assert.equal(run.result.truth.established,true);
});
test('amount notation cannot be a numeric prefix or detached thousands suffix',async()=>{
 for(const [amount,amountText] of [[1,'1'],[108,'108'],[80,'080']]) {
  const run=await execute(fixture('retained-oracle'),{mutate:e=>{e.offers[0].charges[1].money.amount=amount;e.offers[0].charges[1].money.amountText=amountText;return e;}});
  assert.equal(run.result.truth.established,false);
 }
});
test('another provider service cannot inherit the target identity from a native page heading',async()=>{
 const run=await execute(fixture('norwegian'),{mutate:e=>{e.service.name='Other service';e.offers[0].service='Other service';return e;}});
 assert.equal(run.result.truth.established,false);assert.equal(run.result.truth.service.SERVICE_IDENTITY.state,'ESTABLISHED');
});
test('unbound qualifiers cannot strengthen or change represented conditions',async()=>{
 const run=await execute(fixture('free-intro'),{mutate:e=>{e.offers[0].qualifiers=['fabricated condition'];return e;}});
 assert.equal(run.result.truth.established,false);
});
test('understanding cannot silently remove explicit native wrong-market evidence',async()=>{
 const f={...fixture('ordinary'),html:'<p>For individuals: our subscription renews every month. We charge USD 14.99 for customers in AU.</p>'};
 const run=await execute(f);assert.equal(run.result.truth.prices.US.established,false);assert.equal(run.result.truth.prices.US.propositions.TARGET_MARKET.state,'CONTRADICTED');
});
test('population and account semantics feed independent unchanged admission rules',async()=>{
 const f={...fixture('norwegian'),html:'<section><p>Fjord har 150,000 brukere totalt. Medlemmer kan logge inn på kontoen og administrere abonnementet etter innlogging.</p><p>Privat abonnement: NOK 149 hver måned, ordinær pris.</p></section>'};
 const input=fixtureInput(f);input.objective.kind='SERVICE_QUALIFICATION';input.objective.markets=[];input.permissions={DIRECT:true};input.planning.initialPerspective='UNBOUND';
 const run=await execute(f,{input,mutate:e=>{
  const quote=e.offers[0].support[0]; // own offer support is only the pricing paragraph
  const r=quote;assert.ok(r);
  const body=input.fixtures[1].body,original='Fjord har 150,000 brukere totalt. Medlemmer kan logge inn på kontoen og administrere abonnementet etter innlogging.',start=body.indexOf(original);
  const support=[{start,end:start+original.length,quote:original,translated:null}];
  e.service.populations=[{scope:'SERVICE_TOTAL',measure:'USERS',kind:'EXACT',count:150000,countText:'150,000',scale:1,scaleText:null,ambiguity:false,support}];
  e.service.account=[{operation:'LOGIN',access:'ACCOUNT',polarity:'AFFIRMED',ambiguity:false,support},{operation:'MANAGE_SUBSCRIPTION',access:'POST_LOGIN',polarity:'AFFIRMED',ambiguity:false,support}];return e;
 }});
 assert.equal(run.result.truth.admitted,true);assert.equal(run.result.truth.service.SERVICE_SIZE_100K_PLUS.state,'ESTABLISHED');assert.equal(run.result.truth.service.MEMBERSHIP_MANAGEMENT_EXISTS.state,'ESTABLISHED');
});
test('competing cadence expressions are unresolved, not native annual contradiction',async()=>{
 const f={...fixture('ordinary'),html:'<p>Personal consumer subscription USD 14.99 monthly or annually; the cadence is unclear.</p>',plans:fixture('ordinary').plans.map(p=>({...p,anchor:'Personal consumer',charges:p.charges.map(c=>({...c,cadence:{unit:'UNKNOWN',expression:null},ambiguity:true}))}))};
 const run=await execute(f);assert.equal(run.result.truth.prices.US.propositions.MONTHLY_CADENCE.state,'UNRESOLVED');assert.equal(run.result.truth.established,false);
});
test('benefit/credit cadence does not establish genuine monthly subscription admission',async()=>{
 const run=await execute(fixture('benefit'));assert.equal(run.result.truth.service.CONSUMER_MONTHLY_SUBSCRIPTION_EXISTS.state,'UNRESOLVED');
});
test('monthly consumer subscription remains independent of unknown amount/currency',async()=>{
 const f={...fixture('norwegian'),html:'<p>Privat abonnement: fornyes hver måned. Pris er ikke oppgitt.</p>',plans:fixture('norwegian').plans.map(p=>({...p,charges:p.charges.map(c=>({...c,money:{amount:null,amountText:null,currency:null,currencyText:null}}))}))};
 const run=await execute(f);assert.equal(run.result.truth.service.CONSUMER_MONTHLY_SUBSCRIPTION_EXISTS.state,'ESTABLISHED');assert.equal(run.result.truth.prices.NO.propositions.PRICE_AMOUNT.state,'UNRESOLVED');assert.equal(run.result.truth.prices.NO.propositions.CURRENCY.state,'UNRESOLVED');
});
test('native numeric grouping reads a complete amount and never an isolated suffix',async()=>{
 const input=fixtureInput(fixture('ordinary'));
 input.fixtures.at(-1).body='<title>Harbor</title><p>Personal subscription USD 1 080 per month.</p>';
 const complete=await execute(fixture('ordinary'),{input});assert.equal(projectWebSource(complete.knowledge.observations[0],input.objective).source.offers[0].amount,1080);assert.equal(complete.result.truth.eligibility.US.result,'UNRESOLVED');
 input.fixtures.at(-1).body='<title>Harbor</title><p>Personal subscription 1 08 USD per month.</p>';
 input.fixtures[1].body=input.fixtures.at(-1).body;
 const malformed=await execute(fixture('ordinary'),{input,complete:()=>{throw Error('unsupported notation');}});assert.equal(malformed.result.truth.prices.US.propositions.PRICE_AMOUNT.state,'UNRESOLVED');
});
