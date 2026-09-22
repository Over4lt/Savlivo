// Experimental, deterministic preservation. No provider names or market defaults.
const countWords={one:1,two:2,three:3,six:6,um:1,uma:1,dois:2,duas:2,'três':3,seis:6,uno:1,un:1,dos:2,tres:3,'ένα':1,'έναν':1,'δύο':2,'τρεις':3,'έξι':6};
const count='(?:[0-9]+|'+Object.keys(countWords).join('|')+')';
const months='(?:months?|meses|mês|mes|μήνες|μήνα|tháng|Monate?|mois)';
const durationRE=new RegExp(`(?:for|por|cho|για|first|primeros|after|após)\\s+(${count})(?:\\s*\\([0-9]+\\))?\\s+(${months})|(${count})\\s+(${months})\\s+(?:für|for)`,'giu');
export function recognized(text){const found=[];const add=(kind,value,raw)=>found.push({kind,value,raw});
 for(const m of text.matchAll(/\b(\d+)[- ]days?\s+trial\b/giu))add('TRIAL_DAYS',Number(m[1]),m[0]);
 for(const m of text.matchAll(durationRE)){const n=m[1]??m[3],v=countWords[n.toLowerCase()]??Number(n);add(/first|primeros/i.test(m[0])?'INTRO_DURATION':/after|após/i.test(m[0])?'AFTER_DURATION':'FIXED_DURATION',v,m[0]);}
 for(const m of text.matchAll(/\b(\d+)\s+(members?|persons?|personnes?|Mitglieder)\b/giu))add('MEMBER_COUNT',Number(m[1]),m[0]);
 const patterns=[['PER_PERSON',/per (?:person|member)|pro (?:Person|Mitglied)|par personne/giu],['BILLED_ANNUALLY',/billed (?:annually|yearly)|annual billing|billed at[^!]{0,80}\/year|factur[ée] annuellement/giu],['MONTHLY_DISPLAY',/\/mo(?:nth)?\b|per month|par mois/giu],['TAX_INCLUDED',/tax(?:es)? included|incl\.?\s*(?:VAT|tax)|including (?:VAT|tax)|부가세 포함|TVA incluse/giu],['TAX_EXCLUDED',/plus tax|excluding tax|tax(?:es)? excluded|más impuestos(?: aplicables)?|hors taxes/giu]];
 for(const [kind,re]of patterns)for(const m of text.matchAll(re))add(kind,true,m[0]);
 return found;
}
const token=q=>q.kind==='TRIAL_DAYS'?`TRIAL_DURATION:${q.value}:DAY`:q.kind==='FIXED_DURATION'?`FIXED_DURATION:${q.value}:MONTH`:q.kind==='INTRO_DURATION'?`INTRO_DURATION:${q.value}:MONTH`:q.kind==='AFTER_DURATION'?`AFTER_DURATION:${q.value}:MONTH`:q.kind==='MEMBER_COUNT'?`MEMBER_COUNT:${q.value}`:q.kind;
export function preserveQualifiers(c,{localText,ownerText,localPath,ownerPath,ownerStrong,localMoneyCount=1,ownerMoneyCount=1}){
 const evidence=[],unresolved=[];const local=recognized(localText),all=recognized(ownerText);const add=(q,scope,path)=>evidence.push({...q,scope,structuredPath:path,token:token(q)});
 for(const q of local)add(q,'PRICE_CONTEXT',localPath);
 // Shared member and annual-contract conditions come only from the existing owner.
 // Price-scoped duration/tax found elsewhere in a multi-price owner is retained,
 // but not assigned to this price without a structural relationship.
 for(const q of all){if(local.some(x=>token(x)===token(q)))continue;
  if(q.kind==='BILLED_ANNUALLY'&&(local.some(x=>['FIXED_DURATION','INTRO_DURATION','TRIAL_DAYS'].includes(x.kind))||/trial/i.test(localText))){add(q,'UNRESOLVED_ATTACHMENT',ownerPath);unresolved.push('MATERIAL_QUALIFIER_ATTACHMENT_UNRESOLVED');}
  else if(['MEMBER_COUNT','BILLED_ANNUALLY'].includes(q.kind)&&ownerStrong)add(q,'OWNING_OFFER',ownerPath);
  else if(q.kind==='PER_PERSON'){
   if(!local.some(x=>x.kind==='BILLED_ANNUALLY')&&ownerStrong)add(q,'OWNING_OFFER',ownerPath);
  }else if(q.kind==='MONTHLY_DISPLAY'&&ownerStrong&&!local.some(x=>['FIXED_DURATION','INTRO_DURATION','TRIAL_DAYS'].includes(x.kind))&&!/trial/i.test(localText)&&all.some(x=>x.kind==='BILLED_ANNUALLY')&&!local.some(x=>x.kind==='BILLED_ANNUALLY'))add(q,'OWNING_OFFER',ownerPath);
  else if(q.kind!=='MONTHLY_DISPLAY'){
   if(ownerStrong&&ownerMoneyCount===1&&!['FIXED_DURATION','INTRO_DURATION','AFTER_DURATION','TRIAL_DAYS'].includes(q.kind))add(q,'OWNING_OFFER',ownerPath);
   else {add(q,'UNRESOLVED_ATTACHMENT',ownerPath);unresolved.push('MATERIAL_QUALIFIER_ATTACHMENT_UNRESOLVED');}
  }
 }
 if(localMoneyCount>1&&local.some(q=>['INTRO_DURATION','AFTER_DURATION'].includes(q.kind)))unresolved.push('MATERIAL_QUALIFIER_ATTACHMENT_UNRESOLVED');
 if(ownerText.length>6000||localText.length>6000)unresolved.push('QUALIFIER_EVIDENCE_BOUND');
 const applied=evidence.filter(e=>e.scope!=='UNRESOLVED_ATTACHMENT');
 const qualifiers=new Set(c.qualifier);for(const q of applied)if(q.kind!=='MONTHLY_DISPLAY')qualifiers.add(q.token);
 const durations=applied.filter(q=>['FIXED_DURATION','INTRO_DURATION','AFTER_DURATION'].includes(q.kind));
 // Keep the existing human-readable comparison token, but do not call a fixed
 // duration the recurring billing period. Source silence still requires nothing.
 for(const q of durations)qualifiers.add('EXPLICIT_DURATION:'+q.value+' '+(q.value===1?'month':'months'));
 if(applied.some(q=>q.kind==='TRIAL_DAYS')){c.billingPeriod=null;c.promotionOrTrial='PROMOTION_OR_TRIAL';}
 if(durations.length){c.billingPeriod=null;c.promotionOrTrial=c.promotionOrTrial??'FIXED_DURATION_OFFER';}
 if(applied.some(q=>q.kind==='INTRO_DURATION'))c.promotionOrTrial='PROMOTION_OR_TRIAL';
 if(new Set(durations.map(q=>q.value)).size>1)unresolved.push('MATERIAL_QUALIFIER_CONFLICT');
 if(applied.some(q=>q.kind==='TAX_INCLUDED')&&applied.some(q=>q.kind==='TAX_EXCLUDED'))unresolved.push('MATERIAL_QUALIFIER_CONFLICT');
 if(applied.some(q=>q.kind==='BILLED_ANNUALLY')&&applied.some(q=>q.kind==='MONTHLY_DISPLAY'))qualifiers.add('MONTHLY_EQUIVALENT');
 c.qualifier=[...qualifiers].sort();c.qualifierEvidence=evidence.map(e=>({...e,raw:e.raw.slice(0,300)}));c.qualifierPreservation={version:1,recognized: [...new Set(evidence.map(e=>e.token))].sort(),required:[...new Set(applied.filter(e=>e.kind!=='MONTHLY_DISPLAY').map(e=>e.token))].sort(),unresolved:[...new Set(unresolved)].sort(),ownerPath,localPath};
 return c;
}
export function qualifierSafety(c){const p=c.qualifierPreservation;if(!p)return [];const out=[...p.unresolved];if(p.required.some(q=>/^(FIXED_DURATION|INTRO_DURATION|TRIAL_DURATION):/.test(q))&&c.billingPeriod!==null)out.push('MATERIAL_QUALIFIER_BILLING_CONFLICT');if(p.required.some(q=>!c.qualifier.includes(q)))out.push('MATERIAL_QUALIFIER_DROPPED');return [...new Set(out)].sort();}
