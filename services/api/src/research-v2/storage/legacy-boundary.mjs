// External attestation only: never writes to a historical run or changes its contract.
import fs from 'node:fs';
import path from 'node:path';
import {read,safe,sha,stableBytes,sealed,canonical,immutable,digest} from './core.mjs';
import {closure,validateReceipt} from './references.mjs';
export function certifyLegacyBoundary({root,destination,snapshots,roots=[],cohort,baseline,capabilities=null,createdAt,versions}){
 const dest=path.join(fs.realpathSync(path.dirname(path.resolve(destination))),path.basename(destination)),base=fs.realpathSync(root);
 if(dest===base||dest.startsWith(base+path.sep))throw Error('STORAGE_LEGACY_RECEIPT_MUST_BE_EXTERNAL');
 if(!Array.isArray(snapshots)||!snapshots.length||!createdAt||!versions?.engine||!versions.policy||!versions.schema||!Array.isArray(cohort)||!cohort.length||new Set(cohort).size!==cohort.length||!Array.isArray(baseline)||cohort.some(id=>baseline.includes(id)))throw Error('STORAGE_LEGACY_CERTIFICATION_SCHEMA');
 const contracts=snapshots.map(p=>{
  const bytes=stableBytes(safe(root,p)),s=JSON.parse(bytes),{snapshotHash,...payload}=s;
  if(s.version===1&&sha(JSON.stringify(payload))!==snapshotHash)throw Error('STORAGE_LEGACY_CONTRACT_HASH:'+p);
  if(s.version!==1||!s.inputHashes||!Array.isArray(s.cohort)||digest(s.cohort)!==digest(cohort))throw Error('STORAGE_LEGACY_CONTRACT');
  return {path:p,sha256:sha(bytes),snapshotHash,contract:'LIFECYCLE_SNAPSHOT_V1_JSON_STRINGIFY_SHA256',dependencyCount:Object.keys(s.inputHashes).length};
 });
 const required=[...roots,...snapshots.map(p=>({path:p,format:'SNAPSHOT',classification:'RESUME_CRITICAL',reason:'UNCHANGED_LEGACY_FINGERPRINT_CONTRACT'}))];
 const result=closure(root,required);
 if(!result.complete)return {schema:'V2_LEGACY_CERTIFICATION_FAILURE_V1',complete:false,contracts,errors:result.errors,unknownRequiredDependencies:null,validatedFiles:result.entries.length};
 const receipt=sealed({schema:'V2_FINALIZED_REFERENCES_V1',boundaryKind:'EXTERNAL_LEGACY_CERTIFICATION_V1',complete:true,runId:'legacy:'+digest(contracts),createdAt,versions,cohort,baseline,capabilities,roots:required,legacyContracts:contracts,entries:result.entries.map(({identity,...e})=>e),rootGeneration:result.rootGeneration,unknownRequiredDependencies:0});
 validateReceipt(root,receipt);immutable(dest,canonical(receipt));return receipt;
}
export function revalidateLegacyBoundary(root,file){const r=read(file);if(r.boundaryKind!=='EXTERNAL_LEGACY_CERTIFICATION_V1'||!r.legacyContracts?.length||r.unknownRequiredDependencies!==0)throw Error('STORAGE_LEGACY_CERTIFICATION_SCHEMA');validateReceipt(root,r);for(const c of r.legacyContracts){const s=read(safe(root,c.path));if(c.contract!=='LIFECYCLE_SNAPSHOT_V1_JSON_STRINGIFY_SHA256'||c.dependencyCount!==Object.keys(s.inputHashes??{}).length||sha(stableBytes(safe(root,c.path)))!==c.sha256||s.snapshotHash!==c.snapshotHash||!r.roots.some(x=>x.path===c.path&&x.format==='SNAPSHOT'))throw Error('STORAGE_LEGACY_CONTRACT');}return r;}
