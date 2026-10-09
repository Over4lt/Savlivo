import test from 'node:test';
import assert from 'node:assert/strict';
import {createKnowledge,context,digest} from './model.mjs';
import {evaluate} from './truth.mjs';

const objective={kind:'PRICE',serviceId:'atlas',serviceName:'Atlas',providerHosts:['provider.example'],markets:['US'],seeds:['https://provider.example/plans']};
const monthly={id:'pro',name:'Pro',amount:12,currency:'USD',cadence:'UNKNOWN',billingCadence:'MONTHLY',consumer:true,relationship:'SUBSCRIPTION',role:'ORDINARY',amountDerivation:'EXPLICIT',market:'US'};
const yearly={...monthly,billingCadence:'YEARLY'};

function observation(id,offers,{transport='DIRECT',country='US',url=objective.seeds[0]}={}){
 const body=JSON.stringify({serviceId:objective.serviceId,offers});
 return {id,kind:'PROVIDER',format:'JSON',url,outcome:'OK',truncated:false,body,sha256:digest(body),context:context(transport,transport==='DIRECT'?'UNBOUND':country),transport:transport==='DIRECT'?{verification:'UNBOUND'}:{requestedCountry:country,verifiedCountry:country,verification:'BRACKET_VERIFIED'},candidates:[{kind:'SERVICE',pointer:''},...offers.map((_,i)=>({kind:'OFFER',pointer:'/offers/'+i}))]};
}
function truth(...observations){const k=createKnowledge({objective:{...objective,markets:['US','CA']}});k.observations=observations;return evaluate(k);}

test('M: same SKU and scope with monthly and yearly payment claims cannot select the favorable partition',()=>{
 const t=truth(observation('source',[monthly,yearly]));
 assert.equal(t.prices.US.established,false);
 assert.equal(t.prices.US.propositions.MONTHLY_SUBSCRIPTION.state,'CONTRADICTED');
 assert.equal(t.eligibility.US.result,'UNRESOLVED');
 assert.equal(t.service.CONSUMER_MONTHLY_SUBSCRIPTION_EXISTS.state,'UNRESOLVED');
 assert.ok(t.needs.some(n=>n.id==='US:MONTHLY_SUBSCRIPTION'&&n.state==='CONTRADICTED'));
 assert.equal(t.established,false);
});
test('M: commitment, derivation, and missing-condition spellings cannot hide a payment conflict',()=>{
 const t=truth(observation('source',[monthly,{...yearly,conditions:'UNKNOWN',commitment:'12 months',amountDerivation:'ARITHMETIC'}]));
 assert.equal(t.prices.US.established,false);
 assert.equal(t.prices.US.propositions.MONTHLY_SUBSCRIPTION.state,'CONTRADICTED');
});
test('M: billing-only condition text cannot act as a variant identity',()=>{
 const t=truth(observation('source',[{...monthly,conditions:'billed monthly'},{...yearly,conditions:'billed yearly'}]));
 assert.equal(t.prices.US.established,false);
 assert.equal(t.prices.US.propositions.MONTHLY_SUBSCRIPTION.state,'CONTRADICTED');
});
test('M: material audience condition remains when billing-only qualifier differs',()=>{
 const t=truth(observation('source',[{...monthly,conditions:'["student","billed monthly"]'},{...yearly,conditions:'["student","billed yearly"]'}]));
 assert.equal(t.prices.US.established,false);
 assert.equal(t.prices.US.propositions.MONTHLY_SUBSCRIPTION.state,'CONTRADICTED');
});
test('M separation A: explicit selectable billing variants under one plan remain separate',()=>{
 const t=truth(observation('source',[{...monthly,conditions:'selectable monthly option'},{...yearly,conditions:'selectable annual option'}]));
 assert.equal(t.prices.US.established,true);
 assert.equal(t.prices.US.propositions.MONTHLY_SUBSCRIPTION.state,'ESTABLISHED');
});
test('M separation B: different provider offer IDs do not conflict',()=>{
 const t=truth(observation('source',[{...monthly,id:'plan-a'},{...yearly,id:'plan-b'}]));
 assert.equal(t.prices.US.established,true);
 assert.equal(t.prices.US.id,'plan-a');
});
test('M separation C: different markets do not conflict',()=>{
 const t=truth(observation('source',[monthly,{...yearly,market:'CA',currency:'CAD'}]));
 assert.equal(t.prices.US.established,true);
 assert.notEqual(t.prices.US.propositions.MONTHLY_SUBSCRIPTION.state,'CONTRADICTED');
});
test('M separation D: source-declared different effective scopes are not simultaneous claims',()=>{
 const t=truth(observation('older',[{...yearly,conditions:'effective through 2025'}]),observation('newer',[{...monthly,conditions:'effective from 2026'}]));
 assert.equal(t.prices.US.established,true);
 assert.notEqual(t.prices.US.propositions.MONTHLY_SUBSCRIPTION.state,'CONTRADICTED');
});
test('M separation D: conflicting observations without an effective-time relation stay unresolved',()=>{
 const t=truth(observation('older',[yearly]),observation('newer',[monthly]));
 assert.equal(t.prices.US.established,false);
 assert.equal(t.prices.US.propositions.MONTHLY_SUBSCRIPTION.state,'UNRESOLVED');
});
test('M separation D: a shared audience condition does not prove simultaneous effective time',()=>{
 const t=truth(observation('older',[{...yearly,conditions:'student'}]),observation('newer',[{...monthly,conditions:'student'}]));
 assert.equal(t.prices.US.established,false);
 assert.equal(t.prices.US.propositions.MONTHLY_SUBSCRIPTION.state,'UNRESOLVED');
});
test('M separation E: unknown payment cadence does not veto a monthly claim',()=>{
 const t=truth(observation('source',[monthly,{...monthly,billingCadence:'UNKNOWN'}]));
 assert.equal(t.prices.US.established,true);
 assert.equal(t.prices.US.propositions.MONTHLY_SUBSCRIPTION.state,'ESTABLISHED');
});
test('M separation F: duplicate monthly evidence is compatible',()=>{
 const t=truth(observation('first',[monthly]),observation('second',[monthly]));
 assert.equal(t.prices.US.established,true);
 assert.equal(t.prices.US.propositions.MONTHLY_SUBSCRIPTION.state,'ESTABLISHED');
});
test('M separation G: equal names and amounts without identity do not create a conflict',()=>{
 const {id,...noId}=monthly;
 const t=truth(observation('source',[noId,{...noId,billingCadence:'YEARLY'}]));
 assert.equal(t.prices.US.established,true);
 assert.equal(t.offers.length,2);
});
test('M separation H: annual monthly-equivalent display is not a positive monthly payment',()=>{
 const t=truth(observation('source',[{...yearly,amount:8,cadence:'MONTHLY',amountDerivation:'ARITHMETIC'}]));
 assert.equal(t.prices.US.established,false);
 assert.equal(t.eligibility.US.result,'UNRESOLVED');
});
test('M cross-sensor: an exact SKU conflicts across DIRECT and verified-country observations',()=>{
 const scope='effective 2026 price list';
 const t=truth(observation('direct',[{...monthly,conditions:scope}]),observation('country',[{...yearly,conditions:scope}],{transport:'DECODO'}));
 assert.equal(t.prices.US.established,false);
 assert.equal(t.prices.US.propositions.MONTHLY_SUBSCRIPTION.state,'CONTRADICTED');
 assert.equal(t.eligibility.US.result,'UNRESOLVED');
});
test('M cross-sensor: names and amounts without an ID do not create identity',()=>{
 const {id,...noId}=monthly;
 const t=truth(observation('direct',[noId]),observation('country',[{...noId,billingCadence:'YEARLY'}],{transport:'DECODO'}));
 assert.equal(t.prices.US.established,true);
 assert.equal(t.offers.length,2);
});
