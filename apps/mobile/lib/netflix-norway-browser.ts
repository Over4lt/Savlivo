import { subscriptionBelongsToMarket } from "../../../packages/contracts/src/markets";

type SubscriptionContext = {
  serviceSlug: string;
  billingProviderSlug: string;
  countryCode?: string | null;
  currency?: string | null;
};

// Deliberately limited to the existing subscription action-sheet destinations.
export function usesNetflixNorwayBrowser(
  url: string | null | undefined,
  subscription: SubscriptionContext,
  selectedCountryCode: string,
  platform: string
) {
  return platform === "ios" && selectedCountryCode === "NO" &&
    subscription.serviceSlug === "netflix" && subscription.billingProviderSlug === "direct" &&
    subscriptionBelongsToMarket(subscription, "NO") &&
    (url === "https://www.netflix.com/account" || url === "https://www.netflix.com/cancelplan");
}

export async function openNetflixNorwayBrowser(
  url: string,
  subscription: SubscriptionContext,
  selectedCountryCode: string,
  browser: {
    platform: string;
    openSystemBrowser: (url: string) => Promise<{ type: string }>;
    openExternal: (url: string) => Promise<boolean>;
  }
): Promise<boolean> {
  if (usesNetflixNorwayBrowser(url, subscription, selectedCountryCode, browser.platform)) {
    try {
      const result = await browser.openSystemBrowser(url);
      // iOS reports the sheet closing, never the outcome of the subscription action.
      if (result.type === "cancel" || result.type === "dismiss") return true;
    } catch {
      // Missing native support or failed presentation retains the existing opener.
    }
  }
  return browser.openExternal(url);
}
