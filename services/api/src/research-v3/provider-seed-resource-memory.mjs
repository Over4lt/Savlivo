// Provider-scoped routing memory for research before a consumer Service exists.
// Only an authority proof and a URL to reacquire are retained. Service admission,
// acquired provider bytes, market facts, catalog state, and Truth are never cached.
import fs from 'node:fs';
import path from 'node:path';
import {canonical,digest,normalizeUrl} from './model.mjs';
import {reviewProviderSeedAuthority} from './provider-authority-review.mjs';
import {createResearchTarget,providerSeedCampaignState,researchTargetKinds} from './research-target.mjs';

export const providerSeedResourceMemoryContract=Object.freeze({contractVersion:1,namespace:'SAVLIVO_PROVIDER_SEED_RESOURCES',meaning:'ROUTING_ONLY_REQUIRES_FRESH_ACQUISITION'});
const routes=new Set(['DIRECT','DECODO']);
const roles=new Set(['PROVIDER_ROOT','SUBSCRIPTION_CATALOG_ROOT','APP_SERVICE_CATALOG_ROOT']);
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const stable=value=>JSON.stringify(value,(_,row)=>object(row)?Object.fromEntries(Object.entries(row).sort(([a],[b])=>a.localeCompare(b))):row);
const storeFile=root=>path.join(root,'provider-seed-resources.json');
const blank=()=>({contractVersion:1,namespace:providerSeedResourceMemoryContract.namespace,meaning:providerSeedResourceMemoryContract.meaning,resources:[]});
const validTime=value=>typeof value==='string'&&Number.isFinite(Date.parse(value));
function exact(value,keys,code){if(!object(value)||canonical(Object.keys(value).sort())!==canonical([...keys].sort()))throw Error(code);}
function publicUrl(value){const normalized=normalizeUrl(value);if(!normalized||normalized!==value)throw Error('PROVIDER_SEED_RESOURCE_URL_INVALID');return normalized;}
function rootPath(root){if(typeof root!=='string'||!root)throw Error('PROVIDER_SEED_RESOURCE_INPUT_INVALID');return path.resolve(root);}

function atomic(file,value){
 fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});const pending=file+'.pending',fd=fs.openSync(pending,'w',0o600);
 try{fs.writeSync(fd,stable(value)+'\n');fs.fsyncSync(fd);}finally{fs.closeSync(fd);}fs.renameSync(pending,file);
}

function publicAuthorityObservation(observation){
 const copy=structuredClone(observation);delete copy.body;return copy;
}

function assertAuthorityObservation(observation){
 exact(observation,['id','kind','authority','url','context','outcome','truncated','completeness','format','contentType','httpStatus','access','sha256'],'PROVIDER_SEED_AUTHORITY_PROOF_INVALID');
 if(observation.kind!=='CANDIDATE'||observation.authority!=='UNREVIEWED_CANDIDATE'||observation.outcome!=='OK'||observation.truncated!==false||observation.completeness!=='COMPLETE'||observation.format!=='WEB'||!Array.isArray(observation.access)||!observation.access.length||!/^[a-f0-9]{64}$/.test(observation.sha256)||publicUrl(observation.url)!==observation.url)throw Error('PROVIDER_SEED_AUTHORITY_PROOF_INVALID');
}

function assertRecord(row){
 exact(row,['contractVersion','id','scope','researchTarget','host','authority','resource','marketContext','meaning'],'PROVIDER_SEED_RESOURCE_RECORD_INVALID');
 exact(row.authority,['binding','proof'],'PROVIDER_SEED_RESOURCE_RECORD_INVALID');exact(row.authority.proof,['observation','bodyReference'],'PROVIDER_SEED_RESOURCE_RECORD_INVALID');exact(row.authority.proof.bodyReference,['path','sha256'],'PROVIDER_SEED_RESOURCE_RECORD_INVALID');
 exact(row.resource,['url','role','acquisitionRoute','lastUsefulAt','reacquisition'],'PROVIDER_SEED_RESOURCE_RECORD_INVALID');exact(row.marketContext,['targetMarket','availabilityEstablished'],'PROVIDER_SEED_RESOURCE_RECORD_INVALID');
 assertAuthorityObservation(row.authority.proof.observation);
 const target=createResearchTarget(row.researchTarget),url=publicUrl(row.resource.url),expected='provider-seed-resource:'+digest([target.seedName,target.targetMarket,row.host,url,row.resource.role]);
 if(row.contractVersion!==1||row.id!==expected||row.scope!=='PROVIDER'||target.targetKind!==researchTargetKinds.PROVIDER_OR_BRAND_SEED||row.host!==row.authority.binding?.host||new URL(url).hostname!==row.host||!roles.has(row.resource.role)||!routes.has(row.resource.acquisitionRoute)||!validTime(row.resource.lastUsefulAt)||row.resource.reacquisition!=='REQUIRED'||row.marketContext.targetMarket!==target.targetMarket||row.marketContext.availabilityEstablished!==false||row.meaning!==providerSeedResourceMemoryContract.meaning)throw Error('PROVIDER_SEED_RESOURCE_RECORD_INVALID');
 if(!/^provider-seed-proofs\/[a-f0-9]{64}\.txt$/.test(row.authority.proof.bodyReference.path)||row.authority.proof.bodyReference.sha256!==row.authority.proof.observation.sha256)throw Error('PROVIDER_SEED_AUTHORITY_PROOF_INVALID');
}

function readStore(root){
 const file=storeFile(root);if(!fs.existsSync(file))return blank();if(fs.lstatSync(file).isSymbolicLink())throw Error('PROVIDER_SEED_RESOURCE_MEMORY_CORRUPT');
 const state=JSON.parse(fs.readFileSync(file,'utf8'));exact(state,['contractVersion','namespace','meaning','resources'],'PROVIDER_SEED_RESOURCE_MEMORY_CORRUPT');
 if(state.contractVersion!==1||state.namespace!==providerSeedResourceMemoryContract.namespace||state.meaning!==providerSeedResourceMemoryContract.meaning||!Array.isArray(state.resources)||state.resources.length>128)throw Error('PROVIDER_SEED_RESOURCE_MEMORY_CORRUPT');
 state.resources.forEach(assertRecord);return state;
}

function proofBody(root,reference){
 const base=path.join(root,'provider-seed-proofs'),file=path.resolve(root,reference.path);if(!file.startsWith(base+path.sep)||!fs.existsSync(file)||fs.lstatSync(file).isSymbolicLink())throw Error('PROVIDER_SEED_AUTHORITY_PROOF_INVALID');
 const body=fs.readFileSync(file,'utf8');if(digest(body)!==reference.sha256)throw Error('PROVIDER_SEED_AUTHORITY_PROOF_INVALID');return body;
}

function writeProof(root,observation){
 const directory=path.join(root,'provider-seed-proofs'),relative='provider-seed-proofs/'+observation.sha256+'.txt',file=path.join(root,relative);fs.mkdirSync(directory,{recursive:true,mode:0o700});
 if(fs.existsSync(file)){if(fs.lstatSync(file).isSymbolicLink()||digest(fs.readFileSync(file,'utf8'))!==observation.sha256)throw Error('PROVIDER_SEED_AUTHORITY_PROOF_INVALID');}
 else{const fd=fs.openSync(file,'wx',0o600);try{fs.writeSync(fd,observation.body);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}}
 return {path:relative,sha256:observation.sha256};
}

function revalidate(root,target,row){
 const observation={...structuredClone(row.authority.proof.observation),body:proofBody(root,row.authority.proof.bodyReference)},binding=reviewProviderSeedAuthority(observation,target,{candidateHosts:[row.host]});
 if(!binding||canonical(binding)!==canonical(row.authority.binding))throw Error('PROVIDER_SEED_AUTHORITY_PROOF_INVALID');return binding;
}

export function rememberProviderSeedResource({root,researchTarget,providerAuthorityBinding,authorityObservation,providerObservation,role='PROVIDER_ROOT',acquisition,acquiredAt}){
 const directory=rootPath(root),target=createResearchTarget(researchTarget);if(target.targetKind!==researchTargetKinds.PROVIDER_OR_BRAND_SEED||!roles.has(role)||!routes.has(acquisition?.route)||!validTime(acquiredAt))throw Error('PROVIDER_SEED_RESOURCE_INPUT_INVALID');
 const reviewed=reviewProviderSeedAuthority(authorityObservation,target,{candidateHosts:[providerAuthorityBinding?.host]});if(!reviewed||canonical(reviewed)!==canonical(providerAuthorityBinding))throw Error('PROVIDER_SEED_AUTHORITY_PROOF_INVALID');providerSeedCampaignState(target,{providerAuthorityBinding});
 const observation=providerObservation,url=publicUrl(observation?.url);if(observation?.kind!=='PROVIDER'||observation.semantic||observation.outcome!=='OK'||observation.truncated||observation.completeness!=='COMPLETE'||typeof observation.body!=='string'||digest(observation.body)!==observation.sha256||new URL(url).hostname!==providerAuthorityBinding.host)throw Error('CURRENT_PROVIDER_OBSERVATION_REQUIRED');
 const proof=publicAuthorityObservation(authorityObservation);assertAuthorityObservation(proof);const bodyReference=writeProof(directory,authorityObservation),id='provider-seed-resource:'+digest([target.seedName,target.targetMarket,providerAuthorityBinding.host,url,role]);
 const row={contractVersion:1,id,scope:'PROVIDER',researchTarget:structuredClone(target),host:providerAuthorityBinding.host,authority:{binding:structuredClone(providerAuthorityBinding),proof:{observation:proof,bodyReference}},resource:{url,role,acquisitionRoute:acquisition.route,lastUsefulAt:acquiredAt,reacquisition:'REQUIRED'},marketContext:{targetMarket:target.targetMarket,availabilityEstablished:false},meaning:providerSeedResourceMemoryContract.meaning};
 assertRecord(row);const state=readStore(directory),index=state.resources.findIndex(value=>value.id===id);if(index<0)state.resources.push(row);else state.resources[index]=row;state.resources.sort((a,b)=>a.id.localeCompare(b.id));atomic(storeFile(directory),state);return structuredClone(row);
}

export function loadProviderSeedResources({root,researchTarget}){
 let directory,target;try{directory=rootPath(root);target=createResearchTarget(researchTarget);if(target.targetKind!==researchTargetKinds.PROVIDER_OR_BRAND_SEED)throw Error('PROVIDER_SEED_TARGET_REQUIRED');}catch(error){return {resources:[],rejected:true,reason:error.message};}
 try{const resources=[];for(const row of readStore(directory).resources){if(canonical(row.researchTarget)!==canonical(target))continue;const authorityObservation={...structuredClone(row.authority.proof.observation),body:proofBody(directory,row.authority.proof.bodyReference)},binding=revalidate(directory,target,row);resources.push({record:structuredClone(row),providerAuthorityBinding:binding,authorityObservation,acquisition:{route:row.resource.acquisitionRoute,url:row.resource.url,reacquisition:'REQUIRED'}});}return {resources,rejected:false,meaning:providerSeedResourceMemoryContract.meaning};}
 catch(error){return {resources:[],rejected:true,reason:error.message};}
}
