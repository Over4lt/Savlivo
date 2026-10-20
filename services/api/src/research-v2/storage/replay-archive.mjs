// Lossless, local archive pilot. There is deliberately no deletion or production entrypoint.
import fs from 'node:fs';
import path from 'node:path';
import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {createGzip,createGunzip} from 'node:zlib';
import {randomUUID,createHash} from 'node:crypto';
import {safe,read,sha,stableHash} from './core.mjs';
import {scanEntries} from './stream-scan.mjs';
import {validateReceipt} from './references.mjs';

const magic=Buffer.from('SAVLIVO_REPLAY_ARCHIVE_V1\n');
const limits={files:200000,manifest:64*1024**2,file:8*1024**3,total:100*1024**3};
const validPath=p=>typeof p==='string'&&p.length>0&&p.length<=1024&&!path.posix.isAbsolute(p)&&!p.includes('\\')&&!p.split('/').some(x=>!x||x==='.'||x==='..')&&path.posix.normalize(p)===p;
const hash=v=>sha(JSON.stringify(v));
const blocked=(status,reasons,extra={})=>({status,reasons:[...new Set(reasons)],cleanupEligible:false,reclaimableNowBytes:0,...extra});

function collect(root,run){
 const files=[],directories=[],inodes=new Map();let logicalBytes=0;
 for(const row of scanEntries(root,[run])){
  if(row.kind==='alias')throw Error('ARCHIVE_SYMLINK');
  if(row.kind==='directory'){if(row.path!==run)directories.push(row.path.slice(run.length+1));continue;}
  const relative=row.path.slice(run.length+1);if(!validPath(relative))throw Error('ARCHIVE_PATH');
  const stat=fs.lstatSync(safe(root,row.path)),key=stat.dev+':'+stat.ino;
  let inode=inodes.get(key);if(!inode){inode={first:relative,local:0,links:stat.nlink,allocated:stat.blocks*512,sha256:stableHash(safe(root,row.path))};inodes.set(key,inode);}
  inode.local++;logicalBytes+=stat.size;
  files.push({path:relative,bytes:stat.size,sha256:inode.sha256,mode:stat.mode&0o777,...(inode.first===relative?{}:{linkTo:inode.first})});
  if(files.length>limits.files||logicalBytes>limits.total||stat.size>limits.file)throw Error('ARCHIVE_LIMIT');
 }
 if([...inodes.values()].some(v=>v.local!==v.links))throw Error('ARCHIVE_EXTERNAL_HARDLINK');
 const payload={schema:'SAVLIVO_REPLAY_ARCHIVE_V1',run,directories:directories.sort(),files,logicalBytes,sourcePhysicalBytes:[...inodes.values()].reduce((n,v)=>n+v.allocated,0),uniqueInodes:inodes.size};
 return {...payload,contentHash:hash(payload)};
}

// ARCHIVABLE permits an additional archive copy only. It never authorizes removing the run.
export function archiveDryRun({root,run,receiptPath,archivePath,reserveBytes=1024*1024}){
 const reasons=[];let manifest=null,availableBytes=null,sameFilesystem=null;
 try{
  if(typeof run!=='string'||!validPath(run)||typeof archivePath!=='string'||!path.isAbsolute(archivePath)||!Number.isSafeInteger(reserveBytes)||reserveBytes<0)throw Error('ARCHIVE_ARGUMENTS');
  const source=safe(root,run),destination=path.resolve(archivePath),parent=path.dirname(destination);
  if(destination===source||destination.startsWith(source+path.sep)||fs.existsSync(destination))throw Error('ARCHIVE_DESTINATION_UNSAFE');
  if(!fs.statSync(source).isDirectory()||!fs.statSync(parent).isDirectory()||fs.lstatSync(parent).isSymbolicLink())throw Error('ARCHIVE_DIRECTORY');
  const summary=read(safe(root,run+'/summary.json'));
  if(summary.executionComplete!==true||summary.researchComplete!==true)reasons.push('ARCHIVE_RUN_NOT_RESEARCH_COMPLETE');
  if(['execution.lock','catalog/adaptive.lock','pricing/adaptive.lock'].some(p=>fs.existsSync(safe(root,run+'/'+p))))reasons.push('ARCHIVE_LOCK_PRESENT_OR_TERMINAL_UNPROVEN');
  if(!receiptPath||!fs.existsSync(safe(root,receiptPath)))reasons.push('ARCHIVE_REFERENCE_RECEIPT_MISSING');
  if(reasons.length)return blocked('BLOCKED',reasons);
  const receipt=validateReceipt(root,read(safe(root,receiptPath)));
  manifest=collect(root,run);
  const protectedFiles=new Map(receipt.entries.map(e=>[e.path,e.sha256]));
  if(manifest.files.some(f=>protectedFiles.get(run+'/'+f.path)!==f.sha256))reasons.push('ARCHIVE_REFERENCE_COVERAGE_INCOMPLETE');
  const statfs=fs.statfsSync(parent);availableBytes=statfs.bavail*statfs.bsize;
  sameFilesystem=fs.statSync(source).dev===fs.statSync(parent).dev;
  if(availableBytes<manifest.sourcePhysicalBytes+reserveBytes)reasons.push('ARCHIVE_INSUFFICIENT_SPACE');
  if(reasons.length)return blocked('BLOCKED',reasons,{manifest,availableBytes,sameFilesystem});
  return blocked('ARCHIVABLE',['ARCHIVE_COPY_ONLY_DIRECT_CONSUMERS_NOT_CLEARED'],{manifest,availableBytes,sameFilesystem});
 }catch(error){return blocked('UNKNOWN',[error.message?.startsWith('STORAGE_')||error.message?.startsWith('ARCHIVE_')?error.message:'ARCHIVE_UNVERIFIED'],{manifest,availableBytes,sameFilesystem});}
}

export async function createReplayArchive(options){
 const plan=archiveDryRun(options);if(plan.status!=='ARCHIVABLE')throw Error('ARCHIVE_PREFLIGHT_'+plan.status);
 const {root,run,archivePath}=options,manifest=plan.manifest,header=Buffer.from(JSON.stringify(manifest));
 if(header.length>limits.manifest)throw Error('ARCHIVE_MANIFEST_LIMIT');
 const size=Buffer.alloc(4);size.writeUInt32BE(header.length);
 const temporary=archivePath+'.partial-'+randomUUID();
 async function* frames(){yield magic;yield size;yield header;for(const file of manifest.files){if(file.linkTo)continue;const location=safe(root,run+'/'+file.path),before=fs.lstatSync(location),digest=createHash('sha256');let count=0;for await(const chunk of fs.createReadStream(location)){digest.update(chunk);count+=chunk.length;yield chunk;}if(count!==file.bytes||digest.digest('hex')!==file.sha256||before.ino!==fs.lstatSync(location).ino||before.ctimeMs!==fs.lstatSync(location).ctimeMs)throw Error('ARCHIVE_SOURCE_CHANGED');}}
 await pipeline(Readable.from(frames()),createGzip({level:6}),fs.createWriteStream(temporary,{flags:'wx',mode:0o600}));
 const fd=fs.openSync(temporary,'r');try{fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
 const after=collect(root,run);if(after.contentHash!==manifest.contentHash)throw Error('ARCHIVE_SOURCE_CHANGED');
 // Link publishes without replacing an archive that appeared after preflight.
 fs.linkSync(temporary,archivePath);fs.unlinkSync(temporary);const archiveDir=fs.openSync(path.dirname(archivePath),'r');try{fs.fsyncSync(archiveDir);}finally{fs.closeSync(archiveDir);}
 const archiveStat=fs.statSync(archivePath),archivePhysicalBytes=archiveStat.blocks*512;
 return {manifestHash:manifest.contentHash,files:manifest.files.length,sourcePhysicalBytes:manifest.sourcePhysicalBytes,archivePhysicalBytes,hypotheticalNetPhysicalSavingBytes:manifest.sourcePhysicalBytes-archivePhysicalBytes,reclaimableNowBytes:0,cleanupEligible:false};
}

export async function restoreReplayArchive({archivePath,destination}){
 if(typeof archivePath!=='string'||typeof destination!=='string'||!path.isAbsolute(destination)||fs.existsSync(destination))throw Error('ARCHIVE_RESTORE_DESTINATION');
 const parent=path.dirname(destination);if(!fs.statSync(parent).isDirectory()||fs.lstatSync(parent).isSymbolicLink())throw Error('ARCHIVE_RESTORE_DESTINATION');
 const stream=fs.createReadStream(archivePath).pipe(createGunzip()),iterator=stream[Symbol.asyncIterator]();let pending=Buffer.alloc(0);
 async function consume(count,sink){while(count){if(!pending.length){const next=await iterator.next();if(next.done)throw Error('ARCHIVE_TRUNCATED');pending=next.value;}const part=pending.subarray(0,Math.min(count,pending.length));sink(part);pending=pending.subarray(part.length);count-=part.length;}}
 async function bytes(count){const chunks=[];await consume(count,p=>chunks.push(p));return Buffer.concat(chunks,count);}
 const prefix=await bytes(magic.length);if(!prefix.equals(magic))throw Error('ARCHIVE_MAGIC');
 const length=(await bytes(4)).readUInt32BE();if(length>limits.manifest)throw Error('ARCHIVE_MANIFEST_LIMIT');
 const manifest=JSON.parse((await bytes(length)).toString('utf8')),{contentHash,...payload}=manifest;
 if(payload.schema!=='SAVLIVO_REPLAY_ARCHIVE_V1'||hash(payload)!==contentHash||!Array.isArray(payload.files)||payload.files.length>limits.files||!Array.isArray(payload.directories)||!validPath(payload.run))throw Error('ARCHIVE_MANIFEST_HASH');
 const seen=new Map();let total=0;for(const file of payload.files){if(!validPath(file.path)||seen.has(file.path)||!Number.isSafeInteger(file.bytes)||file.bytes<0||file.bytes>limits.file||!/^[a-f0-9]{64}$/.test(file.sha256)||!Number.isInteger(file.mode)||file.mode<0||file.mode>0o777)throw Error('ARCHIVE_FILE_SCHEMA');total+=file.bytes;if(total>limits.total)throw Error('ARCHIVE_LIMIT');if(file.linkTo){const target=seen.get(file.linkTo);if(!target||target.bytes!==file.bytes||target.sha256!==file.sha256)throw Error('ARCHIVE_HARDLINK_SCHEMA');}seen.set(file.path,file);}
 if(total!==payload.logicalBytes||payload.directories.some(p=>!validPath(p)||seen.has(p)))throw Error('ARCHIVE_MANIFEST_SCHEMA');
 const stage=fs.mkdtempSync(destination+'.partial-');
 for(const directory of payload.directories)fs.mkdirSync(path.join(stage,directory),{recursive:true,mode:0o700});
 for(const file of payload.files){const output=path.join(stage,file.path);fs.mkdirSync(path.dirname(output),{recursive:true,mode:0o700});if(file.linkTo){fs.linkSync(path.join(stage,file.linkTo),output);continue;}const fd=fs.openSync(output,'wx',file.mode),digest=createHash('sha256');let written=0;try{await consume(file.bytes,part=>{let offset=0;while(offset<part.length){const n=fs.writeSync(fd,part,offset,part.length-offset);if(n<=0)throw Error('ARCHIVE_WRITE_INCOMPLETE');offset+=n;}digest.update(part);written+=part.length;});fs.fsyncSync(fd);}finally{fs.closeSync(fd);}if(written!==file.bytes||digest.digest('hex')!==file.sha256)throw Error('ARCHIVE_FILE_HASH');}
 if(pending.length||!(await iterator.next()).done)throw Error('ARCHIVE_TRAILING_DATA');
 for(const file of payload.files){const output=path.join(stage,file.path),s=fs.lstatSync(output);if(!s.isFile()||s.size!==file.bytes||stableHash(output)!==file.sha256)throw Error('ARCHIVE_RESTORE_HASH');fs.chmodSync(output,file.mode);}
 if(fs.existsSync(destination))throw Error('ARCHIVE_RESTORE_DESTINATION');fs.renameSync(stage,destination);const restoredDir=fs.openSync(parent,'r');try{fs.fsyncSync(restoredDir);}finally{fs.closeSync(restoredDir);}
 return {manifestHash:contentHash,files:payload.files.length,logicalBytes:total,restored:true};
}
