import {createHash} from 'node:crypto';

const text=value=>String(value??'').normalize('NFKC').trim().replace(/\s+/gu,' ');
const key=value=>text(value).toLocaleLowerCase('und');
const verified=row=>row?.verification==='authoritative-provider'||row?.verification==='multi-source'&&row.verifiedByAgreement===true&&Number(row.sourceCount)>=2;

export function semanticPlanLabel(planName,serviceName){
 const label=text(planName),brand=text(serviceName);
 if(!label||!brand)return null;
 const prefix=key(brand),folded=key(label),next=label.slice(brand.length);
 const prefixed=folded.startsWith(prefix)&&/^[\s:–—-]+/u.test(next);
 const core=text(prefixed?next.replace(/^[\s:–—-]+/u,''):label);
 return core?{core:key(core),prefixed}:null;
}

// The only semantic alias accepted here is the same complete plan label with
// the canonical service display name at its beginning on exactly one side.
export function semanticVerifiedAlias(a,b,serviceName){
 for(const field of ['serviceSlug','billingProviderSlug','countryCode','currency'])if(a[field]!==b[field])return false;
 const left=semanticPlanLabel(a.planName,serviceName),right=semanticPlanLabel(b.planName,serviceName);
 return !!left&&!!right&&left.prefixed!==right.prefixed&&left.core===right.core;
}
export function equivalentVerifiedPlan(a,b,serviceName){
 return verified(a)&&verified(b)&&a.verification===b.verification&&semanticVerifiedAlias(a,b,serviceName);
}

const timestamp=row=>Date.parse(row.verifiedAt??'');
const identity=row=>[row.serviceSlug,row.planSlug,row.billingProviderSlug,row.countryCode,row.currency].join('\u0000');
const observationMatches=(observation,row)=>['serviceSlug','planSlug','planName','billingProviderSlug','countryCode','currency','monthlyPriceMinor','source','sourceUrl','verification','sourceCount','verifiedByAgreement'].every(field=>observation[field]===row[field])&&observation.providerVerifiedAt===row.verifiedAt;
export const verifiedSnapshotDigest=rows=>createHash('sha256').update(JSON.stringify(rows.map(row=>[identity(row),row.planIdentity,row.planName,row.monthlyPriceMinor,row.source,row.sourceUrl,row.verification,row.sourceCount,row.verifiedByAgreement,row.verifiedAt,row.lastCheckedAt]).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))))).digest('hex');

export function planVerifiedCurrentRepair(rows,observations,serviceName){
 const digest=verifiedSnapshotDigest(rows),seen=new Set(),groups=[],refused=[];
 for(const row of rows){
  const id=identity(row);if(seen.has(id))continue;
  const matches=rows.filter(other=>identity(other)===id||semanticVerifiedAlias(row,other,serviceName));
  for(const match of matches)seen.add(identity(match));
  if(matches.length===1)continue;
  const labels=matches.map(match=>({planSlug:match.planSlug,planName:match.planName,amount:match.monthlyPriceMinor,verifiedAt:match.verifiedAt}));
  if(matches.length!==2||!equivalentVerifiedPlan(matches[0],matches[1],serviceName)){
   refused.push({reason:'AMBIGUOUS_EQUIVALENCE',rows:labels});continue;
  }
  const sorted=[...matches].sort((a,b)=>timestamp(b)-timestamp(a));
  if(!Number.isFinite(timestamp(sorted[0]))||!Number.isFinite(timestamp(sorted[1]))||timestamp(sorted[0])===timestamp(sorted[1])){
   refused.push({reason:'AMBIGUOUS_FRESHNESS',rows:labels});continue;
  }
  const [keep,remove]=sorted;
  const missing=[keep,remove].filter(candidate=>!observations.some(observation=>observationMatches(observation,candidate)));
  groups.push({keep,remove,missingHistory:missing.map(candidate=>candidate.planSlug)});
 }
 const ready=refused.length===0&&groups.every(group=>group.missingHistory.length===0);
 return {digest,groups,refused,ready,candidateCount:groups.length,deleteCount:ready?groups.length:0};
}
