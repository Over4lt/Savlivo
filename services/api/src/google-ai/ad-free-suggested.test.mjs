import test from 'node:test';
import assert from 'node:assert/strict';
import {composePrimeVideoAdFree,primeVideoSuggestedScope} from './ad-free-suggested.mjs';

const target={service:'prime-video',market:'NO'};
const base={planName:'Prime Video With Ads',amount:79,currency:'NOK',ordinaryRecurringPrice:79,
 paymentCadence:'MONTHLY',billingBasis:'monthly',annualOnly:false,freeTier:false,introPrice:null,
 sourceUrl:'https://www.primevideo.com/no',sourceEvidence:'Prime Video costs 79 NOK per month',
 marketEvidence:'Available to customers in Norway',summary:'Monthly Prime Video subscription'};
const addon={...base,planName:'Prime Video Ad Free add-on',amount:29,ordinaryRecurringPrice:29,
 sourceUrl:'https://www.primevideo.com/help/ad-free',
 sourceEvidence:'Prime Video 79 NOK per month plus ad-free add-on 29 NOK per month, billed together by Amazon for customers in Norway.',
 summary:'Ad-free upgrade to the existing Prime Video subscription'};
const total=(b=base,a=addon)=>composePrimeVideoAdFree([b,a].filter(Boolean),target,[b,a].filter(Boolean).map(row=>({url:row.sourceUrl})));

test('a linked same-provider base and add-on yields a separate Suggested calculation with two sources',()=>{
 const result=total();assert(result);
 assert.equal(result.planName,'Prime Video Without Ads (Calculated Total)');
 assert.equal(result.amount,108);
 assert.equal(result.calculation.method,'MONTHLY_BASE_PLUS_AD_FREE_ADD_ON');
 assert.deepEqual(result.calculation.components.map(row=>[row.role,row.monthlyPriceMinor,row.sourceUrl]),
  [['BASE',7900,base.sourceUrl],['AD_FREE_ADD_ON',2900,addon.sourceUrl]]);
 assert(result.calculation.components.every(row=>/^[a-f0-9]{64}$/.test(row.aiExcerptSha256)));
 assert.equal(primeVideoSuggestedScope(addon,'NO'),'NON_STANDALONE');
 assert.equal(composePrimeVideoAdFree([base,addon],target,[]),null,'an ungrounded arithmetic claim cannot be published');
});

test('separate add-on never becomes a full plan; complete ad-free evidence need not say full subscription',()=>{
 const full={...base,planName:'Prime Video Without Ads',amount:119,ordinaryRecurringPrice:119,
  sourceEvidence:'Prime Video Without Ads subscription includes streaming films and series for 119 NOK per month',
  summary:'Monthly subscription without advertising'};
 assert.equal(primeVideoSuggestedScope(full,'NO'),null);
 assert.equal(primeVideoSuggestedScope({...full,sourceEvidence:null},'NO'),'NON_STANDALONE');
 assert.equal(primeVideoSuggestedScope({...full,summary:'Ad-free add-on to Prime Video'},'NO'),'NON_STANDALONE');
 assert.equal(primeVideoSuggestedScope({...full,marketEvidence:'United States only'},'NO'),'NON_STANDALONE');
});

test('composition fails closed for missing, ambiguous or incompatible evidence',()=>{
 const cases=[
  [null,addon],
  [base,null],
  [base,{...addon,sourceEvidence:'Ad-free add-on costs 29 NOK per month'}],
  [base,{...addon,sourceEvidence:'Prime Video 79 NOK plus ad-free 29 NOK per month'}],
  [base,{...addon,sourceEvidence:'Prime Video 79 NOK per month plus ad-free add-on 29 NOK per month, billed together by Altibox.'}],
  [base,{...addon,sourceUrl:'https://www.altibox.no/ad-free'}],
  [base,{...addon,currency:'USD'}],
  [base,{...addon,marketEvidence:''}],
  [base,{...addon,marketEvidence:'United States only'}],
  [base,{...addon,annualOnly:true}],
  [base,{...addon,paymentCadence:'ANNUAL'}],
  [base,{...addon,introPrice:9}],
  [base,{...addon,billingBasis:'annual upfront'}],
  [base,{...addon,summary:'Different billing provider'}],
  [{...base,amount:79.001,ordinaryRecurringPrice:79.001},addon]
 ];
 for(const [b,a] of cases)assert.equal(total(b,a),null,JSON.stringify([b?.planName,a?.planName,a?.sourceEvidence]));
 assert.equal(composePrimeVideoAdFree([base,base,addon],target,[{url:base.sourceUrl},{url:addon.sourceUrl}]),null);
 assert.equal(composePrimeVideoAdFree([base,addon],{service:'amazon-prime',market:'NO'},[{url:base.sourceUrl},{url:addon.sourceUrl}]),null);
});

test('minor-unit arithmetic is exact and retains distinct plan identities',()=>{
 const result=total({...base,amount:79.95,ordinaryRecurringPrice:79.95,
  sourceEvidence:'Prime Video costs 79.95 NOK per month'},
  {...addon,amount:29.05,ordinaryRecurringPrice:29.05,
   sourceEvidence:'Prime Video 79.95 NOK per month plus ad-free add-on 29.05 NOK per month, billed together by Amazon.'});
 assert.equal(result?.amount,109);
 assert.deepEqual(result?.calculation.components.map(row=>row.monthlyPriceMinor),[7995,2905]);
});

test('the retained Prime Video NO Standard answer does not prove a combined 108 NOK bill',()=>{
 const observedBase={...base,planName:'Prime Video',sourceUrl:'https://www.primevideo.com/',
  sourceEvidence:'Dersom man velger å kjøpe Prime Video direkte via Amazon koster det kr 79,- per måned (Kilde, Primevideo.com).'};
 const observedAddon={...addon,planName:'Prime Video Ad Free (Add-on)',sourceUrl:'https://www.primevideo.com/help?nodeId=GHBLU86494798',
  sourceEvidence:'Abonnementet uten annonser er et månedsabonnement. Du kan betale et tillegg for å slippe reklamepausene. Ifølge Allente tar Amazon 29 kroner i måneden for tillegget i Norge.'};
 assert.equal(primeVideoSuggestedScope(observedAddon,'NO'),'NON_STANDALONE');
 assert.equal(composePrimeVideoAdFree([observedBase,observedAddon],target,[]),null);
});
