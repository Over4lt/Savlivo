import {createHash} from 'node:crypto';

export const STATUSES = Object.freeze(['V4_VERIFIED', 'REVIEW_REQUIRED', 'NOT_MONTHLY_RECURRING', 'SOURCE_UNAVAILABLE']);
export const SOURCE_STATUSES = Object.freeze(['SOURCE_CONFIRMED', 'SOURCE_PARTIAL', 'AI_SUGGESTED_ONLY', 'SOURCE_CONFLICT']);
const GENERIC_PROVIDER_WORDS = new Set(['premium','plus','music','video','fitness','app','service','subscriptions','subscription']);
const MONTHLY = /(?:\/\s*(?:month|mo\.?|monat)|per\s+month|pro\s+monat|monthly|monatlich|every\s+month|each\s+month)/i;
const ANNUAL = /(?:billed|charged|paid|payable)?\s*(?:annually|yearly|per\s+year|pro\s+jahr|jährlich|annual(?:ly)?\s+billing|yearly\s+billing)/i;

const normalize = value => String(value ?? '').normalize('NFKC').replace(/\s+/g, ' ').trim();
const compact = value => normalize(value).toLowerCase().replace(/[^a-z0-9]/g, '');
const escapeRegex = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function plausibleFirstParty(providerName, rawUrl) {
  let host;
  try { host = new URL(rawUrl).hostname.toLowerCase().replace(/^www\./, ''); } catch { return false; }
  const hostCompact = compact(host);
  const providerCompact = compact(providerName);
  const tokens = normalize(providerName).toLowerCase().split(/[^a-z0-9]+/).filter(x => x.length >= 4 && !GENERIC_PROVIDER_WORDS.has(x));
  return hostCompact.includes(providerCompact) || tokens.some(token => hostCompact.includes(token));
}

export function marketSupported(targetMarket, source) {
  const market = normalize(targetMarket).toUpperCase();
  if (source.market === market && normalize(source.marketEvidence)) return true;
  let url;
  try { url = new URL(source.finalUrl || source.url); } catch { return false; }
  const path = `${url.pathname}${url.search}`.toLowerCase();
  if (url.hostname.toLowerCase().endsWith(`.${market.toLowerCase()}`)) return true;
  if (new RegExp(`(?:^|[\/_?&=-])${market.toLowerCase()}(?:$|[\/_&=-])`).test(path)) return true;
  const body = normalize(source.body);
  const explicit = {
    DE: /\b(?:Deutschland|Germany|German market|für Deutschland)\b/i,
    NO: /\b(?:Norge|Norway|Norwegian market|for Norge)\b/i,
    GB: /\b(?:United Kingdom|Great Britain|UK market)\b/i,
    US: /\b(?:United States|USA|US market)\b/i
  }[market];
  return explicit ? explicit.test(body) : false;
}

function amountVariants(amount) {
  const number = Number(amount);
  if (!Number.isFinite(number)) return [];
  const fixed = number.toFixed(2);
  const plain = Number.isInteger(number) ? String(number) : String(number);
  return [...new Set([fixed, fixed.replace('.', ','), plain, plain.replace('.', ',')])];
}

function currencyPattern(currency) {
  const code = normalize(currency).toUpperCase();
  const symbols = {EUR: ['€','EUR'], USD: ['\\$','USD','US\\$'], GBP: ['£','GBP'], NOK: ['NOK','kr']};
  return (symbols[code] || [escapeRegex(code)]).join('|');
}

function findPrice(body, amount, currency) {
  const variants = amountVariants(amount).map(escapeRegex).join('|');
  if (!variants) return null;
  const money = new RegExp(`(?:${currencyPattern(currency)})\\s*(?:${variants})|(?:${variants})\\s*(?:${currencyPattern(currency)})`, 'i');
  const match = money.exec(body);
  if (!match) return null;
  const start = Math.max(0, match.index - 220), end = Math.min(body.length, match.index + match[0].length + 220);
  return {match: match[0], excerpt: normalize(body.slice(start, end))};
}

function monthlyCandidate(candidate) {
  const cadence = normalize(candidate.paymentCadence).toLowerCase();
  const basis = normalize(candidate.billingBasis).toLowerCase();
  if (candidate.annualOnly === true || /annual|yearly|upfront/.test(cadence) || /annual.*equivalent|billed annually|annual upfront/.test(basis)) return false;
  return cadence === 'monthly' || cadence === 'month' || /monthly|per month|pro monat/.test(cadence);
}

function explicitlyNonMonthly(candidate) {
  const cadence = normalize(candidate.paymentCadence).toLowerCase();
  const basis = normalize(candidate.billingBasis).toLowerCase();
  const amount = candidate.ordinaryRecurringPrice ?? candidate.amount;
  return candidate.annualOnly === true || candidate.freeTier === true || (amount !== null && amount !== undefined && amount !== '' && Number(amount) === 0) ||
    /annual|yearly|upfront|one[- ]?time/.test(cadence) || /annual.*equivalent|billed annually|annual upfront|one[- ]?time/.test(basis);
}

function clearlyWrongMarket(candidate, targetMarket) {
  const stated = normalize(candidate.market).toUpperCase();
  if (stated && stated !== normalize(targetMarket).toUpperCase()) return true;
  return /(?:US|United States|UK|United Kingdom|Norway|Norge)\s+only/i.test(normalize(candidate.marketEvidence));
}

const hash = body => createHash('sha256').update(body).digest('hex');

export function verifyCandidates({providerName, targetMarket, aiResult, sources}) {
  const sourceByUrl = new Map();
  for (const source of sources) {
    sourceByUrl.set(source.url, source);
    if (source.finalUrl) sourceByUrl.set(source.finalUrl, source);
  }
  return (aiResult.plans || []).map(candidate => {
    const base = {
      provider: providerName,
      market: targetMarket,
      plan: candidate.planName,
      amount: candidate.amount,
      currency: candidate.currency,
      paymentCadence: candidate.paymentCadence,
      commitment: candidate.commitment ?? null,
      ordinaryRecurringPrice: candidate.ordinaryRecurringPrice ?? candidate.amount,
      introPrice: candidate.introPrice ?? null,
      introDuration: candidate.introDuration ?? null,
      sourceUrl: candidate.sourceUrl ?? null,
      sourceHash: null,
      sourceEvidence: null,
      googleAiSummary: candidate.summary ?? null,
      googleAiSourceReferences: candidate.sourceReferences ?? (candidate.sourceUrl ? [candidate.sourceUrl] : []),
      verificationStatus: null,
      warnings: []
    };
    if (!monthlyCandidate(candidate)) return {...base, verificationStatus: 'NOT_MONTHLY_RECURRING', warnings: ['ACTUAL_BILLING_NOT_MONTHLY']};
    if (candidate.amount === null || candidate.amount === undefined || candidate.ordinaryRecurringPrice === null || candidate.ordinaryRecurringPrice === 'unspecified') return {...base, verificationStatus: 'REVIEW_REQUIRED', warnings: ['AI_PRICE_MISSING']};
    const source = sourceByUrl.get(candidate.sourceUrl);
    if (!candidate.sourceUrl || !plausibleFirstParty(providerName, source?.finalUrl || source?.url || candidate.sourceUrl)) return {...base, verificationStatus: 'REVIEW_REQUIRED', warnings: ['FIRST_PARTY_NOT_CONFIRMED']};
    if (!source || source.status !== 'ACQUIRED') return {...base, verificationStatus: 'SOURCE_UNAVAILABLE', warnings: [source?.failure || 'OFFICIAL_SOURCE_NOT_ACQUIRED']};
    const body = normalize(source.body);
    const price = findPrice(body, candidate.ordinaryRecurringPrice ?? candidate.amount, candidate.currency);
    if (!price) return {...base, sourceHash: hash(source.body), verificationStatus: 'REVIEW_REQUIRED', warnings: ['AI_VALUE_NOT_FOUND_IN_SOURCE']};
    const planPresent = !candidate.planName || body.toLowerCase().includes(normalize(candidate.planName).toLowerCase());
    if (!planPresent) base.warnings.push('PLAN_CONTEXT_NOT_CONFIRMED');
    if (!MONTHLY.test(price.excerpt)) base.warnings.push(ANNUAL.test(price.excerpt) ? 'SOURCE_SHOWS_ANNUAL_BILLING' : 'MONTHLY_CADENCE_NOT_CONFIRMED');
    if (!marketSupported(targetMarket, source)) base.warnings.push('MARKET_NOT_CONFIRMED');
    if (Array.isArray(candidate.officialAlternatives) && new Set(candidate.officialAlternatives.map(x => `${x.amount}:${x.currency}`)).size > 1) base.warnings.push('OFFICIAL_SOURCE_PRICE_CONFLICT');
    const verified = base.warnings.length === 0;
    return {...base, sourceHash: hash(source.body), sourceEvidence: price.excerpt, verificationStatus: verified ? 'V4_VERIFIED' : 'REVIEW_REQUIRED'};
  });
}

export function buildSuggested({providerName, targetMarket, aiResult, verificationResults}) {
  const suggested = [], diagnostics = [];
  for (const [index, candidate] of (aiResult.plans || []).entries()) {
    const verification = verificationResults[index];
    const amount = candidate.ordinaryRecurringPrice ?? candidate.amount;
    const base = {
      provider: providerName,
      market: targetMarket,
      plan: candidate.planName,
      suggestedAmount: amount,
      suggestedCurrency: candidate.currency,
      suggestedPaymentCadence: candidate.paymentCadence,
      suggestedCommitment: candidate.commitment ?? null,
      introPrice: candidate.introPrice ?? null,
      introDuration: candidate.introDuration ?? null,
      suggestedSourceUrl: candidate.sourceUrl ?? null,
      sourceStatus: 'AI_SUGGESTED_ONLY',
      warnings: [],
      ...(candidate.offerScope ? {offerScope: candidate.offerScope} : {}),
      researchProvider: 'GOOGLE_AI',
      researchedAt: aiResult.timestamp
    };
    if (explicitlyNonMonthly(candidate)) {
      diagnostics.push({...base, reason: Number(amount) === 0 ? 'FREE_TIER' : 'NOT_MONTHLY_RECURRING'});
      continue;
    }
    if (amount === null || amount === undefined || amount === '' || !Number.isFinite(Number(amount)) || !normalize(candidate.currency)) {
      diagnostics.push({...base, reason: 'PLAN_FOUND_PRICE_MISSING'});
      continue;
    }
    if (clearlyWrongMarket(candidate, targetMarket)) {
      diagnostics.push({...base, reason: 'EXPLICIT_MARKET_MISMATCH'});
      continue;
    }
    if (!monthlyCandidate(candidate)) base.warnings.push('BILLING_CADENCE_UNCERTAIN');
    for (const warning of verification?.warnings || []) {
      base.warnings.push(warning === 'MARKET_NOT_CONFIRMED' ? 'MARKET_NOT_SOURCE_CONFIRMED' : warning);
    }
    const alternatives = candidate.officialAlternatives || [];
    const conflict = alternatives.some(value => Number(value.amount) !== Number(amount) || normalize(value.currency).toUpperCase() !== normalize(candidate.currency).toUpperCase());
    if (conflict || base.warnings.includes('OFFICIAL_SOURCE_PRICE_CONFLICT')) {
      base.sourceStatus = 'SOURCE_CONFLICT';
      if (!base.warnings.includes('SOURCE_CONFLICT')) base.warnings.push('SOURCE_CONFLICT');
    } else if (verification?.verificationStatus === 'V4_VERIFIED') {
      base.sourceStatus = 'SOURCE_CONFIRMED';
    } else if (verification?.sourceHash) {
      base.sourceStatus = 'SOURCE_PARTIAL';
    }
    base.warnings = [...new Set(base.warnings)];
    suggested.push(base);
  }
  return {suggested, diagnostics};
}
