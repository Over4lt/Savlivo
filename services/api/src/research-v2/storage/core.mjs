// Exact-byte storage primitives. No deletion, transport, or evidence promotion.
import fs from 'node:fs';
import path from 'node:path';
import {StringDecoder} from 'node:string_decoder';
import {createHash,randomUUID} from 'node:crypto';
export const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
export const canonical=v=>JSON.stringify(sort(v));
function sort(v){return Array.isArray(v)?v.map(sort):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,sort(v[k])])):v;}
export const digest=v=>canonicalDigest(v);
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

// Exact-byte hashing without retaining a file-sized Buffer. Same race contract as stableBytes.
export function stableHash(file){
 const before=statFile(file),hash=createHash('sha256'),buffer=Buffer.allocUnsafe(64*1024);
 const fd=fs.openSync(file,'r');try{let n;while((n=fs.readSync(fd,buffer,0,buffer.length,null))>0)hash.update(buffer.subarray(0,n));}finally{fs.closeSync(fd);}
 if(before.identity!==statFile(file).identity)throw Error('STORAGE_PUBLICATION_RACE');
 return hash.digest('hex');
}
// Emit canonical JSON into bounded hash chunks, without cloning the complete graph.
export function canonicalDigest(value){return jsonDigest(value,{canonical:true});}
export function jsonDigest(value,options={}){const hash=createHash('sha256');streamJson(value,chunk=>hash.update(chunk),options);return hash.digest('hex');}
// Preserve JSON.stringify ordering and optional two-space layout without a document-sized string.
export function streamJson(value,sink,{canonical:sorted=false,space=0}={}){
 let chunk='';
 const emit=s=>{if(s.length>=65536){if(chunk){sink(chunk);chunk='';}sink(s);}else{chunk+=s;if(chunk.length>=65536){sink(chunk);chunk='';}}};
 const index=k=>/^(0|[1-9][0-9]*)$/.test(k)&&Number(k)<4294967295;
 const line=depth=>{if(space){emit('\n');emit(' '.repeat(depth*space));}};
 const visit=(v,depth=0)=>{
  if(Array.isArray(v)){emit('[');for(let i=0;i<v.length;i++){if(i)emit(',');line(depth+1);if(v[i]===undefined||typeof v[i]==='function'||typeof v[i]==='symbol')emit('null');else visit(v[i],depth+1);}if(v.length)line(depth);emit(']');return;}
  if(v&&typeof v==='object'){
   if((!sorted||Object.hasOwn(v,'toJSON'))&&typeof v.toJSON==='function'){emit(sorted?canonical(v):JSON.stringify(v));return;}
   emit('{');let first=true;const keys=Object.keys(v);if(sorted)keys.sort((a,b)=>index(a)&&index(b)?Number(a)-Number(b):index(a)?-1:index(b)?1:a<b?-1:a>b?1:0);
   for(const k of keys){const x=v[k];if(x===undefined||typeof x==='function'||typeof x==='symbol')continue;if(!first)emit(',');first=false;line(depth+1);emit(JSON.stringify(k));emit(space?': ':':');visit(x,depth+1);}if(!first)line(depth);emit('}');return;
  }
  emit(JSON.stringify(v));
 };
 visit(value);if(chunk)sink(chunk);
}

// JSONL is processed one record at a time, not split/map of the entire file.
export function* stableJsonLines(file,expectedIdentity=null){
 const before=statFile(file);if(expectedIdentity!==null&&before.identity!==expectedIdentity)throw Error('STORAGE_PUBLICATION_RACE');
 const fd=fs.openSync(file,'r'),buffer=Buffer.allocUnsafe(65536),decoder=new StringDecoder('utf8');let carry='';
 try{let n;while((n=fs.readSync(fd,buffer,0,buffer.length,null))>0){carry+=decoder.write(buffer.subarray(0,n));let end;while((end=carry.indexOf('\n'))>=0){const line=carry.slice(0,end);carry=carry.slice(end+1);if(line)yield JSON.parse(line);}}carry+=decoder.end();if(carry)yield JSON.parse(carry);}finally{fs.closeSync(fd);}
 if(before.identity!==statFile(file).identity)throw Error('STORAGE_PUBLICATION_RACE');
}

// Used only by explicitly bounded validation children (--expose-gc). Drop dead
// parse/adapter temporaries between documents; never discard authenticated state.
export function releaseValidationTemporaries(){
 if(typeof globalThis.gc!=='function')return;
 const m=process.memoryUsage();if(m.heapUsed>160*1024**2||m.external>96*1024**2)globalThis.gc();
}
