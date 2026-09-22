// Normalize a displayed unit only after provider market context is bound.
import {extractPage} from './public-web-adapter.mjs';
const currencies=Intl.supportedValuesOf('currency'),cache=new Map();
export function providerCurrencyContext(task,page){
 if(!/^[A-Z]{2}$/.test(task.countryCode)||!page.rawSource?.text||!page.sourceIntegrity?.sha256)return null;
 const proof=page.transportProof,x=extractPage(page.rawSource.text,page.url);
 const geo=proof?.version===2&&proof.level==='BRACKET_VERIFIED'&&proof.attemptId&&[proof.requestedCountry,proof.before,proof.after,page.targetCountry].every(c=>c===task.countryCode);
 const routed=new RegExp('(?:^|/)'+task.countryCode+'(?:-[a-z]{2})?(?:/|$)','i').test(new URL(page.url).pathname)&&new RegExp('^[a-z]{2,3}-'+task.countryCode+'$','i').test(x.declaredLanguage??'');
 if(!geo&&!routed)return null;
 return {version:1,market:task.countryCode,locale:new Intl.Locale('und-'+task.countryCode).maximize().toString(),sourceHash:page.sourceIntegrity.sha256,basis:geo?'VERIFIED_MARKET_TRANSPORT':'OFFICIAL_LOCAL_ROUTE'};
}
export function groundedCurrency(token,context){
 const raw=token.trim();if(currencies.includes(raw))return raw;
 const explicit=({'€':'EUR','£':'GBP','R$':'BRL'})[raw];if(explicit)return explicit;
 if(!context)return null;
 if(!cache.has(context.locale)){
  const units=new Map();for(const currency of currencies){const unit=new Intl.NumberFormat(context.locale,{style:'currency',currency}).formatToParts(1).find(p=>p.type==='currency')?.value;
   const values=units.get(unit)??[];values.push(currency);units.set(unit,values);}
  cache.set(context.locale,units);
 }
 const matches=cache.get(context.locale).get(raw);return matches?.length===1?matches[0]:null;
}
