export interface ProviderRoute {
  provider: "APPLE" | "GOOGLE_PLAY" | "AMAZON" | "DIRECT" | "GUIDED";
  url?: string;
  label: string;
}

export function getProviderRoute(providerSlug: string): ProviderRoute {
  switch (providerSlug) {
    case "apple":
      return {
        provider: "APPLE",
        url: "https://apps.apple.com/account/subscriptions",
        label: "Open Apple subscriptions"
      };
    case "google-play":
      return {
        provider: "GOOGLE_PLAY",
        url: "https://play.google.com/store/account/subscriptions",
        label: "Open Google Play subscriptions"
      };
    case "amazon":
      return {
        provider: "AMAZON",
        url: "https://www.amazon.com/hz5/yourmembershipsandsubscriptions",
        label: "Open Amazon subscriptions"
      };
    case "direct":
      return {
        provider: "DIRECT",
        label: "Manage directly"
      };
    default:
      return {
        provider: "GUIDED",
        label: "Open guided instructions"
      };
  }
}
