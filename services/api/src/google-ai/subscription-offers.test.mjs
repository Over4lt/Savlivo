import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeSubscriptionOffers,classifySubscriptionOffer} from './subscription-offers.mjs';

const target=(service,serviceName,market)=>({service,serviceName,market});
const prime=target('prime-video','Prime Video','NO');
const base=(name='Prime Video (Base Plan)',amount=79,sourceUrl='https://www.primevideo.com/no')=>({
 planName:name,amount,ordinaryRecurringPrice:amount,currency:'NOK',paymentCadence:'MONTHLY',
 annualOnly:false,freeTier:false,introPrice:null,billingBasis:'monthly',
 marketEvidence:'Available to customers in Norway',billingProvider:'Amazon',sourceUrl,
 sourceEvidence:`Amazon offers ${name} for ${amount} NOK per month.`
});
const addon=(baseRow=base(),amount=29,sourceUrl='https://amazon.example/ad-free')=>({
 ...baseRow,planName:'Prime Video Ad Free add-on',amount,ordinaryRecurringPrice:amount,sourceUrl,
 compatibleBasePlan:baseRow.planName,billingProvider:'Amazon',
 combinationEvidence:`Amazon bills Prime Video ${baseRow.amount} NOK and ad-free ${amount} NOK together on the same bill for Norway.`,
 sourceEvidence:`Amazon ad-free add-on costs ${amount} NOK per month. Amazon bills Prime Video ${baseRow.amount} NOK and ad-free ${amount} NOK together on the same bill for Norway.`
});
const inspect=(rows,market=prime,citations=rows.map(row=>({url:row.sourceUrl})))=>analyzeSubscriptionOffers(rows,market,citations);

test('two grounded official domains can yield a source-linked Suggested total with one canonical base identity',()=>{
 const b=base(),a=addon(b);
 const result=inspect([b,{...b,planName:'Prime Video'},a]);
 assert.deepEqual(result.accepted.map(row=>[row.planName,row.amount]),[
  ['Prime Video',79],['Prime Video Without Ads (Calculated Total)',108]]);
 assert.deepEqual(result.findings.codes,['CALCULATED_TOTAL_CREATED']);
 assert.deepEqual(result.accepted[1].calculation.components.map(row=>[row.role,row.monthlyPriceMinor,row.sourceUrl]),
  [['BASE',7900,b.sourceUrl],['AD_FREE_ADD_ON',2900,a.sourceUrl]]);
 assert(result.accepted[1].calculation.components.every(row=>/^[a-f0-9]{64}$/u.test(row.aiExcerptSha256)));
});

test('independent services and markets have the same offer semantics',()=>{
 for(const [service,serviceName,market,currency,amount] of [
  ['stream-one','Stream One','SE','SEK',99],['cinema-two','Cinema Two','DK','DKK',109],
  ['tv-three','TV Three','DE','EUR',12.99]]){
  const t=target(service,serviceName,market),b={...base(`${serviceName} Basic`,amount),currency,
   marketEvidence:`Available to customers in ${market}`,billingProvider:serviceName,
   sourceUrl:`https://${service}.example/${market.toLowerCase()}/pricing`,
   sourceEvidence:`${serviceName} Basic costs ${amount} ${currency} per month.`};
  const a={...addon(b,3.99,`https://billing.${service}.example/${market.toLowerCase()}/ads`),
   currency,marketEvidence:`Available to customers in ${market}`,billingProvider:serviceName,
   planName:`${serviceName} ad-free add-on`,
   sourceEvidence:`${serviceName} ad-free add-on costs 3.99 ${currency} per month. ${serviceName} bills ${serviceName} Basic ${amount} ${currency} and ad-free 3.99 ${currency} together on the same bill.`,
   combinationEvidence:`${serviceName} bills ${serviceName} Basic ${amount} ${currency} and ad-free 3.99 ${currency} together on the same bill.`};
  const result=inspect([b,a],t);
  assert.equal(result.findings.calculatedCount,1,service);
  assert.equal(result.accepted[1].amount,Number((amount+3.99).toFixed(2)),service);
 }
});

test('complete standalone ad-free tiers remain distinct; add-ons are not standalone',()=>{
 const complete={...base('Prime Video Without Ads',119),
  sourceEvidence:'Prime Video Without Ads subscription includes streaming films and series for 119 NOK per month.'};
 const result=inspect([base('Prime Video With Ads'),complete,addon()]);
 assert.deepEqual(result.accepted.map(row=>row.planName),['Prime Video With Ads','Prime Video Without Ads']);
 assert(result.findings.codes.includes('COMPLETE_PLAN_FOUND'));
 assert.equal(result.findings.addonCount,1);
});

test('a standalone tier can be ad-free through its cited plan description even when its name is Standard',()=>{
 const max=target('max','Max','DE');
 const standard={...base('Max Standard',11.99,'https://www.hbomax.com/de/de'),currency:'EUR',
  marketEvidence:'Available to customers in DE',billingProvider:'Max',
  sourceEvidence:'Max Standard subscription includes ad-free streaming films for 11.99 EUR per month.'};
 const complete=inspect([standard],max);
 assert.deepEqual(complete.findings.codes,['COMPLETE_PLAN_FOUND']);
 assert.equal(complete.accepted[0].offerScope,'COMPLETE_SUBSCRIPTION');
 const adSupported={...standard,planName:'Max Basic',amount:5.99,ordinaryRecurringPrice:5.99,
  sourceEvidence:'Max Basic subscription costs 5.99 EUR per month with ads. An ad-free upgrade is available separately.'};
 assert.equal(classifySubscriptionOffer(adSupported,max).kind,'BASE');
});

test('unproven compatibility and mismatched billing providers cannot create a total',()=>{
 const b=base(),a=addon(b);
 for(const changed of [
  {...a,billingProvider:'Altibox'},
  {...a,compatibleBasePlan:'Amazon Prime'},
  {...a,combinationEvidence:null},
  {...a,sourceEvidence:'Amazon ad-free add-on costs 29 NOK per month.'},
  {...a,marketEvidence:'United States only'},
  {...a,currency:'USD'},
  {...a,paymentCadence:'ANNUAL'},
  {...a,introPrice:29},
  {...a,sourceUrl:'https://not-grounded.example/addon'}]){
  const citations=[{url:b.sourceUrl},{url:a.sourceUrl}];
  const result=inspect([b,changed],prime,citations);
  assert.equal(result.findings.calculatedCount,0,JSON.stringify(changed));
  assert(result.findings.codes.includes('COMPATIBILITY_UNPROVEN'));
 }
 assert.equal(inspect([{...b,sourceEvidence:'Amazon Prime Video costs 79.99 NOK per month.'},a]).findings.calculatedCount,0,
  'a 79.99 excerpt cannot prove a 79.00 component');
});

test('missing components and no documented ad-free offer have explicit explanations',()=>{
 const b=base(),a=addon(b);
 assert.deepEqual(inspect([b]).findings.codes,['BASE_FOUND_ADDON_MISSING','NO_AD_FREE_OFFER_DOCUMENTED']);
 assert.deepEqual(inspect([a]).findings.codes,['ADDON_FOUND_BASE_MISSING']);
 assert.deepEqual(inspect([]).findings.codes,['NO_AD_FREE_OFFER_DOCUMENTED']);
});

test('annual, channels, bundles, promotions and wrong-market complete offers fail closed',()=>{
 const complete={...base('Prime Video Without Ads',119),
  sourceEvidence:'Prime Video Without Ads subscription includes films for 119 NOK per month.'};
 for(const changed of [
  {...complete,planName:'Prime Video Channels Ad Free'},
  {...complete,planName:'Prime Video + Cinema bundle Ad Free'},
  {...complete,annualOnly:true},
  {...complete,marketEvidence:'Sweden only'},
  {...complete,sourceEvidence:null},
  {...complete,sourceEvidence:'A 119 NOK ad-free add-on to an existing plan'}]){
  const result=inspect([changed]);
  assert.equal(result.accepted.length,0,JSON.stringify(changed));
 }
 assert.equal(classifySubscriptionOffer(addon(),prime).kind,'ADDON');
});

test('the actual retained Prime Video NO answer cannot justify a 108 NOK total',()=>{
 const b={...base('Prime Video',79,'https://kundeservice.altibox.no/hc/no/articles/4414008272529-Prime-Video-p%C3%A5-Altibox'),
  billingProvider:null,sourceEvidence:'Prime Video via Altibox costs 79 kroner per month.'};
 const a={...addon(b,29,'https://www.primevideo.com/help?nodeId=TGjMcvk5R7476qfB72'),
  billingProvider:null,combinationEvidence:null,
  sourceEvidence:'The ad-free subscription is a monthly add-on for 29 kroner in Norway.'};
 const result=inspect([b,a],prime,[]);
 assert.deepEqual(result.accepted.map(row=>row.planName),['Prime Video']);
 assert.deepEqual(result.findings.codes,['COMPATIBILITY_UNPROVEN']);
 assert(result.findings.calculationBlockers.includes('COMPONENT_GOOGLE_GROUNDING_MISSING'));
 assert(result.findings.calculationBlockers.includes('COMBINATION_QUOTE_NOT_SOURCE_BOUND'));
});

test('Standard diagnosis identifies absent grounding and same-bill evidence without changing Suggested admission',()=>{
 const b={...base('Prime Video',79,'https://www.primevideo.com/'),
  sourceEvidence:'Dersom man kjøper Prime Video direkte via Amazon koster det kr 79 per måned.'};
 const a={...addon(b,29,'https://www.primevideo.com/help'),
  sourceEvidence:'Amazon tilbyr en reklamefri tilleggstjeneste for 29 kr per måned.',
  combinationEvidence:'A new ad free option for an additional 29 NOK per month.'};
 const result=inspect([b,a],prime,[]);
 assert.deepEqual(result.accepted.map(row=>[row.planName,row.amount]),[['Prime Video',79]]);
 assert.deepEqual(result.findings.codes,['COMPATIBILITY_UNPROVEN']);
 assert(result.findings.calculationBlockers.includes('COMPONENT_GOOGLE_GROUNDING_MISSING'));
 assert(result.findings.calculationBlockers.includes('COMBINATION_QUOTE_NOT_SOURCE_BOUND'));
 assert(result.findings.calculationBlockers.includes('SAME_BILL_WITH_BOTH_PRICES_UNPROVEN'));
 assert.equal(result.findings.calculatedCount,0);
});
