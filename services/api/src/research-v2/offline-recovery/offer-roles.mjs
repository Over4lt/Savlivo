// Post-discovery interpretation only. No provider, market or language defaults.
import {normalizeText,monetary,amount} from './extract.mjs';
const norm=x=>normalizeText(x).normalize('NFKC').toLowerCase();
const duration=new Set(['FIXED_DURATION','INTRO_DURATION','AFTER_DURATION','TRIAL_DAYS']);
const names=v=>['shortPlanName','name','planName','productName'].map(k=>v?.[k]).filter(x=>typeof x==='string');
const role=t=>({RegularPrice:'REGULAR_BASE',SalePrice:'SALE',TrialPrice:'TRIAL',IntroductoryPrice:'INTRODUCTORY'}[String(t).split('/').at(-1)]??'UNKNOWN');
const samePrice=(v,c)=>amount(v.price)===c.amountNormalized&&(!v.priceCurrency||v.priceCurrency===c.currency);
export function offerBranch(c,source,path=c.structuredPath){
 if(!source)return null;
 if(c.sourceType==='JSON'){
  const entry=source.objects.get(path?.replace(/\/[^/]+$/,''));if(!entry)return null;
  const product=[{value:entry.value,path:path.replace(/\/[^/]+$/,'')},...entry.ancestors.slice().reverse()].find(p=>names(p.value).some(n=>norm(n)===norm(c.product)));
  if(!product)return null;
  let v=entry.value,p=path.replace(/\/[^/]+$/,'');
  const key=path.split('/').at(-1);if(['regularPrice','salePrice'].includes(key)&&amount(v[key])===c.amountNormalized)return {role:key==='regularPrice'?'REGULAR_BASE':'SALE',path,productPath:product.path,raw:JSON.stringify({[key]:v[key],currency:v.priceCurrency??v.currency,billingPeriod:v.billingPeriod??v.billingInterval}),bodyHash:c.bodyHash,fields:{price:v[key],priceCurrency:v.priceCurrency??v.currency,billingPeriod:v.billingPeriod??v.billingInterval},proof:'PROVIDER_NAMED_PRICE_FIELD'};
  if(!v.priceType&&v.priceSpecification){const specs=Array.isArray(v.priceSpecification)?v.priceSpecification:[v.priceSpecification];const matched=specs.map((value,i)=>({value,path:p+'/priceSpecification'+(Array.isArray(v.priceSpecification)?'/'+i:'')})).filter(s=>samePrice(s.value,c));if(matched.length!==1)return null;v=matched[0].value;p=matched[0].path;}
  if(!samePrice(v,c)||role(v.priceType)==='UNKNOWN')return null;
  return {role:role(v.priceType),path:p,productPath:product.path,raw:JSON.stringify(v),bodyHash:c.bodyHash,fields:{...v},proof:'PROVIDER_TYPED_PRICE_SPECIFICATION'};
 }
 if(c.sourceType!=='HTML'||c.ownershipAmbiguous||c.crossCardRisk)return null;
 const node=source.nodes.get(path),owner=source.nodes.get(c.qualifierPreservation?.ownerPath);if(!node||!owner||node.start<owner.start||node.end>owner.end)return null;
 const local=normalizeText(node.text);
 // Exact field text AND existing independently established plan owner. A price
 // match alone cannot select a product or attach another card's metadata.
 const matches=source.products.filter(p=>names(p.value).some(n=>norm(n)===norm(c.product))&&p.value.isRecurringProduct===true&&typeof p.value.secondaryPriceDescription==='string'&&norm(p.value.secondaryPriceDescription)===norm(local)&&typeof p.value.primaryPriceDescription==='string'&&monetary(local).length===1&&monetary(local)[0].amount===c.amountNormalized&&monetary(local)[0].currencyRaw===c.currencyRaw&&monetary(p.value.primaryPriceDescription).length===1&&/(?:after|then|thereafter|depois|ensuite|danach|στη συνέχεια|sau đó)/iu.test(local));
 if(matches.length!==1)return null;
 const p=matches[0];
 // The primary branch must also be a separately retained child of this owner.
 const primary=[...source.nodes.values()].filter(n=>n.tag!=='#text'&&n.start>=owner.start&&n.end<=owner.end&&norm(n.text)===norm(p.value.primaryPriceDescription));if(!primary.length)return null;
 return {role:'POST_INTRO_REGULAR',path,productPath:p.path,raw:local,bodyHash:c.bodyHash,fields:{isRecurringProduct:true,primaryPriceDescription:p.value.primaryPriceDescription,secondaryPriceDescription:p.value.secondaryPriceDescription},primaryPaths:primary.map(n=>[n.start,n.end]),proof:'EXACT_OWNED_SECONDARY_PRICE_FIELD_AND_PRIMARY_CHILD'};
}
export function scopeOfferRole(c,source){
 const occurrences=c.discoveryOccurrences?.length?c.discoveryOccurrences:[{structuredPath:c.structuredPath}];const branches=occurrences.map(o=>offerBranch(c,source,o.structuredPath));
 if(branches.some(b=>!b)||new Set(branches.map(b=>b.role)).size!==1)return c;
 c.offerRole={version:1,role:branches[0].role,branches};
 if(c.offerRole.role!=='POST_INTRO_REGULAR')return c;
 const evidence=c.qualifierEvidence??[];const pending=evidence.filter(e=>e.scope==='UNRESOLVED_ATTACHMENT');
 // Resolve only the diagnosed duration attachment, not tax/annual/other unknowns.
 if(!pending.length||pending.some(e=>!duration.has(e.kind)||!branches.every(b=>norm(b.fields.primaryPriceDescription).includes(norm(e.raw)))))return c;
 const unresolved=c.qualifierPreservation?.unresolved??[];
 if(unresolved.some(r=>r!=='MATERIAL_QUALIFIER_ATTACHMENT_UNRESOLVED'))return c;
 c.qualifierEvidence=evidence.map(e=>e.scope==='UNRESOLVED_ATTACHMENT'?{...e,scope:'SEPARATE_INTRODUCTORY_BRANCH',branchEvidence:branches.map(b=>({bodyHash:b.bodyHash,path:b.productPath+'/primaryPriceDescription'}))}:e);
 c.qualifierPreservation={...c.qualifierPreservation,unresolved:[]};
 c.blockingReasons=c.blockingReasons.filter(r=>!['MATERIAL_QUALIFIER_ATTACHMENT_UNRESOLVED','PROMOTION_QUALIFIER_UNRESOLVED'].includes(r));
 c.qualifierAmbiguous=false;
 return c;
}
export function repairOfferConflicts(candidates){
 // Reproduce the old coarse comparison population; remove its conflict only if
 // every differing amount has a proven different commercial branch role.
 for(const c of candidates){if(!c.offerRole||!c.blockingReasons.includes('MULTIPLE_CONFLICTING_FACTS'))continue;
 const others=candidates.filter(x=>x.bodyHash===c.bodyHash&&x.service===c.service&&x.market===c.market&&x.product===c.product&&x.currency===c.currency&&x.billingPeriod===c.billingPeriod&&x.promotionOrTrial===c.promotionOrTrial&&JSON.stringify(x.qualifier)===JSON.stringify(c.qualifier)&&x.amountNormalized!==c.amountNormalized);
 if(others.length&&others.every(x=>x.offerRole&&x.offerRole.role!==c.offerRole.role&&x.offerRole.branches.every(b=>c.offerRole.branches.some(a=>a.productPath===b.productPath))))c.blockingReasons=c.blockingReasons.filter(r=>r!=='MULTIPLE_CONFLICTING_FACTS');
 }
}
export function regradeScoped(c,old){
 // No unrelated blocker can be repaired by role evidence. L3, not automatic L4:
 // this layer does not re-establish the acquisition/extraction L4 conditions.
 const removed=old.blockingReasons.filter(r=>!c.blockingReasons.includes(r));
 if(removed.length)c.offerRoleRepair={version:1,previousLevel:old.verificationLevel,previousBlockingReasons:old.blockingReasons,removedBlockingReasons:removed};
 if(removed.length&&!c.blockingReasons.length&&c.offerRole&&c.amountNormalized!==null&&c.currency&&!c.currencyAmbiguous&&c.product&&!c.ownershipAmbiguous&&!c.crossCardRisk&&!c.nonPriceNumericRisk&&!c.qualifierAmbiguous&&!c.billingPeriodAmbiguous&&c.authorityEstablished&&c.attribution?.marketApplicabilityEstablished&&!c.sourceMappingAmbiguous){c.verificationLevel=Math.max(3,c.verificationLevel);c.decisionReason='STRUCTURALLY_SCOPED_OFFER_ROLE; EXPERIMENTAL_ONLY';}
}
