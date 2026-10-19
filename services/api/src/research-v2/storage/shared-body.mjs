// Preserve each run's original body path while sharing identical immutable bytes
// on the same persistent filesystem. The run journal remains the observation.
import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {safe,sha,stableBytes} from './core.mjs';

function savlivoRoot(directory){
 let current=path.resolve(directory);
 while(path.basename(current)!=='.savlivo'){
  const parent=path.dirname(current);if(parent===current)return null;current=parent;
 }
 return current;
}

function publish(file,bytes){
 fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});
 if(fs.existsSync(file)){if(!stableBytes(file).equals(bytes))throw Error('STORAGE_IMMUTABLE_CONFLICT');return;}
 const pending=file+'.publishing-'+randomUUID(),fd=fs.openSync(pending,'wx',0o600);
 try{fs.writeFileSync(fd,bytes);fs.fchmodSync(fd,0o400);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
 try{
  try{fs.linkSync(pending,file);}catch(error){if(error.code!=='EEXIST')throw error;if(!stableBytes(file).equals(bytes))throw Error('STORAGE_IMMUTABLE_CONFLICT');}
  const dir=fs.openSync(path.dirname(file),'r');try{fs.fsyncSync(dir);}finally{fs.closeSync(dir);}
 }finally{fs.unlinkSync(pending);}
}

export function retainSharedSourceBody(directory,body,expectedHash=null){
 if(typeof body!=='string')throw Error('STORAGE_BODY_INVALID');
 const bytes=Buffer.from(body),hash=sha(bytes);
 if(expectedHash!==null&&expectedHash!==hash)throw Error('STORAGE_BLOB_HASH');
 const relative='bodies/'+hash+'.txt',destination=path.join(path.resolve(directory),relative);
 const root=savlivoRoot(directory);
 if(root){
  const store=path.join(root,'research-v2','storage'),blob=safe(store,'blobs/sha256/'+hash.slice(0,2)+'/'+hash);
  publish(blob,bytes);fs.mkdirSync(path.dirname(destination),{recursive:true,mode:0o700});
  // Existing V2 blobs may predate read-only publication. Linking a writable
  // inode would let a legacy writer change every observation at once.
  if(fs.statSync(blob).mode&0o222)publish(destination,bytes);
  else try{fs.linkSync(blob,destination);}catch(error){
   if(error.code==='EXDEV'||error.code==='EPERM'||error.code==='ENOTSUP')publish(destination,bytes);
   else if(error.code==='EEXIST'){if(!stableBytes(destination).equals(bytes))throw Error('STORAGE_IMMUTABLE_CONFLICT');}
   else throw error;
  }
 }else{
  // Non-persistent test and development runs keep their previous writable
  // checkpoint semantics; sharing is enabled only under the persistent root.
  fs.mkdirSync(path.dirname(destination),{recursive:true,mode:0o700});
  fs.writeFileSync(destination,bytes,{mode:0o600});
 }
 if(!stableBytes(destination).equals(bytes))throw Error('STORAGE_BLOB_HASH');
 return {bodyFile:relative,bodyHash:hash};
}
