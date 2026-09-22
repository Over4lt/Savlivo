// A bounded relationship receipt, not a rewrite of discovered monetary facts.
import {monetary,normalizeText} from '../offline-recovery/extract.mjs';
const norm=s=>normalizeText(s??'').normalize('NFKC').toLowerCase();
export function introductoryRelationship(candidate,source,rows){
 if(candidate.commercial?.type!=='UNRESOLVED'||candidate.sourceType!=='HTML'||!candidate.product||candidate.ownershipAmbiguous||candidate.crossCardRisk)return null;
 const node=source.nodes.get(candidate.structuredPath);if(!node||node.text.length>6000)return null;
 const text=normalizeText(node.text),transitions=[...text.matchAll(/\bthen\b/gi)];if(transitions.length!==1)return null;
 const cut=transitions[0].index,before=text.slice(0,cut),after=text.slice(cut+4);
 const duration=before.match(/\b(?:for\s+(?:the\s+)?(?:first\s+)?|first\s+)(\d+|one|two|three|six)\s+months?\b/i);if(!duration)return null;
 const intro=monetary(before),regular=monetary(after);
 if(!intro.length||regular.length!==1||intro.some(m=>m.amount!==candidate.amountNormalized||m.currencyRaw!==candidate.currencyRaw)||regular[0].currencyRaw!==candidate.currencyRaw||regular[0].amount===candidate.amountNormalized)return null;
 // The exact same price node must independently yield the post-intro monthly
 // amount and own the same plan. No sibling-card or page-level price borrowing.
 const next=rows.filter(c=>c.structuredPath===candidate.structuredPath&&c.amountNormalized===regular[0].amount&&c.currency===candidate.currency&&norm(c.product)===norm(candidate.product)&&!c.ownershipAmbiguous&&!c.crossCardRisk&&c.commercial?.type==='RECURRING_MONTHLY'&&!c.commercial.nonRenewing&&!c.commercial.prepaid&&!c.commercial.oneTimePayment);
 if(next.length!==1)return null;
 return {version:1,role:'INTRODUCTORY',commercialType:'INTRO_PROMOTION',bodyHash:candidate.bodyHash,path:candidate.structuredPath,span:[node.start,node.end],raw:text,introAmount:candidate.amountNormalized,currency:candidate.currency,durationRaw:duration[0],regularAmount:regular[0].amount,regularCurrency:next[0].currency,plan:candidate.product,owner:candidate.productOwnerEvidence,regularEvidence:next[0].commercial.evidence,basis:'SAME_OWNED_NODE_FIXED_DURATION_THEN_RECURRING_MONTHLY',canonicalMonthlyEligible:false};
}
export function compatibleAlternative(peer,plan){
 if(['ANNUAL_RECURRING','PREPAID_FIXED_DURATION','ONE_TIME_NON_RENEWING','INTRO_PROMOTION','TRIAL','OTHER_MONETARY_OFFER'].includes(peer.commercialType))return true;
 const r=peer.priceRole;
 return peer.commercialType==='UNRESOLVED'&&r?.role==='INTRODUCTORY'&&r.basis==='SAME_OWNED_NODE_FIXED_DURATION_THEN_RECURRING_MONTHLY'&&r.bodyHash===peer.bodyHash&&r.path===peer.path&&r.introAmount===peer.amount&&r.currency===peer.currency&&r.regularAmount===plan.amounts[0]?.[0]&&r.regularCurrency===plan.amounts[0]?.[1]&&(norm(r.plan)===norm(plan.plan)||(plan.representations??[]).some(p=>norm(p)===norm(r.plan)));
}
