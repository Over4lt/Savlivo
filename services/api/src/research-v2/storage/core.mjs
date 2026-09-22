// Exact-byte storage primitives. No deletion, transport, or evidence promotion.
import fs from 'node:fs';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
export const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
export const canonical=v=>JSON.stringify(sort(v));
function sort(v){return Array.isArray(v)?v.map(sort):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,sort(v[k])])):v;}
export const digest=v=>sha(canonical(v));
export function read(file){return JSON.parse(fs.readFileSync(file,'utf8'));}
export function safe(root,relative){
 if(typeof relative!=='string'||!relative||path.isAbsolute(relative)||relative.split(/[\\/]/).includes('..')||relative.includes('\\')||path.posix.normalize(relative)!==relative)throw Error('STORAGE_PATH_ESCAPE');
 const base=path.resolve(root),file=path.resolve(base,relative);if(!file.startsWith(base+path.sep))throw Error('STORAGE_PATH_ESCAPE');
 let p=base;if(fs.existsSync(p)&&fs.lstatSync(p).isSymbolicLink())throw Error('STORAGE_SYMLINK');
 for(const part of relative.split('/')){p=path.join(p,part);if(fs.existsSync(p)&&fs.lstatSync(p).isSymbolicLink())throw Error('STORAGE_SYMLINK');}
 return file;
}
export function relative(root,file){const r=path.relative(path.resolve(root),path.resolve(file)).split(path.sep).join('/');safe(root,r);return r;}
export function statFile(file){const s=fs.lstatSync(file);if(!s.isFile()||s.isSymbolicLink())throw Error('STORAGE_NOT_REGULAR');return {bytes:s.size,allocatedBytes:Number.isFinite(s.blocks)?s.blocks*512:s.size,identity:`${s.dev}:${s.ino}:${s.size}:${s.mtimeMs}:${s.ctimeMs}`};}
export function stableBytes(file){const before=statFile(file),bytes=fs.readFileSync(file);if(before.identity!==statFile(file).identity)throw Error('STORAGE_PUBLICATION_RACE');return bytes;}
export function immutable(file,bytes){
 bytes=Buffer.isBuffer(bytes)?bytes:Buffer.from(bytes);fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});
 if(fs.existsSync(file)){if(!stableBytes(file).equals(bytes))throw Error('STORAGE_IMMUTABLE_CONFLICT');return;}
 const tmp=file+'.publishing-'+randomUUID(),fd=fs.openSync(tmp,'wx',0o600);try{fs.writeFileSync(fd,bytes);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
 // link is an atomic no-replace publication, not a symlink. Interrupted temporary files stay protected.
 try{fs.linkSync(tmp,file);}catch(e){if(e.code!=='EEXIST'||!stableBytes(file).equals(bytes))throw e;}
 // No unlink implementation: publication scratch is classified unknown/protected until future GC.
 const d=fs.openSync(path.dirname(file),'r');try{fs.fsyncSync(d);}finally{fs.closeSync(d);}
}
export function sealed(payload){return {...payload,contentHash:digest(payload)};}
export function verifySeal(value,schema){const {contentHash,...payload}=value;if(value.schema!==schema||contentHash!==digest(payload))throw Error('STORAGE_SCHEMA_OR_HASH');return value;}
export function files(root,relativeDir,max=1000000){const out=[];function walk(rel){const p=safe(root,rel),s=fs.lstatSync(p);if(s.isDirectory()){for(const name of fs.readdirSync(p).sort())walk(rel+'/'+name);}else{statFile(p);out.push(rel);if(out.length>max)throw Error('STORAGE_SCAN_LIMIT');}}if(fs.existsSync(safe(root,relativeDir)))walk(relativeDir);return out;}
export const CLASSES=['PERMANENT_CANONICAL','PERMANENT_HISTORY','REFERENCED_EVIDENCE','RESUME_CRITICAL','SHORT_TERM_DIAGNOSTIC','REGENERABLE_CACHE','DUPLICATE_CONTENT','DEVELOPMENT_FORENSIC_ONLY','UNKNOWN_OR_UNSAFE_TO_DELETE'];
