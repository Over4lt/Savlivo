import test from 'node:test';
import assert from 'node:assert/strict';
import {hash,extract} from './extract.mjs';
import {deriveEvidence,verifyCandidate,verifyIdentity,gateVersion} from '../verification/gate.mjs';
import {reconstructOfferIntelligence,classifyOfferConfidence} from '../intelligence/offer-intelligence.mjs';
import {offerEligibilityVersion} from './price-context-guards.mjs';
const card=(name,text)=>`<article><h2>${name}</h2><p>${text}</p></article>`;
function run(body,{geo=true}={}){
 const bodyHash=hash(body),sourceUrl='https://provider.example/plans';
 const context={bodyHash,service:'fixture',market:'DE',authority:true,sourceOccurrences:[{id:'source',url:sourceUrl}],geoEvidence:geo?[{classification:'G1',targetCountry:'DE',geoCountry:'DE',bodyHash}]:[]};
 const receipt={intact:true,bodyHash,service:'fixture',serviceEstablished:true,bindingEstablished:true};
 const derived=deriveEvidence(body,context);
 return {derived,decisions:derived.rows.map(c=>verifyCandidate({...c,sourceUrl},derived,receipt)),offers:reconstructOfferIntelligence({body,context,receipt,sourceUrl}).offers};
}
for(const label of ['nach Ablauf der Testphase²','After the trial','During the introductory period'])test('temporal qualifier is not product identity: '+label,()=>{
 const body=card(label,'EUR 0/month'),r=run(body);
 assert(extract(body).candidates.length);assert(r.offers.length);
 assert(r.decisions.every(d=>d.fields.plan.status==='BLOCKED'));
 assert(r.offers.every(o=>!o.trustworthy&&o.confidence==='LOW'&&o.blockers.includes('QUALIFIER_NOT_PRODUCT_IDENTITY')));
});
test('generic heading proximity alone is not positive product ownership',()=>{
 const r=run('<div><h2>Some context</h2><p>EUR 12/month</p></div>');
 assert(r.decisions.every(d=>d.fields.ownership.status==='BLOCKED'));
 assert(r.offers.every(o=>o.confidence==='LOW'));
});
test('ambiguous zero in a real product card retains its trial context without ordinary eligibility',()=>{
 const r=run(card('Basic','EUR 0/month</p><p>After the trial'));
 assert(r.offers.length);assert(r.offers.every(o=>o.confidence==='LOW'));
 assert(r.decisions.every(d=>d.fields.ordinaryPriceRole.status==='BLOCKED'));
 assert(r.offers.every(o=>o.blockers.includes('ZERO_COMMERCIAL_PHASE_UNRESOLVED')));
});
for(const value of ['12'])test('bounded real recurring offer remains HIGH and verified: '+value,()=>{
 const r=run(card('Basic',`EUR ${value}/month`));assert(r.decisions.some(d=>d.status==='V2_VERIFIED'));assert(r.offers.some(o=>o.confidence==='HIGH'&&o.amount===value));
});
test('two plans coexist and trial context does not cross cards',()=>{
 const r=run(card('Basic','EUR 6/month')+card('Plus','EUR 12/month')+card('Trial','EUR 0 for 30 days free trial'));
 assert.deepEqual(r.offers.filter(o=>o.confidence==='HIGH').map(o=>o.plan).sort(),['Basic','Plus']);
});
test('qualified unlocalized and nonmonthly offers retain existing eligibility',()=>{
 for(const [text,interval]of [['EUR 120/year','P1Y'],['EUR 4/week subscription','P1W']]){const r=run(card('Basic',text),{geo:false});assert(r.offers.some(o=>o.confidence==='HIGH'&&o.billingInterval.normalized===interval&&o.market===null));}
});
test('existing MEDIUM qualified-price classifier requires no full V2_VERIFIED identity',()=>{
 const o=run(card('Basic','EUR 12/month')).offers[0];const qualified={...o,trustworthy:false,completeCanonicalStatus:'NOT_ADMITTED_AS_COMPLETE_IDENTITY',market:null,marketApplicability:{status:'UNKNOWN'},blockers:['MARKET_SCOPE_UNRESOLVED']};
 assert.equal(classifyOfferConfidence(qualified).confidence,'MEDIUM');
 for(const blocker of ['QUALIFIER_NOT_PRODUCT_IDENTITY','HEADING_PRODUCT_BINDING_UNRESOLVED','ZERO_COMMERCIAL_PHASE_UNRESOLVED'])assert.equal(classifyOfferConfidence({...qualified,blockers:[blocker]}).confidence,'LOW');
});
test('forged extractor product cannot replace independently derived product',()=>{
 const body=card('Basic','EUR 12/month'),bodyHash=hash(body),context={bodyHash,service:'fixture',market:'DE',authority:true},derived=deriveEvidence(body,context),claim={...derived.rows[0],product:'Forged'};
 const d=verifyCandidate(claim,derived,{intact:true,bodyHash,service:'fixture',serviceEstablished:true,bindingEstablished:true});assert.equal(d.fields.plan.status,'BLOCKED');assert.equal(d.fields.ownership.status,'BLOCKED');
});
test('new decisions carry distinct compatibility identity and cannot bless V1 decisions',()=>{
 const r=run(card('Basic','EUR 12/month')),d=r.decisions[0];assert.equal(d.version,'V2_FIELD_VERIFICATION_V5');assert(r.offers.every(o=>o.eligibilityVersion===offerEligibilityVersion));
 const old={...d,version:'V2_FIELD_VERIFICATION_V1'},plan={monthlyPlanId:'m',service:'fixture',market:'DE',plan:'Basic',amounts:[['12','EUR']],candidateIds:[d.candidateId],factIds:[d.factId]};
 assert.equal(verifyIdentity(plan,new Map([[d.candidateId,d]])).status,'V2_VERIFIED');
 const result=verifyIdentity(plan,new Map([[d.candidateId,old]]));assert.equal(result.version,gateVersion);assert.equal(result.status,'V2_VERIFICATION_BLOCKED');assert(result.blockers.includes('INCOMPATIBLE_VERIFICATION_VERSION'));assert.equal(old.version,'V2_FIELD_VERIFICATION_V1');
});

test('legacy derived observations cannot acquire new verifier semantics by relabeling a decision',()=>{const r=run(card('Basic','EUR 12/month')),old={...r.derived};delete old.eligibilityVersion;assert.throws(()=>verifyCandidate(old.rows[0],old,{}),/INCOMPATIBLE_DERIVED_EVIDENCE/);});

import {adjudicateProviderPrice} from '../intelligence/provider-price-adjudication.mjs';
import {prepareCommercialSource} from './commercial.mjs';
test('qualified adjudication independently vetoes old extractor flags for the same unsafe source',()=>{
 const body=card('nach Ablauf der Testphase²','EUR 0/month'),bodyHash=hash(body),r=run(body),c=structuredClone(r.derived.rows[0]);
 c.commercial.reasons=[];c.commercial.monthlyBlockers=[];c.commercial.ordinaryMonthly=true;c.commercial.strongRecurringMonthly=true;c.blockingReasons=[];
 const o=adjudicateProviderPrice(c,r.derived,{intact:true,bodyHash,service:'fixture',serviceEstablished:true,bindingEstablished:true},{body,sourceUrl:'https://provider.example/plans',source:prepareCommercialSource(body,bodyHash)});
 assert(!o.trustworthy);assert.equal(o.offerOwnership.established,false);assert(o.blockers.includes('QUALIFIER_NOT_PRODUCT_IDENTITY'));assert.equal(classifyOfferConfidence(o).confidence,'LOW');
});
test('structured product and explicit declarative card retain zero only as evidence',()=>{
 for(const body of [JSON.stringify({'@type':'Product',name:'Basic',sku:'B',offers:{price:0,priceCurrency:'EUR',billingPeriod:'MONTH',areaServed:'DE'}}),'<div data-testid="plan-card"><span role="heading">Basic</span><p>EUR 0/month</p><a href="/subscribe">Subscribe</a></div>']){const r=run(body);assert(r.offers.length);assert(r.decisions.every(d=>d.status!=='V2_VERIFIED'));assert(r.offers.every(o=>o.confidence==='LOW'));}
});
import {catalogProductPolicy} from '../intelligence/catalog-capabilities.mjs';
import {preserveUserTruth} from '../intelligence/product-model.mjs';
test('blocked pricing preserves research candidacy, manual entry and all pricing strategies',()=>{
 const service={slug:'fixture',disposition:'NEW_INCLUDE'},blocked=run(card('After the trial','EUR 0/month')).offers[0];
 const policy=catalogProductPolicy(service,{confidence:blocked.confidence});assert(policy.researchEligible);assert.equal(policy.catalogEligible,false);assert.equal(policy.providerPriceRequired,false);assert.equal(policy.priceStrategy,'MANUAL_ONLY');assert(policy.manualActualPriceAllowed);
 for(const confidence of ['HIGH','MEDIUM'])assert.equal(catalogProductPolicy(service,{confidence}).priceStrategy,'SUGGESTED_PRICE');
 assert.equal(catalogProductPolicy(service,{confidence:'HIGH',variablePrice:true}).priceStrategy,'USER_PRICE_PREFERRED');
 const user={amount:'17.50',currency:'EUR'};const result=preserveUserTruth(user,run(card('Basic','EUR 12/month')).offers);assert.deepEqual(result.userTruth,user);assert.equal(result.automaticReplacement,false);
});

import {priceContextGuards} from './price-context-guards.mjs';
test('a forged renewal marker cannot bypass a zero-phase ambiguity veto',()=>{const body=card('Basic','EUR 0/month</p><p>After the trial'),r=run(body),c={...r.derived.rows[0],subscriptionSubject:{bodyHash:'wrong'}};assert(priceContextGuards(c,prepareCommercialSource(body,hash(body))).some(g=>g.code==='ZERO_COMMERCIAL_PHASE_UNRESOLVED'));});
test('all normalized zero spellings remain observations but never provider recurring prices',()=>{for(const zero of ['0','0.00']){const r=run(card('Basic',`EUR ${zero}/month`));assert(r.offers.length);assert(r.offers.every(o=>!o.trustworthy&&o.confidence==='LOW'&&o.blockers.includes('NON_POSITIVE_RECURRING_PROVIDER_PRICE')));assert(r.decisions.every(d=>d.status!=='V2_VERIFIED'));for(const confidence of ['HIGH','MEDIUM'])assert.equal(classifyOfferConfidence({...r.offers[0],confidence,trustworthy:true}).confidence,'LOW');}});
test('zero trial, credit and discount context cannot contaminate an independently owned paid plan',()=>{for(const context of ['EUR 0 for 30 days free trial','EUR 0 monthly credit','EUR 0 discount']){const r=run(card('Context',context)+card('Paid','EUR 12.99/month'));assert(r.offers.some(o=>o.amount==='0'));assert(r.offers.filter(o=>o.amount==='0').every(o=>o.confidence==='LOW'));assert(r.offers.some(o=>o.amount==='12.99'&&o.confidence==='HIGH'));}});
test('old 3A derived identity and verifier decisions cannot claim nonzero-domain compatibility',()=>{const r=run(card('Basic','EUR 12/month'));assert.throws(()=>verifyCandidate(r.derived.rows[0],{...r.derived,eligibilityVersion:'SOURCE_BOUND_OFFER_ELIGIBILITY_V1'},{}),/INCOMPATIBLE/);const d={...r.decisions[0],version:'V2_FIELD_VERIFICATION_V2'},plan={monthlyPlanId:'m',service:'fixture',market:'DE',plan:'Basic',amounts:[['12','EUR']],candidateIds:[d.candidateId],factIds:[d.factId]};assert.equal(verifyIdentity(plan,new Map([[d.candidateId,d]])).status,'V2_VERIFICATION_BLOCKED');});
