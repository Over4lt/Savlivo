// A scoped commercial assertion, never document-wide JSON market inheritance.
import {htmlTree,hash,normalizeText} from '../offline-recovery/extract.mjs';
import {corroborateMarket} from './market-corroboration.mjs';
import {structuredMarkets} from '../offline-recovery/attribution.mjs';
import {parseMarketQualification,unresolvedMarketQualification} from './market-qualification.mjs';
const pathOf=n=>n.parent?pathOf(n.parent)+'/'+n.tag+'['+n.index+']':'$';
const region=value=>{try{return new Intl.Locale(value).region??null;}catch{return null;}};
const url=(s,base)=>{try{const u=new URL(s,base);return u.protocol==='https:'&&!u.username&&!u.password?u:null;}catch{return null;}};
const norm=s=>normalizeText(s).normalize('NFKC');
const sentences=text=>text.split(/(?<=[.!?])\s+(?=[\p{Lu}])/u).slice(0,32);
const names=(text,plan)=>new RegExp('(?<![\\p{L}\\p{N}])'+plan.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'(?![\\p{L}\\p{N}])','iu').test(text);
export function compoundOfferMarket(candidate,resource,context){
 const r=candidate.prosePriceRelationship,receipt=resource.receipt,source=url(receipt.sourceUrl),age=Date.now()-Date.parse(resource.capturedAt??'');
 if(receipt.service!==context.service||!context.sourceOccurrences?.some(o=>o.id===resource.occurrence.id&&url(o.url)?.href===source?.href)||!context.authority||!receipt.intact||!receipt.serviceEstablished||!source||receipt.bodyHash!==hash(resource.body)||r?.bodyHash!==receipt.bodyHash||r.path!==candidate.structuredPath||!r.relationship?.planSpan||!r.relationship?.amountSpan||candidate.product!==r.relationship.plan||!(Number(candidate.amountNormalized)>0)||!Number.isFinite(age)||age<0||age>30*86400000)return null;
 const tree=htmlTree(resource.body),scripts=tree.nodes.filter(n=>n.tag==='script'&&n.attrs.id==='__NEXT_DATA__'&&n.attrs.type==='application/json');if(scripts.length!==1)return null;
 const script=scripts[0];let payload;try{payload=JSON.parse(script.raw);}catch{return null;}
 const pp=payload?.props?.pageProps,page=pp?.page,content=page?.fields?.content;
 const locale=pp?.locale??page?.sys?.locale,country=typeof locale==='string'?region(locale):null;
 if(pp?.preview!==false||country!==context.market||(page?.sys?.locale!=null&&page.sys.locale!==locale)||page?.sys?.contentType?.sys?.id!=='page')return null;
 const segments=source.pathname.split('/').filter(Boolean),slug=page.fields?.slug;
 if(segments[0]!==locale||typeof slug!=='string'||slug.includes('..')||segments.slice(1).join('/')!==slug)return null;
 const canonicals=tree.nodes.filter(n=>n.tag==='link'&&n.attrs.rel==='canonical');
 if(canonicals.some(n=>url(n.attrs.href,source)?.href!==source.href))return null;
 if(!/\b(?:ecomm|ecommerce|commerce|checkout|pricing)\b/iu.test(content?.fields?.name??''))return null;
 const prefix=pathOf(script)+'/props/pageProps/page/fields/content/fields/';
 if(!candidate.structuredPath?.startsWith(prefix))return null;
 const relative=candidate.structuredPath.slice(prefix.length);
 if(!/^(?:legalText|legalDisclaimer|officialDisclaimer|offerText|terms)\/(?:\d+\/)?fields(?:\/(?:variations|content)\/\d+\/fields)*\/text$/.test(relative))return null;
 let scopeReview=false;const inspectScope=v=>{for(const [key,value]of Object.entries(v??{})){if(!/^(?:country_?code|country|market|addressCountry|eligibleRegion|areaServed)$/i.test(key))continue;for(const item of Array.isArray(value)?value:[value])if(structuredMarkets({[key]:item},candidate.structuredPath).length!==1)scopeReview=true;}};
 let leaf=content.fields;for(const key of relative.split('/')){if(!leaf||typeof leaf!=='object'||!Object.hasOwn(leaf,key))return null;inspectScope(leaf);leaf=leaf[key];}
 if(typeof leaf!=='string'||leaf.length>2000||leaf!==candidate.rawEvidenceSnippet)return null;
 const text=norm(leaf),parts=sentences(text);if(parts.length>=32)return null;
 // The purchase assertion itself names the offer; mere neighboring links do not.
 const purchase=parts.find(s=>names(s,candidate.product)&&(
  /\b(?:can|may)\b.*\b(?:purchased|bought|acquired|subscribed)\b.*\b(?:through|via|from|at|on)\b/iu.test(s)||
  /\b(?:kann|können)\b.*(?<!\p{L})(?:über|bei)(?!\p{L}).*\b(?:erworben|gekauft|abonniert)\b/iu.test(s))&&
  [...s.matchAll(/(?:https:\/\/)?[a-z0-9.-]+\.[a-z]{2,}\/[^\s,;()]+/ig)].some(m=>{const dest=url(/^https:/.test(m[0])?m[0]:'https://'+m[0].replace(/[.!]$/,''));return dest?.origin===source.origin&&dest.pathname.split('/').filter(Boolean)[0]===locale;}));

 const base={country,plan:candidate.product,path:candidate.structuredPath,bodyHash:receipt.bodyHash,sourceUrl:source.href,capturedAt:resource.capturedAt,record:resource.occurrence.record,priceSourceHash:context.bodyHash,pricePath:candidate.structuredPath,join:'SAME_SOURCE_PAGE_OWNED_COMMERCIAL_OFFER'};
 const pagePath=pathOf(script)+'/props/pageProps/page',localization=receipt.bodyHash+':'+pagePath+':localization';
 const observations=[
  {dimension:'FINAL_ROUTE_CONTEXT',strength:'SUPPORTING',dependency:localization,locator:source.href},
  {dimension:'ACTIVE_PROVIDER_MARKET_STATE',strength:'SUPPORTING',dependency:localization,locator:pagePath,values:[pp.locale,page.sys.locale].filter(Boolean)},
  {dimension:'REGIONAL_COMMERCIAL_SURFACE',strength:'STRONG',dependency:localization,locator:pagePath+'/fields/content'},
  {dimension:'EXACT_OFFER_OWNERSHIP',strength:'STRONG',dependency:receipt.bodyHash+':'+candidate.structuredPath,locator:candidate.structuredPath,offer:r.relationship}
 ];
 if(purchase)observations.push({dimension:'OFFER_BOUND_PURCHASE_CONTEXT',strength:'STRONG',dependency:receipt.bodyHash+':purchase:'+candidate.structuredPath,locator:candidate.structuredPath,span:[text.indexOf(purchase),text.indexOf(purchase)+purchase.length]});
 // A real provider form is a transaction context, not a country label. Require
 // exact named offer input, same-origin action, and a billing-country control.
 const checkout=[],forms=tree.nodes.filter(n=>n.tag==='form');
 if(forms.length>16)scopeReview=true;
 for(const form of forms.slice(0,16)){
  let hidden=false;for(let n=form;n;n=n.parent)if(['template','noscript','script'].includes(n.tag)||Object.hasOwn(n.attrs??{},'hidden')||n.attrs?.['aria-hidden']==='true'||/display\s*:\s*none|visibility\s*:\s*hidden/i.test(n.attrs?.style??''))hidden=true;
  if(hidden)continue;
  if(typeof form.attrs.action!=='string'||!form.attrs.action.trim())continue;
  const action=url(form.attrs.action,source);if(!action||action.origin!==source.origin)continue;
  const routeRegion=region(action.pathname.split('/').filter(Boolean)[0]);if(routeRegion&&routeRegion!==country)continue;
  const children=tree.nodes.filter(n=>{for(let p=n.parent;p;p=p.parent){if(p===form)return true;if(['form','template','noscript','script'].includes(p.tag)||Object.hasOwn(p.attrs??{},'disabled')||Object.hasOwn(p.attrs??{},'hidden')||p.attrs?.['aria-hidden']==='true'||/display\s*:\s*none|visibility\s*:\s*hidden/i.test(p.attrs?.style??''))return false;}return false;});
  const identities=children.filter(n=>n.tag==='input'&&/^(?:plan|product|subscription)$/i.test(n.attrs.name??'')&&!Object.hasOwn(n.attrs,'disabled'));
  if(identities.length!==1||norm(identities[0].attrs.value??'')!==norm(candidate.product))continue;
  const controls=children.filter(n=>n.tag==='select'&&/^(?:billingCountry|billing_country|billingAddress\.country)$/i.test(n.attrs.name??'')&&!Object.hasOwn(n.attrs,'disabled')&&!Object.hasOwn(n.attrs,'hidden')&&n.attrs['aria-hidden']!=='true');
  if(controls.length!==1)continue;
  const options=controls[0].children.filter(n=>n.tag==='option'&&n.attrs.value===country);
  if(options.length!==1)continue;
  const rejected=Object.hasOwn(options[0].attrs,'disabled');
  const locator=pathOf(options[0]);
  checkout.push({...base,type:'EXACT_OFFER_CHECKOUT_COUNTRY',negative:rejected,reviewStatus:'ESTABLISHED',establishesMarket:false,path:locator,qualificationType:'BILLING_COUNTRY',scopeSubject:candidate.product,action:action.href});
  if(!rejected)observations.push({dimension:'CHECKOUT_OR_BILLING_CONTEXT',strength:'STRONG',dependency:receipt.bodyHash+':'+pathOf(form),locator,action:action.href});
 }
 const corroboration=corroborateMarket(observations);
 const evidence=[{...base,type:'COMPOUND_REGIONAL_COMMERCIAL_OFFER',negative:false,establishesMarket:corroboration.status==='ESTABLISHED',reviewStatus:'ESTABLISHED',scopeSubject:candidate.product,qualificationType:'CORROBORATED_COMMERCIAL_CONTEXT',corroboration,binding:{pagePath,localePaths:['/props/pageProps/locale','/props/pageProps/page/sys/locale'],slug,legalTextPath:candidate.structuredPath,coordinate:'NORMALIZED_SOURCE_TEXT_UTF16',offer:r.relationship}},...checkout];
 if(scopeReview)evidence.push({...base,negative:false,type:'UNRESOLVED_MARKET_QUALIFICATION',reviewStatus:'REVIEW_REQUIRED',qualificationType:'UNSUPPORTED_STRUCTURED_SCOPE'});
 for(const sentence of parts){let statement=sentence;
  if(/^(?:this |the )offer\b/iu.test(statement))statement=statement.replace(/^(?:this |the )offer/iu,candidate.product);
  const assertion=parseMarketQualification(statement,candidate.product);
  if(assertion){const applies=assertion.countries.includes(country),negative=assertion.polarity==='NEGATIVE'?applies:assertion.exclusive&&!applies;
   if(applies||negative)evidence.push({...base,...assertion,country,negative,type:'EXPLICIT_PROVIDER_MARKET_STATEMENT',textSpan:[text.indexOf(sentence),text.indexOf(sentence)+sentence.length]});
  }else if(unresolvedMarketQualification(statement,candidate.product)){
   evidence.push({...base,negative:false,type:'UNRESOLVED_MARKET_QUALIFICATION',reviewStatus:'REVIEW_REQUIRED',qualificationType:'UNSUPPORTED_APPLICABILITY_SCOPE',textSpan:[text.indexOf(sentence),text.indexOf(sentence)+sentence.length]});
  }
 }
 return evidence;
}
