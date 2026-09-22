// Exact first-party checkout declarations. No service names, prices or markets.
import {normalizeText,monetary} from './extract.mjs';
const norm=s=>normalizeText(s??'').normalize('NFKC').toLowerCase();
const pathOf=n=>n.parent?pathOf(n.parent)+'/'+n.tag+'['+n.index+']':'$';
export const closedRenewalTrigger=body=>/automatically renews at/i.test(body);
export const renewalRoleConflict=text=>/\b(?:introductory|promotional|annual(?:ly)?|limited[- ]time|first month|(?:first|for(?: the)?(?: first)?)\s+(?:\d+|one|two|three|six|twelve)\s+months?)\b/i.test(text);
export function consumeClosedRenewal(c,source,context){
 if(c.sourceType!=='HTML'||!context.authority||c.nonPriceNumericRisk)return false;
 const node=source.nodes.get(c.structuredPath);if(!node||node.text.length>700)return false;
 const text=normalizeText(node.text),m=/^After (\d+) days, ([\p{L}\p{N} +&'-]{2,80}) automatically renews at ([^.]+(?:\.\d+)?\/month)(?:\.|$)/u.exec(text);
 if(!m||renewalRoleConflict(text))return false;
 const money=monetary(m[3]);if(money.length!==1||money[0].amount!==c.amountNormalized||money[0].currencyRaw!==c.currencyRaw||!c.currency||monetary(text).length!==1)return false;
 const names=(context.serviceCatalog??[]).filter(s=>norm(s.serviceName)===norm(m[2])&&s.market===c.market);
 const services=[...new Set(names.map(s=>s.service))];if(services.length!==1)return false;
 const origin=context.sourceOccurrences?.[0]?.url;let container=node,signup;
 for(let i=0;container&&i<6;i++,container=container.parent){
  if(['body','html','main'].includes(container.tag)||container.text.length>5000)break;
  signup=[...source.nodes.values()].find(n=>n.tag==='a'&&n.start>=container.start&&n.end<=container.end&&/^(?:start|join|subscribe)\b/i.test(n.text)&&/trial|subscription|membership/i.test(n.text)&&(()=>{try{return new URL(n.attrs.href,origin).origin===new URL(origin).origin;}catch{return false;}})());
  if(signup)break;
 }
 if(!signup)return false;
 const allowed=new Set(['PRODUCT_UNRESOLVED','STRUCTURAL_OWNERSHIP_WEAK','PROMOTION_QUALIFIER_UNRESOLVED','MATERIAL_QUALIFIER_ATTACHMENT_UNRESOLVED']);
 if(c.blockingReasons.some(r=>!allowed.has(r)))return false;
 const proof={kind:'CLOSED_NAMED_CHECKOUT_RENEWAL',bodyHash:c.bodyHash,path:c.structuredPath,raw:m[0],name:m[2],amount:c.amountNormalized,currency:c.currency,sourceService:c.acquisitionService??c.service,targetService:services[0],signup:{path:pathOf(signup),href:signup.attrs.href,text:signup.text},catalogService:names[0]};
 c.subscriptionSubject=proof;c.acquisitionService=c.acquisitionService??c.service;c.service=services[0];c.product=m[2];c.plan=m[2];
 c.productOwnerEvidence={raw:m[2],path:c.structuredPath,method:proof.kind};c.attribution={...c.attribution,productOwnershipEstablished:true,productOwnerEvidence:c.productOwnerEvidence};
 c.ownershipAmbiguous=false;c.crossCardRisk=false;c.qualifierAmbiguous=false;c.billingPeriodAmbiguous=false;c.billingPeriod='MONTHLY';c.promotionOrTrial=null;c.qualifier=[];c.qualifierPreservation={...c.qualifierPreservation,ownerPath:c.structuredPath,unresolved:[]};c.blockingReasons=[];c.verificationLevel=3;
 c.offerRole={role:'POST_INTRO_REGULAR',basis:proof};c.verificationPriceRole=c.offerRole;
 c.commercial={version:1,type:'RECURRING_MONTHLY',ordinaryMonthly:true,strongRecurringMonthly:true,providerPlanId:null,productConditions:[],priceConditions:['AFTER_INTRO'],monthlyEquivalentDisplay:false,nonRenewing:false,prepaid:false,oneTimePayment:false,evidence:[{kind:proof.kind,path:c.structuredPath,bodyHash:c.bodyHash,raw:m[0],proof}],reasons:[],monthlyBlockers:[]};
 return true;
}
export function subscriptionReceipt(claim,derived,receipt){
 const c=derived.rows.find(c=>c.subscriptionSubject&&c.structuredPath===claim.structuredPath&&c.amountNormalized===claim.amountNormalized&&c.currency===claim.currency&&c.service===claim.service),p=c?.subscriptionSubject;
 if(!p||!receipt?.intact||!receipt.serviceEstablished||receipt.bodyHash!==p.bodyHash||receipt.service!==p.sourceService)return receipt;
 return {...receipt,service:p.targetService,serviceEvidence:{...receipt.serviceEvidence,acquiredFor:receipt.service,targetService:p.targetService,subjectBinding:p,meaning:'Exact named first-party checkout renewal subject; acquisition task label is preserved separately.'}};
}

export function closedRenewalCommercial(c,source){const p=c.subscriptionSubject,n=source?.nodes.get(c.structuredPath);if(!p||p.bodyHash!==c.bodyHash||p.path!==c.structuredPath||!n||!normalizeText(n.text).startsWith(p.raw)||p.name!==c.product||p.amount!==c.amountNormalized||p.currency!==c.currency)return null;return {version:1,type:'RECURRING_MONTHLY',ordinaryMonthly:true,strongRecurringMonthly:true,providerPlanId:null,productConditions:[],priceConditions:['AFTER_INTRO'],monthlyEquivalentDisplay:false,nonRenewing:false,prepaid:false,oneTimePayment:false,evidence:[{kind:p.kind,path:p.path,bodyHash:p.bodyHash,raw:p.raw,proof:p}],reasons:[],monthlyBlockers:[]};}
