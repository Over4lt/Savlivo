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
// A model's ACTUAL_PAYMENT label is a proposed reading of the quotation. The
// quotation still has to express a payment/price cycle, rather than only a
// displayed divisor, access period, or contract length. Source-owned typed
// billing relationships are handled by the normal structured-offer path.
function sourcePaymentMeaning(quote,cadence,nativeCadence) {
 if(nativeCadence)return nativeCadence===cadence;
 if(cadence!=='MONTHLY')return true;
 const s=quote.normalize('NFKC');
 if(/\b(?:billed|billing|charged|paid)\s+(?:[^.;!?\n]{0,48}?)\b(?:yearly|annually|annual|per year)\b|facturation annuelle|paiement annuel|when billed yearly/i.test(s))return false;
 if(/\b(?:equivalent|normalized|effective cost|divided by)\b|\b(?:access valid|valid for one month|one.month access|access pass|commitment term|contract term)\b/i.test(s))return false;
 const month=/\b(?:monthly|every month|each month|per month)\b|pro monat|por mes|por mês|per måned|per månad|pr\. måned|hver måned|monatlich|chaque mois|par mois|mensuel|mensal|月額|毎月|매월|월별|شهري/iu.test(s);
 const charge=/\b(?:bill(?:ed|ing)?|charg(?:e|ed|es|ing)|pay(?:ment|ments|ing)?|paid|renew(?:s|al|ed|ing)?|recurr(?:ing|ence)?|subscription|membership|price|cost)\b|abonnement|medlemskap|pris|mitgliedschaft|preis|assinatura|preço|paiement|pagamento|factur|支払|月額|결제|구독|اشتراك|يدفع|"(?:isRecurringProduct|recurring)"\s*:\s*true/iu.test(s);
 return month&&charge;
}
export function admitPayment({cadence,kind='UNKNOWN',text=null,rows=[],valid=()=>false,displayOnly=()=>false,commitment=null,native=()=>null,excludedQuantities=[]}) {
 const support=rows.filter(valid);
 const overlaps=(start,end)=>excludedQuantities.some(q=>start<q.end&&end>q.start);
 const compatible=r=>!native(r)||native(r)===cadence;
 const meaningful=support.some(r=>compatible(r)&&!displayOnly(r)&&sourcePaymentMeaning(r.translated?.text??r.quote,cadence,native(r)));
 const witnessed=kind==='ACTUAL_PAYMENT'&&typeof text==='string'&&text.trim().length>0&&text.length<=1024&&meaningful&&support.some(r=>{const at=r.quote.indexOf(text);return at>=0&&compatible(r)&&!overlaps(r.start+at,r.start+at+text.length)&&!displayOnly({...r,quote:text})&&text.trim()!==commitment?.trim();});
 const nativeSupport=support.filter(r=>!overlaps(r.start,r.end)&&!displayOnly(r)&&native(r)===cadence);
 const admitted=['MONTHLY','YEARLY','WEEKLY','DAILY'].includes(cadence)&&(witnessed||nativeSupport.length>0);
 return {kind:admitted?'ACTUAL_PAYMENT':'UNKNOWN',cadence:admitted?cadence:'UNKNOWN',support:admitted?(witnessed?support:nativeSupport):[],text:witnessed?text:null,reason:admitted?'SOURCE_PAYMENT_RELATION':'PAYMENT_RELATION_UNSUPPORTED'};
}
