import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeSubscriptionOffers,classifySubscriptionOffer} from './subscription-offers.mjs';

const target={service:'prime-video',serviceName:'Prime Video',market:'NO'};
const plan=(planName='Prime Video',amount=79,sourceEvidence='Prime Video subscription costs 79 NOK per month.')=>({
 planName,amount,ordinaryRecurringPrice:amount,currency:'NOK',paymentCadence:'MONTHLY',
 annualOnly:false,freeTier:false,introPrice:null,billingBasis:'charged monthly',
 marketEvidence:'Available to customers in Norway',sourceUrl:'https://www.primevideo.com/no',sourceEvidence
});

test('ordinary monthly base plans keep their canonical identity and duplicate leads collapse',()=>{
 const result=analyzeSubscriptionOffers([plan('Prime Video (Base Plan)'),plan() ],target);
 assert.deepEqual(result.accepted.map(row=>[row.planName,row.amount]),[['Prime Video',79]]);
});

test('a documented standalone ad-free tier remains a separate monthly subscription',()=>{
 const complete=plan('Prime Video Without Ads',119,
  'Prime Video Without Ads subscription includes streaming films and series for 119 NOK per month.');
 const result=analyzeSubscriptionOffers([plan(),complete],target);
 assert.deepEqual(result.accepted.map(row=>[row.planName,row.amount]),[['Prime Video',79],['Prime Video Without Ads',119]]);
 assert.equal(result.accepted[1].offerScope,'COMPLETE_SUBSCRIPTION');
});

test('add-ons, upgrades, Channels and bundles never form calculated totals',()=>{
 const result=analyzeSubscriptionOffers([plan(),
  plan('Prime Video Ad Free add-on',29,'Ad-free add-on costs 29 NOK per month.'),
  plan('Prime Video Channels',29),plan('Prime Video + partner bundle',119)],target);
 assert.deepEqual(result.accepted.map(row=>row.planName),['Prime Video']);
 assert.equal(result.rejected.NON_STANDALONE,3);
 assert(result.accepted.every(row=>!row.calculation&&row.offerScope!=='CALCULATED_TOTAL'));
});

test('an unproven ad-free name cannot enter Suggested as a full subscription',()=>{
 for(const changed of [
  plan('Prime Video Ad Free',29,'Ad-free add-on costs 29 NOK per month.'),
  {...plan('Prime Video Without Ads',119),marketEvidence:'Sweden only'},
  {...plan('Prime Video Without Ads',119),sourceEvidence:null},
  {...plan('Prime Video Without Ads',119),annualOnly:true},
  {...plan('Prime Video Without Ads',119),introPrice:119}
 ])assert.equal(analyzeSubscriptionOffers([changed],target).accepted.length,0,JSON.stringify(changed));
});

test('a normal tier is not rejected because its source mentions a separate upgrade',()=>{
 const max={service:'max',serviceName:'Max',market:'DE'};
 const standard={...plan('Max Standard',11.99,
  'Max Standard subscription costs 11.99 EUR per month. A separate ad-free upgrade is available.'),
  currency:'EUR',marketEvidence:'Available to customers in Germany',sourceUrl:'https://www.hbomax.com/de/de'};
 assert.equal(classifySubscriptionOffer(standard,max).kind,'BASE');
});
