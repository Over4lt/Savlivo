import {pool} from '../src/db.ts';
import {serviceCatalog} from '../../../packages/contracts/src/catalog.ts';
import {planVerifiedCurrentRepair} from '../src/verified-price-reconciliation.mjs';

const args=process.argv.slice(2),allowed=new Set(['--service','--market','--apply','--expect-digest']);
for(let i=0;i<args.length;i++){
 const flag=args[i];
 if(!allowed.has(flag)||args.indexOf(flag)!==i)throw Error('REPAIR_ARGUMENTS_INVALID');
 if(flag!=='--apply'){if(!args[i+1]||args[i+1].startsWith('--'))throw Error('REPAIR_ARGUMENTS_INVALID');i++;}
}
const value=flag=>{const at=args.indexOf(flag);return at<0?undefined:args[at+1];};
const service=value('--service'),market=value('--market'),apply=args.includes('--apply'),expected=value('--expect-digest');
if(!/^[a-z0-9-]+$/.test(service??'')||!(/^[A-Z]{2}$/).test(market??'')||apply&&!/^[a-f0-9]{64}$/.test(expected??'')||!apply&&expected)throw Error('REPAIR_ARGUMENTS_INVALID');

const current=row=>({serviceSlug:row.service_slug,planSlug:row.plan_slug,planIdentity:row.plan_identity,planName:row.plan_name,
 billingProviderSlug:row.billing_provider_slug,countryCode:row.country_code,currency:row.currency,
 monthlyPriceMinor:row.monthly_price_minor,source:row.source,sourceUrl:row.source_url,verification:row.verification,sourceCount:row.source_count,
 verifiedByAgreement:row.verified_by_agreement,verifiedAt:row.verified_at_exact,
 lastCheckedAt:row.last_checked_at_exact});
const observation=row=>({serviceSlug:row.service_slug,planSlug:row.plan_slug,planName:row.plan_name,
 billingProviderSlug:row.billing_provider_slug,countryCode:row.country_code,currency:row.currency,
 monthlyPriceMinor:row.monthly_price_minor,source:row.source,sourceUrl:row.source_url,verification:row.verification,
 sourceCount:row.source_count,verifiedByAgreement:row.verified_by_agreement,
 providerVerifiedAt:row.provider_verified_at_exact});
const compact=plan=>({digest:plan.digest,ready:plan.ready,candidateCount:plan.candidateCount,deleteCount:plan.deleteCount,
 groups:plan.groups.map(({keep,remove,missingHistory})=>({keep:{planSlug:keep.planSlug,planName:keep.planName,amount:keep.monthlyPriceMinor,currency:keep.currency,verifiedAt:keep.verifiedAt},remove:{planSlug:remove.planSlug,planName:remove.planName,amount:remove.monthlyPriceMinor,currency:remove.currency,verifiedAt:remove.verifiedAt},missingHistory})),refused:plan.refused});

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
 if(!apply){console.log(JSON.stringify({mode:'DRY_RUN',service,market,serviceName,currentCount:currentRows.length,historyCount:historyRows.length,...compact(plan)}));}
 else{
  if(plan.digest!==expected)throw Error('REPAIR_SNAPSHOT_CHANGED');
  if(!plan.ready)throw Error('REPAIR_REFUSED_HISTORY_OR_AMBIGUITY');
  let removed=0;
  for(const {remove} of plan.groups){
   const result=await client.query(`DELETE FROM verified_provider_prices WHERE service_slug=$1 AND plan_slug=$2
     AND billing_provider_slug=$3 AND country_code=$4 AND currency=$5 AND verified_at=$6::timestamptz`,
     [remove.serviceSlug,remove.planSlug,remove.billingProviderSlug,remove.countryCode,remove.currency,remove.verifiedAt]);
   if(result.rowCount!==1)throw Error('REPAIR_ROW_CHANGED');
   removed++;
  }
  await client.query('COMMIT');
  console.log(JSON.stringify({mode:'APPLIED',service,market,removed,currentCount:currentRows.length-removed,digest:plan.digest}));
 }
}catch(error){if(apply)await client.query('ROLLBACK');throw error;}
finally{client.release();await pool.end();}
