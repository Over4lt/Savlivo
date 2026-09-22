import {validateStructuredRelationship,structuredSemanticContainers} from './associated-structured-resources.mjs';
import {hydrateRetainedBody} from './retained-body-reference.mjs';
import {providerCurrencyContext,groundedCurrency} from './price-currency-context.mjs';
import {retainedSemanticOffers} from './semantic-price.mjs';
// Bounded first-party HTML proof. Never consumes provider parser proposals.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const currencies=new Set(Intl.supportedValuesOf('currency'));
import {extractPage} from './public-web-adapter.mjs';
import {providerPriceStructure,structuralPriceCards,cardIntervalSemantics,earlySemanticSections} from './provider-price-structure.mjs';
export const officialLocalPriceForm='OFFICIAL_LOCAL_PRICE_V1';
const sha=s=>createHash('sha256').update(s).digest('hex');
const clean=s=>extractPage(s,'https://example.com').text.replace(/\s+/g,' ').trim();
export function officialLocalOffers(task,page,at,marketName,semanticPricePolicy=null){
 page=hydrateRetainedBody(page);
 const raw=page.rawSource?.text,dimensions={};
 const require=(key,condition)=>{dimensions[key]=condition?'ESTABLISHED':'MISSING';assert(condition,key);};
 try{
 require('FRESHNESS',Number.isFinite(Date.parse(page.checkedAt))&&Date.parse(at)>=Date.parse(page.checkedAt));
 require('FIRST_PARTY_AUTHORITY',typeof raw==='string'&&Buffer.byteLength(raw)<=8000000&&page.outcome==='OK'&&page.httpStatus===200&&['OFFICIAL_PROVIDER','OFFICIAL_SUPPORT'].includes(page.sourceType)&&(page.authority?.status==='CONFIGURED_REVIEWED'||validateStructuredRelationship(page))&&page.authority.provider===task.serviceName&&page.authority.hostname===new URL(page.url).hostname&&page.authority.sourceType===page.sourceType&&page.sourceIntegrity?.sha256===sha(raw)&&page.sourceIntegrity.checkedAt===page.checkedAt&&page.accessDecisions?.length>0&&page.accessDecisions.every(d=>['ALLOWED','NO_ROBOTS_POLICY'].includes(d.decision)));
 const x=extractPage(raw,page.url,{maxText:8000000,maxLinks:100});
 require('CURRENT_OFFER_CONTEXT',!/archiv|historical|example|demonstration|discontinued/i.test(x.title));
 const proof=page.transportProof,geo=proof?.version===2&&proof.level==='BRACKET_VERIFIED'&&typeof proof.attemptId==='string'&&proof.attemptId.length>0&&[proof.requestedCountry,proof.before,proof.after,page.targetCountry].every(c=>c===task.countryCode);
 const routed=new RegExp('(?:^|/)'+task.countryCode.toLowerCase()+'(?:-[a-z]{2})?(?:/|$)','i').test(new URL(page.url).pathname)&&new RegExp('^[a-z]{2,3}-'+task.countryCode+'$','i').test(x.declaredLanguage??'');
 require('MARKET_BINDING',geo||routed||typeof marketName==='string'&&(x.title.includes(marketName)||x.text.split('\n').some(l=>l.trim()===marketName||l.trim().startsWith(marketName+' ('))));
 if(page.contentType==='application/json'&&page.structuredRelationship){
  require('RESOURCE_RELATIONSHIP',validateStructuredRelationship(page));
  const containers=structuredSemanticContainers(raw),offers=retainedSemanticOffers(task,page,containers,semanticPricePolicy,dimensions,at);
  for(const o of offers)if(offers.some(p=>p!==o&&p.value.plan===o.value.plan&&p.value.cadence===o.value.cadence&&p.value.currency===o.value.currency&&p.value.offerType===o.value.offerType&&p.value.amount!==o.value.amount))o.dimensions.CONFLICT_STATE='CONFLICT';
  return {dimensions,containers,offers};
 }
 const structure=providerPriceStructure(raw),visible=structure.visible;
 const headings=[...visible.matchAll(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1\s*>/gi)];assert(headings.length<=500,'Heading bound');
 const periods='month|mo|monthly|year|yr|annually|yearly';
 const money='(?:(R\\$|\\$|€|£|[A-Z]{3})\\s*((?:0|[1-9]\\d*)(?:[.,]\\d{1,2})?)|((?:0|[1-9]\\d*)(?:[.,]\\d{1,2})?)\\s*([\\p{L}\\p{Sc}]{1,8}))';
 const recurringPattern=new RegExp('^(then\\s+|renews?\\s+(?:at\\s+)?)?'+money+'\\s*(?:/\\s*|per\\s+|(?=monthly|annually|yearly))('+periods+')(\\s+after(?:\\s+(?:the\\s+)?(?:introductory|trial|promotional)\\s+(?:period|offer))?)?\\.?\\s*$','iu');
 const introPattern=new RegExp('^'+money+'\\s+for\\s+(\\d{1,2})\\s+(months?|weeks?|days?)\\s*$','iu');
 const amountPresentation=new RegExp('^'+money+'(?:\\s*[/]\\s*[\\p{L}\\p{M} .-]{1,80}|\\s+[\\p{L}\\p{M} .-]{1,80})?\\s*$','u');
 const priceLike=t=>/(?:[\p{Sc}]|[A-Z]{3})\s*\p{Nd}|\p{Nd}(?:[.,]\p{Nd}+)?\s*[\p{L}\p{Sc}]/u.test(t);
 const currencyContext=providerCurrencyContext(task,page);
 const explicitMoney=t=>/(?:[\p{Sc}]|[A-Z]{3})\s*\p{Nd}|\p{Nd}\s*[A-Z]{3}\b/u.test(t);
 const cards=structuralPriceCards(structure,t=>recurringPattern.test(t)||amountPresentation.test(t)&&explicitMoney(t));
 // Broad numeric candidates are semantic contexts only: capacity/features must
 // not replace a deterministically associated plan heading.
 const weakCards=structuralPriceCards(structure,priceLike).filter(c=>!cards.some(p=>c.start>=p.start&&c.end<=p.end));
 const sections=headings.map((h,i)=>({start:h.index,end:headings[i+1]?.index??Math.min(raw.length,h.index+20000),plan:clean(h[2])})).filter(s=>!cards.some(c=>c.start>=s.start&&c.end<=s.end&&c.plan!==s.plan));
 sections.push(...cards);
 const offers=[];
 for(const section of sections){
  const {start,end,plan}=section,fragment=raw.slice(start,end);if(fragment.length>20000||!plan||plan.length>100||/^(plan description|plan details|pricing|features|compare plans)$/i.test(plan))continue;
  const text=extractPage(visible.slice(start,end),page.url,{maxText:20000,maxLinks:30}).text,lines=text.split('\n').map(s=>s.trim()).filter(Boolean);
  const semantics=cardIntervalSemantics(structure,start,end);
  const prohibited=/unavailable|not available|cannot|can't|example|illustrat|historical|discontinued|no longer|prepaid|does not auto.renew|equivalent|save \d|discount/i.test(text);
  const promoContext=/trial|introduct|promot|\bfree\b|\bafter\b|\bthen\b/i.test(text);
  const tokens=lines.slice(1,10).flatMap(line=>line.split(/,\s*(?=then\b)/i));
  const introMatch=line=>{const m=line.match(introPattern);if(m)return m;const zero=line.match(/^0\s+for\s+(\d{1,2})\s+(months?|weeks?|days?)$/i);if(!zero)return null;const cc=[...new Set(tokens.map(t=>t.match(recurringPattern)).filter(q=>q&&(q[1]||q[7])).map(q=>q[2]??q[5]))];return cc.length===1?[line,cc[0],'0',undefined,undefined,zero[1],zero[2]]:null;};
  for(const line of tokens){
   let recurring=line.match(recurringPattern);
   const introductory=introMatch(line),localText=!recurring&&!introductory?line.match(amountPresentation):null;
   if(localText)recurring=[line,undefined,localText[1],localText[2],localText[3],localText[4],semantics.cadence??'UNKNOWN',undefined];
   if(!recurring&&!introductory)continue;
   const m=recurring??introductory,offset=recurring?1:0,token=m[offset+1]??m[offset+4],amount=m[offset+2]??m[offset+3];
   const explicitCodes=[...new Set((text.match(/\b[A-Z]{3}\b/g)??[]).filter(c=>currencies.has(c)))];
   const currency=token==='$'?(explicitCodes.length===1?explicitCodes[0]:null):groundedCurrency(token,currencyContext);if(!currencies.has(currency)&&!(token==='$'&&recurring&&!localText))continue;
   const linkedIntro=!!recurring&&!!m[7]&&tokens.slice(0,tokens.indexOf(line)).some(t=>!!introMatch(t));
   const explicitOngoing=!!recurring&&(!!m[1]||linkedIntro||/after\s+(?:the\s+)?(?:introductory|trial|promotional)\s+(?:period|offer)/i.test(m[7]??''));
   const pairedIntro=!!introductory&&tokens.some(t=>{const q=t.match(recurringPattern);return q&&(q[1]||q[7]);});
   if(introductory&&!pairedIntro)continue;
   const cadence=recurring?(m[6]==='UNKNOWN'?'UNKNOWN':/^(year|yr|annually|yearly)$/i.test(m[6])?'YEAR':'MONTH'):'OTHER';
   const cadenceConflict=semantics.cadenceConflict||!!semantics.cadence&&!!recurring&&cadence!=='UNKNOWN'&&semantics.cadence!==cadence;
   const value={amount:amount.replace(',','.'),currency:currency??'UNKNOWN',plan,cadence,cadenceDescription:recurring?(cadence==='MONTH'?'Monthly':cadence==='YEAR'?'Yearly':'Unknown cadence'):m[5]+' '+m[6],billingRoute:'DIRECT',billingProvider:task.serviceName,offerType:localText?(semantics.offerType==='TRIAL_FREE'?'TRIAL':semantics.offerType??'ORDINARY_RECURRING'):recurring?'ORDINARY_RECURRING':'PROMOTIONAL',taxTreatment:'UNKNOWN',taxNote:null};
   const hardStop=/example|illustrat|historical|discontinued|no longer|cannot|can't/i.test(text);
   const semanticType=semantics.offerType==='TRIAL_FREE'?'TRIAL':semantics.offerType;
   const commercial=!semantics.offerConflict&&(!semanticType||semanticType===value.offerType)&&!hardStop&&(localText?!!semantics.offerType&&(semantics.offerType!=='TRIAL_FREE'||Number(amount)===0):explicitOngoing||introductory&&pairedIntro||!prohibited&&!promoContext);
   offers.push({value,quote:line,interpretation:{rawWording:line,cadenceBasis:localText?'SOURCE_INTERVAL_CONTEXT':'EXPLICIT_RATE_TEXT',intervals:semantics.intervals},fragment:{offset:start,length:fragment.length,sha256:sha(fragment)},dimensions:{...dimensions,PLAN_BINDING:'ESTABLISHED',AMOUNT:'ESTABLISHED',CURRENCY:currency?'ESTABLISHED':'MISSING',CADENCE:cadenceConflict?'CONFLICT':cadence==='UNKNOWN'?'MISSING':'ESTABLISHED',COMMERCIAL_SEMANTICS:commercial?'ESTABLISHED':'AMBIGUOUS',CONFLICT_STATE:'ESTABLISHED'}});
  }
 }
 const containers=[...sections,...weakCards].filter(c=>c.end-c.start<=20000).map(c=>({...c,text:extractPage(visible.slice(c.start,c.end),page.url,{maxText:20000,maxLinks:0}).text})).filter(c=>priceLike(c.text));
 if(!containers.length&&semanticPricePolicy)containers.push(...earlySemanticSections(structure));
 // A locator revision must not discard a valid retained interpretation of the
 // exact same bounded visible fragment. Reconstruct, never trust cached text.
 for(const r of page.semanticPriceInterpretations??[]){const c=r.context?.container;
  if(r.status!=='COMPLETE'||!c||r.context.sourceHash!==page.sourceIntegrity.sha256||JSON.stringify(r.context.policy)!==JSON.stringify(semanticPricePolicy)||!Number.isSafeInteger(c.offset)||!Number.isSafeInteger(c.length)||c.offset<0||c.length<=0||c.length>20000||c.offset+c.length>raw.length)continue;
  if(sha(raw.slice(c.offset,c.offset+c.length))!==c.sha256)continue;
  const text=extractPage(visible.slice(c.offset,c.offset+c.length),page.url,{maxText:20000,maxLinks:0}).text;
  if(text!==r.context.text||sha(text)!==c.textHash||Buffer.byteLength(text)>6000)continue;
  if(!containers.some(p=>p.start===c.offset&&p.end===c.offset+c.length))containers.push({start:c.offset,end:c.offset+c.length,text});
 }
 offers.push(...retainedSemanticOffers(task,page,containers,semanticPricePolicy,dimensions,at));
 const unique=[...new Map(offers.map(o=>[JSON.stringify(o.value),o])).values()];assert(unique.length<=60,'Offer bound');
 for(const o of unique)if(unique.some(p=>p!==o&&p.value.plan===o.value.plan&&p.value.cadence===o.value.cadence&&p.value.currency===o.value.currency&&p.value.offerType===o.value.offerType&&p.value.cadenceDescription===o.value.cadenceDescription&&p.value.amount!==o.value.amount))o.dimensions.CONFLICT_STATE='CONFLICT';
 return {dimensions,offers:unique,containers};
 }catch{return {dimensions,offers:[]};}
}
export function localPriceProposals(task,page,at,marketName,semanticPricePolicy=null){
 return officialLocalOffers(task,page,at,marketName,semanticPricePolicy).offers.flatMap(o=>['prices','plans'].map(fact=>({fact,value:fact==='prices'?o.value:{name:o.value.plan,cadence:o.value.cadence,cadenceDescription:o.value.cadenceDescription,billingRoute:'DIRECT',offering:'CURRENT'},quote:o.quote,countryCode:task.countryCode,basis:'EXPLICIT',status:'REVIEW_REQUIRED',proof:{form:officialLocalPriceForm,rawSha256:page.sourceIntegrity.sha256,fragment:o.fragment,checkedAt:page.checkedAt,...(o.interpretation?.key?{interpretation:{key:o.interpretation.key,revision:o.interpretation.revision,modelRevision:o.interpretation.modelRevision,policy:o.interpretation.policy}}:{})}})));
}
export function verifyLocalPrice(task,page,o,at,marketName,semanticPricePolicy=null){
 const result=officialLocalOffers(task,page,at,marketName,semanticPricePolicy),match=result.offers.find(p=>JSON.stringify(o.proof?.fragment)===JSON.stringify(p.fragment)&&o.quote===p.quote&&JSON.stringify(o.proof?.interpretation??null)===JSON.stringify(p.interpretation?.key?{key:p.interpretation.key,revision:p.interpretation.revision,modelRevision:p.interpretation.modelRevision,policy:p.interpretation.policy}:null)&&JSON.stringify(o.value)===JSON.stringify(o.fact==='prices'?p.value:{name:p.value.plan,cadence:p.value.cadence,cadenceDescription:p.value.cadenceDescription,billingRoute:'DIRECT',offering:'CURRENT'}));
 const accepted=!!match&&['prices','plans'].includes(o.fact)&&o.countryCode===task.countryCode&&o.proof?.checkedAt===page.checkedAt&&o.proof.rawSha256===page.sourceIntegrity?.sha256&&Object.values(match.dimensions).every(v=>v==='ESTABLISHED');
 return {version:'DETERMINISTIC_CLAIMS_V1',accepted,status:accepted?'VERIFIED':'REVIEW_REQUIRED',reason:accepted?officialLocalPriceForm:'OFFICIAL_LOCAL_DIMENSIONS_INCOMPLETE',...(accepted?{acceptedValue:o.value}:{}),diagnostics:{version:officialLocalPriceForm,dimensions:match?.dimensions??result.dimensions},sourceUrl:page.url,checkedAt:page.checkedAt,rawSha256:page.sourceIntegrity?.sha256,quote:o.quote};
}
