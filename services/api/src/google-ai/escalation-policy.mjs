const materialWarnings=new Set(['MARKET_AMBIGUITY','SOURCE_CONFLICT','BILLING_AMBIGUITY','PRODUCT_AMBIGUITY','BILLING_ROUTE_AMBIGUITY','FIRST_PARTY_NOT_CONFIRMED','AI_PRICE_MISSING']);
const compact=value=>String(value??'').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g,' ').replace(/\b(monthly|month)\b/g,'').trim();
const samePlan=(a,b)=>{const left=compact(a.plan),right=compact(b.plan),owner=compact(a.provider??b.provider);return left===right||left===owner+' '+right||right===owner+' '+left;};
const differentPrice=(a,b)=>Number(a.amount)!==Number(b.amount)||a.currency!==b.currency;

export function escalationReasons(snapshot,{existingVerified=[],researchCandidates=[],verificationDesired=true}={}){
  const reasons=[];
  if(!snapshot.suggested.length)reasons.push('NO_USABLE_SUGGESTED');
  if(snapshot.suggested.length&&!existingVerified.length&&verificationDesired)reasons.push('VERIFIED_ABSENT');
  if(snapshot.suggested.some(s=>existingVerified.some(v=>samePlan(s,v)&&differentPrice(s,v))))reasons.push('SUGGESTED_VERIFIED_CONFLICT');
  if([...snapshot.suggested,...researchCandidates].some(row=>(row.warnings??[]).some(w=>materialWarnings.has(w))))reasons.push('MATERIAL_WARNING');
  if(researchCandidates.some(row=>row.plan&&!Number.isFinite(row.amount??row.suggestedAmount)))reasons.push('PRICE_MISSING');
  return [...new Set(reasons)];
}

export function shouldEscalate(snapshot,context={}){const reasons=escalationReasons(snapshot,context);return {escalate:reasons.length>0,reasons};}
