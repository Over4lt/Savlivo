import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {dryRunVerifiedPlanIdentityRepair} from './verified-plan-identity-repair.mjs';
import {evaluateCountryProviderTruth} from '../research-v2/live/provider-source-v3.mjs';
import {projectV3VerificationEvidence} from '../research-v2/inventory/v3-result-projection.mjs';

const root=new URL('../research-v3/fixtures/max/',import.meta.url);
const archived=JSON.parse(fs.readFileSync(new URL('us-production-g1-receipt.json',root)));
const body=gunzipSync(fs.readFileSync(new URL('us-production-help-pricing.html.gz',root))).toString('utf8');
const original=()=>({jobId:archived.jobId,targetId:archived.target.id,target:structuredClone(archived.target),sourceCheck:structuredClone(archived.sourceCheck),attempt:{...structuredClone(archived.attempt),page:{...structuredClone(archived.attempt.page),rawSource:{text:body}}},bodyHash:archived.attempt.page.sourceIntegrity.sha256,sourceUrl:archived.attempt.page.url,acquiredAt:archived.attempt.page.sourceIntegrity.checkedAt,journalRecord:{sequence:17,hash:archived.recordHash},attemptId:archived.attempt.id});
function fixture(){
 const evidence=original(),source=evaluateCountryProviderTruth({target:evidence.target,sourceCheck:evidence.sourceCheck,attempt:evidence.attempt});
 const offers=projectV3VerificationEvidence({...evidence.target,...source}),currentRows=[],historyRows=[],selectors=[];
 for(const offer of offers){
  const row={serviceSlug:'max',countryCode:'US',billingProviderSlug:'direct',currency:'USD',planSlug:offer.exactOfferId,planName:offer.exactOfferId,planIdentity:'catalog:max:us:'+offer.exactOfferId+':direct:usd',monthlyPriceMinor:Math.round(offer.amount*100),source:'v3-truth',sourceUrl:evidence.sourceUrl,historySeriesId:'vh:'+offer.exactOfferId,verifiedAt:evidence.acquiredAt};
  currentRows.push(row);historyRows.push({historySeriesId:row.historySeriesId,planSlug:row.planSlug,monthlyPriceMinor:row.monthlyPriceMinor,source:row.source,sourceUrl:row.sourceUrl,providerVerifiedAt:row.verifiedAt});
  selectors.push({service:'max',market:'US',exactOfferId:offer.exactOfferId,sourceHash:evidence.bodyHash,jobId:evidence.jobId});
 }
 currentRows.push({...currentRows[0],planSlug:'basic-with-ads',planName:'Basic with Ads',source:'official-provider-adapter:max',historySeriesId:null});
 return {runsRoot:'/unused',currentRows,historyRows,selectors,loadEvidence:()=>original()};
}

test('read-only repair preflight replays original G1 source, preserves history and has a deterministic digest',()=>{
 const input=fixture(),before=structuredClone({rows:input.currentRows,history:input.historyRows});
 const first=dryRunVerifiedPlanIdentityRepair(input),second=dryRunVerifiedPlanIdentityRepair(input);
 assert.deepEqual(first,second);assert.equal(first.candidateCount,3);assert.equal(first.proposals.length,3);assert.deepEqual(first.blocked,[]);
 assert.deepEqual(first.proposals.map(row=>row.planSlug).sort(),['basic-with-ads','premium','standard']);
 assert.equal(first.proposals.filter(row=>row.predecessor).length,1);
 assert(first.proposals.every(row=>row.sourceHash===original().bodyHash&&row.historySeriesId));
 assert.equal(first.productionWriteEnabled,false);
 assert.deepEqual({rows:input.currentRows,history:input.historyRows},before);
});

test('repair preflight blocks wrong amount, missing history, tampered source and duplicate selector',()=>{
 const amount=fixture();amount.currentRows[0].monthlyPriceMinor++;
 assert.equal(dryRunVerifiedPlanIdentityRepair(amount).blocked.length,1);
 const history=fixture();history.historyRows.pop();
 assert.equal(dryRunVerifiedPlanIdentityRepair(history).blocked.length,1);
 const tampered=fixture();tampered.loadEvidence=()=>{const row=original();row.attempt.page.rawSource.text+=' ';return row;};
 assert.equal(dryRunVerifiedPlanIdentityRepair(tampered).blocked.length,3);
 const duplicate=fixture();duplicate.selectors.push({...duplicate.selectors[0]});
 assert.equal(dryRunVerifiedPlanIdentityRepair(duplicate).blocked.length,1);
 const ambiguousOld=fixture();ambiguousOld.currentRows.push({...ambiguousOld.currentRows.at(-1),planSlug:'basis-med-reklame'});
 const checked=dryRunVerifiedPlanIdentityRepair(ambiguousOld);
 assert.equal(checked.blocked.length,1);assert.equal(checked.proposals.length,2);
});
