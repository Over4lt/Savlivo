// Compact routing memory for the bounded V2/V3 hybrid. It remembers where to
// reacquire current provider material; it never stores or replays Truth.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {canonical,digest,normalizeUrl} from '../../research-v3/model.mjs';
import {validatedV3ProviderAuthorityBinding} from './provider-routing-authority.mjs';

export const hybridProviderResourceMemoryContract=Object.freeze({
 contractVersion:1,
 namespace:'SAVLIVO_RESEARCH_ENGINE_V1_PROVIDER_RESOURCES',
 meaning:'ROUTING_ONLY_REQUIRES_FRESH_ACQUISITION'
});
export const hybridProviderResourceRoles=Object.freeze(['PRICING','PLAN_CATALOG']);
const routes=new Set(['DIRECT','DECODO']);
const outcomes=new Set(['ACQUISITION_FAILED','INSUFFICIENT','MOVED','ACCESS_BLOCKED']);
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const stable=value=>JSON.stringify(value,(_,v)=>object(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);
function exact(value,keys,code){if(!object(value)||canonical(Object.keys(value).sort())!==canonical([...keys].sort()))throw Error(code);}
function publicUrl(value){const normalized=normalizeUrl(value);if(!normalized||normalized!==value)throw Error('HYBRID_RESOURCE_URL_INVALID');return normalized;}
function validTime(value){return typeof value==='string'&&Number.isFinite(Date.parse(value));}
function rootPath(root){if(typeof root!=='string'||!root)return null;return path.resolve(root);}
const storeFile=root=>path.join(root,'provider-resources.json');
const blank=()=>({contractVersion:1,namespace:hybridProviderResourceMemoryContract.namespace,meaning:hybridProviderResourceMemoryContract.meaning,resources:[]});

export function defaultHybridProviderResourceMemoryRoot(home=os.homedir()){
 return path.join(home,'.savlivo','research-engine-v1');
}

function atomic(file,value){
 fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});const pending=file+'.pending',fd=fs.openSync(pending,'w',0o600);
 try{fs.writeSync(fd,stable(value)+'\n');fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
 fs.renameSync(pending,file);
}

function assertObservation(value){
 exact(value,['id','kind','authority','url','context','outcome','truncated','completeness','format','contentType','httpStatus','access','sha256'],'HYBRID_AUTHORITY_PROOF_INVALID');
 if(value.kind!=='CANDIDATE'||value.authority!=='UNREVIEWED_CANDIDATE'||value.outcome!=='OK'||value.truncated!==false||value.completeness!=='COMPLETE'||value.format!=='WEB'||!/^([a-f0-9]{64})$/.test(value.sha256)||publicUrl(value.url)!==value.url||!Array.isArray(value.access))throw Error('HYBRID_AUTHORITY_PROOF_INVALID');
}

function assertRecord(row){
 exact(row,['contractVersion','id','service','market','host','authority','resource','meaning'],'HYBRID_RESOURCE_RECORD_INVALID');
 exact(row.service,['id','name'],'HYBRID_RESOURCE_RECORD_INVALID');
 exact(row.authority,['provenance','binding','proof'],'HYBRID_RESOURCE_RECORD_INVALID');
 exact(row.authority.proof,['observation','bodyReference'],'HYBRID_RESOURCE_RECORD_INVALID');
 exact(row.authority.proof.bodyReference,['path','sha256'],'HYBRID_RESOURCE_RECORD_INVALID');
 exact(row.resource,['url','role','acquisitionRoute','lastUsefulAt','lastAttempt','lastOutcome','failures','nextRetryAt'],'HYBRID_RESOURCE_RECORD_INVALID');
 assertObservation(row.authority.proof.observation);
 if(row.contractVersion!==1||typeof row.id!=='string'||!row.id.startsWith('hybrid-provider-resource:')||typeof row.service.id!=='string'||!row.service.id||typeof row.service.name!=='string'||!row.service.name||!/^([A-Z]{2})$/.test(row.market)||typeof row.host!=='string'||row.authority.provenance!=='V3_AUTONOMOUS_CANDIDATE_REVIEW'||row.authority.binding?.host!==row.host||row.meaning!==hybridProviderResourceMemoryContract.meaning)throw Error('HYBRID_RESOURCE_RECORD_INVALID');
 if(!/^proofs\/[a-f0-9]{64}\.txt$/.test(row.authority.proof.bodyReference.path)||row.authority.proof.bodyReference.sha256!==row.authority.proof.observation.sha256)throw Error('HYBRID_AUTHORITY_PROOF_INVALID');
 const url=publicUrl(row.resource.url),expectedId='hybrid-provider-resource:'+digest([row.service.id,row.market,row.host,url,row.resource.role]);if(row.id!==expectedId||new URL(url).hostname!==row.host||!hybridProviderResourceRoles.includes(row.resource.role)||!routes.has(row.resource.acquisitionRoute)||!validTime(row.resource.lastUsefulAt)||row.resource.lastAttempt!==null&&!validTime(row.resource.lastAttempt)||!['USEFUL',...outcomes].includes(row.resource.lastOutcome)||!Number.isSafeInteger(row.resource.failures)||row.resource.failures<0||row.resource.nextRetryAt!==null&&!validTime(row.resource.nextRetryAt))throw Error('HYBRID_RESOURCE_RECORD_INVALID');
}

function readStore(root){
 const file=storeFile(root);if(!fs.existsSync(file))return blank();if(fs.lstatSync(file).isSymbolicLink())throw Error('HYBRID_RESOURCE_MEMORY_CORRUPT');
 const state=JSON.parse(fs.readFileSync(file,'utf8'));exact(state,['contractVersion','namespace','meaning','resources'],'HYBRID_RESOURCE_MEMORY_CORRUPT');
 if(state.contractVersion!==1||state.namespace!==hybridProviderResourceMemoryContract.namespace||state.meaning!==hybridProviderResourceMemoryContract.meaning||!Array.isArray(state.resources)||state.resources.length>512)throw Error('HYBRID_RESOURCE_MEMORY_CORRUPT');
 for(const row of state.resources)assertRecord(row);return state;
}

function proofBody(root,reference){
 const base=path.join(root,'proofs'),file=path.resolve(root,reference.path);if(!file.startsWith(base+path.sep)||!fs.existsSync(file)||fs.lstatSync(file).isSymbolicLink())throw Error('HYBRID_AUTHORITY_PROOF_INVALID');
 const body=fs.readFileSync(file,'utf8');if(digest(body)!==reference.sha256)throw Error('HYBRID_AUTHORITY_PROOF_INVALID');return body;
}

function reviewForRecord(root,target,row){
 const review={contractVersion:1,candidateObservation:{...structuredClone(row.authority.proof.observation),body:proofBody(root,row.authority.proof.bodyReference)},providerAuthorityBinding:structuredClone(row.authority.binding),reason:null};
 const binding=validatedV3ProviderAuthorityBinding(target,review);if(canonical(binding)!==canonical(row.authority.binding)||binding.host!==row.host)throw Error('HYBRID_AUTHORITY_PROOF_INVALID');return review;
}

function references(value,id,sha256,seen=new Set()){
 if(!value||typeof value!=='object'||seen.has(value))return false;seen.add(value);
 if(value.observation===id&&value.sha256===sha256)return true;
 return Object.values(value).some(child=>references(child,id,sha256,seen));
}

function writeProof(root,observation){
 const directory=path.join(root,'proofs'),relative='proofs/'+observation.sha256+'.txt',file=path.join(root,relative);fs.mkdirSync(directory,{recursive:true,mode:0o700});
 if(fs.existsSync(file)){if(fs.lstatSync(file).isSymbolicLink()||digest(fs.readFileSync(file,'utf8'))!==observation.sha256)throw Error('HYBRID_AUTHORITY_PROOF_INVALID');}
 else {const fd=fs.openSync(file,'wx',0o600);try{fs.writeSync(fd,observation.body);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}}
 return {path:relative,sha256:observation.sha256};
}

export function rememberHybridProviderResource({root,target,authorityReview,providerObservation,truth,catalog=null,acquisition,acquiredAt}){
 const directory=rootPath(root);if(!directory||!target||!/^([A-Z]{2})$/.test(target.market??'')||!validTime(acquiredAt)||!routes.has(acquisition?.route))throw Error('HYBRID_RESOURCE_INPUT_INVALID');
 const binding=validatedV3ProviderAuthorityBinding(target,authorityReview),observation=providerObservation,url=publicUrl(observation?.url);
 if(observation?.kind!=='PROVIDER'||observation.outcome!=='OK'||observation.truncated===true||typeof observation.body!=='string'||digest(observation.body)!==observation.sha256||new URL(url).hostname!==binding.host)throw Error('CURRENT_PROVIDER_OBSERVATION_REQUIRED');
 const priceUseful=truth?.established===true&&references(truth,observation.id,observation.sha256),catalogUseful=references(catalog,observation.id,observation.sha256);
 if(!priceUseful&&!catalogUseful)throw Error('CURRENT_PROVIDER_RESOURCE_NOT_USEFUL');
 const proof={...structuredClone(authorityReview.candidateObservation)};delete proof.body;assertObservation(proof);
 const bodyReference=writeProof(directory,authorityReview.candidateObservation),role=priceUseful?'PRICING':'PLAN_CATALOG',id='hybrid-provider-resource:'+digest([target.service,target.market,binding.host,url,role]);
 const row={contractVersion:1,id,service:{id:target.service,name:target.serviceName},market:target.market,host:binding.host,authority:{provenance:'V3_AUTONOMOUS_CANDIDATE_REVIEW',binding:structuredClone(binding),proof:{observation:proof,bodyReference}},resource:{url,role,acquisitionRoute:acquisition.route,lastUsefulAt:acquiredAt,lastAttempt:acquiredAt,lastOutcome:'USEFUL',failures:0,nextRetryAt:null},meaning:hybridProviderResourceMemoryContract.meaning};
 assertRecord(row);const state=readStore(directory),index=state.resources.findIndex(item=>item.id===id);if(index<0)state.resources.push(row);else state.resources[index]=row;state.resources.sort((a,b)=>a.id.localeCompare(b.id));atomic(storeFile(directory),state);return structuredClone(row);
}

export function loadHybridProviderResources({root,target,now}){
 const directory=rootPath(root);if(!directory||!validTime(now))return {resources:[],rejected:true,reason:'HYBRID_RESOURCE_INPUT_INVALID'};
 try{
  const state=readStore(directory),resources=[],skipped=[];
  for(const row of state.resources){
   if(row.service.id!==target.service||row.service.name!==target.serviceName||row.market!==target.market)continue;
   const review=reviewForRecord(directory,target,row);if(row.resource.nextRetryAt&&Date.parse(now)<Date.parse(row.resource.nextRetryAt)){skipped.push({id:row.id,reason:'FAILURE_BACKOFF'});continue;}
   resources.push({record:structuredClone(row),authorityReview:review});
  }
  return {resources,skipped,rejected:false,meaning:hybridProviderResourceMemoryContract.meaning};
 }catch(error){return {resources:[],skipped:[],rejected:true,reason:error.message};}
}

export function recordHybridProviderResourceFailure({root,target,resourceId,outcome,now}){
 const directory=rootPath(root);if(!directory||!outcomes.has(outcome)||!validTime(now))throw Error('HYBRID_RESOURCE_FAILURE_INVALID');const state=readStore(directory),row=state.resources.find(item=>item.id===resourceId);
 if(!row||row.service.id!==target.service||row.service.name!==target.serviceName||row.market!==target.market)throw Error('HYBRID_RESOURCE_SCOPE_MISMATCH');reviewForRecord(directory,target,row);
 if(row.resource.lastAttempt&&Date.parse(now)<Date.parse(row.resource.lastAttempt))throw Error('HYBRID_RESOURCE_FAILURE_NON_MONOTONIC');
 row.resource.failures++;row.resource.lastAttempt=now;row.resource.lastOutcome=outcome;const days=Math.min(30,2**Math.min(row.resource.failures,5));row.resource.nextRetryAt=new Date(Date.parse(now)+days*86400000).toISOString();assertRecord(row);atomic(storeFile(directory),state);return structuredClone(row);
}
