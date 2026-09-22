// Additive shadow inventory only. No price parsing, authority promotion or network.
import {createHash} from 'node:crypto';
export const hash=x=>createHash('sha256').update(x).digest('hex');
export const categories=['audio_reading_news','commerce_delivery_mealkit','fitness','health_education_dating','software_security_ai','video_sports'];
export const inputNames=['savlivo-v2-canonical-dedupe-2026-09-18.csv','savlivo-v2-new-canonical-candidates-2026-09-18.csv','savlivo-v2-new-service-market-targets-2026-09-18.csv'];
export const headers=['service','category','markets','market_count','status','note','dedupe_status','existing_match'];
export const norm=s=>s.normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase().replace(/\+/g,' plus ').replace(/[^\p{L}\p{N}]+/gu,' ').trim();
export const slug=s=>norm(s).replace(/ /g,'-');
export function parseCsv(bytes,expected){
 const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes).replace(/^\uFEFF/,'');
 const rows=[];let row=[],value='',quoted=false,closed=false;
 for(let i=0;i<text.length;i++){const c=text[i];if(quoted){if(c==='"'){if(text[i+1]==='"'){value+='"';i++;}else{quoted=false;closed=true;}}else value+=c;continue;}
  if(c==='"'){if(value||closed)throw Error('CSV_QUOTE');quoted=true;continue;}
  if(c===','||c==='\n'||c==='\r'){row.push(value);value='';closed=false;if(c!==','){if(c==='\r'&&text[i+1]==='\n')i++;rows.push(row);row=[];}continue;}
  if(closed)throw Error('CSV_AFTER_QUOTE');if(c==='\0')throw Error('CSV_NUL');value+=c;
 }
 if(quoted)throw Error('CSV_UNCLOSED_QUOTE');if(value||row.length||closed){row.push(value);rows.push(row);}
 if(JSON.stringify(rows.shift())!==JSON.stringify(expected))throw Error('CSV_HEADERS');
 return rows.map((r,i)=>{if(r.length!==expected.length)throw Error('CSV_WIDTH:'+i);return Object.fromEntries(expected.map((h,j)=>[h,r[j]]));});
}
export function csv(rows,columns){const cell=v=>'"'+String(v??'').replace(/"/g,'""')+'"';return [columns,...rows.map(r=>columns.map(c=>r[c]))].map(r=>r.map(cell).join(',')).join('\n')+'\n';}
const unique=(rows,key,label)=>{const seen=new Set();for(const r of rows){const k=key(r);if(seen.has(k))throw Error('DUPLICATE_'+label+':'+k);seen.add(k);}};
export function validateInputs(bytes,markets){
 const all=parseCsv(bytes[0],headers),preliminary=parseCsv(bytes[1],headers),targets=parseCsv(bytes[2],['service','category','market','status']);
 const allowed=new Set(markets);if(allowed.size!==markets.length)throw Error('MARKET_AUTHORITY_DUPLICATE');
 for(const rows of [all,preliminary]){unique(rows,r=>r.service+'|'+r.category,'SERVICE');for(const r of rows){if(!r.service.trim()||r.service!==r.service.trim()||!categories.includes(r.category)||r.status!=='INCLUDE_CANDIDATE'||!['EXISTING_OR_ALIAS','NEW_CANONICAL_CANDIDATE'].includes(r.dedupe_status))throw Error('INVALID_CANDIDATE');const ms=r.markets.split(',');if(new Set(ms).size!==ms.length||ms.some(m=>!allowed.has(m))||String(ms.length)!==r.market_count)throw Error('INVALID_MARKETS');}}
 unique(targets,r=>r.service+'|'+r.category+'|'+r.market,'TARGET');
 for(const r of targets)if(!allowed.has(r.market)||r.status!=='RESEARCH_TARGET'||!categories.includes(r.category)||!r.service.trim())throw Error('INVALID_TARGET');
 const expected=all.filter(r=>r.dedupe_status==='NEW_CANONICAL_CANDIDATE');
 if(JSON.stringify(preliminary)!==JSON.stringify(expected))throw Error('PRELIMINARY_SUBSET_MISMATCH');
 const expectedTargets=expected.flatMap(r=>r.markets.split(',').map(m=>r.service+'|'+r.category+'|'+m)).sort();
 if(JSON.stringify(expectedTargets)!==JSON.stringify(targets.map(r=>r.service+'|'+r.category+'|'+r.market).sort()))throw Error('PRELIMINARY_MATRIX_MISMATCH');
 return {all,preliminary,targets};
}
export function reconcileCandidates({inputs,catalog,markets,reviews=[],historical=[]}){
 const index=new Map();for(const s of catalog)for(const n of [s.name,s.slug,...s.aliases]){const key=norm(n);index.set(key,[...(index.get(key)??[]),s]);}
 const byId=new Map(catalog.map(s=>[s.slug,s]));const decisions=[];
 for(const r of inputs.all){const review=reviews.find(x=>x.input===r.service&&(!x.category||x.category===r.category));const matches=[...new Map((index.get(norm(r.service))??[]).map(s=>[s.slug,s])).values()];let canonical=matches.length===1?matches[0]:null;
  let disposition=canonical?(r.service===canonical.name?'EXISTING':'ALIAS_OF_EXISTING'):'NEW_INCLUDE',reason=canonical?'Exact shared-catalog identity/alias match.':'User-supplied consumer subscription candidate; shadow research inclusion only. Provider availability and commercial fields remain unproven.';
  let name=canonical?.name??r.service,id=canonical?.slug;
  if(matches.length>1){disposition='RESEARCH';reason='Ambiguous catalog alias requires identity review.';}
  if(review){disposition=review.disposition;reason=review.reason;if(review.existing){canonical=byId.get(review.existing);if(!canonical)throw Error('REVIEW_UNKNOWN_EXISTING');name=canonical.name;id=canonical.slug;}else{canonical=null;name=review.name??r.service;id=review.slug;}}
  if(!id){const history=historical.filter(h=>h.name===name&&h.slug);id=history.length===1?history[0].slug:slug(name);}
  if(!canonical&&byId.has(id))throw Error('NEW_ID_COLLIDES_WITH_EXISTING:'+id);
  if(!['EXISTING','ALIAS_OF_EXISTING','NEW_INCLUDE','RESEARCH','EXCLUDE','REBRAND_TO_EXISTING','REBRAND_TO_NEW_CANONICAL'].includes(disposition))throw Error('INVALID_DISPOSITION');
  decisions.push({input_service:r.service,input_category:r.category,disposition,canonical_service:name,canonical_slug:id,reason,existing_or_new:canonical?'EXISTING':'NEW',markets:r.markets.split(','),sourceRow:inputs.all.indexOf(r)+2,reference:review?.reference??'SUPPLIED_CANDIDATE_DATASET',preliminaryMatch:r.existing_match});
 }
 const groups=new Map();for(const d of decisions.filter(d=>d.existing_or_new==='NEW')){const membership=d.disposition==='REBRAND_TO_NEW_CANONICAL'?'NEW_INCLUDE':d.disposition;const old=groups.get(d.canonical_slug);if(old&&old.name!==d.canonical_service)throw Error('UNREVIEWED_ID_COLLISION:'+d.canonical_slug);if(old&&old.disposition!==membership)throw Error('DISPOSITION_COLLISION');groups.set(d.canonical_slug,{slug:d.canonical_slug,name:d.canonical_service,category:d.input_category,disposition:membership,productionEligible:false,markets:[...new Set([...(old?.markets??[]),...d.markets])].sort(),references:[...(old?.references??[]),{inputService:d.input_service,row:d.sourceRow,reference:d.reference}]});}
 const universe={version:'V2_ADDITIVE_CANDIDATES_V1',marketAuthority:'packages/contracts/src/markets.ts#countryCurrencyData',existing:structuredClone(catalog),new_include:[],research:[],exclude:[]};
 for(const g of groups.values()){universe[g.disposition==='EXCLUDE'?'exclude':g.disposition==='RESEARCH'?'research':'new_include'].push(g);}
 const targets=[...universe.new_include,...universe.research].flatMap(s=>s.markets.map(m=>({id:'v2-'+hash(s.slug+'|'+m).slice(0,24),service:s.slug,serviceName:s.name,category:s.category,market:m,scope:s.disposition,marketStatus:'PLAUSIBLE_RESEARCH_MARKET',marketApplicabilityEstablished:false,currency:null,urls:[],authorities:[],provenance:s.references}))).sort((a,b)=>(a.service+'|'+a.market).localeCompare(b.service+'|'+b.market));
 unique(targets,t=>t.service+'|'+t.market,'RECONCILED_TARGET');if(targets.some(t=>!markets.includes(t.market)))throw Error('TARGET_MARKET');
 return {universe,decisions,targets};
}
