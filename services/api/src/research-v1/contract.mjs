import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

// Side-effect-free apart from reading this local contract; no runtime or network imports.
const schema = JSON.parse(readFileSync(new URL('research-item.schema.json', import.meta.url), 'utf8'));
export const factNames = Object.keys(schema.properties.facts.properties);
export const emptyFacts = () => Object.fromEntries(schema.properties.facts.required.map(name => [name, { status: 'UNKNOWN', value: null, evidenceIds: [] }]));
// Opt-in claim policy uses scope-specific conflicts. Historical dimension conflicts stay unchanged.
export function findingScope(fact,v) {
  if(!['prices','plans','billingRoutes','identityRelations'].includes(fact))return fact;
  if(!v)return null;
  if(fact==='prices')return JSON.stringify([v.plan,v.cadence,v.cadenceDescription,v.currency,v.billingRoute,v.billingProvider,v.offerType,v.taxTreatment]);
  if(fact==='plans')return JSON.stringify([v.name,v.cadence,v.cadenceDescription,v.billingRoute,v.offering]);
  if(fact==='billingRoutes')return JSON.stringify([v.channel,v.provider]);
  if(fact==='identityRelations')return JSON.stringify([v.kind,v.serviceName]);
  return fact;
}

// Implements only keywords used by the checked-in v1 schema. No dependencies.
function check(value, rule, path) {
  if (rule.anyOf) {
    assert(rule.anyOf.some(option => { try { check(value, option, path); return true; } catch { return false; } }), `${path}: invalid union`);
    return;
  }
  if (rule.enum) assert(rule.enum.includes(value), `${path}: invalid enum`);
  if (rule.type) {
    assert(rule.type === 'null' ? value === null : rule.type === 'array' ? Array.isArray(value)
      : rule.type === 'integer' ? Number.isInteger(value)
      : rule.type === 'object' ? value !== null && typeof value === 'object' && !Array.isArray(value)
      : typeof value === rule.type, `${path}: invalid type`);
  }
  if (rule.type === 'object') {
    for (const key of rule.required) assert(Object.hasOwn(value, key), `${path}.${key}: missing`);
    for (const key of Object.keys(value)) {
      assert(Object.hasOwn(rule.properties, key), `${path}.${key}: unexpected field`);
      check(value[key], rule.properties[key], `${path}.${key}`);
    }
  }
  if (rule.type === 'array') value.forEach((v, i) => check(v, rule.items, `${path}[${i}]`));
  if (rule.minLength) assert(value.length >= rule.minLength && value.trim(), `${path}: empty`);
  if (rule.pattern) assert(new RegExp(rule.pattern).test(value), `${path}: invalid format`);
  if (rule.minimum !== undefined) assert(value >= rule.minimum, `${path}: below minimum`);
  if (rule.maximum !== undefined) assert(value <= rule.maximum, `${path}: above maximum`);
}
export function timestamp(value) {
  assert(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) && new Date(value).toISOString() === value, 'Use an actual UTC ISO timestamp');
}
function url(value) {
  const parsed = new URL(value);
  assert(parsed.protocol === 'https:' && !parsed.username && !parsed.password, 'Evidence/flow URLs must be HTTPS without credentials');
}
export function validateItem(item) {
  check(item, schema, 'item');
  if (item.taskType === 'DISCOVERY') assert(item.serviceName === null && item.canonicalSlug === null, 'Discovery is a market census, not an invented service');
  else assert(item.serviceName, 'Verification needs a named lead');
  for (const value of [item.createdAt, item.updatedAt, ...Object.values(item.freshness)]) if (value !== null) timestamp(value);
  const evidence = new Map(item.evidence.map(e => [e.id, e]));
  assert(evidence.size === item.evidence.length, 'Duplicate evidence ID');
  for (const e of item.evidence) {
    url(e.sourceUrl); timestamp(e.checkedAt); if (e.revalidateAt) timestamp(e.revalidateAt);
    assert(e.countryCodes.includes(item.countryCode), 'Evidence must explicitly include the researched market');
    assert(e.supports.length > 0, 'Evidence must identify supported facts');
  }
  const support = (ids, name) => {
    assert(ids.length > 0 && new Set(ids).size === ids.length, `${name}: evidence required/unique`);
    return ids.map(id => {
      const e = evidence.get(id);
      assert(e && e.supports.includes(name), `${name}: evidence reference does not support this fact`);
      return e;
    });
  };
  for (const [name, fact] of Object.entries(item.facts)) {
    if (['UNKNOWN', 'REVIEW_REQUIRED'].includes(fact.status)) {
      assert(fact.value === null, `${name}: unresolved facts cannot carry asserted values`);
      if (fact.evidenceIds.length) support(fact.evidenceIds, name);
      continue;
    }
    const sources = support(fact.evidenceIds, name);
    if (fact.status === 'VERIFIED_NEGATIVE') {
      if (name === 'pauseWeb') assert(sources.some(e => ['OFFICIAL_PROVIDER','OFFICIAL_SUPPORT'].includes(e.sourceType)), 'Pause not-offered requires explicit provider evidence');
      assert(['availability', 'startWeb', 'manageWeb', 'cancelWeb', 'pauseWeb'].includes(name), 'Negative status only applies to availability/web flows');
      assert(name === 'availability' ? fact.value === 'UNAVAILABLE' : fact.value === null, 'Negative assertion has invalid value');
    } else {
      assert(fact.value !== null && (!Array.isArray(fact.value) || fact.value.length > 0), `${name}: verified fact needs a value`);
      if (name === 'availability') assert(fact.value === 'AVAILABLE');
      if (['startWeb', 'manageWeb', 'cancelWeb', 'pauseWeb'].includes(name)) {
        url(fact.value);
        assert(sources.some(e => ['OFFICIAL_PROVIDER', 'OFFICIAL_SUPPORT'].includes(e.sourceType)), 'Web flows require provider evidence');
      }
      if (name === 'ordinaryRecurringPrice') for (const price of fact.value) {
        const priceSources = support(price.evidenceIds, name);
        assert(price.evidenceIds.every(id => fact.evidenceIds.includes(id)), 'Price evidence must also be linked to price fact');
        assert(priceSources.some(e => (price.billingRoute === 'DIRECT'
          ? ['OFFICIAL_PROVIDER', 'OFFICIAL_SUPPORT'] : ['OFFICIAL_PROVIDER', 'OFFICIAL_SUPPORT', 'OFFICIAL_OPERATOR', 'OFFICIAL_STORE']).includes(e.sourceType)), 'Price requires channel-appropriate official evidence');
      }
    }
  }
  if (item.evidence.length) assert(item.freshness.lastCheckedAt === item.evidence.map(e => e.checkedAt).sort().at(-1), 'Freshness must match latest actual evidence check');
  validateExtended(item, evidence, support);
  if(item.researchStatus==='INTEGRATION_READY') {
    assert(['availability','startWeb','cancelWeb'].every(f=>item.facts[f].status==='VERIFIED'),'Required integration claims must verify');
    assert(!item.conflicts.some(c=>c.resolutionStatus==='OPEN'&&c.facts.some(f=>['availability','startWeb','cancelWeb'].includes(f))));
    assert(item.reviewStatus==='NOT_REQUIRED');
  }
  if(item.reviewStatus==='NOT_REQUIRED')assert(item.researchStatus==='INTEGRATION_READY');
  return item;
}

export function contactDigest(contact) {
  return createHash('sha256').update(JSON.stringify([contact.recipient, contact.recipientSourceUrl,
    contact.subject, contact.body, contact.language, contact.requestedFacts])).digest('hex');
}
function validateExtended(item, evidence, support) {
  const assertRefs = ids => { for (const id of ids) assert(evidence.has(id), 'Unknown evidence reference'); };
  for (const e of item.evidence) if (e.revalidateAt) assert(e.revalidateAt >= e.checkedAt, 'Revalidation precedes observation');
  for (const [name, fact] of Object.entries(item.facts)) {
    if (fact.status.startsWith('VERIFIED')) assert(fact.evidenceIds.every(id => !['DISPUTED', 'STALE'].includes(evidence.get(id).evidenceStatus)), 'Stale/disputed evidence cannot verify facts');
    if (name === 'lifecycle' && fact.value?.effectiveAt) timestamp(fact.value.effectiveAt);
  }
  for (const name of ['plans', 'prices', 'billingRoutes', 'identityRelations']) for (const finding of item[name]) {
    assert(finding.status !== 'VERIFIED_NEGATIVE', 'Use explicit negative lifecycle/availability facts');
    if (['UNKNOWN', 'REVIEW_REQUIRED'].includes(finding.status)) {
      assert(finding.value === null, 'Unresolved observations belong in evidence, not asserted values');
      if (finding.evidenceIds.length) support(finding.evidenceIds, name);
      continue;
    }
    assert(finding.value !== null, 'Verified finding requires value');
    const sources = support(finding.evidenceIds, name);
    assert(sources.every(e => !['DISPUTED', 'STALE'].includes(e.evidenceStatus)), 'Unresolved evidence');
    if (name === 'prices') {
      const p = finding.value;
      assert(sources.some(e => (p.billingRoute === 'DIRECT' ? ['OFFICIAL_PROVIDER','OFFICIAL_SUPPORT'] : ['OFFICIAL_PROVIDER','OFFICIAL_SUPPORT','OFFICIAL_OPERATOR','OFFICIAL_STORE']).includes(e.sourceType)), 'Channel-specific official price evidence required');
      if (p.offerType === 'UNKNOWN_EFFECTIVE') assert(p.amount === null, 'Unknown bundle price stays unknown');
      else assert(p.amount !== null, 'Observed price requires an amount');
    }
    if (name === 'identityRelations') assert(finding.value.kind !== 'POSSIBLE_ALIAS', 'Possible alias remains review required');
    if (name === 'billingRoutes' && finding.value.url) url(finding.value.url);
  }
  const geoIds = new Set();
  for (const geo of item.geoObservations) {
    assert(!geoIds.has(geo.id)); geoIds.add(geo.id);
    assert.equal(geo.targetMarket, item.countryCode, 'Geo market mismatch');
    timestamp(geo.checkedAt); url(geo.observedUrl); geo.redirects.forEach(url); assertRefs(geo.corroboratingEvidenceIds);
  }
  for (const conflict of item.conflicts) {
    timestamp(conflict.detectedAt); assert(conflict.evidenceIds.length > 0); assertRefs(conflict.evidenceIds); assertRefs(conflict.resolutionEvidenceIds);
    assert(conflict.facts.length > 0 && conflict.facts.every(f => [...factNames,'plans','prices','billingRoutes','identityRelations'].includes(f)));
    if(conflict.scope!==undefined){
      assert(conflict.facts.length===1&&['plans','prices','billingRoutes','identityRelations'].includes(conflict.facts[0]));
      for(const id of conflict.evidenceIds){
        const e=evidence.get(id),fact=conflict.facts[0];
        assert(e.supports.includes(fact)&&findingScope(fact,JSON.parse(e.observedValue))===conflict.scope,'Conflict scope must match every referenced observation');
      }
    }
    if (conflict.resolutionStatus === 'OPEN') {
      assert(item.reviewStatus !== 'HUMAN_REVIEWED' && item.researchStatus !== 'RESOLVED', 'Open conflict cannot be resolved');
      for (const f of conflict.facts) {
        const findings = item.facts[f] ? [item.facts[f]] : item[f];
        if(conflict.scope!==undefined){
          assert(['plans','prices','billingRoutes','identityRelations'].includes(f)&&conflict.facts.length===1);
          assert(findings.every(finding=>!finding.status.startsWith('VERIFIED')||findingScope(f,finding.value)!==conflict.scope),'Conflicting scoped claims require review');
        }else assert(findings.every(finding => !finding.status.startsWith('VERIFIED')), 'Conflicting facts require review');
      }
    } else assert(conflict.resolutionEvidenceIds.length > 0, 'Conflict resolution requires evidence');
  }
  if (item.discovery) { assert(item.discovery.sourceUrls.length > 0); item.discovery.sourceUrls.forEach(url); }
  const c = item.providerContact;
  if (['PROVIDER_CONTACT_REQUIRED','MESSAGE_DRAFTED','APPROVAL_REQUIRED','SENT','AWAITING_REPLY','REPLY_RECEIVED'].includes(item.researchStatus) || item.taskType === 'PROVIDER_CONTACT') assert(c, 'Contact state requires case');
  if (c) {
    assert(c.requestedFacts.length > 0 && c.requestedFacts.every(f => [...factNames,'plans','prices','billingRoutes','identityRelations'].includes(f)));
    if (c.recipient) { assert(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.recipient)); assert(c.recipientSourceUrl, 'Recipient needs official source'); url(c.recipientSourceUrl); }
    c.replyLinks.forEach(url); assertRefs(c.resultingEvidenceIds);
    if (c.approvalState === 'APPROVED') {
      assert(c.approval && c.recipient, 'Approval needs recipient and operator record');
      timestamp(c.approval.approvedAt); assert.equal(c.approval.messageSha256, contactDigest(c), 'Approval does not match exact draft');
    } else assert(c.approval === null, 'Unapproved case cannot hold approval');
    if (c.sentAt !== null || ['SENT','AWAITING_REPLY','REPLY_RECEIVED'].includes(item.researchStatus)) {
      assert(c.approvalState === 'APPROVED' && c.sentAt, 'Sent contact requires approval');
      timestamp(c.sentAt); assert(c.sentAt >= c.approval.approvedAt, 'Sent before approval');
    }
    if (item.researchStatus === 'REPLY_RECEIVED') assert(c.replyLinks.length > 0, 'Reply linkage required');
  }
}
