// Evidence consumption only. Country is never taken from the acquisition target
// to choose a denomination; it must be independently selected by the provider.
import {hash,normalizeText} from './extract.mjs';
import {countryLabel} from './attribution.mjs';
const pathOf=n=>n.parent?pathOf(n.parent)+'/'+n.tag+'['+n.index+']':'$';
const clean=x=>String(x??'').normalize('NFKC').replace(/\.$/,'').trim();
const currencies=Intl.supportedValuesOf('currency');
const symbols=new Map();
function denomination(locale,token){
 const key=locale+'|'+clean(token);if(symbols.has(key))return symbols.get(key);
 const matches=currencies.filter(currency=>{try{return clean(new Intl.NumberFormat(locale,{style:'currency',currency,currencyDisplay:'symbol'}).formatToParts(1).find(p=>p.type==='currency')?.value)===clean(token);}catch{return false;}});
 const result=matches.length===1?matches[0]:null;symbols.set(key,result);return result;
}
const region=l=>{try{return new Intl.Locale(l).region??null;}catch{return null;}};
const proofNode=n=>({path:pathOf(n),span:[n.start,n.openEnd],attributes:n.attrs});
export function providerCurrencyContext(source,c){
 const nodes=[...source.nodes.values()],html=nodes.find(n=>n.tag==='html');
 const lang=html?.attrs.lang;if(!lang)return null;
 const declarations=[],proof=[];
 for(const p of c.attribution?.providerPageEvidence??[]){
  if(p.status==='CONFLICTING')return null;
  if(p.status==='ESTABLISHED'&&p.bodyHash===source.bodyHash){declarations.push(p.country);proof.push(p);}
 }
 // Active locale controls, not language alone or any item in a country menu.
 for(const n of nodes){
  if(n.attrs?.['data-current-locale-code']){const r=region(n.attrs['data-current-locale-code']);if(!r)return null;declarations.push(r);proof.push(proofNode(n));}
  if(n.tag==='button'&&n.attrs?.['data-testid']==='locale-switcher-button'){const r=countryLabel(n.text);if(!r)return null;declarations.push(r);proof.push({...proofNode(n),text:n.text});}
 }
 const countries=[...new Set(declarations)];if(countries.length!==1)return null;
 const country=countries[0];if(country!==c.market||region(lang)&&region(lang)!==country)return null;
 if((c.attribution?.providerConflictingEvidence?.length??0)||(c.attribution?.geoConflictingEvidence?.length??0)||(c.attribution?.conflictingMarketEvidence?.length??0))return null;
 // Provider-selected country is independent evidence. A missing geo bracket on
 // an admitted Direct response is not a currency conflict and is not required
 // as redundant corroboration. Explicit provider/geo conflicts above still veto.
 const selectedLocale=proof.filter(p=>p.pattern==='EXACT_SELF_ALTERNATE_AND_CANONICAL_COUNTRY_ROUTE').flatMap(p=>p.fields??[]).find(f=>f.path?.endsWith('/attributes/hreflang'))?.value;
 let locale;try{locale=new Intl.Locale(selectedLocale??lang,{region:country}).toString();}catch{return null;}
 return {country,locale,proof:[proofNode(html),...proof]};
}
function eligible(c,source){
 const m=c.commercial,a=c.attribution;
 // Currency enrichment must not rescue free introductory amounts or explicitly
 // duration-limited primary offers that an older semantic branch called monthly.
 if(!(Number(c.amountNormalized)>0)||(m?.conditions??[]).some(x=>String(x).startsWith('EXPLICIT_DURATION:')))return false;
 if(c.currency||!c.authorityEstablished||!c.product||!c.productOwnerEvidence?.path||!c.productOwnerEvidence.raw||c.ownershipAmbiguous||c.crossCardRisk||c.nonPriceNumericRisk||c.qualifierAmbiguous||c.billingPeriodAmbiguous)return false;
 if(!a?.productOwnershipEstablished||!a.marketApplicabilityEstablished||m?.type!=='RECURRING_MONTHLY'||!m.ordinaryMonthly||m.nonRenewing||m.prepaid||m.oneTimePayment||m.monthlyEquivalentDisplay||m.monthlyBlockers.includes('NOT_PRINCIPAL_MONTHLY_CHARGE'))return false;
 if((c.blockingReasons??[]).some(r=>r!=='CURRENCY_UNRESOLVED')||m.reasons.length)return false;
 const owner=source.nodes.get(c.qualifierPreservation?.ownerPath);
 if(owner&&/\b(?:from|fra|från|ab|à partir de)\s+[\d$€£]/iu.test(owner.text))return false;
 return true;
}
function isoDeclarations(source){
 const values=[];
 for(const {value}of source.objects.values())if(value&&!Array.isArray(value))for(const k of ['priceCurrency','currency','currencyCode'])if(typeof value[k]==='string'&&currencies.includes(value[k]))values.push(value[k]);
 return [...new Set(values)];
}
function linkedTerms(c,source,context){
 const owner=source.nodes.get(c.qualifierPreservation?.ownerPath);if(!owner)return null;
 const nodes=[...source.nodes.values()],links=nodes.filter(n=>n.tag==='a'&&n.start>=owner.start&&n.end<=owner.end&&/customer agreement|subscription terms|terms and conditions/i.test(n.text));
 const proofs=[];
 for(const link of links){let url;try{url=new URL(link.attrs.href,context.sourceOccurrences?.[0]?.url).href;}catch{continue;}
  const matches=(context.governingResources??[]).filter(r=>r.url===url);
  if(new Set(matches.map(r=>r.receipt?.bodyHash)).size>1)return null;
  for(const r of matches.slice(0,1)){
   const receipt=r.receipt;if(!receipt?.intact||!receipt.serviceEstablished||receipt.service!==c.service||receipt.geo?.classification!=='G1'||receipt.geo.geoCountry!==c.market||receipt.geo.targetCountry!==c.market||hash(r.body)!==receipt.bodyHash)continue;
   const a=context.sourceOccurrences?.[0]?.authority,b=receipt.serviceEvidence?.authority;
   if(!a?.provider||a.provider!==b?.provider||!/^OFFICIAL_(PROVIDER|SUPPORT)$/.test(a.sourceType)||!/^OFFICIAL_(PROVIDER|SUPPORT)$/.test(b?.sourceType??''))continue;
   if((a.channel??'direct')!==(b.channel??'direct'))continue;
   // A scoped incorporated agreement, not a navigation link to unrelated text.
   if(!/\b(?:see|provided in|subject to|governed by)\b[^.]{0,100}\b(?:customer agreement|subscription terms|terms and conditions)\b/i.test(owner.text))continue;
   const text=normalizeText(r.body.replace(/<[^>]*>/g,' '));
   const match=/If you purchase a paid Subscription, you agree to pay us in advance, in ([A-Za-z ]+), as follows:/i.exec(text);
   if(!match)continue;
   const display=new Intl.DisplayNames(['en'],{type:'currency'}),name=match[1].toLowerCase().replace(/s$/,'');
   const codes=currencies.filter(code=>display.of(code).toLowerCase().replace(/s$/,'')===name);if(codes.length!==1)continue;
   proofs.push({currency:codes[0],kind:'EXPLICITLY_INCORPORATED_PAYMENT_TERMS',offer:{bodyHash:source.bodyHash,path:c.structuredPath,ownerPath:c.qualifierPreservation.ownerPath},link:{...proofNode(link),url},terms:{bodyHash:receipt.bodyHash,url,retainedUrl:r.retainedUrl??url,redirectEvidence:r.redirectEvidence??null,clause:match[0],receipt},scope:{service:c.service,market:c.market,channel:a.channel??'direct'}});
  }
 }
 return proofs.length===1?proofs[0]:null;
}
export function resolveContextualCurrency(c,source,context={}){
 if(!source||!eligible(c,source))return null;
 // Incorporated terms cannot override an incompatible active storefront either.
 const a=c.attribution;
 if((a.providerPageEvidence??[]).some(p=>p.status==='CONFLICTING'||p.status==='ESTABLISHED'&&p.country!==c.market)||(a.providerConflictingEvidence?.length??0)||(a.geoConflictingEvidence?.length??0)||(a.conflictingMarketEvidence?.length??0))return null;
 for(const n of source.nodes.values()){
  const selected=n.attrs?.['data-current-locale-code'],button=n.tag==='button'&&n.attrs?.['data-testid']==='locale-switcher-button';
  if(selected&&region(selected)!==c.market||button&&countryLabel(n.text)!==c.market||n.tag==='html'&&region(n.attrs.lang)&&region(n.attrs.lang)!==c.market)return null;
 }
 const provider=providerCurrencyContext(source,c);
 const local=provider&&denomination(provider.locale,c.currencyRaw);
 const terms=linkedTerms(c,source,context);
 if(local&&terms&&local!==terms.currency)return null;
 const currency=terms?.currency??local;if(!currency)return null;
 // Unrelated/global ISO data cannot supply a currency and contradictions veto.
 if(isoDeclarations(source).some(x=>x!==currency))return null;
 const proof=terms??{kind:'PROVIDER_SELECTED_LOCAL_DENOMINATION',bodyHash:source.bodyHash,path:c.structuredPath,displayToken:c.currencyRaw,currency,provider,algorithm:'UNIQUE_INTL_LOCALE_CURRENCY_SYMBOL',icuVersion:process.versions.icu};
 c.currency=currency;c.currencyAmbiguous=false;c.currencyResolution=proof;
 c.blockingReasons=c.blockingReasons.filter(r=>r!=='CURRENCY_UNRESOLVED');
 c.verificationLevel=Math.max(c.verificationLevel??1,3);
 return proof;
}
