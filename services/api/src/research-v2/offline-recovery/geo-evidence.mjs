// Experimental offline provenance only. Never opens a transport or accepts a
// task/plan country as proof that the response traversed that route.
import '../offline-replay/offline-guard.mjs';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {decodeCheckpointPayload} from '../../research-v1/checkpoint-objects.mjs';
const sha = value => createHash('sha256').update(value).digest('hex');
export function readHistoricalReference(ref, root = process.cwd()) {
  const file = path.resolve(root, ref.path);
  assert(file.startsWith(path.resolve(root) + path.sep), 'Reference outside repository');
  const record = JSON.parse(fs.readFileSync(file));
  const {hash, ...content} = record;
  assert.equal(sha(JSON.stringify(content)), hash, 'Journal record integrity');
  assert.equal(hash, ref.recordHash ?? ref.hash, 'Historical reference identity');
  let value = decodeCheckpointPayload(path.dirname(file), record.payload);
  for (const key of ref.pointer.slice(1).split('/').filter(Boolean)) value = value?.[key.replaceAll('~1', '/').replaceAll('~0', '~')];
  assert(value, 'Historical pointer missing');
  return value;
}
export function checkGeoChain({occurrence, bodyHash, attempt, sourcePage, executionReference}) {
  const o = occurrence, a = attempt, v = a?.transportVerification, reasons = [];
  const parentPath = o.record.pointer.replace(/\/page$/, '');
  const directParent = /\/attempts\/\d+\/page$/.test(o.record.pointer) &&
    executionReference?.path === o.record.path && executionReference?.pointer === parentPath &&
    executionReference?.recordHash === o.record.hash;
  const projectedId = sourcePage?.transportProof?.attemptId;
  if (!a) reasons.push(projectedId ? 'ORIGINAL_EXECUTION_NOT_LOCATED' : 'NO_GEO_ATTEMPT_ID');
  let receiptIndex = -1, beforeIndex = -1, afterIndex = -1;
  if (a) {
    if (!(directParent || projectedId === a.id)) reasons.push('SOURCE_TO_ATTEMPT_IDENTITY_MISSING');
    if (a.providerId !== 'decodo' || a.method !== 'APPROVED_PROXY' || a.mode !== 'SESSION' || a.outcome !== 'OBSERVED' || a.cleanup !== 'RELEASED' || !a.transportMetadata?.endpointHostname || !Number.isInteger(a.transportMetadata?.stickyPort)) reasons.push('EXECUTION_NOT_ESTABLISHED');
    if (v?.level !== 'BRACKET_VERIFIED' || v.providerId !== 'decodo' || v.bindingRef !== a.id || a.bindingRef !== a.id || v.equality !== true || v.continuity !== 'NO_OBSERVED_CHANGE' || !Array.isArray(v.conflicts) || v.conflicts.length) reasons.push('BRACKET_NOT_ESTABLISHED');
    if (a.targetCountry !== o.market || v?.targetCountry !== o.market) reasons.push('GEO_COUNTRY_MISMATCH');
    for (const side of ['before', 'after']) {
      const e = v?.[side], z = e?.evidence;
      try {
        const raw = JSON.parse(z.text);
        if (e.status !== 'MATCH' || e.country !== o.market || raw.success !== true || raw.country_code !== o.market || raw.ip !== e.address || sha(z.text) !== z.bodySha256 || z.bindingRef !== a.id) throw Error();
      } catch { reasons.push(side.toUpperCase() + '_RAW_GEO_PROOF_INVALID'); }
    }
    if (v?.before?.address !== v?.after?.address) reasons.push('EXIT_CHANGED');
    const rr = a.receipts ?? [];
    receiptIndex = rr.findIndex(r => r.bodySha256 === bodyHash && r.url === o.url);
    if (receiptIndex < 0) reasons.push('EXACT_RESPONSE_RECEIPT_MISSING');
    const match = (r, side) => r.url === v?.[side]?.evidence?.url && r.bodySha256 === v?.[side]?.evidence?.bodySha256;
    beforeIndex = rr.findIndex((r, i) => i < receiptIndex && match(r, 'before'));
    afterIndex = rr.findIndex((r, i) => i > receiptIndex && match(r, 'after'));
    if (beforeIndex < 0 || afterIndex < 0) reasons.push('RESPONSE_NOT_BRACKETED_IN_RECEIPT_ORDER');
    const used = [rr[beforeIndex], rr[receiptIndex], rr[afterIndex]];
    if (used.some(r => !r || r.bindingRef !== a.id || r.bindingChanged !== false || r.destinationMode !== 'PINNED_CONNECT' || !r.continuityRef) || new Set(used.map(r => r?.continuityRef)).size !== 1) reasons.push('RECEIPT_BINDING_CONTINUITY_MISSING');
    if (a.page?.sourceIntegrity?.sha256 !== bodyHash || a.page?.url !== o.url || sourcePage?.sourceIntegrity?.sha256 !== bodyHash || sourcePage?.url !== o.url || a.page?.outcome !== 'OK' || v?.target?.outcome !== 'OK' || v?.target?.finalUrl !== o.url) reasons.push('ATTEMPT_PAGE_BODY_MISMATCH');
  }
  return {
    version: 1, occurrenceId: o.id, targetCountry: o.market, bodyHash,
    sourceUrl: o.url, sourceReference: o.record,
    classification: reasons.length ? (a || projectedId ? 'G2' : 'G3') : 'G1',
    reasons, attemptId: a?.id ?? projectedId ?? null, executionReference: executionReference ?? null,
    geoCountry: v?.targetCountry ?? null,
    transport: a ? {providerId: a.providerId, method: a.method, mode: a.mode,
      endpointHostname: a.transportMetadata?.endpointHostname, stickyPort: a.transportMetadata?.stickyPort,
      bindingRef: a.bindingRef} : null,
    receiptIndexes: {before: beforeIndex, response: receiptIndex, after: afterIndex},
    geoProofHashes: {before: v?.before?.evidence?.bodySha256 ?? null, after: v?.after?.evidence?.bodySha256 ?? null},
    checkedAt: a?.checkedAt ?? null,
    meaning: 'Offer observed in a provider response acquired through the independently bracket-verified target-country route; NOT a provider declaration of offer country.',
    limitation: 'Same observed exit before/after on one approved sticky binding; not cryptographic per-hop proof; transient unobserved rotations cannot be excluded.'
  };
}
// Index supplies locators, never trusted classifications. Re-open hash-checked
// original records and validate each chain for this run. No credentials copied.
export function resolveGeoOccurrence(occurrence, bodyHash, indexRows, root = process.cwd()) {
  const sourcePage = readHistoricalReference(occurrence.record, root);
  const row = indexRows.get(occurrence.id);
  let ref = row?.executionReferences?.[0] ?? null;
  if (!ref && /\/attempts\/\d+\/page$/.test(occurrence.record.pointer)) ref = {
    path: occurrence.record.path, recordHash: occurrence.record.hash,
    pointer: occurrence.record.pointer.replace(/\/page$/, '')
  };
  const attempt = ref ? readHistoricalReference(ref, root) : null;
  return checkGeoChain({occurrence, bodyHash, attempt, sourcePage, executionReference: ref});
}
