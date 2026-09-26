// Provider prices only. Never applies to extraction or user-entered actual prices.
export const recurringPriceEligibilityVersion='NONZERO_RECURRING_PROVIDER_PRICE_V1';
export const positiveProviderAmount=value=>(typeof value==='number'||typeof value==='string')&&/^\d+(?:\.\d+)?$/.test(String(value))&&Number.isFinite(Number(value))&&Number(value)>0;
const hashes=o=>o.sourceHashes??[o.source?.hash??o.sourceHash].filter(Boolean);
const norm=v=>String(v??'').normalize('NFKC').trim().toLowerCase();
export function sameRejectedPrice(o,rejected){
 const r=rejected.value??rejected.originalVerified??rejected;
 if(!hashes(o).some(h=>hashes(r).includes(h))||Number(o.amount)!==Number(r.amount)||o.currency!==r.currency)return false;
 if(o.service&&r.service&&o.service!==r.service||o.market&&r.market&&o.market!==r.market)return false;
 if(o.monthlyPlanId&&r.monthlyPlanId)return o.monthlyPlanId===r.monthlyPlanId;
 if(o.plan&&r.plan&&norm(o.plan)!==norm(r.plan))return false;
 const a=o.billingInterval?.normalized,b=r.billingInterval?.normalized;if(a&&b&&a!==b)return false;
 const scope=x=>JSON.stringify(Object.entries(x).map(([k,v])=>[k,v?.value??v]).sort(([a],[b])=>a.localeCompare(b)));
 if(o.scope&&r.scope&&scope(o.scope)!==scope(r.scope))return false;
 // Missing identity cannot justify resurrecting this rejected source/amount.
 return true;
}
export function currentlyEligibleProviderPrice(o,target={}){
 if(!o||!positiveProviderAmount(o.amount)||o.invalidated===true||o.stale===true)return false;
 if((o.marketProofDependencies??[]).some(d=>{const age=Date.now()-Date.parse(d.capturedAt??'');return !Number.isFinite(age)||age<0||age>Math.min(target.retainedMaxAgeDays??30,30)*86400000;}))return false;
 if(hashes(o).some(h=>(target.invalidatedEvidence??[]).includes(h)))return false;
 if((target.quarantinedVerified??[]).some(q=>sameRejectedPrice(o,q)))return false;
 return true;
}
export function retainedPricingSummary(target,observations,{artifact,capturedAt=null}={}){
 const now=Date.parse(target.researchAsOf??''),at=Date.parse(capturedAt??'');
 if(Number.isFinite(now)&&Number.isFinite(at)&&now-at>(target.retainedMaxAgeDays??30)*86400000)return null;
 // Preserve the existing single sufficiency summary, not a new offer-selection policy.
 const o=observations.find(o=>o.service===target.service&&o.source?.kind==='ORIGINAL_PROVIDER'&&['HIGH','MEDIUM'].includes(o.confidence)&&currentlyEligibleProviderPrice(o,target)&&(o.market===target.market||target.researchObjective==='SERVICE_COVERAGE'));
 return o?{sourceBound:true,confidence:o.confidence,market:o.market,objective:target.researchObjective,marketApplicability:o.marketApplicability??null,exposure:o.exposure??null,sourceHash:o.source.hash,sourceHashes:hashes(o),marketProofDependencies:o.marketProofDependencies??[],sourceUrl:o.source.url,artifact,scope:o.scope??null,amount:o.amount,currency:o.currency,plan:o.plan??null,billingInterval:o.billingInterval??null,capturedAt,eligibilityVersion:recurringPriceEligibilityVersion}:null;
}

export const eligibleVerifiedPrices=target=>(target.verified??[]).filter(o=>currentlyEligibleProviderPrice(o,target));

// Qualified provider evidence may be useful without proving the research market.
// Missing new evidence does not undo the retained market assertion; only the
// existing eligibility vetoes or explicit incompatible scope defeat this view.
export function establishesTargetMarketPrice(observation,target){
 if(!currentlyEligibleProviderPrice(observation,target)||!target.market||observation.market!==target.market)return false;
 if(observation.exposure?.marketTargeting===false||observation.marketTargeting===false)return false;
 const market=observation.marketApplicability;
 if(market&&market.status!=='ESTABLISHED')return false;
 if(market?.allowedMarkets?.length&&!market.allowedMarkets.includes(target.market))return false;
 return true;
}
