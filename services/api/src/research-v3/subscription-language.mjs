// Bounded source semantics only. No authority, applicability, eligibility or truth verdicts.
import {paymentLanguages,conceptMatches} from './payment-language-concepts.mjs';
import {sourceNumberCandidates} from './numeric-source.mjs';
import {currencyOccurrences,resolveSourceCurrency} from './currency-sources.mjs';
export const languageLimits=Object.freeze({fragments:32,characters:4096,charges:8});
const matches=(s,l,k)=>conceptMatches(s,l,k);
const space=s=>/^\s*$/.test(s);
export function interpretPaymentText(text,{recurring=false,subscription=false}={}) {
 if(typeof text!=='string'||text.length>languageLimits.characters)return [];
 const request={observation:{id:'language',sha256:'lexical'},material:{segments:[{start:0,end:text.length,text}]}};
 let currencies;try{currencies=currencyOccurrences(request);}catch{return [];}
 const money=[];
 for(const m of text.matchAll(/[-−]?\p{Decimal_Number}+(?:[.,]\p{Decimal_Number}+|[ \u00a0\u202f]\p{Decimal_Number}{3}(?!\p{Decimal_Number}))*/gu)) {
  const values=sourceNumberCandidates(m[0]);if(values.length!==1||values[0]<0)continue;
  const n={start:m.index,end:m.index+m[0].length,raw:m[0],value:values[0]};
  const u=currencies.find(u=>u.end<=n.start&&n.start-u.end<8&&space(text.slice(u.end,n.start))||u.start>=n.end&&u.start-n.end<8&&space(text.slice(n.end,u.start)));
  if(u)money.push({...n,currency:u,left:Math.min(n.start,u.start),right:Math.max(n.end,u.end)});
 }
 if(money.length>languageLimits.charges)return [];
 const interpretations=[];
 for(const l of paymentLanguages) {
  // Require grammatical cadence connection, not a language classifier.
  const clauses=money.map((m,i)=>{
   const previous=i?money[i-1].right:0,next=money[i+1]?.left??text.length;
   const tail=text.slice(m.right,next),head=text.slice(previous,m.left),local=text.slice(previous,next);
   const month=matches(tail,l,'month'),year=matches(tail,l,'year');
   const cadenceCandidates=[...month.map(x=>({...x,cadence:'MONTHLY'})),...year.map(x=>({...x,cadence:'YEARLY'}))].sort((a,b)=>a.start-b.start);
   const c=cadenceCandidates.find(c=>c.start<64&&new RegExp('^(?:(?:'+l.pay+')\\s*)?(?:(?:'+l.per+')\\s*)?$','iu').test(tail.slice(0,c.start).trim())&&(tail.slice(0,c.start).trim().length>0||matches(head,l,'pay').length>0));
   const durationCandidates=cadenceCandidates.filter(c=>c.start<64&&matches(tail.slice(0,c.start),l,'duration').some(p=>/^\s*\d+\s*$/.test(tail.slice(p.end,c.start))));
   const duration=durationCandidates[0]??cadenceCandidates.find(c=>c.start<64&&matches(tail.slice(0,c.start),l,'initial').length>0);
   const subsequent=paymentLanguages.some(lang=>matches(head,lang,'then').length>0),first=paymentLanguages.some(lang=>matches(head+' '+tail,lang,'initial').length>0),trial=paymentLanguages.some(lang=>matches(local,lang,'trial').length>0);
   const payment=matches(head,l,'pay').length>0||matches(tail,l,'pay').some(p=>p.start<64);
   const effective=matches(local,l,'effective').length>0;
   const excluded=matches(local,l,'noncharge').length>0;
   return {...m,language:l.id,cadence:c?.cadence??'UNKNOWN',cadenceText:c?tail.slice(0,c.end).trim():null,duration:duration?tail.slice(0,duration.end).trim():null,subsequent:!!subsequent,intro:!subsequent&&(first||trial||!!duration),effective,excluded,payment,grammar:c!==undefined||duration!==undefined};
  });
  if(!clauses.some(c=>c.grammar))continue;
  const negated=matches(text,l,'negation').some(n=>clauses.some(c=>n.end<=c.left&&c.left-n.end<48));
  // Annual payment governs monthly equivalents in the same fragment, never vice versa.
  const annual=clauses.some(c=>c.cadence==='YEARLY'&&c.payment&&!c.effective&&!c.excluded);
  const commitment=matches(text,l,'commitment').length>0;
  for(const c of clauses) {
   const explicitCharge=(recurring||subscription||matches(text,l,'subscription').length>0)&&c.grammar&&!c.excluded&&!negated;
   c.role=c.intro?'INTRODUCTORY':c.subsequent?'SUBSEQUENT':'ORDINARY';
   c.kind=c.excluded?'UNKNOWN_MONETARY_ROLE':c.effective||annual&&c.cadence==='MONTHLY'?'EFFECTIVE_COST':c.intro?'INTRODUCTORY_SUBSCRIPTION_CHARGE':explicitCharge?'SUBSCRIPTION_CHARGE':'UNKNOWN_MONETARY_ROLE';
   c.billingCadence=explicitCharge&&!c.intro&&c.kind==='SUBSCRIPTION_CHARGE'&&(c.payment||recurring&&!commitment||subscription&&!commitment&&c.payment)?c.cadence:'UNKNOWN';
   c.paymentText=c.billingCadence!=='UNKNOWN'?text.slice(c.left,c.right)+text.slice(c.right,c.right+(c.cadenceText?text.slice(c.right).indexOf(c.cadenceText)+c.cadenceText.length:0)):null;
  }
  interpretations.push({language:l.id,charges:clauses.filter(c=>c.grammar),commitment});
 }
 // Overlapping lexical resources may agree; conflicting analyses are unresolved.
 const signatures=new Map();for(const p of interpretations){const key=JSON.stringify(p.charges.map(c=>[c.start,c.value,c.role,c.kind,c.cadence,c.billingCadence,c.duration]));if(!signatures.has(key))signatures.set(key,p);}
 return signatures.size===1?[...signatures.values()][0].charges:[];
}

// Only complete, direct scalar values belong to this offering. Nested siblings
// are never pooled. JSON validity is checked before locating lexical values.
export function directStructuredStrings(raw,start=0) {
 let value;try{value=JSON.parse(raw);}catch{return null;}
 if(!value||Array.isArray(value)||typeof value!=='object')return null;
 const rows=[];let depth=0,key=null;
 for(let i=0;i<raw.length;) {
  if(raw[i]==='"') {const at=i++;while(i<raw.length){if(raw[i]==='\\'){i+=2;continue;}if(raw[i++]==='"')break;}
   const token=raw.slice(at,i);let after=i;while(/\s/.test(raw[after]??'')&&after<raw.length)after++;
   if(depth===1&&raw[after]===':')key=JSON.parse(token);
   if(depth===1&&raw[after]!==':'){const text=JSON.parse(token);if(typeof text==='string')rows.push({key,text,raw:raw.slice(at+1,i-1),start:start+at+1,end:start+i-1});}
  }else{if(raw[i]==='{'||raw[i]==='[')depth++;if(raw[i]==='}'||raw[i]===']')depth--;i++;}
 }
 return {value,rows:rows.slice(0,languageLimits.fragments),limited:rows.length>languageLimits.fragments};
}
export function structuredSubscriptionContext(value) {
 const entries=Object.entries(value),keys=entries.map(([k,v])=>[k.replace(/([a-z])([A-Z])/g,'$1 $2').toLowerCase(),v]);
 const recurring=keys.some(([k,v])=>v===true&&/^(?:is )?recurring(?: (?:product|offer|charge|subscription))?$/.test(k));
 const explicitConsumer=keys.some(([k,v])=>k==='consumer'&&v===true);
 const texts=entries.flatMap(([,v])=>typeof v==='string'?[v]:[]).join(' ');
 const consumer=explicitConsumer||paymentLanguages.some(l=>matches(texts,l,'consumer').length>0);
 const business=paymentLanguages.some(l=>matches(texts,l,'business').length>0);
 const subscription=paymentLanguages.some(l=>matches(texts,l,'subscription').length>0);
 const title=keys.find(([k,v])=>['name','title','header'].includes(k)&&typeof v==='string'&&v.trim()&&v.length<=256)?.[1];
 return {recurring,consumer:consumer&&!business,subscription,title};
}
export {resolveSourceCurrency};
