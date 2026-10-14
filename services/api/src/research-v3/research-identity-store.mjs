import {createHash} from 'node:crypto';
import {serviceCatalog,normalizeCatalogText} from '../../../../packages/contracts/src/catalog.ts';
import {pool} from '../db.js';
import {canonicalServiceId,rehydrateSubscriptionService} from './subscription-service-admission.mjs';

const sha=value=>createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex');
const exact=value=>normalizeCatalogText(String(value??''));
const validId=value=>typeof value==='string'&&/^[a-z0-9-]{1,160}$/.test(value);
const productMatches=value=>{
 const key=exact(value);if(!key)return [];
 return serviceCatalog.filter(row=>[row.slug,row.name,...row.aliases].some(name=>exact(name)===key));
};
const publicRecord=row=>({kind:'RESEARCH_IDENTITY',serviceId:row.research_service_id,serviceName:row.canonical_name,canonicalSlug:row.canonical_slug,identityType:row.identity_type,status:row.status,providerBinding:row.provider_binding,provenance:{providerObservation:row.provider_observation,sourceUrl:row.source_url,bodySha256:row.source_body_sha256,identity:row.identity_locator,subscription:row.subscription_locator,relationship:row.relationship,extractionMechanism:row.extraction_mechanism},admissionVersion:Number(row.admission_version),aliases:row.aliases??[],createdAt:new Date(row.created_at).toISOString(),updatedAt:new Date(row.updated_at).toISOString()});

export function exactProductIdentity(value){
 const rows=productMatches(value);
 if(rows.length!==1)return {status:rows.length?'AMBIGUOUS':'UNRESOLVED',matches:rows.map(row=>row.slug)};
 return {status:'RESEARCHABLE',identity:{kind:'PRODUCT_IDENTITY',serviceId:rows[0].slug,serviceName:rows[0].name,status:'RESEARCHABLE'}};
}

export async function resolvePriceResearchIdentity(serviceId,{client=pool}={}){
 if(!validId(serviceId))return {status:'UNRESOLVED',reason:'INVALID_SERVICE_ID'};
 const product=serviceCatalog.find(row=>row.slug===serviceId);
 if(product)return {status:'RESEARCHABLE',identity:{kind:'PRODUCT_IDENTITY',serviceId:product.slug,serviceName:product.name,status:'RESEARCHABLE'}};
 const result=await client.query('SELECT * FROM research_service_identities WHERE research_service_id=$1',[serviceId]);
 if(result.rows.length!==1||result.rows[0].status!=='RESEARCHABLE')return {status:'UNRESOLVED',reason:'UNKNOWN_OR_UNRESEARCHABLE_IDENTITY'};
 return {status:'RESEARCHABLE',identity:publicRecord(result.rows[0])};
}

export async function admitDurableResearchIdentity({service,sourceBody,observation,researchTarget,providerAuthorityBinding},{client=pool}={}){
 if(!service?.serviceId||!service?.serviceName||!service?.providerBinding?.host||!service?.providerBinding?.digest||typeof sourceBody!=='string'||sha(sourceBody)!==service.provenance?.bodySha256)return {status:'UNRESOLVED',reason:'SOURCE_BOUND_ADMISSION_REQUIRED'};
 const checked=rehydrateSubscriptionService({admission:{status:'ADMITTED',service},observation:{...observation,body:sourceBody},researchTarget,providerAuthorityBinding});if(checked.status!=='ADMITTED')return {status:'UNRESOLVED',reason:checked.reason};
 const product=productMatches(service.serviceName);
 if(product.length>1)return {status:'AMBIGUOUS',reason:'MULTIPLE_PRODUCT_IDENTITIES',matches:product.map(row=>row.slug)};
 if(product.length===1)return {status:'RESEARCHABLE',created:false,identity:{kind:'PRODUCT_IDENTITY',serviceId:product[0].slug,serviceName:product[0].name,status:'RESEARCHABLE'}};
 const slug=canonicalServiceId(service.serviceName),normalizedName=exact(service.serviceName),aliases=[];
 if(!slug||!normalizedName)return {status:'UNRESOLVED',reason:'INVALID_CANONICAL_IDENTITY'};
 const ownClient=typeof client.connect==='function'?await client.connect():client;
 try{
  await ownClient.query('BEGIN');
  await ownClient.query('SELECT pg_advisory_xact_lock(hashtext($1))',[slug]);
  const found=await ownClient.query(`SELECT * FROM research_service_identities
    WHERE canonical_slug=$1 OR normalized_name=$2 OR aliases ? $2 FOR UPDATE`,[slug,normalizedName]);
  if(found.rows.length>1){await ownClient.query('ROLLBACK');return {status:'AMBIGUOUS',reason:'MULTIPLE_RESEARCH_IDENTITIES',matches:found.rows.map(row=>row.research_service_id)};}
  if(found.rows.length===1){const row=found.rows[0];if(row.provider_binding_digest!==service.providerBinding.digest||row.provider_host!==service.providerBinding.host){await ownClient.query('ROLLBACK');return {status:'COLLISION',reason:'INCOMPATIBLE_PROVIDER_BINDING',matches:[row.research_service_id]};}await ownClient.query('COMMIT');return {status:'RESEARCHABLE',created:false,identity:publicRecord(row)};}
  const researchId=`research-${slug}-${service.providerBinding.digest.slice(0,12)}`;
  const p=service.provenance,result=await ownClient.query(`INSERT INTO research_service_identities(
    research_service_id,canonical_slug,canonical_name,normalized_name,identity_type,status,
    provider_host,provider_binding_digest,provider_binding,provider_observation,source_url,source_body_sha256,source_body,
    identity_locator,subscription_locator,relationship,extraction_mechanism,admission_version,aliases)
    VALUES($1,$2,$3,$4,$5,'RESEARCHABLE',$6,$7,$8::jsonb,$9,$10,$11,$12,$13::jsonb,$14::jsonb,$15,$16,1,$17::jsonb)
    RETURNING *`,[researchId,slug,service.serviceName,normalizedName,service.identityType,service.providerBinding.host,service.providerBinding.digest,JSON.stringify(service.providerBinding),p.providerObservation,p.sourceUrl,p.bodySha256,sourceBody,JSON.stringify(p.identity),JSON.stringify(p.subscription),p.relationship,p.extractionMechanism,JSON.stringify(aliases)]);
  await ownClient.query('COMMIT');return {status:'RESEARCHABLE',created:true,identity:publicRecord(result.rows[0])};
 }catch(error){try{await ownClient.query('ROLLBACK');}catch{}if(error?.code==='23505')return {status:'COLLISION',reason:'IDENTITY_UNIQUE_COLLISION'};throw error;}finally{if(ownClient!==client)ownClient.release();}
}

export async function rehydrateResearchIdentity(serviceId,{client=pool,researchTarget,providerAuthorityBinding}={}){
 const result=await client.query('SELECT * FROM research_service_identities WHERE research_service_id=$1',[serviceId]);
 if(result.rows.length!==1)return {status:'UNRESOLVED',reason:'UNKNOWN_RESEARCH_IDENTITY'};
 const row=result.rows[0],record=publicRecord(row),observation={id:row.provider_observation,kind:'PROVIDER',url:row.source_url,body:row.source_body,sha256:row.source_body_sha256,outcome:'OK',truncated:false,completeness:'COMPLETE'};
 const admission={status:'ADMITTED',service:{serviceId:row.canonical_slug,serviceName:row.canonical_name,identityType:row.identity_type,providerBinding:row.provider_binding,provenance:record.provenance}};
 const checked=rehydrateSubscriptionService({admission,observation,researchTarget,providerAuthorityBinding});
 return checked.status==='ADMITTED'?{status:'RESEARCHABLE',identity:record,admission:checked,observation}:{status:'UNRESOLVED',reason:checked.reason};
}
