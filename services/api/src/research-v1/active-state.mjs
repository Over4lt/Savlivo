// Canonical operator storage boundary; journal/object formats remain unchanged.
import assert from 'node:assert/strict';
import {existsSync,lstatSync} from 'node:fs';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
export const repositoryRoot=fileURLToPath(new URL('../../../../',import.meta.url));
export const activeResearchRoot=join(repositoryRoot,'.savlivo/research-v1/active');
export const legacyResearchRoot=join(repositoryRoot,'docs/catalog/global-47/research-v1');
export const legacyArchiveRoot=join(repositoryRoot,'archive/research-v1-legacy');
export function assertNoSymlinkAncestors(path){
 for(let p=resolve(path);;p=dirname(p)){if(existsSync(p))assert(!lstatSync(p).isSymbolicLink(),'Runtime state symlink rejected');if(dirname(p)===p)break;}
}
export function activeRunDirectory(runId){assert(typeof runId==='string'&&/^[\w:-]{1,120}$/.test(runId),'Invalid run identity');return join(activeResearchRoot,runId);}
export function assertActiveRunDirectory(directory){assert.equal(dirname(resolve(directory)),activeResearchRoot,'Operator runs require canonical active root');assertNoSymlinkAncestors(directory);return resolve(directory);}
