import test from 'node:test';
import assert from 'node:assert/strict';
import {extract,grade,hash,monetary} from './extract.mjs';
import {namedPriceProse,proseBounds} from './named-price-prose.mjs';
import {deriveEvidence,verifyCandidate} from '../verification/gate.mjs';
import {selectMonthlyPlans} from './commercial.mjs';
const paragraph=t=>'<p>'+t+'</p>';
function run(body,{authority=true,geo=true}={}){
 const bodyHash=hash(body),sourceUrl='https://provider.example/plans';
 const context={bodyHash,service:'fixture',market:'DE',authority,sourceOccurrences:[{id:'source',url:sourceUrl}],geoEvidence:geo?[{classification:'G1',targetCountry:'DE',geoCountry:'DE',bodyHash}]:[]};
 const derived=deriveEvidence(body,context),receipt={intact:true,bodyHash,service:'fixture',serviceEstablished:authority,bindingEstablished:true};
 return {derived,rows:derived.rows,decisions:derived.rows.map(c=>verifyCandidate({...c,sourceUrl},derived,receipt)),receipt};
}
test('coordinated parenthetical plans retain independent source spans through normal verification',()=>{
 const text='10 €/month (Plan A) and 20 €/month (Plan B)',body=paragraph(text),r=run(body);
 assert.deepEqual(r.rows.map(c=>[c.product,c.amountNormalized,c.currency,c.billingPeriod]),[['Plan A','10','EUR','MONTH'],['Plan B','20','EUR','MONTH']]);
 for(const c of r.rows){const p=c.prosePriceRelationship;assert.equal(p.bodyHash,hash(body));assert.equal(text.slice(...p.relationship.planSpan),c.product);assert.equal(monetary(text.slice(...p.relationship.amountSpan))[0].amount,c.amountNormalized);assert.equal(c.ownershipAmbiguous,false);assert.equal(c.verificationLevel,4);}
 assert(r.decisions.every(d=>d.status==='V2_VERIFIED'));assert.equal(selectMonthlyPlans(r.rows).length,2);
});
test('intro total and renewal stay separate, including source-backed relationship',()=>{
 const r=run(paragraph('Plan A for 3 months total 10 €, then 15 €/month'));
 assert.deepEqual(r.rows.map(c=>[c.product,c.amountNormalized,c.prosePriceRelationship.relationship.phase,c.billingPeriod,c.commercial.type]),[['Plan A','10','INTRO',null,'INTRO_PROMOTION'],['Plan A','15','RENEWAL','MONTH','RECURRING_MONTHLY']]);
 assert.equal(r.decisions[0].status,'V2_VERIFICATION_BLOCKED');assert.equal(r.decisions[1].status,'V2_VERIFIED');
 assert.deepEqual(r.rows[1].prosePriceRelationship.relationship.previousPhase.duration,{value:3,unit:'MONTH'});
});
test('two introductory totals and renewals never borrow the other plan',()=>{
 const r=run(paragraph('Plan A for 3 months total 10 €, then 15 €/month; Plan B for 2 months total 20 €, then 25 €/month'));
 assert.deepEqual(r.rows.map(c=>[c.product,c.amountNormalized,c.commercial.type]),[['Plan A','10','INTRO_PROMOTION'],['Plan A','15','RECURRING_MONTHLY'],['Plan B','20','INTRO_PROMOTION'],['Plan B','25','RECURRING_MONTHLY']]);
 assert.deepEqual(r.decisions.map(d=>d.status),['V2_VERIFICATION_BLOCKED','V2_VERIFIED','V2_VERIFICATION_BLOCKED','V2_VERIFIED']);
});
for(const text of ['after the introductory period, Plan A renews at 10 €/month and Plan B at 20 €/month','Nach Ablauf der ersten 3 Monate verlängert sich die Mitgliedschaft automatisch um jeweils 1 Monat zu 11,99 €/Monat (Basic) bzw. 21,99 €/Monat (Plus), sofern sie nicht zuvor gekündigt wurde.'])test('bounded localized renewal declaration: '+text,()=>{
 const r=run(paragraph(text));assert.equal(r.rows.length,2);assert(r.rows.every(c=>c.prosePriceRelationship.relationship.phase==='RENEWAL'));assert(r.rows.every(c=>c.currency==='EUR'));assert(r.decisions.every(d=>d.status==='V2_VERIFIED'));
});
test('included zero and separate product cannot contaminate the paid plan',()=>{
 const r=run(paragraph('Plan B renews at 20 €/month; Plan B is included with Plan C at 0 €/month; Membership D sold separately at 39 €/month'));
 assert.deepEqual(r.rows.map(c=>[c.product,c.amountNormalized]),[['Plan B','20'],['Plan B','0'],['Membership D','39']]);
 assert.equal(r.rows[1].prosePriceRelationship.relationship.includedWith,'Plan C');assert.equal(r.rows[1].commercial.type,'OTHER_MONETARY_OFFER');
 assert.deepEqual(r.decisions.map(d=>d.status),['V2_VERIFIED','V2_VERIFICATION_BLOCKED','V2_VERIFIED']);assert(r.rows[1].commercial.reasons.includes('NON_POSITIVE_RECURRING_PROVIDER_PRICE'));
});
test('supported embedded text yields relationships but not active/verified offers',()=>{
 const text='10 €/month (Plan A) and 20 €/month (Plan B)',body='<script type="application/json">'+JSON.stringify({props:{legalDisclaimer:text,unrelated:text}})+'</script>',r=run(body);
 assert.equal(r.rows.length,2);assert(r.rows.every(c=>c.structuredPath.endsWith('/props/legalDisclaimer')));assert(r.rows.every(c=>c.prosePriceRelationship&&c.ownershipAmbiguous&&c.qualifier.includes('EMBEDDED_OFFER_ACTIVATION_UNRESOLVED')));assert(r.decisions.every(d=>d.status==='V2_VERIFICATION_BLOCKED'));
});
for(const text of ['10 €/month (Plan A or Plan B)','10 €/month (Plan A) (Plan B)','10 €/month (After Trial)','Plan A or Plan B at 10 €/month','Only 10 €/month'])test('ambiguous/contextual label does not gain prose ownership: '+text,()=>{
 const rows=extract(paragraph(text)).candidates;assert(rows.length);assert(rows.every(c=>!c.prosePriceRelationship));assert(rows.every(c=>grade(c,{authority:true,marketBound:true}).verificationLevel<3));
});
test('same named offer conflicting ordinary prices remains blocked',()=>{
 const r=run(paragraph('10 €/month (Plan A) and 20 €/month (Plan A)'));assert(r.decisions.every(d=>d.status==='V2_VERIFICATION_BLOCKED'));assert(r.rows.every(c=>c.blockingReasons.includes('MULTIPLE_CONFLICTING_FACTS')));
});
test('unknown cadence, missing currency, missing market and authority are not inferred',()=>{
 assert.equal(namedPriceProse('10/month (Plan A)',{monetary}).length,0);assert.equal(namedPriceProse('10 € (Plan A)',{monetary}).length,0);
 for(const options of [{geo:false},{authority:false}])assert(run(paragraph('10 €/month (Plan A)'),options).decisions.every(d=>d.status==='V2_VERIFICATION_BLOCKED'));
});
test('trailing annual qualification is preserved rather than split off',()=>{
 const r=run(paragraph('10 €/month (Plan A) and billed annually'));assert.equal(r.rows[0].commercial.type,'ANNUAL_RECURRING');assert.equal(r.decisions[0].status,'V2_VERIFICATION_BLOCKED');
});
test('normal single-price card still verifies and zero still does not',()=>{
 for(const amount of ['12','0']){const r=run('<article><h2>Basic</h2><p>EUR '+amount+'/month</p></article>');assert.equal(r.decisions[0].status,amount==='12'?'V2_VERIFIED':'V2_VERIFICATION_BLOCKED');assert.equal(r.rows[0].amountNormalized,amount);}
});
test('forged extractor identity cannot bypass source re-derivation',()=>{
 const r=run(paragraph('10 €/month (Plan A)'));const claim={...r.rows[0],product:'Plan B',plan:'Plan B'};assert.equal(verifyCandidate(claim,r.derived,r.receipt).status,'V2_VERIFICATION_BLOCKED');
 assert.throws(()=>deriveEvidence('<p>changed</p>',{bodyHash:r.receipt.bodyHash}),/PROVENANCE_INTEGRITY_FAILURE/);
});
test('text and embedded traversal bounds are explicit; oversized text stays outside new parser',()=>{
 assert.equal(namedPriceProse('x'.repeat(proseBounds.text+1),{monetary}).length,0);
 const objects=Array.from({length:100},(_,i)=>({description:`10 €/month (Plan ${i})`}));const r=extract('<script type="application/json">'+JSON.stringify(objects)+'</script>');assert.equal(r.candidates.length,proseBounds.jsonFields);
});
test('struck-through named price remains reference evidence',()=>{
 const r=run('<del>10 €/month (Plan A)</del>');assert.equal(r.rows[0].commercial.type,'OTHER_MONETARY_OFFER');assert.equal(r.decisions[0].status,'V2_VERIFICATION_BLOCKED');
});
test('hidden text does not gain named-prose ownership',()=>{
 for(const attrs of ['hidden','aria-hidden="true"','style="display:none"']){const cs=extract('<div '+attrs+'><p>10 €/month (Plan A)</p></div>').candidates;assert(cs.every(c=>!c.prosePriceRelationship));}
});
test('a renewal label alone does not reconcile conflicting ordinary prices',()=>{
 const r=run(paragraph('Plan A at 10 €/month and Plan A renews at 20 €/month'));assert(r.decisions.every(d=>d.status==='V2_VERIFICATION_BLOCKED'));assert(r.rows.every(c=>c.blockingReasons.includes('MULTIPLE_CONFLICTING_FACTS')));
});
test('unrecognized renewal prefix does not hide a negative qualification',()=>{
 const cs=extract(paragraph('after the trial, Does Not Renew 10 €/month (Plan A)')).candidates;assert(cs.every(c=>!c.prosePriceRelationship));
});
for(const text of ['Plan A first 3 months for 10 € total, then 15 €/month','Plan A für 3 Monate zum Gesamtpreis von 10 €; Plan B für 3 Monate zum Gesamtpreis von 20 €'])test('introductory total wording cannot become recurring: '+text,()=>{
 const r=run(paragraph(text));const intro=r.rows.filter(c=>c.prosePriceRelationship.relationship.phase==='INTRO');assert(intro.length);assert(intro.every(c=>c.billingPeriod===null&&c.commercial.type==='INTRO_PROMOTION'));
});
test('a transition to a different plan cannot borrow the preceding introductory phase',()=>{
 const r=extract(paragraph('Plan A for 3 months total 10 €, then Plan B at 20 €/month'));
 assert.equal(r.candidates[0].prosePriceRelationship.relationship.plan,'Plan A');assert.equal(r.candidates[1].prosePriceRelationship,undefined);
});
