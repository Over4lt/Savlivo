import {createHash} from "node:crypto";
import {pool} from "./db.js";
import {countryCurrencyData} from "../../../packages/contracts/src/markets.js";
import {catalogPlanIdentity} from "../../../packages/contracts/src/product-pricing.js";
import {currentRow,verifiedHistorySeriesId} from "./pricing-store.js";
import {equivalentVerifiedPlan,semanticVerifiedAlias,verifiedSnapshotDigest} from "./verified-price-reconciliation.mjs";
import {listResearchServiceIdentities} from "./research-v3/research-identity-store.mjs";
import {loadResearchServiceProjection} from "./research-v3/research-service-projection.mjs";
import type {Pool,PoolClient} from "pg";

const markets=new Map(countryCurrencyData.map(([code,,currency])=>[code,currency]));
const slug=/^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const maxRows=10_000;
const batchSize=25;
const day=24*60*60*1000;
const digest=(value:unknown)=>createHash("sha256").update(JSON.stringify(value)).digest("hex");
const stamp=(value:string|Date)=>new Date(value).toISOString();
type Row=ReturnType<typeof currentRow>;
type Candidate={row:Row;seriesId:string;rowDigest:string;scopeDigest:string;reviewFlags:string[]};
type Plan={digest:string;snapshotAt:string;rowsExamined:number;candidates:Candidate[];
  excluded:Record<string,number>;reviewFlags:Record<string,number>;
  refusals:{service:string;market:string;plan:string;reason:string}[];
  reviewRows:{service:string;market:string;plan:string;flags:string[]}[]};

const key=(row:Row)=>[row.serviceSlug,row.planSlug,row.billingProviderSlug,row.countryCode,row.currency].join("\u0000");
const scope=(row:Row)=>[row.serviceSlug,row.billingProviderSlug,row.countryCode,row.currency].join("\u0000");
const validUrl=(value:string)=>{try{const url=new URL(value);return url.protocol==="https:"&&!url.username&&!url.password;}catch{return false;}};
const publicOrigin=(value:string)=>{try{return new URL(value).origin;}catch{return "INVALID_SOURCE_URL";}};
const note=(counts:Record<string,number>,reason:string)=>{counts[reason]=(counts[reason]??0)+1;};
const valid=(row:Row,serviceNames:Map<string,string>,snapshotAt:string)=>{
 if(row.verification!=="authoritative-provider")return "NOT_AUTHORITATIVE_PROVIDER";
 if(!slug.test(row.serviceSlug)||!serviceNames.has(row.serviceSlug))return "UNKNOWN_SERVICE_IDENTITY";
 if(!slug.test(row.planSlug)||!slug.test(row.billingProviderSlug)||!row.planName.trim())return "INVALID_PLAN_IDENTITY";
 if(!markets.has(row.countryCode))return "NONCANONICAL_MARKET";
 if(!/^[A-Z]{3}$/.test(row.currency)||!Number.isSafeInteger(row.monthlyPriceMinor)||row.monthlyPriceMinor<=0)return "INVALID_PRICE";
 if(!row.source?.trim()||!validUrl(row.sourceUrl))return "SOURCE_NOT_TRACEABLE";
 if(!Number.isFinite(Date.parse(row.verifiedAt))||!Number.isFinite(Date.parse(row.lastCheckedAt)))return "INVALID_VERIFICATION_TIME";
 if(Date.parse(row.verifiedAt)>Date.parse(snapshotAt)||Date.parse(row.lastCheckedAt)>Date.parse(snapshotAt))
  return "FUTURE_VERIFICATION_TIME";
 if(row.planIdentity!==null&&(typeof row.planIdentity!=="string"||!row.planIdentity.trim()))return "INVALID_PLAN_IDENTITY";
 if(row.historySeriesId!==null&&!/^vh:[0-9a-f]{64}$/.test(row.historySeriesId))return "INVALID_SERIES_ID";
 return null;
};

function classify(rows:Row[],serviceNames:Map<string,string>,existing=new Map<string,boolean>(),snapshotAt=new Date().toISOString()){
 const excluded:Record<string,number>={},reviewFlags:Record<string,number>={},candidates:Candidate[]=[];
 const refusals:Plan["refusals"]=[],reviewRows:Plan["reviewRows"]=[];
 const refuse=(row:Row,reason:string)=>{note(excluded,reason);
  if(!["ALREADY_INITIALIZED","SERIES_ALREADY_INITIALIZED"].includes(reason)&&refusals.length<100)
  refusals.push({service:row.serviceSlug,market:row.countryCode,plan:row.planSlug,reason});};
 const scopes=new Map<string,Row[]>();
 for(const row of rows){const id=scope(row),list=scopes.get(id)??[];list.push(row);scopes.set(id,list);}
 for(const scoped of scopes.values()){
  const scopedDigest=verifiedSnapshotDigest(scoped);
  const visited=new Set<string>();
  for(const row of scoped){
   if(visited.has(key(row)))continue;
   const serviceName=serviceNames.get(row.serviceSlug);
   const aliases=serviceName?scoped.filter(other=>other!==row&&semanticVerifiedAlias(row,other,serviceName)):[];
   const group=[row,...aliases];group.forEach(value=>visited.add(key(value)));
   if(group.length>2||aliases.some(other=>!equivalentVerifiedPlan(row,other,serviceName!))){
    for(const value of group)refuse(value,"AMBIGUOUS_ALIAS");continue;
   }
   let chosen=row;
   if(group.length===2){
    const order=[...group].sort((a,b)=>Date.parse(b.verifiedAt)-Date.parse(a.verifiedAt));
    if(!Number.isFinite(Date.parse(order[0].verifiedAt))||Date.parse(order[0].verifiedAt)===Date.parse(order[1].verifiedAt)){
     for(const value of group)refuse(value,"AMBIGUOUS_ALIAS_FRESHNESS");continue;
    }
    chosen=order[0];refuse(order[1],"OLDER_PROVEN_ALIAS");
   }
   const reason=valid(chosen,serviceNames,snapshotAt);
   if(reason){refuse(chosen,reason);continue;}
   const assigned=[...new Set(group.map(value=>value.historySeriesId).filter(Boolean))];
   if(assigned.length>1){refuse(chosen,"AMBIGUOUS_SERIES_ASSIGNMENT");continue;}
   if(assigned.length){refuse(chosen,existing.get(assigned[0]!)===true?"ALREADY_INITIALIZED":"ASSIGNED_WITHOUT_BASELINE");continue;}
   const seriesId=verifiedHistorySeriesId(chosen);
   if(existing.has(seriesId)){refuse(chosen,existing.get(seriesId)?"SERIES_ALREADY_INITIALIZED":"SERIES_HISTORY_WITHOUT_BASELINE");continue;}
   const flags:string[]=[];
   if(markets.get(chosen.countryCode)!==chosen.currency)flags.push("CROSS_CURRENCY_REVIEW");
   if(Date.parse(snapshotAt)-Date.parse(chosen.lastCheckedAt)>90*day)flags.push("LAST_CHECKED_OVER_90_DAYS");
   flags.forEach(flag=>note(reviewFlags,flag));
   if(flags.length&&reviewRows.length<100)reviewRows.push({service:chosen.serviceSlug,
    market:chosen.countryCode,plan:chosen.planSlug,flags});
   candidates.push({row:chosen,seriesId,rowDigest:verifiedSnapshotDigest([chosen]),scopeDigest:scopedDigest,reviewFlags:flags});
  }
 }
 candidates.sort((a,b)=>key(a.row).localeCompare(key(b.row)));
 return {candidates,excluded,reviewFlags,refusals,reviewRows};
}

async function serviceNames(client:PoolClient){
 const identities=await listResearchServiceIdentities({client:client as never});
 const projection=loadResearchServiceProjection({databaseIdentities:identities as never[]});
 return new Map<string,string>(projection.rows.filter(row=>row.status==="RESEARCHABLE"&&row.researchable)
  .map(row=>[row.serviceId,row.name]));
}

const currentSql=`SELECT *,verified_at::text AS verified_at_exact,last_checked_at::text AS last_checked_at_exact
  FROM verified_provider_prices`;

export async function preflightVerifiedBootstrap(database:Pool=pool):Promise<Plan>{
 const client=await database.connect();
 try{
  await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
  const snapshotAt=stamp((await client.query("SELECT transaction_timestamp() AS at")).rows[0].at);
  const result=await client.query(`${currentSql} ORDER BY service_slug,billing_provider_slug,country_code,currency,plan_slug LIMIT ${maxRows+1}`);
  if(result.rows.length>maxRows)throw Error("BOOTSTRAP_SNAPSHOT_ROW_BOUND");
  const names=await serviceNames(client),rows=result.rows.map(currentRow);
  const preliminary=classify(rows,names,new Map(),snapshotAt);
  const ids=[...new Set([...preliminary.candidates.map(row=>row.seriesId),
   ...rows.map(row=>row.historySeriesId).filter((value):value is string=>!!value)])];
  const initialized=ids.length?(await client.query(`SELECT history_series_id,
    bool_or(history_event_kind IN ('BASELINE','BOOTSTRAP_BASELINE')) AS has_baseline
    FROM verified_price_observations WHERE history_series_id=ANY($1::text[])
    GROUP BY history_series_id`,[ids])).rows:[];
  const classified=classify(rows,names,new Map(initialized.map(row=>[row.history_series_id,row.has_baseline])),snapshotAt);
  const plan={snapshotAt,rowsExamined:rows.length,...classified,digest:digest(classified.candidates.map(row=>[
   row.seriesId,row.rowDigest,row.scopeDigest,row.reviewFlags]))};
  await client.query("COMMIT");
  return plan;
 }catch(error){await client.query("ROLLBACK");throw error;}finally{client.release();}
}

export function publicBootstrapPlan(plan:Plan){
 return {mode:"READ_ONLY_AS_OF_PREFLIGHT",snapshotAt:plan.snapshotAt,digest:plan.digest,
  rowsExamined:plan.rowsExamined,eligibleSeries:plan.candidates.length,excluded:plan.excluded,
  reviewFlags:plan.reviewFlags,refusals:plan.refusals,reviewRows:plan.reviewRows,
  sample:plan.candidates.slice(0,10).map(({row,seriesId,reviewFlags})=>({
   service:row.serviceSlug,market:row.countryCode,plan:row.planSlug,seriesId,
   amountMinor:row.monthlyPriceMinor,currency:row.currency,providerVerifiedAt:row.verifiedAt,
   lastCheckedAt:row.lastCheckedAt,source:row.source,sourceOrigin:publicOrigin(row.sourceUrl),reviewFlags}))};
}

async function applyOne(database:Pool,candidate:Candidate,names:Map<string,string>){
 const client=await database.connect(),row=candidate.row;
 try{
  await client.query("BEGIN");
  await client.query("SELECT pg_advisory_xact_lock(hashtext($1),hashtext($2))",[
   row.serviceSlug,row.countryCode]);
  await client.query("SELECT pg_advisory_xact_lock(hashtext($1),hashtext($2))",[
   row.serviceSlug,`${row.billingProviderSlug}:${row.countryCode}:${row.currency}`]);
  const result=await client.query(`${currentSql} WHERE service_slug=$1 AND billing_provider_slug=$2
    AND country_code=$3 AND currency=$4 FOR UPDATE`,[row.serviceSlug,row.billingProviderSlug,row.countryCode,row.currency]);
  const scoped=result.rows.map(currentRow);
  const current=scoped.find(value=>key(value)===key(row));
  if(!current||verifiedSnapshotDigest(scoped)!==candidate.scopeDigest||
    verifiedSnapshotDigest([current])!==candidate.rowDigest){await client.query("COMMIT");return "CHANGED";}
  const history=await client.query(`SELECT 1 FROM verified_price_observations WHERE history_series_id=$1
    AND history_event_kind IN ('BASELINE','BOOTSTRAP_BASELINE','PRICE_CHANGE') LIMIT 1`,[candidate.seriesId]);
  if(history.rows.length||current.historySeriesId){await client.query("COMMIT");return "INITIALIZED";}
  const check=classify(scoped,names,new Map(),new Date().toISOString());
  if(!check.candidates.some(value=>key(value.row)===key(row)&&value.seriesId===candidate.seriesId)){
   await client.query("COMMIT");return "CHANGED";
  }
  const assigned=await client.query(`UPDATE verified_provider_prices SET history_series_id=$1
    WHERE service_slug=$2 AND plan_slug=$3 AND billing_provider_slug=$4 AND country_code=$5
      AND currency=$6 AND history_series_id IS NULL RETURNING history_series_id`,[
   candidate.seriesId,row.serviceSlug,row.planSlug,row.billingProviderSlug,row.countryCode,row.currency]);
  if(assigned.rowCount!==1)throw Error("BOOTSTRAP_ASSIGNMENT_CONFLICT");
  await client.query(`INSERT INTO verified_price_observations
    (history_series_id,history_event_kind,plan_identity,billing_interval,
     service_slug,plan_slug,plan_name,billing_provider_slug,country_code,currency,
     monthly_price_minor,source,source_url,verification,source_count,verified_by_agreement,provider_verified_at)
    VALUES($1,'BOOTSTRAP_BASELINE',$2,'MONTHLY_RECURRING',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15::timestamptz)`,[
   candidate.seriesId,row.planIdentity??catalogPlanIdentity(row),row.serviceSlug,row.planSlug,row.planName,
   row.billingProviderSlug,row.countryCode,row.currency,row.monthlyPriceMinor,row.source,row.sourceUrl,
   row.verification,row.sourceCount,row.verifiedByAgreement,row.verifiedAt]);
  await client.query("COMMIT");return "INSERTED";
 }catch(error){await client.query("ROLLBACK");throw error;}finally{client.release();}
}

type Execution={database?:Pool;execute?:boolean;expectedDigest?:string;confirm?:string};
export async function executeVerifiedBootstrapPlan(plan:Plan,{database=pool,execute,expectedDigest,confirm}:Execution={}){
 if(execute&&(confirm!=="BOOTSTRAP_AS_OF"||!expectedDigest||!/^([0-9a-f]{64})$/.test(expectedDigest)))
  throw Error("BOOTSTRAP_EXPLICIT_CONFIRMATION_REQUIRED");
 if(!execute)throw Error("BOOTSTRAP_EXPLICIT_CONFIRMATION_REQUIRED");
 if(plan.digest!==expectedDigest)throw Error("BOOTSTRAP_PREFLIGHT_DIGEST_CHANGED");
 const client=await database.connect();let names:Map<string,string>;
 try{names=await serviceNames(client);}finally{client.release();}
 const result={mode:"EXPLICIT_AS_OF_EXECUTION",preflightDigest:plan.digest,inserted:0,changed:0,initialized:0};
 for(let i=0;i<plan.candidates.length;i+=batchSize){
  for(const candidate of plan.candidates.slice(i,i+batchSize)){
   const status=await applyOne(database,candidate,names);
   if(status==="INSERTED")result.inserted++;
   else if(status==="CHANGED")result.changed++;
   else result.initialized++;
  }
 }
 return result;
}

export async function runVerifiedBootstrap(options:Execution={}){
 if(options.execute&&(options.confirm!=="BOOTSTRAP_AS_OF"||!options.expectedDigest||
   !/^[0-9a-f]{64}$/.test(options.expectedDigest)))throw Error("BOOTSTRAP_EXPLICIT_CONFIRMATION_REQUIRED");
 const plan=await preflightVerifiedBootstrap(options.database??pool);
 if(!options.execute)return publicBootstrapPlan(plan);
 return executeVerifiedBootstrapPlan(plan,options);
}
