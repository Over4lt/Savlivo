// Read-only preflight for legacy hash-named V3 current rows. There is no
// write path, API route, startup hook or automatic approval in this module.
import {createHash} from 'node:crypto';
import {loadRetainedVerifiedEvidence} from './verified-reconciliation-v1.mjs';
import {evaluateCountryProviderTruth} from '../research-v2/live/provider-source-v3.mjs';
import {projectV3VerificationEvidence} from '../research-v2/inventory/v3-result-projection.mjs';
import {canonicalVerifiedPlanSlug,semanticVerifiedAlias,bundlePlanName} from '../verified-price-reconciliation.mjs';

const hash=value=>createHash('sha256').update(value).digest('hex');
const stable=value=>Array.isArray(value)?value.map(stable):value&&typeof value==='object'?
 Object.fromEntries(Object.keys(value).sort().map(key=>[key,stable(value[key])])):value;
const slug=value=>String(value).normalize('NFKD').toLowerCase().replace(/[\u0300-\u036f]/gu,'').replace(/[^a-z0-9]+/gu,'-').replace(/^-|-$/gu,'').slice(0,120);
const legacyHash=value=>typeof value==='string'&&/^[a-f0-9]{64}$/u.test(value);
const rowKey=row=>[row.serviceSlug,row.countryCode,row.billingProviderSlug,row.currency,row.planSlug].join('\u0000');
const minor=value=>Number.isFinite(value)&&Number.isSafeInteger(Math.round(value*100))&&Math.abs(value*100-Math.round(value*100))<1e-6?Math.round(value*100):null;

export function dryRunVerifiedPlanIdentityRepair({runsRoot,currentRows,historyRows,selectors,loadEvidence=loadRetainedVerifiedEvidence}){
 if(!Array.isArray(currentRows)||!Array.isArray(historyRows)||!Array.isArray(selectors))throw Error('PLAN_REPAIR_INPUT_INVALID');
 const candidates=currentRows.filter(row=>row.source==='v3-truth'&&legacyHash(row.planSlug));
 const proposals=[],blocked=[],newKeys=new Set();
 for(const row of candidates){
  const selector=selectors.filter(item=>item.service===row.serviceSlug&&item.market===row.countryCode&&item.exactOfferId===row.planSlug);
  let reason=null,proposal=null;
  try{
   if(selector.length!==1||!legacyHash(selector[0].sourceHash))throw Error('ORIGINAL_SOURCE_SELECTOR_MISSING_OR_AMBIGUOUS');
   const evidence=loadEvidence({runsRoot,jobId:selector[0].jobId,service:row.serviceSlug,market:row.countryCode,sourceHash:selector[0].sourceHash});
   const source=evaluateCountryProviderTruth({target:evidence.target,sourceCheck:evidence.sourceCheck,attempt:evidence.attempt});
   const target={...evidence.target,...source,v3Observation:{...source.v3Observation,acquiredAt:evidence.acquiredAt}};
   const offerings=projectV3VerificationEvidence(target).filter(item=>item.exactOfferId===row.planSlug);
   if(offerings.length!==1)throw Error('V3_OFFER_MISSING_OR_AMBIGUOUS');
   const offer=offerings[0],name=offer.offerIdentityName;
   if(!name||legacyHash(name)||offer.serviceId!==row.serviceSlug||offer.targetMarket!==row.countryCode||offer.truthMarket!==row.countryCode||offer.bodySha256!==evidence.bodyHash||offer.sourceUrl!==row.sourceUrl||offer.currency!==row.currency||minor(offer.amount)!==row.monthlyPriceMinor||Date.parse(evidence.acquiredAt)!==Date.parse(row.verifiedAt))throw Error('CURRENT_SOURCE_OR_TRUTH_MISMATCH');
   if(!row.historySeriesId)throw Error('HISTORY_SERIES_MISSING');
   const history=historyRows.filter(item=>item.historySeriesId===row.historySeriesId);
   if(history.length!==1||history[0].source!=='v3-truth'||history[0].planSlug!==row.planSlug||history[0].monthlyPriceMinor!==row.monthlyPriceMinor||history[0].sourceUrl!==row.sourceUrl||Date.parse(history[0].providerVerifiedAt)!==Date.parse(row.verifiedAt))throw Error('HISTORY_SERIES_AMBIGUOUS');
   const planSlug=canonicalVerifiedPlanSlug(row.serviceSlug,name)??slug(name);
   if(!planSlug||bundlePlanName(name))throw Error('PLAN_SCOPE_AMBIGUOUS');
   const replacement={...row,planSlug,planName:name};
   const newKey=rowKey(replacement);
   if(newKeys.has(newKey)||currentRows.some(item=>item!==row&&item.source==='v3-truth'&&rowKey(item)===newKey))throw Error('CANONICAL_PLAN_COLLISION');
   const old=currentRows.filter(item=>item.source?.startsWith('official-provider-adapter:')&&item.serviceSlug===row.serviceSlug&&item.countryCode===row.countryCode&&item.billingProviderSlug===row.billingProviderSlug&&item.currency===row.currency&&
    (item.planSlug===planSlug||semanticVerifiedAlias({...replacement,verification:'authoritative-provider'},item,evidence.target.serviceName)));
   if(old.length>1)throw Error('OLD_VERIFIED_PREDECESSOR_AMBIGUOUS');
   const predecessor=old[0]??null;
   proposal={service:row.serviceSlug,market:row.countryCode,oldPlanSlug:row.planSlug,planSlug,planName:name,planIdentity:['catalog',row.serviceSlug,row.countryCode,planSlug,row.billingProviderSlug,row.currency].map(value=>value.toLowerCase()).join(':'),historySeriesId:row.historySeriesId,sourceHash:evidence.bodyHash,sourceUrl:evidence.sourceUrl,jobId:evidence.jobId,journalRecord:evidence.journalRecord,acquiredAt:evidence.acquiredAt,predecessor:predecessor?{planSlug:predecessor.planSlug,planName:predecessor.planName}:null};
   newKeys.add(newKey);
  }catch(error){reason=error.message??'UNKNOWN';}
  if(proposal)proposals.push(proposal);else blocked.push({service:row.serviceSlug,market:row.countryCode,planSlug:row.planSlug,reason});
 }
 proposals.sort((a,b)=>[a.service,a.market,a.oldPlanSlug].join(':').localeCompare([b.service,b.market,b.oldPlanSlug].join(':')));
 blocked.sort((a,b)=>[a.service,a.market,a.planSlug].join(':').localeCompare([b.service,b.market,b.planSlug].join(':')));
 const snapshot=currentRows.map(row=>[rowKey(row),row.planIdentity,row.planName,row.monthlyPriceMinor,row.source,row.sourceUrl,row.historySeriesId,row.verifiedAt]).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
 const history=historyRows.map(row=>[row.historySeriesId,row.planSlug,row.monthlyPriceMinor,row.source,row.sourceUrl,row.providerVerifiedAt]).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
 const report={version:1,readOnly:true,productionWriteEnabled:false,candidateCount:candidates.length,proposals,blocked,snapshotDigest:hash(JSON.stringify(stable({snapshot,history})))};
 return {...report,digest:hash(JSON.stringify(stable(report)))};
}
