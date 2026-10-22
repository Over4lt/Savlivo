import {createHash} from 'node:crypto';
import {countryCurrencyData} from '../../../../packages/contracts/src/markets.ts';
import {nonStandalonePresentation} from '../research-v3/offering-scope.mjs';

const adFree=/\b(?:ad[- ]?free|without ads?|reklamefri|reklamfri|uten reklame|werbefrei|sans publicité|sin anuncios|sem anúncios)\b/iu;
const ancillary=/\b(?:add[- ]?on|upgrade|extra charge|additional charge|supplement|tillegg|remove ads|fjerne reklame)\b/iu;
const excluded=/\b(?:channels?|rentals?|rent|purchases?|buy|pay[- ]?per[- ]?view|bundles?|packages?|pakket?|pakke|combo)\b/iu;
const monthly=value=>/^(?:MONTH|MONTHLY|MONTHLY_RECURRING)$/iu.test(String(value??''));
const sha=value=>createHash('sha256').update(value).digest('hex');
const normalize=value=>String(value??'').normalize('NFKC').toLowerCase().replace(/\s*\(base plan\)\s*$/iu,'').replace(/[^\p{L}\p{N}]+/gu,' ').trim();
const amountMinor=row=>{
 const value=Number(row?.ordinaryRecurringPrice??row?.amount);
 if(!Number.isFinite(value)||value<=0||!Number.isSafeInteger(Math.round(value*100))||
   Math.abs(value*100-Math.round(value*100))>1e-6)return null;
 return Math.round(value*100);
};
const canonicalUrl=value=>{try{const url=new URL(value);if(url.protocol!=='https:'||url.username||url.password)return null;url.hash='';return url.href;}catch{return null;}};
const evidence=row=>String(row?.sourceEvidence??'').trim();
const details=row=>[row?.planName,row?.billingBasis,row?.commitment,row?.summary,row?.sourceEvidence].filter(Boolean).join(' ');
const serviceMention=(row,target)=>normalize([row?.planName,evidence(row)].join(' ')).includes(normalize(target.serviceName));
const numberIn=(text,minor)=>{
 const fixed=(minor/100).toFixed(2),short=String(minor/100);
 return [fixed,fixed.replace('.',','),short,short.replace('.',',')].some(value=>
  new RegExp('(?:^|[^\\d.,])'+value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'(?![\\d.,])','u').test(text));
};
const marketEvidence=(row,market)=>{
 const text=String(row?.marketEvidence??'').toLowerCase();
 const local=countryCurrencyData.find(([code])=>code===market)?.[1]?.toLowerCase();
 const another=countryCurrencyData.some(([code,label])=>code!==market&&text.includes(label.toLowerCase()+' only'));
 const coded=/\b([a-z]{2})\s+only\b/u.exec(text);
 return !another&&(!coded||coded[1].toUpperCase()===market)&&
  (Boolean(local&&text.includes(local))||new RegExp('\\b'+market.toLowerCase()+'\\b','u').test(text)||
   market==='NO'&&/\bnorge\b/u.test(text));
};
const recurring=row=>monthly(row?.paymentCadence)&&row?.annualOnly!==true&&row?.freeTier!==true&&
 row?.introPrice==null&&!/\b(?:annual|yearly|upfront|intro(?:ductory)?|promotion|trial|one[- ]?time)\b/iu.test([row?.billingBasis,row?.commitment].join(' '))&&
 amountMinor(row)!==null&&/^[A-Z]{3}$/u.test(String(row?.currency??''));
const completeEvidence=text=>
 /\b(?:includes?|covers?|gives? access to)\b.{0,100}\b(?:streaming|films?|movies?|series|catalog(?:ue)?|video access)\b/iu.test(text)||
 /\b(?:total|all[- ]?in|entire|whole|complete|full|standalone|samlet|ordinær)\b.{0,80}\b(?:monthly|month|subscription|abonnement|plan|tier|månedspris)\b/iu.test(text)||
 /\b(?:monthly|month|subscription|abonnement|plan|tier|månedspris)\b.{0,80}\b(?:total|all[- ]?in|entire|whole|complete|full|standalone|samlet|ordinær)\b/iu.test(text);
const provider=row=>typeof row?.billingProvider==='string'&&/^[\p{L}\p{N} .&-]{2,100}$/u.test(row.billingProvider.trim())?normalize(row.billingProvider):null;
const citationSet=rows=>new Set(rows.map(row=>canonicalUrl(row?.url)).filter(Boolean));

export function canonicalOfferName(name){return String(name??'').replace(/\s*\(base plan\)\s*$/iu,'').trim();}
export function isAdFreeName(name){return adFree.test(String(name??''));}
export function isAncillaryOfferName(name){return ancillary.test(String(name??''));}
const planIncludesAdFree=row=>{
 const excerpt=evidence(row);
 return !ancillary.test(excerpt)&&
  /\b(?:plan|tier|subscription|abonnement|standard|premium)\b.{0,90}\b(?:ad[- ]?free|without ads?|reklamefri|reklamfri|werbefrei)\b/iu.test(excerpt);
};

export function classifySubscriptionOffer(row,target){
 const name=String(row?.planName??''),text=details(row),market=target.market;
 const adFreeOffer=isAdFreeName(name)||planIncludesAdFree(row);
 if(excluded.test(name)||/\s\+\s/iu.test(name))return {kind:'REJECTED',reason:'NON_STANDALONE'};
 if(adFreeOffer&&ancillary.test(text))return {kind:'ADDON',reason:'NON_STANDALONE'};
 if(nonStandalonePresentation(name,target.serviceName)||excluded.test(name))return {kind:'REJECTED',reason:'NON_STANDALONE'};
 if(!adFreeOffer)return {kind:'BASE'};
 if(row?.annualOnly===true||row?.freeTier===true||row?.introPrice!=null||
   !monthly(row?.paymentCadence)||/\b(?:annual|yearly|upfront|promotion|trial|one[- ]?time)\b/iu.test([row?.billingBasis,row?.commitment].join(' ')))return {kind:'REJECTED',reason:'NON_STANDALONE'};
 const excerpt=evidence(row),minor=amountMinor(row);
 if(!canonicalUrl(row?.sourceUrl)||!marketEvidence(row,market)||!serviceMention(row,target)||!excerpt||
  !/\b(?:subscription|abonnement|plan|tier|månedspris|monthly price|total monthly|samlet månedspris)\b/iu.test(excerpt)||
  !/\b(?:monthly|month|måned|mnd|monat)\b/iu.test(excerpt)||!completeEvidence(excerpt)||
  minor!==null&&!numberIn(excerpt,minor))return {kind:'REJECTED',reason:'NON_STANDALONE'};
 return {kind:'COMPLETE'};
}

// The model's billing fields are leads. A calculated Suggested total additionally
// requires two grounded component URLs and mutually consistent, explicit source
// excerpts. Neither the total nor its prior citations may become V3 evidence.
function calculated(base,addon,target,citations){
 const baseMinor=amountMinor(base),addonMinor=amountMinor(addon),baseProvider=provider(base);
 const link=String(addon?.combinationEvidence??'').trim(),compatible=normalize(addon?.compatibleBasePlan);
 if(!recurring(base)||!recurring(addon)||!baseMinor||!addonMinor||
  base.currency!==addon.currency||!marketEvidence(base,target.market)||!marketEvidence(addon,target.market)||
  !baseProvider||baseProvider!==provider(addon)||compatible!==normalize(base.planName)||
  !link||!canonicalUrl(base.sourceUrl)||!canonicalUrl(addon.sourceUrl)||
  !citations.has(canonicalUrl(base.sourceUrl))||!citations.has(canonicalUrl(addon.sourceUrl))||
  !evidence(base)||!evidence(addon)||!numberIn(evidence(base),baseMinor)||
  !numberIn(evidence(addon),addonMinor)||!numberIn(link,baseMinor)||!numberIn(link,addonMinor)||
  ![evidence(base),evidence(addon)].some(excerpt=>normalize(excerpt).includes(normalize(link)))||
  !normalize(evidence(base)).includes(baseProvider)||!normalize(evidence(addon)).includes(baseProvider)||
  !serviceMention(base,target)||!serviceMention(addon,target)||
  !normalize(link).includes(baseProvider)||!normalize(link).includes(normalize(target.serviceName))||
  !/\b(?:together|combined|same bill|compatible|sammen|samlet|kombinert|gemeinsam|conjunto)\b/iu.test(link))return null;
 const totalMinor=baseMinor+addonMinor;
 if(!Number.isSafeInteger(totalMinor))return null;
 const component=(row,role,minor)=>({role,planName:row.planName,monthlyPriceMinor:minor,
  sourceUrl:row.sourceUrl,aiExcerptSha256:sha(evidence(row))});
 return {...addon,planName:`${target.serviceName} Without Ads (Calculated Total)`,
  amount:totalMinor/100,ordinaryRecurringPrice:totalMinor/100,
  sourceEvidence:link,summary:'Calculated monthly total from a documented compatible base and ad-free add-on.',
  calculation:{schemaVersion:1,method:'MONTHLY_BASE_PLUS_AD_FREE_ADD_ON',currency:base.currency,
   billingProvider:base.billingProvider,compatibleBasePlan:base.planName,
   components:[component(base,'BASE',baseMinor),component(addon,'AD_FREE_ADD_ON',addonMinor)],
   compatibilityAiExcerptSha256:sha(link)},
  offerScope:'CALCULATED_TOTAL',warnings:[...(addon.warnings??[]),'CALCULATED_TOTAL_UNVERIFIED']};
}

export function analyzeSubscriptionOffers(rows,target,groundingCitations=[]){
 const accepted=[],bases=[],addons=[],complete=[],rejected={},calculatedRows=[];
 const seen=new Set();
 for(const row of rows??[]){
  const decision=classifySubscriptionOffer(row,target);
  if(decision.kind==='BASE'){
   const name=canonicalOfferName(row.planName);
   const normalized={...row,planName:name};
   const identity=[normalize(name),normalized.currency,amountMinor(normalized),canonicalUrl(normalized.sourceUrl)].join('\u0000');
   if(seen.has(identity))continue;
   seen.add(identity);
   accepted.push(normalized);
   if(recurring(normalized)&&canonicalUrl(normalized.sourceUrl)&&evidence(normalized)&&marketEvidence(normalized,target.market))bases.push(normalized);
  }else if(decision.kind==='COMPLETE'){
   const normalized={...row,offerScope:'COMPLETE_SUBSCRIPTION'};
   accepted.push(normalized);
   if(recurring(normalized))complete.push(normalized);
  }else{
   rejected[decision.reason]=(rejected[decision.reason]??0)+1;
   if(decision.kind==='ADDON')addons.push(row);
  }
 }
 const citations=citationSet(groundingCitations);
 for(const addon of addons.slice(0,8)){
  const compatible=bases.filter(base=>normalize(base.planName)===normalize(addon.compatibleBasePlan));
 if(compatible.length!==1)continue;
  const value=calculated(compatible[0],addon,target,citations);
  if(value)calculatedRows.push(value);
 }
 const codes=[];
 if(complete.length)codes.push('COMPLETE_PLAN_FOUND');
 if(calculatedRows.length)codes.push('CALCULATED_TOTAL_CREATED');
 if(addons.length&&!bases.length)codes.push('ADDON_FOUND_BASE_MISSING');
 else if(addons.length&&bases.length&&!calculatedRows.length)codes.push('COMPATIBILITY_UNPROVEN');
 else if(bases.length&&!addons.length&&!complete.length)codes.push('BASE_FOUND_ADDON_MISSING');
 if(!complete.length&&!calculatedRows.length&&!addons.length&&
   !bases.some(row=>adFree.test(evidence(row))))codes.push('NO_AD_FREE_OFFER_DOCUMENTED');
 return {accepted:[...accepted,...calculatedRows],rejected,findings:{codes,
  baseCount:bases.length,addonCount:addons.length,completeCount:complete.length,calculatedCount:calculatedRows.length,
  baseMentionsAdFree:bases.some(row=>adFree.test(evidence(row)))}};
}
