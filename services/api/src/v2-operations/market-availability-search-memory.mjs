// A paid availability lookup is reserved before transport. An interrupted lookup
// remains spent: repeating it automatically could charge the same service twice.
import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';

const servicePattern=/^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const directory=root=>path.join(root,'market-availability-search-v1');
const fileFor=(root,serviceId)=>{
 if(!root||!servicePattern.test(serviceId))throw Error('INVALID_AVAILABILITY_SEARCH_SCOPE');
 return path.join(directory(root),serviceId+'.json');
};
export function readAvailabilitySearch(root,serviceId){
 const file=fileFor(root,serviceId);
 try{
  const stat=fs.lstatSync(file);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>16_384)return null;
  let value;try{value=JSON.parse(fs.readFileSync(file,'utf8'));}catch{return {version:1,serviceId,status:'RESERVED',invalid:true};}
  return value?.version===1&&value.serviceId===serviceId&&['RESERVED','COMPLETE'].includes(value.status)?value:null;
 }catch(error){if(error?.code==='ENOENT')return null;throw error;}
}
export function reserveAvailabilitySearch(root,serviceId,at){
 const file=fileFor(root,serviceId);fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});
 let descriptor;
 try{descriptor=fs.openSync(file,'wx',0o600);}catch(error){if(error?.code==='EEXIST')return false;throw error;}
 try{fs.writeFileSync(descriptor,JSON.stringify({version:1,serviceId,status:'RESERVED',reservedAt:at})+'\n');fs.fsyncSync(descriptor);}finally{fs.closeSync(descriptor);}
 const dir=fs.openSync(path.dirname(file),'r');try{fs.fsyncSync(dir);}finally{fs.closeSync(dir);}
 return true;
}
export function completeAvailabilitySearch(root,serviceId,{at,query,leadUrls,proof,usageCredits=null}){
 const file=fileFor(root,serviceId),prior=readAvailabilitySearch(root,serviceId);
 if(prior?.status!=='RESERVED')throw Error('AVAILABILITY_SEARCH_NOT_RESERVED');
 const result={version:1,serviceId,status:'COMPLETE',reservedAt:prior.reservedAt,completedAt:at,query,
  leadUrls:leadUrls.slice(0,2),proof:proof??null,usageCredits:Number.isFinite(usageCredits)?usageCredits:null};
 const temp=file+'.'+randomUUID()+'.tmp';
 try{
  const descriptor=fs.openSync(temp,'wx',0o600);
  try{fs.writeFileSync(descriptor,JSON.stringify(result)+'\n');fs.fsyncSync(descriptor);}finally{fs.closeSync(descriptor);}
  fs.renameSync(temp,file);
  const dir=fs.openSync(path.dirname(file),'r');try{fs.fsyncSync(dir);}finally{fs.closeSync(dir);}
 }finally{try{fs.unlinkSync(temp);}catch(error){if(error?.code!=='ENOENT')throw error;}}
 return result;
}
