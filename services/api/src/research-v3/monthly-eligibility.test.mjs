import test from 'node:test';
import assert from 'node:assert/strict';
import {createKnowledge,digest,context,checkpoint,restore} from './model.mjs';
import {evaluate} from './truth.mjs';
import {runResearch} from './engine.mjs';
import {fixtureInput,wireCompletion} from './evidence-fixtures.test-support.mjs';
import {runTarget,offlineCapabilities} from './runner.mjs';
import {createLiveSemanticInterpreter} from './live-semantic.mjs';
const objective={kind:'PRICE',serviceId:'club',serviceName:'Aurora',providerHosts:['provider.example'],markets:['US'],seeds:['https://provider.example/']};
function graph(extra={},choice=null){
 const k=createKnowledge({objective}),body=JSON.stringify({serviceId:'club',offers:[{id:'personal',amount:12.99,currency:'USD',cadence:'MONTHLY',billingCadence:'UNKNOWN',consumer:true,relationship:'SUBSCRIPTION',role:'ORDINARY',amountDerivation:'EXPLICIT',...extra}],...(choice?{subscriptionChoices:[choice]}:{})});
 k.observations.push({id:'source',kind:'PROVIDER',url:objective.seeds[0],body,sha256:digest(body),outcome:'OK',httpStatus:200,context:context('DECODO','US'),transport:{requestedCountry:'US',verifiedCountry:'US',verification:'BRACKET_VERIFIED'},candidates:[{kind:'SERVICE',pointer:''},{kind:'OFFER',pointer:'/offers/0'}]});return k;
}
for(const [name,offer,state,price] of [
 ['A ordinary monthly',{billingCadence:'MONTHLY'},'MONTHLY_SUBSCRIPTION_ESTABLISHED',true],
 ['B annual payment monthly display',{billingCadence:'YEARLY'},'MONTHLY_SUBSCRIPTION_UNRESOLVED',false],
 ['C annual commitment unknown payment',{commitment:'one-year'},'MONTHLY_SUBSCRIPTION_UNRESOLVED',false],
 ['D monthly payment annual commitment',{billingCadence:'MONTHLY',commitment:'12 months'},'MONTHLY_SUBSCRIPTION_ESTABLISHED',true],
 ['E annual amount monthly payment',{billingCadence:'MONTHLY',cadence:'YEARLY',amount:119.88},'MONTHLY_SUBSCRIPTION_ESTABLISHED',false],
 ['I single annual observation',{billingCadence:'YEARLY',cadence:'YEARLY'},'MONTHLY_SUBSCRIPTION_UNRESOLVED',false],
 ['equivalent cannot be substituted',{billingCadence:'MONTHLY',amountDerivation:'ARITHMETIC'},'MONTHLY_SUBSCRIPTION_ESTABLISHED',false]
])test(name,()=>{const t=evaluate(graph(offer));assert.equal(t.eligibility.US.state,state);assert.equal(t.established,price);assert.equal(evaluate(restore(checkpoint(graph(offer)))).established,price);});
for(const basis of ['COMPLETE','EXPLICIT_NO_MONTHLY'])test('H authoritative annual-only '+basis,async()=>{
 const k=graph({billingCadence:'YEARLY'},{monthlyOffered:false,scope:'SERVICE',basis,market:'US'}),t=evaluate(k);assert.equal(t.eligibility.US.result,'INELIGIBLE');assert.equal(t.established,false);const r=await runResearch({knowledge:k,capabilities:{DIRECT(){assert.fail('ineligible must stop');}}});assert.equal(r.stop.reason,'MONTHLY_SUBSCRIPTION_NOT_OFFERED');assert.equal(r.usage.actions,0);
});
for(const basis of ['PARTIAL','UNKNOWN',undefined])test('partial/no completeness is not negative '+basis,()=>assert.equal(evaluate(graph({}, {monthlyOffered:false,scope:'SERVICE',basis,market:'US'})).eligibility.US.result,'UNRESOLVED'));
test('conflicting monthly and annual-only evidence is unresolved, not silently rejected/eligible',()=>{const t=evaluate(graph({billingCadence:'MONTHLY'},{monthlyOffered:false,scope:'SERVICE',basis:'COMPLETE',market:'US'}));assert.equal(t.eligibility.US.result,'UNRESOLVED');assert.equal(t.eligibility.US.conflicting,true);assert.equal(t.established,false);});
for(const signal of ['workingModel','score','confidence','url','query','anchor','snippet','sitemap','locale','currency','hypothesis','plannerBelief'])test('research/eligibility firewall '+signal,()=>{const k=graph();k[signal]={monthlyOffered:true,confidence:1,billingCadence:'MONTHLY'};k.objective.description='Monthly state with a 99% confidence';assert.equal(evaluate(k).eligibility.US.result,'UNRESOLVED');assert.equal(evaluate(k).established,false);});
test('DIRECT cannot establish market from billing, currency or language',()=>{const k=graph({billingCadence:'MONTHLY'});k.observations[0].context=context('DIRECT');assert.equal(evaluate(k).eligibility.US.result,'UNRESOLVED');});
async function sourceRun(text,{billing='UNKNOWN',display='MONTHLY',commitment=null,choiceSet='UNKNOWN',scope='UNKNOWN',choiceCadences=[],priceKind='CHARGE',intro=false,mutate=(w)=>w}={}){
 const f={name:'Aurora',language:'varied',market:'US',html:'<main><section><h2>Personal</h2><p>'+text+'</p></section></main>',plans:[{name:'Personal',anchor:text.slice(0,12),charges:[{id:'ordinary',money:{amount:12.99,amountText:'12.99',currency:'USD',currencyText:'USD'},cadence:{unit:display,expression:null},role:'ORDINARY',derivation:'EXPLICIT',duration:null,qualifiers:[],ambiguity:false}]}]};
 const input={...fixtureInput(f,{bounds:{actions:1,modelCalls:1}}),semantic:{mode:'LIVE'}};
 const interpret=await createLiveSemanticInterpreter({env:{SAVLIVO_V3_SEMANTIC_MODEL:'offline',GROQ_API_KEY:'offline'},client:{chat:{completions:{create:async payload=>{const r=JSON.parse(payload.messages[1].content),w=wireCompletion(r,f),c=w.charges[0];w.offers[0].availability={scope,choiceSet,cadences:choiceCadences,sources:c.sources,...(text.includes('Both monthly and yearly payment options are available')?{payment:{kind:'ACTUAL_PAYMENT',text:'Both monthly and yearly payment options are available',sources:c.sources}}:{})};c.cadenceSources=c.sources;c.cadenceKind='RECURRENCE';if(text==='個人向け定期購読。USD 12.99。毎月お支払い、契約期間は１２か月。')c.payment={kind:'ACTUAL_PAYMENT',text:'毎月お支払い',sources:c.sources};
 c.temporal={billingCadence:billing,billingSources:billing==='UNKNOWN'?[]:c.sources,commitmentText:commitment,commitmentSources:commitment?c.sources:[],priceKind};return {choices:[{finish_reason:'stop',message:{content:JSON.stringify(mutate(w,r))}}]};}}}}});
 return runTarget({input,interpret,capabilities:offlineCapabilities(input)});
}
for(const [text,opts,result] of [
 ['For individuals: subscription USD 12.99 per month, billed monthly.',{billing:'MONTHLY'},'ELIGIBLE'],
 ['For individuals: subscription USD 12.99 per month, billed annually.',{billing:'YEARLY',priceKind:'EQUIVALENT'},'UNRESOLVED'],
 ['For individuals: subscription USD 12.99 per month, one-year commitment.',{commitment:'one-year commitment'},'UNRESOLVED'],
 ['For individuals: subscription USD 12.99 charged monthly, 12-month commitment.',{billing:'MONTHLY',commitment:'12-month commitment'},'ELIGIBLE'],
 ['For individuals: only yearly subscription is available, USD 12.99 per year.',{billing:'YEARLY',display:'YEARLY',scope:'SERVICE',choiceSet:'COMPLETE',choiceCadences:['YEARLY']},'INELIGIBLE'],
 ['個人向け定期購読。USD 12.99。毎月お支払い、契約期間は１２か月。',{billing:'MONTHLY',commitment:'契約期間は１２か月'},'ELIGIBLE'],
 ['Abonnement personnel USD 12.99 par mois, facturation annuelle.',{billing:'YEARLY',priceKind:'EQUIVALENT'},'UNRESOLVED']
])test('source wire / independently represented temporal facets '+text,async()=>{const r=await sourceRun(text,opts);assert.equal(r.result.truth.eligibility.US.result,result);const c=r.knowledge.observations[0].evidence?.envelope.offers[0].charges[0];assert.ok(c?.temporal);if(opts.commitment)assert.equal(c.temporal.commitmentText,opts.commitment);});
test('source monthly display alone is not monthly subscription',async()=>assert.equal((await sourceRun('For individuals: subscription USD 12.99 / month.')).result.truth.eligibility.US.result,'UNRESOLVED'));

for(const reference of ['p0','n-forged-0','s999','foreign-observation-segment'])test('billing typed reference firewall '+reference,async()=>{const r=await sourceRun('Consumer subscription USD 12.99 / month. Billed monthly.',{billing:'MONTHLY',mutate:w=>{w.charges[0].temporal.billingSources=[reference];return w;}});assert.equal(r.result.truth.eligibility.US.result,'UNRESOLVED');assert.ok(r.knowledge.observations[0].semanticAttempts.some(a=>a.status==='FAILED'));});
for(const text of ['USD 12.99 / month','USD 12.99 per month'])test('model cannot promote an isolated display fragment to payment '+text,async()=>{const r=await sourceRun(text,{billing:'MONTHLY'});assert.equal(r.result.truth.eligibility.US.result,'UNRESOLVED');assert.ok(r.knowledge.observations[0].interpretation.rejected.some(p=>p.reason==='BILLING_SUPPORT_INVALID'));});
test('forged commitment text is discarded without inventing annual payment',async()=>{const r=await sourceRun('Consumer subscription USD 12.99 / month. Billed monthly.',{billing:'MONTHLY',commitment:'year-long commitment'});assert.equal(r.result.truth.eligibility.US.result,'ELIGIBLE');assert.ok(r.knowledge.observations[0].interpretation.rejected.some(p=>p.reason==='COMMITMENT_SUPPORT_INVALID'));});
test('no billing reference remains unresolved even with model certainty',async()=>{const r=await sourceRun('Consumer subscription USD 12.99 / month.',{billing:'MONTHLY',mutate:w=>{w.charges[0].temporal.billingSources=[];return w;}});r.knowledge.workingModel={confidence:0.99,hypothesis:'monthly'};assert.equal(evaluate(r.knowledge).eligibility.US.result,'UNRESOLVED');});
test('market-specific service admission cannot use monthly billing from another market',()=>{
 const k=graph({billingCadence:'MONTHLY',market:'CA'}),source=JSON.parse(k.observations[0].body);source.population={scope:'SERVICE_TOTAL',measure:'MEMBERS',count:100000,kind:'EXACT'};source.account={login:true,manageMembership:true};k.observations[0].body=JSON.stringify(source);k.observations[0].sha256=digest(k.observations[0].body);
 const t=evaluate(k);assert.equal(t.service.CONSUMER_MONTHLY_SUBSCRIPTION_EXISTS.state,'ESTABLISHED');assert.equal(t.eligibility.US.result,'UNRESOLVED');assert.equal(t.admitted,false);
});
test('billing cadence borrowed from a different source-bound offer is not admitted',async()=>{
 const r=await sourceRun('Personal subscription USD 12.99 per year.</p></section><section><h2>Other</h2><p>Another plan USD 5.00 billed monthly.',{display:'YEARLY',billing:'MONTHLY',mutate:(w,input)=>{w.charges[0].temporal.billingSources=[input.segments.find(s=>s.text.includes('Another plan')).id];return w;}});assert.equal(r.result.truth.eligibility.US.result,'UNRESOLVED');assert.ok(r.knowledge.observations[0].interpretation.rejected.some(p=>p.reason==='BILLING_SUPPORT_INVALID'));
});
test('commitment belonging to another plan cannot create annual billing or alter the monthly charge',async()=>{
 const r=await sourceRun('Personal subscription USD 12.99 per month. Billed monthly.</p></section><section><h2>Other</h2><p>Another plan with twelve-year commitment.',{billing:'MONTHLY',mutate:(w,input)=>{w.charges[0].temporal.commitmentText='twelve-year commitment';w.charges[0].temporal.commitmentSources=[input.segments.find(s=>s.text.includes('Another plan')).id];return w;}});assert.equal(r.result.truth.eligibility.US.result,'ELIGIBLE');assert.ok(r.knowledge.observations[0].interpretation.rejected.some(p=>p.reason==='COMMITMENT_SUPPORT_INVALID'));
});
for(const role of ['INTRODUCTORY','TRIAL','DISCOUNT'])test('temporary monthly charge alone does not establish an actual ordinary monthly subscription '+role,()=>{const t=evaluate(graph({billingCadence:'MONTHLY',role}));assert.equal(t.eligibility.US.result,'UNRESOLVED');assert.equal(t.established,false);});
test('source-expressed monthly payment choice can establish eligibility before the charge amount',()=>{const t=evaluate(graph({amount:null,billingCadence:'UNKNOWN',cadence:'UNKNOWN',role:'UNKNOWN'},{monthlyOffered:true,scope:'PLAN',basis:'PARTIAL',market:'US'}));assert.equal(t.eligibility.US.result,'ELIGIBLE');assert.equal(t.established,false);assert.equal(t.prices.US.propositions.PRICE_AMOUNT.state,'UNRESOLVED');});
test('payment choice evidence establishes eligibility but cannot borrow the displayed annual-state amount',async()=>{const r=await sourceRun('Consumer subscription USD 12.99 per year. Both monthly and yearly payment options are available; the monthly charge is not stated.',{display:'YEARLY',scope:'SERVICE',choiceSet:'PARTIAL',choiceCadences:['MONTHLY','YEARLY']});assert.equal(r.result.truth.eligibility.US.result,'ELIGIBLE');assert.equal(r.result.truth.established,false);assert.equal(r.result.truth.prices.US.propositions.PRICE_AMOUNT.state,'UNRESOLVED');});
