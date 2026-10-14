const clean = (value, name) => {
  if (typeof value !== 'string' || !value.trim() || value.length > 120) throw new TypeError(`${name}_INVALID`);
  return value.trim().replace(/\s+/g, ' ');
};

export function buildGoogleAiQuery({providerName, targetMarket}) {
  const provider = clean(providerName, 'PROVIDER_NAME');
  const market = clean(targetMarket, 'TARGET_MARKET').toUpperCase();
  return `Find ALL subscription plans from ${provider} available in market ${market} that are actually billed or payable monthly on a recurring basis. Return strict JSON with: provider, market, plans, and sources. For every plan return planName, amount, currency, paymentCadence, commitment, ordinaryRecurringPrice, introPrice, introDuration, sourceUrl, sourceEvidence, and marketEvidence. Include all actual monthly options. Exclude free tiers, one-time purchases, trials without an ordinary recurring price, and annual upfront subscriptions merely displayed as a per-month equivalent. Classify annual-only plans as annual-only. A 12-month commitment paid each month still has monthly payment cadence. Use official first-party provider sources when possible. Do not infer unsupported prices. Report conflicts and uncertainty explicitly.`;
}
