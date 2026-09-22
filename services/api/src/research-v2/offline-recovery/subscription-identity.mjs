// Evidence precedence only. No provider/name dispatch, billing, market or currency inference.
import {normalizeText,monetary,hash} from './extract.mjs';
import {countryLabel} from './attribution.mjs';
const pathOf=n=>n.parent?pathOf(n.parent)+'/'+n.tag+'['+n.index+']':'$';
const descendants=n=>[n,...n.children.flatMap(descendants)];
const ref=n=>({path:pathOf(n),span:[n.start,n.end]});
const inside=(n,p)=>n.start>=p.start&&n.end<=p.end;
const norm=s=>normalizeText(s).normalize('NFKC').toLowerCase();
const productNode=n=>n.attrs?.['data-sku-id']||n.attrs?.['data-product-id']||n.attrs?.itemprop==='name'||n.attrs?.['data-product-name'];
const campaignNode=n=>['data-campaign-id','data-promotion-id','data-partner-campaign'].some(k=>Object.hasOwn(n.attrs??{},k));
// Explicit applicability predicates, not marketing-looking names. The clause must
// terminate at punctuation: do not guess where an unbounded product name ends.
const applicabilityClauses=text=>[...normalizeText(text).matchAll(/(?:\b(?:the\s+)?(?:code|offer|campaign)\s+applies\s+(?:only\s+)?to\s+(?:the\s+)?(?:subscription\s+)?(?:plan|package)\s+|\b(?:koden|tilbudet)\s+gjelder\s+(?:kun\s+)?for\s+(?:abonnementet|pakken)\s+)([^,.;:!?]+)(?=[,.;:!?]|$)/giu)].map(m=>({raw:m[0],plan:normalizeText(m[1]).replace(/^["“]|["”]$/g,'')})).filter(m=>m.plan&&m.plan.length<=100&&m.plan.split(' ').length<=10&&!monetary(m.plan).length&&!countryLabel(m.plan));
// A provider's explicit grammatical subscription identity is more specific than
// its enclosing heading. Restrict to a terminated noun phrase, not arbitrary
// adjacent prose; multiple names still fail the existing bounded proof.
const clauses=text=>[...applicabilityClauses(text),
 ...normalizeText(text).matchAll(/\b(?:a|the)\s+(?:free\s+)?([^,.;:!?]+?)\s+subscription\s+costs\b/giu)]
 .map(x=>Array.isArray(x)?{raw:x[0],plan:normalizeText(x[1])}:x)
 .filter(x=>x.plan&&x.plan.length<=100&&x.plan.split(' ').length<=8&&!/^(?:(?:free|paid|monthly|annual|yearly|recurring|new)\s*)+$/i.test(x.plan)&&!monetary(x.plan).length&&!countryLabel(x.plan));

function proof(c,source,path){const price=source.nodes.get(path),owner=source.nodes.get(c.productOwnerEvidence?.path??c.qualifierPreservation?.ownerPath);if(!price||!owner||!inside(price,owner)||owner.text.length>6000)return null;
 // Do not replace an independently established closer product/card or SKU owner.
 if(c.componentOwnership?.established||!['HEADING_CONTAINER','LIST_ITEM','TABLE_ROW'].includes(c.productOwnerEvidence?.method))return null;
 for(let n=price;n&&inside(n,owner);n=n.parent){
  const ds=descendants(n),terms=clauses(n.text);if(!terms.length)continue;
  const leaves=ds.filter(x=>x.tag!=='#text'&&clauses(x.text).length&&!x.children.some(y=>y.tag!=='#text'&&clauses(y.text).length));
  const names=[...new Set(terms.map(t=>norm(t.plan)))];
  // A single bounded terms/price component. Never cross nested product cards,
  // explicit product IDs, competing headings, or separately priced branches.
  if(names.length!==1||ds.some(x=>productNode(x))||ds.some(x=>x!==n&&['article','section'].includes(x.tag))||(n.headings??[]).length>1)return {conflict:true,component:ref(n),clauses:terms};
  const monies=monetary(n.text);if(!monies.length||monies.some(m=>m.amount!==c.amountNormalized||m.currencyRaw!==c.currencyRaw))return null;
  return {bodyHash:c.bodyHash,component:ref(n),priceRef:ref(price),plan:terms[0].plan,clauses:leaves.map(x=>({...ref(x),statements:clauses(x.text)})),basis:'BOUNDED_SUBSCRIPTION_APPLICABILITY_CLAUSE'};
 }
 return null;
}
function block(c,reason,evidence){c.planIdentityResolution={version:1,status:'UNRESOLVED',contextHeading:c.product,evidence};c.ownershipAmbiguous=true;c.attribution={...c.attribution,productOwnershipEstablished:false};c.verificationLevel=Math.min(2,c.verificationLevel);c.blockingReasons=[...new Set([...c.blockingReasons,reason])];c.decisionReason=c.blockingReasons.join('|');return c;}
export function resolveSubscriptionIdentity(c,source){if(!source||!c.factId||c.sourceType!=='HTML')return c;
 const paths=c.discoveryOccurrences?.length?c.discoveryOccurrences.map(o=>o.structuredPath):[c.structuredPath];const proofs=paths.map(p=>proof(c,source,p));
 if(proofs.some(Boolean)){
  if(proofs.some(p=>!p||p.conflict)||new Set(proofs.map(p=>norm(p.plan))).size!==1)return block(c,'SUBSCRIPTION_IDENTITY_CONFLICT',proofs);
  const p=proofs[0];if(norm(p.plan)===norm(c.product))return c;
  // Existing ambiguity is not repaired by a contractual name alone.
  if(c.ownershipAmbiguous||c.crossCardRisk)return block(c,'SUBSCRIPTION_IDENTITY_CONFLICT',proofs);
  c.planIdentityResolution={version:1,status:'ESTABLISHED',previousProduct:c.product,previousOwner:c.productOwnerEvidence,contextHeading:c.parentHeading??c.product,occurrences:proofs};
  c.product=p.plan;c.plan=p.plan;
  c.productOwnerEvidence={raw:p.plan,path:p.component.path,method:p.basis};c.attribution={...c.attribution,productOwnerEvidence:c.productOwnerEvidence};
  c.componentOwnership={version:1,established:true,providerProductId:null,planLabels:[p.plan],occurrences:proofs.map(x=>({bodyHash:c.bodyHash,componentRef:'component:'+hash([c.bodyHash,x.component.path]),componentPath:x.component.path,componentSpan:x.component.span,planLabel:x.plan,planLabelRef:x.clauses[0],providerProductId:null,priceRef:x.priceRef,siblingComponentRefs:[],ownershipBasis:x.basis,contractualEvidence:x.clauses}))};
  return c;
 }
 // A named subscription mentioned in descriptive/eligibility prose can
 // contradict the enclosing heading without proving ownership of a paid amount
 // (for example, a free subscription bundled with a different paid product).
 // Preserve that identity as context; never transfer its name to the price.
 if(!c.componentOwnership?.established&&c.productOwnerEvidence?.method==='HEADING_CONTAINER'){
  const mentions=paths.flatMap(path=>[...(source.nodes.get(path)?.text??'').matchAll(/\b(?:a|the)\s+(?:free\s+)?([^,.;:!?]+?)\s+subscription\s+is\b/giu)].map(m=>({path,raw:m[0],plan:normalizeText(m[1])})))
   .filter(m=>m.plan.length<=100&&m.plan.split(' ').length<=8&&!monetary(m.plan).length&&!/^(?:free|paid|monthly|annual|yearly|recurring|new)$/i.test(m.plan));
  if(mentions.length&&mentions.every(m=>norm(m.plan)!==norm(c.product))){
   block(c,'SUBSCRIPTION_IDENTITY_PRICE_BINDING_UNRESOLVED',mentions);
   c.product=null;c.plan=null;return c;
  }
 }
 // Only provider-marked campaign structures are campaign evidence. Never classify
 // a heading as a campaign by its words, punctuation, provider or partner name.
 if(!c.componentOwnership?.established&&c.productOwnerEvidence?.method==='HEADING_CONTAINER'){
  const owner=source.nodes.get(c.productOwnerEvidence.path);if(owner&&campaignNode(owner))return block(c,'CAMPAIGN_CONTEXT_WITHOUT_PRODUCT_IDENTITY',[{bodyHash:c.bodyHash,...ref(owner),attributes:owner.attrs}]);
 }
 return c;
}
