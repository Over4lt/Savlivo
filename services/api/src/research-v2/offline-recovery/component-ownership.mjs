// Experimental post-discovery ownership. No provider dispatch, new acquisition,
// currency inference, market repair or commercial-role reinterpretation.
import {normalizeText,monetary,amount,hash} from './extract.mjs';
import {resolveSubscriptionIdentity} from './subscription-identity.mjs';
import {countryLabel} from './attribution.mjs';
import {preserveQualifiers,qualifierSafety} from './qualifiers.mjs';
const norm=x=>normalizeText(x).normalize('NFKC').toLowerCase();
const pathOf=n=>n.parent?pathOf(n.parent)+'/'+n.tag+'['+n.index+']':'$';
const inside=(n,p)=>n.start>=p.start&&n.end<=p.end;
const descendants=n=>[n,...n.children.flatMap(descendants)];
const elements=n=>n.children.filter(x=>x.tag!=='#text');
const sku=n=>n.attrs?.['data-sku-id']??n.attrs?.['data-product-id']??null;
const textLabel=text=>{const s=normalizeText(text);return s&&s.length<=100&&s.split(' ').length<=8&&!monetary(s).length&&!countryLabel(s)&&!/[?！!;:]/u.test(s)&&!/^\d+\s*(members?|months?|days?)$/i.test(s)&&! /^(?:recommended|popular|best value|subscribe|choose|select|compare|save|savings|pricing|plans?|monthly|annual|yearly|get started)\b/i.test(s)?s:null;};
const matchesPrice=(text,c)=>{const ms=monetary(text);return ms.length===1&&ms[0].amount===c.amountNormalized&&ms[0].currencyRaw===c.currencyRaw;};
const ref=n=>({path:pathOf(n),span:[n.start,n.end]});
function siblings(n){for(let p=n.parent,depth=0;p&&depth<4;p=p.parent,depth++){const peers=elements(p).filter(x=>!inside(n,x)&&descendants(x).some(d=>sku(d)||d.tag==='article'));if(peers.length)return peers.map(ref);}return [];}
function receipt(c,node,component,labelNode,id,cta,basis){return {version:1,bodyHash:c.bodyHash,componentRef:'component:'+hash([c.bodyHash,pathOf(component)]),componentPath:pathOf(component),componentSpan:[component.start,component.end],planLabel:normalizeText(labelNode.text),planLabelRef:ref(labelNode),providerProductId:id,skuRef:cta?{...ref(cta),attribute:sku(cta)===cta.attrs['data-sku-id']?'data-sku-id':'data-product-id',value:id}:null,ctaRef:cta?ref(cta):null,priceRef:ref(node),priceAttribute:cta?.attrs['data-formatted-price']??null,siblingComponentRefs:siblings(component),ownershipBasis:basis};}
function htmlOwner(c,source,path){const node=source.nodes.get(path);if(!node||!monetary(node.text).some(m=>m.amount===c.amountNormalized&&m.currencyRaw===c.currencyRaw))return null;
 for(let n=node,depth=0;n&&depth<14;n=n.parent,depth++){
  if(['body','main','html','root'].includes(n.tag))break;
  const ds=descendants(n),ids=[...new Set(ds.map(sku).filter(Boolean))];
  if(ids.length>1)return null; // Never step out of a conflicting multi-product component.
  // An explicit provider product-name attribute defines a closer product
  // boundary than an enclosing heading. The visible label must agree; nested
  // product components may not donate their prices to this component.
  if(Object.hasOwn(n.attrs??{},'data-product-name')){
   const name=textLabel(n.attrs['data-product-name']);
   const labels=ds.filter(x=>x!==n&&textLabel(x.text)===name&&!x.children.some(y=>textLabel(y.text)===name));
   if(!name||!labels.length||ds.some(x=>x!==n&&Object.hasOwn(x.attrs??{},'data-product-name'))||c.product&&norm(c.product)!==norm(name))return null;
   const result=receipt(c,node,n,labels[0],sku(n),null,'EXPLICIT_COMPONENT_PRODUCT_NAME');
   result.planLabelRef={...result.planLabelRef,attribute:'data-product-name',attributePath:pathOf(n),value:name};
   return result;
  }

  if(ids.length===1&&n.text.length<6000){
   const ct=ds.filter(x=>['button','a'].includes(x.tag)&&sku(x)===ids[0]&&matchesPrice(x.attrs['data-formatted-price']??'',c));
   if(ct.length===1){const children=elements(n);let priceChild=node;while(priceChild.parent&&priceChild.parent!==n)priceChild=priceChild.parent;
    const headings=ds.filter(x=>/^h[1-6]$/.test(x.tag)||x.attrs?.itemprop==='name'||x.attrs?.['data-product-name']);
    const explicit=headings.filter(x=>textLabel(x.text));
    const previous=children[children.indexOf(priceChild)-1];
    // A direct label slot immediately preceding the price branch, corroborated
    // by the same component's SKU/formatted-price action. Never text distance.
    const labelNode=explicit.length===1?explicit[0]:!headings.length&&previous&&textLabel(previous.text)&&!descendants(previous).some(x=>['button','a','p'].includes(x.tag))?previous:null;
    if(labelNode&&(!c.product||norm(c.product)===norm(labelNode.text))&&!ds.some(x=>x!==n&&['article','section'].includes(x.tag)&&!inside(node,x)&&monetary(x.text).length))return receipt(c,node,n,labelNode,ids[0],ct[0],'SAME_COMPONENT_LABEL_SKU_AND_FORMATTED_PRICE_ACTION');
   }
  }
  if(n.tag==='article'){
   if(ids.length)return null; // Explicit SKU/price disagreement cannot fall back to a heading.
   const nested=ds.filter(x=>x!==n&&x.tag==='article');if(nested.length)return null;
   const hs=ds.filter(x=>/^h[1-6]$/.test(x.tag));
   let labelNode=hs.length===1&&monetary(n.text).length===1&&textLabel(hs[0].text)?hs[0]:null;
   const tab=elements(n).find(x=>x.tag==='header'&&x.attrs?.role==='tab');
   if(!labelNode&&tab&&inside(node,tab)&&matchesPrice(tab.attrs['aria-label']??'',c)){
    const labels=elements(tab).filter(x=>textLabel(x.text));if(labels.length===1&&norm(tab.attrs['aria-label']).startsWith(norm(labels[0].text)+' '))labelNode=labels[0];
   }
   // This rule is for a card, not an editorial article with nested offers.
   if(labelNode&&n.text.length<6000&&(!c.product||norm(c.product)===norm(labelNode.text))&&!ds.some(x=>x!==labelNode&&x!==n&&x.tag==='section'&&(x.headings??[]).length))return receipt(c,node,n,labelNode,null,null,'BOUNDED_ARTICLE_PLAN_LABEL');
   return null; // A nearer ambiguous article cannot borrow an outer owner.
  }
 }
 return null;
}
function jsonOwner(c,source,path){const entry=source.objects.get(path.replace(/\/[^/]+$/,''));if(!entry)return null;
 const lineage=[{value:entry.value,path:path.replace(/\/[^/]+$/,'')},...entry.ancestors.slice().reverse()];
 for(const x of lineage){const v=x.value;if(Array.isArray(v))continue;const name=v.name??v.productName??v.planName;
  const typed=String(v['@type']??'').split('/').at(-1)==='Product',id=v.productId??v.sku??null;
  if(!typed&&!id)continue;
  // Stop at the closest declared product even when it contradicts a prior label.
  if(!textLabel(name)||(c.product&&norm(c.product)!==norm(name)))return null;
  if(!path.startsWith(x.path+'/')||(!id&&!typed))return null;
  const relative=path.slice(x.path.length+1);if(!/^(?:offers\/|price|amount|cost|monthlyPrice|regularPrice|salePrice)/.test(relative))return null;
  const leaf=path.split('/').at(-1);if(amount(entry.value[leaf])!==c.amountNormalized)return null;
  return {version:1,bodyHash:c.bodyHash,componentRef:'component:'+hash([c.bodyHash,x.path]),componentPath:x.path,planLabel:name,planLabelRef:{path:x.path+'/'+(['name','productName','planName'].find(k=>v[k]===name))},providerProductId:id,skuRef:id?{path:x.path+'/'+(v.productId!==undefined?'productId':'sku'),value:id}:null,ctaRef:null,priceRef:{path},siblingComponentRefs:source.products.filter(p=>p.path!==x.path&&p.path.slice(0,p.path.lastIndexOf('/'))===x.path.slice(0,x.path.lastIndexOf('/'))).map(p=>({path:p.path})),ownershipBasis:typed?'EXPLICIT_PROVIDER_PRODUCT_OBJECT':'EXPLICIT_PROVIDER_PRODUCT_ID_OBJECT'};
 }
 return null;
}
function repairBoundedOwnership(c,source){if(!source||!c.factId||(!c.ownershipAmbiguous&&c.product&&!c.crossCardRisk))return c;
 if(c.blockingReasons.includes('PRODUCT_FROM_COUNTRY_LABEL')||c.blockingReasons.includes('REPEATED_TEXT_DIFFERENT_OWNERS'))return c;
 const paths=c.discoveryOccurrences?.length?c.discoveryOccurrences.map(x=>x.structuredPath):[c.structuredPath];
 const proofs=paths.map(p=>c.sourceType==='HTML'?htmlOwner(c,source,p):c.sourceType==='JSON'?jsonOwner(c,source,p):null);if(proofs.some(x=>!x))return c;
 const ids=[...new Set(proofs.map(p=>p.providerProductId))],labels=[...new Set(proofs.map(p=>norm(p.planLabel)))];
 if(ids.length!==1||(!ids[0]&&labels.length!==1))return c;
 const previous={product:c.product,plan:c.plan,ownershipAmbiguous:c.ownershipAmbiguous,crossCardRisk:c.crossCardRisk,productOwnerEvidence:c.productOwnerEvidence,qualifierPreservation:c.qualifierPreservation,qualifierEvidence:c.qualifierEvidence,blockingReasons:[...c.blockingReasons],verificationLevel:c.verificationLevel};
 c.componentOwnership={version:1,established:true,providerProductId:ids[0],planLabels:[...new Set(proofs.map(p=>p.planLabel))].sort(),occurrences:proofs};
 c.product=c.product??proofs[0].planLabel;c.plan=c.product;c.ownershipAmbiguous=false;c.crossCardRisk=false;
 c.productOwnerEvidence={raw:c.product,path:proofs[0].componentPath,method:proofs[0].ownershipBasis};
 c.attribution={...c.attribution,productOwnershipEstablished:true,productOwnerEvidence:c.productOwnerEvidence};
 c.blockingReasons=c.blockingReasons.filter(r=>!['PRODUCT_UNRESOLVED','STRUCTURAL_OWNERSHIP_WEAK','CROSS_CARD_CONFLICT'].includes(r));
 if(c.sourceType==='HTML'){
  const node=source.nodes.get(c.structuredPath),owner=source.nodes.get(proofs[0].componentPath);
  const q=structuredClone(c);preserveQualifiers(q,{localText:node.text,ownerText:owner.text,localPath:c.structuredPath,ownerPath:proofs[0].componentPath,ownerStrong:true,localMoneyCount:monetary(node.text).length,ownerMoneyCount:monetary(owner.text).length});
  // Existing unresolved commercial evidence is never cleared by ownership alone.
  c.qualifier=q.qualifier;c.qualifierEvidence=q.qualifierEvidence;c.qualifierPreservation={...q.qualifierPreservation,unresolved:[...new Set([...(previous.qualifierPreservation?.unresolved??[]),...q.qualifierPreservation.unresolved])].sort()};
  c.billingPeriod=q.billingPeriod;c.promotionOrTrial=q.promotionOrTrial;
  c.blockingReasons=[...new Set([...c.blockingReasons,...qualifierSafety(c)])];
 }
 c.ownershipRepair={version:1,previous,removedBlockingReasons:previous.blockingReasons.filter(r=>!c.blockingReasons.includes(r))};
 if(!c.blockingReasons.length&&c.amountNormalized!==null&&c.currency&&!c.currencyAmbiguous&&!c.nonPriceNumericRisk&&!c.qualifierAmbiguous&&!c.billingPeriodAmbiguous&&c.authorityEstablished&&c.attribution?.marketApplicabilityEstablished&&['PROVIDER_DECLARED','GEO_OBSERVED','PROVIDER_AND_GEO'].includes(c.attribution.marketEvidenceType)&&!c.sourceMappingAmbiguous){c.verificationLevel=Math.max(c.verificationLevel,3);c.decisionReason='BOUNDED_PRODUCT_COMPONENT; EXPERIMENTAL_ONLY';}
 return c;
}

export function boundedOwnership(c,source){
 // An enclosing heading cannot prevent inspection of a closer explicit product
 // component merely because the heading extractor previously marked it strong.
 const owner=source?.nodes.get(c.productOwnerEvidence?.path);
 if(c.sourceType==='HTML'&&c.productOwnerEvidence?.method==='HEADING_CONTAINER'&&owner){
  const trial=structuredClone(c);trial.product=null;trial.plan=null;trial.ownershipAmbiguous=true;
  repairBoundedOwnership(trial,source);
  if(trial.componentOwnership?.established&&trial.componentOwnership.occurrences.every(p=>p.componentPath.startsWith(c.productOwnerEvidence.path+'/'))){
   trial.planIdentityResolution={version:1,status:'ESTABLISHED',previousProduct:c.product,previousOwner:c.productOwnerEvidence,contextHeading:c.parentHeading??c.product,occurrences:trial.componentOwnership.occurrences};
   Object.assign(c,trial);
  }
 }
 return resolveSubscriptionIdentity(repairBoundedOwnership(c,source),source);
}
