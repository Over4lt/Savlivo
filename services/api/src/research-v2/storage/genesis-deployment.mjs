// Deployment placement only. No research, authority changes or historical rewrites.
import fs from 'node:fs';
import path from 'node:path';
import {read,safe,stableBytes,sha,digest,verifySeal,immutable,canonical} from './core.mjs';
const fail=(code,p='')=>{throw Error(`GENESIS_DEPLOYMENT_${code}${p?':'+p:''}; restore the complete certified export with genesis-restore, or register the verified overlay with genesis-register-overlay. Keep run control and scheduling OFF.`);};
const code=p=>/\.(mjs|js|ts)$/.test(p);
const bundle=g=>`.savlivo/research-v2/storage/deployment/${g.genesisHash}`;
function readFile(root,p){try{return stableBytes(safe(root,p));}catch(e){fail('MISSING_OR_UNSAFE_FILE',p);}}
function match(root,e){const b=readFile(root,e.path);if(b.length!==e.bytes||sha(b)!==e.sha256)fail('HASH_CONFLICT',e.path);return b;}
export function deploymentContract(root,manifest,expectedGenesisHash){
 verifySeal(manifest,'PRODUCTION_GENESIS_EXPORT_V1');
 if(!/^[a-f0-9]{64}$/.test(expectedGenesisHash??'')||manifest.genesisHash!==expectedGenesisHash)fail('EXPECTED_GENESIS_HASH');
 const bytes=readFile(root,manifest.genesis),g=JSON.parse(bytes),{genesisHash,...payload}=g;
 if(g.schema!=='PRODUCTION_GENESIS_V1'||genesisHash!==expectedGenesisHash||digest(payload)!==genesisHash||g.lineage?.kind!=='NEW_PRODUCTION_GENESIS'||g.lineage.continuesHistoricalSnapshot!==false)fail('GENESIS_SEAL');
 const boundary=verifySeal(g.protectedReferences,'V2_FINALIZED_REFERENCES_V1');
 if(!boundary.complete||boundary.boundaryKind!=='PRODUCTION_GENESIS_V1'||boundary.unknownRequiredDependencies!==0)fail('BOUNDARY');
 const input=readFile(root,g.lifecycle.productionInput);
 if(sha(input)!==g.lifecycle.productionInputHash||manifest.productionInput!==g.lifecycle.productionInput)fail('INPUT_HASH');
 const expected=[...boundary.entries.map(e=>({path:e.path,sha256:e.sha256,bytes:e.bytes})),{path:manifest.genesis,sha256:sha(bytes),bytes:bytes.length},{path:g.lifecycle.productionInput,sha256:sha(input),bytes:input.length}];
 if(!Array.isArray(manifest.files)||new Set(manifest.files.map(e=>e.path)).size!==manifest.files.length)fail('MANIFEST_FILES');
 const ordered=rows=>rows.map(({path,sha256,bytes})=>({path,sha256,bytes})).sort((a,b)=>a.path.localeCompare(b.path));
 if(digest(ordered(expected))!==digest(ordered(manifest.files)))fail('MANIFEST_CLOSURE');
 for(const e of expected){safe(root,e.path);if(!Number.isSafeInteger(e.bytes)||e.bytes<0||!/^[a-f0-9]{64}$/.test(e.sha256))fail('ENTRY_SCHEMA');if(g.excludedUntrustedHistoricalArtifacts.some(x=>x.path===e.path||x.sha256===e.sha256))fail('UNTRUSTED_INPUT');}
 return {genesis:g,manifest,repository:manifest.files.filter(e=>!e.path.startsWith('.savlivo/'))};
}
function preflightDest(root,entries){
 for(const e of entries){const f=safe(root,e.path);if(fs.existsSync(f))match(root,e);else if(code(e.path))fail('MATCHING_DEPLOYED_CODE_REQUIRED',e.path);}
}
function copyMissing(source,dest,entries){
 for(const e of entries){const to=safe(dest,e.path);if(fs.existsSync(to)){match(dest,e);continue;}fs.mkdirSync(path.dirname(to),{recursive:true});fs.copyFileSync(safe(source,e.path),to,fs.constants.COPYFILE_EXCL);match(dest,e);}
}
// Caller must perform full validateGenesisExport first. This verifies each byte again
// and preflights all existing destinations before writing any missing object.
export function restoreGenesisFiles(source,destination,expectedGenesisHash){
 const manifest=read(safe(source,'genesis-export.json')),c=deploymentContract(source,manifest,expectedGenesisHash);
 if(path.resolve(source)===path.resolve(destination))fail('DISTINCT_DESTINATION_REQUIRED');
 for(const e of manifest.files)match(source,e);
 preflightDest(destination,manifest.files);copyMissing(source,destination,manifest.files);
 return c;
}
export function verifyGenesisPlacement(root,manifest,expectedGenesisHash){
 const c=deploymentContract(root,manifest,expectedGenesisHash);for(const e of manifest.files)match(root,e);return c;
}
// Register only after full independent validation of the installed repository overlay.
export function registerGenesisOverlay(root,manifest,expectedGenesisHash){
 const c=verifyGenesisPlacement(root,manifest,expectedGenesisHash),base=bundle(c.genesis);
 for(const e of c.repository){const bytes=match(root,e);immutable(safe(root,base+'/repository/'+e.path),bytes);}
 immutable(safe(root,base+'/manifest.json'),canonical(manifest));
 return {genesisHash:expectedGenesisHash,repositoryFiles:c.repository.length,repositoryBytes:c.repository.reduce((n,e)=>n+e.bytes,0),bundle:base};
}
export function ensureGenesisRepositoryInputs(root,input,{repair=true}={}){
 if(!input)return {status:'NOT_CONFIGURED',researchStarted:false};
 const relative=path.isAbsolute(input)?path.relative(root,input):input,config=JSON.parse(readFile(root,relative));
 if(!config.productionGenesis)return {status:'NOT_GENESIS',researchStarted:false};
 const g=JSON.parse(readFile(root,config.productionGenesis)),base=bundle(g);
 const manifest=JSON.parse(readFile(root,base+'/manifest.json')),c=deploymentContract(root,manifest,g.genesisHash);
 if(manifest.productionInput!==relative||manifest.genesis!==config.productionGenesis)fail('ACTIVE_INPUT_MISMATCH');
 const overlayRoot=safe(root,base+'/repository');
 for(const e of c.repository)match(overlayRoot,e);
 preflightDest(root,c.repository);
 const missing=c.repository.filter(e=>!fs.existsSync(safe(root,e.path)));
 if(missing.length&&!repair)fail('REPOSITORY_INPUTS_MISSING',missing.map(e=>e.path).join(','));
 if(repair)copyMissing(overlayRoot,root,c.repository);
 return {status:'READY',genesisHash:g.genesisHash,repositoryFiles:c.repository.length,restored:missing.length,researchStarted:false};
}
