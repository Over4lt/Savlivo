import { productPriceTruth, type ProductPlanPricing } from "../../../packages/contracts/src/product-pricing";
import { matchesRegionalPlan } from "./regional-plan-match";

export type RegionalPlanOption = {
  planIdentity: string;
  planName: string;
  planSlug?: string;
  serviceSlug: string;
  billingProviderSlug: string;
  countryCode: string;
  currency: string;
  monthlyPriceMinor: number;
  priceStatus: "VERIFIED" | "SUGGESTED" | "OLD_VERIFIED";
};

// A standalone ad-free tier is a plan; an ad-free upgrade by itself is not.
function isAddOnOnly(serviceSlug: string, name: string) {
  const normalized = name.trim().toLowerCase();
  return /\b(?:add[ -]?on|channels?|extra member|upgrade|bundle)\b/.test(normalized) ||
    /\s\+\s/.test(normalized) ||
    (serviceSlug === "prime-video" &&
      (/^(?:prime video\s*)?(?:ad[ -]?free|without ads)$/.test(normalized) ||
        /^(?:amazon prime|prime membership)$/.test(normalized)));
}

function catalogSlug(plan: ProductPlanPricing, currency: string) {
  const parts = plan.planIdentity.split(":");
  return parts.length === 6 && parts[0] === "catalog" &&
    parts[1] === plan.serviceSlug.toLowerCase() &&
    parts[2] === plan.countryCode.toLowerCase() &&
    parts[4] === plan.billingProviderSlug.toLowerCase() &&
    parts[5] === currency.toLowerCase() ? parts[3] : undefined;
}

export function regionalProductPlanOptions(
  plans: readonly ProductPlanPricing[],
  selection: { serviceSlug: string; billingProviderSlug: string; countryCode: string; currency: string }
): RegionalPlanOption[] {
  const options: RegionalPlanOption[] = [];
  const seen = new Set<string>();
  const duplicate = new Set<string>();
  for (const plan of plans) {
    if (plan.serviceSlug !== selection.serviceSlug ||
      plan.billingProviderSlug !== selection.billingProviderSlug ||
      plan.countryCode !== selection.countryCode ||
      !plan.planIdentity || !plan.planName.trim() ||
      /^[a-f0-9]{64}$/i.test(plan.planName.trim()) ||
      isAddOnOnly(plan.serviceSlug, plan.planName)) continue;

    // Authority applies to this exact currency. A Verified price in a different
    // currency must not override a local Suggested price or be FX-converted.
    const currencyPlan = {
      ...plan,
      verified: plan.verified.filter(price => price.currency === selection.currency),
      suggested: plan.suggested?.currency === selection.currency ? plan.suggested : null,
      oldVerified: plan.oldVerified?.filter(price => price.currency === selection.currency)
    };
    const truth = productPriceTruth(currencyPlan);
    const price = truth.activePrice;
    if (!price || truth.authority === "CONFLICT" || truth.authority === "NONE" ||
      price.paymentCadence !== "MONTHLY_RECURRING" ||
      !Number.isSafeInteger(price.monthlyPriceMinor) || price.monthlyPriceMinor <= 0) continue;

    if (seen.has(plan.planIdentity)) duplicate.add(plan.planIdentity);
    seen.add(plan.planIdentity);
    options.push({
      planIdentity: plan.planIdentity,
      planName: plan.planName,
      planSlug: catalogSlug(plan, price.currency),
      serviceSlug: plan.serviceSlug,
      billingProviderSlug: plan.billingProviderSlug,
      countryCode: plan.countryCode,
      currency: price.currency,
      monthlyPriceMinor: price.monthlyPriceMinor,
      priceStatus: truth.authority
    });
  }
  return options.filter(option => !duplicate.has(option.planIdentity));
}

// An ambiguous name is not enough to choose a provider price automatically.
export function matchingRegionalProductPlan(
  options: readonly RegionalPlanOption[], planName?: string
) {
  if (!planName) return options.length === 1 ? options[0] : null;
  const matches = options.filter(option => matchesRegionalPlan(option, planName, option.serviceSlug));
  return matches.length === 1 ? matches[0] : null;
}

export function automaticPlanPrice(
  option: RegionalPlanOption | null, editingExistingSubscription: boolean
) {
  return option && !editingExistingSubscription ? option.monthlyPriceMinor : null;
}
