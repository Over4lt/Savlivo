// Recognize versioned contracts, never grant path semantics by field name alone.
import {safe} from './core.mjs';
const stages=['IDENTITY_SUBSCRIPTION','MARKETS','LOGIN','MANAGEMENT','CANCELLATION','PRICING','VALIDATION'];
export function adaptDocument(root,value,owner){
 if(value?.version==='V2_ADDITIVE_CANDIDATES_V1'){
  if(!Array.isArray(value.existing)||!Array.isArray(value.exclude))throw Error('STORAGE_ADDITIVE_SCHEMA');
  const references=[];
  function transform(v){if(Array.isArray(v))return v.map(transform);if(!v||typeof v!=='object')return v;const result={};for(const [k,x]of Object.entries(v)){
   if((k==='reference'||k==='marketAuthority')&&typeof x==='string'&&/^(docs|packages)\//.test(x)){
    const [p,...fragment]=x.split('#');safe(root,p);if(!/\.(json|ts)$/.test(p))throw Error('STORAGE_ADDITIVE_REFERENCE');
    references.push({path:p,format:p.endsWith('.ts')?'CODE':'JSON',classification:'PERMANENT_HISTORY',reason:owner+':'+k});
    result[k+'Locator']=fragment.join('#');
   }else result[k]=transform(x);
  }return result;}
  return {value:transform(value),references,schema:'V2_ADDITIVE_CANDIDATES_V1'};
 }
 if(value?.schemaVersion===1&&value.scope==='EXACT_RETAINED_INTERPRETATIONS_ONLY'){
  if(!Array.isArray(value.entries))throw Error('STORAGE_QUARANTINE_SCHEMA');
  const entries=value.entries.map(e=>{
   if(typeof e.source!=='string'||!e.source.endsWith('/adaptive-state.json')||!/^[a-f0-9]{64}$/.test(e.sourceHash)||e.status!=='REJECTED_INVALID_PRICE_INTERPRETATION')throw Error('STORAGE_QUARANTINE_SCHEMA');
   safe(root,e.source);const {source,sourceHash,...rest}=e;
   if(rest.originalVerified?.version!=='V2_FIELD_VERIFICATION_V1')throw Error('STORAGE_QUARANTINE_VERIFICATION_SCHEMA');
   function locators(v){if(Array.isArray(v))return v.map(locators);if(!v||typeof v!=='object')return v;const result={};for(const [k,x]of Object.entries(v)){
    if(k==='path'&&typeof x==='string'&&x.startsWith('$/')){if(!/^\$(?:\/[a-zA-Z0-9_:#.-]+(?:\[\d+\])?)+$/.test(x))throw Error('STORAGE_DOM_LOCATOR_SCHEMA');result.domLocator=x;}
    else result[k]=locators(x);
   }return result;}
   return {...rest,originalVerified:locators(rest.originalVerified),sourceReference:{path:source,sha256:sourceHash}};
  });return {value:{...value,entries},references:[],schema:'EXACT_RETAINED_INTERPRETATIONS_V1'};
 }
 if(value?.version!==1||value?.authorityBootstrap!==1||value?.scope!=='NEW_SERVICES_ONLY')return {value,references:[],schema:null};
 if(!Array.isArray(value.serviceIds)||new Set(value.serviceIds).size!==value.expectedServices||value.serviceIds.length!==value.expectedServices||!value.inputHashes||!value.outputHashes)throw Error('STORAGE_DISCOVERY_MANIFEST_SCHEMA');
 const c=value.controller;
 if(c?.version!==1||JSON.stringify(c.stages)!==JSON.stringify(stages)||c.automaticAuthorityGrants!==false||c.unknownEvidenceRemainsUnresolved!==true||c.entrypoint!=='docs/catalog/global-47/research-v2/run-v15-full-v2.mjs')throw Error('STORAGE_DISCOVERY_CONTROLLER_SCHEMA');
 safe(root,c.entrypoint);
 const references=[{path:c.entrypoint,format:'CODE',classification:'PERMANENT_HISTORY',reason:owner+':controller.entrypoint (historical code provenance, not an execution instruction)'}];
 for(const [name,hash]of Object.entries(value.outputHashes)){
  if(!/^[a-z0-9-]+\.json$/.test(name)||!/^[a-f0-9]{64}$/.test(hash))throw Error('STORAGE_DISCOVERY_OUTPUT_SCHEMA');
  references.push({path:owner.slice(0,owner.lastIndexOf('/')+1)+name,sha256:hash,format:'JSON',classification:'PERMANENT_HISTORY',reason:owner+':outputHashes'});
 }
 // Preserve scanning of every other field, including unknown future path-bearing fields.
 const {entrypoint,...controller}=c;
 return {value:{...value,controller,outputHashes:undefined},references,schema:'DISCOVERY_MANIFEST_V1_AUTHORITY_BOOTSTRAP_1'};
}

// The legacy snapshot contract fingerprints inputHashes. Source bodyFile is relative
// to its acquisition directory, NOT the directory containing the snapshot itself.
export function adaptSnapshot(root,snapshot){
 if(snapshot.version!==1||!snapshot.inputHashes||!Array.isArray(snapshot.cohort)||!snapshot.sources||!Array.isArray(snapshot.parents))throw Error('STORAGE_LIFECYCLE_SNAPSHOT_SCHEMA');
 const local=p=>{if(p.startsWith(root+'/'))p=p.slice(root.length+1);safe(root,p);return p;};
 const inputHashes=snapshot.inputHashes;
 const sources=Object.fromEntries(Object.entries(snapshot.sources).map(([service,items])=>{
  if(!snapshot.cohort.includes(service)||!Array.isArray(items))throw Error('STORAGE_LIFECYCLE_SOURCE_SCOPE');
  return [service,items.map(item=>{
   const {directory,page,...unknown}=item;local(directory);
   if(!page||typeof page!=='object')throw Error('STORAGE_LIFECYCLE_SOURCE_SCHEMA');
   const {bodyFile,...fields}=page;
   if(!bodyFile)return {...unknown,page:fields};
   if(!/^bodies\/[a-f0-9]{64}\.txt$/.test(bodyFile)||!/^[a-f0-9]{64}$/.test(page.bodyHash))throw Error('STORAGE_LIFECYCLE_BODY_REFERENCE');
   const raw=directory+'/'+bodyFile,p=local(raw);
   if((inputHashes[raw]??inputHashes[p])!==page.bodyHash)throw Error('STORAGE_LIFECYCLE_BODY_NOT_FINGERPRINTED');
   return {...unknown,page:{...fields,bodyReference:{path:p,sha256:page.bodyHash}}};
  })];
 }));
 const parents=snapshot.parents.map(p=>{const {directory,...rest}=p;local(directory);return rest;});
 function stateReferences(v){
  if(Array.isArray(v))return v.map(stateReferences);if(!v||typeof v!=='object')return v;
  const result={};for(const [k,x]of Object.entries(v))if(k!=='bodyFile'){
   if(k==='rule'&&v.robotsUrl&&x?.path!==undefined){
    if(!/^https?:\/\//.test(v.robotsUrl)||!['allow','disallow'].includes(x.directive)||typeof x.path!=='string'||!x.path.startsWith('/'))throw Error('STORAGE_ROBOTS_RULE_SCHEMA');
    const {path:robotsPattern,...rest}=x;result.rule={...stateReferences(rest),robotsPattern};
   }else result[k]=stateReferences(x);
  }
  if(v.bodyFile){
   const matches=Object.values(snapshot.sources).flat().filter(s=>s.page?.bodyFile===v.bodyFile&&s.page?.bodyHash===v.bodyHash&&s.page?.url===v.url);
   if(!matches.length)throw Error('STORAGE_LIFECYCLE_STATE_BODY_UNRESOLVED');
   result.bodyReferences=matches.map(s=>({path:local(s.directory+'/'+s.page.bodyFile),sha256:v.bodyHash}));
  }return result;
 }
 return stateReferences({...snapshot,sources,parents});
}
