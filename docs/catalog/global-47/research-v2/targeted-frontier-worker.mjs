import {assertOffline} from '../../../../services/api/src/research-v2/offline-replay/offline-guard.mjs';
import fs from 'node:fs';import path from 'node:path';
import {loadLiveSource} from '../../../../services/api/src/research-v2/verification/live-source.mjs';
import {deriveEvidence,verifyCandidate,verifyIdentity} from '../../../../services/api/src/research-v2/verification/gate.mjs';
const dir=process.argv[2],name=process.argv[3]??'interpretation-0001',out=dir+'/'+name;const read=p=>JSON.parse(fs.readFileSync(p));
const cs=read(out+'/monthly/candidates.json'),plans=read(out+'/monthly/monthly-plan-inventory.json'),bindings=read(out+'/discovery/bindings.json'),sources=read(out+'/corpus/sources.json').sources;
const decisions=new Map(),checks=[],usable=[];
for(const s of sources)for(const o of s.occurrences){let loaded;try{loaded=loadLiveSource(o,s.sha256,bindings);checks.push({hash:s.sha256,occurrence:o.id,receipt:loaded.receipt,status:'HASH_VERIFIED'});}catch{checks.push({hash:s.sha256,occurrence:o.id,status:'INTEGRITY_FAILURE'});continue;}
 const selected=cs.filter(c=>c.bodyHash===s.sha256&&c.sourceOccurrenceIds.includes(o.id));
 // Fallback diagnostics only. Never feeds extraction, classification, or verification.
 const text=loaded.body.replace(/<(script|style|nav|header|footer)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,' ').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ');
 const pattern=/(?:subscription|subscribe|membership|abonnement|abonnemang|berlangganan|langganan|구독|اشتراك|会員|月額|đăng ký|assinar|suscripción)/ig;
 const snippets=[...text.matchAll(pattern)].map(m=>text.slice(Math.max(0,m.index-100),m.index+240)).filter(s=>/(?:price|plan|month|annual|trial|billing|renew|cancel|family|premium|pris|måned|mån|paket|harga|bulan|구독|月額|đăng ký|اشتراك)/i.test(s)).slice(0,8);
 if(loaded.receipt.serviceEstablished&&(selected.length||snippets.length))usable.push({occurrence:o.id,hash:s.sha256,basis:selected.length?'PROVIDER_MONETARY_EVIDENCE':'PROVIDER_SUBSCRIPTION_CONTEXT',snippets});
 const derived=deriveEvidence(loaded.body,loaded.context);
 for(const c of selected)decisions.set(c.candidateId,verifyCandidate(c,derived,{...loaded.receipt,bindingEstablished:loaded.receipt.bindings.some(b=>b.candidateId===c.candidateId&&b.factId===c.factId)}));
}
const strong=plans.filter(p=>p.strongRecurringMonthly),key=p=>JSON.stringify([p.service,p.market,p.providerPlanId??p.plan.normalize('NFKC').toLowerCase()]);
const ledger=strong.map(p=>verifyIdentity(p,decisions,{canonicalConflict:strong.filter(q=>key(q)===key(p)).length!==1}));
const verified=ledger.filter(p=>p.status==='V2_VERIFIED'),facts=read(out+'/monthly/facts.json');
// Produced by the same current offline adjudication; no second extraction pass.
const priceEvidenceNeedsByTarget=read(out+'/provider-price-intelligence.json').priceEvidenceNeedsByTarget??{};
const report={priceEvidenceNeedsByTarget,usable:usable.length>0,usableEvidence:usable,sourceChecks:checks,monetaryFacts:facts.length,monthlyFacts:facts.filter(f=>f.commercial.type==='RECURRING_MONTHLY').length,strongMonthly:strong.length,verified,blocked:ledger.filter(p=>p.status!=='V2_VERIFIED'),types: [...new Set(facts.map(f=>f.commercial.type))],marketEvidence:read(out+'/monthly/sources-analyzed.json'),blockers:[...new Set(cs.flatMap(c=>c.blockingReasons??[]))],offline:assertOffline()};
fs.writeFileSync(out+'/targeted-verification.json',JSON.stringify(report,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({usable:report.usable,monetary:report.monetaryFacts,verified:verified.length}));
