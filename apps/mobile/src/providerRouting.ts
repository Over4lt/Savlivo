import { Linking } from "react-native";

export type SubscriptionAction =
  | "PAUSE"
  | "CANCEL"
  | "REACTIVATE";

export type BillingProviderSlug =
  | "direct"
  | "apple"
  | "google-play"
  | "amazon"
  | "carrier";

type ManagementConfig = {
  manageUrl?: string;
  cancelUrl?: string;
  reactivateUrl?: string;
  pauseUrl?: string;
  supportsPause?: boolean;
};

const APPLE_SUBSCRIPTIONS =
  "https://apps.apple.com/account/subscriptions";

const GOOGLE_SUBSCRIPTIONS =
  "https://play.google.com/store/account/subscriptions";

const serviceManagement: Record<
  string,
  ManagementConfig
> = {
  netflix: {
    manageUrl: "https://www.netflix.com/account",
    cancelUrl: "https://www.netflix.com/cancelplan",
    reactivateUrl: "https://www.netflix.com/account",
    supportsPause: false
  },

  "disney-plus": {
    manageUrl: "https://www.disneyplus.com/account",
    supportsPause: false
  },

  max: {
    manageUrl: "https://www.max.com/subscription",
    supportsPause: false
  },

  "prime-video": {
    manageUrl:
      "https://www.primevideo.com/settings/your-account",
    supportsPause: false
  },

  "amazon-prime": {
    manageUrl:
      "https://www.amazon.com/prime",
    supportsPause: false
  },

  "apple-tv-plus": {
    manageUrl: APPLE_SUBSCRIPTIONS,
    supportsPause: false
  },

  "youtube-premium": {
    manageUrl:
      "https://www.youtube.com/paid_memberships",
    pauseUrl:
      "https://www.youtube.com/paid_memberships",
    reactivateUrl:
      "https://www.youtube.com/paid_memberships",
    cancelUrl:
      "https://www.youtube.com/paid_memberships",
    supportsPause: true
  },

  hulu: {
    manageUrl:
      "https://secure.hulu.com/account",
    supportsPause: true
  },

  "paramount-plus": {
    manageUrl:
      "https://www.paramountplus.com/account/",
    supportsPause: false
  },

  peacock: {
    manageUrl:
      "https://www.peacocktv.com/account",
    supportsPause: false
  },

  crunchyroll: {
    manageUrl:
      "https://www.crunchyroll.com/account/membership",
    supportsPause: false
  },

  spotify: {
    manageUrl:
      "https://www.spotify.com/account/",
    supportsPause: false
  },

  "apple-music": {
    manageUrl: APPLE_SUBSCRIPTIONS,
    supportsPause: false
  },

  "amazon-music-unlimited": {
    manageUrl:
      "https://www.amazon.com/gp/dmusic/player/settings",
    supportsPause: false
  },

  tidal: {
    manageUrl:
      "https://account.tidal.com/",
    supportsPause: false
  },

  audible: {
    manageUrl:
      "https://www.audible.com/account/overview",
    supportsPause: true
  },

  "xbox-game-pass": {
    manageUrl:
      "https://account.microsoft.com/services/",
    supportsPause: false
  },

  "playstation-plus": {
    manageUrl:
      "https://www.playstation.com/support/store/cancel-ps-store-subscription/",
    supportsPause: false
  },

  "ea-play": {
    manageUrl:
      "https://myaccount.ea.com/",
    supportsPause: false
  },

  "ubisoft-plus": {
    manageUrl:
      "https://account.ubisoft.com/",
    supportsPause: false
  },

  "geforce-now": {
    manageUrl:
      "https://www.nvidia.com/account/",
    supportsPause: false
  },

  chatgpt: {
    manageUrl:
      "https://chatgpt.com/",
    supportsPause: false
  },

  claude: {
    manageUrl:
      "https://claude.ai/settings/billing",
    supportsPause: false
  },

  "microsoft-365": {
    manageUrl:
      "https://account.microsoft.com/services/",
    supportsPause: false
  },

  "adobe-creative-cloud": {
    manageUrl:
      "https://account.adobe.com/plans",
    supportsPause: false
  },

  canva: {
    manageUrl:
      "https://www.canva.com/settings/billing-and-plans",
    supportsPause: true
  },

  dropbox: {
    manageUrl:
      "https://www.dropbox.com/account/plan",
    supportsPause: false
  },

  "google-one": {
    manageUrl:
      "https://one.google.com/plans?g1_last_touchpoint=39&g1_landing_page=0",
    supportsPause: false
  },

  "icloud-plus": {
    manageUrl: APPLE_SUBSCRIPTIONS,
    supportsPause: false
  },

  strava: {
    manageUrl:
      "https://www.strava.com/settings/account",
    supportsPause: false
  },

  calm: {
    manageUrl:
      "https://www.calm.com/profile",
    supportsPause: false
  },

  headspace: {
    manageUrl:
      "https://www.headspace.com/subscription/manage",
    supportsPause: false
  }
};

function normalizeBillingProvider(
  value?: string
) {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();

  if (normalized === "google") {
    return "google-play";
  }

  if (
    normalized === "tv-provider" ||
    normalized === "carrier-tv"
  ) {
    return "carrier";
  }

  return normalized;
}

export function supportsSubscriptionAction(
  serviceSlug: string,
  billingProviderSlug: string,
  action: SubscriptionAction
) {
  const billing =
    normalizeBillingProvider(
      billingProviderSlug
    );

  if (action !== "PAUSE") {
    return true;
  }

  /*
   * Platform billing wins.
   *
   * We don't expose a generic Pause button for
   * Apple/Google/Amazon-billed subscriptions unless
   * we have a verified platform-specific pause flow.
   */
  if (
    billing === "apple" ||
    billing === "google-play" ||
    billing === "amazon" ||
    billing === "carrier"
  ) {
    return false;
  }

  return Boolean(
    serviceManagement[serviceSlug]?.supportsPause
  );
}

export function getSubscriptionManagementUrl({
  serviceSlug,
  billingProviderSlug,
  action,
  countryCode
}: {
  serviceSlug: string;
  billingProviderSlug: string;
  action: SubscriptionAction;
  countryCode?: string;
}) {
  const billing =
    normalizeBillingProvider(
      billingProviderSlug
    );

  /*
   * Billing provider ALWAYS wins.
   */
  if (billing === "apple") {
    return APPLE_SUBSCRIPTIONS;
  }

  if (billing === "google-play") {
    return GOOGLE_SUBSCRIPTIONS;
  }

  /*
   * Carrier / TV billing is provider-specific.
   * Never guess.
   */
  if (billing === "carrier") {
    return null;
  }

  /*
   * Amazon-billed memberships need Amazon-owned
   * management destinations.
   */
  if (billing === "amazon") {
    if (
      serviceSlug === "prime-video"
    ) {
      return getPrimeVideoUrl(
        countryCode
      );
    }

    if (
      serviceSlug ===
      "amazon-music-unlimited"
    ) {
      return "https://www.amazon.com/gp/dmusic/player/settings";
    }

    if (
      serviceSlug === "amazon-prime"
    ) {
      return "https://www.amazon.com/prime";
    }

    /*
     * Amazon Channels / third-party subscriptions.
     */
    return "https://www.amazon.com/gp/video/settings/channels";
  }

  /*
   * Direct Prime Video has a regional account URL.
   */
  if (serviceSlug === "prime-video") {
    return getPrimeVideoUrl(
      countryCode
    );
  }

  const config =
    serviceManagement[serviceSlug];

  if (!config) {
    return null;
  }

  if (
    action === "PAUSE" &&
    config.pauseUrl
  ) {
    return config.pauseUrl;
  }

  if (
    action === "CANCEL" &&
    config.cancelUrl
  ) {
    return config.cancelUrl;
  }

  if (
    action === "REACTIVATE" &&
    config.reactivateUrl
  ) {
    return config.reactivateUrl;
  }

  return config.manageUrl ?? null;
}

function getPrimeVideoUrl(
  countryCode?: string
) {
  const europe = new Set([
    "AL","AD","AT","BY","BE","BA","BG","HR",
    "CY","CZ","DK","EE","FI","FR","DE","GR",
    "HU","IS","IE","IT","LV","LI","LT","LU",
    "MT","MD","MC","ME","NL","MK","NO","PL",
    "PT","RO","SM","RS","SK","SI","ES","SE",
    "CH","UA","GB","VA"
  ]);

  return europe.has(
    String(countryCode ?? "")
      .toUpperCase()
  )
    ? "https://www.primevideo.com/region/eu/settings/your-account"
    : "https://www.primevideo.com/settings/your-account";
}

export async function openProviderUrl(
  url?: string | null
) {
  if (!url) {
    return false;
  }

  const supported =
    await Linking.canOpenURL(url);

  if (!supported) {
    return false;
  }

  await Linking.openURL(url);

  return true;
}
