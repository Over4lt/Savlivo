import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {interpretPaymentText} from './subscription-language.mjs';
import {createEvidenceInterpreter,projectEvidence} from './evidence.mjs';
import {digest,context,checkpoint,restore} from './model.mjs';
import {runResearch} from './engine.mjs';
import {evaluate} from './truth.mjs';
import {selectSemanticPlan} from './semantic-units.mjs';
const objective={kind:'PRICE',serviceId:'lumen',serviceName:'Lumen',providerHosts:['provider.example'],markets:['US'],seeds:['https://provider.example/catalog']};
const object=(statement,extra={})=>({name:'Unseen glyph Λ',consumer:true,recurring:true,description:statement,...extra});
const html=objects=>'<title>Lumen</title><main><script type="application/json">'+JSON.stringify({records:objects})+'</script></main>';
const observation=body=>({id:digest(body),kind:'PROVIDER',format:'WEB',body,sha256:digest(body),url:objective.seeds[0],httpStatus:200,outcome:'OK',contentType:'text/html',truncated:false,context:context('DECODO','US'),transport:{requestedCountry:'US',verifiedCountry:'US',verification:'BRACKET_VERIFIED'}});
async function replay(objects,{failure='unavailable',direct=false}={}){
 let calls=0;const interpret=createEvidenceInterpreter({complete:()=>{calls++;if(failure==='unknown')return null;const e=Error('MODEL_UNAVAILABLE');if(failure==='429')e.status=429;if(failure==='400')e.status=400;throw e;}});
 const k=await runResearch({objective,permissions:direct?{DIRECT:true}:{DECODO:true},interpret,capabilities:{[direct?'DIRECT':'DECODO']:a=>({...observation(html(objects)),context:a.context})}});return {k,t:evaluate(k),calls};
}
const monthly=['USD 13 billed monthly','USD 13 pro Monat','USD 13 facturé par mois','USD 13 por mes','USD 13 por mês','USD 13 per måned','USD 13 per månad','USD 13 pr. måned'];
const annual=['USD 130 billed annually','USD 130 pro Jahr','USD 130 facturé par an','USD 130 por año','USD 130 por ano','USD 130 per år'];
for(const text of monthly)test('supported multilingual monthly without model: '+text,async()=>{const {t,calls}=await replay([object(text)]);assert.equal(t.established,true);assert.equal(t.prices.US.propositions.PRICE_AMOUNT.value,13);assert.equal(calls,0);});
for(const text of annual)test('supported annual is not monthly: '+text,async()=>{const {t}=await replay([object(text)]);assert.equal(t.established,false);assert.equal(t.eligibility.US.result,'UNRESOLVED');assert.notEqual(interpretPaymentText(text,{recurring:true})[0]?.billingCadence,'MONTHLY');});
const intros=['USD 0 for first month, then USD 13 per month','USD 2 for 1 month, thereafter USD 13 per month','USD 0 für 1 Monat, danach USD 13 pro Monat','USD 0 pendant 1 mois, puis USD 13 par mois','USD 0 durante 1 mes, luego USD 13 por mes','USD 0 por 1 mês, depois USD 13 por mês','USD 0 for 1 måned, deretter USD 13 per måned'];
for(const text of intros)test('intro and subsequent remain distinct: '+text,async()=>{const {k,t,calls}=await replay([object(text)]);assert.equal(t.established,true);assert.equal(t.prices.US.propositions.PRICE_AMOUNT.value,13);assert.equal(calls,0);const source=k.observations[0].evidence.envelope.offers[0];assert.equal(source.charges[0].role,'INTRODUCTORY');assert.equal(source.charges[1].role,'SUBSEQUENT');assert.equal(source.transitions.length,1);});
test('free trial followed by independently explicit ordinary charge',async()=>{const {t}=await replay([object('Free trial for 1 month, then USD 13 per month')]);assert.equal(t.prices.US.propositions.PRICE_AMOUNT.value,13);assert.equal(t.established,true);});
for(const text of ['USD 130 billed annually, equivalent to USD 10 per month','USD 130 facturé par an, équivalent à USD 10 par mois','USD 130 abgerechnet pro Jahr, entspricht USD 10 pro Monat'])test('annual effective monthly rejected: '+text,async()=>{const {t}=await replay([object(text)]);assert.equal(t.established,false);});
test('separate annual billing disclosure prevents monthly display inference',async()=>{const {t}=await replay([object('USD 10 per month',{terms:'Billed annually'})]);assert.equal(t.established,false);});
test('actual monthly billing remains independent from annual commitment',async()=>{const {k,t}=await replay([object('USD 13 billed monthly',{terms:'12 month commitment'})]);assert.equal(t.established,true);assert.equal(k.observations[0].evidence.envelope.offers[0].charges[0].temporal.commitmentText,'12 month commitment');});
for(const failure of ['unavailable','429','400','unknown'])test('deterministic independent offers survive optional model '+failure,async()=>{const {t,calls}=await replay([object('USD 13 billed monthly'),object('USD 27 billed monthly',{name:'Other Ω'}),object('USD 31 ??? zyx',{name:'Opaque ζ'})],{failure});assert.deepEqual(t.offers.filter(o=>o.propositions.PRICE_AMOUNT.state==='ESTABLISHED').map(o=>o.propositions.PRICE_AMOUNT.value).sort((a,b)=>a-b),[13,27]);assert.ok(calls>0);});
for(const text of ['USD 13 zyx lunara','USD 13/month equivalent','recurring 13','USD 13','USD 13 credit per month','USD 13 benefit per month','USD 13 savings per month','USD 13 tax per month','USD 13 installment per month'])test('unsupported/noncharge remains unresolved '+text,async()=>{const {t}=await replay([object(text)]);assert.equal(t.established,false);});
test('recurring-only and arbitrary metadata do not establish subscriptions',async()=>{const {t}=await replay([{name:'metadata',recurring:true,count:13,interval:'monthly'},{name:'Metadata',description:'USD 13 billed monthly'}]);assert.equal(t.established,false);});
test('container keys alone do not create cadence or monetary role',async()=>{const {t}=await replay([object('opaque',{monthlyPayment:13,ordinaryPrice:13,currency:'USD'})]);assert.equal(t.established,false);});
test('multiple unrelated amounts cannot be selected as one ordinary price',async()=>{const {t}=await replay([object('USD 13 per month or USD 27 per month')]);assert.equal(t.established,false);});
test('language currency and URL do not establish market',async()=>{for(const text of ['USD 13 per month','USD 13 per måned','USD 13 par mois']){const {t}=await replay([object(text)],{direct:true});assert.equal(t.established,false);assert.equal(t.offers[0]?.propositions.TARGET_MARKET.state,'UNRESOLVED');}});
test('bad authority/hash/truncation cannot create native evidence',()=>{const interpret=createEvidenceInterpreter({complete:()=>null}),o=observation(html([object('USD 13 per month')])),unit=selectSemanticPlan(o,objective).units[0];for(const edit of [{url:'https://untrusted.example/'},{sha256:'bad'},{truncated:true},{kind:'SEARCH'}])assert.equal(interpret.nativeEvidence({...o,...edit},objective,unit),null);});
test('malformed or truncated JSON remains unresolved',async()=>{const body='<title>Lumen</title><script type="application/json">{"recurring":true,"description":"USD 13 per month"';const k=await runResearch({objective,permissions:{DIRECT:true},interpret:createEvidenceInterpreter({complete:()=>null}),capabilities:{DIRECT:a=>({...observation(body),context:a.context})}});assert.equal(evaluate(k).established,false);});
test('retained Norway normal engine autonomously interprets four offers with every model call failing',async()=>{
 const body=readFileSync(new URL('fixtures/spotify-norway-retained.html',import.meta.url),'utf8'),target={kind:'PRICE',serviceId:'spotify',serviceName:'Spotify',providerHosts:['www.spotify.com'],markets:['NO'],seeds:['https://www.spotify.com/no-nb/premium/']};let calls=0;
 const interpret=createEvidenceInterpreter({complete:()=>{calls++;const e=Error('MODEL_UNAVAILABLE');e.status=429;throw e;}});
 const k=await runResearch({objective:target,permissions:{DECODO:true},interpret,capabilities:{DECODO:a=>a.url!==target.seeds[0]?{url:a.url,context:a.context,outcome:'FAILED',httpStatus:404,body:''}:({url:a.url,context:a.context,format:'WEB',contentType:'text/html',httpStatus:200,outcome:'OK',body,transport:{verification:'BRACKET_VERIFIED',requestedCountry:'NO',verifiedCountry:'NO'}})}});
 const t=evaluate(k);assert.deepEqual(t.offers.filter(g=>g.propositions.PRICE_AMOUNT.state==='ESTABLISHED').map(g=>g.propositions.PRICE_AMOUNT.value).sort((a,b)=>a-b),[75,139,189,219]);assert.equal(t.eligibility.NO.result,'ELIGIBLE');assert.notEqual(k.catalog.state,'CATALOG_EXHAUSTED');assert.deepEqual(evaluate(restore(checkpoint(k))),t);
 const native=k.observations.flatMap(o=>o.evidenceFragments??[]);assert.ok(native.length>=3);assert.ok(k.trace.some(t=>t.event==='NATIVE_PAYMENT_INTERPRETATION'));assert.ok(calls>=0);
});
test('annual commitment is not annual billing even in the same payment statement',async()=>{const {t}=await replay([object('USD 13 billed monthly with an annual commitment')]);assert.equal(t.established,true);});
test('monthly display with annual commitment and no payment predicate remains unresolved',async()=>{const {k,t,calls}=await replay([object('USD 13 per month',{terms:'Annual commitment'})]);assert.equal(t.established,false);assert.ok(calls>0);assert.ok(k.observations[0].evidence);assert.equal(k.observations[0].evidence.envelope.offers[0].charges[0].money.amount,13);});
test('year-long commitment preserves an explicit monthly payment',async()=>{const {t}=await replay([object('USD 13 billed monthly',{terms:'One year contract'})]);assert.equal(t.established,true);});
test('bare recurring flag and display in unrelated containers cannot compose',async()=>{const {t}=await replay([{name:'Unseen',consumer:true,recurring:true},{name:'Unrelated',consumer:true,description:'USD 13 per month'}]);assert.equal(t.established,false);});
test('native evidence never consumes an uncovered structured presentation',async()=>{
 let calls=0;const interpret=createEvidenceInterpreter({complete:()=>{calls++;throw Error('UNAVAILABLE');}});
 const body=html([object('USD 13 billed monthly'),{name:'Other personal subscription',description:'USD 22 opaque cadence'}]);
 const k=await runResearch({objective,permissions:{DECODO:true},interpret,capabilities:{DECODO:a=>({...observation(body),context:a.context})}});
 assert.equal(evaluate(k).established,true);assert.ok(calls>0);assert.ok(k.observations[0].evidence);assert.notEqual(k.catalog.state,'CATALOG_EXHAUSTED');
});
test('negated payment is not a native monthly assertion',async()=>{const {t}=await replay([object('Not USD 13 billed monthly')]);assert.equal(t.established,false);});
test('unsafe semantic relation cannot replace independently admitted native evidence',async()=>{
 const body=html([object('USD 13 billed monthly'),object('USD 27 zyx cadence',{name:'Unseen second'})]),o=observation(body);
 const safe=createEvidenceInterpreter({complete:()=>null});const good=selectSemanticPlan(o,objective).candidates.map(u=>safe.nativeEvidence(o,objective,u)).find(Boolean);
 const interpret=createEvidenceInterpreter({complete:r=>({...good.envelope,offers:good.envelope.offers.map(v=>({...v,presentation:r.unit.presentationIds[0],transitions:[{from:'invisible',to:'missing',kind:'RECURS_AFTER_INTRO',ambiguity:false,support:[]}]}))})});
 const k=await runResearch({objective,permissions:{DECODO:true},interpret,capabilities:{DECODO:a=>({...o,context:a.context})}});
 assert.deepEqual(evaluate(k).offers.filter(v=>v.propositions.PRICE_AMOUNT.state==='ESTABLISHED').map(v=>v.propositions.PRICE_AMOUNT.value),[13]);
});
for(const key of ['credit','benefit','savings','tax','installment','allowance'])test('source monetary-role container cannot be laundered into price '+key,async()=>{const {t}=await replay([{name:'Unseen',consumer:true,recurring:true,[key]:'USD 13 per month'}]);assert.equal(t.established,false);});
test('page-level recurrence cannot bind arbitrary child prices',async()=>{const {t}=await replay([{name:'Unseen',consumer:true,recurring:true,items:[{name:'Other',price:'USD 13 per month'}]}]);assert.equal(t.established,false);});
test('negative monetary token cannot be read as a positive suffix price',async()=>{for(const text of ['USD -13 per month','−13 USD billed monthly']){const {t}=await replay([object(text)]);assert.equal(t.established,false);}});
test('model request capacity cannot discard sufficient native evidence in a mixed unit',async()=>{
 let calls=0;const interpret=createEvidenceInterpreter({prepare:()=>{throw Error('EVIDENCE_REQUEST_BOUND');},complete:()=>{calls++;throw Error('DOWN');}});
 const body=html([object('USD 13 billed monthly'),{name:'Other personal subscription',description:'USD 22 opaque cadence'}]);
 const k=await runResearch({objective,permissions:{DECODO:true},interpret,capabilities:{DECODO:a=>({...observation(body),context:a.context})}});
 assert.equal(evaluate(k).established,true);assert.equal(calls,0);assert.ok(k.trace.some(t=>t.event==='UNDERSTANDING_REQUEST_BLOCKED'&&t.nativePreserved));assert.notEqual(k.catalog.state,'CATALOG_EXHAUSTED');
});
