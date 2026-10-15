import {createHash} from 'node:crypto';
import {serviceCatalog,normalizeCatalogText} from '../../../../packages/contracts/src/catalog.ts';
import {pool} from '../db.js';
import {canonicalServiceId,rehydrateSubscriptionService} from './subscription-service-admission.mjs';
import {loadResearchServiceProjection,resolveProjectedResearchService} from './research-service-projection.mjs';
import {reviewedProviderNamespacesFor} from './reviewed-provider-namespaces.mjs';

const sha=value=>createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex');
const exact=value=>normalizeCatalogText(String(value??''));
const validLookup=value=>typeof value==='string'&&value.length>0&&value.length<=160&&!/[\u0000-\u001f\u007f]/u.test(value);
const productMatches=value=>{
 const key=exact(value);if(!key)return [];
 return serviceCatalog.filter(row=>row.slug===value||row.aliases.some(alias=>exact(alias)===key));
};
const publicRecord=row=>({kind:'RESEARCH_IDENTITY',serviceId:row.research_service_id,serviceName:row.canonical_name,canonicalSlug:row.canonical_slug,identityType:row.identity_type,status:row.status,providerBinding:row.provider_binding,provenance:{providerObservation:row.provider_observation,sourceUrl:row.source_url,bodySha256:row.source_body_sha256,identity:row.identity_locator,subscription:row.subscription_locator,relationship:row.relationship,extractionMechanism:row.extraction_mechanism},admissionVersion:Number(row.admission_version),aliases:row.aliases??[],createdAt:new Date(row.created_at).toISOString(),updatedAt:new Date(row.updated_at).toISOString()});

const safeListRecord=row=>({research_service_id:row.research_service_id,canonical_slug:row.canonical_slug,canonical_name:row.canonical_name,normalized_name:row.normalized_name,identity_type:row.identity_type,status:row.status,aliases:row.aliases??[],provider_host:row.provider_host,provider_binding_digest:row.provider_binding_digest,provider_observation:row.provider_observation,source_url:row.source_url,source_body_sha256:row.source_body_sha256,relationship:row.relationship,extraction_mechanism:row.extraction_mechanism,admission_version:Number(row.admission_version),created_at:new Date(row.created_at).toISOString(),updated_at:new Date(row.updated_at).toISOString()});

export async function listResearchServiceIdentities({client=pool}={}){
 const result=await client.query(`SELECT
   research_service_id, canonical_slug, canonical_name, normalized_name, identity_type, status, aliases,
   provider_host, provider_binding_digest, provider_observation, source_url, source_body_sha256,
   relationship, extraction_mechanism, admission_version, created_at, updated_at
  FROM research_service_identities
  ORDER BY canonical_slug, research_service_id`);
 return result.rows.map(safeListRecord);
}

const canonicalIdentity=row=>({kind:row.sources.baseline||row.sources.frozen?'CANONICAL_STATIC_IDENTITY':'RESEARCH_IDENTITY',serviceId:row.serviceId,serviceName:row.name,canonicalSlug:row.canonicalSlug,status:'RESEARCHABLE',reviewedProviderNamespaces:reviewedProviderNamespacesFor(row.serviceId,row.name)});
const projectionOptions=options=>({repo:options.repo,lifecycleInput:options.lifecycleInput,databaseIdentities:options.databaseIdentities??[]});
const staticProjection=options=>options.projection??loadResearchServiceProjection(projectionOptions(options));

export function exactProductIdentity(value){
 const rows=productMatches(value);
 if(rows.length!==1)return {status:rows.length?'AMBIGUOUS':'UNRESOLVED',matches:rows.map(row=>row.slug)};
 return {status:'RESEARCHABLE',identity:{kind:'PRODUCT_IDENTITY',serviceId:rows[0].slug,serviceName:rows[0].name,status:'RESEARCHABLE'}};
}

export async function resolvePriceResearchIdentity(serviceId,options={}){
 const {client=pool}=options;
 if(!validLookup(serviceId))return {status:'UNRESOLVED',reason:'INVALID_SERVICE_ID'};
 let projection=staticProjection(options),resolved=resolveProjectedResearchService(projection,serviceId);
 if(resolved.status==='RESEARCHABLE'&&(resolved.identity.sources.baseline||resolved.identity.sources.frozen))return {status:'RESEARCHABLE',identity:canonicalIdentity(resolved.identity)};
 if(resolved.status==='AMBIGUOUS')return resolved;
 if(!options.projection){projection=loadResearchServiceProjection({...projectionOptions(options),databaseIdentities:await listResearchServiceIdentities({client})});resolved=resolveProjectedResearchService(projection,serviceId);}
 if(resolved.status!=='RESEARCHABLE')return resolved;
 if(resolved.identity.sources.baseline||resolved.identity.sources.frozen)return {status:'RESEARCHABLE',identity:canonicalIdentity(resolved.identity)};
 const result=await client.query('SELECT * FROM research_service_identities WHERE research_service_id=$1',[resolved.identity.serviceId]);
 if(result.rows.length!==1||result.rows[0].status!=='RESEARCHABLE')return {status:'UNRESOLVED',reason:'UNKNOWN_OR_UNRESEARCHABLE_IDENTITY'};
 return {status:'RESEARCHABLE',identity:publicRecord(result.rows[0])};
}

export async function admitDurableResearchIdentity({service,sourceBody,observation,researchTarget,providerAuthorityBinding},options={}){
 const {client=pool}=options;
 if(!service?.serviceId||!service?.serviceName||!service?.providerBinding?.host||!service?.providerBinding?.digest||typeof sourceBody!=='string'||sha(sourceBody)!==service.provenance?.bodySha256)return {status:'UNRESOLVED',reason:'SOURCE_BOUND_ADMISSION_REQUIRED'};
 const checked=rehydrateSubscriptionService({admission:{status:'ADMITTED',service},observation:{...observation,body:sourceBody},researchTarget,providerAuthorityBinding});if(checked.status!=='ADMITTED')return {status:'UNRESOLVED',reason:checked.reason};
 const projection=staticProjection(options);let reconciled=resolveProjectedResearchService(projection,service.serviceId,{staticOnly:true});
 if(reconciled.status==='UNRESOLVED')reconciled=resolveProjectedResearchService(projection,service.serviceName,{staticOnly:true});
 if(reconciled.status==='AMBIGUOUS')return {status:'AMBIGUOUS',reason:'MULTIPLE_CANONICAL_IDENTITIES',matches:reconciled.matches};
 if(reconciled.status==='RESEARCHABLE')return {status:'RESEARCHABLE',created:false,identity:canonicalIdentity(reconciled.identity)};
 const slug=canonicalServiceId(service.serviceName),normalizedName=exact(service.serviceName),aliases=[];
 if(!slug||!normalizedName)return {status:'UNRESOLVED',reason:'INVALID_CANONICAL_IDENTITY'};
 const ownClient=typeof client.connect==='function'?await client.connect():client;
 try{
  await ownClient.query('BEGIN');
  await ownClient.query('SELECT pg_advisory_xact_lock(hashtext($1))',[slug]);
  const found=await ownClient.query(`SELECT * FROM research_service_identities
    WHERE canonical_slug=$1 OR aliases ? $2 FOR UPDATE`,[slug,normalizedName]);
  if(found.rows.length>1){await ownClient.query('ROLLBACK');return {status:'AMBIGUOUS',reason:'MULTIPLE_RESEARCH_IDENTITIES',matches:found.rows.map(row=>row.research_service_id)};}
  if(found.rows.length===1){const row=found.rows[0];if(row.status!=='RESEARCHABLE'){await ownClient.query('ROLLBACK');return {status:'UNRESOLVED',reason:'EXISTING_RESEARCH_IDENTITY_NOT_RESEARCHABLE',matches:[row.research_service_id]};}if(row.provider_binding_digest!==service.providerBinding.digest||row.provider_host!==service.providerBinding.host){await ownClient.query('ROLLBACK');return {status:'COLLISION',reason:'INCOMPATIBLE_PROVIDER_BINDING',matches:[row.research_service_id]};}await ownClient.query('COMMIT');return {status:'RESEARCHABLE',created:false,identity:publicRecord(row)};}
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
 if(result.rows.length!==1||result.rows[0].status!=='RESEARCHABLE')return {status:'UNRESOLVED',reason:'UNKNOWN_OR_UNRESEARCHABLE_RESEARCH_IDENTITY'};
 const row=result.rows[0],record=publicRecord(row),observation={id:row.provider_observation,kind:'PROVIDER',url:row.source_url,body:row.source_body,sha256:row.source_body_sha256,outcome:'OK',truncated:false,completeness:'COMPLETE'};
 const admission={status:'ADMITTED',service:{serviceId:row.canonical_slug,serviceName:row.canonical_name,identityType:row.identity_type,providerBinding:row.provider_binding,provenance:record.provenance}};
 const checked=rehydrateSubscriptionService({admission,observation,researchTarget,providerAuthorityBinding});
 return checked.status==='ADMITTED'?{status:'RESEARCHABLE',identity:record,admission:checked,observation}:{status:'UNRESOLVED',reason:checked.reason};
}
