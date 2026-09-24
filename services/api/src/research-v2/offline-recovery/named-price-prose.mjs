// Bounded text relationships, not evidence admission. Offsets address normalized
// text at the retained DOM/JSON path; callers also bind the original body hash.
export const proseVersion='NAMED_PRICE_PROSE_V1';
export const proseBounds=Object.freeze({text:2000,prices:16,jsonFields:64,jsonCharacters:64000});
const monthly=/^\s*(?:\/\s*(?:month|mo|Monat|mois|mes|mês)|per month|pro Monat|par mois)\b/iu;
const separator=/;\s*|\s+(?:and|or|und|oder|bzw\.?)\s+|,?\s+(?:then|thereafter|danach|ensuite)\s+/giu;
const transition=/^(?:,?\s*)?(?:then|thereafter|danach|ensuite)\b/iu;
const renewalPrefix=/^(?:after (?:the )?(?:introductory period|first \d+ months|trial)|nach Ablauf der (?:ersten \d+ Monate|Testphase))(?:,\s*|\s+)/iu;
// Shared renewal clauses use subscription vocabulary, never provider identities.
const automatic=/^(?:verlängert sich (?:die Mitgliedschaft|das Abonnement) automatisch (?:um jeweils|um|für jeweils) (?:1|einen) Monat (?:zu|für)|the (?:membership|subscription) (?:automatically )?renews (?:monthly|every month) at)\s+/iu;
const forbidden=/\b(?:after|before|during|trial|introductory|total|then|included|credit|discount|benefit|tax|per|each|month|months|monthly|year|annual|billed|renew|renews|first|only|cancel|subscribe|limited|special|offer|contract|taxes|free|save|nach|Ablauf|Testphase|Monat|Monate|Gesamtpreis|je|pro|inklusive|kostenlos|from|ab|save|up to)\b/iu;
function name(s){s=s.trim();return s.length<=80&&/\p{L}/u.test(s)&&/^(?:\p{Lu}[\p{L}\p{N}+'’.-]*|[0-9]+)(?:[ &]+(?:\p{Lu}[\p{L}\p{N}+'’.-]*|[0-9]+)){0,5}$/u.test(s)&&!forbidden.test(s)&&!/[.!?]$/.test(s)&&! /\b(?:and|or|und|oder)\b/iu.test(s)?s:null;}
export function namedPriceProse(text,{monetary}){
 if(text.length>proseBounds.text)return [];
 const money=monetary(text);if(!money.length||money.length>proseBounds.prices)return [];
 const prefix=renewalPrefix.exec(text);let start=prefix?.[0].length??0;
 if(prefix){const a=automatic.exec(text.slice(start));if(a)start+=a[0].length;}
 const parts=[];separator.lastIndex=start;let last=start,join='';const cuts=[...text.matchAll(separator)];for(const [i,m]of cuts.entries()){if(m.index<start||!money.some(x=>x.start>=last&&x.end<=m.index)||!money.some(x=>x.start>=m.index+m[0].length&&x.end<=(cuts[i+1]?.index??text.length)))continue;parts.push({start:last,end:m.index,join});last=m.index+m[0].length;join=m[0];}parts.push({start:last,end:text.length,join});
 const out=[];let prior=null;
 for(const part of parts){const raw=text.slice(part.start,part.end),ms=monetary(raw);if(ms.length!==1){prior=null;continue;}const m=ms[0],before=raw.slice(0,m.start).trim(),after=raw.slice(m.end),cadence=monthly.exec(after);let plan=null,phase=prefix?'RENEWAL':'ORDINARY',duration=null,includedWith=null,planStart=-1;
  const parenthetical=cadence&&/^\s*\(([^()]*)\)/u.exec(after.slice(cadence[0].length));
  if(parenthetical&&!before){plan=name(parenthetical[1]);planStart=part.start+m.end+cadence[0].length+parenthetical[0].indexOf(parenthetical[1]);}
  const intro=/^(.+?)\s+(?:for|für)\s+(\d+)\s+(?:months?|Monate?)\s+(?:total|zum Gesamtpreis von|for a total of)$/iu.exec(before)
   ||(/^\s*total[.,]?\s*$/iu.test(after)?/^(.+?)\s+(?:for the first|first)\s+(\d+)\s+months?\s+for$/iu.exec(before):null);
  const included=/^(.+?)\s+is included with\s+(.+?)(?:\s+at)?$/iu.exec(before);
  if(intro&&!cadence){plan=name(intro[1]);phase='INTRO';duration={value:Number(intro[2]),unit:'MONTH'};if(duration.value<1||duration.value>120)plan=null;}
  else if(included){plan=name(included[1]);includedWith=name(included[2]);phase='INCLUDED';if(!includedWith)plan=null;}
  else if(!plan&&cadence){const named=/^(.+?)\s+(?:(?:automatically\s+)?renews?\s+at|at|sold separately at)$/iu.exec(before);if(named){plan=name(named[1]);if(/renews?\s+at$/iu.test(before))phase='RENEWAL';}else if(/^(?:Plan|Tarif|Paket|Membership)\s/iu.test(before))plan=name(before);}
  if(!plan&&cadence&&!before&&transition.test(part.join)&&prior?.phase==='INTRO'){plan=prior.plan;phase='RENEWAL';planStart=prior.planSpan[0];}
  if(parenthetical&&/^\s*\(/u.test(after.slice(cadence[0].length+parenthetical[0].length)))plan=null;
  if(transition.test(part.join)&&prior?.phase==='INTRO'&&plan&&plan!==prior.plan)plan=null;
  if(!plan||(!cadence&&phase!=='INTRO')){prior=null;continue;}
  // Unknown parentheticals are qualifiers, never a second identity. Keep all
  // clause text for downstream qualifier/commercial checks.
  if(planStart<0)planStart=part.start+raw.indexOf(plan);
  const relation={version:proseVersion,plan,phase,amount:m.amount,currencyRaw:m.currencyRaw,amountSpan:[part.start+m.start,part.start+m.end],planSpan:[planStart,planStart+plan.length],clauseSpan:[part.start,part.end],raw,monthly:!!cadence,duration,includedWith,transition:phase==='RENEWAL'?(prefix?.[0]??(transition.test(part.join)?part.join:null)):null,transitionSpan:phase==='RENEWAL'&&(prefix||transition.test(part.join))?(prefix?[0,start]:[part.start-part.join.length,part.start]):null,previousPhase:phase==='RENEWAL'&&prior?.phase==='INTRO'&&prior.plan===plan?{amount:prior.amount,duration:prior.duration,clauseSpan:prior.clauseSpan}:null};
  out.push(relation);prior=relation;
 }
 return out;
}
