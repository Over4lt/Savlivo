// One sequential read, 64 KiB parser buffer. Retain only Operations view fields;
// evidence bodies, price observations and admission derivations are never built.
import fs from 'node:fs';
import {targetingJson,lengthOnly} from './targeting-json.mjs';
const status={status:true};
const service={service_id:true,finalStatus:true,providerAuthority:status,identity:status,
 subscriptionQualification:status,markets:{status:true,researched:true},login:status,
 management:status,cancellation:status,requests:true,researchComplete:true,executionComplete:true,
 humanReview:true,unresolvedReasons:true,
 pricing:{'*':{market:true,status:true,confidence:true,quarantine:lengthOnly}},
 evidence:{'*':{field:true,url:true,evidenceUrl:true,sourceHash:true,meaning:true}}};
export function readLifecycleResults(file){
 try{
  if(!fs.lstatSync(file).isFile()||fs.lstatSync(file).isSymbolicLink())throw Error('UNSAFE_RESULT_FILE');
  const {value}=targetingJson(file,{services:{'*':service}});
  if(!Array.isArray(value?.services)||value.services.some(s=>!s||typeof s.service_id!=='string'))throw Error('INVALID_RESULT_SCHEMA');
  return {status:'AVAILABLE',services:value.services};
 }catch{return {status:'UNAVAILABLE',services:null};}
}
