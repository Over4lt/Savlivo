// Offline bridge from explicit ownership reviews to the existing target.authorities model.
// This does not discover domains, infer availability, or establish pricing evidence.
import fs from 'node:fs';
import path from 'node:path';
import {hash} from './candidate-universe.mjs';
import {normalizeFrontierUrl} from '../live/source-frontier.mjs';
import {nativeAuthorityEvidence} from './native-authority-evidence.mjs';

export function prepareAuthorityUniverse({universe, targets, document, root = process.cwd(), existingDomains = []}) {
  const candidates = [...universe.new_include, ...universe.research];
  const services = new Map(candidates.map(s => [s.slug, s]));
  if (services.size !== candidates.length || document.schemaVersion !== 1 || document.scope !== 'SHADOW_RESEARCH_ONLY') throw Error('AUTHORITY_REVIEW_SCHEMA');
  if (new Set(targets.map(t => t.id)).size !== targets.length) throw Error('AUTHORITY_DUPLICATE_TARGET');
  const evidenceCache = new Map(), keys = new Set();
  for (const b of document.bindings) {
    const service = services.get(b.service), url = normalizeFrontierUrl(b.entryUrl);
    if (!service || b.serviceName !== service.name || b.review?.status !== 'REVIEWED' || !b.review.reason || !Number.isFinite(Date.parse(b.review.checkedAt))) throw Error('AUTHORITY_REVIEW_REQUIRED');
    // Partners need the existing qualified-partner proof workflow. Never relabel them.
    if (b.bindingType !== 'DIRECT_PROVIDER' || !['OFFICIAL_PROVIDER', 'OFFICIAL_SUPPORT'].includes(b.sourceType)) throw Error('AUTHORITY_DIRECT_PROVIDER_REQUIRED');
    if (!url.url || new URL(b.entryUrl).protocol !== 'https:' || url.hostname !== b.hostname || b.hostname !== b.hostname.toLowerCase() || b.hostname.includes('*')) throw Error('AUTHORITY_HOST_MISMATCH');
    if (b.authorityScope !== 'DOMAIN_IDENTITY_ONLY_NOT_PRICE_OR_MARKET' || !['OFFICIAL_SERVICE_SITE', 'OFFICIAL_PROVIDER_LINK'].includes(b.basis)) throw Error('AUTHORITY_SCOPE_REQUIRED');
    if (b.marketScope !== null && (!Array.isArray(b.marketScope) || !b.marketScope.length || b.marketScope.some(m => !service.markets.includes(m)))) throw Error('AUTHORITY_MARKET_SCOPE');
    const key = b.service + '|' + b.hostname;
    if (keys.has(key)) throw Error('AUTHORITY_DUPLICATE_BINDING');
    keys.add(key);
    if (!b.evidence?.length) throw Error('AUTHORITY_EVIDENCE_REQUIRED');
    const evidenceHosts = [];
    for (const e of b.evidence) {
      const file = path.resolve(root, e.path);
      if (!file.startsWith(path.resolve(root) + path.sep)) throw Error('AUTHORITY_EVIDENCE_PATH');
      if (!evidenceCache.has(file)) evidenceCache.set(file, fs.readFileSync(file));
      const bytes = evidenceCache.get(file);
      if (hash(bytes) !== e.sha256) throw Error('AUTHORITY_EVIDENCE_HASH_MISMATCH');
      const saved = JSON.parse(bytes);
      if(e.format==='NATIVE_PUBLIC_PAGE_V1') {
        evidenceHosts.push(nativeAuthorityEvidence({root,file,saved,evidence:e}).hostname);
        continue;
      }
      const body = typeof saved === 'string' ? saved : saved.result;
      const page = typeof body === 'string' ? body.split(/-{20,}/).find(p => p.includes('Source: open({"ref_id":' + JSON.stringify(e.sourceUrl))) : null;
      if (!page || !e.locator || !e.excerpt || !page.includes(e.excerpt) || !/Content type: (?:text\/html|application\/pdf)/.test(page)) throw Error('AUTHORITY_EVIDENCE_LOCATOR');
      const header = page.split('\n').find(l => l.includes('Source: open('));
      const final = header.match(/Redirected to URL: ([^;]+);/)?.[1] ?? e.sourceUrl;
      evidenceHosts.push(new URL(final).hostname);
    }
    if (b.basis === 'OFFICIAL_SERVICE_SITE' && !evidenceHosts.includes(b.hostname)) throw Error('AUTHORITY_SOURCE_HOST_MISMATCH');
    if (b.basis === 'OFFICIAL_PROVIDER_LINK' && !b.evidence.some(e => e.excerpt.includes(b.hostname))) throw Error('AUTHORITY_EXPLICIT_LINK_REQUIRED');
  }
  const scoped = t => document.bindings.filter(b => b.service === t.service && (b.marketScope === null || b.marketScope.includes(t.market)));
  const annotatedTargets = targets.map(t => {
    const service = services.get(t.service);
    const serviceLevel=t.market===null&&t.researchObjective==='CATALOG_ONLY';
    if (!service || service.name !== t.serviceName || (!serviceLevel&&!service.markets.includes(t.market)) || t.scope !== service.disposition) throw Error('AUTHORITY_TARGET_IDENTITY_MISMATCH');
    if (t.authorities?.length || t.urls?.length) throw Error('AUTHORITY_BASE_TARGETS_MUST_BE_UNBOUND');
    return {...t, urls: scoped(t).map(b => b.entryUrl), authorities: scoped(t).map(b => ({hostname:b.hostname, provider:t.serviceName, sourceType:b.sourceType, sourceUrl:b.entryUrl, checkedAt:b.review.checkedAt, ownershipReview:{bindingType:b.bindingType, authorityScope:b.authorityScope, basis:b.basis, review:b.review, evidence:b.evidence}}))};
  });
  const launchTargets = annotatedTargets.filter(t => t.authorities.length);
  const blockedTargets = annotatedTargets.filter(t => !t.authorities.length).map(t => ({targetId:t.id, service:t.service, market:t.market, status:'BLOCKED_PROVIDER_AUTHORITY', retryable:true, reason:'No reviewed ownership binding applicable to this target; retry after a new reviewed preflight, never by disabling the gate.'}));
  const dispositions = candidates.map(s => {
    const bindings = document.bindings.filter(b => b.service === s.slug);
    const ready = launchTargets.filter(t => t.service === s.slug), blocked = blockedTargets.filter(t => t.service === s.slug);
    const reused = bindings.filter(b => existingDomains.some(d => d.validated && d.hostname === b.hostname));
    return {service:s.slug, name:s.name, universeDisposition:s.disposition, category:s.category, targetMarkets:s.markets, targetCount:ready.length+blocked.length, authorityDisposition:ready.length ? (reused.length ? 'READY_EXISTING_PROVIDER_REUSE' : 'READY_DIRECT_PROVIDER') : 'UNRESOLVED_AUTHORITY', bindingType:ready.length ? 'DIRECT_PROVIDER' : null, reviewedBindings:bindings, existingProviderReuse:reused.map(b => ({hostname:b.hostname, priorServices:[...new Set(existingDomains.filter(d => d.validated && d.hostname === b.hostname).map(d => d.service))], newProductRelationshipIndependentlyReviewed:true})), readyTargets:ready.map(t => t.id), blockedTargets:blocked.map(t => t.targetId), reason:ready.length ? 'Explicit ownership review admitted through existing exact-service/exact-host authority; availability and commercial fields remain unproven.' : 'Retained leads and bounded official-page review did not establish a launchable ownership binding.'};
  });
  return {annotatedTargets, launchTargets, blockedTargets, dispositions};
}

export function validateAuthorityPartition({allTargets, launchTargets, blockedTargets}) {
  const all = new Map(allTargets.map(t => [t.id,t]));
  const ids = [...launchTargets.map(t => t.id), ...blockedTargets.map(t => t.targetId)];
  if (all.size !== allTargets.length || ids.length !== all.size || new Set(ids).size !== all.size || ids.some(id => !all.has(id))) throw Error('AUTHORITY_PARTITION_INCOMPLETE');
  for (const t of launchTargets) if (!t.authorities?.length || JSON.stringify(t) !== JSON.stringify(all.get(t.id))) throw Error('AUTHORITY_LAUNCH_TARGET_CHANGED');
  for (const b of blockedTargets) if (!b.retryable || b.status !== 'BLOCKED_PROVIDER_AUTHORITY' || all.get(b.targetId).authorities?.length || b.service !== all.get(b.targetId).service || b.market !== all.get(b.targetId).market) throw Error('AUTHORITY_BLOCKED_TARGET_CHANGED');
  return true;
}
