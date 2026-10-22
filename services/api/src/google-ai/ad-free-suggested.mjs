import {createHash} from 'node:crypto';
import {nonStandalonePresentation} from '../research-v3/offering-scope.mjs';
import {countryCurrencyData} from '../../../../packages/contracts/src/markets.ts';
import {parse as parseDomain} from 'tldts';

const adFree=/\b(?:ad[- ]?free|without ads?|reklamefri|reklamfri|uten reklame|werbefrei)\b/iu;
export const primeVideoAdFreeName=name=>adFree.test(String(name??''));
const ancillary=/\b(?:add[- ]?on|upgrade|extra charge|additional charge|supplement|tillegg|remove ads|fjerne reklame)\b/iu;
const excluded=/\b(?:channels?|rentals?|rent|purchases?|buy|pay[- ]?per[- ]?view|bundles?|packages?|pakket?|pakke|combo)\b/iu;
const primeMembership=/^(?:amazon\s+prime\b(?!\s+video)|prime\s+(?:student|access|for young adults|membership|mitgliedschaft)\b)/iu;
const monthly=value=>/^(?:MONTH|MONTHLY|MONTHLY_RECURRING)$/iu.test(String(value??''));
const sha=value=>createHash('sha256').update(value).digest('hex');
const minor=value=>{
 const n=Number(value);
 if(!Number.isFinite(n)||n<=0||!Number.isSafeInteger(Math.round(n*100))||Math.abs(n*100-Math.round(n*100))>1e-6)return null;
 return Math.round(n*100);
};
const urlHost=value=>{try{const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password?url.hostname.toLowerCase().replace(/^www\./,''):null;}catch{return null;}};
const canonicalUrl=value=>{try{const url=new URL(value);if(url.protocol!=='https:'||url.username||url.password)return null;url.hash='';return url.href;}catch{return null;}};
const billingProviderConfirmed=(link,host)=>{
 const brand=parseDomain(host).domain?.split('.')[0];
 if(!brand)return false;
 const provider=brand==='primevideo'?'(?:Amazon|Prime Video)':brand.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
 return new RegExp(`\\b(?:billed together by|same bill from|faktureres sammen av)\\s+${provider}\\b`,'iu').test(link);
};
const ordinary=row=>monthly(row?.paymentCadence)&&row?.annualOnly!==true&&row?.freeTier!==true&&
 !/\b(?:annual|yearly|upfront|intro(?:ductory)?|promotion|trial|one[- ]?time)\b/iu.test([row?.billingBasis,row?.commitment].join(' '))&&
 row?.introPrice==null&&minor(row?.ordinaryRecurringPrice??row?.amount)!==null&&/^[A-Z]{3}$/u.test(String(row?.currency??''));
const evidence=row=>String(row?.sourceEvidence??'').trim();
const marketContext=(row,market)=>{
 const text=String(row?.marketEvidence??'').toLowerCase();
 const name=countryCurrencyData.find(([code])=>code===market)?.[1]?.toLowerCase();
 const local=market==='NO'&&/\bnorge\b/u.test(text);
 const other=countryCurrencyData.some(([code,label])=>code!==market&&text.includes(label.toLowerCase()+' only'));
 const coded=/\b([a-z]{2})\s+only\b/u.exec(text);
 return !other&&(!coded||coded[1].toUpperCase()===market)&&
   (Boolean(name&&text.includes(name))||new RegExp(`\\b${market.toLowerCase()}\\b`,'u').test(text)||local);
};
const details=row=>[row?.planName,row?.billingBasis,row?.commitment,row?.summary,row?.sourceEvidence].filter(Boolean).join(' ');
const isAddon=row=>adFree.test(String(row?.planName??''))&&
 (nonStandalonePresentation(String(row?.planName??''),'Prime Video')||ancillary.test(details(row)));
const completeTierEvidence=text=>
 /\b(?:includes?|covers?|gives? access to)\b.{0,100}\b(?:prime video|catalog(?:ue)?|films?|movies?|series|streaming|video access)\b/iu.test(text)||
 /\b(?:total|all[- ]?in|entire|whole|complete|full|standalone|samlet|ordinær)\b.{0,80}\b(?:monthly|month|subscription|abonnement|plan|tier|månedspris)\b/iu.test(text)||
 /\b(?:monthly|month|subscription|abonnement|plan|tier|månedspris)\b.{0,80}\b(?:total|all[- ]?in|entire|whole|complete|full|standalone|samlet|ordinær)\b/iu.test(text);

// The V4 answer is a Suggested lead, not acquired provider evidence. An
// ambiguous ad-free price stays out of the standalone plan list.
export function primeVideoSuggestedScope(row,targetMarket){
 const name=String(row?.planName??''),description=details(row);
 if(nonStandalonePresentation(name,'Prime Video')||excluded.test(name)||primeMembership.test(name)||
   /\b(?:included with|part of)\s+amazon prime\b/iu.test(description))return 'NON_STANDALONE';
 if(!adFree.test(name))return null;
 if(ancillary.test(description))return 'NON_STANDALONE';
 const excerpt=evidence(row);
 if(!urlHost(row?.sourceUrl)||!marketContext(row,targetMarket)||!excerpt||
   !/\b(?:subscription|abonnement|plan|tier|månedspris|monthly price|total monthly|samlet månedspris)\b/iu.test(excerpt)||
   !/\b(?:monthly|month|måned|mnd|monat)\b/iu.test(excerpt)||!completeTierEvidence(excerpt)||
   (minor(row?.ordinaryRecurringPrice??row?.amount)!==null&&!mentionsAmount(excerpt,minor(row?.ordinaryRecurringPrice??row?.amount))))return 'NON_STANDALONE';
 return null;
}

const mentionsAmount=(text,amount)=>{
 const plain=(amount/100).toFixed(2),whole=String(amount/100);
 return [plain,plain.replace('.',','),whole,whole.replace('.',',')].some(value=>
   new RegExp(`(?:^|[^\\d])${value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}(?!\\d)`,'u').test(text));
};

// A sum is emitted only when the same source family explicitly ties both
// recurring charges to one bill. A model summary alone cannot make the link.
export function composePrimeVideoAdFree(rows,target,groundingCitations=[]){
 if(target.service!=='prime-video')return null;
 const bases=rows.filter(row=>!adFree.test(String(row?.planName??''))&&primeVideoSuggestedScope(row,target.market)===null&&ordinary(row));
 const addons=rows.filter(row=>isAddon(row)&&ordinary(row));
 if(bases.length!==1||addons.length!==1)return null;
 const [base]=bases,[addon]=addons,baseMinor=minor(base.ordinaryRecurringPrice??base.amount),addonMinor=minor(addon.ordinaryRecurringPrice??addon.amount);
 const grounded=new Set(groundingCitations.map(row=>canonicalUrl(row?.url)).filter(Boolean));
 if(base.currency!==addon.currency||!baseMinor||!addonMinor||
   !urlHost(base.sourceUrl)||urlHost(base.sourceUrl)!==urlHost(addon.sourceUrl)||
   !grounded.has(canonicalUrl(base.sourceUrl))||!grounded.has(canonicalUrl(addon.sourceUrl))||
   !marketContext(base,target.market)||!marketContext(addon,target.market)||
   /\b(?:different|separate)\s+(?:billing|provider|account)\b/iu.test(details(addon)))return null;
 const link=evidence(addon);
 if(!/\bprime\s+video\b/iu.test(link)||
   !/\b(?:plus|on top of|in addition to|together with|sammen med|i tillegg til)\b/iu.test(link)||
   !billingProviderConfirmed(link,urlHost(base.sourceUrl))||
   !mentionsAmount(link,baseMinor)||!mentionsAmount(link,addonMinor))return null;
 const totalMinor=baseMinor+addonMinor;
 if(!Number.isSafeInteger(totalMinor))return null;
 const component=(row,role,amountMinor)=>({role,planName:String(row.planName),monthlyPriceMinor:amountMinor,
   sourceUrl:String(row.sourceUrl),aiExcerptSha256:sha(evidence(row))});
 const calculation={schemaVersion:1,method:'MONTHLY_BASE_PLUS_AD_FREE_ADD_ON',currency:base.currency,
   components:[component(base,'BASE',baseMinor),component(addon,'AD_FREE_ADD_ON',addonMinor)],
   compatibilityAiExcerptSha256:sha(link)};
 return {...addon,planName:'Prime Video Without Ads (Calculated Total)',amount:totalMinor/100,
   ordinaryRecurringPrice:totalMinor/100,sourceUrl:addon.sourceUrl,
   sourceEvidence:link,marketEvidence:addon.marketEvidence,summary:'Calculated monthly total from documented base and ad-free add-on.',
   calculation,offerScope:'CALCULATED_TOTAL',warnings:[...(addon.warnings??[]),'CALCULATED_TOTAL_UNVERIFIED']};
}
