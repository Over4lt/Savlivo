import {countryCurrencyData} from '../../../../packages/contracts/src/markets.ts';
import {nonStandalonePresentation} from '../research-v3/offering-scope.mjs';

const adFree=/\b(?:ad[- ]?free|without ads?|reklamefri|reklamfri|uten reklame|werbefrei|sans publicité|sin anuncios|sem anúncios)\b/iu;
const ancillary=/\b(?:add[- ]?on|upgrade|extra charge|additional charge|supplement|tillegg|remove ads|fjerne reklame)\b/iu;
const excluded=/\b(?:channels?|rentals?|rent|purchases?|buy|pay[- ]?per[- ]?view|bundles?|packages?|pakket?|pakke|combo)\b/iu;
const monthly=value=>/^(?:MONTH|MONTHLY|MONTHLY_RECURRING)$/iu.test(String(value??''));
const normalize=value=>String(value??'').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
const amountMinor=row=>{
 const value=Number(row?.ordinaryRecurringPrice??row?.amount);
 return Number.isFinite(value)&&value>0&&Number.isSafeInteger(Math.round(value*100))&&
  Math.abs(value*100-Math.round(value*100))<=1e-6?Math.round(value*100):null;
};
const canonicalUrl=value=>{try{const url=new URL(value);if(url.protocol!=='https:'||url.username||url.password)return null;url.hash='';return url.href;}catch{return null;}};
const marketEvidence=(row,market)=>{
 const text=String(row?.marketEvidence??'').toLowerCase();
 const local=countryCurrencyData.find(([code])=>code===market)?.[1]?.toLowerCase();
 const another=countryCurrencyData.some(([code,label])=>code!==market&&text.includes(label.toLowerCase()+' only'));
 const coded=/\b([a-z]{2})\s+only\b/u.exec(text);
 return !another&&(!coded||coded[1].toUpperCase()===market)&&
  (Boolean(local&&text.includes(local))||new RegExp('\\b'+market.toLowerCase()+'\\b','u').test(text)||
   market==='NO'&&/\bnorge\b/u.test(text));
};
const numberIn=(text,minor)=>{
 const fixed=(minor/100).toFixed(2),short=String(minor/100);
 return [fixed,fixed.replace('.',','),short,short.replace('.',',')].some(value=>
  new RegExp('(?:^|[^\\d.,])'+value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'(?![\\d.,])','u').test(text));
};
const completeEvidence=text=>
 /\b(?:includes?|covers?|gives? access to)\b.{0,100}\b(?:streaming|films?|movies?|series|catalog(?:ue)?|video access)\b/iu.test(text)||
 /\b(?:total|all[- ]?in|entire|whole|complete|full|standalone|samlet|ordinær)\b.{0,80}\b(?:monthly|month|subscription|abonnement|plan|tier|månedspris)\b/iu.test(text)||
 /\b(?:monthly|month|subscription|abonnement|plan|tier|månedspris)\b.{0,80}\b(?:total|all[- ]?in|entire|whole|complete|full|standalone|samlet|ordinær)\b/iu.test(text);

export function canonicalOfferName(name){return String(name??'').replace(/\s*\(base plan\)\s*$/iu,'').trim();}
export function classifySubscriptionOffer(row,target){
 const name=String(row?.planName??''),excerpt=String(row?.sourceEvidence??'').trim();
 if(excluded.test(name)||ancillary.test(name)||/\s\+\s/iu.test(name)||nonStandalonePresentation(name,target.serviceName))
  return {kind:'REJECTED',reason:'NON_STANDALONE'};
 // A Standard or Premium tier may itself be ad-free. A separately offered
 // upgrade elsewhere in its source does not turn that tier into an add-on.
 const namedAdFree=adFree.test(name);
 const describedAdFree=!ancillary.test(excerpt)&&
  /\b(?:plan|tier|subscription|abonnement|standard|premium)\b.{0,90}\b(?:ad[- ]?free|without ads?|reklamefri|reklamfri|werbefrei)\b/iu.test(excerpt);
 if(!namedAdFree&&!describedAdFree)return {kind:'BASE'};
 if(ancillary.test(excerpt)||row?.annualOnly===true||row?.freeTier===true||row?.introPrice!=null||
  !monthly(row?.paymentCadence)||/\b(?:annual|yearly|upfront|promotion|trial|one[- ]?time)\b/iu.test([row?.billingBasis,row?.commitment].join(' ')))
  return {kind:'REJECTED',reason:'NON_STANDALONE'};
 const minor=amountMinor(row);
 if(!canonicalUrl(row?.sourceUrl)||!marketEvidence(row,target.market)||
  !normalize([name,excerpt].join(' ')).includes(normalize(target.serviceName))||
  !/\b(?:subscription|abonnement|plan|tier|månedspris|monthly price|total monthly|samlet månedspris)\b/iu.test(excerpt)||
  !/\b(?:monthly|month|måned|mnd|monat)\b/iu.test(excerpt)||!completeEvidence(excerpt)||
  minor===null||!numberIn(excerpt,minor))return {kind:'REJECTED',reason:'NON_STANDALONE'};
 return {kind:'COMPLETE'};
}

// An add-on is never combined arithmetically with a base subscription.
export function analyzeSubscriptionOffers(rows,target){
 const accepted=[],rejected={},seen=new Set();
 for(const row of rows??[]){
  const decision=classifySubscriptionOffer(row,target);
  if(decision.kind==='REJECTED'){
   rejected[decision.reason]=(rejected[decision.reason]??0)+1;
   continue;
  }
  const normalized={...row,planName:canonicalOfferName(row.planName),
   ...(decision.kind==='COMPLETE'?{offerScope:'COMPLETE_SUBSCRIPTION'}:{})};
  const identity=[normalize(normalized.planName),normalized.currency,amountMinor(normalized),canonicalUrl(normalized.sourceUrl)].join('\u0000');
  if(seen.has(identity))continue;
  seen.add(identity);accepted.push(normalized);
 }
 return {accepted,rejected};
}
