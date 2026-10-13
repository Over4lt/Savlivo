import type {AdapterPrice} from "./pricing-adapters.js";
import {
  catalogPlanIdentity,
  type ProductPlanPricing,
  type ProductPriceEvidence
} from "../../../packages/contracts/src/product-pricing.js";

type ResearchRecord = {
  suggestedId?: unknown;
  plan?: unknown;
  amount?: unknown;
  currency?: unknown;
  paymentCadence?: unknown;
  sourceUrl?: unknown;
  acquiredAt?: unknown;
  researchedAt?: unknown;
  verifiedAt?: unknown;
  warnings?: unknown;
  provenance?: unknown;
  originSuggestedId?: unknown;
};
type CombinedPlan = {
  planIdentity?: unknown;
  activeSuggested?: ResearchRecord | null;
  suggestedHistory?: ResearchRecord[];
  verified?: ResearchRecord[];
};
type CombinedResult = {kind?: unknown; plans?: CombinedPlan[]};

function researchEvidence(
  row: ResearchRecord,
  kind: "SUGGESTED" | "VERIFIED"
): ProductPriceEvidence | null {
  const amount = Number(row.amount);
  const monthlyPriceMinor = Math.round(amount * 100);
  const currency = String(row.currency ?? "").toUpperCase();
  const cadence = String(row.paymentCadence ?? "").toUpperCase();
  if (
    !Number.isFinite(amount) || amount <= 0 ||
    !Number.isSafeInteger(monthlyPriceMinor) ||
    Math.abs(amount * 100 - monthlyPriceMinor) > 1e-6 ||
    !/^[A-Z]{3}$/.test(currency) ||
    (kind === "SUGGESTED" && !["MONTHLY", "MONTHLY_RECURRING"].includes(cadence))
  ) return null;
  const observedAt = row.acquiredAt ?? row.researchedAt ?? row.verifiedAt;
  return {
    monthlyPriceMinor,
    currency,
    paymentCadence: "MONTHLY_RECURRING",
    ...(typeof row.sourceUrl === "string" && row.sourceUrl ? {sourceUrl: row.sourceUrl} : {}),
    ...(typeof observedAt === "string" && observedAt ? {observedAt} : {}),
    warnings: Array.isArray(row.warnings)
      ? row.warnings.filter((value): value is string => typeof value === "string")
      : [],
    provenance: String(row.provenance ?? kind),
    ...(typeof row.suggestedId === "string" ? {suggestedId: row.suggestedId} : {}),
    ...(typeof row.originSuggestedId === "string" ? {originSuggestedId: row.originSuggestedId} : {})
  };
}

export function projectCombinedResearchProductPlans(input: {
  serviceSlug: string;
  billingProviderSlug: string;
  countryCode: string;
  combined: CombinedResult;
}): ProductPlanPricing[] {
  if (input.combined?.kind !== "CombinedResearchResult" || !Array.isArray(input.combined.plans)) return [];
  return input.combined.plans.map(plan => {
    const suggested = plan.activeSuggested
      ? researchEvidence(plan.activeSuggested, "SUGGESTED")
      : null;
    const suggestedHistory = (plan.suggestedHistory ?? [])
      .map(value => researchEvidence(value, "SUGGESTED"))
      .filter((value): value is ProductPriceEvidence => Boolean(value));
    const verified = (plan.verified ?? [])
      .map(value => researchEvidence(value, "VERIFIED"))
      .filter((value): value is ProductPriceEvidence => Boolean(value));
    return {
      planIdentity: String(plan.planIdentity ?? ""),
      serviceSlug: input.serviceSlug,
      planName: String(plan.activeSuggested?.plan ?? plan.verified?.[0]?.plan ?? plan.planIdentity ?? ""),
      billingProviderSlug: input.billingProviderSlug,
      countryCode: input.countryCode,
      suggested,
      suggestedHistory,
      verified
    };
  }).filter(plan =>
    Boolean(plan.planIdentity) && Boolean(plan.planName) &&
    Boolean(plan.suggested || plan.verified.length)
  );
}

export function projectCatalogProductPlans(items: AdapterPrice[]): ProductPlanPricing[] {
  return items
    .filter(item => item.priceType === "exact" && Number.isSafeInteger(item.monthlyPriceMinor) && item.monthlyPriceMinor > 0)
    .map(item => {
      const evidence: ProductPriceEvidence = {
        monthlyPriceMinor: item.monthlyPriceMinor,
        currency: item.currency,
        paymentCadence: "MONTHLY_RECURRING",
        sourceUrl: item.sourceUrl,
        observedAt: item.updatedAt,
        warnings: [],
        provenance: item.verification ?? "VERIFIED_CATALOG"
      };
      const verified = item.verification === "registry" ||
        item.verification === "authoritative-provider" ||
        (item.verification === "multi-source" &&
          item.verifiedByAgreement === true &&
          (item.sourceCount ?? 0) >= 2);
      return {
        planIdentity: item.planIdentity ?? catalogPlanIdentity(item),
        serviceSlug: item.serviceSlug,
        planName: item.planName,
        billingProviderSlug: item.billingProviderSlug,
        countryCode: item.countryCode,
        suggested: verified ? null : {...evidence, warnings: ["SOURCE_NOT_VERIFIED"]},
        suggestedHistory: [],
        verified: verified ? [evidence] : []
      };
    });
}

export function mergeProductPlans(
  suggestedPlans: ProductPlanPricing[],
  verifiedPlans: ProductPlanPricing[]
) {
  const plans = new Map<string, ProductPlanPricing>();
  const key = (plan: ProductPlanPricing) => [
    plan.planIdentity,
    plan.serviceSlug,
    plan.billingProviderSlug,
    plan.countryCode
  ].join("\u0000");
  for (const plan of [...suggestedPlans, ...verifiedPlans]) {
    const existing = plans.get(key(plan));
    if (!existing) {
      plans.set(key(plan), structuredClone(plan));
      continue;
    }
    if (plan.suggested) existing.suggested = structuredClone(plan.suggested);
    existing.suggestedHistory.push(...structuredClone(plan.suggestedHistory));
    existing.verified.push(...structuredClone(plan.verified));
  }
  return [...plans.values()];
}

export function withProductPricing<T extends {items: AdapterPrice[]}>(
  snapshot: T,
  suggestedPlans: ProductPlanPricing[]
) {
  return {
    ...snapshot,
    plans: mergeProductPlans(suggestedPlans, projectCatalogProductPlans(snapshot.items))
  };
}
