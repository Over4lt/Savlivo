export type SuggestedPriceCalculation = {
  schemaVersion: 1;
  method: "MONTHLY_BASE_PLUS_AD_FREE_ADD_ON";
  currency: string;
  components: Array<{
    role: "BASE" | "AD_FREE_ADD_ON";
    planName: string;
    monthlyPriceMinor: number;
    sourceUrl: string;
    aiExcerptSha256: string;
  }>;
  compatibilityAiExcerptSha256: string;
};

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
  calculation?: SuggestedPriceCalculation;
  offerScope?: "COMPLETE_SUBSCRIPTION" | "CALCULATED_TOTAL";
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
  oldVerified?: ProductPriceEvidence[];
};

export type ProductPriceStatus =
  | "SUGGESTED_ONLY"
  | "VERIFIED_ONLY"
  | "SUGGESTED_AND_VERIFIED_MATCH"
  | "SUGGESTED_AND_VERIFIED_CONFLICT"
  | "SUGGESTED_AND_OLD_VERIFIED"
  | "OLD_VERIFIED_ONLY"
  | "NO_PRICE";

export function productPriceTruth(plan: ProductPlanPricing) {
  const key = (value: ProductPriceEvidence) => [
    value.currency,
    value.monthlyPriceMinor,
    value.paymentCadence
  ].join(":");
  const verifiedFacts = new Set(plan.verified.map(key));
  const authoritativeConflict = verifiedFacts.size > 1;
  const activePrice = authoritativeConflict
    ? null
    : plan.verified[0] ?? plan.suggested ?? plan.oldVerified?.[0] ?? null;
  const suggestedEvidence = [plan.suggested, ...plan.suggestedHistory]
    .filter((value): value is ProductPriceEvidence => Boolean(value));
  const suggestedMismatch = Boolean(
    suggestedEvidence.length && plan.verified.length &&
    suggestedEvidence.some(suggested =>
      !plan.verified.some(value => key(value) === key(suggested))
    )
  );
  return {
    activePrice,
    authority: authoritativeConflict
      ? "CONFLICT" as const
      : plan.verified.length
        ? "VERIFIED" as const
        : plan.suggested
          ? "SUGGESTED" as const
          : plan.oldVerified?.length
            ? "OLD_VERIFIED" as const
          : "NONE" as const,
    authoritativeConflict,
    suggestedMismatch
  };
}

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
  const truth = productPriceTruth(plan);
  if (!plan.suggested && !plan.verified.length) return plan.oldVerified?.length ? "OLD_VERIFIED_ONLY" : "NO_PRICE";
  if (plan.suggested && !plan.verified.length && plan.oldVerified?.length) return "SUGGESTED_AND_OLD_VERIFIED";
  if (plan.suggested && !plan.verified.length) return "SUGGESTED_ONLY";
  if (truth.authoritativeConflict) return "SUGGESTED_AND_VERIFIED_CONFLICT";
  if (!plan.suggested || truth.suggestedMismatch) return "VERIFIED_ONLY";
  return "SUGGESTED_AND_VERIFIED_MATCH";
}

export function productPriceRows(
  plan: ProductPlanPricing,
  userMonthlyPriceMinor?: number,
  userCurrency?: string
) {
  const truth = productPriceTruth(plan);
  const rows: Array<{
    label: "Suggested" | "Verified" | "Old Verified" | "Your price";
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
  for (const value of plan.oldVerified ?? []) rows.push({
    label: "Old Verified",
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
  return {rows, activeProviderPrice: truth.activePrice, providerPriceAuthority: truth.authority, suggestedMismatch: truth.suggestedMismatch, authoritativeConflict: truth.authoritativeConflict, effectivePersonalMonthlyPriceMinor};
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
    SUGGESTED_AND_OLD_VERIFIED: 0,
    OLD_VERIFIED_ONLY: 0,
    NO_PRICE: 0
  };
  const providersWithSuggested = new Set<string>();
  const providersWithVerified = new Set<string>();
  const providersWithOldVerified = new Set<string>();
  let plansWithSuggested = 0;
  let plansWithVerified = 0;
  let plansWithOldVerified = 0;
  let overlap = 0;
  const rows = plans.map(plan => {
    const status = productPriceStatus(plan), truth = productPriceTruth(plan);
    statusCounts[status] += 1;
    if (plan.suggested) {
      plansWithSuggested += 1;
      providersWithSuggested.add(plan.serviceSlug);
    }
    if (plan.verified.length) {
      plansWithVerified += 1;
      providersWithVerified.add(plan.serviceSlug);
    }
    if (plan.oldVerified?.length) {
      plansWithOldVerified += 1;
      providersWithOldVerified.add(plan.serviceSlug);
    }
    if (plan.suggested && plan.verified.length) overlap += 1;
    return {
      serviceSlug: plan.serviceSlug,
      planName: plan.planName,
      countryCode: plan.countryCode,
      status,
      suggestedMismatch: truth.suggestedMismatch,
      authoritativeConflict: truth.authoritativeConflict,
      suggested: plan.suggested
        ? `${plan.suggested.currency} ${(plan.suggested.monthlyPriceMinor / 100).toFixed(2)}`
        : null,
      verified: plan.verified.length
        ? plan.verified.map(value => `${value.currency} ${(value.monthlyPriceMinor / 100).toFixed(2)}`).join(", ")
        : null,
      oldVerified: plan.oldVerified?.length
        ? plan.oldVerified.map(value => `${value.currency} ${(value.monthlyPriceMinor / 100).toFixed(2)}`).join(", ")
        : null
    };
  });
  const pricedProviders = new Set(plans
    .filter(plan => plan.suggested || plan.verified.length || plan.oldVerified?.length)
    .map(plan => plan.serviceSlug));
  const noPriceProviders = [...new Set(catalogServiceSlugs)]
    .filter(serviceSlug => !pricedProviders.has(serviceSlug));
  statusCounts.NO_PRICE += noPriceProviders.length;
  rows.push(...noPriceProviders.map(serviceSlug => ({
    serviceSlug,
    planName: "No observed priced plan",
    countryCode: "",
    status: "NO_PRICE" as const,
    suggestedMismatch: false,
    authoritativeConflict: false,
    suggested: null,
    verified: null,
    oldVerified: null
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
    providersWithOldVerified: providersWithOldVerified.size,
    plansWithOldVerified,
    suggestedCoveragePercent: percentage(plansWithSuggested),
    verifiedCoveragePercent: percentage(plansWithVerified),
    suggestedVerifiedOverlap: overlap,
    suggestedVerifiedConflicts: statusCounts.SUGGESTED_AND_VERIFIED_CONFLICT,
    rows
  };
}
