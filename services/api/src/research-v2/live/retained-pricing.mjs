import fs from 'node:fs';import path from 'node:path';
import {currentlyEligibleProviderPrice,retainedPricingSummary} from '../intelligence/recurring-price-eligibility.mjs';
// Validate the summary against current negative state each time it is consumed.
// Legacy summaries without an amount require their existing local observation;
// absence is not evidence of a non-zero price. No acquisition or recovery occurs.
export function currentRetainedPriceReview(target,review=target.retainedPriceReview){
 if(!review?.sourceBound||!['HIGH','MEDIUM'].includes(review.confidence)||review.stale===true||review.invalidated===true)return null;
 if(review.amount!==undefined){
  const now=Date.parse(target.researchAsOf??''),at=Date.parse(review.capturedAt??'');
  if(Number.isFinite(now)&&Number.isFinite(at)&&now-at>(target.retainedMaxAgeDays??30)*86400000)return null;
  return currentlyEligibleProviderPrice(review,target)?review:null;
 }
 try{
  const file=path.resolve(review.artifact);if(!file.startsWith(process.cwd()+path.sep)||fs.lstatSync(file).isSymbolicLink())return null;
  const doc=JSON.parse(fs.readFileSync(file));
  return retainedPricingSummary(target,(doc.observations??[]).filter(o=>o.source?.hash===review.sourceHash),{artifact:review.artifact,capturedAt:review.capturedAt});
 }catch{return null;}
}
