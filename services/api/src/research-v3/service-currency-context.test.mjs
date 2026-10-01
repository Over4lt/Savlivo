import test from 'node:test';
import assert from 'node:assert/strict';
import {digest,checkpoint,restore} from './model.mjs';
import {semanticMaterial,projectWebSource} from './source.mjs';
import {observationService,associateService} from './service-association.mjs';
import {resolveSourceCurrency,currencyOccurrences} from './currency-sources.mjs';
import {compatibleCurrencies} from './market-currencies.mjs';
import {createLiveSemanticInterpreter} from './live-semantic.mjs';
import {runTarget,offlineCapabilities} from './runner.mjs';
import {evaluate} from './truth.mjs';
import {fixtureInput,evidenceFixtures,wireCompletion} from './evidence-fixtures.test-support.mjs';
const base=evidenceFixtures.find(f=>f.key==='ordinary');
const observation=html=>{const body='<html><title>Harbor</title><body>'+html+'</body></html>';return {id:'observed',kind:'PROVIDER',format:'WEB',outcome:'OK',httpStatus:200,body,sha256:digest(body),url:'https://provider.example/plans',contentType:'text/html',context:{transport:'DECODO',networkGeography:'US'},transport:{requestedCountry:'US',verifiedCountry:'US',verification:'BRACKET_VERIFIED'}};};
const objective=fixtureInput(base).objective;
function local(html){const o=observation(html),known=observationService(o,objective),p=semanticMaterial(o).presentations.find(p=>p.tag==='p');return {o,known,p,association:{reference:known?.reference,relationship:'PRIMARY_SERVICE'}};}
async function run(f=base,{country=true,modify=w=>w,omitIdentity=true}={}) {
 const source={...f,html:'<main>'+f.html+'</main>'},input={...fixtureInput(source,{country,bounds:{actions:1,modelCalls:1}}),semantic:{mode:'LIVE'}},calls=[];
 const interpret=await createLiveSemanticInterpreter({env:{SAVLIVO_V3_SEMANTIC_MODEL:'offline-model'},client:{chat:{completions:{create:async payload=>{
  const r=JSON.parse(payload.messages[1].content),wire=wireCompletion(r,source);
  for(const offer of wire.offers){offer.serviceRef=r.knownObservationService?.reference??null;offer.association='PRIMARY_SERVICE';}
  if(omitIdentity)wire.serviceSources=wire.offers.flatMap(o=>r.presentations.find(p=>p.id===o.presentation).segments).filter(id=>!r.segments.find(s=>s.id===id).text.includes(f.name));
  modify(wire,r);calls.push({payload,r,wire});return {choices:[{finish_reason:'stop',message:{content:JSON.stringify(wire)}}]};
 }}}}});
 return {...await runTarget({input,interpret,capabilities:offlineCapabilities(input)}),calls};
}
test('established title is system-owned; a primary price card need not repeat the full service name',async()=>{
 const r=await run();assert.equal(r.result.truth.established,true);const o=r.knowledge.observations[0],known=observationService(o,r.input?.objective??objective);
 assert.ok(known);assert.ok(r.calls[0].r.knownObservationService.reference);assert.ok(r.calls[0].r.knownObservationService.presentations.length);
 assert.equal(r.calls[0].wire.serviceSources.some(id=>r.calls[0].r.segments.find(s=>s.id===id).text==='Harbor'),false);
 assert.equal(o.evidence.envelope.offers[0].association.reference,known.reference);assert.equal(evaluate(restore(checkpoint(r.knowledge))).established,true);
});
test('multiple plans remain distinct while inheriting one primary service',async()=>{
 const f=evidenceFixtures.find(f=>f.key==='multiple-plans'),r=await run(f);assert.equal(r.result.truth.established,true);const offers=r.knowledge.observations[0].evidence.envelope.offers;assert.equal(offers.length,2);assert.equal(new Set(offers.map(o=>o.association.reference)).size,1);assert.notEqual(offers[0].presentation,offers[1].presentation);
});
test('matching structured service ancestry can provide an unambiguous primary association',()=>{
 const f=local('<section itemscope itemtype="https://schema.org/Service"><h2 itemprop="name">Harbor</h2><p>Reader subscription USD 12 per month.</p></section>');assert.equal(associateService(f.o,objective,f.p,f.association).eligible,true);
});
for(const [name,html] of [
 ['navigation','<main><nav><p>Reader subscription USD 12 per month.</p></nav></main>'],
 ['footer','<main><footer><p>Reader subscription USD 12 per month.</p></footer></main>'],
 ['unrelated aside','<main><aside><p>Reader subscription USD 12 per month.</p></aside></main>'],
 ['unrelated structure','<div><p>Reader subscription USD 12 per month.</p></div>'],
 ['different named service','<main><section itemscope itemtype="https://schema.org/Service"><h2 itemprop="name">Other Service</h2><p>Reader subscription USD 12 per month.</p></section></main>'],
 ['competitor comparison','<main><section itemprop="isSimilarTo"><p>Reader subscription USD 12 per month.</p></section></main>'],
 ['partner product','<main><section itemprop="isRelatedTo"><p>Reader subscription USD 12 per month.</p></section></main>'],
 ['bundle component','<main><section itemprop="hasPart"><p>Reader subscription USD 12 per month.</p></section></main>'],
 ['add-on','<main><section itemprop="isAccessoryOrSparePartFor"><p>Reader subscription USD 12 per month.</p></section></main>'],
 ['ambiguous multi-service','<main><section itemscope itemtype="https://schema.org/Service"><h2 itemprop="name">Harbor</h2><h2 itemprop="name">Other Service</h2><p>Reader subscription USD 12 per month.</p></section></main>']
])test('service inheritance rejects '+name,()=>{const f=local(html),d=associateService(f.o,objective,f.p,f.association);assert.equal(d.eligible,false);assert.ok(d.reason);assert.ok(d.predicates);});
for(const relationship of ['OTHER_SERVICE','COMPARISON','PARTNER','BUNDLE_COMPONENT','ADD_ON'])test('semantic local relationship '+relationship+' cannot inherit truth',async()=>{const r=await run(base,{modify:w=>{w.offers[0].association=relationship;}});assert.equal(r.result.truth.established,false);assert.equal(r.knowledge.observations[0].interpretation.rejected[0].reason,'SERVICE_ASSOCIATION_UNSUPPORTED');});
test('cross-observation and forged service references fail deterministically',async()=>{
 const f=local('<main><p>USD 12 subscription per month.</p></main>'),other={...f.o,id:'other'};
 assert.equal(associateService(other,objective,f.p,f.association).eligible,false);
 const r=await run(base,{modify:w=>{w.offers[0].serviceRef='service-invented';}});assert.equal(r.result.truth.established,false);assert.ok(r.knowledge.trace.some(e=>e.code==='WIRE_SERVICE_REFERENCE_INVALID'));
});
test('model-invented service identity / truth verdict fields fail wire validation',async()=>{
 for(const change of [w=>{w.serviceId='invented';},w=>{w.offers[0].established=true;}]){const r=await run(base,{modify:change});assert.equal(r.result.truth.established,false);assert.ok(r.knowledge.trace.some(e=>e.code==='WIRE_FIELDS_INVALID'));}
});
test('tampered structural source hash cannot inherit observation service',()=>{const f=local('<main><p>USD 12 subscription per month.</p></main>');f.o.body+='tampered';assert.equal(observationService(f.o,objective),null);assert.equal(associateService(f.o,objective,f.p,f.association).eligible,false);});
const ambiguous={id:'source-currency',raw:'¥',start:0,end:1,candidates:['CNY','JPY']};
for(const [market,currency] of [['JP','JPY'],['CN','CNY']])test('one-way independently verified '+market+' narrows source currency to '+currency,()=>{
 const r=resolveSourceCurrency({occurrence:ambiguous,selected:null,market,verification:'BRACKET_VERIFIED'});assert.equal(r.code,currency);assert.equal(r.diagnostics.marketNarrowingConsidered,true);assert.deepEqual(r.diagnostics.compatibleIntersection,[currency]);
});
test('no compatible metadata or multiple compatible dollar candidates does not guess',()=>{
 assert.equal(resolveSourceCurrency({occurrence:ambiguous,selected:null,market:'US',verification:'BRACKET_VERIFIED'}).code,null);
 assert.equal(resolveSourceCurrency({occurrence:ambiguous,selected:null,market:'ZZ',verification:'BRACKET_VERIFIED'}).code,null);
 const dollar={...ambiguous,raw:'$',candidates:['USD','LRD']};assert.equal(resolveSourceCurrency({occurrence:dollar,selected:null,market:'LR',verification:'BRACKET_VERIFIED'}).code,null);assert.deepEqual(compatibleCurrencies('LR'),['LRD','USD']);
});
test('explicit currency is never rewritten by independent geography',()=>{
 for(const currency of ['CNY','USD']){const occurrence={...ambiguous,raw:currency,candidates:[currency]};assert.equal(resolveSourceCurrency({occurrence,selected:null,market:'JP',verification:'BRACKET_VERIFIED'}).code,currency);}
});
test('source singleton and explicit shared context precede verified-market narrowing',()=>{const r=resolveSourceCurrency({occurrence:ambiguous,selected:null,explicit:['CNY'],market:'JP',verification:'BRACKET_VERIFIED'});assert.equal(r.code,'CNY');assert.equal(r.diagnostics.marketNarrowingConsidered,false);});
for(const [key,market,text,currency,token,amount,amountText] of [
 ['yen','JP','￥12 per month','JPY','￥',12,'12'],['yuan','CN','¥12 per month','CNY','¥',12,'12'],
 ['dollar','US','$14.99 per month','USD','$',14.99,'14.99'],['euro','FR','€14,99 chaque mois','EUR','€',14.99,'14,99']
])test('full source occurrence / verified country / deterministic truth '+key,async()=>{
 const f={...base,market,html:'<article><p>Reader consumer subscription: '+text+'</p></article>',plans:[{...base.plans[0],anchor:'Reader consumer subscription:',charges:[{...base.plans[0].charges[0],money:{amount,amountText,currency,currencyText:token},cadence:{unit:'MONTHLY',expression:key==='euro'?'chaque mois':'per month'}}]}]};
 const r=await run(f,{modify:w=>{w.charges[0].currency=null;}});assert.equal(r.result.truth.established,true);assert.equal(r.result.truth.prices[market].propositions.CURRENCY.value,currency);
 if(key!=='euro')assert.equal(r.knowledge.observations[0].evidence.wire.currencyDiagnostics[0].reason,'VERIFIED_MARKET_NARROWING');
 const unbound=await run(f,{country:false,modify:w=>{w.charges[0].currency=null;}});
 assert.equal(unbound.result.truth.prices[market].propositions.TARGET_MARKET.state,'UNRESOLVED');if(key!=='euro')assert.equal(unbound.result.truth.prices[market].propositions.CURRENCY.state,'UNRESOLVED');
});
test('faithful Japanese regression omits full local identity and model currency, yet establishes ordinary price',async()=>{
 const f=evidenceFixtures.find(f=>f.key==='retained-oracle'),r=await run(f,{modify:w=>{for(const c of w.charges)c.currency=null;}});
 assert.equal(r.result.truth.established,true);const p=r.result.truth.prices.JP.propositions;assert.equal(p.PRICE_AMOUNT.value,1080);assert.equal(p.CURRENCY.value,'JPY');assert.equal(p.TARGET_MARKET.value,'JP');
 const o=r.knowledge.observations[0],offer=o.evidence.envelope.offers[0];assert.equal(offer.charges[0].money.amount,0);assert.equal(offer.charges[0].role,'INTRODUCTORY');assert.equal(offer.charges[1].money.currency,'JPY');assert.equal(offer.transitions[0].kind,'RECURS_AFTER_INTRO');
 assert.ok(o.evidence.wire.currencyDiagnostics.every(d=>d.marketNarrowingConsidered&&d.reason==='VERIFIED_MARKET_NARROWING'));
 const ref=p.CURRENCY.evidence[0].reference.source;assert.equal(ref.serviceAssociation.eligible,true);assert.equal(ref.currencyResolution.verifiedMarket,'JP');assert.ok(offer.support.every(s=>o.body.slice(s.start,s.end)===s.quote));assert.equal(evaluate(restore(checkpoint(r.knowledge))).established,true);
});
test('currency / language / path cannot independently establish market or authorize narrowing',async()=>{
 const f={...base,market:'JP',language:'Japanese',html:'<article><p>Reader subscription ￥14.99 per month.</p></article>',plans:[{...base.plans[0],anchor:'Reader subscription',charges:[{...base.plans[0].charges[0],money:{amount:14.99,amountText:'14.99',currency:'JPY',currencyText:'￥'}}]}]};
 const r=await run(f,{country:false,modify:w=>{w.charges[0].currency=null;}});assert.equal(r.result.truth.prices.JP.propositions.TARGET_MARKET.state,'UNRESOLVED');assert.equal(r.result.truth.prices.JP.propositions.CURRENCY.state,'UNRESOLVED');
 const o=r.knowledge.observations[0];o.url='https://provider.example/jp/';o.transport={requestedCountry:'JP',verifiedCountry:'JP',verification:'BRACKET_VERIFIED'};assert.equal(evaluate(r.knowledge).prices.JP.propositions.TARGET_MARKET.state,'UNRESOLVED');
});
test('explicit wrong-market provider statement blocks observation-market currency narrowing',async()=>{
 const f={...base,market:'JP',html:'<article><p>Reader subscription ¥14.99 per month. This offer is for CN.</p></article>',plans:[{...base.plans[0],market:'CN',anchor:'Reader subscription',charges:[{...base.plans[0].charges[0],money:{amount:14.99,amountText:'14.99',currency:'JPY',currencyText:'¥'}}]}]};
 const r=await run(f,{modify:w=>{w.charges[0].currency=null;}});assert.equal(r.result.truth.established,false);const o=r.knowledge.observations[0];assert.equal(o.evidence.envelope.offers[0].charges[0].money.currency,null);assert.equal(o.evidence.wire.currencyDiagnostics[0].marketNarrowingConsidered,false);
});
test('forged currency resolution cannot survive deterministic evidence reconstruction',async()=>{
 const r=await run(evidenceFixtures.find(f=>f.key==='retained-oracle'),{modify:w=>{for(const c of w.charges)c.currency=null;}}),o=r.knowledge.observations[0];o.evidence.envelope.offers[0].charges[1].money.currency='USD';o.evidenceFragments=[];assert.equal(evaluate(r.knowledge).established,false);
});
test('known observation identity permits empty model serviceSources without inventing evidence',async()=>{const r=await run(base,{modify:w=>{w.serviceSources=[];}});assert.equal(r.result.truth.established,true);const o=r.knowledge.observations[0];assert.deepEqual(o.evidence.envelope.service.support,[]);assert.ok(r.result.truth.prices.US.propositions.SERVICE_IDENTITY.evidence[0].reference.source);});
test('several structured Offer names are plans, not competing Service identities',()=>{
 const f=local('<main><section itemscope itemtype="https://schema.org/Offer"><h2 itemprop="name">Basic</h2><p>USD 12 subscription per month.</p></section><section itemscope itemtype="https://schema.org/Offer"><h2 itemprop="name">Family</h2><p>USD 20 subscription per month.</p></section></main>');assert.equal(associateService(f.o,objective,f.p,f.association).eligible,true);
});
test('requested country without a valid verification class cannot narrow currency',()=>{
 for(const verification of [null,'PENDING','REQUESTED'])assert.equal(resolveSourceCurrency({occurrence:ambiguous,selected:null,market:'JP',verification}).code,null);
});
test('explicit provider exclusion prevents verified-market currency narrowing',async()=>{
 const f={...base,market:'JP',html:'<article><p>Reader subscription ￥14.99 per month. Not available in JP.</p></article>',plans:[{...base.plans[0],anchor:'Reader subscription',charges:[{...base.plans[0].charges[0],money:{amount:14.99,amountText:'14.99',currency:'JPY',currencyText:'￥'}}]}]};
 const r=await run(f,{modify:(w,input)=>{w.charges[0].currency=null;w.offers[0].marketStatements=[{country:'JP',polarity:'EXCLUDED',sources:input.presentations.find(p=>p.id===w.offers[0].presentation).segments,ambiguous:false}];}});
 assert.equal(r.result.truth.established,false);assert.equal(r.knowledge.observations[0].evidence.wire.currencyDiagnostics[0].marketNarrowingConsidered,false);
});
test('currency does not create market even when the model supplies an explicit supported currency',async()=>{
 const r=await run(base,{country:false});assert.equal(r.result.truth.prices.US.propositions.CURRENCY.value,'USD');assert.equal(r.result.truth.prices.US.propositions.TARGET_MARKET.state,'UNRESOLVED');
});
