import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

export const liveCampaignTrustRootKind='LIVE_CAMPAIGN_ROOT_V1';

export function createEvidenceTrustContext({liveRoot,liveRootId,historicalRoot=process.cwd()}){
 assert.equal(typeof liveRoot,'string','LIVE_EVIDENCE_TRUST_ROOT_REQUIRED');
 assert.equal(typeof liveRootId,'string','LIVE_EVIDENCE_TRUST_ROOT_ID_REQUIRED');
 assert(liveRootId.length>0,'LIVE_EVIDENCE_TRUST_ROOT_ID_REQUIRED');
 return Object.freeze({liveRoot:path.resolve(liveRoot),liveRootId,historicalRoot:path.resolve(historicalRoot)});
}

export function trustedRootForReference(ref,context){
 if(ref?.trustRoot!==undefined){
  assert.equal(ref.trustRoot?.kind,liveCampaignTrustRootKind,'UNSUPPORTED_EVIDENCE_TRUST_ROOT');
  assert(context&&typeof context==='object'&&!Array.isArray(context),'LIVE_EVIDENCE_TRUST_CONTEXT_REQUIRED');
  assert.equal(typeof context.liveRoot,'string','LIVE_EVIDENCE_TRUST_ROOT_REQUIRED');
  assert.equal(context.liveRootId,ref.trustRoot.id,'LIVE_EVIDENCE_TRUST_ROOT_MISMATCH');
  return fs.realpathSync(context.liveRoot);
 }
 const root=typeof context==='string'?context:context?.historicalRoot??process.cwd();
 assert.equal(typeof root,'string','HISTORICAL_EVIDENCE_TRUST_ROOT_REQUIRED');
 return fs.realpathSync(root);
}

export function resolveTrustedReference(ref,context){
 assert(ref&&typeof ref==='object','MALFORMED_EVIDENCE_REFERENCE');
 assert.equal(typeof ref.path,'string','MALFORMED_EVIDENCE_REFERENCE');
 assert(ref.path.length>0&&!ref.path.includes('\0'),'MALFORMED_EVIDENCE_REFERENCE');
 const root=trustedRootForReference(ref,context),candidate=path.resolve(root,ref.path);
 assert(candidate!==root&&candidate.startsWith(root+path.sep),'REFERENCE_OUTSIDE_TRUSTED_ROOT');
 const file=fs.realpathSync(candidate);
 assert(file!==root&&file.startsWith(root+path.sep),'REFERENCE_OUTSIDE_TRUSTED_ROOT');
 const stat=fs.lstatSync(candidate);
 assert(stat.isFile()&&!stat.isSymbolicLink(),'EVIDENCE_REFERENCE_NOT_REGULAR_FILE');
 return file;
}
