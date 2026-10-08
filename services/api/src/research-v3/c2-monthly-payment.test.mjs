import test from 'node:test';
import assert from 'node:assert/strict';
import {createKnowledge,context,digest} from './model.mjs';
import {evaluate} from './truth.mjs';
import {evidenceCompletion} from './evidence-fixtures.test-support.mjs';
import {evidenceRequest,projectEvidence} from './evidence.mjs';
import {projectObservation} from './projection.mjs';
import {admitPayment} from './payment-semantics.mjs';

const objective={kind:'PRICE',serviceId:'meridian',serviceName:'Meridian',providerHosts:['provider.example'],markets:['US'],seeds:['https://provider.example/plans']};
const ordinary={id:'standard',amount:12.99,currency:'USD',cadence:'UNKNOWN',billingCadence:'MONTHLY',consumer:true,relationship:'SUBSCRIPTION',role:'ORDINARY',amountDerivation:'EXPLICIT',market:'US'};
function typed(offers){
 const k=createKnowledge({objective}),body=JSON.stringify({serviceId:objective.serviceId,offers});
 k.observations.push({id:'typed',kind:'PROVIDER',format:'JSON',url:objective.seeds[0],outcome:'OK',truncated:false,body,sha256:digest(body),context:context('DECODO','US'),transport:{requestedCountry:'US',verifiedCountry:'US',verification:'BRACKET_VERIFIED'},candidates:[{kind:'SERVICE',pointer:''},...offers.map((_,i)=>({kind:'OFFER',pointer:'/offers/'+i}))]});
 return evaluate(k);
}
function web(text,charges,mutate=()=>{},options={}){
 const f={name:objective.serviceName,language:'English',market:'US',html:options.html??'<section><h2>Standard</h2>'+text.split('|').map(s=>'<p>'+s+'</p>').join('')+'</section>',plans:options.plans??[{name:'Standard',anchor:'Standard',container:true,charges}]};
 const k=createKnowledge({objective}),body='<html><title>Meridian</title><body>'+f.html+'</body></html>';
 const o={id:'web',kind:'PROVIDER',format:'WEB',contentType:'text/html',url:objective.seeds[0],outcome:'OK',httpStatus:200,truncated:false,body,sha256:digest(body),context:context('DECODO','US'),transport:{requestedCountry:'US',verifiedCountry:'US',verification:'BRACKET_VERIFIED'}};
 const envelope=evidenceCompletion(evidenceRequest(o,objective),f);
 mutate(envelope);
 o.evidence={envelope};o.candidates=projectObservation(o,objective).candidates;k.observations.push(o);
 return {truth:evaluate(k),projected:projectEvidence(o,objective)};
}
const charge=(id,amount,amountText,billingCadence='MONTHLY')=>({id,money:{amount,amountText,currency:'USD',currencyText:'USD'},cadence:{unit:'UNKNOWN',expression:null},billingCadence,role:'ORDINARY',derivation:'EXPLICIT',duration:null,qualifiers:[],ambiguity:false});

test('C2 N: source-declared actual monthly charge establishes with display cadence unknown',()=>{
 const t=typed([ordinary]);
 assert.equal(t.prices.US.propositions.MONTHLY_CADENCE.state,'UNRESOLVED');
 assert.equal(t.prices.US.propositions.MONTHLY_SUBSCRIPTION.state,'ESTABLISHED');
 assert.equal(t.established,true);
 assert.equal(t.needs.some(n=>n.proposition==='MONTHLY_CADENCE'),false);
});
test('C2 annual monthly-equivalent amount is not an actual monthly payment',()=>{
 const quote='Consumer subscription NOK 50/month when billed yearly.';
 assert.equal(admitPayment({cadence:'MONTHLY',kind:'ACTUAL_PAYMENT',text:quote,rows:[{start:0,end:quote.length,quote}],valid:()=>true}).kind,'UNKNOWN');
 const t=typed([{...ordinary,amount:50,cadence:'MONTHLY',billingCadence:'YEARLY',amountDerivation:'ARITHMETIC'}]);
 assert.equal(t.established,false);
 assert.notEqual(t.eligibility.US.result,'ELIGIBLE');
});
test('C2 access duration alone does not establish a monthly charge',()=>{
 const quote='Consumer subscription access valid for one month at USD 12.99.';
 assert.equal(admitPayment({cadence:'MONTHLY',kind:'ACTUAL_PAYMENT',text:quote,rows:[{start:0,end:quote.length,quote}],valid:()=>true}).kind,'UNKNOWN');
 const t=typed([{...ordinary,billingCadence:'UNKNOWN',accessDuration:{length:1,unit:'month'}}]);
 assert.equal(t.established,false);
 assert.equal(t.prices.US.propositions.MONTHLY_SUBSCRIPTION.state,'UNRESOLVED');
});
test('C2 unsupported model ACTUAL_PAYMENT label cannot promote an access quotation',()=>{
 const quote='subscription: 1 months';
 assert.equal(admitPayment({cadence:'MONTHLY',kind:'ACTUAL_PAYMENT',text:quote,rows:[{start:0,end:quote.length,quote}],valid:()=>true}).kind,'UNKNOWN');
 const r=web('Consumer subscription USD 12.99. Access valid for one month.',[charge('ordinary',12.99,'12.99')]);
 assert.equal(r.projected.source.offers[0].billingCadence,'UNKNOWN');
 assert.equal(r.truth.established,false);
});
test('C2 introductory monthly payment cannot be borrowed for ordinary charge',()=>{
 const r=web('Trial USD 0 billed monthly.|Ordinary subscription price USD 12.99.',[charge('intro',0,'0'),charge('ordinary',12.99,'12.99')],e=>{
  const [intro,ordinaryCharge]=e.offers[0].charges;
  intro.role='INTRODUCTORY';intro.monetary.kind='INTRODUCTORY_SUBSCRIPTION_CHARGE';
  const introRow=e.offers[0].support.find(s=>s.quote.includes('Trial USD 0'));
  const ordinaryRow=e.offers[0].support.find(s=>s.quote.includes('Ordinary subscription price'));
  ordinaryCharge.support=[ordinaryRow];ordinaryCharge.monetary.support=[ordinaryRow];
  ordinaryCharge.payment={kind:'ACTUAL_PAYMENT',text:introRow.quote,support:[introRow]};
  ordinaryCharge.temporal.billingSupport=[introRow];
 });
 assert.equal(r.projected.source.offers.find(o=>o.amount===12.99)?.billingCadence,'UNKNOWN');
 assert.equal(r.truth.established,false);
});
test('C2 payment on Plan B cannot establish Plan A monthly price',()=>{
 const t=typed([{...ordinary,id:'plan-a',billingCadence:'UNKNOWN'},{...ordinary,id:'plan-b',amount:null}]);
 assert.equal(t.established,false);
 assert.equal(t.offers.find(o=>o.id==='plan-a').propositions.MONTHLY_SUBSCRIPTION.state,'UNRESOLVED');
});
test('C2 model cannot borrow Plan B payment quotation for Plan A charge',()=>{
 const html='<section><h2>Plan A</h2><p>Consumer subscription Plan A USD 12.99.</p></section><section><h2>Plan B</h2><p>Consumer subscription Plan B USD 27 billed monthly.</p></section>';
 const plans=[{name:'Plan A',anchor:'Consumer subscription Plan A',charges:[charge('a',12.99,'12.99')]},{name:'Plan B',anchor:'Consumer subscription Plan B',charges:[charge('b',27,'27')]}];
 const r=web('',[],e=>{
  const other=e.offers[1].charges[0].support.find(s=>s.quote.includes('billed monthly'));
  const own=e.offers[0].charges[0];own.payment={kind:'ACTUAL_PAYMENT',text:other.quote,support:[other]};own.temporal.billingSupport=[other];
 },{html,plans});
 const i=r.projected.source.offers.findIndex((_,index)=>r.projected.bindings['/offers/'+index]?.offer==='Plan A');
 assert.ok(i>=0);
 assert.equal(r.projected.source.offers[i].billingCadence,'UNKNOWN');
 assert.equal(r.truth.offers.find(o=>o.id===r.projected.source.offers[i].id).propositions.MONTHLY_SUBSCRIPTION.state,'UNRESOLVED');
});
test('C2 month-length structure alone is not a payment period',()=>{
 const t=typed([{...ordinary,billingCadence:'UNKNOWN',interval:{length:1,unit:'month'}}]);
 assert.equal(t.established,false);
 assert.equal(t.eligibility.US.result,'UNRESOLVED');
});
test('C2 source-supported monthly payment survives missing display cadence in WEB projection',()=>{
 const r=web('個人向け定期購読。月額 USD 12.99 を毎月お支払い。',[charge('ordinary',12.99,'12.99')]);
 assert.equal(r.projected.source.offers[0].billingCadence,'MONTHLY');
 assert.equal(r.truth.prices.US.propositions.MONTHLY_CADENCE.state,'UNRESOLVED');
 assert.equal(r.truth.established,true);
});
