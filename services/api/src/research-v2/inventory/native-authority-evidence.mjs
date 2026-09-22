// Evidence-format adapter only. An explicit ownership review is still mandatory.
// Native public acquisitions are not converted into fictitious web-tool responses.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
const sha=b=>createHash('sha256').update(b).digest('hex');
export function nativeAuthorityEvidence({root,file,saved,evidence:e}) {
  if(e.format!=='NATIVE_PUBLIC_PAGE_V1'||!Array.isArray(saved)||!Number.isInteger(e.pageIndex))throw Error('AUTHORITY_NATIVE_SCHEMA');
  const p=saved[e.pageIndex];
  if(!p||!/^text\/html(?:;|$)|^application\/xhtml\+xml(?:;|$)/i.test(p.contentType??'')||p.outcome!=='OK'||p.httpStatus!==200||p.url!==e.sourceUrl||!Number.isFinite(Date.parse(p.checkedAt))||!/^bodies\/[a-f0-9]{64}\.txt$/.test(p.bodyFile??''))throw Error('AUTHORITY_NATIVE_PAGE');
  if(!p.accessDecisions?.length||p.accessDecisions.some(d=>!['ALLOWED','NO_ROBOTS_POLICY'].includes(d.decision)))throw Error('AUTHORITY_NATIVE_POLICY');
  const bodyFile=path.resolve(path.dirname(file),p.bodyFile),base=fs.realpathSync(root);
  if(!fs.realpathSync(bodyFile).startsWith(base+path.sep))throw Error('AUTHORITY_EVIDENCE_PATH');
  const body=fs.readFileSync(bodyFile,'utf8');
  if(sha(body)!==p.bodyHash||p.sourceIntegrity?.sha256!==p.bodyHash)throw Error('AUTHORITY_NATIVE_BODY_HASH');
  if(!Number.isInteger(e.locator?.offset)||e.locator.offset<0||typeof e.excerpt!=='string'||!e.excerpt.trim()||body.slice(e.locator.offset,e.locator.offset+e.excerpt.length)!==e.excerpt)throw Error('AUTHORITY_EVIDENCE_LOCATOR');
  const u=new URL(p.url);if(u.protocol!=='https:'||u.username||u.password)throw Error('AUTHORITY_NATIVE_URL');
  return {hostname:u.hostname,page:p,body,bodyFile};
}
