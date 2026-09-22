// A typed, page-scoped subscription FAQ can explain an exact named offer price.
// Independent catalog records, country menus and unrelated FAQ prose do not bind.
import {normalizeText,monetary} from './extract.mjs';
import {renewalRoleConflict} from './closed-renewal.mjs';
import {providerCurrencyContext} from './contextual-currency.mjs';
const norm=s=>normalizeText(s??'').normalize('NFKC').toLowerCase();
export function subscriptionFaqCandidates(rows,source,context){
 if(!context.authority)return [];
 const output=[];
 for(const [path,entry]of source.objects){
  const q=entry.value;if(q?.['@type']!=='Question'||q.acceptedAnswer?.['@type']!=='Answer'||!entry.ancestors.some(a=>a.value?.['@type']==='FAQPage'))continue;
  const subject=/^How much does (?:a|an|the) (.+) subscription cost\?$/i.exec(q.name??'');if(!subject)continue;
  const answer=normalizeText(q.acceptedAnswer.text??'');
  const clauses=[...answer.matchAll(/(?:^|[.)]\s+)A monthly subscription is just ([A-Z$€£]+)\s*(\d+(?:[.,]\d{1,2})?) per month after a free (?:\w+-day|\d+-day) trial\./g)];
  if(clauses.length!==1||(answer.match(/A monthly subscription is just/g)??[]).length!==1)continue;
  const m=clauses[0],tail=answer.slice(m.index+m[0].length).split(/\(\d+\)/)[0];
  if(renewalRoleConflict(m[0]+tail)||monetary(tail).length)continue;
  const amount=String(Number(m[2].replace(',','.')));if(!(Number(amount)>0))continue;
  // The FAQ subject and amount must also match a structurally owned offer in
  // this response. The FAQ supplies cadence/role, never a nearby product name.
  const matches=rows.filter(c=>c.sourceType==='JSON'&&norm(c.product)===norm(subject[1])&&c.amountNormalized===amount&&c.productOwnerEvidence?.path&&!c.ownershipAmbiguous&&!c.crossCardRisk);
  const permitted=new Set(['CURRENCY_UNRESOLVED','MARKET_ATTRIBUTION_UNRESOLVED','MARKET_APPLICABILITY_UNRESOLVED','MARKET_SCOPE_UNRESOLVED','BILLING_PERIOD_UNRESOLVED']);
  const seed=matches.find(c=>providerCurrencyContext(source,c)&&(c.blockingReasons??[]).every(r=>permitted.has(r))&&!c.qualifierAmbiguous&&!c.billingPeriodAmbiguous&&!c.nonPriceNumericRisk);if(!seed)continue;
  const provider=providerCurrencyContext(source,seed);
  if(matches.some(c=>c.currency&&c.currency!==seed.currency))continue;
  const c=structuredClone(seed),p=path+'/acceptedAnswer/text';
  const proof={kind:'TYPED_SUBSCRIPTION_FAQ_RENEWAL',bodyHash:source.bodyHash,questionPath:path,question:q.name,answer:q.acceptedAnswer.text,clause:m[0],offerPath:seed.structuredPath,offerOwner:seed.productOwnerEvidence,product:seed.product,amount,displayToken:m[1],provider};
  c.structuredPath=p;c.discoveryOccurrences=[{structuredPath:p}];c.candidateId='faq:'+p;c.factId='faq:'+p;
  c.amountRaw=m[1]+' '+m[2];c.currencyRaw=m[1];c.currency=null;c.currencyAmbiguous=true;
  c.rawEvidenceSnippet=q.acceptedAnswer.text;c.normalizedEvidenceSnippet=answer;c.commercialContext=m[0];
  c.subscriptionFaq=proof;c.productOwnerEvidence={raw:seed.product,path:path+'/name',method:proof.kind};
  c.attribution={...c.attribution,marketApplicabilityEstablished:true,marketEvidenceType:'PROVIDER_AND_GEO',marketSourceType:'provider-selected-storefront',productOwnershipEstablished:true,productOwnerEvidence:c.productOwnerEvidence,faqPageScope:proof};
  c.billingPeriod='MONTHLY';c.billingPeriodAmbiguous=false;c.qualifierAmbiguous=false;c.qualifier=[];c.promotionOrTrial=null;c.nonPriceNumericRisk=false;
  c.qualifierPreservation={version:1,recognized:['EXPLICIT_POST_TRIAL_MONTHLY'],required:[],unresolved:[],ownerPath:path,localPath:p};
  c.blockingReasons=['CURRENCY_UNRESOLVED'];c.verificationLevel=2;c.verificationConflictPeerLocators=[];c.verificationConflictPeers=[];
  c.offerRole={role:'POST_INTRO_REGULAR',basis:proof};c.verificationPriceRole=c.offerRole;
  c.commercial=faqCommercial(c,source);output.push(c);
 }
 return output;
}
export function faqCommercial(c,source){
 const p=c.subscriptionFaq,q=p&&source.objects.get(p.questionPath)?.value;
 if(!p||p.bodyHash!==source.bodyHash||q?.name!==p.question||q.acceptedAnswer?.text!==p.answer||p.amount!==c.amountNormalized||p.product!==c.product)return null;
 return {version:1,type:'RECURRING_MONTHLY',ordinaryMonthly:true,strongRecurringMonthly:true,providerPlanId:null,productConditions:[],priceConditions:['AFTER_INTRO'],monthlyEquivalentDisplay:false,nonRenewing:false,prepaid:false,oneTimePayment:false,evidence:[{kind:p.kind,path:p.questionPath,bodyHash:p.bodyHash,raw:p.clause,proof:p}],reasons:[],monthlyBlockers:[]};
}
