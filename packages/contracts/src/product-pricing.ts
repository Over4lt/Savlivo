export type ProductPriceEvidence = {
  monthlyPriceMinor: number;
  currency: string;
  paymentCadence: "MONTHLY_RECURRING";
  sourceUrl?: string;
  observedAt?: string;
  warnings: string[];
  provenance: string;
  suggestedId?: string;
  originSuggestedId?: string;
};

export type ProductPlanPricing = {
  planIdentity: string;
  serviceSlug: string;
  planName: string;
  billingProviderSlug: string;
  countryCode: string;
  suggested: ProductPriceEvidence | null;
  suggestedHistory: ProductPriceEvidence[];
  verified: ProductPriceEvidence[];
};

export type ProductPriceStatus =
  | "SUGGESTED_ONLY"
  | "VERIFIED_ONLY"
  | "SUGGESTED_AND_VERIFIED_MATCH"
  | "SUGGESTED_AND_VERIFIED_CONFLICT"
  | "NO_PRICE";

export function catalogPlanIdentity(value: {
  serviceSlug: string;
  planSlug: string;
  billingProviderSlug: string;
  countryCode: string;
  currency: string;
}) {
  return [
    "catalog",
    value.serviceSlug,
    value.countryCode,
    value.planSlug,
    value.billingProviderSlug,
    value.currency
  ].map(part => part.toLowerCase()).join(":");
}

export function productPriceStatus(plan: ProductPlanPricing): ProductPriceStatus {
  if (!plan.suggested && !plan.verified.length) return "NO_PRICE";
  if (plan.suggested && !plan.verified.length) return "SUGGESTED_ONLY";
  if (!plan.suggested) return "VERIFIED_ONLY";
  const matches = plan.verified.every(value =>
    value.monthlyPriceMinor === plan.suggested!.monthlyPriceMinor &&
    value.currency === plan.suggested!.currency &&
    value.paymentCadence === plan.suggested!.paymentCadence
  );
  return matches
    ? "SUGGESTED_AND_VERIFIED_MATCH"
    : "SUGGESTED_AND_VERIFIED_CONFLICT";
}

export function productPriceRows(
  plan: ProductPlanPricing,
  userMonthlyPriceMinor?: number,
  userCurrency?: string
) {
  const rows: Array<{
    label: "Suggested" | "Verified" | "Your price";
    monthlyPriceMinor: number;
    currency: string;
  }> = [];
  if (plan.suggested) rows.push({
    label: "Suggested",
    monthlyPriceMinor: plan.suggested.monthlyPriceMinor,
    currency: plan.suggested.currency
  });
  for (const value of plan.verified) rows.push({
    label: "Verified",
    monthlyPriceMinor: value.monthlyPriceMinor,
    currency: value.currency
  });
  const effectivePersonalMonthlyPriceMinor =
    Number.isSafeInteger(userMonthlyPriceMinor) && Number(userMonthlyPriceMinor) > 0
      ? Number(userMonthlyPriceMinor)
      : null;
  if (effectivePersonalMonthlyPriceMinor !== null && userCurrency) rows.push({
    label: "Your price",
    monthlyPriceMinor: effectivePersonalMonthlyPriceMinor,
    currency: userCurrency
  });
  return {rows, effectivePersonalMonthlyPriceMinor};
}

export function summarizeProductPricing(
  plans: ProductPlanPricing[],
  catalogServiceSlugs: readonly string[] = []
) {
  const statusCounts: Record<ProductPriceStatus, number> = {
    SUGGESTED_ONLY: 0,
    VERIFIED_ONLY: 0,
    SUGGESTED_AND_VERIFIED_MATCH: 0,
    SUGGESTED_AND_VERIFIED_CONFLICT: 0,
    NO_PRICE: 0
  };
  const providersWithSuggested = new Set<string>();
  const providersWithVerified = new Set<string>();
  let plansWithSuggested = 0;
  let plansWithVerified = 0;
  let overlap = 0;
  const rows = plans.map(plan => {
    const status = productPriceStatus(plan);
    statusCounts[status] += 1;
    if (plan.suggested) {
      plansWithSuggested += 1;
      providersWithSuggested.add(plan.serviceSlug);
    }
    if (plan.verified.length) {
      plansWithVerified += 1;
      providersWithVerified.add(plan.serviceSlug);
    }
    if (plan.suggested && plan.verified.length) overlap += 1;
    return {
      serviceSlug: plan.serviceSlug,
      planName: plan.planName,
      countryCode: plan.countryCode,
      status,
      suggested: plan.suggested
        ? `${plan.suggested.currency} ${(plan.suggested.monthlyPriceMinor / 100).toFixed(2)}`
        : null,
      verified: plan.verified.length
        ? plan.verified.map(value => `${value.currency} ${(value.monthlyPriceMinor / 100).toFixed(2)}`).join(", ")
        : null
    };
  });
  const pricedProviders = new Set(plans
    .filter(plan => plan.suggested || plan.verified.length)
    .map(plan => plan.serviceSlug));
  const noPriceProviders = [...new Set(catalogServiceSlugs)]
    .filter(serviceSlug => !pricedProviders.has(serviceSlug));
  statusCounts.NO_PRICE += noPriceProviders.length;
  rows.push(...noPriceProviders.map(serviceSlug => ({
    serviceSlug,
    planName: "No observed priced plan",
    countryCode: "",
    status: "NO_PRICE" as const,
    suggested: null,
    verified: null
  })));
  const denominator = plans.length + noPriceProviders.length;
  const percentage = (count: number) => denominator
    ? Number((count / denominator * 100).toFixed(1))
    : 0;
  return {
    statusCounts,
    providersWithSuggested: providersWithSuggested.size,
    plansWithSuggested,
    providersWithVerified: providersWithVerified.size,
    plansWithVerified,
    suggestedCoveragePercent: percentage(plansWithSuggested),
    verifiedCoveragePercent: percentage(plansWithVerified),
    suggestedVerifiedOverlap: overlap,
    suggestedVerifiedConflicts: statusCounts.SUGGESTED_AND_VERIFIED_CONFLICT,
    rows
  };
}
