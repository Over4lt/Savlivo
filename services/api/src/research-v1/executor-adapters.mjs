import assert from 'node:assert/strict';
import { isIP } from 'node:net';

export const freeStages = ['PUBLIC_SEARCH', 'OFFICIAL_PAGES', 'LOCALIZED_URL', 'LOCAL_LANGUAGE_SEARCH', 'SUPPORT', 'LOCAL_SESSION'];
export const researchDimensions = ['identity', 'availability', 'plans', 'prices', 'currency', 'plan', 'billingRoutes', 'startWeb', 'manageWeb', 'pauseWeb', 'cancelWeb', 'lifecycle'];
export const discoveryCategories = ['video', 'music', 'news', 'gaming', 'productivity', 'cloud', 'fitness', 'sports', 'books', 'other-recurring'];
export const defaultLimits = Object.freeze({ maxQueries: 12, maxSources: 24, maxLeads: 60, maxDepth: 2, maxRedirects: 4, maxObservations: 100, timeoutMs: 15000, maxResponseBytes: 200000 });
export function limitsFor(input = {}) {
  assert(Object.keys(input).every(k => k in defaultLimits), 'Unknown exploration limit');
  const limits = { ...defaultLimits, ...input };
  for (const [key, n] of Object.entries(limits)) assert(Number.isSafeInteger(n) && n > 0 && n <= (key==='maxResponseBytes'?8000000:1000000), `Invalid ${key}`);
  return limits;
}
export function publicUrl(value) {
  const u = new URL(value);
  assert(u.protocol === 'https:' && !u.username && !u.password && (!u.port || u.port === '443'), 'Public HTTPS URLs only');
  assert(!isIP(u.hostname) && !u.hostname.includes(':') && u.hostname.includes('.') && !/(^|\.)(localhost|local|internal|test|invalid)$/.test(u.hostname), 'Non-public destination');
  u.hash = ''; // Preserve query parameters: different storefronts/plans must not collapse.
  return u.href;
}
export function validateCost(cost) {
  assert(cost && ['UNKNOWN','NOT_CHARGED','KNOWN'].includes(cost.status), 'Explicit cost state required');
  if (cost.status === 'KNOWN') assert(typeof cost.amount === 'string' && /^(0|[1-9]\d*)(\.\d+)?$/.test(cost.amount) && /^[A-Z]{3}$/.test(cost.currency), 'Invalid known cost');
  else assert(cost.amount === null && cost.currency === null, 'Unknown/free costs must not invent amounts');
  return cost;
}
export const unknownCost = () => ({ status: 'UNKNOWN', amount: null, currency: null });
export const freeCost = () => ({ status: 'NOT_CHARGED', amount: null, currency: null });
export function validateFreeAdapter(adapter) {
  assert(adapter?.costClass === 'FREE' && typeof adapter.provider === 'string' && adapter.provider.trim(), 'Only explicit free adapters execute in v1');
  assert(typeof adapter.search === 'function' && typeof adapter.read === 'function', 'Search and read capabilities required');
}
export async function boundedCall(fn, request, limits) {
  const controller = new AbortController();
  let timer;
  try {
    const result = await Promise.race([
      Promise.resolve().then(() => fn({ ...request, signal: controller.signal })),
      new Promise((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error('Adapter timeout')); }, limits.timeoutMs); })
    ]);
    assert(Buffer.byteLength(JSON.stringify(result)) <= limits.maxResponseBytes, 'Adapter result too large');
    return result;
  } finally { clearTimeout(timer); controller.abort(); }
}
