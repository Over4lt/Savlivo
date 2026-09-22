// A bounded body locator into an already hash-verified active journal object store.
// Does not create evidence, alter body hashes, or authorize acquisition.
import assert from 'node:assert/strict';
import {readFileSync,lstatSync,existsSync,realpathSync} from 'node:fs';
import {join,resolve,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {legacyArchiveRoot,assertNoSymlinkAncestors} from './active-state.mjs';
const sha=s=>createHash('sha256').update(s).digest('hex');
export function referenceRetainedBody(page,directory){
 if(!page.rawSource?.text||Buffer.byteLength(page.rawSource.text)<32768)return page;
 const text=page.rawSource.text,raw=JSON.stringify(text),hash=sha(raw),path=join(directory,'.objects',hash+'.json');
 // Legacy inline journals keep the original bounded whole-page behavior.
 if(!existsSync(path))return page;
 const ref={version:1,directory:realpathSync(directory),sha256:hash,bodyHash:sha(text),bytes:Buffer.byteLength(text)};
 assert.equal(ref.bodyHash,page.sourceIntegrity?.sha256,'Retained body/source hash mismatch');
 const projected={...page,rawSource:{...page.rawSource},retainedBodyReference:ref};delete projected.rawSource.text;
 hydrateRetainedBody(projected);return projected;
}
export function hydrateRetainedBody(page){
 const r=page.retainedBodyReference;if(!r)return page;
 assert.deepEqual(Object.keys(r).sort(),['bodyHash','bytes','directory','sha256','version']);
 assert(r.version===1&&Number.isSafeInteger(r.bytes)&&r.bytes>0&&r.bytes<=10000000,'Bounded retained body required');
 assert(!resolve(r.directory).startsWith(legacyArchiveRoot+'/'),'Archived bodies are not active evidence');
 assert(/^[a-f0-9]{64}$/.test(r.sha256)&&r.bodyHash===page.sourceIntegrity?.sha256,'Retained body identity');
 assertNoSymlinkAncestors(r.directory);
 const path=join(r.directory,'.objects',r.sha256+'.json'),stat=lstatSync(path);
 assert(stat.isFile()&&!stat.isSymbolicLink()&&stat.size<=16000001,'Bounded immutable body required');
 const raw=readFileSync(path,'utf8').replace(/\n$/,'');assert.equal(sha(raw),r.sha256,'Retained body object corruption');const text=JSON.parse(raw);
 assert(typeof text==='string'&&Buffer.byteLength(text)===r.bytes&&sha(text)===r.bodyHash,'Retained source corruption');
 return {...page,rawSource:{...page.rawSource,text}};
}
export function lazyRetainedBody(page){
 if(!page.retainedBodyReference)return page;
 return {...page,get rawSource(){return hydrateRetainedBody(page).rawSource;}};
}
