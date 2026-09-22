// Shadow reporting only. Never edits or overrides the authoritative baseline.
export function reconcileRunCoverage(primary,modules,baseline=[]){
 const key=p=>JSON.stringify([p.service,p.market,p.providerPlanId??p.plan.normalize('NFKC').toLowerCase()]);
 const semantic=p=>JSON.stringify([p.amount,p.currency,p.plan,p.commercialType,p.fields?.priceRole?.status,...(p.billingInterval&&p.billingInterval.unit!=='MONTH'?[p.billingInterval.normalized]:[])]);
 const groups=new Map();for(const p of [...(primary.verified??[]),...modules.flatMap(r=>r.endpoints.flatMap(e=>e.verification?.verified??[]))]){const k=key(p);if(!groups.has(k))groups.set(k,[]);groups.get(k).push(p);}
 const conflicts=[],verified=[];for(const [k,rows]of groups){if(new Set(rows.map(semantic)).size>1)conflicts.push({canonicalKey:k,reason:'CROSS_ACQUISITION_CANONICAL_CONFLICT',witnesses:rows});else verified.push(rows[0]);}
 const baselineDelta=baseline.map(p=>{const fresh=verified.find(v=>key(v)===key(p));return {canonicalKey:key(p),state:!fresh?'NOT_OBSERVED_IN_FRESH_RUN':semantic(fresh)===semantic(p)?'UNCHANGED_COMMERCIAL_FIELDS':'EXPLICIT_EVIDENCE_DELTA',before:{amount:p.amount,currency:p.currency,plan:p.plan,commercialType:p.commercialType},after:fresh?{amount:fresh.amount,currency:fresh.currency,plan:fresh.plan,commercialType:fresh.commercialType}:null};});
 return {verified,conflicts,baselineDelta,baselineMutated:false,verifiedIdentities:verified.length,servicesWithVerified:new Set(verified.map(p=>p.service)).size,pairsWithVerified:new Set(verified.map(p=>p.service+'|'+p.market)).size,newServices:[...new Set(verified.filter(p=>!baseline.some(b=>b.service===p.service)).map(p=>p.service))]};
}
