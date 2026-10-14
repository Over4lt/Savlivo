import {serviceCatalog} from '../../../../packages/contracts/src/catalog.ts';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const validStatuses=new Set(['RESEARCHABLE','AMBIGUOUS','DEACTIVATED']);
const validId=value=>typeof value==='string'&&/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
const aliasKey=value=>String(value??'').normalize('NFKC').toLocaleLowerCase('en-US')
 .replace(/\+/g,' plus ').replace(/[-_/]/g,' ').replace(/\s+/g,' ').trim();
const unique=values=>[...new Set(values.filter(Boolean))];
const source=(kind,row,extra={})=>row?{kind,serviceId:row.service??row.slug??row.research_service_id,...extra}:null;
const defaultRepository=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../../..');
const defaultLifecycleInput='docs/catalog/global-47/research-v2/v15-mature-handoff-20260921/lifecycle-input.json';

const safe=(root,value)=>{const resolved=path.resolve(root,value);if(resolved!==root&&!resolved.startsWith(root+path.sep))throw Error('RESEARCH_SERVICE_PROJECTION_PATH');return resolved;};
const read=file=>JSON.parse(fs.readFileSync(file,'utf8'));
const sha=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');

function hints(id,rows,scopes){
 const values=[];
 const add=(markets,basis)=>{for(const market of markets??[])if(typeof market==='string'&&/^[A-Z]{2}$/.test(market))values.push({market,basis});};
 for(const [row,basis] of rows){add(row?.launchMarkets,basis+':launchMarkets');add(row?.markets,basis+':markets');}
 add(scopes?.[id], 'researchScopes');
 return [...new Map(values.map(value=>[value.market+'|'+value.basis,value])).values()];
}

function collisionIndex(rows,field){
 const index=new Map();
 for(const row of rows)for(const value of field(row)){
  const key=aliasKey(value);if(!key)continue;
  const ids=index.get(key)??new Set();ids.add(row.serviceId);index.set(key,ids);
 }
 return index;
}

function matchesForDatabase(row,staticById,staticBySlug,aliasIndex){
 const exactId=staticById.get(row.research_service_id);
 if(exactId)return {matches:[exactId],basis:'EXACT_STABLE_ID'};
 const exactSlug=staticBySlug.get(row.canonical_slug);
 if(exactSlug)return {matches:[exactSlug],basis:'EXACT_CANONICAL_SLUG'};
 const ids=new Set();
 for(const value of [row.canonical_slug,...(Array.isArray(row.aliases)?row.aliases:[])]){
  const key=aliasKey(value);for(const id of aliasIndex.get(key)??[])ids.add(id);
 }
 return {matches:[...ids].map(id=>staticById.get(id)).filter(Boolean),basis:'EXACT_REVIEWED_ALIAS'};
}

export function projectResearchServices({
 baseline=[], frozen=[], manifestServiceIds=frozen.map(row=>row.slug),
 productCatalogRows=serviceCatalog, databaseIdentities=[], researchScopes={}
}={}){
 if(!Array.isArray(baseline)||!Array.isArray(frozen)||!Array.isArray(manifestServiceIds)||!Array.isArray(productCatalogRows)||!Array.isArray(databaseIdentities))throw Error('INVALID_RESEARCH_SERVICE_PROJECTION_INPUT');
 const manifest=new Set(manifestServiceIds),baselineIds=new Set(),frozenIds=new Set();
 if(manifest.size!==manifestServiceIds.length)throw Error('RESEARCH_SERVICE_MANIFEST_COLLISION');
 const productById=new Map();
 for(const product of productCatalogRows){
  if(!validId(product.slug)||productById.has(product.slug))throw Error('RESEARCH_SERVICE_PRODUCT_COLLISION');
  productById.set(product.slug,product);
 }
 const rows=[];
 for(const baselineRow of baseline){
  const id=baselineRow.service??baselineRow.slug;if(!validId(id)||baselineIds.has(id))throw Error('RESEARCH_SERVICE_BASELINE_COLLISION');
  baselineIds.add(id);const product=productById.get(id)??null;
  rows.push({serviceId:id,canonicalSlug:id,name:product?.name??baselineRow.name,aliases:unique([...(baselineRow.aliases??[]),...(product?.aliases??[])]),categories:unique([...(baselineRow.categories??[]),...(product?.categories??[])]),researchable:true,status:'RESEARCHABLE',sources:{baseline:source('BASELINE',baselineRow),frozen:null,productCatalog:source('PRODUCT_CATALOG',product),database:null},frozenLifecycleMember:false,productCatalogMember:!!product,researchScopeHints:hints(id,[[baselineRow,'baseline'],[product,'productCatalog']],researchScopes),reconciliation:{outcome:'CANONICAL_STATIC',precedence:product?'PRODUCT_ID_WITH_BASELINE_STABLE_ID':'BASELINE_STABLE_ID'}});
 }
 for(const frozenRow of frozen){
  const id=frozenRow.slug??frozenRow.service;
  if(!validId(id)||frozenIds.has(id)||baselineIds.has(id))throw Error('RESEARCH_SERVICE_FROZEN_COLLISION');
  if(!manifest.has(id))throw Error('RESEARCH_SERVICE_FROZEN_MANIFEST_MISMATCH');
  frozenIds.add(id);const product=productById.get(id)??null;
  rows.push({serviceId:id,canonicalSlug:id,name:product?.name??frozenRow.name,aliases:unique([...(frozenRow.aliases??[]),...(product?.aliases??[])]),categories:unique([...(frozenRow.categories??[]),...(product?.categories??[])]),researchable:true,status:'RESEARCHABLE',sources:{baseline:null,frozen:source('FROZEN',frozenRow,{disposition:frozenRow.disposition??null}),productCatalog:source('PRODUCT_CATALOG',product),database:null},frozenLifecycleMember:true,productCatalogMember:!!product,researchScopeHints:hints(id,[[frozenRow,'frozen'],[product,'productCatalog']],researchScopes),reconciliation:{outcome:'CANONICAL_STATIC',precedence:product?'PRODUCT_ID_WITH_FROZEN_STABLE_ID':'FROZEN_STABLE_ID'}});
 }
 if(frozenIds.size!==manifest.size)throw Error('RESEARCH_SERVICE_FROZEN_MANIFEST_MISMATCH');
 for(const product of productCatalogRows)if(!baselineIds.has(product.slug)&&!frozenIds.has(product.slug))throw Error('RESEARCH_SERVICE_PRODUCT_OUTSIDE_STATIC_UNIVERSE');

 const staticRows=[...rows],staticById=new Map(staticRows.map(row=>[row.serviceId,row])),staticBySlug=new Map(staticRows.map(row=>[row.canonicalSlug,row])),aliasIndex=collisionIndex(staticRows,row=>row.aliases);
 const aliasCollisions=[...aliasIndex].filter(([,ids])=>ids.size>1).map(([key,ids])=>({kind:'EXPLICIT_ALIAS_COLLISION',key,serviceIds:[...ids].sort()}));
 const databaseIds=new Set();
 for(const database of databaseIdentities){
  const id=database.research_service_id,status=database.status;
  if(typeof id!=='string'||databaseIds.has(id))throw Error('RESEARCH_SERVICE_DATABASE_ID_COLLISION');databaseIds.add(id);
  const match=matchesForDatabase(database,staticById,staticBySlug,aliasIndex),databaseSource=source('DATABASE',database,{status,canonicalSlug:database.canonical_slug});
  if(match.matches.length===1){
   const target=match.matches[0];target.sources.database=databaseSource;target.reconciliation={...target.reconciliation,database:{outcome:'RECONCILED_TO_STATIC',basis:match.basis,researchServiceId:id,status}};
   continue;
  }
  const knownStatus=validStatuses.has(status),collision=match.matches.length>1;
  const effectiveStatus=!knownStatus||collision?'AMBIGUOUS':status,researchable=effectiveStatus==='RESEARCHABLE';
  rows.push({serviceId:id,canonicalSlug:database.canonical_slug,name:database.canonical_name,aliases:unique(database.aliases??[]),categories:[],researchable,status:effectiveStatus,sources:{baseline:null,frozen:null,productCatalog:null,database:databaseSource},frozenLifecycleMember:false,productCatalogMember:false,researchScopeHints:[],reconciliation:collision?{outcome:'AMBIGUOUS',basis:match.basis,matches:match.matches.map(value=>value.serviceId).sort()} : !knownStatus?{outcome:'UNKNOWN_DATABASE_STATUS',databaseStatus:status}:{outcome:'CANONICAL_DATABASE_IDENTITY',precedence:'DATABASE_RESEARCH_ID'}});
 }
 return {version:1,rows,collisions:aliasCollisions,counts:{baseline:baselineIds.size,frozen:frozenIds.size,productCatalog:rows.filter(row=>row.productCatalogMember).length,databaseNew:rows.filter(row=>row.sources.database&&row.sources.baseline===null&&row.sources.frozen===null).length,canonical:rows.filter(row=>row.reconciliation.outcome!=='AMBIGUOUS'&&row.reconciliation.outcome!=='UNKNOWN_DATABASE_STATUS').length,researchable:rows.filter(row=>row.researchable).length}};
}

export function loadResearchServiceProjection({repo=defaultRepository,lifecycleInput=process.env.V2_OPERATIONS_LIFECYCLE_INPUT||defaultLifecycleInput,databaseIdentities=[]}={}){
 const root=path.resolve(repo),inputFile=safe(root,lifecycleInput),input=read(inputFile),universeFile=safe(root,input.universe),manifestFile=safe(root,input.cohortManifest);
 for(const [file,expected] of Object.entries(input.frozenHashes??{})){const resolved=safe(root,file);if(sha(resolved)!==expected)throw Error('RESEARCH_SERVICE_PROJECTION_FROZEN_INPUT');}
 const universe=read(universeFile),manifest=read(manifestFile),researchScopes=input.researchScopes?read(safe(root,input.researchScopes)).researchMarkets??{}:{};
 return projectResearchServices({baseline:universe.existing,frozen:[...(universe.new_include??[]),...(universe.research??[])],manifestServiceIds:manifest.serviceIds,databaseIdentities,researchScopes});
}

export function resolveProjectedResearchService(projection,value,{staticOnly=false}={}){
 if(!projection||!Array.isArray(projection.rows)||typeof value!=='string'||!value||value.length>160)return {status:'UNRESOLVED',reason:'INVALID_RESEARCH_SERVICE_IDENTITY'};
 const rows=projection.rows.filter(row=>!staticOnly||row.sources.baseline||row.sources.frozen),finish=(matches,basis)=>{
  const uniqueMatches=[...new Map(matches.map(row=>[row.serviceId,row])).values()];
  if(uniqueMatches.length!==1)return {status:uniqueMatches.length?'AMBIGUOUS':'UNRESOLVED',reason:uniqueMatches.length?'MULTIPLE_CANONICAL_IDENTITIES':'UNKNOWN_CANONICAL_IDENTITY',basis,matches:uniqueMatches.map(row=>row.serviceId).sort()};
  const row=uniqueMatches[0];if(row.status!=='RESEARCHABLE'||row.researchable!==true)return {status:'UNRESOLVED',reason:'CANONICAL_IDENTITY_NOT_RESEARCHABLE',basis,matches:[row.serviceId]};
  return {status:'RESEARCHABLE',basis,identity:row};
 };
 const exactId=rows.filter(row=>row.serviceId===value||row.sources.database?.serviceId===value);if(exactId.length)return finish(exactId,'EXACT_STABLE_ID');
 const exactSlug=rows.filter(row=>row.canonicalSlug===value);if(exactSlug.length)return finish(exactSlug,'EXACT_CANONICAL_SLUG');
 const key=aliasKey(value),exactAlias=rows.filter(row=>row.aliases.some(alias=>aliasKey(alias)===key));
 return finish(exactAlias,'EXACT_REVIEWED_ALIAS');
}
