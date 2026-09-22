import {monetary,amount} from './extract.mjs';
// Semantic vetoes preserve observations; they never rewrite provider amounts.
const pathOf=n=>n.parent?pathOf(n.parent)+'/'+n.tag+'['+n.index+']':'$';
export function priceContextGuards(candidate,source){
 const out=[],add=(code,node,raw)=>out.push({code,path:node?pathOf(node):candidate.productOwnerEvidence?.path,raw,bodyHash:candidate.bodyHash});
 const label=String(candidate.product??'').trim();
 if(/^(?:start \d+ days? free trial|join (?:today|now)|get started|subscribe now|find your perfect plan|in de kijker|lav pris|ett abonnement som passer deg|charges|ご利用料金|よくある質問|try (?:it )?(?:free|\d+ days? free)|\d+ Tage kostenlos testen|Disfruta\s*\d+\s*días\s*gratis|Probeer\s*\d+\s*dagen\s*gratis)$/iu.test(label))add('CTA_OR_TRIAL_HEADING_NOT_PLAN',null,label);
 if(/^(?:get (?:a )?student discount|få studierabat)\b/iu.test(label))add('CTA_OR_TRIAL_HEADING_NOT_PLAN',null,label);
 if(/^(?:plan anual|jahresplan|six[- ]month plan|annual(?: plan| price| subscription)?|yearly(?: plan| price)?|årspris|årsabonnement)$/iu.test(label))add('ANNUAL_LABEL_MONTHLY_BASIS_UNRESOLVED',null,label);
 if(/^(?:how much|hoeveel kost|was kostet|combien coûte)\b/iu.test(label)&&label.includes('?'))add('FAQ_HEADING_NOT_PLAN',null,label);
 let node=source?.nodes.get(candidate.structuredPath);
 const owned=source?.nodes.get(candidate.qualifierPreservation?.ownerPath);
 // A provider-established minimum term is distinct from billing frequency.
 // Preserve the interval, but do not flatten an unresolved committed variant
 // into the uncommitted ordinary offer sharing its heading.
 const term=owned?.text.match(/\b\d+\s*(?:Monate?\s+Mindestlaufzeit|måneder\s+binding)\b/iu)
  ||(candidate.structuralContainer==='EXPLICIT_SEMANTIC_PLAN_CARD'&&owned?.text.match(/\bminimum\s+(?:contract|term|commitment)\s*(?:of\s*)?\d+\s*(?:weeks?|months?|years?)\b/iu));
 if(term)add('COMMITMENT_REQUIRES_REVIEW',owned,term[0]);
 const local=String(candidate.normalizedEvidenceSnippet??'');
 const ownMoney=monetary(local).filter(m=>m.amount===candidate.amountNormalized&&m.currencyRaw===candidate.currencyRaw);
 if(ownMoney.some(m=>/^\s*(?:\/|per)\s*(?:TB|GB|terabytes?|gigabytes?)\s*(?:\/|per|a|each)/iu.test(local.slice(m.end))))add('USAGE_UNIT_NOT_CONSUMER_PLAN_TOTAL',node,local);
 // A dollar-denominated benefit is not the provider's recurring charge.
 // Bind the veto to this monetary clause, not another benefit elsewhere in a plan.
 for(const m of ownMoney){const after=local.slice(m.end,m.end+100),before=local.slice(Math.max(0,m.start-70),m.start);
  if(/^\s*(?:(?:monthly|annual|yearly|statement|shopping|travel|partner|service)\s+)*(?:credit|voucher|cashback|cash[ -]back|benefit)\b/iu.test(after)||/\b(?:credit|voucher|cashback)\s+(?:of|worth|up to)\s*$/iu.test(before))add('BENEFIT_CREDIT_NOT_SUBSCRIPTION_CHARGE',node,local);
 }
 if(candidate.amountNormalized!==null&&candidate.amountRaw){const parsed=monetary(candidate.amountRaw);if(parsed.some(m=>m.amount===null))add('INVALID_GROUPING_OR_ADJACENT_AMOUNTS',node,candidate.amountRaw);}
 const joining=local.match(/innmeldingsavgift på\s+kr\s*([\d.,]+)/iu);
 if(joining&&amount(joining[1])===candidate.amountNormalized)add('JOINING_FEE_NOT_RECURRING',node,joining[0]);
 if(ownMoney.some(m=>/^\s*för kortet\b/iu.test(local.slice(m.end)))&&/så länge receptet gäller/iu.test(local))add('FIXED_CARD_FEE_NOT_RECURRING',node,local);

 // A cost-comparison introduction owns the following list, not the page's
 // real plan cards or a later independent commercial section.
 for(let n=node;n&&n.tag!=='body';n=n.parent){
  if(['ul','ol','table'].includes(n.tag)&&n.parent){const before=n.parent.children.slice(0,n.index).filter(x=>x.tag!=='#text').at(-1);if(before&&/\bcost comparison\b|\bcompare (?:the )?costs?\b/iu.test(before.text??'')&&before.text.length<500)add('COMPARISON_PRICE_NOT_TARGET_OFFER',before,before.text);}
  if(['section','article','div'].includes(n.tag)&&n.text.length<16000){
   const term=n.text.match(/minimum\s+(?:contract|term|commitment)\s*(?:of\s*)?\d+\s*(?:weeks?|months?|years?)/iu);
   // Two presented term modes without a bound selected mode cannot be flattened
   // to an unconditional ordinary offer. Keep both the cadence and term wording.
   if(term&&/\bYear\s+Flex\b/iu.test(n.text)){add('COMMITMENT_VARIANT_SELECTION_UNRESOLVED',n,term[0]);break;}
  }
 }
 return out;
}
