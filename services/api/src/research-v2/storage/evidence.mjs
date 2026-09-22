import fs from 'node:fs';
import {sha,safe,immutable,canonical,read,verifySeal,sealed,stableBytes} from './core.mjs';
export function putEvidence(root,{bytes,observation,observationId,expectedHash}){
 const body=Buffer.from(bytes),hash=sha(body);if(expectedHash&&expectedHash!==hash)throw Error('STORAGE_BLOB_HASH');
 if(!/^[a-zA-Z0-9_-]{1,160}$/.test(observationId??''))throw Error('STORAGE_OBSERVATION_ID');
 const blob=`blobs/sha256/${hash.slice(0,2)}/${hash}`,reference={schema:'V2_BLOB_V1',path:blob,sha256:hash,bytes:body.length};
 immutable(safe(root,blob),body);
 const record=sealed({schema:'V2_EVIDENCE_OBSERVATION_V1',id:observationId,blob:reference,observation});
 immutable(safe(root,`observations/${observationId}.json`),canonical(record));return record;
}
export function resolveEvidence(root,reference){
 if(!['V2_BLOB_V1','V2_LEGACY_BYTES_V1'].includes(reference?.schema))throw Error('STORAGE_UNKNOWN_REFERENCE');
 const bytes=stableBytes(safe(root,reference.path));if(sha(bytes)!==reference.sha256||(reference.bytes!==undefined&&bytes.length!==reference.bytes))throw Error('STORAGE_BLOB_HASH');return bytes;
}
export function readObservation(root,id){const record=verifySeal(read(safe(root,`observations/${id}.json`)),'V2_EVIDENCE_OBSERVATION_V1');resolveEvidence(root,record.blob);return record;}
