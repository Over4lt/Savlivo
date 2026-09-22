import fs from 'node:fs';import {createHash} from 'node:crypto';
import {runFieldGapFallback} from './fallback.mjs';
const hash=b=>createHash('sha256').update(b).digest('hex');
// Sidecar only: never edits ordinary facts, classifications or verification outputs.
export function analyzeInterpretedRun(directory,output){
 const read=p=>JSON.parse(fs.readFileSync(p)),manifest=read(directory+'/manifest.json'),sources=read(output+'/corpus/sources.json').sources,cs=read(output+'/monthly/candidates.json'),plans=read(output+'/monthly/monthly-plan-inventory.json'),receipts=[];
 for(const f of fs.readdirSync(directory+'/journal').filter(x=>/^record-\d+\.json$/.test(x)).sort()){const r=read(directory+'/journal/'+f);if(r.type==='RESPONSE_CAPTURED'&&r.payload.status===200)receipts.push({...r.payload,record:directory+'/journal/'+f});}
 const rows=[];let analysisUsed=0;const analysisRunCap=12800000;
 if(manifest.inventory.length>733)throw Error('CATALOG_TARGET_BOUND');
 for(const t of manifest.inventory){const claims=cs.filter(c=>c.service===t.service&&c.market===t.market),owned=sources.filter(s=>s.occurrences.some(o=>o.service===t.service&&o.market===t.market&&o.authority?.status==='CONFIGURED_REVIEWED'));const assessment={};
  const sufficient=plans.some(p=>p.service===t.service&&p.market===t.market&&p.strongRecurringMonthly);
  const missing={amount:!claims.some(c=>c.amountNormalized),currency:!claims.some(c=>c.currency),plan:!claims.some(c=>c.product&&!c.ownershipAmbiguous),cadence:!claims.some(c=>c.commercial?.type==='RECURRING_MONTHLY'),priceRole:!claims.some(c=>c.commercial?.strongRecurringMonthly),ownership:!claims.some(c=>c.product&&!c.ownershipAmbiguous),market:!claims.some(c=>c.attribution?.marketApplicabilityEstablished)};
  for(const [field,absent]of Object.entries(missing))if(absent&&!sufficient)assessment[field]={status:'UNRESOLVED',reason:'Ordinary interpretation did not establish '+field+' for a bounded canonical offer.'};
  const links=new Map(),modules=[],entries=[],gaps=[];
  for(const source of owned){const receipt=receipts.find(r=>r.bodyHash===source.sha256);if(!receipt)continue;const body=fs.readFileSync(directory+'/'+receipt.bodyFile);if(hash(body)!==source.sha256)continue;
   for(const m of body.toString().matchAll(/<script\b[^>]*src\s*=\s*["']([^"']+)["']/gi)){let url;try{url=new URL(m[1],receipt.url).href;}catch{continue;}if(/analytics|tracker|rocket-loader|\/akam\/|captcha/i.test(url))continue;links.set(url,{page:receipt.url,pageHash:source.sha256,record:receipt.record,offset:m.index});}}
  for(const [url,parent]of links){const receipt=receipts.find(r=>r.url===url&&r.target?.taskId===t.id);if(!receipt){gaps.push({url,reason:'MISSING_RETAINED_MODULE',parent});continue;}const bytes=fs.readFileSync(directory+'/'+receipt.bodyFile);if(hash(bytes)!==receipt.bodyHash)continue;const a=t.authorities.find(a=>a.hostname===new URL(url).hostname);modules.push({url,code:bytes.toString(),sha256:receipt.bodyHash,providerControlled:!!a,parentEvidence:parent});entries.push(url);}
  for(const receipt of receipts.filter(r=>r.target?.taskId===t.id&&/javascript/.test(r.contentType??''))){if(modules.some(m=>m.url===receipt.url))continue;const a=t.authorities.find(a=>a.hostname===new URL(receipt.url).hostname);if(!a)continue;const bytes=fs.readFileSync(directory+'/'+receipt.bodyFile);if(hash(bytes)!==receipt.bodyHash)continue;modules.push({url:receipt.url,code:bytes.toString(),sha256:receipt.bodyHash,providerControlled:true,parentEvidence:null});}
  const remaining=Math.max(0,analysisRunCap-analysisUsed);
  if(!remaining){rows.push({service:t.service,market:t.market,fieldAssessment:assessment,activation:{active:false,reason:'CATALOG_ANALYSIS_BOUND'},stops:[{reason:'CATALOG_ANALYSIS_BOUND'}],counts:{work:0},candidates:[]});continue;}
  const traced=runFieldGapFallback({ordinaryAcquisitionComplete:true,interpretationComplete:true,fieldAssessment:assessment,blocker:!owned.length?'TRANSPORT_OR_NO_BOUND_PROVIDER_BODY':claims.length&&claims.every(c=>['ANNUAL_RECURRING','PREPAID_FIXED_DURATION','INTRO_PROMOTION','TRIAL'].includes(c.commercial?.type))?'NONCANONICAL_ONLY':'',providerCodeRelevant:links.size>0,entries,modules,limits:{work:Math.min(200000,remaining)},authorities:t.authorities.map(a=>({hostname:a.hostname,validated:true,reference:a}))});analysisUsed+=traced.counts.work;
  rows.push({service:t.service,market:t.market,missingModuleBodies:gaps,analysisRunCap,analysisRunUsed:analysisUsed,...traced});
 }
 return rows;
}
