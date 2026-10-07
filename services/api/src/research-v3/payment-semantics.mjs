// Canonical source semantics. Research beliefs never enter this module.
// A quantity's display period, payment interval and contract term are independent.
export const monetaryKinds=Object.freeze(['SUBSCRIPTION_CHARGE','INTRODUCTORY_SUBSCRIPTION_CHARGE','TRIAL_CHARGE','BENEFIT','CREDIT','ALLOWANCE','SAVINGS','DISCOUNT','EFFECTIVE_COST','NORMALIZED_COST','REFERENCE_PRICE','TAX','INSTALLMENT','UNKNOWN_MONETARY_ROLE']);
export const chargeKinds=new Set(['SUBSCRIPTION_CHARGE','INTRODUCTORY_SUBSCRIPTION_CHARGE','TRIAL_CHARGE']);
export function quantityKind(monetary){return {EQUIVALENT_OF:'EFFECTIVE_COST',BENEFIT_OF:'BENEFIT',DISCOUNT_OF:'DISCOUNT',REFERENCE_FOR:'REFERENCE_PRICE'}[monetary?.relation]??monetary?.kind??'UNKNOWN_MONETARY_ROLE';}
export function ordinaryCharge(offer) {
 return offer?.role==='ORDINARY'&&(!offer.monetaryKind||offer.monetaryKind==='SUBSCRIPTION_CHARGE');
}
export function monthlyPayment(offer) {
 return offer?.consumer===true&&['SUBSCRIPTION','MEMBERSHIP'].includes(offer.relationship)&&ordinaryCharge(offer)&&offer.billingCadence==='MONTHLY';
}
export function paymentChoice(choice) {
 // In structured authoritative observations monthlyOffered is an assertion of
 // actual payment availability, not a display interval. WEB admission emits it
 // only after the same payment validator used for charges.
 return choice?.monthlyOffered===true&&['SERVICE','PLAN'].includes(choice.scope)&&['COMPLETE','PARTIAL'].includes(choice.basis)&&(!choice.payment||choice.payment.kind==='ACTUAL_PAYMENT'&&choice.payment.cadence==='MONTHLY');
}
export function admitPayment({cadence,kind='UNKNOWN',text=null,rows=[],valid=()=>false,displayOnly=()=>false,commitment=null,native=()=>null,excludedQuantities=[]}) {
 const support=rows.filter(valid);
 const overlaps=(start,end)=>excludedQuantities.some(q=>start<q.end&&end>q.start);
 const compatible=r=>!native(r)||native(r)===cadence;
 const witnessed=kind==='ACTUAL_PAYMENT'&&typeof text==='string'&&text.trim().length>0&&text.length<=1024&&support.some(r=>{const at=r.quote.indexOf(text);return at>=0&&compatible(r)&&!overlaps(r.start+at,r.start+at+text.length)&&!displayOnly({...r,quote:text})&&text.trim()!==commitment?.trim();});
 const nativeSupport=support.filter(r=>!overlaps(r.start,r.end)&&!displayOnly(r)&&native(r)===cadence);
 const admitted=['MONTHLY','YEARLY','WEEKLY','DAILY'].includes(cadence)&&(witnessed||nativeSupport.length>0);
 return {kind:admitted?'ACTUAL_PAYMENT':'UNKNOWN',cadence:admitted?cadence:'UNKNOWN',support:admitted?(witnessed?support:nativeSupport):[],text:witnessed?text:null,reason:admitted?'SOURCE_PAYMENT_RELATION':'PAYMENT_RELATION_UNSUPPORTED'};
}
