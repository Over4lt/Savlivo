// Native interpretation emits the existing evidence envelope; projectEvidence
// and payment admission still independently validate all source references.
import {digest,providerBound} from './model.mjs';
import {semanticMaterial} from './source.mjs';
import {materialForUnit} from './semantic-units.mjs';
import {currencyOccurrences,resolveSourceCurrency} from './currency-sources.mjs';
import {verifiedCountryContext} from './truth-contract.mjs';
import {observationService} from './service-association.mjs';
import {interpretPaymentText,directStructuredStrings,structuredSubscriptionContext} from './subscription-language.mjs';
import {paymentLanguages,conceptMatches} from './payment-language-concepts.mjs';
export function nativeSubscriptionEvidence(o,objective,unit) {
 if(o.kind!=='PROVIDER'||o.outcome!=='OK'||o.httpStatus!==200||o.truncated||o.completeness==='TRUNCATED'||digest(o.body)!==o.sha256||!providerBound(objective,o.url)||!observationService(o,objective))return null;
 let material;try{material=materialForUnit(o,unit);}catch{return null;}
 const full=semanticMaterial(o),envelope={schema:'V3_EVIDENCE_V2',observationId:o.id,observationSha256:o.sha256,language:null,translationArtifact:null,service:{name:objective.serviceName,ambiguity:false,support:[],populations:[],account:[]},offers:[]};
 envelope.service.support=material.segments.filter(s=>full.presentations.some(p=>['title','h1'].includes(p.tag)&&s.start>=p.start&&s.end<=p.end)).map(s=>({start:s.start,end:s.end,quote:s.text,translated:null}));
 let currencies;try{currencies=currencyOccurrences({observation:{id:o.id,sha256:o.sha256},unit,material});}catch{return null;}
 for(const p of material.presentations) {
  const original=full.presentations.find(x=>x.id===p.id);
  // This class handles one independently retained structured record. HTML
  // still uses the existing native/semantic channels, never a pooled page.
  if(original?.tag!=='script-data')continue;
  // A recovered application-state declaration preserves data, but does not
  // itself establish that a configuration/demo record is a current offering.
  // Semantic assistance or independent explicit source evidence may resolve
  // that applicability; do not promote new literal syntax through field names.
  if(original.embedded)continue;
  const raw=o.body.slice(p.start,p.end),record=directStructuredStrings(raw,p.start);
  if(!record||record.limited)continue;
  const context=structuredSubscriptionContext(record.value);
  if(!context.title||!context.consumer||!context.recurring&&!context.subscription)continue;
  const rows=material.segments.filter(s=>s.start>=p.start&&s.end<=p.end);
  if(!rows.some(s=>s.start===p.start&&s.end===p.end))continue;
  const support=rows.map(s=>({start:s.start,end:s.end,quote:s.text,translated:null}));
  const containerSupport=support.filter(s=>s.start===p.start&&s.end===p.end);
  // Annual or explicit payment qualifiers anywhere in this record can govern
  // its price text. Do not accidentally use a short monthly display in place
  // of a longer annual-payment disclosure.
  const analyses=record.rows.map(row=>({row,charges:/credit|benefit|saving|tax|installment|discount|allowance/i.test(row.key??'')?[]:interpretPaymentText(row.raw,{recurring:context.recurring,subscription:context.subscription})}));
  const annual=analyses.some(a=>a.charges.some(c=>c.billingCadence==='YEARLY'))||record.rows.some(r=>paymentLanguages.some(l=>conceptMatches(r.raw,l,'year').some(y=>conceptMatches(r.raw,l,'pay').some(b=>b.end<=y.start&&new RegExp('^(?:(?:'+l.per+')\\s*)?$','iu').test(r.raw.slice(b.end,y.start).trim())||y.end<=b.start&&/^\s*$/.test(r.raw.slice(y.end,b.start))))));
  const commitmentRows=record.rows.filter(r=>paymentLanguages.some(l=>conceptMatches(r.raw,l,'commitment').length>0));
  const commitmentText=commitmentRows.length===1&&commitmentRows[0].raw.length<=256?commitmentRows[0].raw:null;
  // Prefer an explicit temporal sequence over duplicated decorative prices.
  const sequences=analyses.filter(a=>a.charges.some(c=>c.intro)&&a.charges.some(c=>c.subsequent));
  const candidates=sequences.length?sequences:analyses;
  const charges=[],transitions=[],seen=new Set();
  for(const {row,charges:parsed} of candidates)for(const c of parsed) {
   if(c.kind==='UNKNOWN_MONETARY_ROLE')continue;
   const currency=currencies.find(u=>u.start===row.start+c.currency.start&&u.end===row.start+c.currency.end);
   if(!currency)continue;
   const market=verifiedCountryContext(o),resolved=resolveSourceCurrency({occurrence:currency,selected:null,explicit:currencies.filter(u=>u.start>=p.start&&u.end<=p.end&&u.explicit).flatMap(u=>u.candidates),market,verification:market?o.transport.verification:null});
   if(!resolved.code)continue;
   const role=c.role==='SUBSEQUENT'&&!parsed.some(x=>x.intro)?'ORDINARY':c.role;
   const kind=annual&&c.cadence==='MONTHLY'&&!c.intro?'EFFECTIVE_COST':c.kind;
   const key=JSON.stringify([c.value,resolved.code,c.cadence,role,kind]);if(seen.has(key))continue;seen.add(key);
   const billingCadence=kind==='EFFECTIVE_COST'||commitmentRows.length&&!c.payment?'UNKNOWN':c.billingCadence;
   const phrase=c.paymentText??(row.raw.slice(c.left,c.right)+(c.duration?row.raw.slice(c.right,c.right+row.raw.slice(c.right).indexOf(c.duration)+c.duration.length):''));
   const clause=support.find(s=>s.start===row.start+c.left&&s.quote===phrase);
   if(!clause)continue;
   // Include the original recurring/subscription declaration with its own
   // price phrase when composing payment, rather than citing a bare /month.
   const flag=raw.match(/"(?:[^"\\]|\\.)*(?:recurr|subscription|membership)(?:[^"\\]|\\.)*"\s*:\s*true/i);
   const fragmentEnd=row.start+c.left+phrase.length-p.start;
   const fragmentStart=flag?Math.min(flag.index,row.start+c.left-p.start):row.start+c.left-p.start;
   const composed=raw.slice(fragmentStart,Math.max(fragmentEnd,flag?flag.index+flag[0].length:fragmentEnd));
   const paymentText=billingCadence==='UNKNOWN'?null:composed.length<=1024?composed:c.paymentText;
   if(paymentText&&!raw.includes(paymentText))continue;
   const id='native-charge-'+charges.length;
   charges.push({id,money:{amount:c.value,amountText:c.raw,amountSpan:{start:row.start+c.start,end:row.start+c.end,quote:c.raw},currency:resolved.code,currencyText:currency.raw},currencySource:{reference:currency.id,selected:null},cadence:{unit:c.intro?'UNKNOWN':c.cadence,expression:c.intro?null:c.cadenceText},role,derivation:kind==='EFFECTIVE_COST'?'ARITHMETIC':'EXPLICIT',duration:c.intro?c.duration:null,qualifiers:[],ambiguity:false,support:[clause],temporal:{billingCadence,billingSupport:billingCadence==='UNKNOWN'?[]:containerSupport,commitmentText,commitmentSupport:commitmentText?containerSupport:[],priceKind:kind==='EFFECTIVE_COST'?'EQUIVALENT':'CHARGE'},payment:{kind:paymentText?'ACTUAL_PAYMENT':'UNKNOWN',text:paymentText,support:paymentText?containerSupport:[]},monetary:{kind,support:[clause],relatedCharge:null,relation:'NONE'}});
   if(role==='SUBSEQUENT') {const intro=charges.find(v=>v.role==='INTRODUCTORY');if(intro)transitions.push({from:intro.id,to:id,kind:'RECURS_AFTER_INTRO',ambiguity:false,support});}
  }
  const ordinary=charges.filter(c=>c.role==='ORDINARY'||c.role==='SUBSEQUENT');
  // Conflicting ordinary prices/roles need semantic assistance; do not pick one.
  if(!charges.length||ordinary.length>1)continue;
  const qualifiers=record.rows.filter(r=>r.raw.length>64&&r.raw.length<=1024&&r.raw.includes(' ')&&!r.raw.startsWith('http')).map(r=>r.raw).slice(0,16);
  envelope.offers.push({presentation:p.id,name:context.title,service:objective.serviceName,audience:'CONSUMER',relationship:'SUBSCRIPTION',qualifiers,ambiguity:false,support,market:{country:null,basis:'UNKNOWN',ambiguity:false,support:[]},charges,transitions});
  if(envelope.offers.length>=8)break;
 }
 return envelope.offers.length?envelope:null;
}
