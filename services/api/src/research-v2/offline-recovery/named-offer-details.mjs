import {normalizeText,monetary} from './extract.mjs';
import {renewalRoleConflict} from './closed-renewal.mjs';
const norm=s=>normalizeText(s??'').toLowerCase();
export function consumeNamedOfferDetails(c,source){
 if(c.sourceType!=='HTML'||!c.authorityEstablished||c.nonPriceNumericRisk)return false;
 const n=source.nodes.get(c.structuredPath);if(n?.tag!=='p'||n.text.length>2500)return false;
 const text=normalizeText(n.text),m=/^(.{2,100}) OFFER DETAILS: Subscribe to the (.{2,100}) plan and pay (.+?) per month\./i.exec(text);
 if(!m||renewalRoleConflict(text)||norm(m[1])!==norm(m[2]))return false;
 const price=monetary(m[3]),all=monetary(text);if(price.length!==1||all.length!==2||all.some(x=>x.amount!==price[0].amount||x.currencyRaw!==price[0].currencyRaw)||price[0].amount!==c.amountNormalized||price[0].currencyRaw!==c.currencyRaw)return false;
 if(!/Your subscription will continue on a monthly billing plan thereafter and your credit card will automatically be charged at the then-current rate \(currently [^)]+\/month\), for an indeterminate term, unless and until you cancel\./i.test(text))return false;
 const links=[...source.nodes.values()].filter(x=>x.tag==='a'&&x.start>=n.start&&x.end<=n.end&&/customer agreement|subscription terms|terms and conditions/i.test(x.text));if(links.length!==1)return false;
 const allowed=new Set(['CURRENCY_UNRESOLVED','PRODUCT_UNRESOLVED','STRUCTURAL_OWNERSHIP_WEAK','QUALIFIER_EVIDENCE_BOUND','CROSS_CARD_CONFLICT','PROMOTION_QUALIFIER_UNRESOLVED']);if(c.blockingReasons.some(r=>!allowed.has(r)))return false;
 const proof={kind:'CLOSED_NAMED_MONTHLY_OFFER_DETAILS',bodyHash:source.bodyHash,path:c.structuredPath,text,plan:m[2],amount:c.amountNormalized,displayToken:c.currencyRaw,termsHref:links[0].attrs.href};
 c.namedOfferDetails=proof;c.product=m[2];c.plan=m[2];c.productOwnerEvidence={path:c.structuredPath,raw:m[2],method:proof.kind};c.attribution={...c.attribution,productOwnershipEstablished:true,productOwnerEvidence:c.productOwnerEvidence};
 c.ownershipAmbiguous=false;c.crossCardRisk=false;c.qualifierAmbiguous=false;c.billingPeriodAmbiguous=false;c.billingPeriod='MONTHLY';c.qualifier=[];c.promotionOrTrial=null;c.qualifierPreservation={version:1,recognized:['EXPLICIT_RECURRING_MONTHLY'],required:[],unresolved:[],ownerPath:c.structuredPath,localPath:c.structuredPath};c.blockingReasons=c.currency?[]:['CURRENCY_UNRESOLVED'];c.verificationLevel=c.currency?3:2;c.verificationConflictPeerLocators=[];
 c.offerRole={role:'REGULAR_BASE',basis:proof};c.verificationPriceRole=c.offerRole;c.commercial=namedOfferCommercial(c,source);return true;
}
export function namedOfferCommercial(c,source){const p=c.namedOfferDetails;if(!p||p.bodyHash!==source.bodyHash||source.nodes.get(p.path)?.text!==p.text||p.plan!==c.product||p.amount!==c.amountNormalized)return null;return {version:1,type:'RECURRING_MONTHLY',ordinaryMonthly:true,strongRecurringMonthly:true,providerPlanId:null,productConditions:[],priceConditions:[],monthlyEquivalentDisplay:false,nonRenewing:false,prepaid:false,oneTimePayment:false,evidence:[{kind:p.kind,path:p.path,bodyHash:p.bodyHash,raw:p.text,proof:p}],reasons:[],monthlyBlockers:[]};}
