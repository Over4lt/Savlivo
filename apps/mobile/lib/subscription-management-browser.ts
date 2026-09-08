// Classify destinations already selected by provider routing; this is not a URL trust check.
// Store links must retain Linking's platform/deep-link behavior even when they use HTTPS.
const platformStoreHosts = [
  "apps.apple.com", "itunes.apple.com", "appstore.com", "appsto.re",
  "play.google.com", "market.android.com", "apps.microsoft.com"
];

export function usesSubscriptionManagementBrowser(
  url: string | null | undefined,
  platform: string
): boolean {
  if (platform !== "ios" || !url || !/^https?:\/\//i.test(url)) return false;
  try {
    const destination = new URL(url);
    if (!destination.hostname || destination.username || destination.password) return false;
    const hostname = destination.hostname.toLowerCase().replace(/\.$/, "");
    return !platformStoreHosts.some(host =>
      hostname === host || hostname.endsWith(`.${host}`)
    );
  } catch {
    return false;
  }
}

export async function openSubscriptionManagementBrowser(
  url: string,
  browser: {
    platform: string;
    openSystemBrowser: (url: string) => Promise<{ type: string }>;
    openExternal: (url: string) => Promise<boolean>;
  }
): Promise<boolean> {
  if (usesSubscriptionManagementBrowser(url, browser.platform)) {
    try {
      const result = await browser.openSystemBrowser(url);
      // Closing the sheet reports navigation only, never a subscription outcome.
      if (result.type === "cancel" || result.type === "dismiss") return true;
    } catch {
      // Missing native capability or failed presentation preserves the existing opener.
    }
  }
  return browser.openExternal(url);
}
