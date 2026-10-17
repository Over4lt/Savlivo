import test from 'node:test';
import assert from 'node:assert/strict';
import {equivalentVerifiedPlan,planVerifiedCurrentRepair,semanticPlanLabel} from './verified-price-reconciliation.mjs';

const row=(planName,planSlug,amount,overrides={})=>({serviceSlug:'service-one',planSlug,planName,
 billingProviderSlug:'direct',countryCode:'NO',currency:'NOK',monthlyPriceMinor:amount,
 verification:'authoritative-provider',sourceCount:1,verifiedByAgreement:false,
 verifiedAt:amount<8000?'2026-08-30T13:39:53.000Z':'2026-10-16T23:33:45.000Z',
 lastCheckedAt:amount<8000?'2026-09-23T09:25:11.000Z':'2026-10-16T23:33:45.000Z',...overrides});
const history=value=>({...value,providerVerifiedAt:value.verifiedAt});
const old=[row('Standard with Ads','standard-with-ads',6900),row('Standard','standard',10900,{verifiedAt:'2026-08-30T13:39:54.000Z'}),row('Premium','premium',15900,{verifiedAt:'2026-08-30T13:39:55.000Z'})];
const fresh=[row('Service One Standard with Ads','service-one-standard-with-ads',8900),row('Service One Standard','service-one-standard',12900),row('Service One Premium','service-one-premium',17900)];

test('canonical service prefix alone does not distinguish Standard or Premium',()=>{
 assert.equal(equivalentVerifiedPlan(old[1],fresh[1],'Service One'),true);
 assert.equal(equivalentVerifiedPlan(old[2],fresh[2],'Service One'),true);
 assert.deepEqual(semanticPlanLabel('Service One Standard','Service One'),{core:'standard',prefixed:true});
 assert.equal(semanticPlanLabel('Service Oneness Standard','Service One').prefixed,false);
});

test('new authoritative rows supersede three stale current rows without losing observations',()=>{
 const rows=[...old,...fresh],observations=rows.map(history),planned=planVerifiedCurrentRepair(rows,observations,'Service One');
 assert.equal(planned.ready,true);assert.equal(planned.deleteCount,3);
 assert.deepEqual(planned.groups.map(group=>[group.remove.monthlyPriceMinor,group.keep.monthlyPriceMinor]),[[6900,8900],[10900,12900],[15900,17900]]);
 const current=rows.filter(value=>!planned.groups.some(group=>group.remove===value));
 assert.deepEqual(current.map(value=>value.monthlyPriceMinor),[8900,12900,17900]);
 assert.deepEqual(observations.map(value=>value.monthlyPriceMinor),[6900,10900,15900,8900,12900,17900]);
 const repeated=planVerifiedCurrentRepair(current,observations,'Service One');
 assert.equal(repeated.ready,true);assert.equal(repeated.deleteCount,0);assert.equal(repeated.groups.length,0);
});

test('repair refuses deletion until old and new verified history is present',()=>{
 const planned=planVerifiedCurrentRepair([...old,...fresh],[],'Service One');
 assert.equal(planned.ready,false);assert.equal(planned.deleteCount,0);
 assert.deepEqual(planned.groups.map(group=>group.missingHistory.length),[2,2,2]);
});

for(const [label,changed] of [
 ['other service',{serviceSlug:'service-two'}],
 ['other market',{countryCode:'SE'}],
 ['other billing route',{billingProviderSlug:'apple'}],
 ['other currency',{currency:'SEK'}],
 ['other verification class',{verification:'multi-source',sourceCount:2,verifiedByAgreement:true}],
 ['Suggested only',{verification:'single-source'}],
 ['Standard versus Premium',{planName:'Service One Premium'}],
 ['Standard versus Standard with Ads',{planName:'Service One Standard with Ads'}],
 ['standalone versus bundle',{planName:'Service One Standard Bundle'}],
 ['standalone versus add-on',{planName:'Service One Standard Extra Member'}],
 ['standalone versus annual-only',{planName:'Service One Annual Standard'}],
 ['provider name inside product',{planName:'Standard Service One'}],
])test(`${label} does not merge`,()=>assert.equal(equivalentVerifiedPlan(old[1],{...fresh[1],...changed},'Service One'),false));

test('ambiguous semantic group refuses reconciliation',()=>{
 const third=row('Service One Standard','alternate-standard',13900,{verifiedAt:'2026-10-17T00:00:00.000Z'});
 const plan=planVerifiedCurrentRepair([old[1],fresh[1],third],[old[1],fresh[1],third].map(history),'Service One');
 assert.equal(plan.ready,false);assert.equal(plan.refused[0].reason,'AMBIGUOUS_EQUIVALENCE');
});

test('same semantic label with differing authority refuses repair',()=>{
 const different={...fresh[1],verification:'multi-source',sourceCount:2,verifiedByAgreement:true};
 const rows=[old[1],different],plan=planVerifiedCurrentRepair(rows,rows.map(history),'Service One');
 assert.equal(plan.ready,false);assert.equal(plan.refused[0].reason,'AMBIGUOUS_EQUIVALENCE');
});

test('equal timestamps refuse freshness guessing',()=>{
 const pair=[old[1],{...fresh[1],verifiedAt:old[1].verifiedAt}];
 const plan=planVerifiedCurrentRepair(pair,pair.map(history),'Service One');
 assert.equal(plan.ready,false);assert.equal(plan.refused[0].reason,'AMBIGUOUS_FRESHNESS');
});
