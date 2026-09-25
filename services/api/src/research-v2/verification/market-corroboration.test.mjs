import test from 'node:test';
import assert from 'node:assert/strict';
import {compoundFixture} from './compound-market.fixture.mjs';
const renewal='After the first 3 months the membership renews monthly at 11.99 EUR/month (Plan Basic) or 21.99 EUR/month (Plan Plus) unless cancelled.';
function regional(market,locale,{purchase=true,cms=true,app=true,extraHTML='',restriction='',change=null}={}){
 return compoundFixture({market,sourceUrl:`https://provider.example/${locale}/plans`,extraHTML,restriction,text:(purchase?`Plan Basic and Plan Plus can be purchased through provider.example/${locale}. `:'')+renewal.replaceAll('EUR',({JP:'JPY',GB:'GBP'})[market]??'EUR'),change:p=>{p.locale=locale;p.page.sys.locale=locale;if(!cms)delete p.page.sys.locale;if(!app)delete p.locale;change?.(p);}});
}
const billing=(locale,plan='Plan Basic',disabled=false)=>`<form action="/${locale}/checkout"><input type="hidden" name="plan" value="${plan}"><select name="billingCountry"><option value="${locale.split('-')[1]}"${disabled?' disabled':''}>Country</option></select></form>`;
test('French commercial purchase proof does not require duplicated CMS locale',()=>{
 const r=regional('FR','fr-FR',{cms:false});assert.equal(r.decisions.length,2);assert(r.decisions.every(d=>d.status==='V2_VERIFIED'));
});
test('Japanese owned storefront and exact-plan billing context replace legal purchase URL',()=>{
 const r=regional('JP','ja-JP',{purchase:false,extraHTML:billing('ja-JP')});assert.equal(r.decisions.find(d=>d.plan==='Plan Basic').status,'V2_VERIFIED');assert.equal(r.decisions.find(d=>d.plan==='Plan Plus').fields.market.status,'BLOCKED');
});
test('UK CMS regional commercial purchase proof does not require application locale duplicate',()=>{
 const r=regional('GB','en-GB',{app:false});assert(r.decisions.every(d=>d.status==='V2_VERIFIED'));
});
import {corroborateMarket} from './market-corroboration.mjs';
for(const [market,locale,country] of [['FR','fr-FR','France'],['JP','ja-JP','Japan'],['GB','en-GB','United Kingdom']]){
 test(`${market}: correlated localization and coherent price alone stay unresolved`,()=>{
  const r=regional(market,locale,{purchase:false,change:p=>{p.language=locale;p.fallback={microCopy:{country},picker:{countries:[market,'US']}};}});
  assert.equal(r.decisions.length,2);assert(r.decisions.every(d=>d.fields.market.status==='BLOCKED'));
  const proof=r.d.rows.find(c=>c.product==='Plan Basic').attribution.marketProof;
  assert.equal(proof.evidence[0].corroboration.status,'INSUFFICIENT_POSITIVE_EVIDENCE');
 });
 for(const restriction of ['Plan Basic US only.','Plan Basic is available only to residents of the United States.','Plan Basic requires a United States billing address.',`Plan Basic is not available in ${country}.`])test(`${market}: corroboration defeated by ${restriction}`,()=>{
  const r=regional(market,locale,{cms:false,restriction});assert.equal(r.decisions.find(d=>d.plan==='Plan Basic').fields.market.status,'BLOCKED');assert.equal(r.decisions.find(d=>d.plan==='Plan Plus').status,'V2_VERIFIED');
 });
 test(`${market}: explicit checkout rejection defeats legal purchase corroboration`,()=>{
  const r=regional(market,locale,{extraHTML:billing(locale,'Plan Basic',true)});assert.equal(r.decisions.find(d=>d.plan==='Plan Basic').fields.market.status,'BLOCKED');assert.equal(r.d.rows.find(c=>c.product==='Plan Basic').attribution.marketProof.status,'MARKET_CONTRADICTED');
 });
 test(`${market}: structured foreign offer scope still wins`,()=>{
  const r=regional(market,locale,{change:p=>p.page.fields.content.fields.legalText[0].fields.variations[0].fields.country='US'});assert.equal(r.decisions.length,2);assert(r.decisions.every(d=>d.fields.market.status==='BLOCKED'));
 });
}
test('proof explains dependency roots and semantic threshold',()=>{
 const r=regional('FR','fr-FR',{cms:false}),proof=r.d.rows.find(c=>c.product==='Plan Basic').attribution.marketProof.evidence[0].corroboration;
 assert.equal(proof.version,'OFFER_MARKET_CORROBORATION_V1');assert.equal(proof.status,'ESTABLISHED');
 assert(proof.dependencyGroups.some(g=>g.dimensions.includes('FINAL_ROUTE_CONTEXT')&&g.dimensions.includes('ACTIVE_PROVIDER_MARKET_STATE')&&g.dimensions.includes('REGIONAL_COMMERCIAL_SURFACE')));
 assert(proof.contributingDimensions.includes('OFFER_BOUND_PURCHASE_CONTEXT'));assert(proof.supportingOnly.includes('ACTIVE_PROVIDER_MARKET_STATE'));
});
test('semantic threshold cannot be met by duplicated weak observations',()=>{
 const observations=Array.from({length:50},(_,i)=>({dimension:i%2?'ACTIVE_PROVIDER_MARKET_STATE':'FINAL_ROUTE_CONTEXT',strength:'SUPPORTING',dependency:'same-localization'}));assert.equal(corroborateMarket(observations).status,'INSUFFICIENT_POSITIVE_EVIDENCE');
});
test('same-root strong observations cannot masquerade as independent commerce',()=>{
 const observations=['EXACT_OFFER_OWNERSHIP','REGIONAL_COMMERCIAL_SURFACE','OFFER_BOUND_PURCHASE_CONTEXT'].map(dimension=>({dimension,strength:'STRONG',dependency:'same-fact'}));assert.equal(corroborateMarket(observations).status,'INSUFFICIENT_POSITIVE_EVIDENCE');
});
test('existing exact structured country proof does not require purchase corroboration',()=>{
 const r=regional('FR','fr-FR',{purchase:false,change:p=>p.page.fields.content.fields.legalText[0].fields.variations[0].fields.country='FR'});assert.equal(r.decisions.length,2);assert(r.decisions.every(d=>d.status==='V2_VERIFIED'));
});
for(const [label,html] of [
 ['unrelated offer',billing('ja-JP','Other Plan')],['foreign action',billing('ja-JP').replace('/ja-JP/checkout','https://other.example/ja-JP/checkout')],['foreign regional action',billing('ja-JP').replace('/ja-JP/checkout','/en-US/checkout')],['hidden form',billing('ja-JP').replace('<form ','<form hidden ')],['support control',billing('ja-JP').replace('billingCountry','supportCountry')],['locale picker',billing('ja-JP').replace('billingCountry','locale')],['disabled control',billing('ja-JP').replace('<select ','<select disabled ')],['ambiguous plans',billing('ja-JP').replace('<select','<input name="plan" value="Other Plan"><select')]
])test('checkout cannot borrow '+label,()=>{
 const r=regional('JP','ja-JP',{purchase:false,extraHTML:html});assert.equal(r.decisions.length,2);assert(r.decisions.every(d=>d.fields.market.status==='BLOCKED'));
});
test('unrelated support, foreign catalog, picker and another price cannot defeat target',()=>{
 const r=regional('GB','en-GB',{app:false,restriction:'US support is available by phone. US customers receive phone support. Prices shown in US dollars elsewhere.',change:p=>{p.fallback={picker:{countries:['US','GB']},microCopy:{country:'United States'},prices:{'en-US':{name:'Other Plan',price:49,priceCurrency:'USD',country:'US',description:'Other Plan US only.'}}};}});assert.equal(r.decisions.length,2);assert(r.decisions.every(d=>d.status==='V2_VERIFIED'));
});
import {verifyCandidate} from './gate.mjs';
test('repeated owned offers retain an exact prose witness per occurrence',()=>{
 const r=regional('FR','fr-FR',{cms:false,change:p=>{const a=p.page.fields.content.fields.legalText;a.push(structuredClone(a[0]));}});
 const rows=r.d.rows.filter(c=>c.product==='Plan Basic'&&c.commercial.type==='RECURRING_MONTHLY');assert.equal(rows.length,2);
 const claim={...rows[0],discoveryOccurrences:rows.map(c=>({structuredPath:c.structuredPath,prosePriceRelationship:c.prosePriceRelationship}))};
 const receipt=r.context.marketProofResources[0].receipt;
 assert.equal(verifyCandidate(claim,r.d,receipt).status,'V2_VERIFIED');
 const tampered=structuredClone(claim);tampered.discoveryOccurrences[1].prosePriceRelationship.relationship.amountSpan[0]++;
 assert.equal(verifyCandidate(tampered,r.d,receipt).status,'V2_VERIFICATION_BLOCKED');
});
test('inactive checkout fieldset cannot supply billing proof',()=>{
 const form=billing('ja-JP').replace('<select','<fieldset disabled><select').replace('</select>','</select></fieldset>');
 const r=regional('JP','ja-JP',{purchase:false,extraHTML:form});assert.equal(r.decisions.length,2);assert(r.decisions.every(d=>d.fields.market.status==='BLOCKED'));
});
test('checkout scan bound cannot hide a later exact-offer rejection',()=>{
 const forms=Array.from({length:16},()=>'<form action="/fr-FR/checkout"></form>').join('')+billing('fr-FR','Plan Basic',true);
 const r=regional('FR','fr-FR',{extraHTML:forms});assert.equal(r.decisions.find(d=>d.plan==='Plan Basic').fields.market.status,'BLOCKED');
});
