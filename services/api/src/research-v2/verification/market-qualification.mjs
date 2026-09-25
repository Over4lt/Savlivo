// Bounded applicability grammar, not country-word proximity. Vocabulary is data;
// an exact offer subject and an applicability predicate are both mandatory.
const normalize=s=>String(s).normalize('NFKC').trim().replace(/\s+/g,' ').toLowerCase();
const countries=new Map();
function add(name,code){const key=normalize(name);if(!countries.has(key))countries.set(key,new Set());countries.get(key).add(code);}
for(const locale of ['en','de','fr','es','pt','nl','it']){const names=new Intl.DisplayNames([locale],{type:'region',fallback:'none'});for(let a=65;a<=90;a++)for(let b=65;b<=90;b++){const code=String.fromCharCode(a,b),name=names.of(code);if(name){const canonical=new Intl.Locale('und-'+code).region;add(name,canonical);add(code,canonical);}}}
// Adjectives are not provided by Intl.DisplayNames. They are consumed only in
// residence/address productions, never as free-standing geographic evidence.
const adjectives={german:'DE',austrian:'AT',american:'US',british:'GB',canadian:'CA',australian:'AU',french:'FR',spanish:'ES',italian:'IT',dutch:'NL',norwegian:'NO',swedish:'SE',danish:'DK',swiss:'CH',irish:'IE',polish:'PL',portuguese:'PT',japanese:'JP',brazilian:'BR',indian:'IN'};
function countryList(raw,{adjective=false}={}){const pieces=raw.split(/\s+(?:and|or|und)\s+|\s*[,/&]\s*/iu);if(!pieces.length||pieces.length>8)return null;const codes=[];for(let token of pieces){token=normalize(token).replace(/^the\s+/,'');const found=countries.get(token),code=found?.size===1?[...found][0]:adjective?adjectives[token]:null;if(!code)return null;codes.push(code);}return [...new Set(codes)];}
export function parseMarketQualification(text,plan){
 if(typeof text!=='string'||text.length>500||!plan)return null;
 let statement=text.trim().replace(/[.!]$/,'');const prefix=normalize(plan);if(!normalize(statement).startsWith(prefix))return null;
 const rest=statement.slice(plan.length);if(!/^(?:\s|:|—|–)/u.test(rest))return null;
 let clause=normalize(rest).replace(/^\s*[:—–]\s*/u,'').trim(),tail=null;
 const qualified=clause.match(/\s+(except|unless|subject to|for selected|provided that)\b.*$/u);if(qualified){tail=qualified[0].trim();clause=clause.slice(0,qualified.index);}
 let polarity='POSITIVE',exclusive=false,type='AVAILABILITY',raw=null,adjective=false,m;
 // Required address/residence is an exclusive eligibility qualification.
 if((m=/^(?:requires? (?:a |an )?|customers must have (?:a |an )?)(.+?) billing address$/.exec(clause))){raw=m[1];type='BILLING_COUNTRY';exclusive=true;adjective=true;}
 else if((m=/^(?:is )?(?:not available|unavailable) in (.+)$/.exec(clause))){raw=m[1];polarity='NEGATIVE';}
 else if((m=/^(?:is )?not offered to (.+?) residents$/.exec(clause))){raw=m[1];polarity='NEGATIVE';type='RESIDENCY';adjective=true;}
 else if((m=/^(.+?) billing addresses are not supported$/.exec(clause))){raw=m[1];polarity='NEGATIVE';type='BILLING_COUNTRY';adjective=true;}
 else if((m=/^(.+?) excluded$/.exec(clause))){raw=m[1];polarity='NEGATIVE';}
 else if((m=/^(?:is )?(only )?(?:available|eligible|offered)( only)?\s+(.+)$/.exec(clause))){exclusive=!!(m[1]||m[2]);let scope=m[3];
  if((m=/^in (.+)$/.exec(scope)))raw=m[1];
  else if((m=/^to (?:customers|residents) (?:in|of) (.+)$/.exec(scope))){raw=m[1];type=/residents/.test(scope)?'RESIDENCY':'CUSTOMER_LOCATION';}
  else if((m=/^to (.+?) residents$/.exec(scope))){raw=m[1];type='RESIDENCY';adjective=true;}
  else if((m=/^with (?:a |an )?(.+?) billing address$/.exec(scope))){raw=m[1];type='BILLING_COUNTRY';adjective=true;}
 }
 else if((m=/^(?:is )?(?:offer )?limited to (?:customers|residents) (?:in|of) (.+)$/.exec(clause))){raw=m[1];exclusive=true;type='CUSTOMER_LOCATION';}
 else if((m=/^(?:is )?(.+?) only$/.exec(clause))){raw=m[1];exclusive=true;}
 // Existing German whole-assertion form is retained.
 else if((m=/^ist (nicht )?in (.+?)(?: verfügbar)?$/.exec(clause))){raw=m[2];polarity=m[1]?'NEGATIVE':'POSITIVE';}
 if(!raw)return null;if(/ only$/.test(raw)){raw=raw.slice(0,-5);exclusive=true;}
 const codes=countryList(raw,{adjective});if(!codes)return null;
 return {version:'SOURCE_BOUND_MARKET_QUALIFICATION_V1',scopeSubject:plan,countries:codes,polarity,exclusive,qualificationType:type,qualification:tail,reviewStatus:tail?'REVIEW_REQUIRED':'ESTABLISHED',binding:'EXACT_NAMED_OFFER',confidence:tail?'UNRESOLVED':'SOURCE_BOUND'};
}
