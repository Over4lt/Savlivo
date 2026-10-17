import {pool} from '../src/db.ts';
import {serviceCatalog} from '../../../packages/contracts/src/catalog.ts';
import {planVerifiedCurrentRepair} from '../src/verified-price-reconciliation.mjs';

const args=process.argv.slice(2),allowed=new Set(['--service','--market','--apply','--expect-digest']);
for(let i=0;i<args.length;i++){
 const flag=args[i];
 if(!allowed.has(flag)||args.indexOf(flag)!==i)throw Error('SNAPSHOT_ARGUMENTS_INVALID');
 if(flag!=='--apply'){if(!args[i+1]||args[i+1].startsWith('--'))throw Error('SNAPSHOT_ARGUMENTS_INVALID');i++;}
}
const value=flag=>{const at=args.indexOf(flag);return at<0?undefined:args[at+1];};
const service=value('--service'),market=value('--market'),apply=args.includes('--apply'),expected=value('--expect-digest');
if(!/^[a-z0-9-]+$/.test(service??'')||!(/^[A-Z]{2}$/).test(market??'')||apply&&!/^[a-f0-9]{64}$/.test(expected??'')||!apply&&expected)throw Error('SNAPSHOT_ARGUMENTS_INVALID');

const current=row=>({serviceSlug:row.service_slug,planSlug:row.plan_slug,planIdentity:row.plan_identity,planName:row.plan_name,
 billingProviderSlug:row.billing_provider_slug,countryCode:row.country_code,currency:row.currency,
 monthlyPriceMinor:row.monthly_price_minor,source:row.source,sourceUrl:row.source_url,verification:row.verification,sourceCount:row.source_count,
 verifiedByAgreement:row.verified_by_agreement,verifiedAt:row.verified_at_exact,lastCheckedAt:row.last_checked_at_exact});
const observation=row=>({serviceSlug:row.service_slug,planSlug:row.plan_slug,planName:row.plan_name,
 billingProviderSlug:row.billing_provider_slug,countryCode:row.country_code,currency:row.currency,
 monthlyPriceMinor:row.monthly_price_minor,source:row.source,sourceUrl:row.source_url,verification:row.verification,
 sourceCount:row.source_count,verifiedByAgreement:row.verified_by_agreement,providerVerifiedAt:row.provider_verified_at_exact});

const client=await pool.connect();
try{
 if(apply){await client.query('BEGIN');await client.query('SELECT pg_advisory_xact_lock(hashtext($1),hashtext($2))',[service,market]);}
 const canonical=serviceCatalog.find(row=>row.slug===service)?.name;
 const research=canonical?null:(await client.query('SELECT canonical_name FROM research_service_identities WHERE canonical_slug=$1 AND status=$2',[service,'RESEARCHABLE'])).rows;
 const serviceName=canonical??(research?.length===1?research[0].canonical_name:null);
 if(!serviceName)throw Error('CANONICAL_SERVICE_NAME_UNRESOLVED');
 const currentRows=(await client.query(`SELECT *,verified_at::text AS verified_at_exact,last_checked_at::text AS last_checked_at_exact
   FROM verified_provider_prices WHERE service_slug=$1 AND country_code=$2 ${apply?'FOR UPDATE':''}`,[service,market])).rows.map(current);
 const historyRows=(await client.query('SELECT *,provider_verified_at::text AS provider_verified_at_exact FROM verified_price_observations WHERE service_slug=$1 AND country_code=$2',[service,market])).rows.map(observation);
 const plan=planVerifiedCurrentRepair(currentRows,historyRows,serviceName);
 const missing=plan.groups.flatMap(group=>[group.keep,group.remove].filter(row=>group.missingHistory.includes(row.planSlug)));
 if(!apply){
  console.log(JSON.stringify({mode:'DRY_RUN',service,market,serviceName,currentCount:currentRows.length,historyCount:historyRows.length,
   candidateCount:plan.candidateCount,missingObservationCount:missing.length,
   missing:missing.map(row=>({planSlug:row.planSlug,planName:row.planName,amount:row.monthlyPriceMinor,currency:row.currency,verifiedAt:row.verifiedAt})),
   refused:plan.refused,digest:plan.digest}));
 }else{
  if(plan.digest!==expected)throw Error('SNAPSHOT_CURRENT_CHANGED');
  if(plan.refused.length)throw Error('SNAPSHOT_REFUSED_AMBIGUITY');
  let inserted=0;
  for(const row of missing){
   const result=await client.query(`INSERT INTO verified_price_observations
     (service_slug,plan_slug,plan_name,billing_provider_slug,country_code,currency,
      monthly_price_minor,source,source_url,verification,source_count,verified_by_agreement,provider_verified_at)
     SELECT p.service_slug,p.plan_slug,p.plan_name,p.billing_provider_slug,p.country_code,p.currency,
      p.monthly_price_minor,p.source,p.source_url,p.verification,p.source_count,p.verified_by_agreement,p.verified_at
     FROM verified_provider_prices p WHERE p.service_slug=$1 AND p.plan_slug=$2
       AND p.billing_provider_slug=$3 AND p.country_code=$4 AND p.currency=$5 AND p.verified_at=$6::timestamptz
       AND NOT EXISTS (SELECT 1 FROM verified_price_observations h WHERE
         h.service_slug=p.service_slug AND h.plan_slug=p.plan_slug AND h.plan_name=p.plan_name
         AND h.billing_provider_slug=p.billing_provider_slug AND h.country_code=p.country_code
         AND h.currency=p.currency AND h.monthly_price_minor=p.monthly_price_minor
         AND h.source=p.source AND h.source_url=p.source_url AND h.verification=p.verification
         AND h.source_count=p.source_count AND h.verified_by_agreement=p.verified_by_agreement
         AND h.provider_verified_at=p.verified_at)
     RETURNING id`,[row.serviceSlug,row.planSlug,row.billingProviderSlug,row.countryCode,row.currency,row.verifiedAt]);
   if(result.rowCount!==1)throw Error('SNAPSHOT_ROW_CHANGED');
   inserted++;
  }
  const updated=(await client.query('SELECT *,provider_verified_at::text AS provider_verified_at_exact FROM verified_price_observations WHERE service_slug=$1 AND country_code=$2',[service,market])).rows.map(observation);
  if(!planVerifiedCurrentRepair(currentRows,updated,serviceName).ready)throw Error('SNAPSHOT_HISTORY_INCOMPLETE');
  await client.query('COMMIT');
  console.log(JSON.stringify({mode:'APPLIED',service,market,inserted,currentCount:currentRows.length,historyCount:updated.length,digest:plan.digest}));
 }
}catch(error){if(apply)await client.query('ROLLBACK');throw error;}
finally{client.release();await pool.end();}
