// Partner authority is a separate, reviewed relationship; never a search lead.
// All commercial fields still come from deriveEvidence and the unchanged gate.
import {hash} from '../offline-recovery/extract.mjs';
import {deriveEvidence,verifyCandidate} from './gate.mjs';
import {loadLiveSource} from './live-source.mjs';
export const partnerRoles=Object.freeze(['DIRECT_STANDARD_PRICE','PARTNER_STANDARD_PRICE','PARTNER_BUNDLE_PRICE','PARTNER_POINTS_PRICE','PARTNER_DISCOUNT','PARTNER_PROMOTION','PARTNER_INCLUDED_BENEFIT','PARTNER_ADD_ON','PARTNER_ONLY_PLAN','UNKNOWN_PARTNER_PRICE_ROLE']);
const relationships=new Set(['OFFICIAL_DISTRIBUTOR_OF','OFFICIAL_RESELLER_OF','OFFICIAL_BILLING_PARTNER_OF','OFFICIAL_ACTIVATION_PARTNER_OF']);
function intact(s){return typeof s?.body==='string'&&Buffer.byteLength(s.body)<=2*1024*1024&&hash(s.body)===s.receipt?.bodyHash&&s.receipt.intact===true&&s.receipt.serviceEstablished===true&&s.receipt.bindingEstablished===true;}
function locator(s,l){return l&&Number.isInteger(l.start)&&Number.isInteger(l.end)&&l.start>=0&&l.end>l.start&&l.end<=s.body.length&&l.bodyHash===s.receipt.bodyHash&&typeof l.quote==='string'&&l.quote.trim().length>0&&s.body.slice(l.start,l.end)===l.quote;}
// `review` is an independently reviewed repository evidence contract, not model
// output or provider self-assertion. Persist the complete contract with results.
export function validatePartnerRelationship({source,anchor,review,service,market}){
 const fail=reason=>({status:'UNRESOLVED',reason});
 if(!intact(source)||!intact(anchor))return fail('SOURCE_OR_ANCHOR_INTEGRITY_AUTHORITY_MISSING');
 if(!review||review.status!=='INDEPENDENTLY_REVIEWED'||!review.reviewer||!review.reviewedAt||!relationships.has(review.relationship))return fail('OFFICIAL_RELATIONSHIP_NOT_REVIEWED');
 if(review.service!==service||review.partner!==source.receipt.service||anchor.receipt.service!==service||source.receipt.service===service)return fail('RELATIONSHIP_PARTIES_MISMATCH');
 if(!Array.isArray(review.markets)||!review.markets.includes(market))return fail('PARTNER_MARKET_NOT_PROVEN');
 if(review.conflicts?.length||!Array.isArray(review.conflicts))return fail('RELATIONSHIP_CONFLICT');
 if(!locator(source,review.partnerIdentityEvidence))return fail('RELATIONSHIP_LOCATOR_INVALID');
 // Two independently reviewed evidence paths. The activation path requires
 // both independently trusted parties and the exact provider activation URL.
 if(review.basis==='TRUSTED_PROVIDER_NAMES_OFFICIAL_PARTNER'){
  if(!locator(anchor,review.relationshipEvidence))return fail('RELATIONSHIP_LOCATOR_INVALID');
 }else if(review.basis==='TRUSTED_PARTNER_EXPLICIT_PROVIDER_ACTIVATION'){
  if(!locator(source,review.relationshipEvidence)||!locator(source,review.activationEvidence)||review.activationPurpose!=='SUBSCRIPTION_ACTIVATION')return fail('ACTIVATION_RELATIONSHIP_UNPROVEN');
  const link=review.activationEvidence.quote.match(/^<a\s+href=["'](https:\/\/[^"'<>]+)["']\s*>[^<>]+<\/a>$/i);
  if(!link||link[1]!==anchor.receipt.sourceUrl)return fail('PROVIDER_ACTIVATION_DESTINATION_UNPROVEN');
 }else return fail('UNSUPPORTED_RELATIONSHIP_BASIS');
 return {status:'PROVEN',evidenceClass:'OFFICIAL_DISTRIBUTION_PARTNER_EVIDENCE',service,market,partner:review.partner,relationship:review.relationship,review,reviewHash:hash(review),sourceReceipt:source.receipt,anchorReceipt:anchor.receipt,authorityScope:'EXPLICIT_COMMERCIAL_FIELDS_ONLY'};
}
export function verifyPartnerOffer({source,anchor,review,service,market,offer}){
 const authority=validatePartnerRelationship({source,anchor,review,service,market});
 const fail=(reason,extra={})=>({status:'V2_VERIFICATION_BLOCKED',blockers:[reason],authority,channel:'PARTNER',priceRole:offer?.priceRole??'UNKNOWN_PARTNER_PRICE_ROLE',productionPromotion:false,offerEvidence:offer??null,...extra});
 if(authority.status!=='PROVEN')return fail(authority.reason);
 if(!offer||!partnerRoles.includes(offer.priceRole)||!locator(source,offer.roleEvidence)||offer.service!==service||offer.market!==market)return fail('PARTNER_OFFER_ROLE_OR_SCOPE_UNPROVEN');
 if(offer.conflicts?.length||!Array.isArray(offer.conflicts))return fail('UNRESOLVED_CRITICAL_CONFLICT');
 // A partner's channel-specific price never masquerades as direct pricing.
 // Partner statements about direct standard pricing need a separate reviewed
 // exact offer/role locator; normal interpretation must independently agree.
 if(offer.priceRole!=='DIRECT_STANDARD_PRICE')return fail('PARTNER_CHANNEL_PRICE_NOT_DIRECT_CANONICAL');
 if(offer.reviewStatus!=='INDEPENDENTLY_REVIEWED'||!offer.reviewer||!offer.reviewedAt)return fail('DIRECT_STANDARD_ROLE_NOT_REVIEWED');
 const context={...source.context,bodyHash:source.receipt.bodyHash,service,market,authority:true};
 const derived=deriveEvidence(source.body,context);
 const rows=derived.rows.filter(c=>c.structuredPath===offer.pricePath);
 if(rows.length!==1)return fail('PARTNER_PRICE_LOCATOR_NOT_UNIQUE');
 if(!offer.product||offer.product!==rows[0].product)return fail('PARTNER_PRODUCT_RELATIONSHIP_UNPROVEN');
 const claim={...rows[0],sourceUrl:source.receipt.sourceUrl};
 const receipt={...source.receipt,service,serviceEstablished:true,serviceEvidence:authority};
 const decision=verifyCandidate(claim,derived,receipt);
 return {...decision,evidenceClass:authority.evidenceClass,channel:'PARTNER',partner:authority.partner,priceRole:offer.priceRole,authority,offerReview:offer,derivedClaim:claim};
}

// Normal retained-source entry: reuse existing authority, hash, binding and geo
// validation. Never turn a partner URL into a direct-provider source contract.
export function verifyRetainedPartnerOffer({partnerOccurrence,providerOccurrence,partnerHash,providerHash,bindings,review,offer,service,market,root=process.cwd()}){
 try{
  const source=loadLiveSource(partnerOccurrence,partnerHash,bindings,root);
  const anchor=loadLiveSource(providerOccurrence,providerHash,bindings,root);
  return verifyPartnerOffer({source,anchor,review,offer,service,market});
 }catch(error){return {status:'V2_VERIFICATION_BLOCKED',blockers:['PARTNER_RETAINED_PROVENANCE_FAILURE'],reason:String(error.message),productionPromotion:false};}
}
