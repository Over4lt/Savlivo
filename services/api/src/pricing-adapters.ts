export type BillingProviderSlug =
  | "direct"
  | "apple"
  | "google-play"
  | "amazon"
  | "carrier";

export type AdapterPrice = {
  serviceSlug: string;
  planSlug: string;
  planName: string;
  billingProviderSlug: BillingProviderSlug;
  countryCode: string;
  currency: string;
  monthlyPriceMinor: number;
  updatedAt: string;
  source: string;
  sourceUrl: string;
  confidence: "official-provider-adapter";
  priceType: "exact" | "range";
  monthlyPriceMaxMinor?: number;
  verification?:
    | "registry"
    | "multi-source"
    | "authoritative-provider"
    | "single-source";
  sourceCount?: number;
  verifiedByAgreement?: boolean;
};

type AdapterContext = {
  countryCode: string;
  currency: string;
};

// Official provider-page prices are DIRECT prices only.
// Never copy a direct provider price to Apple, Google Play, Amazon,
// or carrier billing unless that billing route has been independently verified.
const billingRoutes: BillingProviderSlug[] = [
  "direct"
];

async function fetchText(
  url: string,
  acceptLanguage = "en"
) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(url, {
      headers: {
        accept: "text/html,application/xhtml+xml",
        "accept-language": acceptLanguage,
        "user-agent":
          "Mozilla/5.0 (compatible; SavlivoPricing/1.1)"
      },
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`HTTP_${response.status}`);
    return await response.text();
  } finally {
    clearTimeout(timer);
  }
}


export type GeoFetchTransport =
  | "direct"
  | "geo-fetch";

export type CountryFetchResult = {
  text: string;
  finalUrl: string;
  transport: GeoFetchTransport;
  requestedCountryCode: string;
  reportedExitCountryCode?: string;
};

export type GeoFetchConfig = {
  endpoint: string;
  token?: string;
};

type CountryFetchOptions = {
  acceptLanguage?: string;
};

export function geoFetchConfigFromEnv(
  env: NodeJS.ProcessEnv =
    process.env
): GeoFetchConfig | null {
  const rawEndpoint =
    env.SAVLIVO_GEOFETCH_ENDPOINT
      ?.trim();

  if (!rawEndpoint) {
    return null;
  }

  let endpoint: URL;

  try {
    endpoint =
      new URL(rawEndpoint);
  } catch {
    throw new Error(
      "INVALID_GEOFETCH_ENDPOINT"
    );
  }

  if (
    endpoint.protocol !== "http:" &&
    endpoint.protocol !== "https:"
  ) {
    throw new Error(
      "INVALID_GEOFETCH_ENDPOINT"
    );
  }

  const token =
    env.SAVLIVO_GEOFETCH_TOKEN
      ?.trim();

  return {
    endpoint:
      endpoint.toString(),
    ...(token
      ? { token }
      : {})
  };
}

function normalizeCountryCode(
  value: string
): string {
  const normalized =
    value
      .trim()
      .toUpperCase();

  if (
    !/^[A-Z]{2}$/.test(
      normalized
    )
  ) {
    throw new Error(
      "INVALID_GEOFETCH_COUNTRY"
    );
  }

  return normalized;
}

export async function fetchCountryText(
  url: string,
  countryCode: string,
  options: CountryFetchOptions = {}
): Promise<CountryFetchResult> {
  const requestedCountryCode =
    normalizeCountryCode(
      countryCode
    );

  const acceptLanguage =
    options.acceptLanguage ??
    "en";

  const config =
    geoFetchConfigFromEnv();

  /*
   * GeoFetch is disabled by default.
   *
   * When no gateway is configured, preserve the existing
   * direct-fetch semantics. No current pricing adapter calls
   * this function yet, so adding the foundation itself cannot
   * change provider pricing behavior.
   */
  if (!config) {
    return {
      text:
        await fetchText(
          url,
          acceptLanguage
        ),
      finalUrl: url,
      transport: "direct",
      requestedCountryCode
    };
  }

  /*
   * The GeoFetch gateway is intentionally provider-neutral.
   *
   * Savlivo sends the target URL, requested exit country and
   * target request headers to a server-side gateway. The
   * gateway credential is sent only to that gateway and never
   * forwarded as a target-site credential.
   *
   * A gateway response may report its exit country, but that
   * metadata is NOT sufficient to make pricing authoritative.
   * Provider-specific parsers must still independently verify
   * the returned market / territory / currency before creating
   * official-provider-structured candidates.
   */
  const controller =
    new AbortController();

  const timer =
    setTimeout(
      () =>
        controller.abort(),
      12000
    );

  try {
    const headers:
      Record<string, string> = {
        accept:
          "application/json",
        "content-type":
          "application/json"
      };

    if (config.token) {
      headers.authorization =
        "Bearer " +
        config.token;
    }

    const response =
      await fetch(
        config.endpoint,
        {
          method: "POST",
          headers,
          body:
            JSON.stringify({
              url,
              countryCode:
                requestedCountryCode,
              headers: {
                accept:
                  "text/html,application/xhtml+xml",
                "accept-language":
                  acceptLanguage,
                "user-agent":
                  "Mozilla/5.0 (compatible; SavlivoPricing/1.1)"
              }
            }),
          signal:
            controller.signal
        }
      );

    if (!response.ok) {
      throw new Error(
        `GEOFETCH_HTTP_${response.status}`
      );
    }

    const payload:
      unknown =
      await response.json();

    if (
      !payload ||
      typeof payload !== "object"
    ) {
      throw new Error(
        "INVALID_GEOFETCH_RESPONSE"
      );
    }

    const record =
      payload as
        Record<string, unknown>;

    if (
      typeof record.text !==
      "string"
    ) {
      throw new Error(
        "INVALID_GEOFETCH_RESPONSE"
      );
    }

    const finalUrl =
      typeof record.finalUrl ===
        "string" &&
      record.finalUrl.trim()
        ? record.finalUrl
        : url;

    const rawExitCountryCode =
      typeof record.exitCountryCode ===
        "string"
        ? record.exitCountryCode
        : "";

    let reportedExitCountryCode:
      string | undefined;

    if (rawExitCountryCode) {
      reportedExitCountryCode =
        normalizeCountryCode(
          rawExitCountryCode
        );
    }

    return {
      text:
        record.text,
      finalUrl,
      transport:
        "geo-fetch",
      requestedCountryCode,
      ...(reportedExitCountryCode
        ? {
            reportedExitCountryCode
          }
        : {})
    };
  } finally {
    clearTimeout(timer);
  }
}

function htmlToText(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function parseNumber(raw: string) {
  const cleaned = raw.replace(/[^\d,.-]/g, "").trim();
  if (!cleaned) return null;

  let normalized = cleaned;
  if (cleaned.includes(",") && cleaned.includes(".")) {
    normalized =
      cleaned.lastIndexOf(",") > cleaned.lastIndexOf(".")
        ? cleaned.replace(/\./g, "").replace(",", ".")
        : cleaned.replace(/,/g, "");
  } else if (cleaned.includes(",")) {
    const last = cleaned.split(",").at(-1) ?? "";
    normalized =
      last.length <= 2
        ? cleaned.replace(/\./g, "").replace(",", ".")
        : cleaned.replace(/,/g, "");
  }
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

function slugify(name: string) {
  return name
    .toLowerCase()
    .replace(/\+/g, " plus ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function allRoutes(
  base: Omit<AdapterPrice, "billingProviderSlug">
): AdapterPrice[] {
  return billingRoutes.map((billingProviderSlug) => ({
    ...base,
    billingProviderSlug
  }));
}

function withBillingRoute(
  base: Omit<AdapterPrice, "billingProviderSlug">,
  billingProviderSlug: BillingProviderSlug
): AdapterPrice[] {
  return [{
    ...base,
    billingProviderSlug
  }];
}

function exact(
  serviceSlug: string,
  planName: string,
  countryCode: string,
  currency: string,
  amount: number,
  sourceUrl: string
) {
  return allRoutes({
    serviceSlug,
    planSlug: slugify(planName),
    planName,
    countryCode,
    currency,
    monthlyPriceMinor: Math.round(amount * 100),
    updatedAt: new Date().toISOString(),
    source: `official-provider-adapter:${serviceSlug}`,
    sourceUrl,
    confidence: "official-provider-adapter",
    priceType: "exact"
  });
}

function exactForRoute(
  serviceSlug: string,
  planName: string,
  countryCode: string,
  currency: string,
  amount: number,
  sourceUrl: string,
  billingProviderSlug: BillingProviderSlug
) {
  return withBillingRoute(
    {
      serviceSlug,
      planSlug: slugify(planName),
      planName,
      countryCode,
      currency,
      monthlyPriceMinor: Math.round(amount * 100),
      updatedAt: new Date().toISOString(),
      source: `official-provider-adapter:${serviceSlug}`,
      sourceUrl,
      confidence: "official-provider-adapter",
      priceType: "exact"
    },
    billingProviderSlug
  );
}

function currencyPattern(currency: string) {
  const map: Record<string, string> = {
    USD: "(?:US\\$|\\$|USD)",
    CAD: "(?:CA\\$|CAD)",
    MXN: "(?:MX\\$|MXN)",
    BRL: "(?:R\\$|BRL)",
    ARS: "(?:ARS|\\$)",
    GBP: "(?:£|GBP)",
    EUR: "(?:€|EUR)",
    NOK: "(?:kr|NOK)",
    SEK: "(?:kr|SEK)",
    DKK: "(?:kr|DKK)",
    ISK: "(?:kr|ISK)",
    CHF: "(?:CHF)",
    PLN: "(?:zł|PLN)",
    CZK: "(?:Kč|CZK)",
    HUF: "(?:Ft|HUF)",
    RON: "(?:lei|RON)",
    AUD: "(?:A\\$|AUD)",
    NZD: "(?:NZ\\$|NZD)",
    JPY: "(?:¥|JPY)",
    KRW: "(?:₩|KRW)",
    CNY: "(?:¥|CNY)",
    HKD: "(?:HK\\$|HKD)",
    TWD: "(?:NT\\$|TWD)",
    SGD: "(?:S\\$|SGD)",
    INR: "(?:₹|INR)",
    IDR: "(?:Rp|IDR)",
    MYR: "(?:RM|MYR)",
    THB: "(?:฿|THB)",
    PHP: "(?:₱|PHP)",
    VND: "(?:₫|VND)",
    AED: "(?:AED)",
    SAR: "(?:SAR|ر\\.س)",
    ILS: "(?:₪|ILS)",
    TRY: "(?:₺|TRY)",
    UAH: "(?:₴|UAH)",
    ZAR: "(?:R|ZAR)"
  };
  return map[currency] ?? `(?:${currency})`;
}

function findPriceNearPlan(
  text: string,
  planNames: string[],
  currency: string
): { planName: string; amount: number }[] {
  const token = currencyPattern(currency);
  const out: { planName: string; amount: number }[] = [];

  // Match longer/more-specific names first.
  // This prevents "Standard" matching inside "Standard with Ads",
  // and "Basic" matching inside "Basic with Ads".
  const orderedPlanNames = [...planNames].sort(
    (a, b) => b.length - a.length
  );

  for (const planName of orderedPlanNames) {
    const escapedPlan = planName.replace(
      /[.*+?^${}()|[\]\\]/g,
      "\\$&"
    );

    const longerSuffixes = orderedPlanNames
      .filter(
        (candidate) =>
          candidate.length > planName.length &&
          candidate
            .toLowerCase()
            .startsWith(planName.toLowerCase())
      )
      .map((candidate) =>
        candidate
          .slice(planName.length)
          .trim()
          .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
          .replace(/\s+/g, "\\s+")
      )
      .filter(Boolean);

    const suffixGuard = longerSuffixes.length
      ? `(?!\\s+(?:${longerSuffixes.join("|")}))`
      : "";

    const p = `${escapedPlan}${suffixGuard}`;

    const patterns = [
      new RegExp(
        `${p}.{0,120}?${token}\\s*([\\d.,\\s]+).{0,40}?(?:month|monthly|måned|månad|monat|mese|mes|mois|maand)`,
        "i"
      ),
      new RegExp(
        `${p}.{0,120}?([\\d.,\\s]+)\\s*${token}.{0,40}?(?:month|monthly|måned|månad|monat|mese|mes|mois|maand)`,
        "i"
      ),
      new RegExp(
        `${token}\\s*([\\d.,\\s]+).{0,70}?${p}`,
        "i"
      ),
      new RegExp(
        `([\\d.,\\s]+)\\s*${token}.{0,70}?${p}`,
        "i"
      )
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      const n = parseNumber(match?.[1] ?? "");

      if (n != null && n > 0) {
        out.push({
          planName,
          amount: n
        });
        break;
      }
    }
  }

  // Conservative validation:
  // if multiple different plans resolve to exactly the same price,
  // the scraped page is probably ambiguous. Drop those results
  // instead of claiming they are verified exact plan prices.
  const plansByAmount = new Map<number, Set<string>>();

  for (const row of out) {
    const plans =
      plansByAmount.get(row.amount) ??
      new Set<string>();

    plans.add(row.planName);
    plansByAmount.set(row.amount, plans);
  }

  const ambiguousAmounts = new Set(
    [...plansByAmount.entries()]
      .filter(([, plans]) => plans.size > 1)
      .map(([amount]) => amount)
  );

  return out.filter(
    (row) => !ambiguousAmounts.has(row.amount)
  );
}

// Netflix often exposes only a verified local range publicly.
// Keep that as a range instead of inventing tier-level prices.

export const verifiedProviderRegistry: Record<
  string,
  Array<{
    serviceSlug: string;
    planName: string;
    currency: string;
    monthlyPriceMinor: number;
    sourceUrl: string;
    billingProviderSlug?: BillingProviderSlug;
  }>
> = {
  NO: [
    /*
     * VERIFIED NORWAY PRICES
     *
     * Keep these as route-specific catalog prices.
     * Do not copy them to other billing routes unless
     * that route has been independently verified.
     */

    // SPOTIFY — direct web billing
    {
      serviceSlug: "spotify",
      planName: "Individual",
      currency: "NOK",
      monthlyPriceMinor: 13900,
      sourceUrl: "https://www.spotify.com/no-en/premium/",
      billingProviderSlug: "direct"
    },
    {
      serviceSlug: "spotify",
      planName: "Duo",
      currency: "NOK",
      monthlyPriceMinor: 18900,
      sourceUrl: "https://www.spotify.com/no-en/premium/",
      billingProviderSlug: "direct"
    },
    {
      serviceSlug: "spotify",
      planName: "Family",
      currency: "NOK",
      monthlyPriceMinor: 21900,
      sourceUrl: "https://www.spotify.com/no-en/premium/",
      billingProviderSlug: "direct"
    },
    {
      serviceSlug: "spotify",
      planName: "Student",
      currency: "NOK",
      monthlyPriceMinor: 7500,
      sourceUrl: "https://www.spotify.com/no-en/premium/",
      billingProviderSlug: "direct"
    },

    // APPLE MUSIC — Apple billing
    {
      serviceSlug: "apple-music",
      planName: "Individual",
      currency: "NOK",
      monthlyPriceMinor: 13900,
      sourceUrl: "https://www.apple.com/no/apple-music/",
      billingProviderSlug: "apple"
    },
    {
      serviceSlug: "apple-music",
      planName: "Family",
      currency: "NOK",
      monthlyPriceMinor: 21900,
      sourceUrl: "https://www.apple.com/no/apple-music/",
      billingProviderSlug: "apple"
    },
    {
      serviceSlug: "apple-music",
      planName: "Student",
      currency: "NOK",
      monthlyPriceMinor: 7500,
      sourceUrl: "https://www.apple.com/no/apple-music/",
      billingProviderSlug: "apple"
    },

    // APPLE TV — Apple billing
    {
      serviceSlug: "apple-tv-plus",
      planName: "Apple TV",
      currency: "NOK",
      monthlyPriceMinor: 11900,
      sourceUrl: "https://tv.apple.com/no",
      billingProviderSlug: "apple"
    },

    // MICROSOFT 365 — direct Microsoft billing
    {
      serviceSlug: "microsoft-365",
      planName: "Basic",
      currency: "NOK",
      monthlyPriceMinor: 2000,
      sourceUrl:
        "https://www.microsoft.com/nb-no/microsoft-365/explore-microsoft-365-for-individuals",
      billingProviderSlug: "direct"
    },
    {
      serviceSlug: "microsoft-365",
      planName: "Personal",
      currency: "NOK",
      monthlyPriceMinor: 12100,
      sourceUrl:
        "https://www.microsoft.com/nb-no/microsoft-365/buy/compare-all-microsoft-365-products",
      billingProviderSlug: "direct"
    },
    {
      serviceSlug: "microsoft-365",
      planName: "Family",
      currency: "NOK",
      monthlyPriceMinor: 15500,
      sourceUrl:
        "https://www.microsoft.com/nb-no/microsoft-365/buy/compare-all-microsoft-365-products",
      billingProviderSlug: "direct"
    },
    {
      serviceSlug: "microsoft-365",
      planName: "Premium",
      currency: "NOK",
      monthlyPriceMinor: 25900,
      sourceUrl:
        "https://www.microsoft.com/nb-no/microsoft-365/buy/compare-all-microsoft-365-products",
      billingProviderSlug: "direct"
    },

    // ICLOUD+ — Apple billing
    //
    // Apple currently exposes clean NOK values for these
    // tiers in its Norway-facing product/support material.
    {
      serviceSlug: "icloud-plus",
      planName: "50 GB",
      currency: "NOK",
      monthlyPriceMinor: 1200,
      sourceUrl: "https://www.apple.com/no/apple-one/",
      billingProviderSlug: "apple"
    },
    {
      serviceSlug: "icloud-plus",
      planName: "200 GB",
      currency: "NOK",
      monthlyPriceMinor: 3900,
      sourceUrl: "https://www.apple.com/no/apple-one/",
      billingProviderSlug: "apple"
    },
    {
      serviceSlug: "icloud-plus",
      planName: "2 TB",
      currency: "NOK",
      monthlyPriceMinor: 12900,
      sourceUrl: "https://support.apple.com/no-no/108047",
      billingProviderSlug: "apple"
    },
    {
      serviceSlug: "icloud-plus",
      planName: "12 TB",
      currency: "NOK",
      monthlyPriceMinor: 79900,
      sourceUrl: "https://support.apple.com/no-no/108047",
      billingProviderSlug: "apple"
    },
    // GOOGLE ONE — direct Google billing
    //
    // Norway recurring monthly prices.
    // Temporary first-month promotional prices are intentionally excluded.
    {
      serviceSlug: "google-one",
      planName: "Storage 100 GB",
      currency: "NOK",
      monthlyPriceMinor: 2400,
      sourceUrl: "https://one.google.com/plans?g1_last_touchpoint=39&g1_landing_page=0",
      billingProviderSlug: "direct"
    },
    {
      serviceSlug: "google-one",
      planName: "Storage 200 GB",
      currency: "NOK",
      monthlyPriceMinor: 3400,
      sourceUrl: "https://one.google.com/plans?g1_last_touchpoint=39&g1_landing_page=0",
      billingProviderSlug: "direct"
    },
    {
      serviceSlug: "google-one",
      planName: "Google AI Plus — 400 GB",
      currency: "NOK",
      monthlyPriceMinor: 6400,
      sourceUrl: "https://one.google.com/plans?g1_last_touchpoint=39&g1_landing_page=0",
      billingProviderSlug: "direct"
    },
    {
      serviceSlug: "google-one",
      planName: "Google AI Plus — 2 TB",
      currency: "NOK",
      monthlyPriceMinor: 12500,
      sourceUrl: "https://one.google.com/plans?g1_last_touchpoint=39&g1_landing_page=0",
      billingProviderSlug: "direct"
    },
    {
      serviceSlug: "google-one",
      planName: "Google AI Pro — 5 TB",
      currency: "NOK",
      monthlyPriceMinor: 25900,
      sourceUrl: "https://one.google.com/plans?g1_last_touchpoint=39&g1_landing_page=0",
      billingProviderSlug: "direct"
    },
    {
      serviceSlug: "google-one",
      planName: "Google AI Pro — 10 TB",
      currency: "NOK",
      monthlyPriceMinor: 52900,
      sourceUrl: "https://one.google.com/plans?g1_last_touchpoint=39&g1_landing_page=0",
      billingProviderSlug: "direct"
    },
    {
      serviceSlug: "google-one",
      planName: "Google AI Ultra 5x — 20 TB",
      currency: "NOK",
      monthlyPriceMinor: 105900,
      sourceUrl: "https://one.google.com/plans?g1_last_touchpoint=39&g1_landing_page=0",
      billingProviderSlug: "direct"
    },
    {
      serviceSlug: "google-one",
      planName: "Google AI Ultra 20x — 30 TB",
      currency: "NOK",
      monthlyPriceMinor: 259900,
      sourceUrl: "https://one.google.com/plans?g1_last_touchpoint=39&g1_landing_page=0",
      billingProviderSlug: "direct"
    },

    {
      serviceSlug: "youtube-premium",
      planName: "Individual",
      currency: "NOK",
      monthlyPriceMinor: 16900,
      sourceUrl: "https://www.youtube.com/premium",
      billingProviderSlug: "direct"
    },

    {
      serviceSlug: "prime-video",
      planName: "Prime Video",
      currency: "NOK",
      monthlyPriceMinor: 7900,
      sourceUrl: "https://www.primevideo.com/",
      billingProviderSlug: "direct"
    },

    {
      serviceSlug: "max",
      planName: "Basic With Ads",
      currency: "NOK",
      monthlyPriceMinor: 8900,
      sourceUrl: "https://www.max.com/no/en"
    },
    {
      serviceSlug: "max",
      planName: "Standard",
      currency: "NOK",
      monthlyPriceMinor: 14900,
      sourceUrl: "https://www.max.com/no/en"
    },
    {
      serviceSlug: "max",
      planName: "Premium",
      currency: "NOK",
      monthlyPriceMinor: 18900,
      sourceUrl: "https://www.max.com/no/en"
    },

    {
      serviceSlug: "disney-plus",
      planName: "Standard with Ads",
      currency: "NOK",
      monthlyPriceMinor: 6900,
      sourceUrl: "https://www.disneyplus.com/nb-no"
    },
    {
      serviceSlug: "disney-plus",
      planName: "Standard",
      currency: "NOK",
      monthlyPriceMinor: 10900,
      sourceUrl: "https://www.disneyplus.com/nb-no"
    },
    {
      serviceSlug: "disney-plus",
      planName: "Premium",
      currency: "NOK",
      monthlyPriceMinor: 15900,
      sourceUrl: "https://www.disneyplus.com/nb-no"
    },
    {
      serviceSlug: "netflix",
      planName: "Basic",
      currency: "NOK",
      monthlyPriceMinor: 11900,
      sourceUrl: "https://www.netflix.com/no/"
    },
    {
      serviceSlug: "netflix",
      planName: "Standard",
      currency: "NOK",
      monthlyPriceMinor: 14900,
      sourceUrl: "https://www.netflix.com/no/"
    },
    {
      serviceSlug: "netflix",
      planName: "Premium",
      currency: "NOK",
      monthlyPriceMinor: 21900,
      sourceUrl: "https://www.netflix.com/no/"
    }
  ],
  US: [
    {
      serviceSlug: "amazon-prime",
      planName: "Amazon Prime",
      currency: "USD",
      monthlyPriceMinor: 1499,
      sourceUrl: "https://www.amazon.com/prime",
      billingProviderSlug: "amazon"
    },

    {
      serviceSlug: "youtube-premium",
      planName: "Individual",
      currency: "USD",
      monthlyPriceMinor: 1599,
      sourceUrl: "https://www.youtube.com/premium",
      billingProviderSlug: "direct"
    },

    {
      serviceSlug: "prime-video",
      planName: "Prime Video",
      currency: "USD",
      monthlyPriceMinor: 899,
      sourceUrl: "https://www.amazon.com/gp/help/customer/display.html?nodeId=G34EUPKVMYFW8N2U",
      billingProviderSlug: "amazon"
    },
    {
      serviceSlug: "netflix",
      planName: "Standard with Ads",
      currency: "USD",
      monthlyPriceMinor: 899,
      sourceUrl: "https://www.netflix.com/us/"
    },
    {
      serviceSlug: "netflix",
      planName: "Standard",
      currency: "USD",
      monthlyPriceMinor: 1999,
      sourceUrl: "https://www.netflix.com/us/"
    },
    {
      serviceSlug: "netflix",
      planName: "Premium",
      currency: "USD",
      monthlyPriceMinor: 2699,
      sourceUrl: "https://www.netflix.com/us/"
    },

    {
      serviceSlug: "max",
      planName: "Basic With Ads",
      currency: "USD",
      monthlyPriceMinor: 1099,
      sourceUrl: "https://www.max.com/us/en"
    },
    {
      serviceSlug: "max",
      planName: "Standard",
      currency: "USD",
      monthlyPriceMinor: 1849,
      sourceUrl: "https://www.max.com/us/en"
    },

    {
      serviceSlug: "disney-plus",
      planName: "Disney+ With Ads",
      currency: "USD",
      monthlyPriceMinor: 1199,
      sourceUrl: "https://help.disneyplus.com/article/disneyplus-price"
    },
    {
      serviceSlug: "disney-plus",
      planName: "Disney+ Premium",
      currency: "USD",
      monthlyPriceMinor: 1899,
      sourceUrl: "https://help.disneyplus.com/article/disneyplus-price"
    }
  ],
  DK: [
    {
      serviceSlug: "prime-video",
      planName: "Prime Video",
      currency: "DKK",
      monthlyPriceMinor: 5900,
      sourceUrl: "https://www.primevideo.com/",
      billingProviderSlug: "direct"
    },

    {
      serviceSlug: "youtube-premium",
      planName: "Individual",
      currency: "DKK",
      monthlyPriceMinor: 13900,
      sourceUrl: "https://www.youtube.com/premium",
      billingProviderSlug: "direct"
    },

    {
      serviceSlug: "netflix",
      planName: "Basic",
      currency: "DKK",
      monthlyPriceMinor: 10900,
      sourceUrl: "https://www.netflix.com/dk/title/80193549"
    },
    {
      serviceSlug: "netflix",
      planName: "Standard",
      currency: "DKK",
      monthlyPriceMinor: 14900,
      sourceUrl: "https://www.netflix.com/dk/title/80193549"
    },
    {
      serviceSlug: "netflix",
      planName: "Premium",
      currency: "DKK",
      monthlyPriceMinor: 18900,
      sourceUrl: "https://www.netflix.com/dk/title/80193549"
    },
    {
      serviceSlug: "max",
      planName: "Basic With Ads",
      currency: "DKK",
      monthlyPriceMinor: 7900,
      sourceUrl: "https://www.max.com/dk/en"
    },
    {
      serviceSlug: "max",
      planName: "Standard",
      currency: "DKK",
      monthlyPriceMinor: 12900,
      sourceUrl: "https://www.max.com/dk/en"
    },
    {
      serviceSlug: "max",
      planName: "Premium",
      currency: "DKK",
      monthlyPriceMinor: 16900,
      sourceUrl: "https://www.max.com/dk/en"
    },

    {
      serviceSlug: "disney-plus",
      planName: "Standard with Ads",
      currency: "DKK",
      monthlyPriceMinor: 5900,
      sourceUrl: "https://www.disneyplus.com/da-dk"
    },
    {
      serviceSlug: "disney-plus",
      planName: "Standard",
      currency: "DKK",
      monthlyPriceMinor: 9900,
      sourceUrl: "https://www.disneyplus.com/da-dk"
    },
    {
      serviceSlug: "disney-plus",
      planName: "Premium",
      currency: "DKK",
      monthlyPriceMinor: 14900,
      sourceUrl: "https://www.disneyplus.com/da-dk"
    }
  ],
  DE: [
    {
      serviceSlug: "amazon-prime",
      planName: "Amazon Prime",
      currency: "EUR",
      monthlyPriceMinor: 899,
      sourceUrl: "https://www.amazon.de/amazonprime",
      billingProviderSlug: "amazon"
    },

    {
      serviceSlug: "youtube-premium",
      planName: "Individual",
      currency: "EUR",
      monthlyPriceMinor: 1499,
      sourceUrl: "https://www.youtube.com/premium",
      billingProviderSlug: "direct"
    },

    {
      serviceSlug: "netflix",
      planName: "Standard with Ads",
      currency: "EUR",
      monthlyPriceMinor: 499,
      sourceUrl: "https://www.netflix.com/de/"
    },
    {
      serviceSlug: "netflix",
      planName: "Standard",
      currency: "EUR",
      monthlyPriceMinor: 1399,
      sourceUrl: "https://www.netflix.com/de/"
    },
    {
      serviceSlug: "netflix",
      planName: "Premium",
      currency: "EUR",
      monthlyPriceMinor: 1999,
      sourceUrl: "https://www.netflix.com/de/"
    },
    {
      serviceSlug: "max",
      planName: "Basic With Ads",
      currency: "EUR",
      monthlyPriceMinor: 599,
      sourceUrl: "https://www.max.com/de/en"
    },
    {
      serviceSlug: "max",
      planName: "Standard",
      currency: "EUR",
      monthlyPriceMinor: 1199,
      sourceUrl: "https://www.max.com/de/en"
    },
    {
      serviceSlug: "max",
      planName: "Premium",
      currency: "EUR",
      monthlyPriceMinor: 1699,
      sourceUrl: "https://www.max.com/de/en"
    },

    {
      serviceSlug: "disney-plus",
      planName: "Standard with Ads",
      currency: "EUR",
      monthlyPriceMinor: 699,
      sourceUrl: "https://www.disneyplus.com/de-de"
    },
    {
      serviceSlug: "disney-plus",
      planName: "Standard",
      currency: "EUR",
      monthlyPriceMinor: 1099,
      sourceUrl: "https://www.disneyplus.com/de-de"
    },
    {
      serviceSlug: "disney-plus",
      planName: "Premium",
      currency: "EUR",
      monthlyPriceMinor: 1599,
      sourceUrl: "https://www.disneyplus.com/de-de"
    }
  ],
  FR: [
    {
      serviceSlug: "amazon-prime",
      planName: "Amazon Prime",
      currency: "EUR",
      monthlyPriceMinor: 690,
      sourceUrl: "https://www.amazon.fr/amazonprime",
      billingProviderSlug: "amazon"
    },

    {
      serviceSlug: "youtube-premium",
      planName: "Individual",
      currency: "EUR",
      monthlyPriceMinor: 1299,
      sourceUrl: "https://www.youtube.com/premium",
      billingProviderSlug: "direct"
    },

    {
      serviceSlug: "netflix",
      planName: "Standard with Ads",
      currency: "EUR",
      monthlyPriceMinor: 799,
      sourceUrl: "https://www.netflix.com/fr/title/80193549"
    },
    {
      serviceSlug: "netflix",
      planName: "Standard",
      currency: "EUR",
      monthlyPriceMinor: 1499,
      sourceUrl: "https://www.netflix.com/fr/title/80193549"
    },
    {
      serviceSlug: "netflix",
      planName: "Premium",
      currency: "EUR",
      monthlyPriceMinor: 2199,
      sourceUrl: "https://www.netflix.com/fr/title/80193549"
    },
    {
      serviceSlug: "max",
      planName: "Basic With Ads",
      currency: "EUR",
      monthlyPriceMinor: 699,
      sourceUrl: "https://www.max.com/fr/en"
    },
    {
      serviceSlug: "max",
      planName: "Standard",
      currency: "EUR",
      monthlyPriceMinor: 1099,
      sourceUrl: "https://www.max.com/fr/en"
    },
    {
      serviceSlug: "max",
      planName: "Premium",
      currency: "EUR",
      monthlyPriceMinor: 1599,
      sourceUrl: "https://www.max.com/fr/en"
    },

    {
      serviceSlug: "disney-plus",
      planName: "Standard with Ads",
      currency: "EUR",
      monthlyPriceMinor: 699,
      sourceUrl: "https://www.disneyplus.com/fr-fr"
    },
    {
      serviceSlug: "disney-plus",
      planName: "Standard",
      currency: "EUR",
      monthlyPriceMinor: 1099,
      sourceUrl: "https://www.disneyplus.com/fr-fr"
    },
    {
      serviceSlug: "disney-plus",
      planName: "Premium",
      currency: "EUR",
      monthlyPriceMinor: 1599,
      sourceUrl: "https://www.disneyplus.com/fr-fr"
    }
  ],
  IT: [
    {
      serviceSlug: "amazon-prime",
      planName: "Amazon Prime",
      currency: "EUR",
      monthlyPriceMinor: 499,
      sourceUrl: "https://www.amazon.it/prime",
      billingProviderSlug: "amazon"
    },

    {
      serviceSlug: "youtube-premium",
      planName: "Individual",
      currency: "EUR",
      monthlyPriceMinor: 1599,
      sourceUrl: "https://www.youtube.com/premium",
      billingProviderSlug: "direct"
    },

    {
      serviceSlug: "netflix",
      planName: "Standard with Ads",
      currency: "EUR",
      monthlyPriceMinor: 699,
      sourceUrl: "https://www.netflix.com/it/title/81769841"
    },
    {
      serviceSlug: "netflix",
      planName: "Standard",
      currency: "EUR",
      monthlyPriceMinor: 1399,
      sourceUrl: "https://www.netflix.com/it/title/81769841"
    },
    {
      serviceSlug: "netflix",
      planName: "Premium",
      currency: "EUR",
      monthlyPriceMinor: 1999,
      sourceUrl: "https://www.netflix.com/it/title/81769841"
    },
    {
      serviceSlug: "max",
      planName: "Basic With Ads",
      currency: "EUR",
      monthlyPriceMinor: 699,
      sourceUrl: "https://www.max.com/it/en"
    },
    {
      serviceSlug: "max",
      planName: "Standard",
      currency: "EUR",
      monthlyPriceMinor: 1199,
      sourceUrl: "https://www.max.com/it/en"
    },
    {
      serviceSlug: "max",
      planName: "Premium",
      currency: "EUR",
      monthlyPriceMinor: 1699,
      sourceUrl: "https://www.max.com/it/en"
    },

    {
      serviceSlug: "disney-plus",
      planName: "Standard with Ads",
      currency: "EUR",
      monthlyPriceMinor: 699,
      sourceUrl: "https://www.disneyplus.com/it-it"
    },
    {
      serviceSlug: "disney-plus",
      planName: "Standard",
      currency: "EUR",
      monthlyPriceMinor: 1099,
      sourceUrl: "https://www.disneyplus.com/it-it"
    },
    {
      serviceSlug: "disney-plus",
      planName: "Premium",
      currency: "EUR",
      monthlyPriceMinor: 1599,
      sourceUrl: "https://www.disneyplus.com/it-it"
    }
  ],
  ES: [
    {
      serviceSlug: "amazon-prime",
      planName: "Amazon Prime",
      currency: "EUR",
      monthlyPriceMinor: 499,
      sourceUrl: "https://www.amazon.es/amazonprime",
      billingProviderSlug: "amazon"
    },

    {
      serviceSlug: "youtube-premium",
      planName: "Individual",
      currency: "EUR",
      monthlyPriceMinor: 1599,
      sourceUrl: "https://www.youtube.com/premium",
      billingProviderSlug: "direct"
    },

    {
      serviceSlug: "netflix",
      planName: "Standard with Ads",
      currency: "EUR",
      monthlyPriceMinor: 899,
      sourceUrl: "https://www.netflix.com/es/title/80193549"
    },
    {
      serviceSlug: "netflix",
      planName: "Standard",
      currency: "EUR",
      monthlyPriceMinor: 1499,
      sourceUrl: "https://www.netflix.com/es/title/80193549"
    },
    {
      serviceSlug: "netflix",
      planName: "Premium",
      currency: "EUR",
      monthlyPriceMinor: 2199,
      sourceUrl: "https://www.netflix.com/es/title/80193549"
    },
    {
      serviceSlug: "max",
      planName: "Basic With Ads",
      currency: "EUR",
      monthlyPriceMinor: 699,
      sourceUrl: "https://www.max.com/es/en"
    },
    {
      serviceSlug: "max",
      planName: "Standard",
      currency: "EUR",
      monthlyPriceMinor: 1099,
      sourceUrl: "https://www.max.com/es/en"
    },
    {
      serviceSlug: "max",
      planName: "Premium",
      currency: "EUR",
      monthlyPriceMinor: 1599,
      sourceUrl: "https://www.max.com/es/en"
    },

    {
      serviceSlug: "disney-plus",
      planName: "Standard with Ads",
      currency: "EUR",
      monthlyPriceMinor: 699,
      sourceUrl: "https://www.disneyplus.com/es-es"
    },
    {
      serviceSlug: "disney-plus",
      planName: "Standard",
      currency: "EUR",
      monthlyPriceMinor: 1099,
      sourceUrl: "https://www.disneyplus.com/es-es"
    },
    {
      serviceSlug: "disney-plus",
      planName: "Premium",
      currency: "EUR",
      monthlyPriceMinor: 1599,
      sourceUrl: "https://www.disneyplus.com/es-es"
    }
  ],
  PT: [
    {
      serviceSlug: "amazon-prime",
      planName: "Amazon Prime",
      currency: "EUR",
      monthlyPriceMinor: 499,
      sourceUrl: "https://www.amazon.es/amazonprime",
      billingProviderSlug: "amazon"
    },

    {
      serviceSlug: "netflix",
      planName: "Basic",
      currency: "EUR",
      monthlyPriceMinor: 899,
      sourceUrl: "https://www.netflix.com/pt/title/80193549"
    },
    {
      serviceSlug: "netflix",
      planName: "Standard",
      currency: "EUR",
      monthlyPriceMinor: 1299,
      sourceUrl: "https://www.netflix.com/pt/title/80193549"
    },
    {
      serviceSlug: "netflix",
      planName: "Premium",
      currency: "EUR",
      monthlyPriceMinor: 1799,
      sourceUrl: "https://www.netflix.com/pt/title/80193549"
    },
    {
      serviceSlug: "max",
      planName: "Basic With Ads",
      currency: "EUR",
      monthlyPriceMinor: 599,
      sourceUrl: "https://www.max.com/pt/en"
    },
    {
      serviceSlug: "max",
      planName: "Standard",
      currency: "EUR",
      monthlyPriceMinor: 999,
      sourceUrl: "https://www.max.com/pt/en"
    },
    {
      serviceSlug: "max",
      planName: "Premium",
      currency: "EUR",
      monthlyPriceMinor: 1399,
      sourceUrl: "https://www.max.com/pt/en"
    },

    {
      serviceSlug: "disney-plus",
      planName: "Standard with Ads",
      currency: "EUR",
      monthlyPriceMinor: 699,
      sourceUrl: "https://www.disneyplus.com/pt-pt"
    },
    {
      serviceSlug: "disney-plus",
      planName: "Standard",
      currency: "EUR",
      monthlyPriceMinor: 1099,
      sourceUrl: "https://www.disneyplus.com/pt-pt"
    },
    {
      serviceSlug: "disney-plus",
      planName: "Premium",
      currency: "EUR",
      monthlyPriceMinor: 1599,
      sourceUrl: "https://www.disneyplus.com/pt-pt"
    }
  ],
  NL: [
    {
      serviceSlug: "amazon-prime",
      planName: "Amazon Prime",
      currency: "EUR",
      monthlyPriceMinor: 499,
      sourceUrl: "https://www.amazon.nl/prime",
      billingProviderSlug: "amazon"
    },

    {
      serviceSlug: "youtube-premium",
      planName: "Individual",
      currency: "EUR",
      monthlyPriceMinor: 1599,
      sourceUrl: "https://www.youtube.com/premium",
      billingProviderSlug: "direct"
    },

    {
      serviceSlug: "netflix",
      planName: "Basic",
      currency: "EUR",
      monthlyPriceMinor: 999,
      sourceUrl: "https://www.netflix.com/nl/title/80193549"
    },
    {
      serviceSlug: "netflix",
      planName: "Standard",
      currency: "EUR",
      monthlyPriceMinor: 1599,
      sourceUrl: "https://www.netflix.com/nl/title/80193549"
    },
    {
      serviceSlug: "netflix",
      planName: "Premium",
      currency: "EUR",
      monthlyPriceMinor: 2099,
      sourceUrl: "https://www.netflix.com/nl/title/80193549"
    },
    {
      serviceSlug: "max",
      planName: "Basic With Ads",
      currency: "EUR",
      monthlyPriceMinor: 599,
      sourceUrl: "https://www.max.com/nl/en"
    },
    {
      serviceSlug: "max",
      planName: "Standard",
      currency: "EUR",
      monthlyPriceMinor: 1199,
      sourceUrl: "https://www.max.com/nl/en"
    },
    {
      serviceSlug: "max",
      planName: "Premium",
      currency: "EUR",
      monthlyPriceMinor: 1699,
      sourceUrl: "https://www.max.com/nl/en"
    },

    {
      serviceSlug: "disney-plus",
      planName: "Standard with Ads",
      currency: "EUR",
      monthlyPriceMinor: 699,
      sourceUrl: "https://www.disneyplus.com/nl-nl"
    },
    {
      serviceSlug: "disney-plus",
      planName: "Standard",
      currency: "EUR",
      monthlyPriceMinor: 1099,
      sourceUrl: "https://www.disneyplus.com/nl-nl"
    },
    {
      serviceSlug: "disney-plus",
      planName: "Premium",
      currency: "EUR",
      monthlyPriceMinor: 1599,
      sourceUrl: "https://www.disneyplus.com/nl-nl"
    }
  ],
  BE: [
    {
      serviceSlug: "amazon-prime",
      planName: "Amazon Prime",
      currency: "EUR",
      monthlyPriceMinor: 299,
      sourceUrl: "https://www.amazon.com.be/prime",
      billingProviderSlug: "amazon"
    },

    {
      serviceSlug: "youtube-premium",
      planName: "Individual",
      currency: "EUR",
      monthlyPriceMinor: 1399,
      sourceUrl: "https://www.youtube.com/premium",
      billingProviderSlug: "direct"
    },

    {
      serviceSlug: "netflix",
      planName: "Basic",
      currency: "EUR",
      monthlyPriceMinor: 1099,
      sourceUrl: "https://www.netflix.com/be-fr/title/80193549"
    },
    {
      serviceSlug: "netflix",
      planName: "Standard",
      currency: "EUR",
      monthlyPriceMinor: 1699,
      sourceUrl: "https://www.netflix.com/be-fr/title/80193549"
    },
    {
      serviceSlug: "netflix",
      planName: "Premium",
      currency: "EUR",
      monthlyPriceMinor: 2199,
      sourceUrl: "https://www.netflix.com/be-fr/title/80193549"
    },
    {
      serviceSlug: "max",
      planName: "Basic With Ads",
      currency: "EUR",
      monthlyPriceMinor: 699,
      sourceUrl: "https://www.max.com/be/en"
    },
    {
      serviceSlug: "max",
      planName: "Standard",
      currency: "EUR",
      monthlyPriceMinor: 1099,
      sourceUrl: "https://www.max.com/be/en"
    },
    {
      serviceSlug: "max",
      planName: "Premium",
      currency: "EUR",
      monthlyPriceMinor: 1599,
      sourceUrl: "https://www.max.com/be/en"
    },

    {
      serviceSlug: "disney-plus",
      planName: "Standard with Ads",
      currency: "EUR",
      monthlyPriceMinor: 699,
      sourceUrl: "https://www.disneyplus.com/nl-be"
    },
    {
      serviceSlug: "disney-plus",
      planName: "Standard",
      currency: "EUR",
      monthlyPriceMinor: 1099,
      sourceUrl: "https://www.disneyplus.com/nl-be"
    },
    {
      serviceSlug: "disney-plus",
      planName: "Premium",
      currency: "EUR",
      monthlyPriceMinor: 1599,
      sourceUrl: "https://www.disneyplus.com/nl-be"
    }
,

    // APPLE MUSIC — Apple billing
    {
      serviceSlug: "apple-music",
      planName: "Individual",
      currency: "EUR",
      monthlyPriceMinor: 1199,
      sourceUrl:
        "https" + "://" + "www.apple.com/benl/apple-music/",
      billingProviderSlug: "apple"
    },
    {
      serviceSlug: "apple-music",
      planName: "Family",
      currency: "EUR",
      monthlyPriceMinor: 1999,
      sourceUrl:
        "https" + "://" + "www.apple.com/benl/apple-music/",
      billingProviderSlug: "apple"
    },
    {
      serviceSlug: "apple-music",
      planName: "Student",
      currency: "EUR",
      monthlyPriceMinor: 699,
      sourceUrl:
        "https" + "://" + "www.apple.com/benl/apple-music/",
      billingProviderSlug: "apple"
    },

    // APPLE TV — Apple billing
    {
      serviceSlug: "apple-tv-plus",
      planName: "Apple TV",
      currency: "EUR",
      monthlyPriceMinor: 999,
      sourceUrl:
        "https" + "://" + "tv.apple.com/be",
      billingProviderSlug: "apple"
    },

    // ICLOUD+ — Apple billing
    {
      serviceSlug: "icloud-plus",
      planName: "50 GB",
      currency: "EUR",
      monthlyPriceMinor: 99,
      sourceUrl:
        "https" + "://" + "support.apple.com/nl-be/108047",
      billingProviderSlug: "apple"
    },
    {
      serviceSlug: "icloud-plus",
      planName: "200 GB",
      currency: "EUR",
      monthlyPriceMinor: 299,
      sourceUrl:
        "https" + "://" + "support.apple.com/nl-be/108047",
      billingProviderSlug: "apple"
    },
    {
      serviceSlug: "icloud-plus",
      planName: "2 TB",
      currency: "EUR",
      monthlyPriceMinor: 999,
      sourceUrl:
        "https" + "://" + "support.apple.com/nl-be/108047",
      billingProviderSlug: "apple"
    },
    {
      serviceSlug: "icloud-plus",
      planName: "6 TB",
      currency: "EUR",
      monthlyPriceMinor: 2999,
      sourceUrl:
        "https" + "://" + "support.apple.com/nl-be/108047",
      billingProviderSlug: "apple"
    },
    {
      serviceSlug: "icloud-plus",
      planName: "12 TB",
      currency: "EUR",
      monthlyPriceMinor: 5999,
      sourceUrl:
        "https" + "://" + "support.apple.com/nl-be/108047",
      billingProviderSlug: "apple"
    }

  ],
  IE: [
    {
      serviceSlug: "amazon-prime",
      planName: "Amazon Prime",
      currency: "EUR",
      monthlyPriceMinor: 699,
      sourceUrl: "https://www.amazon.ie/prime",
      billingProviderSlug: "amazon"
    },


    {
      serviceSlug: "youtube-premium",
      planName: "Individual",
      currency: "EUR",
      monthlyPriceMinor: 1599,
      sourceUrl: "https://www.youtube.com/premium",
      billingProviderSlug: "direct"
    },

    {
      serviceSlug: "netflix",
      planName: "Basic",
      currency: "EUR",
      monthlyPriceMinor: 1099,
      sourceUrl: "https://www.netflix.com/ie/title/80193549"
    },
    {
      serviceSlug: "netflix",
      planName: "Standard",
      currency: "EUR",
      monthlyPriceMinor: 1699,
      sourceUrl: "https://www.netflix.com/ie/title/80193549"
    },
    {
      serviceSlug: "netflix",
      planName: "Premium",
      currency: "EUR",
      monthlyPriceMinor: 2399,
      sourceUrl: "https://www.netflix.com/ie/title/80193549"
    },
    {
      serviceSlug: "max",
      planName: "Basic With Ads",
      currency: "EUR",
      monthlyPriceMinor: 599,
      sourceUrl: "https://www.max.com/ie/en"
    },
    {
      serviceSlug: "max",
      planName: "Standard",
      currency: "EUR",
      monthlyPriceMinor: 1099,
      sourceUrl: "https://www.max.com/ie/en"
    },
    {
      serviceSlug: "max",
      planName: "Premium",
      currency: "EUR",
      monthlyPriceMinor: 1599,
      sourceUrl: "https://www.max.com/ie/en"
    },

    {
      serviceSlug: "disney-plus",
      planName: "Standard with Ads",
      currency: "EUR",
      monthlyPriceMinor: 899,
      sourceUrl: "https://www.disneyplus.com/en-ie"
    },
    {
      serviceSlug: "disney-plus",
      planName: "Standard",
      currency: "EUR",
      monthlyPriceMinor: 1199,
      sourceUrl: "https://www.disneyplus.com/en-ie"
    },
    {
      serviceSlug: "disney-plus",
      planName: "Premium",
      currency: "EUR",
      monthlyPriceMinor: 1599,
      sourceUrl: "https://www.disneyplus.com/en-ie"
    }
  ],
  FI: [
    {
      serviceSlug: "prime-video",
      planName: "Prime Video",
      currency: "EUR",
      monthlyPriceMinor: 699,
      sourceUrl: "https://www.primevideo.com/",
      billingProviderSlug: "direct"
    },

    {
      serviceSlug: "youtube-premium",
      planName: "Individual",
      currency: "EUR",
      monthlyPriceMinor: 1699,
      sourceUrl: "https://www.youtube.com/premium",
      billingProviderSlug: "direct"
    },

    {
      serviceSlug: "netflix",
      planName: "Basic",
      currency: "EUR",
      monthlyPriceMinor: 1099,
      sourceUrl: "https://www.netflix.com/fi/title/82746253"
    },
    {
      serviceSlug: "netflix",
      planName: "Standard",
      currency: "EUR",
      monthlyPriceMinor: 1599,
      sourceUrl: "https://www.netflix.com/fi/title/82746253"
    },
    {
      serviceSlug: "netflix",
      planName: "Premium",
      currency: "EUR",
      monthlyPriceMinor: 1999,
      sourceUrl: "https://www.netflix.com/fi/title/82746253"
    },
    {
      serviceSlug: "max",
      planName: "Basic With Ads",
      currency: "EUR",
      monthlyPriceMinor: 699,
      sourceUrl: "https://www.max.com/fi/en"
    },
    {
      serviceSlug: "max",
      planName: "Standard",
      currency: "EUR",
      monthlyPriceMinor: 1199,
      sourceUrl: "https://www.max.com/fi/en"
    },
    {
      serviceSlug: "max",
      planName: "Premium",
      currency: "EUR",
      monthlyPriceMinor: 1699,
      sourceUrl: "https://www.max.com/fi/en"
    },

    {
      serviceSlug: "disney-plus",
      planName: "Standard with Ads",
      currency: "EUR",
      monthlyPriceMinor: 699,
      sourceUrl: "https://www.disneyplus.com/fi-fi"
    },
    {
      serviceSlug: "disney-plus",
      planName: "Standard",
      currency: "EUR",
      monthlyPriceMinor: 1099,
      sourceUrl: "https://www.disneyplus.com/fi-fi"
    },
    {
      serviceSlug: "disney-plus",
      planName: "Premium",
      currency: "EUR",
      monthlyPriceMinor: 1599,
      sourceUrl: "https://www.disneyplus.com/fi-fi"
    }
  ],
  AT: [
    {
      serviceSlug: "amazon-prime",
      planName: "Amazon Prime",
      currency: "EUR",
      monthlyPriceMinor: 899,
      sourceUrl: "https://www.amazon.de/amazonprime",
      billingProviderSlug: "amazon"
    },

    {
      serviceSlug: "youtube-premium",
      planName: "Individual",
      currency: "EUR",
      monthlyPriceMinor: 1499,
      sourceUrl: "https://www.youtube.com/premium",
      billingProviderSlug: "direct"
    },

    {
      serviceSlug: "netflix",
      planName: "Basic",
      currency: "EUR",
      monthlyPriceMinor: 899,
      sourceUrl: "https://www.netflix.com/at/title/80164864"
    },
    {
      serviceSlug: "netflix",
      planName: "Standard",
      currency: "EUR",
      monthlyPriceMinor: 1399,
      sourceUrl: "https://www.netflix.com/at/title/80164864"
    },
    {
      serviceSlug: "netflix",
      planName: "Premium",
      currency: "EUR",
      monthlyPriceMinor: 1999,
      sourceUrl: "https://www.netflix.com/at/title/80164864"
    },
    {
      serviceSlug: "max",
      planName: "Basic With Ads",
      currency: "EUR",
      monthlyPriceMinor: 599,
      sourceUrl: "https://www.max.com/at/en"
    },
    {
      serviceSlug: "max",
      planName: "Standard",
      currency: "EUR",
      monthlyPriceMinor: 1199,
      sourceUrl: "https://www.max.com/at/en"
    },
    {
      serviceSlug: "max",
      planName: "Premium",
      currency: "EUR",
      monthlyPriceMinor: 1699,
      sourceUrl: "https://www.max.com/at/en"
    },

    {
      serviceSlug: "disney-plus",
      planName: "Standard",
      currency: "EUR",
      monthlyPriceMinor: 1099,
      sourceUrl: "https://www.disneyplus.com/de-at"
    },
    {
      serviceSlug: "disney-plus",
      planName: "Premium",
      currency: "EUR",
      monthlyPriceMinor: 1599,
      sourceUrl: "https://www.disneyplus.com/de-at"
    }
  ],
  SE: [
    {
      serviceSlug: "amazon-prime",
      planName: "Amazon Prime",
      currency: "SEK",
      monthlyPriceMinor: 6900,
      sourceUrl: "https://www.amazon.se/prime/",
      billingProviderSlug: "amazon"
    },

    {
      serviceSlug: "youtube-premium",
      planName: "Individual",
      currency: "SEK",
      monthlyPriceMinor: 14900,
      sourceUrl: "https://www.youtube.com/premium",
      billingProviderSlug: "direct"
    },

    {
      serviceSlug: "netflix",
      planName: "Basic",
      currency: "SEK",
      monthlyPriceMinor: 12900,
      sourceUrl: "https://www.netflix.com/se/title/80193549"
    },
    {
      serviceSlug: "netflix",
      planName: "Standard",
      currency: "SEK",
      monthlyPriceMinor: 16900,
      sourceUrl: "https://www.netflix.com/se/title/80193549"
    },
    {
      serviceSlug: "netflix",
      planName: "Premium",
      currency: "SEK",
      monthlyPriceMinor: 21900,
      sourceUrl: "https://www.netflix.com/se/title/80193549"
    },
    {
      serviceSlug: "max",
      planName: "Basic With Ads",
      currency: "SEK",
      monthlyPriceMinor: 8900,
      sourceUrl: "https://www.max.com/se/en"
    },
    {
      serviceSlug: "max",
      planName: "Standard",
      currency: "SEK",
      monthlyPriceMinor: 14900,
      sourceUrl: "https://www.max.com/se/en"
    },
    {
      serviceSlug: "max",
      planName: "Premium",
      currency: "SEK",
      monthlyPriceMinor: 18900,
      sourceUrl: "https://www.max.com/se/en"
    },

    {
      serviceSlug: "disney-plus",
      planName: "Standard with Ads",
      currency: "SEK",
      monthlyPriceMinor: 6900,
      sourceUrl: "https://www.disneyplus.com/sv-se"
    },
    {
      serviceSlug: "disney-plus",
      planName: "Standard",
      currency: "SEK",
      monthlyPriceMinor: 10900,
      sourceUrl: "https://www.disneyplus.com/sv-se"
    },
    {
      serviceSlug: "disney-plus",
      planName: "Premium",
      currency: "SEK",
      monthlyPriceMinor: 15900,
      sourceUrl: "https://www.disneyplus.com/sv-se"
    }
  ]
};

function registryPrices(
  serviceSlug: string,
  ctx: AdapterContext
): AdapterPrice[] {
  return (verifiedProviderRegistry[ctx.countryCode] ?? [])
    .filter(
      (row) =>
        row.serviceSlug === serviceSlug &&
        row.currency === ctx.currency
    )
    .flatMap((row) =>
      exactForRoute(
        serviceSlug,
        row.planName,
        ctx.countryCode,
        ctx.currency,
        row.monthlyPriceMinor / 100,
        row.sourceUrl,
        row.billingProviderSlug ?? "direct"
      )
    );
}


type PriceSourceKind =
  | "verified-registry"
  | "official-provider-page"
  | "official-provider-structured"
  | "official-help-page"
  | "official-api"
  | "official-store-page";

type PriceCandidate = {
  item: AdapterPrice;
  sourceKind: PriceSourceKind;
  priority: number;
};

export function resolvePriceCandidates(
  ctx: AdapterContext,
  candidates: PriceCandidate[]
): AdapterPrice[] {
  const valid = candidates.filter(({ item }) =>
    item.countryCode === ctx.countryCode &&
    item.currency === ctx.currency &&
    item.monthlyPriceMinor > 0 &&
    item.priceType === "exact"
  );

  const grouped = new Map<string, PriceCandidate[]>();

  for (const candidate of valid) {
    const item = candidate.item;

    const key = [
      item.serviceSlug,
      item.planSlug,
      item.billingProviderSlug,
      item.countryCode,
      item.currency
    ].join("|");

    const current = grouped.get(key) ?? [];
    current.push(candidate);
    grouped.set(key, current);
  }

  const resolved: AdapterPrice[] = [];

  for (const group of grouped.values()) {
    if (!group.length) continue;

    const byPrice = new Map<number, PriceCandidate[]>();

    for (const candidate of group) {
      const price = candidate.item.monthlyPriceMinor;
      const current = byPrice.get(price) ?? [];
      current.push(candidate);
      byPrice.set(price, current);
    }

    const rankedPrices = [...byPrice.entries()]
      .map(([price, priceCandidates]) => ({
        price,
        candidates: priceCandidates,
        sourceKinds: new Set(
          priceCandidates.map((candidate) => candidate.sourceKind)
        ),
        maxPriority: Math.max(
          ...priceCandidates.map((candidate) => candidate.priority)
        )
      }))
      .sort((a, b) => {
        if (b.maxPriority !== a.maxPriority) {
          return b.maxPriority - a.maxPriority;
        }

        if (b.sourceKinds.size !== a.sourceKinds.size) {
          return b.sourceKinds.size - a.sourceKinds.size;
        }

        return b.candidates.length - a.candidates.length;
      });

    let winner = rankedPrices[0];

    if (!winner) continue;

    // A registry value is our safe baseline.
    //
    // One live source is not enough to replace it: provider pages may
    // contain promotions, stale markup, wrong territories or unrelated
    // products.
    //
    // But when TWO independent live official source kinds agree on the
    // same new price, that agreement is strong enough to supersede the
    // older registry value for the current runtime snapshot.
    const liveAgreementPrices = rankedPrices.filter(
      (entry) => {
        const liveKinds = new Set(
          [...entry.sourceKinds].filter(
            (kind) => kind !== "verified-registry"
          )
        );

        return liveKinds.size >= 2;
      }
    );

    if (liveAgreementPrices.length === 1) {
      winner = liveAgreementPrices[0];
    } else if (liveAgreementPrices.length > 1) {
      // Multiple independently corroborated prices disagreeing with one
      // another is a real conflict. Publish neither until it is resolved.
      continue;
    } else {
      const runnerUp = rankedPrices[1];

      // Without independent live agreement, retain the existing
      // priority/conflict rules. This means a single weaker source cannot
      // silently replace the verified registry value.
      if (
        runnerUp &&
        runnerUp.maxPriority === winner.maxPriority &&
        runnerUp.price !== winner.price
      ) {
        continue;
      }
    }

    // Prefer the strongest source among candidates agreeing
    // on the winning price.
    const chosen = [...winner.candidates].sort(
      (a, b) => b.priority - a.priority
    )[0];

    if (!chosen) continue;

    const hasRegistry = winner.candidates.some(
      (candidate) => candidate.sourceKind === "verified-registry"
    );

    const independentSourceKinds = new Set(
      winner.candidates.map((candidate) => candidate.sourceKind)
    );

    const sourceCount = independentSourceKinds.size;

    const hasAuthoritativeProvider =
      winner.candidates.some(
        (candidate) =>
          candidate.sourceKind ===
          "official-provider-structured"
      );

    resolved.push({
      ...chosen.item,
      verification: hasAuthoritativeProvider
        ? "authoritative-provider"
        : hasRegistry
          ? "registry"
          : sourceCount >= 2
            ? "multi-source"
            : "single-source",
      sourceCount,
      verifiedByAgreement:
        !hasAuthoritativeProvider &&
        sourceCount >= 2
    });
  }

  return resolved;
}


function registryCandidates(
  serviceSlug: string,
  ctx: AdapterContext
): PriceCandidate[] {
  return registryPrices(serviceSlug, ctx).map((item) => ({
    item,
    sourceKind: "verified-registry" as const,
    priority: 100
  }));
}



function candidateFromItems(
  items: AdapterPrice[],
  sourceKind: PriceSourceKind,
  priority: number
): PriceCandidate[] {
  return items.map((item) => ({
    item,
    sourceKind,
    priority
  }));
}

function officialProviderCandidates(
  items: AdapterPrice[]
): PriceCandidate[] {
  return candidateFromItems(
    items,
    "official-provider-page",
    70
  );
}


function officialStructuredCandidates(
  items: AdapterPrice[]
): PriceCandidate[] {
  return candidateFromItems(
    items,
    "official-provider-structured",
    110
  );
}

function officialHelpCandidates(
  items: AdapterPrice[]
): PriceCandidate[] {
  return candidateFromItems(
    items,
    "official-help-page",
    80
  );
}

function officialApiCandidates(
  items: AdapterPrice[]
): PriceCandidate[] {
  return candidateFromItems(
    items,
    "official-api",
    90
  );
}

function officialStoreCandidates(
  items: AdapterPrice[]
): PriceCandidate[] {
  return candidateFromItems(
    items,
    "official-store-page",
    75
  );
}


export function parseSpotifyNextData(
  html: string,
  currency: string,
  expectedCountryCode?: string
): { planName: string; amount: number }[] {
  const match = html.match(
    /<script[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i
  );
  if (!match?.[1]) {
    return [];
  }

  let data: any;
  try {
    data = JSON.parse(match[1]);
  } catch {
    return [];
  }

  const pageProps = data?.props?.pageProps;
  if (!pageProps || typeof pageProps !== "object") {
    return [];
  }

  if (expectedCountryCode) {
    const embeddedCountry =
      typeof pageProps?.basePageProps?.country === "string"
        ? pageProps.basePageProps.country
            .trim()
            .toUpperCase()
        : "";

    if (
      !embeddedCountry ||
      embeddedCountry !==
        expectedCountryCode.trim().toUpperCase()
    ) {
      return [];
    }
  }

  const plans: any[] = [];
  const seenObjects = new Set<any>();

  const walk = (value: any): void => {
    if (!value || typeof value !== "object") {
      return;
    }

    if (seenObjects.has(value)) {
      return;
    }
    seenObjects.add(value);

    if (Array.isArray(value)) {
      for (const child of value) {
        walk(child);
      }
      return;
    }

    if (
      typeof value.planId === "string" &&
      value.planId.startsWith("PREMIUM_") &&
      value.isRecurringProduct === true
    ) {
      plans.push(value);
    }

    for (const child of Object.values(value)) {
      walk(child);
    }
  };

  walk(pageProps.components);

  const canonicalPlanNames: Record<
    string,
    string
  > = {
    PREMIUM_INDIVIDUAL: "Individual",
    PREMIUM_STUDENT: "Student",
    PREMIUM_DUO: "Duo",
    PREMIUM_FAMILY: "Family"
  };

  const token = currencyPattern(currency);
  const out: {
    planName: string;
    amount: number;
  }[] = [];

  const seenPlans = new Set<string>();

  for (const plan of plans) {
    const planName =
      canonicalPlanNames[plan.planId];

    if (!planName || seenPlans.has(planName)) {
      continue;
    }

    const descriptions = [
      plan.secondaryPriceDescription,
      plan.primaryPriceDescription,
      plan.subheaderPrice
    ].filter(
      (value): value is string =>
        typeof value === "string"
    );

    let amount: number | null = null;

    for (const description of descriptions) {
      /*
       * Structured Spotify plan objects already identify
       * the recurring product. Prefer the secondary price
       * because promotional plans put the normal recurring
       * amount there ("... then 12.99/month").
       *
       * The currency token is still mandatory so a localized
       * or redirected page cannot be interpreted as another
       * currency.
       */
      const patterns = [
        new RegExp(
          `${token}\\s*([\\d][\\d.,\\s]*)`,
          "i"
        ),
        new RegExp(
          `([\\d][\\d.,\\s]*)\\s*${token}`,
          "i"
        )
      ];

      for (const pattern of patterns) {
        const priceMatch =
          description.match(pattern);
        const parsed = parseNumber(
          priceMatch?.[1] ?? ""
        );

        if (
          parsed != null &&
          parsed > 0
        ) {
          amount = parsed;
          break;
        }
      }

      if (amount != null) {
        break;
      }
    }

    if (amount == null) {
      continue;
    }

    seenPlans.add(planName);
    out.push({
      planName,
      amount
    });
  }

  return out;
}

export function parseSpotifyFaqPrices(
  html: string,
  currency: string
): { planName: string; amount: number }[] {
  const match = html.match(
    /<script[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i
  );

  if (!match?.[1]) {
    return [];
  }

  let data: any;

  try {
    data = JSON.parse(match[1]);
  } catch {
    return [];
  }

  const entries =
    data?.props?.pageProps?.components
      ?.faq?.faqEntry;

  if (!Array.isArray(entries)) {
    return [];
  }

  const pricingEntry = entries.find(
    (entry: any) =>
      typeof entry?.question === "string" &&
      typeof entry?.answer === "string" &&
      /how much is spotify premium/i.test(
        entry.question
      )
  );

  if (!pricingEntry) {
    return [];
  }

  const answer = pricingEntry.answer;
  const token = currencyPattern(currency);

  const pattern = new RegExp(
    `Premium\\s+([A-Za-z][A-Za-z -]*?)\\s+plan\\s+costs\\s+([\\d.,\\s]+)\\s*${token}\\s+per\\s+month`,
    "gi"
  );

  const out: {
    planName: string;
    amount: number;
  }[] = [];

  for (const priceMatch of answer.matchAll(pattern)) {
    const planName =
      priceMatch[1]?.trim();

    const amount = parseNumber(
      priceMatch[2] ?? ""
    );

    if (
      planName &&
      amount != null &&
      amount > 0
    ) {
      out.push({
        planName,
        amount
      });
    }
  }

  return out;
}


export function crossCheckSpotifyStructuredPrices(
  storefront: {
    planName: string;
    amount: number;
  }[],
  faq: {
    planName: string;
    amount: number;
  }[]
): { planName: string; amount: number }[] {
  const faqByPlan = new Map(
    faq.map((row) => [
      row.planName.trim().toLowerCase(),
      row.amount
    ])
  );

  return storefront.filter((row) => {
    const faqAmount = faqByPlan.get(
      row.planName.trim().toLowerCase()
    );

    return faqAmount === row.amount;
  });
}


export function findSpotifyRecurringPrices(
  text: string,
  currency: string
): { planName: string; amount: number }[] {
  const token = currencyPattern(currency);

  const plans = [
    "Individual",
    "Duo",
    "Family",
    "Student"
  ];

  const out: {
    planName: string;
    amount: number;
  }[] = [];

  for (const planName of plans) {
    const escapedPlan = planName.replace(
      /[.*+?^${}()|[\]\\]/g,
      "\\$&"
    );

    /*
     * Spotify may put an introductory offer before the
     * normal recurring price:
     *
     *   0 kr for 3 months, then 139 kr per month
     *
     * Prefer an explicit "then/after" recurring price.
     */
    const recurringPatterns = [
      new RegExp(
        `${escapedPlan}.{0,220}?(?:then|after|deretter).{0,40}?${token}\\s*([\\d.,\\s]+).{0,30}?(?:month|monthly|måned|månad)`,
        "i"
      ),
      new RegExp(
        `${escapedPlan}.{0,220}?(?:then|after|deretter).{0,40}?([\\d.,\\s]+)\\s*${token}.{0,30}?(?:month|monthly|måned|månad)`,
        "i"
      )
    ];

    let amount: number | null = null;

    for (const pattern of recurringPatterns) {
      const match = text.match(pattern);
      const parsed = parseNumber(
        match?.[1] ?? ""
      );

      if (parsed != null && parsed > 0) {
        amount = parsed;
        break;
      }
    }

    /*
     * Plans without an introductory offer, such as Duo
     * and Family, can use the conservative generic parser.
     */
    if (amount == null) {
      const generic = findPriceNearPlan(
        text,
        [planName],
        currency
      );

      amount =
        generic.find(
          (row) => row.planName === planName
        )?.amount ?? null;
    }

    if (amount != null && amount > 0) {
      out.push({
        planName,
        amount
      });
    }
  }

  return out;
}


async function spotifyAdapter(
  ctx: AdapterContext
): Promise<AdapterPrice[]> {
  const candidates: PriceCandidate[] = [
    ...registryCandidates("spotify", ctx)
  ];

  /*
   * Spotify exposes country-local Premium pages containing
   * explicit recurring monthly prices for each named plan.
   *
   * Important:
   * promotional/trial prices such as "0 kr for 3 months"
   * must never become Savlivo's recurring monthly price.
   *
   * findPriceNearPlan() requires the plan name and monthly
   * price context, which keeps extraction conservative.
   */
  const cc = ctx.countryCode.toLowerCase();

  const urls = [
    `https://www.spotify.com/${cc}-en/premium/`,
    `https://www.spotify.com/${cc}/premium/`
  ];

  const authoritativePlanSlugs =
    new Set<string>();

  for (const url of urls) {
    try {
      const html = await fetchText(url);

      const structuredPrices =
        parseSpotifyNextData(
          html,
          ctx.currency,
          ctx.countryCode
        );

      const faqPrices =
        parseSpotifyFaqPrices(
          html,
          ctx.currency
        );

      /*
       * __NEXT_DATA__ is Spotify-owned structured product data.
       * parseSpotifyNextData() has already validated the
       * requested country (when supplied), required the
       * requested currency token, required a recurring
       * PREMIUM_* product, and mapped Spotify planId values
       * to canonical Savlivo plan names.
       *
       * That is authoritative provider-structured evidence.
       * The localized FAQ remains an optional cross-check,
       * not a prerequisite for authority.
       */
      const faqAgreement =
        crossCheckSpotifyStructuredPrices(
          structuredPrices,
          faqPrices
        );

      const faqAgreementKeys = new Set(
        faqAgreement.map(
          (price) =>
            `${price.planName}:${price.amount}`
        )
      );

      for (const price of structuredPrices) {
        const items = exactForRoute(
          "spotify",
          price.planName,
          ctx.countryCode,
          ctx.currency,
          price.amount,
          url,
          "direct"
        );

        for (const item of items) {
          authoritativePlanSlugs.add(
            item.planSlug
          );

          for (
            let index = candidates.length - 1;
            index >= 0;
            index -= 1
          ) {
            const existing =
              candidates[index];

            if (
              existing?.sourceKind ===
                "official-provider-page" &&
              existing.item.serviceSlug ===
                "spotify" &&
              existing.item.planSlug ===
                item.planSlug &&
              existing.item.billingProviderSlug ===
                item.billingProviderSlug
            ) {
              candidates.splice(index, 1);
            }
          }
        }

        candidates.push(
          ...officialStructuredCandidates(
            items
          )
        );

        /*
         * Keep exact FAQ agreement as independent official
         * evidence when Spotify exposes it. Authority does
         * not depend on the FAQ because the structured
         * provider record is authoritative by itself.
         */
        if (
          faqAgreementKeys.has(
            `${price.planName}:${price.amount}`
          )
        ) {
          candidates.push(
            ...officialHelpCandidates(
              items
            )
          );
        }
      }

      const fallbackPrices =
        structuredPrices.length > 0
          ? structuredPrices
          : findSpotifyRecurringPrices(
              htmlToText(html),
              ctx.currency
            );

      for (const price of fallbackPrices) {
        const items = exactForRoute(
          "spotify",
          price.planName,
          ctx.countryCode,
          ctx.currency,
          price.amount,
          url,
          "direct"
        );

        const hasAuthoritativePlan =
          items.some((item) =>
            authoritativePlanSlugs.has(
              item.planSlug
            )
          );

        if (hasAuthoritativePlan) {
          continue;
        }

        candidates.push(
          ...officialProviderCandidates(
            items
          )
        );
      }

    } catch {
      // Network/provider failures must not remove the
      // verified registry fallback.
    }
  }

  return resolvePriceCandidates(
    ctx,
    candidates
  );
}



export type GoogleOneStructuredPrice = {
  planName: string;
  amount: number;
  productId: string;
  storageLabel: string;
};

export function parseGoogleOneMarket(
  html: string
): string | null {
  const marker =
    "AF_initDataCallback({key: 'ds:0'";
  const start = html.indexOf(marker);

  if (start < 0) {
    return null;
  }

  const end =
    html.indexOf("</script>", start);
  const block = html.slice(
    start,
    end < 0
      ? start + 10000
      : end
  );

  const match = block.match(
    /data:\s*\[\[\s*null\s*,\s*null\s*,\s*null\s*,\s*\d+\s*,\s*\d+\s*,\s*null\s*,\s*"([A-Z]{2})"/
  );

  return match?.[1] ?? null;
}

export function parseGoogleOneStructuredPrices(
  html: string,
  currency: string
): GoogleOneStructuredPrice[] {
  const marker =
    "AF_initDataCallback({key: 'ds:2'";

  const start = html.indexOf(marker);

  if (start < 0) {
    return [];
  }

  const end =
    html.indexOf("</script>", start);

  const block = html.slice(
    start,
    end < 0
      ? start + 100000
      : end
  );

  const pattern =
    /\["(\d+)","([^"]+)"\],2,\["(\d+)","([^"]+)","([A-Z]{3})"\],\["(\d+)","([^"]+)","([^"]+)"\],"([^"]+)","([^"]+)"/g;

  const raw: Array<{
    storageLabel: string;
    amount: number;
    productId: string;
    index: number;
  }> = [];

  let match: RegExpExecArray | null;

  while (
    (match = pattern.exec(block)) !== null
  ) {
    const storageLabel = match[2];
    const priceMicrosRaw = match[3];
    const recordCurrency = match[5];
    const productId = match[7];
    if (
      recordCurrency !== currency
    ) {
      continue;
    }

    if (
      !productId ||
      productId.endsWith(".annual")
    ) {
      continue;
    }

    const priceMicros =
      Number(priceMicrosRaw);

    if (
      !Number.isFinite(priceMicros) ||
      priceMicros <= 0
    ) {
      continue;
    }

    raw.push({
      storageLabel,
      amount:
        priceMicros / 1_000_000,
      productId,
      index: match.index
    });
  }

  return raw.map((item, index) => {
    const nextIndex =
      raw[index + 1]?.index ??
      block.length;

    const section =
      block.slice(
        item.index,
        nextIndex
      );

    const tierMatch =
      section.match(
        /"(Google AI (?:Plus|Pro|Ultra))"/
      );

    const tierName =
      tierMatch?.[1];

    return {
      planName:
        tierName
          ? `${tierName} — ${item.storageLabel}`
          : `Storage ${item.storageLabel}`,
      amount: item.amount,
      productId: item.productId,
      storageLabel: item.storageLabel
    };
  });
}



const googleOneStoreEstimatedCatalog: Record<
  string,
  {
    currency: string;
    sourceUrl: string;
    plans: {
      planName: string;
      monthlyPriceMinor: number;
    }[];
  }
> = {
  US: {
    currency: "USD",
    sourceUrl:
      "https" + "://" +
      "apps.apple.com/us/app/google-one/id1451784328",
    plans: [
      { planName: "Storage 100 GB", monthlyPriceMinor: 199 },
      { planName: "Storage 200 GB", monthlyPriceMinor: 299 },
      { planName: "Google AI Plus — 2 TB", monthlyPriceMinor: 999 }
    ]
  },
  SE: {
    currency: "SEK",
    sourceUrl:
      "https" + "://" +
      "apps.apple.com/se/app/google-one/id1451784328",
    plans: [
      { planName: "Storage 100 GB", monthlyPriceMinor: 1900 },
      { planName: "Storage 200 GB", monthlyPriceMinor: 2900 },
      { planName: "Google AI Plus — 2 TB", monthlyPriceMinor: 9900 }
    ]
  },
  DK: {
    currency: "DKK",
    sourceUrl:
      "https" + "://" +
      "apps.apple.com/dk/app/google-one/id1451784328",
    plans: [
      { planName: "Storage 100 GB", monthlyPriceMinor: 1700 },
      { planName: "Storage 200 GB", monthlyPriceMinor: 2500 },
      { planName: "Google AI Plus — 2 TB", monthlyPriceMinor: 7900 }
    ]
  },
  DE: {
    currency: "EUR",
    sourceUrl:
      "https" + "://" +
      "apps.apple.com/de/app/google-one/id1451784328",
    plans: [
      { planName: "Storage 100 GB", monthlyPriceMinor: 199 },
      { planName: "Storage 200 GB", monthlyPriceMinor: 299 },
      { planName: "Google AI Plus — 2 TB", monthlyPriceMinor: 999 }
    ]
  },
  ES: {
    currency: "EUR",
    sourceUrl:
      "https" + "://" +
      "apps.apple.com/es/app/google-one/id1451784328",
    plans: [
      { planName: "Storage 100 GB", monthlyPriceMinor: 199 },
      { planName: "Storage 200 GB", monthlyPriceMinor: 299 },
      { planName: "Google AI Plus — 2 TB", monthlyPriceMinor: 999 }
    ]
  },
  FR: {
    currency: "EUR",
    sourceUrl:
      "https" + "://" +
      "apps.apple.com/fr/app/google-one/id1451784328",
    plans: [
      { planName: "Storage 100 GB", monthlyPriceMinor: 199 },
      { planName: "Storage 200 GB", monthlyPriceMinor: 299 },
      { planName: "Google AI Plus — 2 TB", monthlyPriceMinor: 999 }
    ]
  },
  IT: {
    currency: "EUR",
    sourceUrl:
      "https" + "://" +
      "apps.apple.com/it/app/google-one/id1451784328",
    plans: [
      { planName: "Storage 100 GB", monthlyPriceMinor: 199 },
      { planName: "Storage 200 GB", monthlyPriceMinor: 299 },
      { planName: "Google AI Plus — 2 TB", monthlyPriceMinor: 999 }
    ]
  },
  PT: {
    currency: "EUR",
    sourceUrl:
      "https" + "://" +
      "apps.apple.com/pt/app/google-one/id1451784328",
    plans: [
      { planName: "Storage 100 GB", monthlyPriceMinor: 199 },
      { planName: "Storage 200 GB", monthlyPriceMinor: 299 },
      { planName: "Google AI Plus — 2 TB", monthlyPriceMinor: 999 }
    ]
  },
  AT: {
    currency: "EUR",
    sourceUrl:
      "https" + "://" +
      "apps.apple.com/at/app/google-one/id1451784328",
    plans: [
      { planName: "Storage 100 GB", monthlyPriceMinor: 199 },
      { planName: "Storage 200 GB", monthlyPriceMinor: 299 },
      { planName: "Google AI Plus — 2 TB", monthlyPriceMinor: 999 }
    ]
  },
  IE: {
    currency: "EUR",
    sourceUrl:
      "https" + "://" +
      "apps.apple.com/ie/app/google-one/id1451784328",
    plans: [
      { planName: "Storage 100 GB", monthlyPriceMinor: 199 },
      { planName: "Storage 200 GB", monthlyPriceMinor: 299 },
      { planName: "Google AI Plus — 2 TB", monthlyPriceMinor: 1099 }
    ]
  },
  NL: {
    currency: "EUR",
    sourceUrl:
      "https" + "://" +
      "apps.apple.com/nl/app/google-one/id1451784328",
    plans: [
      { planName: "Storage 100 GB", monthlyPriceMinor: 199 },
      { planName: "Storage 200 GB", monthlyPriceMinor: 349 },
      { planName: "Google AI Plus — 2 TB", monthlyPriceMinor: 999 }
    ]
  },
  BE: {
    currency: "EUR",
    sourceUrl:
      "https" + "://" +
      "apps.apple.com/be/app/google-one/id1451784328",
    plans: [
      { planName: "Storage 100 GB", monthlyPriceMinor: 199 },
      { planName: "Storage 200 GB", monthlyPriceMinor: 299 },
      { planName: "Google AI Plus — 2 TB", monthlyPriceMinor: 999 }
    ]
  },
  FI: {
    currency: "EUR",
    sourceUrl:
      "https" + "://" +
      "apps.apple.com/fi/app/google-one/id1451784328",
    plans: [
      { planName: "Storage 100 GB", monthlyPriceMinor: 199 },
      { planName: "Storage 200 GB", monthlyPriceMinor: 299 },
      { planName: "Google AI Plus — 2 TB", monthlyPriceMinor: 999 }
    ]
  }
};

async function googleOneAdapter(
  ctx: AdapterContext
): Promise<AdapterPrice[]> {
  const candidates: PriceCandidate[] = [
    ...registryCandidates(
      "google-one",
      ctx
    )
  ];

  const storeMarket =
    googleOneStoreEstimatedCatalog[
      ctx.countryCode
    ];

  if (
    storeMarket &&
    storeMarket.currency === ctx.currency
  ) {
    const storeItems =
      storeMarket.plans.flatMap((plan) =>
        exactForRoute(
          "google-one",
          plan.planName,
          ctx.countryCode,
          ctx.currency,
          plan.monthlyPriceMinor / 100,
          storeMarket.sourceUrl,
          "direct"
        )
      );

    candidates.push(
      ...officialStoreCandidates(
        storeItems
      )
    );
  }


  /*
   * Google's public Google One page does not expose a
   * dependable country selector. Its ds:0 bootstrap data does
   * expose an explicit provider-owned active-market field that
   * Savlivo can verify alongside ds:2 pricing.
   *
   * URL country/region/language inputs do not change that
   * active market from the request's geo-derived market.
   * Until Savlivo has verified foreign-market egress, only
   * NO + NOK is allowed to become authoritative live pricing.
   */
  if (
    ctx.countryCode !== "NO" ||
    ctx.currency !== "NOK"
  ) {
    return resolvePriceCandidates(
      ctx,
      candidates
    );
  }

  const url =
    "https" +
    "://" +
    "one.google.com/plans" +
    "?g1_last_touchpoint=39" +
    "&g1_landing_page=0";

  try {
    const html = await fetchText(url);

    const providerMarket =
      parseGoogleOneMarket(html);

    if (
      providerMarket !==
      ctx.countryCode
    ) {
      return resolvePriceCandidates(
        ctx,
        candidates
      );
    }

    const structuredPrices =
      parseGoogleOneStructuredPrices(
        html,
        ctx.currency
      );

    for (
      const price of structuredPrices
    ) {
      const items = exactForRoute(
        "google-one",
        price.planName,
        ctx.countryCode,
        ctx.currency,
        price.amount,
        url,
        "direct"
      );

      candidates.push(
        ...officialStructuredCandidates(
          items
        )
      );
    }
  } catch {
    /*
     * Network/provider/parser failures must not remove
     * verified registry fallback prices.
     */
  }

  return resolvePriceCandidates(
    ctx,
    candidates
  );
}


export type NetflixStructuredPrice = {
  planName: string;
  amount: number;
};

function normalizeNetflixPlanName(
  value: string
): string | null {
  const normalized = value
    .trim()
    .toLowerCase();

  if (
    normalized === "basic" ||
    normalized === "basis"
  ) {
    return "Basic";
  }

  if (normalized === "standard") {
    return "Standard";
  }

  if (normalized === "premium") {
    return "Premium";
  }

  if (
    normalized === "standard with ads" ||
    normalized === "standard med reklame"
  ) {
    return "Standard with Ads";
  }

  return null;
}

export function parseNetflixStructuredPrices(
  html: string,
  currency: string
): NetflixStructuredPrice[] {
  if (currency !== "NOK") {
    return [];
  }

  const found = new Map<string, number>();
  const conflicts = new Set<string>();

  /*
   * Netflix embeds each plan as a fields object where
   * individual values are wrapped like:
   *
   *   "planPriceCurrency":{
   *     "fieldType":"String",
   *     "value":"NOK"
   *   }
   *
   * Extract a bounded region around each planType and
   * independently read the fields from that region.
   */
  const planTypePattern =
    /"planType"\s*:\s*\{\s*"fieldType"\s*:\s*"String"\s*,\s*"value"\s*:\s*"([^"]+)"\s*\}/gi;

  const matches =
    [...html.matchAll(planTypePattern)];

  function fieldValue(
    block: string,
    field: string
  ): string | null {
    const escaped =
      field.replace(
        /[.*+?^${}()|[\]\\]/g,
        "\\$&"
      );

    const pattern = new RegExp(
      `"${escaped}"\\s*:\\s*\\{[^{}]{0,300}?"value"\\s*:\\s*"([^"]*)"[^{}]{0,300}?\\}`,
      "i"
    );

    return block.match(pattern)?.[1] ?? null;
  }

  for (
    let index = 0;
    index < matches.length;
    index += 1
  ) {
    const match = matches[index];

    const matchIndex =
      match.index ?? 0;

    const previousFieldsIndex =
      html.lastIndexOf(
        '"fields":{',
        matchIndex
      );

    const previousSpacedFieldsIndex =
      html.lastIndexOf(
        '"fields": {',
        matchIndex
      );

    const start =
      Math.max(
        previousFieldsIndex,
        previousSpacedFieldsIndex
      );

    if (start < 0) {
      continue;
    }

    const nextCompactFieldsIndex =
      html.indexOf(
        '"fields":{',
        matchIndex + match[0].length
      );

    const nextSpacedFieldsIndex =
      html.indexOf(
        '"fields": {',
        matchIndex + match[0].length
      );

    const nextFieldsIndexes = [
      nextCompactFieldsIndex,
      nextSpacedFieldsIndex
    ].filter(
      (value) => value >= 0
    );

    const end =
      nextFieldsIndexes.length
        ? Math.min(...nextFieldsIndexes)
        : Math.min(
            html.length,
            matchIndex + 2200
          );

    const block =
      html.slice(start, end);

    const planName =
      normalizeNetflixPlanName(
        match[1] ?? ""
      ) ??
      normalizeNetflixPlanName(
        fieldValue(
          block,
          "localizedPlanName"
        ) ?? ""
      );

    if (!planName) {
      continue;
    }

    const planCurrency =
      fieldValue(
        block,
        "planPriceCurrency"
      );

    if (planCurrency !== currency) {
      continue;
    }

    const frequency =
      fieldValue(
        block,
        "billingFrequency"
      )
        ?.trim()
        .toLowerCase();

    if (frequency !== "monthly") {
      continue;
    }

    const rawAmount =
      fieldValue(
        block,
        "planPriceAmount"
      );

    const amount =
      rawAmount == null
        ? null
        : parseNumber(rawAmount);

    if (
      amount == null ||
      amount <= 0
    ) {
      continue;
    }

    const previous =
      found.get(planName);

    if (
      previous != null &&
      previous !== amount
    ) {
      conflicts.add(planName);
      continue;
    }

    found.set(
      planName,
      amount
    );
  }

  for (const planName of conflicts) {
    found.delete(planName);
  }

  const required = [
    "Basic",
    "Standard",
    "Premium"
  ];

  if (
    required.some(
      (planName) =>
        !found.has(planName)
    )
  ) {
    return [];
  }

  return required.map(
    (planName) => ({
      planName,
      amount: found.get(planName)!
    })
  );
}

async function netflixAdapter(
  ctx: AdapterContext
): Promise<AdapterPrice[]> {
  const candidates: PriceCandidate[] = [
    ...registryCandidates("netflix", ctx)
  ];

  const cc = ctx.countryCode.toLowerCase();

  const urls = [
    `https://www.netflix.com/${cc}-en/`,
    `https://www.netflix.com/${cc}/`
  ];

  // --------------------------------------------------
  // Source 1: structured monthly plan data from Netflix
  // --------------------------------------------------

  if (
    ctx.countryCode === "NO" &&
    ctx.currency === "NOK"
  ) {
    for (const url of urls) {
      try {
        const html = await fetchText(url);

        const structured =
          parseNetflixStructuredPrices(
            html,
            ctx.currency
          );

        if (structured.length) {
          const items =
            structured.flatMap((price) =>
              exactForRoute(
                "netflix",
                price.planName,
                ctx.countryCode,
                ctx.currency,
                price.amount,
                url,
                "direct"
              )
            );

          candidates.push(
            ...officialStructuredCandidates(
              items
            )
          );

          break;
        }
      } catch {
        /*
         * Keep registry and lower-confidence official
         * page extraction as safe fallbacks.
         */
      }
    }
  }

  // --------------------------------------------------
  // Source 2: exact prices from official local Netflix pages
  // --------------------------------------------------

  for (const url of urls) {
    try {
      const text = htmlToText(await fetchText(url));

      const exactPrices = findPriceNearPlan(
        text,
        [
          "Standard with Ads",
          "Basic",
          "Standard",
          "Premium",
          "Mobile"
        ],
        ctx.currency
      );

      for (const price of exactPrices) {
        const items = exact(
          "netflix",
          price.planName,
          ctx.countryCode,
          ctx.currency,
          price.amount,
          url
        );

        candidates.push(
          ...items.map((item) => ({
            item,
            sourceKind: "official-provider-page" as const,
            priority: 70
          }))
        );
      }
    } catch {}
  }

  // Registry wins when we have explicitly verified rows.
  // Otherwise exact official local-page data can be used.
  const exactResolved = resolvePriceCandidates(
    ctx,
    candidates
  );

  if (exactResolved.length) {
    return exactResolved;
  }

  // --------------------------------------------------
  // Safe fallback: official country-specific local range
  // --------------------------------------------------
  //
  // If Netflix publishes only a minimum/maximum range,
  // preserve it as a range instead of inventing tiers.
  // --------------------------------------------------

  for (const url of urls) {
    try {
      const text = htmlToText(await fetchText(url));
      const token =
        ctx.countryCode === "SE" || ctx.countryCode === "DK"
          ? "(?:kr\\.?|" + currencyPattern(ctx.currency) + ")"
          : currencyPattern(ctx.currency);

      const rangePatterns = [
        new RegExp(
          `(?:plans?\\s+(?:range|start)|subscriptions?\\s+from|abonnementer\\s+fra|priser\\s+fra|from)\\s*${token}?\\s*([\\d.,\\s]+).{0,120}?(?:to|til|–|-)\\s*${token}?\\s*([\\d.,\\s]+)`,
          "i"
        ),
        new RegExp(
          `${token}\\s*([\\d.,\\s]+).{0,100}?(?:to|til|–|-)\\s*${token}\\s*([\\d.,\\s]+).{0,60}?(?:month|monthly|måned|månad|monat|mese|mes|mois|maand)`,
          "i"
        )
      ];

      for (const pattern of rangePatterns) {
        const match = text.match(pattern);

        const min = parseNumber(match?.[1] ?? "");
        const max = parseNumber(match?.[2] ?? "");

        if (
          min != null &&
          max != null &&
          min > 0 &&
          max >= min
        ) {
          return [{
            serviceSlug: "netflix",
            planSlug: "public-price-range",
            planName: "Local plan range",
            billingProviderSlug: "direct",
            countryCode: ctx.countryCode,
            currency: ctx.currency,
            monthlyPriceMinor: Math.round(min * 100),
            monthlyPriceMaxMinor: Math.round(max * 100),
            updatedAt: new Date().toISOString(),
            source: "official-provider-adapter:netflix",
            sourceUrl: url,
            confidence: "official-provider-adapter",
            priceType: "range"
          }];
        }
      }
    } catch {}
  }

  return [];
}


export type DisneyPlusPrice = {
  planName: string;
  amount: number;
};

function normalizeDisneyPlusPlanName(
  planName: string
): string | null {
  const normalized =
    planName
      .trim()
      .toLowerCase();

  if (
    normalized === "premium"
  ) {
    return "Premium";
  }

  if (
    normalized === "standard"
  ) {
    return "Standard";
  }

  if (
    normalized === "standard med reklame"
  ) {
    return "Standard with Ads";
  }

  return null;
}

export function parseDisneyPlusCardRecurringPrices(
  html: string,
  currency: string
): DisneyPlusPrice[] {
  /*
   * Norway's Disney+ comparison cards may show a temporary
   * introductory amount first:
   *
   *   Fra 59 kr per måned
   *   ... deretter betaler du 69 kr per måned
   *
   * We intentionally capture only the explicit post-promotion
   * recurring amount following "deretter betaler du".
   */
  if (currency !== "NOK") {
    return [];
  }

  const pattern =
    /data-testid="l4l_(premium|standard|basic)"[^>]*>\s*(PREMIUM|STANDARD|STANDARD MED REKLAME)\s*<\/a>[\s\S]{0,900}?deretter\s+betaler\s+du(?:<\/span>|<[^>]+>|\s)*([0-9][0-9\s.,]*)\s*kr\s+per\s+m[åa]ned/gi;

  const out: DisneyPlusPrice[] = [];
  const seen = new Set<string>();

  let match: RegExpExecArray | null;

  while (
    (match = pattern.exec(html)) !== null
  ) {
    const planName =
      normalizeDisneyPlusPlanName(
        match[2]
      );

    const amount =
      parseNumber(
        match[3]
      );

    if (
      planName == null ||
      amount == null ||
      amount <= 0
    ) {
      continue;
    }

    const key =
      `${planName}|${amount}`;

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);

    out.push({
      planName,
      amount
    });
  }

  return out;
}

export function parseDisneyPlusLocalizedCardPrices(
  html: string,
  currency: string
): DisneyPlusPrice[] {
  /*
   * Disney exposes stable structural plan identifiers:
   *
   *   l4l_basic    -> Standard with Ads
   *   l4l_standard -> Standard
   *   l4l_premium  -> Premium
   *
   * Some localized storefronts currently advertise a temporary
   * six-month discount followed by the normal recurring monthly
   * price. Therefore collect monthly amounts inside each card and
   * select the LAST distinct monthly amount.
   *
   * Examples observed from Disney itself:
   *
   *   promo monthly -> normal monthly
   *
   * A card with only one monthly amount keeps that amount.
   *
   * No prices are hard-coded here.
   */
  if (currency === "NOK") {
    return [];
  }

  const canonicalPlans:
    Record<string, string> = {
      basic: "Standard with Ads",
      standard: "Standard",
      premium: "Premium"
    };

  const token =
    currencyPattern(currency);

  const cardStart =
    /data-testid=["']l4l_(basic|standard|premium)["']/gi;

  const starts: {
    planId: string;
    index: number;
  }[] = [];

  let match:
    RegExpExecArray | null;

  while (
    (match =
      cardStart.exec(html)) !== null
  ) {
    starts.push({
      planId:
        match[1].toLowerCase(),
      index:
        match.index
    });
  }

  const out:
    DisneyPlusPrice[] = [];

  const seenPlans =
    new Set<string>();

  /*
   * Monthly vocabulary/abbreviations observed across the
   * supported localized Disney storefronts.
   *
   * Keep this anchored to monthly wording: annual prices,
   * savings percentages and unrelated card numbers must not
   * become subscription prices.
   */
  const month =
    "(?:month|monthly|monat|mois|mese|mes|mês|" +
    "maand|m[eå]nad|m[åa]ned|m[eå]ned|" +
    "kuukaudessa|kuukausi(?:hinta)?|" +
    "md\\.?|mo)";

  for (
    let index = 0;
    index < starts.length;
    index += 1
  ) {
    const current =
      starts[index];

    const next =
      starts[index + 1];

    const planName =
      canonicalPlans[
        current.planId
      ];

    if (
      !planName ||
      seenPlans.has(planName)
    ) {
      continue;
    }

    const card =
      html.slice(
        current.index,
        next?.index ??
          Math.min(
            html.length,
            current.index + 7000
          )
      );

    const patterns = [
      new RegExp(
        `${token}\\s*` +
          `([\\d][\\d.,\\s]*)` +
          `[\\s\\S]{0,40}?` +
          month,
        "gi"
      ),
      new RegExp(
        `([\\d][\\d.,\\s]*)` +
          `\\s*${token}` +
          `[\\s\\S]{0,40}?` +
          month,
        "gi"
      )
    ];

    const amounts:
      number[] = [];

    for (
      const pattern of patterns
    ) {
      for (
        const priceMatch of
        card.matchAll(pattern)
      ) {
        const parsed =
          parseNumber(
            priceMatch[1] ?? ""
          );

        if (
          parsed == null ||
          parsed <= 0
        ) {
          continue;
        }

        if (
          !amounts.some(
            value =>
              Math.abs(
                value - parsed
              ) < 0.0001
          )
        ) {
          amounts.push(parsed);
        }
      }
    }

    /*
     * Finnish Disney cards express the post-promotion amount as:
     *
     *   tämän jälkeen kuukausihinta on 15,99 €
     *
     * Here the monthly semantic marker precedes the amount, unlike
     * the other localized forms above. Capture only this explicit
     * post-promotion construction rather than accepting arbitrary
     * currency amounts after monthly vocabulary.
     */
    const finnishRecurring =
      card.match(
        new RegExp(
          `t[aä]m[aä]n\\s+j[aä]lkeen` +
            `[\\s\\S]{0,80}?` +
            `kuukausihinta\\s+on\\s+` +
            `([\\d][\\d.,\\s]*)\\s*` +
            token,
          "i"
        )
      );

    const finnishAmount =
      parseNumber(
        finnishRecurring?.[1] ?? ""
      );

    if (
      finnishAmount != null &&
      finnishAmount > 0
    ) {
      const existing =
        amounts.findIndex(
          value =>
            Math.abs(
              value - finnishAmount
            ) < 0.0001
        );

      if (existing >= 0) {
        amounts.splice(
          existing,
          1
        );
      }

      amounts.push(
        finnishAmount
      );
    }

    if (
      amounts.length === 0
    ) {
      continue;
    }

    /*
     * Promotional storefront cards present the temporary amount
     * first and the post-promotion recurring monthly amount later.
     * A non-promotional card contributes just one monthly amount.
     */
    const amount =
      amounts[
        amounts.length - 1
      ];

    seenPlans.add(planName);

    out.push({
      planName,
      amount
    });
  }

  return out;
}


export function parseDisneyPlusCurrentPriceFootnote(
  html: string,
  currency: string
): DisneyPlusPrice[] {
  /*
   * Disney's Norway footnote independently states the current
   * normal prices:
   *
   *   for øyeblikket 159 kr ... Premium,
   *   109 kr ... Standard eller
   *   69 kr ... Standard med reklame
   *
   * Requiring this explicit "for øyeblikket" context prevents
   * introductory offer amounts from being accepted.
   */
  if (currency !== "NOK") {
    return [];
  }

  const text =
    htmlToText(html)
      .replace(/\s+/g, " ")
      .trim();

  const match =
    text.match(
      /for\s+[øo]yeblikket\s+([0-9][0-9\s.,]*)\s*kr\s+per\s+m[åa]ned\s+for\s+Premium,\s*([0-9][0-9\s.,]*)\s*kr\s+per\s+m[åa]ned\s+for\s+Standard\s+eller\s+([0-9][0-9\s.,]*)\s*kr\s+per\s+m[åa]ned\s+for\s+Standard\s+med\s+reklame/i
    );

  if (!match) {
    return [];
  }

  const premium =
    parseNumber(match[1]);

  const standard =
    parseNumber(match[2]);

  const ads =
    parseNumber(match[3]);

  if (
    premium == null ||
    standard == null ||
    ads == null ||
    premium <= 0 ||
    standard <= 0 ||
    ads <= 0
  ) {
    return [];
  }

  return [
    {
      planName: "Premium",
      amount: premium
    },
    {
      planName: "Standard",
      amount: standard
    },
    {
      planName: "Standard with Ads",
      amount: ads
    }
  ];
}

export function crossCheckDisneyPlusPrices(
  cards: DisneyPlusPrice[],
  footnote: DisneyPlusPrice[]
): DisneyPlusPrice[] {
  const footnoteByPlan =
    new Map(
      footnote.map(
        (row) => [
          row.planName
            .trim()
            .toLowerCase(),
          row.amount
        ]
      )
    );

  return cards.filter(
    (row) =>
      footnoteByPlan.get(
        row.planName
          .trim()
          .toLowerCase()
      ) === row.amount
  );
}

async function disneyAdapter(
  ctx: AdapterContext
): Promise<AdapterPrice[]> {
  const candidates: PriceCandidate[] = [
    ...registryCandidates(
      "disney-plus",
      ctx
    )
  ];

  /*
   * Disney's US storefront currently uses a materially different
   * bundle/catalogue presentation. Keep its verified registry
   * fallback until that structure has its own evidence-backed
   * parser rather than guessing from unrelated page prices.
   */
  if (ctx.countryCode === "US") {
    return resolvePriceCandidates(
      ctx,
      candidates
    );
  }

  const localeByCountry: Record<
    string,
    string
  > = {
    NO: "nb-no",
    SE: "sv-se",
    DK: "da-dk",
    DE: "de-de",
    ES: "es-es",
    FR: "fr-fr",
    IT: "it-it",
    PT: "pt-pt",
    NL: "nl-nl",
    BE: "nl-be",
    AT: "de-at",
    IE: "en-ie",
    FI: "fi-fi"
  };

  const locale =
    localeByCountry[ctx.countryCode];

  if (!locale) {
    return resolvePriceCandidates(
      ctx,
      candidates
    );
  }

  const url =
    "https" +
    "://" +
    "www.disneyplus.com/" +
    locale;

  try {
    const html =
      await fetchText(url);

    let authoritativePrices:
      DisneyPlusPrice[] = [];

    if (
      ctx.countryCode === "NO" &&
      ctx.currency === "NOK"
    ) {
      /*
       * Preserve Norway's existing stricter two-observation
       * validation because the Norwegian page can contain
       * introductory promotional prices.
       */
      const cardPrices =
        parseDisneyPlusCardRecurringPrices(
          html,
          ctx.currency
        );

      const footnotePrices =
        parseDisneyPlusCurrentPriceFootnote(
          html,
          ctx.currency
        );

      authoritativePrices =
        crossCheckDisneyPlusPrices(
          cardPrices,
          footnotePrices
        );
    } else {
      authoritativePrices =
        parseDisneyPlusLocalizedCardPrices(
          html,
          ctx.currency
        );
    }

    for (
      const price of authoritativePrices
    ) {
      const items =
        exactForRoute(
          "disney-plus",
          price.planName,
          ctx.countryCode,
          ctx.currency,
          price.amount,
          url,
          "direct"
        );

      candidates.push(
        ...officialStructuredCandidates(
          items
        )
      );
    }
  } catch {
    /*
     * Provider/network/markup failure must leave the verified
     * registry fallback intact. Never manufacture or FX-convert
     * a Disney+ price.
     */
  }

  return resolvePriceCandidates(
    ctx,
    candidates
  );
}

export type MaxStructuredPrice = {
  planName: string;
  amount: number;
  pricePlanId: string;
};

function normalizeMaxPlanName(
  planName: string
) {
  const normalized =
    planName
      .trim()
      .toLowerCase();

  /*
   * Official localized names observed in Max's structured
   * product records. Keep this mapping deliberately narrow:
   * only names proven by the provider are canonicalized.
   */
  const basicWithAds =
    new Set([
      "basis med reklame",
      "basic med reklam",
      "basis med reklamer",
      "basic avec pub",
      "base con pubblicità",
      "basic com anúncios",
      "basic met reclame",
      "basic (mainoksilla)"
    ]);

  if (
    basicWithAds.has(normalized)
  ) {
    return "Basic With Ads";
  }

  if (
    normalized === "standard" ||
    normalized === "standaard"
  ) {
    return "Standard";
  }

  if (normalized === "premium") {
    return "Premium";
  }

  return planName.trim();
}


export function parseMaxStructuredPrices(
  html: string,
  currency: string
): MaxStructuredPrice[] {
  const pattern =
    /"productName"\s*:\s*\{[^{}]*"plainText"\s*:\s*"([^"]+)"\s*\}\s*,\s*"price"\s*:\s*\{\s*"format"\s*:\s*"[^"]*"\s*,\s*"currencyCode"\s*:\s*"([A-Z]{3})"\s*,\s*"amount"\s*:\s*\{[^{}]*"plainText"\s*:\s*"([^"]+)"\s*\}\s*,\s*"period"\s*:\s*\{[^{}]*"plainText"\s*:\s*"([^"]+)"\s*\}\s*,\s*"currency"\s*:\s*\{[^{}]*"plainText"\s*:\s*"([^"]+)"\s*\}\s*\}\s*,\s*"pricePlan"\s*:\s*\{\s*"id"\s*:\s*"([^"]+)"\s*\}/g;

  const results:
    MaxStructuredPrice[] = [];

  const seen = new Set<string>();

  let match:
    RegExpExecArray | null;

  while (
    (match = pattern.exec(html)) !== null
  ) {
    const rawPlanName = match[1];
    const recordCurrency = match[2];
    const amountRaw = match[3];
    const period = match[4];
    const pricePlanId = match[6];

    if (
      recordCurrency !== currency
    ) {
      continue;
    }

    const normalizedPeriod =
      period
        .trim()
        .toLowerCase();

    const monthlyPeriods =
      new Set([
        "måned",
        "månad",
        "month",
        "monthly",
        "mois",
        "mese",
        "mês",
        "maand",
        "kuukausi"
      ]);

    if (
      !monthlyPeriods.has(
        normalizedPeriod
      )
    ) {
      continue;
    }

    const amount = Number(
      amountRaw
        .replace(/\s/g, "")
        .replace(",", ".")
    );

    if (
      !Number.isFinite(amount) ||
      amount <= 0 ||
      !pricePlanId
    ) {
      continue;
    }

    const planName =
      normalizeMaxPlanName(
        rawPlanName
      );

    const key =
      `${planName}|${amount}|${pricePlanId}`;

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);

    results.push({
      planName,
      amount,
      pricePlanId
    });
  }

  return results;
}


async function maxAdapter(
  ctx: AdapterContext
): Promise<AdapterPrice[]> {
  const candidates: PriceCandidate[] = [
    ...registryCandidates(
      "max",
      ctx
    )
  ];

  /*
   * Max/HBO Max exposes structured product records containing
   * localized plan name, exact currency, recurring amount,
   * billing period and provider price-plan ID.
   *
   * Only markets whose official country storefront has been
   * verified to expose that exact contract are enabled here.
   *
   * Markets with a different storefront representation remain
   * on verified registry fallback rather than being inferred.
   */
  const localeByCountry:
    Record<
      string,
      {
        currency: string;
        path: string;
      }
    > = {
      NO: {
        currency: "NOK",
        path: "no/no"
      },
      SE: {
        currency: "SEK",
        path: "se/sv"
      },
      DK: {
        currency: "DKK",
        path: "dk/da"
      },
      FR: {
        currency: "EUR",
        path: "fr/fr"
      },
      IT: {
        currency: "EUR",
        path: "it/it"
      },
      PT: {
        currency: "EUR",
        path: "pt/pt"
      },
      NL: {
        currency: "EUR",
        path: "nl/nl"
      },
      BE: {
        currency: "EUR",
        path: "be/nl"
      },
      FI: {
        currency: "EUR",
        path: "fi/fi"
      }
    };

  const locale =
    localeByCountry[
      ctx.countryCode
    ];

  if (
    !locale ||
    ctx.currency !==
      locale.currency
  ) {
    return resolvePriceCandidates(
      ctx,
      candidates
    );
  }

  const url =
    "https" +
    "://" +
    "www.max.com/" +
    locale.path;

  try {
    const html =
      await fetchText(url);

    const structuredPrices =
      parseMaxStructuredPrices(
        html,
        ctx.currency
      );

    for (
      const price of
      structuredPrices
    ) {
      const items =
        exactForRoute(
          "max",
          price.planName,
          ctx.countryCode,
          ctx.currency,
          price.amount,
          url,
          "direct"
        );

      candidates.push(
        ...officialStructuredCandidates(
          items
        )
      );
    }
  } catch {
    /*
     * Provider/network/parser failures must never remove
     * verified registry fallback pricing.
     */
  }

  return resolvePriceCandidates(
    ctx,
    candidates
  );
}



export type Microsoft365Price = {
  planName: string;
  amount: number;
};

export function parseMicrosoft365BasicPrice(
  html: string,
  currency: string
): Microsoft365Price | null {
  /*
   * Microsoft's Norway individuals page exposes
   * separate Basic annual and monthly SKU cards.
   *
   * We require all three values inside the same
   * bounded SKU:
   *
   *   Microsoft 365 Basic
   *   kr 20,00
   *   per måned
   *
   * This prevents the annual Basic card
   * (currently kr 199,00 per år) from being
   * interpreted as a monthly subscription.
   */
  if (currency !== "NOK") {
    return null;
  }

  const pattern =
    /<div\b[^>]*class="[^"]*\bsku\b[^"]*"[^>]*>[\s\S]{0,1800}?<h3\b[^>]*class="[^"]*\boc-product-title\b[^"]*"[^>]*>\s*Microsoft 365 Basic\s*<\/h3>[\s\S]{0,1000}?<span\b[^>]*class="[^"]*\boc-displayListPrice\b[^"]*"[^>]*>\s*kr\s*([0-9][0-9\s.,]*)\s*<\/span>[\s\S]{0,500}?<span\b[^>]*class="[^"]*\boc-displayUnit\b[^"]*"[^>]*>\s*per måned\s*<\/span>[\s\S]{0,500}?<\/div>/gi;

  let match: RegExpExecArray | null;

  while (
    (match = pattern.exec(html)) !== null
  ) {
    const amount =
      parseNumber(match[1]);

    if (
      amount == null ||
      amount <= 0
    ) {
      continue;
    }

    return {
      planName: "Basic",
      amount
    };
  }

  return null;
}

export function parseMicrosoft365Prices(
  html: string,
  currency: string
): Microsoft365Price[] {
  /*
   * Microsoft's Norway comparison cards contain the product
   * heading followed by both monthly and annual price elements.
   *
   * We intentionally require the explicit "/måned" price and
   * currently accept only Personal, Family and Premium.
   *
   * Basic is not present on this official comparison page and
   * therefore remains registry fallback.
   */
  if (currency !== "NOK") {
    return [];
  }

  const pattern =
    /<h2\b[^>]*>\s*Microsoft 365 (Personal|Family|Premium)\s*<\/h2>[\s\S]{0,1200}?<div\b[^>]*class="[^"]*\bsku1price\b[^"]*\bprice-heading\b[^"]*"[^>]*>\s*kr\s*([0-9][0-9\s.,]*)\s*\/måned\s*<\/div>/gi;

  const results: Microsoft365Price[] = [];
  const seen = new Set<string>();

  let match: RegExpExecArray | null;

  while (
    (match = pattern.exec(html)) !== null
  ) {
    const planName =
      match[1].trim();

    const amount =
      parseNumber(match[2]);

    if (
      amount == null ||
      amount <= 0
    ) {
      continue;
    }

    const key =
      `${planName}|${amount}`;

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);

    results.push({
      planName,
      amount
    });
  }

  return results;
}


function microsoft365InternationalLocale(
  countryCode: string,
  currency: string
): {
  path: string;
  acceptLanguage: string;
} | null {
  const locales: Record<
    string,
    {
      currency: string;
      path: string;
      acceptLanguage: string;
    }
  > = {
    US: {
      currency: "USD",
      path: "en-us",
      acceptLanguage:
        "en-US,en;q=0.9"
    },
    SE: {
      currency: "SEK",
      path: "sv-se",
      acceptLanguage:
        "sv-SE,sv;q=0.9,en;q=0.5"
    },
    DK: {
      currency: "DKK",
      path: "da-dk",
      acceptLanguage:
        "da-DK,da;q=0.9,en;q=0.5"
    },
    DE: {
      currency: "EUR",
      path: "de-de",
      acceptLanguage:
        "de-DE,de;q=0.9,en;q=0.5"
    },
    ES: {
      currency: "EUR",
      path: "es-es",
      acceptLanguage:
        "es-ES,es;q=0.9,en;q=0.5"
    },
    FR: {
      currency: "EUR",
      path: "fr-fr",
      acceptLanguage:
        "fr-FR,fr;q=0.9,en;q=0.5"
    },
    IT: {
      currency: "EUR",
      path: "it-it",
      acceptLanguage:
        "it-IT,it;q=0.9,en;q=0.5"
    },
    PT: {
      currency: "EUR",
      path: "pt-pt",
      acceptLanguage:
        "pt-PT,pt;q=0.9,en;q=0.5"
    },
    NL: {
      currency: "EUR",
      path: "nl-nl",
      acceptLanguage:
        "nl-NL,nl;q=0.9,en;q=0.5"
    },
    BE: {
      currency: "EUR",
      path: "nl-be",
      acceptLanguage:
        "nl-BE,nl;q=0.9,en;q=0.5"
    },
    AT: {
      currency: "EUR",
      path: "de-at",
      acceptLanguage:
        "de-AT,de;q=0.9,en;q=0.5"
    },
    IE: {
      currency: "EUR",
      path: "en-ie",
      acceptLanguage:
        "en-IE,en;q=0.9"
    },
    FI: {
      currency: "EUR",
      path: "fi-fi",
      acceptLanguage:
        "fi-FI,fi;q=0.9,en;q=0.5"
    }
  };

  const locale =
    locales[countryCode];

  if (
    !locale ||
    locale.currency !== currency
  ) {
    return null;
  }

  return {
    path: locale.path,
    acceptLanguage:
      locale.acceptLanguage
  };
}

function microsoft365CanonicalPlanName(
  title: string
): string | null {
  const normalized =
    title
      .replace(/\s+/g, " ")
      .trim()
      .toLocaleLowerCase();

  const aliases: Record<
    string,
    string
  > = {
    "microsoft 365 basic":
      "Basic",
    "microsoft 365 básico":
      "Basic",

    "microsoft 365 personal":
      "Personal",
    "microsoft 365 single":
      "Personal",
    "microsoft 365 personnel":
      "Personal",

    "microsoft 365 family":
      "Family",
    "microsoft 365 familia":
      "Family",
    "microsoft 365 famille":
      "Family",
    "microsoft 365 familiar":
      "Family",

    "microsoft 365 premium":
      "Premium"
  };

  return aliases[normalized] ?? null;
}

function microsoft365MonthlyUnit(
  unit: string
): boolean {
  const normalized =
    unit
      .replace(/\s+/g, " ")
      .trim()
      .toLocaleLowerCase();

  return (
    normalized === "/month" ||
    normalized === "/månad" ||
    normalized === "/måned" ||
    normalized === "/monat" ||
    normalized === "al mes" ||
    normalized === "/mois" ||
    normalized === "/mese" ||
    normalized === "/mês" ||
    normalized === "/maand" ||
    normalized === "/kuukausi"
  );
}

function microsoft365PriceAmount(
  value: string,
  currency: string
): number | null {
  const normalized =
    value
      .replace(
        /&nbsp;|&#160;|\u00a0/gi,
        " "
      )
      .replace(
        /\bTTC\b/gi,
        " "
      )
      .replace(/\s+/g, " ")
      .trim();

  let numeric: string | null = null;

  if (currency === "USD") {
    const match =
      /^\$\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)$/.exec(
        normalized
      );

    numeric =
      match?.[1] ?? null;
  } else if (
    currency === "NOK" ||
    currency === "SEK" ||
    currency === "DKK"
  ) {
    const match =
      /^(?:kr\.?\s*)?([0-9][0-9\s.]*(?:,[0-9]{1,2})?)(?:\s*kr\.?)?$/.exec(
        normalized
      );

    numeric =
      match?.[1] ?? null;
  } else if (currency === "EUR") {
    const match =
      /^(?:€\s*)?([0-9][0-9\s.]*(?:[,.][0-9]{1,2})?)(?:\s*€)?$/.exec(
        normalized
      );

    numeric =
      match?.[1] ?? null;
  }

  if (!numeric) {
    return null;
  }

  return parseNumber(numeric);
}

function microsoft365SkuField(
  block: string,
  className: string
): string | null {
  const pattern =
    new RegExp(
      '<(?:h3|span)\\b[^>]*class="[^"]*\\b' +
        className +
        '\\b[^"]*"[^>]*>' +
        '([\\s\\S]*?)' +
        '<\\/(?:h3|span)>',
      "i"
    );

  const match =
    pattern.exec(block);

  if (!match) {
    return null;
  }

  return htmlToText(
    match[1]
  )
    .replace(
      /&nbsp;|&#160;|\u00a0/gi,
      " "
    )
    .replace(
      /&amp;/gi,
      "&"
    )
    .replace(/\s+/g, " ")
    .trim();
}

export function parseMicrosoft365ChinaPrices(
  html: string,
  currency: string
): Microsoft365Price[] {
  /*
   * Microsoft's mainland China comparison page exposes
   * Personal and Family as localized plan cards:
   *
   *   Microsoft 365 个人版
   *   Microsoft 365 家庭版
   *
   * Each card contains separate monthly and annual prices.
   * Accept only the explicit CNY monthly amount and require
   * both mainland consumer plans. Never divide annual prices.
   */
  if (currency !== "CNY") {
    return [];
  }

  const plans = [
    {
      heading:
        /<h2\b[^>]*>\s*Microsoft 365 个人版\s*<\/h2>/i,
      planName: "Personal"
    },
    {
      heading:
        /<h2\b[^>]*>\s*Microsoft 365 家庭版\s*<\/h2>/i,
      planName: "Family"
    }
  ] as const;

  const results: Microsoft365Price[] = [];

  for (const plan of plans) {
    const headingMatches = [
      ...html.matchAll(
        new RegExp(
          plan.heading.source,
          `${plan.heading.flags}g`
        )
      )
    ];

    if (
      headingMatches.length !== 1 ||
      headingMatches[0].index == null
    ) {
      return [];
    }

    const titleIndex =
      headingMatches[0].index;

    const tail =
      html.slice(titleIndex);

    const annualMatch =
      /¥\s*[0-9][0-9,]*(?:\.[0-9]{1,2})?\s*\/\s*年/.exec(
        tail
      );

    if (
      annualMatch == null ||
      annualMatch.index == null
    ) {
      return [];
    }

    const block =
      tail.slice(
        0,
        annualMatch.index +
          annualMatch[0].length
      );

    const monthlyMatches = [
      ...block.matchAll(
        /¥\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)\s*\/\s*月/g
      )
    ];

    const amounts =
      new Set<number>();

    for (const match of monthlyMatches) {
      const amount =
        parseNumber(match[1]);

      if (
        amount != null &&
        amount > 0
      ) {
        amounts.add(amount);
      }
    }

    if (amounts.size !== 1) {
      return [];
    }

    results.push({
      planName: plan.planName,
      amount: [...amounts][0]
    });
  }

  return results;
}

export function parseMicrosoft365InternationalPrices(
  html: string,
  currency: string
): Microsoft365Price[] {
  /*
   * Microsoft's country-local individual subscription
   * page exposes annual and monthly offers as separate
   * SKU cards.
   *
   * Each card contains:
   *
   *   oc-product-title
   *   oc-displayListPrice
   *   oc-displayUnit
   *
   * We bind those three fields inside the same SKU
   * boundary and accept only an explicitly monthly unit.
   *
   * This avoids deriving a monthly price from an annual
   * offer and prevents prices from adjacent plans from
   * contaminating one another.
   *
   * International storefronts localize several plan
   * titles, so the official localized names are mapped
   * back to Savlivo's canonical Basic, Personal, Family
   * and Premium plan identities.
   *
   * A complete four-plan monthly set is required.
   * Partial or ambiguous pages are rejected.
   */
  if (
    ![
      "USD",
      "SEK",
      "DKK",
      "EUR"
    ].includes(currency)
  ) {
    return [];
  }

  const starts =
    [
      ...html.matchAll(
        /<div\b[^>]*class="[^"]*\bsku\b[^"]*"[^>]*>/gi
      )
    ];

  const found =
    new Map<string, number>();

  const ambiguous =
    new Set<string>();

  for (
    let index = 0;
    index < starts.length;
    index++
  ) {
    const start =
      starts[index].index ?? 0;

    const next =
      index + 1 < starts.length
        ? (
            starts[index + 1].index ??
            html.length
          )
        : html.length;

    const block =
      html.slice(
        start,
        Math.min(
          next,
          start + 5000
        )
      );

    const title =
      microsoft365SkuField(
        block,
        "oc-product-title"
      );

    const priceText =
      microsoft365SkuField(
        block,
        "oc-displayListPrice"
      );

    const unit =
      microsoft365SkuField(
        block,
        "oc-displayUnit"
      );

    if (
      !title ||
      !priceText ||
      !unit
    ) {
      continue;
    }

    const planName =
      microsoft365CanonicalPlanName(
        title
      );

    if (
      !planName ||
      !microsoft365MonthlyUnit(
        unit
      )
    ) {
      continue;
    }

    const amount =
      microsoft365PriceAmount(
        priceText,
        currency
      );

    if (
      amount == null ||
      amount <= 0
    ) {
      continue;
    }

    const existing =
      found.get(planName);

    if (
      existing != null &&
      existing !== amount
    ) {
      ambiguous.add(planName);
      continue;
    }

    found.set(
      planName,
      amount
    );
  }

  if (ambiguous.size) {
    return [];
  }

  const planNames = [
    "Basic",
    "Personal",
    "Family",
    "Premium"
  ];

  if (
    planNames.some(
      (planName) =>
        !found.has(planName)
    )
  ) {
    return [];
  }

  return planNames.map(
    (planName) => ({
      planName,
      amount:
        found.get(planName)!
    })
  );
}

async function microsoft365Adapter(
  ctx: AdapterContext
): Promise<AdapterPrice[]> {
  const candidates: PriceCandidate[] = [
    ...registryCandidates(
      "microsoft-365",
      ctx
    )
  ];

  /*
   * Preserve the proven Norway implementation exactly.
   * Its dedicated Basic and comparison-page parsers remain
   * independent of the international SKU contract.
   */
  if (
    ctx.countryCode === "NO" &&
    ctx.currency === "NOK"
  ) {
    const url =
      "https" +
      "://" +
      "www.microsoft.com/nb-no/microsoft-365/buy/compare-all-microsoft-365-products";

    const basicUrl =
      "https" +
      "://" +
      "www.microsoft.com/nb-no/microsoft-365/explore-microsoft-365-for-individuals";

    try {
      const basicHtml =
        await fetchText(
          basicUrl,
          "nb-NO,nb;q=0.9,no;q=0.8,en;q=0.5"
        );

      const basic =
        parseMicrosoft365BasicPrice(
          basicHtml,
          ctx.currency
        );

      if (basic) {
        const items =
          exactForRoute(
            "microsoft-365",
            basic.planName,
            ctx.countryCode,
            ctx.currency,
            basic.amount,
            basicUrl,
            "direct"
          );

        candidates.push(
          ...officialStructuredCandidates(
            items
          )
        );
      }
    } catch {
      /*
       * Basic source failure must preserve the
       * verified registry fallback.
       */
    }

    try {
      const html =
        await fetchText(url);

      const prices =
        parseMicrosoft365Prices(
          html,
          ctx.currency
        );

      for (const price of prices) {
        const items =
          exactForRoute(
            "microsoft-365",
            price.planName,
            ctx.countryCode,
            ctx.currency,
            price.amount,
            url,
            "direct"
          );

        candidates.push(
          ...officialStructuredCandidates(
            items
          )
        );
      }
    } catch {
      /*
       * Microsoft/network/parser failures must preserve
       * verified registry fallback pricing.
       */
    }

    return resolvePriceCandidates(
      ctx,
      candidates
    );
  }

  if (
    ctx.countryCode === "CN" &&
    ctx.currency === "CNY"
  ) {
    const url =
      "https" +
      "://" +
      "www.microsoft.com/zh-cn/microsoft-365/buy/compare-all-microsoft-365-products";

    try {
      const html =
        await fetchText(
          url,
          "zh-CN,zh;q=0.9,en;q=0.5"
        );

      const prices =
        parseMicrosoft365ChinaPrices(
          html,
          ctx.currency
        );

      for (const price of prices) {
        const items =
          exactForRoute(
            "microsoft-365",
            price.planName,
            ctx.countryCode,
            ctx.currency,
            price.amount,
            url,
            "direct"
          );

        candidates.push(
          ...officialStructuredCandidates(
            items
          )
        );
      }
    } catch {
      /*
       * Mainland Microsoft/network/parser failures
       * publish no invented price. Existing verified
       * registry candidates, if any, remain available.
       */
    }

    return resolvePriceCandidates(
      ctx,
      candidates
    );
  }

  const locale =
    microsoft365InternationalLocale(
      ctx.countryCode,
      ctx.currency
    );

  if (!locale) {
    return resolvePriceCandidates(
      ctx,
      candidates
    );
  }

  const url =
    "https" +
    "://" +
    "www.microsoft.com/" +
    locale.path +
    "/microsoft-365/explore-microsoft-365-for-individuals";

  try {
    const html =
      await fetchText(
        url,
        locale.acceptLanguage
      );

    const prices =
      parseMicrosoft365InternationalPrices(
        html,
        ctx.currency
      );

    for (const price of prices) {
      const items =
        exactForRoute(
          "microsoft-365",
          price.planName,
          ctx.countryCode,
          ctx.currency,
          price.amount,
          url,
          "direct"
        );

      candidates.push(
        ...officialStructuredCandidates(
          items
        )
      );
    }
  } catch {
    /*
     * International Microsoft/network/parser failures
     * publish no invented price. Existing verified
     * registry candidates, if any, remain available.
     */
  }

  return resolvePriceCandidates(
    ctx,
    candidates
  );
}

export type ICloudPlusPrice = {
  planName: string;
  amount: number;
};

function iCloudCurrencyPatterns(
  currency: string
): RegExp[] {
  /*
   * Apple localizes both currency placement and monthly
   * recurrence wording on its country-local iCloud pages.
   *
   * Keep extraction currency-specific. Never infer prices
   * through FX conversion or from a mismatched storefront.
   */
  const patterns: Record<string, RegExp[]> = {
    NOK: [
      /(?:kr|NOK)\s*([0-9][0-9\s.,]*)\s*(?:pr\.\s*md\.|per\s+m[åa]ned)/gi
    ],
    SEK: [
      /([0-9][0-9\s.,]*)\s*(?:kr|SEK)\s*\/\s*m[åa]nad/gi,
      /([0-9][0-9\s.,]*)\s*(?:kr|SEK)\s+per\s+m[åa]nad/gi
    ],
    DKK: [
      /([0-9][0-9\s.,]*)\s*(?:kr\.?|DKK)\s*\/\s*m[åa]ned/gi,
      /([0-9][0-9\s.,]*)\s*(?:kr\.?|DKK)\s+(?:pr\.?|per)\s+m[åa]ned/gi
    ],
    USD: [
      /\$\s*([0-9][0-9\s.,]*)\s*\/\s*month/gi,
      /\$\s*([0-9][0-9\s.,]*)\s+per\s+month/gi
    ],
    EUR: [
      /([0-9][0-9\s.,]*)\s*€\s*\/\s*(?:monat|mois|mese|mes|m[eê]s|maand|month|kuukausi|kk)/gi,
      /€\s*([0-9][0-9\s.,]*)\s*\/\s*(?:monat|mois|mese|mes|m[eê]s|maand|month|kuukausi|kk)/gi,
      /([0-9][0-9\s.,]*)\s*€\s+(?:pro|par|al|por|per)\s+(?:monat|mois|mese|mes|m[eê]s|maand|month|kuukausi)/gi,
      /€\s*([0-9][0-9\s.,]*)\s+(?:pro|par|al|por|per)\s+(?:monat|mois|mese|mes|m[eê]s|maand|month|kuukausi)/gi
    ],
    CNY: [
      /RMB\s*([0-9][0-9\s.,]*)\s*\/\s*月/gi
    ]
  };

  return patterns[currency] ?? [];
}

export function parseICloudPlusPrices(
  html: string,
  currency: string
): ICloudPlusPrice[] {
  /*
   * Apple's localized iCloud comparison table exposes stable
   * plan container classes for every paid storage tier:
   *
   *   plan-50gb
   *   plan-200gb
   *   plan-2tb
   *   plan-6tb
   *   plan-12tb
   *
   * This avoids depending on translated aria-label wording.
   * Each bounded plan container must expose exactly one
   * recurring monthly amount in the requested currency.
   *
   * All five paid tiers are required. Partial pages are
   * rejected rather than published as authoritative.
   */
  const currencyPatterns =
    iCloudCurrencyPatterns(currency);

  if (!currencyPatterns.length) {
    return [];
  }

  const plans = [
    {
      marker: "plan-50gb",
      planName: "50 GB"
    },
    {
      marker: "plan-200gb",
      planName: "200 GB"
    },
    {
      marker: "plan-2tb",
      planName: "2 TB"
    },
    {
      marker: "plan-6tb",
      planName: "6 TB"
    },
    {
      marker: "plan-12tb",
      planName: "12 TB"
    }
  ] as const;

  const results: ICloudPlusPrice[] = [];

  for (const plan of plans) {
    const marker =
      ` ${plan.marker}`;

    let markerIndex =
      html.indexOf(marker);

    if (markerIndex < 0) {
      markerIndex =
        html.indexOf(
          `"${plan.marker}"`
        );
    }

    if (markerIndex < 0) {
      continue;
    }

    const nextIndexes =
      plans
        .map((candidate) => {
          if (
            candidate.marker ===
            plan.marker
          ) {
            return -1;
          }

          const first =
            html.indexOf(
              ` ${candidate.marker}`,
              markerIndex + 1
            );

          if (first >= 0) {
            return first;
          }

          return html.indexOf(
            `"${candidate.marker}"`,
            markerIndex + 1
          );
        })
        .filter(
          (index) =>
            index > markerIndex
        );

    const endIndex =
      nextIndexes.length
        ? Math.min(...nextIndexes)
        : Math.min(
            html.length,
            markerIndex + 5000
          );

    const block =
      html.slice(
        markerIndex,
        endIndex
      );

    const text =
      htmlToText(block)
        .replace(
          /&nbsp;|&#160;|\u00a0/gi,
          " "
        )
        .replace(/\s+/g, " ")
        .trim();

    const found =
      new Set<number>();

    for (
      const pattern of
        currencyPatterns
    ) {
      const matches =
        text.matchAll(
          new RegExp(
            pattern.source,
            pattern.flags
          )
        );

      for (const match of matches) {
        const amount =
          parseNumber(
            match[1] ?? ""
          );

        if (
          amount != null &&
          amount > 0
        ) {
          found.add(amount);
        }
      }
    }

    if (found.size !== 1) {
      continue;
    }

    results.push({
      planName: plan.planName,
      amount: [...found][0]!
    });
  }

  if (
    results.length !==
    plans.length
  ) {
    return [];
  }

  return results;
}

function iCloudStorefrontPath(
  countryCode: string
): string | null {
  const storefronts: Record<
    string,
    string
  > = {
    NO: "no",
    US: "",
    SE: "se",
    DK: "dk",
    DE: "de",
    ES: "es",
    FR: "fr",
    IT: "it",
    PT: "pt",
    NL: "nl",
    BE: "be",
    AT: "at",
    IE: "ie",
    FI: "fi",
    CN: "cn"
  };

  return Object.prototype
    .hasOwnProperty.call(
      storefronts,
      countryCode
    )
    ? storefronts[countryCode]
    : null;
}

async function icloudPlusAdapter(
  ctx: AdapterContext
): Promise<AdapterPrice[]> {
  const candidates: PriceCandidate[] = [
    ...registryCandidates(
      "icloud-plus",
      ctx
    )
  ];

  const storefront =
    iCloudStorefrontPath(
      ctx.countryCode
    );

  if (storefront == null) {
    return resolvePriceCandidates(
      ctx,
      candidates
    );
  }

  const url =
    ctx.countryCode === "CN"
      ? (
          "https" +
          "://" +
          "www.apple.com.cn/icloud/"
        )
      : storefront
        ? (
            "https" +
            "://" +
            "www.apple.com/" +
            storefront +
            "/icloud/"
          )
        : (
            "https" +
            "://" +
            "www.apple.com/icloud/"
          );

  try {
    const html =
      await fetchText(url);

    const prices =
      parseICloudPlusPrices(
        html,
        ctx.currency
      );

    for (const price of prices) {
      const items =
        exactForRoute(
          "icloud-plus",
          price.planName,
          ctx.countryCode,
          ctx.currency,
          price.amount,
          url,
          "apple"
        );

      candidates.push(
        ...officialStructuredCandidates(
          items
        )
      );
    }
  } catch {
    /*
     * Provider/network/parser failures retain verified
     * registry or persisted fallback pricing.
     */
  }

  return resolvePriceCandidates(
    ctx,
    candidates
  );
}


export type AppleMusicPrice = {
  planName: string;
  amount: number;
};

function appleMusicCurrencyPatterns(
  currency: string
): RegExp[] {
  /*
   * Apple localizes both currency placement and recurring
   * monthly wording.
   *
   * Keep this deliberately currency-specific. A localized
   * page must expose the exact requested currency token;
   * never infer a price through FX conversion.
   */
  const patterns: Record<string, RegExp[]> = {
    NOK: [
      /(?:kr|NOK)\s*([0-9][0-9\s.,]*)\s+(?:per|pr\.?)\s+m[åa]ned/gi,
      /([0-9][0-9\s.,]*)\s*(?:kr|NOK)\s+(?:per|pr\.?)\s+m[åa]ned/gi
    ],
    SEK: [
      /(?:kr|SEK)\s*([0-9][0-9\s.,]*)\s+(?:per|i)\s+m[åa]nad/gi,
      /([0-9][0-9\s.,]*)\s*(?:kr|SEK)\s+(?:per|i)\s+m[åa]nad/gi,
      /([0-9][0-9\s.,]*)\s*(?:kr|SEK)\s*\/\s*m[åa]nad/gi
    ],
    DKK: [
      /(?:kr\.?|DKK)\s*([0-9][0-9\s.,]*)\s+(?:pr\.?|per)\s+m[åa]ned/gi,
      /([0-9][0-9\s.,]*)\s*(?:kr\.?|DKK)\s+(?:pr\.?|per)\s+m[åa]ned/gi,
      /([0-9][0-9\s.,]*)\s*(?:kr\.?|DKK)\s*\/\s*m[åa]ned/gi
    ],
    USD: [
      /\$\s*([0-9][0-9\s.,]*)\s*\/\s*month/gi,
      /\$\s*([0-9][0-9\s.,]*)\s+per\s+month/gi,
      /USD\s*([0-9][0-9\s.,]*)\s+(?:\/|per)\s*month/gi
    ],
    EUR: [
      /€\s*([0-9][0-9\s.,]*)\s*(?:\/\s*(?:month|monat|mois|mese|mes|m[eê]s|maand|m[åa]nad|kuukausi)|(?:per|pro|par|al|por|per|pro)\s+(?:month|monat|mois|mese|mes|m[eê]s|maand|kuukausi))/gi,
      /([0-9][0-9\s.,]*)\s*€\s*(?:\/\s*(?:month|monat|mois|mese|mes|m[eê]s|maand|kuukausi|kk)|(?:per|pro|par|al|por)\s+(?:month|monat|mois|mese|mes|m[eê]s|maand|kuukausi))/gi
    ],
    CNY: [
      /RMB\s*([0-9][0-9\s.,]*)\s*\/\s*月/gi,
      /每月(?:仅需)?\s*RMB\s*([0-9][0-9\s.,]*)/gi
    ]
  };

  return patterns[currency] ?? [];
}

export function parseAppleMusicPrices(
  html: string,
  currency: string
): AppleMusicPrice[] {
  /*
   * Apple's country-local Apple Music pages expose stable
   * gallery identities for the three recurring plans:
   *
   *   individual
   *   family
   *   student
   *
   * Plan identity therefore does not depend on translated
   * display names.
   *
   * Price extraction remains bounded to each gallery card.
   * All three cards must expose exactly one recurring monthly
   * price in the requested currency or the page is rejected.
   */
  const currencyPatterns =
    appleMusicCurrencyPatterns(currency);

  if (!currencyPatterns.length) {
    return [];
  }

  const plans = [
    {
      id: "individual",
      planName: "Individual"
    },
    {
      id: "family",
      planName: "Family"
    },
    {
      id: "student",
      planName: "Student"
    }
  ] as const;

  const results: AppleMusicPrice[] = [];

  for (const plan of plans) {
    const marker =
      `data-analytics-gallery-item-id="${plan.id}"`;

    const markerIndex =
      html.indexOf(marker);

    if (markerIndex < 0) {
      continue;
    }

    const nextMarkers =
      plans
        .map((candidate) =>
          candidate.id === plan.id
            ? -1
            : html.indexOf(
                `data-analytics-gallery-item-id="${candidate.id}"`,
                markerIndex + marker.length
              )
        )
        .filter(
          (index) => index > markerIndex
        );

    const appleOneIndex =
      html.indexOf(
        'data-analytics-gallery-item-id="apple one"',
        markerIndex + marker.length
      );

    if (appleOneIndex > markerIndex) {
      nextMarkers.push(appleOneIndex);
    }

    let endIndex =
      nextMarkers.length
        ? Math.min(...nextMarkers)
        : Math.min(
            html.length,
            markerIndex + 12000
          );

    /*
     * Mainland China's current Apple Music page publishes
     * Individual and Family as gallery cards, but Student
     * pricing later in the page FAQ.
     *
     * With no Student gallery marker, the generic Family
     * fallback window can otherwise reach that FAQ and make
     * the Family card falsely appear to contain several
     * recurring prices.
     *
     * For CNY only, stop at the first closing list-item tag
     * before the normal boundary. The gallery-card recurring
     * price appears before its nested benefit-list items.
     */
    if (currency === "CNY") {
      const closingItemIndex =
        html.indexOf(
          "</li>",
          markerIndex + marker.length
        );

      if (
        closingItemIndex > markerIndex &&
        closingItemIndex < endIndex
      ) {
        endIndex =
          closingItemIndex +
          "</li>".length;
      }
    }

    const card =
      html.slice(
        markerIndex,
        endIndex
      );

    const text =
      htmlToText(card)
        .replace(
          /&nbsp;|&#160;|\u00a0/gi,
          " "
        )
        .replace(/\s+/g, " ")
        .trim();

    const found =
      new Set<number>();

    for (const pattern of currencyPatterns) {
      /*
       * RegExp instances with /g are stateful. Clone each
       * expression before matchAll so every card starts at
       * lastIndex zero.
       */
      const matches =
        text.matchAll(
          new RegExp(
            pattern.source,
            pattern.flags
          )
        );

      for (const match of matches) {
        const amount =
          parseNumber(
            match[1] ?? ""
          );

        if (
          amount != null &&
          amount > 0
        ) {
          found.add(amount);
        }
      }
    }

    /*
     * A card with zero or multiple distinct recurring prices
     * is ambiguous and therefore rejected.
     */
    if (found.size !== 1) {
      continue;
    }

    results.push({
      planName: plan.planName,
      amount: [...found][0]!
    });
  }

  /*
   * Mainland China's current Apple Music page exposes
   * Individual and Family as gallery cards, while Student
   * is published in Apple's pricing FAQ rather than as a
   * third gallery card.
   *
   * Keep this fallback strictly CNY-only and tightly bound
   * to Apple's explicit Student-plan monthly-price wording.
   * Other markets retain the complete three-gallery-card
   * requirement below.
   */
  if (
    currency === "CNY" &&
    results.length === 2 &&
    results.some(
      (item) => item.planName === "Individual"
    ) &&
    results.some(
      (item) => item.planName === "Family"
    ) &&
    !results.some(
      (item) => item.planName === "Student"
    )
  ) {
    const pageText =
      htmlToText(html)
        .replace(
          /&nbsp;|&#160;|\u00a0/gi,
          " "
        )
        .replace(/\s+/g, " ")
        .trim();

    const studentMatches =
      pageText.matchAll(
        /学生可选择\s*Apple\s*Music\s*学生方案\s*[，,]?\s*每月仅需\s*RMB\s*([0-9][0-9\s.,]*)/gi
      );

    const studentPrices =
      new Set<number>();

    for (const match of studentMatches) {
      const amount =
        parseNumber(
          match[1] ?? ""
        );

      if (
        amount != null &&
        amount > 0
      ) {
        studentPrices.add(amount);
      }
    }

    if (studentPrices.size === 1) {
      results.push({
        planName: "Student",
        amount: [...studentPrices][0]!
      });
    }
  }

  /*
   * Never publish a partial Apple Music catalog as live
   * authoritative pricing.
   */
  if (results.length !== plans.length) {
    return [];
  }

  return results;
}

function appleMusicStorefrontPath(
  countryCode: string
): string | null {
  const storefronts: Record<string, string> = {
    NO: "no",
    US: "apple-music",
    SE: "se",
    DK: "dk",
    DE: "de",
    ES: "es",
    FR: "fr",
    IT: "it",
    PT: "pt",
    NL: "nl",
    BE: "be",
    AT: "at",
    IE: "ie",
    FI: "fi",
    CN: "cn"
  };

  return storefronts[countryCode] ?? null;
}

async function appleMusicAdapter(
  ctx: AdapterContext
): Promise<AdapterPrice[]> {
  const candidates: PriceCandidate[] = [
    ...registryCandidates(
      "apple-music",
      ctx
    )
  ];

  const storefront =
    appleMusicStorefrontPath(
      ctx.countryCode
    );

  if (!storefront) {
    return resolvePriceCandidates(
      ctx,
      candidates
    );
  }

  /*
   * US is Apple's unprefixed storefront.
   * Mainland China uses Apple's dedicated .com.cn domain.
   * Other supported markets use an explicit country path.
   */
  const url =
    ctx.countryCode === "CN"
      ? (
          "https" +
          "://" +
          "www.apple.com.cn/apple-music/"
        )
      : storefront === "apple-music"
        ? (
            "https" +
            "://" +
            "www.apple.com/apple-music/"
          )
        : (
            "https" +
            "://" +
            "www.apple.com/" +
            storefront +
            "/apple-music/"
          );

  try {
    const html =
      await fetchText(url);

    /*
     * Country-local Apple storefront path + exact requested
     * currency + complete stable gallery identities are all
     * required before these rows become structured provider
     * evidence.
     */
    const prices =
      parseAppleMusicPrices(
        html,
        ctx.currency
      );

    for (const price of prices) {
      const items =
        exactForRoute(
          "apple-music",
          price.planName,
          ctx.countryCode,
          ctx.currency,
          price.amount,
          url,
          "apple"
        );

      candidates.push(
        ...officialStructuredCandidates(
          items
        )
      );
    }
  } catch {
    /*
     * Network/provider/parser failures retain verified
     * registry pricing.
     */
  }

  return resolvePriceCandidates(
    ctx,
    candidates
  );
}

export function parseYoukuChinaPrices(
  html: string,
  currency: string
): Array<{
  planName: string;
  amount: number;
}> {
  if (currency !== "CNY") {
    return [];
  }

  /*
   * Youku's mainland VIP page embeds the featured anonymous
   * sell product in window.__INITIAL_DATA__.
   *
   * The current SVIP continuous-monthly offer has an
   * introductory sellPrice, so never treat sellPrice or the
   * crossed-out sellUnderlinePrice alone as the canonical
   * recurring amount.
   *
   * Publish only when the same product object explicitly says
   * that from a later month onward it renews at X yuan/month.
   */
  const marker = '"sellProductName"';
  const markerIndexes: number[] = [];

  let markerIndex = html.indexOf(marker);

  while (markerIndex >= 0) {
    markerIndexes.push(markerIndex);
    markerIndex = html.indexOf(
      marker,
      markerIndex + marker.length
    );
  }

  if (markerIndexes.length !== 1) {
    return [];
  }

  const findObjectStart = (
    text: string,
    position: number
  ): number => {
    const stack: number[] = [];
    let inString = false;
    let escaped = false;
    let quote = "";

    for (let i = 0; i < position; i += 1) {
      const char = text[i];

      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (char === "\\") {
          escaped = true;
        } else if (char === quote) {
          inString = false;
        }

        continue;
      }

      if (char === '"' || char === "'") {
        inString = true;
        quote = char;
      } else if (char === "{") {
        stack.push(i);
      } else if (
        char === "}" &&
        stack.length > 0
      ) {
        stack.pop();
      }
    }

    return stack.length > 0
      ? stack[stack.length - 1]
      : -1;
  };

  const findObjectEnd = (
    text: string,
    start: number
  ): number => {
    let depth = 0;
    let inString = false;
    let escaped = false;
    let quote = "";

    for (
      let i = start;
      i < text.length;
      i += 1
    ) {
      const char = text[i];

      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (char === "\\") {
          escaped = true;
        } else if (char === quote) {
          inString = false;
        }

        continue;
      }

      if (char === '"' || char === "'") {
        inString = true;
        quote = char;
      } else if (char === "{") {
        depth += 1;
      } else if (char === "}") {
        depth -= 1;

        if (depth === 0) {
          return i + 1;
        }
      }
    }

    return -1;
  };

  const objectStart = findObjectStart(
    html,
    markerIndexes[0]
  );

  if (objectStart < 0) {
    return [];
  }

  const objectEnd = findObjectEnd(
    html,
    objectStart
  );

  if (objectEnd < 0) {
    return [];
  }

  let product: Record<string, unknown>;

  try {
    product = JSON.parse(
      html.slice(
        objectStart,
        objectEnd
      )
    ) as Record<string, unknown>;
  } catch {
    return [];
  }

  if (
    product.sellProductName !== "SVIP会员" ||
    product.sellSkuName !== "连续包月" ||
    product.sellGoodsName !==
      "SVIP会员连续包月"
  ) {
    return [];
  }

  const description =
    typeof product.sellGoodsDesc === "string"
      ? product.sellGoodsDesc
      : "";

  const renewalMatch = description.match(
    /第\s*[0-9]+\s*个月起\s*([0-9]+(?:\.[0-9]{1,2})?)\s*元\s*\/\s*月/
  );

  if (!renewalMatch) {
    return [];
  }

  const amount = Number(
    renewalMatch[1]
  );

  if (
    !Number.isFinite(amount) ||
    amount <= 0
  ) {
    return [];
  }

  return [
    {
      planName: "SVIP",
      amount
    }
  ];
}

async function youkuAdapter(
  ctx: AdapterContext
): Promise<AdapterPrice[]> {
  const candidates: PriceCandidate[] = [
    ...registryCandidates(
      "youku",
      ctx
    )
  ];

  if (
    ctx.countryCode !== "CN" ||
    ctx.currency !== "CNY"
  ) {
    return resolvePriceCandidates(
      ctx,
      candidates
    );
  }

  const url =
    "https" +
    "://" +
    "www.youku.com/ku/webvip";

  try {
    const html = await fetchText(url);

    const prices =
      parseYoukuChinaPrices(
        html,
        ctx.currency
      );

    for (const price of prices) {
      const items = exactForRoute(
        "youku",
        price.planName,
        ctx.countryCode,
        ctx.currency,
        price.amount,
        url,
        "direct"
      );

      candidates.push(
        ...officialStructuredCandidates(
          items
        )
      );
    }
  } catch {
    /*
     * Network/provider/parser failures publish no guessed
     * Youku price. Registry fallback remains available if a
     * verified registry row is added in the future.
     */
  }

  return resolvePriceCandidates(
    ctx,
    candidates
  );
}

export function parseAppleTvPlusNorwayPrice(
  html: string,
  currency: string
): number | null {
  if (currency !== "NOK") {
    return null;
  }

  /*
   * Norway's official Apple TV marketing page repeats the
   * normal subscription price in the offer tile, FAQ and
   * footnotes.
   *
   * Require Apple TV subscription wording and a recurring
   * monthly NOK price. Do not accept generic Apple prices
   * such as Apple One.
   */
  const text = htmlToText(
    html
      .replace(
        /&nbsp;|&#160;|\u00a0/gi,
        " "
      )
  );

  const patterns = [
    /Få\s+Apple TV\s+for\s+bare\s+(?:kr|NOK)\s*([\d.,]+)\s+per\s+måned/i,
    /Apple TV-abonnementet.{0,180}?(?:kr|NOK)\s*([\d.,]+)\s+per\s+måned/i,
    /månedsabonnement\s+koster\s+bare\s+(?:kr|NOK)\s*([\d.,]+)\s+per\s+måned/i
  ];

  const found = new Set<number>();

  for (const pattern of patterns) {
    for (
      const match of text.matchAll(
        new RegExp(
          pattern.source,
          pattern.flags + "g"
        )
      )
    ) {
      const amount = parseNumber(
        match[1] ?? ""
      );

      if (
        amount != null &&
        amount > 0
      ) {
        found.add(amount);
      }
    }
  }

  if (found.size !== 1) {
    return null;
  }

  return [...found][0] ?? null;
}


function appleTvInternationalCurrencyPatterns(
  currency: string
): RegExp[] {
  const amount =
    "([0-9][0-9\\s.,]*)";

  const patterns: Record<
    string,
    RegExp[]
  > = {
    USD: [
      new RegExp(
        "\\$\\s*" +
        amount +
        "\\s*(?:per\\s+month|\\/\\s*month)",
        "gi"
      )
    ],
    SEK: [
      new RegExp(
        amount +
        "\\s*(?:kr|SEK)\\s*" +
        "(?:per\\s+m[åa]nad|\\/\\s*m[åa]nad)",
        "gi"
      )
    ],
    DKK: [
      new RegExp(
        amount +
        "\\s*(?:kr\\.?|DKK)\\s*" +
        "(?:pr\\.?\\s*m[åa]ned|\\/\\s*m[åa]ned)",
        "gi"
      )
    ],
    EUR: [
      new RegExp(
        "€\\s*" +
        amount +
        "\\s*" +
        "(?:per\\s+month|per\\s+maand|pro\\s+Monat|" +
        "al\\s+mese|al\\s+mes|par\\s+mois|" +
        "por\\s+m[eê]s|\\/\\s*(?:month|maand|Monat|" +
        "mese|mes|mois|m[eê]s|kk))",
        "gi"
      ),
      new RegExp(
        amount +
        "\\s*€\\s*" +
        "(?:per\\s+month|per\\s+maand|pro\\s+Monat|" +
        "im\\s+Monat|al\\s+mese|al\\s+mes|" +
        "par\\s+mois|por\\s+m[eê]s|kuussa|" +
        "\\/\\s*(?:month|maand|Monat|mese|mes|" +
        "mois|m[eê]s|kk))",
        "gi"
      )
    ]
  };

  return patterns[currency] ?? [];
}


export function parseAppleTvPlusInternationalPrice(
  html: string,
  currency: string
): number | null {
  /*
   * International Apple TV marketing pages contain
   * unrelated Apple One and Apple Music Student prices.
   *
   * Only accept a recurring monthly price from a bounded
   * Apple TV subscription context. Never select a generic
   * page-wide currency amount.
   *
   * Norway deliberately remains on its existing parser.
   */
  if (
    currency === "NOK"
  ) {
    return null;
  }

  const patterns =
    appleTvInternationalCurrencyPatterns(
      currency
    );

  if (!patterns.length) {
    return null;
  }

  const text =
    htmlToText(
      html
        .replace(
          /&nbsp;|&#160;|&#xA0;|\u00a0|\u202f/gi,
          " "
        )
        .replace(
          /&euro;|&#8364;|&#x20AC;/gi,
          "€"
        )
        .replace(
          /&dollar;|&#36;/gi,
          "$"
        )
    );

  /*
   * Apple consistently places the standalone subscription
   * offer near the Apple TV product name. Keep the window
   * intentionally small enough that Apple One pricing later
   * on the page cannot become the selected subscription.
   */
  const windows: string[] = [];

  const appleTv =
    /Apple\s*TV/gi;

  let match: RegExpExecArray | null;

  while (
    (match = appleTv.exec(text)) !== null
  ) {
    /*
     * Reject Apple TV mentions that are themselves part of
     * another Apple product offer, such as:
     *
     *   "Apple Music and Apple TV. Student Plan..."
     *   "Apple One ... Apple TV ..."
     *
     * Inspect only the short prefix immediately before the
     * matched Apple TV token. The genuine standalone Apple TV
     * subscription heading/offer has no competing Apple
     * product name in that local prefix.
     */
    const prefix =
      text
        .slice(
          Math.max(
            0,
            match.index - 80
          ),
          match.index
        )
        .toLowerCase();

    if (
      !prefix.includes(
        "apple music"
      ) &&
      !prefix.includes(
        "apple one"
      )
    ) {
      windows.push(
        text.slice(
          match.index,
          Math.min(
            text.length,
            match.index + 420
          )
        )
      );
    }

    if (!match[0].length) {
      appleTv.lastIndex++;
    }
  }

  const found =
    new Set<number>();

  for (const window of windows) {
    /*
     * Exclude windows whose Apple TV reference is merely
     * part of the Apple Music Student or Apple One offer.
     */
    const lower =
      window.toLowerCase();

    const firstAppleOne =
      lower.indexOf(
        "apple one"
      );

    const firstAppleMusic =
      lower.indexOf(
        "apple music"
      );

    for (const pattern of patterns) {
      pattern.lastIndex = 0;

      for (
        const priceMatch of
          window.matchAll(pattern)
      ) {
        const priceIndex =
          priceMatch.index ?? 0;

        if (
          firstAppleOne >= 0 &&
          firstAppleOne < priceIndex
        ) {
          continue;
        }

        if (
          firstAppleMusic >= 0 &&
          firstAppleMusic < priceIndex
        ) {
          continue;
        }

        const amount =
          parseNumber(
            priceMatch[1] ?? ""
          );

        if (
          amount != null &&
          amount > 0
        ) {
          found.add(amount);
        }
      }
    }
  }

  if (found.size !== 1) {
    return null;
  }

  return [...found][0] ?? null;
}


function appleTvStorefrontPath(
  countryCode: string
): string | null {
  const storefronts: Record<
    string,
    string
  > = {
    US: "",
    SE: "se",
    DK: "dk",
    DE: "de",
    ES: "es",
    FR: "fr",
    IT: "it",
    PT: "pt",
    NL: "nl",
    AT: "at",
    IE: "ie",
    FI: "fi"
  };

  return storefronts[
    countryCode
  ] ?? null;
}



export type PrimeVideoMarket = {
  countryCode: string;
  currency: string;
  localeTags: string[];
};

function primeVideoMarket(
  countryCode: string,
  currency: string
): PrimeVideoMarket | null {
  const markets: Record<
    string,
    {
      currency: string;
      localeTags: string[];
    }
  > = {
    NO: {
      currency: "NOK",
      localeTags: [
        "nb-no",
        "nb_no"
      ]
    },
    US: {
      currency: "USD",
      localeTags: [
        "en-us",
        "en_us"
      ]
    },
    SE: {
      currency: "SEK",
      localeTags: [
        "sv-se",
        "sv_se"
      ]
    },
    DK: {
      currency: "DKK",
      localeTags: [
        "da-dk",
        "da_dk"
      ]
    },
    DE: {
      currency: "EUR",
      localeTags: [
        "de-de",
        "de_de"
      ]
    },
    ES: {
      currency: "EUR",
      localeTags: [
        "es-es",
        "es_es"
      ]
    },
    FR: {
      currency: "EUR",
      localeTags: [
        "fr-fr",
        "fr_fr"
      ]
    },
    IT: {
      currency: "EUR",
      localeTags: [
        "it-it",
        "it_it"
      ]
    },
    PT: {
      currency: "EUR",
      localeTags: [
        "pt-pt",
        "pt_pt"
      ]
    },
    NL: {
      currency: "EUR",
      localeTags: [
        "nl-nl",
        "nl_nl"
      ]
    },
    BE: {
      currency: "EUR",
      localeTags: [
        "nl-be",
        "nl_be",
        "fr-be",
        "fr_be"
      ]
    },
    AT: {
      currency: "EUR",
      localeTags: [
        "de-at",
        "de_at"
      ]
    },
    IE: {
      currency: "EUR",
      localeTags: [
        "en-ie",
        "en_ie"
      ]
    },
    FI: {
      currency: "EUR",
      localeTags: [
        "fi-fi",
        "fi_fi"
      ]
    }
  };

  const market =
    markets[
      countryCode
        .trim()
        .toUpperCase()
    ];

  if (
    !market ||
    market.currency !== currency
  ) {
    return null;
  }

  return {
    countryCode:
      countryCode
        .trim()
        .toUpperCase(),
    currency,
    localeTags:
      market.localeTags
  };
}

function primeVideoHasMarketIdentity(
  html: string,
  market: PrimeVideoMarket
): boolean {
  const escapedCountry =
    market.countryCode.replace(
      /[.*+?^${}()|[\]\\]/g,
      "\\$&"
    );

  const territoryPattern =
    new RegExp(
      `["'](?:currentTerritory|recordTerritory)["']\\s*:\\s*["']${escapedCountry}["']`,
      "i"
    );

  if (
    !territoryPattern.test(html)
  ) {
    return false;
  }

  const normalizedTags =
    new Set(
      market.localeTags.map(
        value =>
          value
            .trim()
            .toLowerCase()
            .replace(/_/g, "-")
      )
    );

  const foundTags =
    new Set<string>();

  for (
    const match of
      html.matchAll(
        /["'](?:osLocale|locale)["']\s*:\s*["']([^"']+)["']/gi
      )
  ) {
    const value =
      match[1]
        ?.trim()
        .toLowerCase()
        .replace(/_/g, "-");

    if (value) {
      foundTags.add(value);
    }
  }

  const htmlLang =
    html.match(
      /<html[^>]+lang\s*=\s*["']([^"']+)["']/i
    )?.[1]
      ?.trim()
      .toLowerCase()
      .replace(/_/g, "-");

  if (htmlLang) {
    foundTags.add(htmlLang);
  }

  return [
    ...foundTags
  ].some(
    tag =>
      normalizedTags.has(tag)
  );
}

function primeVideoAmountPatterns(
  currency: string
): RegExp[] {
  if (currency === "NOK") {
    return [
      /([\d.,]+)\s*(?:kr|NOK)\s*\/\s*(?:måned|month)/gi,
      /(?:kr|NOK)\s*([\d.,]+)\s*\/\s*(?:måned|month)/gi,
      /([\d.,]+)\s*(?:kr|NOK).{0,40}?(?:per|pr\.?)\s*(?:måned|month)/gi,
      /(?:kr|NOK)\s*([\d.,]+).{0,40}?(?:per|pr\.?)\s*(?:måned|month)/gi
    ];
  }

  if (currency === "SEK") {
    return [
      /([\d.,]+)\s*(?:kr|SEK)\s*\/\s*(?:månad|month)/gi,
      /(?:kr|SEK)\s*([\d.,]+)\s*\/\s*(?:månad|month)/gi,
      /([\d.,]+)\s*(?:kr|SEK).{0,40}?per\s*(?:månad|month)/gi
    ];
  }

  if (currency === "DKK") {
    return [
      /([\d.,]+)\s*(?:kr\.?|DKK)\s*\/\s*(?:måned|month)/gi,
      /(?:kr\.?|DKK)\s*([\d.,]+)\s*\/\s*(?:måned|month)/gi,
      /([\d.,]+)\s*(?:kr\.?|DKK).{0,40}?(?:per|pr\.?)\s*(?:måned|month)/gi
    ];
  }

  if (currency === "USD") {
    return [
      /\$\s*([\d.,]+)\s*\/\s*month/gi,
      /([\d.,]+)\s*USD\s*\/\s*month/gi,
      /\$\s*([\d.,]+).{0,40}?per\s*month/gi,
      /([\d.,]+)\s*USD.{0,40}?per\s*month/gi
    ];
  }

  if (currency === "EUR") {
    return [
      /€\s*([\d.,]+)\s*\/\s*(?:month|monat|mois|mese|mês|maand|kuukausi)/gi,
      /([\d.,]+)\s*€\s*\/\s*(?:month|monat|mois|mese|mês|maand|kuukausi)/gi,
      /€\s*([\d.,]+).{0,40}?(?:per|pro|par|al|por)\s*(?:month|monat|mes|mois|mese|mês|maand|kuukausi)/gi,
      /([\d.,]+)\s*€.{0,40}?(?:per|pro|par|al|por)\s*(?:month|monat|mes|mois|mese|mês|maand|kuukausi)/gi
    ];
  }

  return [];
}

export function parsePrimeVideoPrice(
  html: string,
  countryCode: string,
  currency: string
): number | null {
  const market =
    primeVideoMarket(
      countryCode,
      currency
    );

  if (!market) {
    return null;
  }

  /*
   * Currency or GeoFetch metadata alone is never authority.
   * Prime Video itself must expose the requested territory
   * and an expected locale identity in the returned page.
   */
  if (
    !primeVideoHasMarketIdentity(
      html,
      market
    )
  ) {
    return null;
  }

  /*
   * Stay anchored to Prime Video's own structured offer
   * widget so Amazon Prime, channels and rental prices do
   * not become subscription candidates.
   */
  const markerMatches = [
    ...html.matchAll(
      /["']planLogoAltText["']\s*:\s*["']Prime Video["']/gi
    )
  ];

  if (!markerMatches.length) {
    return null;
  }

  const patterns =
    primeVideoAmountPatterns(
      currency
    );

  if (!patterns.length) {
    return null;
  }

  const found =
    new Set<number>();

  for (const marker of markerMatches) {
    const markerIndex =
      marker.index ?? -1;

    if (markerIndex < 0) {
      continue;
    }

    const block =
      html
        .slice(
          Math.max(
            0,
            markerIndex - 6000
          ),
          Math.min(
            html.length,
            markerIndex + 6000
          )
        )
        .replace(
          /\\u002F/gi,
          "/"
        );

    const text =
      block
        .replace(
          /&nbsp;|&#160;/gi,
          " "
        )
        .replace(
          /&amp;/gi,
          "&"
        )
        .replace(
          /&quot;/gi,
          '"'
        )
        .replace(
          /&#39;/gi,
          "'"
        )
        .replace(
          /\s+/g,
          " "
        )
        .trim();

    for (const pattern of patterns) {
      pattern.lastIndex = 0;

      for (
        const priceMatch of
          text.matchAll(pattern)
      ) {
        const amount =
          parseNumber(
            priceMatch[1] ?? ""
          );

        if (
          amount != null &&
          amount > 0
        ) {
          found.add(amount);
        }
      }
    }
  }

  if (found.size !== 1) {
    return null;
  }

  return (
    [...found][0] ??
    null
  );
}

/*
 * Compatibility wrapper keeps the already-validated Norway
 * contract and its existing adapter behavior unchanged.
 */
export function parsePrimeVideoNorwayPrice(
  html: string,
  currency: string
): number | null {
  return parsePrimeVideoPrice(
    html,
    "NO",
    currency
  );
}

async function appleTvAdapter(
  ctx: AdapterContext
): Promise<AdapterPrice[]> {
  const candidates: PriceCandidate[] = [
    ...registryCandidates(
      "apple-tv-plus",
      ctx
    )
  ];

  /*
   * Preserve the existing Norway implementation exactly.
   * The Norway marketing page has already been independently
   * validated by the dedicated Norway parser/tests.
   */
  if (
    ctx.countryCode === "NO" &&
    ctx.currency === "NOK"
  ) {
    const url =
      "https" +
      "://" +
      "www.apple.com/no/apple-tv/";

    try {
      const response =
        await fetch(url, {
          redirect: "follow",
          headers: {
            "user-agent":
              "Mozilla/5.0 (compatible; SavlivoPricing/1.0)",
            "accept-language":
              "nb-NO,nb;q=0.9,en;q=0.7"
          }
        });

      if (response.ok) {
        const html =
          await response.text();

        const amount =
          parseAppleTvPlusNorwayPrice(
            html,
            ctx.currency
          );

        if (
          amount != null
        ) {
          const items =
            exactForRoute(
              "apple-tv-plus",
              "Apple TV",
              ctx.countryCode,
              ctx.currency,
              amount,
              url,
              "apple"
            );

          candidates.push(
            ...officialStructuredCandidates(
              items
            )
          );
        }
      }
    } catch {
      /*
       * Provider/network/parser failures retain verified
       * registry or persisted fallback pricing.
       */
    }

    return resolvePriceCandidates(
      ctx,
      candidates
    );
  }

  /*
   * International storefronts are enabled only where the
   * official country-local Apple page has been observed to
   * expose an exact recurring monthly Apple TV price.
   *
   * Belgium is intentionally absent because the verified
   * /be/apple-tv/ storefront currently returns 404.
   */
  const storefront =
    appleTvStorefrontPath(
      ctx.countryCode
    );

  if (storefront == null) {
    return resolvePriceCandidates(
      ctx,
      candidates
    );
  }

  const path =
    storefront
      ? storefront + "/"
      : "";

  const url =
    "https" +
    "://" +
    "www.apple.com/" +
    path +
    "apple-tv/";

  try {
    const response =
      await fetch(url, {
        redirect: "follow",
        headers: {
          "user-agent":
            "Mozilla/5.0 (compatible; SavlivoPricing/1.0)",
          "accept-language":
            "en-US,en;q=0.8"
        }
      });

    if (response.ok) {
      const html =
        await response.text();

      const amount =
        parseAppleTvPlusInternationalPrice(
          html,
          ctx.currency
        );

      if (
        amount != null
      ) {
        const items =
          exactForRoute(
            "apple-tv-plus",
            "Apple TV",
            ctx.countryCode,
            ctx.currency,
            amount,
            url,
            "apple"
          );

        candidates.push(
          ...officialStructuredCandidates(
            items
          )
        );
      }
    }
  } catch {
    /*
     * Provider/network/parser failures retain verified
     * registry or persisted fallback pricing.
     */
  }

  return resolvePriceCandidates(
    ctx,
    candidates
  );
}



function amazonTld(cc: string) {
  const map: Record<string, string> = {
    US:"com", CA:"ca", MX:"com.mx", BR:"com.br", GB:"co.uk",
    DE:"de", FR:"fr", IT:"it", ES:"es", NL:"nl", SE:"se",
    PL:"pl", AU:"com.au", JP:"co.jp", IN:"in", TR:"com.tr"
  };
  return map[cc] ?? "com";
}

export function parseAmazonPrimeMonthlyPrice(
  html: string,
  currency: string
): number | null {
  /*
   * Amazon's verified Prime membership storefronts expose
   * the normal recurring monthly membership as the first
   * ChoosePlanRadioButton card:
   *
   *   data-index="1"
   *
   * Other cards can contain annual, student / young-adult,
   * Prime Access, or other discounted prices. Never scan
   * the whole page for an arbitrary currency amount.
   */
  const cardMatch =
    html.match(
      /<div\b[^>]*data-a-input-name=["']ChoosePlanRadioButton["'][^>]*data-index=["']1["'][^>]*>[\s\S]{0,2200}?<\/label>\s*<\/div>/i
    );

  if (!cardMatch) {
    return null;
  }

  const card =
    cardMatch[0];

  const text =
    htmlToText(card)
      .replace(
        /\s+/g,
        " "
      )
      .trim();

  /*
   * Require recurring-month semantics inside the same
   * bounded plan card.
   */
  const monthlyPattern =
    /(?:per\s+month|\/month|per\s+månad|pro\s+monat|al\s+mes|par\s+mois|por\s+m[eê]s|per\s+maand)/i;

  if (
    !monthlyPattern.test(text)
  ) {
    return null;
  }

  let amountPatterns:
    RegExp[];

  if (
    currency === "USD"
  ) {
    amountPatterns = [
      /\$\s*([0-9]+(?:[.,][0-9]{1,2})?)/g,
      /([0-9]+(?:[.,][0-9]{1,2})?)\s*USD\b/gi
    ];
  } else if (
    currency === "SEK"
  ) {
    amountPatterns = [
      /([0-9]+(?:[.,][0-9]{1,2})?)\s*kr\b/gi
    ];
  } else if (
    currency === "EUR"
  ) {
    amountPatterns = [
      /€\s*([0-9]+(?:[.,][0-9]{1,2})?)/g,
      /([0-9]+(?:[.,][0-9]{1,2})?)\s*€/g
    ];
  } else {
    return null;
  }

  const amounts =
    new Set<number>();

  for (
    const pattern of
      amountPatterns
  ) {
    for (
      const match of
        text.matchAll(pattern)
    ) {
      const amount =
        parseNumber(
          match[1] ?? ""
        );

      if (
        amount != null &&
        amount > 0
      ) {
        amounts.add(amount);
      }
    }
  }

  if (
    amounts.size !== 1
  ) {
    return null;
  }

  return [...amounts][0] ?? null;
}

type AmazonPrimeStorefront = {
  host: string;
  locale: string;
  expectedHtmlLang: string;
};

function amazonPrimeStorefront(
  countryCode: string
): AmazonPrimeStorefront | null {
  const map:
    Record<
      string,
      AmazonPrimeStorefront
    > = {
      US: {
        host: "www.amazon.com",
        locale: "en-US",
        expectedHtmlLang: "en-us"
      },
      SE: {
        host: "www.amazon.se",
        locale: "sv-SE",
        expectedHtmlLang: "sv-se"
      },
      DE: {
        host: "www.amazon.de",
        locale: "de-DE",
        expectedHtmlLang: "de-de"
      },
      ES: {
        host: "www.amazon.es",
        locale: "es-ES",
        expectedHtmlLang: "es-es"
      },
      FR: {
        host: "www.amazon.fr",
        locale: "fr-FR",
        expectedHtmlLang: "fr-fr"
      },
      IT: {
        host: "www.amazon.it",
        locale: "it-IT",
        expectedHtmlLang: "it-it"
      },
      /*
       * Portugal is intentionally served by Amazon's
       * Spanish marketplace. The official storefront
       * returns a distinct pt-PT Prime presentation when
       * requested with the Portuguese locale.
       */
      PT: {
        host: "www.amazon.es",
        locale: "pt-PT",
        expectedHtmlLang: "pt-pt"
      },
      NL: {
        host: "www.amazon.nl",
        locale: "nl-NL",
        expectedHtmlLang: "nl-nl"
      },
      BE: {
        host: "www.amazon.com.be",
        locale: "nl-BE",
        expectedHtmlLang: "nl-be"
      },
      IE: {
        host: "www.amazon.ie",
        locale: "en-IE",
        expectedHtmlLang: "en-ie"
      }
    };

  return (
    map[countryCode] ??
    null
  );
}

function amazonPrimeHtmlLang(
  html: string
): string | null {
  const match =
    html.match(
      /<html\b[^>]*\blang\s*=\s*["']([^"']+)["']/i
    );

  return (
    match?.[1]
      ?.trim()
      .toLowerCase() ??
    null
  );
}

async function amazonPrimeAdapter(
  ctx: AdapterContext
): Promise<AdapterPrice[]> {
  const candidates:
    PriceCandidate[] = [
      ...registryCandidates(
        "amazon-prime",
        ctx
      )
    ];

  /*
   * Amazon Prime membership is separate from standalone
   * Prime Video.
   *
   * Only storefronts whose country / locale behavior has
   * been independently verified are eligible for live
   * authoritative pricing.
   *
   * Austria is deliberately excluded: de-AT currently
   * resolves to the German de-DE storefront identity.
   */
  const storefront =
    amazonPrimeStorefront(
      ctx.countryCode
    );

  if (!storefront) {
    return resolvePriceCandidates(
      ctx,
      candidates
    );
  }

  const allowedCurrencies:
    Record<string, string> = {
      US: "USD",
      SE: "SEK",
      DE: "EUR",
      ES: "EUR",
      FR: "EUR",
      IT: "EUR",
      PT: "EUR",
      NL: "EUR",
      BE: "EUR",
      IE: "EUR"
    };

  if (
    allowedCurrencies[
      ctx.countryCode
    ] !== ctx.currency
  ) {
    return resolvePriceCandidates(
      ctx,
      candidates
    );
  }

  const url =
    "https" +
    "://" +
    storefront.host +
    "/prime";

  try {
    const response =
      await fetch(
        url,
        {
          redirect: "follow",
          headers: {
            accept:
              "text/html,application/xhtml+xml",
            "accept-language":
              storefront.locale +
              "," +
              storefront.locale
                .split("-")[0] +
              ";q=0.9,en;q=0.5",
            "user-agent":
              "Mozilla/5.0 (compatible; SavlivoPricing/1.1)"
          }
        }
      );

    if (response.ok) {
      const html =
        await response.text();

      const htmlLang =
        amazonPrimeHtmlLang(
          html
        );

      if (
        htmlLang ===
        storefront.expectedHtmlLang
      ) {
        const amount =
          parseAmazonPrimeMonthlyPrice(
            html,
            ctx.currency
          );

        if (
          amount != null &&
          amount > 0
        ) {
          const items =
            exactForRoute(
              "amazon-prime",
              "Amazon Prime",
              ctx.countryCode,
              ctx.currency,
              amount,
              response.url,
              "amazon"
            );

          candidates.push(
            ...officialStructuredCandidates(
              items
            )
          );
        }
      }
    }
  } catch {
    /*
     * Network/provider/parser failures retain verified
     * registry or persisted fallback pricing.
     */
  }

  return resolvePriceCandidates(
    ctx,
    candidates
  );
}


async function primeVideoAdapter(
  ctx: AdapterContext
): Promise<AdapterPrice[]> {
  const candidates: PriceCandidate[] = [
    ...registryCandidates(
      "prime-video",
      ctx
    )
  ];

  const url =
    "https" +
    "://" +
    "www.primevideo.com/";

  /*
   * Preserve the independently validated Norway path exactly:
   * direct request, Norwegian locale, Norway compatibility
   * parser and direct billing route.
   */
  if (
    ctx.countryCode === "NO" &&
    ctx.currency === "NOK"
  ) {
    try {
      const html =
        await fetchText(
          url,
          "nb-NO,nb;q=0.9,no;q=0.8,en;q=0.5"
        );

      const amount =
        parsePrimeVideoNorwayPrice(
          html,
          ctx.currency
        );

      if (
        amount != null &&
        amount > 0
      ) {
        const items =
          exactForRoute(
            "prime-video",
            "Prime Video",
            ctx.countryCode,
            ctx.currency,
            amount,
            url,
            "direct"
          );

        candidates.push(
          ...officialStructuredCandidates(
            items
          )
        );
      }
    } catch {}

    return resolvePriceCandidates(
      ctx,
      candidates
    );
  }

  /*
   * International Prime Video is geo-sensitive.
   *
   * Do not issue a normal direct request for a foreign market:
   * from a Norway-hosted API that could simply return Norway.
   * International live pricing therefore stays registry-only
   * unless the server has explicitly configured GeoFetch.
   */
  if (!geoFetchConfigFromEnv()) {
    return resolvePriceCandidates(
      ctx,
      candidates
    );
  }

  const localeByCountry:
    Record<string, string> = {
      US:
        "en-US,en;q=0.9",
      SE:
        "sv-SE,sv;q=0.9,en;q=0.5",
      DK:
        "da-DK,da;q=0.9,en;q=0.5",
      DE:
        "de-DE,de;q=0.9,en;q=0.5",
      ES:
        "es-ES,es;q=0.9,en;q=0.5",
      FR:
        "fr-FR,fr;q=0.9,en;q=0.5",
      IT:
        "it-IT,it;q=0.9,en;q=0.5",
      PT:
        "pt-PT,pt;q=0.9,en;q=0.5",
      NL:
        "nl-NL,nl;q=0.9,en;q=0.5",
      BE:
        "nl-BE,nl;q=0.9,fr-BE;q=0.8,fr;q=0.7,en;q=0.5",
      AT:
        "de-AT,de;q=0.9,en;q=0.5",
      IE:
        "en-IE,en;q=0.9",
      FI:
        "fi-FI,fi;q=0.9,en;q=0.5"
    };

  const acceptLanguage =
    localeByCountry[
      ctx.countryCode
    ];

  if (!acceptLanguage) {
    return resolvePriceCandidates(
      ctx,
      candidates
    );
  }

  try {
    const fetched =
      await fetchCountryText(
        url,
        ctx.countryCode,
        {
          acceptLanguage
        }
      );

    /*
     * GeoFetch transport metadata is deliberately not an
     * authority signal. parsePrimeVideoPrice must independently
     * find Prime Video's own matching territory + locale and an
     * unambiguous recurring subscription price.
     */
    const amount =
      parsePrimeVideoPrice(
        fetched.text,
        ctx.countryCode,
        ctx.currency
      );

    if (
      amount != null &&
      amount > 0
    ) {
      /*
       * Preserve an already verified Prime Video billing route
       * when one exists in the registry. Markets without such a
       * row use the direct Prime Video storefront route.
       */
      const registryRoute =
        candidates.find(
          candidate =>
            candidate.item.serviceSlug ===
              "prime-video" &&
            candidate.item.countryCode ===
              ctx.countryCode &&
            candidate.item.currency ===
              ctx.currency
        )?.item.billingProviderSlug;

      const billingProviderSlug =
        registryRoute ??
        "direct";

      const items =
        exactForRoute(
          "prime-video",
          "Prime Video",
          ctx.countryCode,
          ctx.currency,
          amount,
          fetched.finalUrl ||
            url,
          billingProviderSlug
        );

      candidates.push(
        ...officialStructuredCandidates(
          items
        )
      );
    }
  } catch {}

  return resolvePriceCandidates(
    ctx,
    candidates
  );
}

export type YouTubePremiumPrice = {
  planName: string;
  amount: number;
};

export function parseYouTubePremiumPrices(
  html: string,
  currency: string
): YouTubePremiumPrice[] {
  /*
   * The Norwegian YouTube purchase flow exposes subscription
   * choices as structured optionItemRenderer objects.
   *
   * Regular YouTube Premium currently exposes:
   *
   *   Individual -> 169 NOK/month
   *   Family     -> 269 NOK/month
   *   Student    ->  99 NOK/month
   *
   * The same page can also contain Premium Lite. Premium Lite
   * must never be mistaken for the normal Individual plan.
   *
   * Parse only option items whose optionId begins with the
   * regular Premium "unlimited.P." product family.
   */
  if (currency !== "NOK") {
    return [];
  }

  const planNames: Record<string, string> = {
    "Enkeltperson": "Individual",
    "Personlig": "Individual",
    "Familieabonnement": "Family",
    "Student": "Student"
  };

  const found = new Map<
    string,
    number
  >();

  const marker =
    '"optionItemRenderer":';

  let from = 0;

  while (true) {
    const markerIndex =
      html.indexOf(
        marker,
        from
      );

    if (markerIndex < 0) {
      break;
    }

    const nextIndex =
      html.indexOf(
        marker,
        markerIndex +
          marker.length
      );

    const endIndex =
      nextIndex >= 0
        ? nextIndex
        : Math.min(
            html.length,
            markerIndex + 10000
          );

    const block =
      html.slice(
        markerIndex,
        endIndex
      );

    from =
      markerIndex +
      marker.length;

    const optionId =
      block.match(
        /"optionId":"([^"]+)"/
      )?.[1];

    if (
      !optionId ||
      !optionId.startsWith(
        "unlimited.P."
      )
    ) {
      continue;
    }

    const title =
      block.match(
        /"title":\{"runs":\[\{"text":"([^"]+)"\}/
      )?.[1];

    if (!title) {
      continue;
    }

    const planName =
      planNames[title];

    if (!planName) {
      continue;
    }

    /*
     * Require the recurring price to follow YouTube's explicit
     * "Deretter" wording. This prevents the 0 kr introductory
     * trial from being interpreted as the subscription price.
     *
     * YouTube inserts invisible Unicode formatting characters
     * around the slash, so allow non-digit/non-letter characters
     * between "kr" and "måned".
     */
    const recurring =
      block.match(
        /Deretter[^0-9]{0,80}([0-9]+(?:,[0-9]{2})?)\s*kr[^A-Za-zÀ-ž0-9]{0,20}måned/i
      );

    const amount =
      parseNumber(
        recurring?.[1] ?? ""
      );

    if (
      amount == null ||
      amount <= 0
    ) {
      continue;
    }

    const existing =
      found.get(planName);

    /*
     * Duplicate purchase-flow payloads are common in YouTube's
     * HTML. Equal duplicates are fine. Conflicting prices for the
     * same normalized plan make the page ambiguous, so reject it.
     */
    if (
      existing != null &&
      existing !== amount
    ) {
      return [];
    }

    found.set(
      planName,
      amount
    );
  }

  const expected = [
    "Individual",
    "Family",
    "Student"
  ];

  if (
    expected.some(
      (planName) =>
        !found.has(planName)
    )
  ) {
    return [];
  }

  return expected.map(
    (planName) => ({
      planName,
      amount:
        found.get(planName)!
    })
  );
}


function youtubePremiumPortugalStoreAdapter(
  ctx: AdapterContext
): AdapterPrice[] {
  if (
    ctx.countryCode !== "PT" ||
    ctx.currency !== "EUR"
  ) {
    return [];
  }

  const sourceUrl =
    "https" +
    "://" +
    "apps.apple.com/pt/app/youtube/id544007664";

  const items = [
    ...exactForRoute(
      "youtube-premium",
      "Individual",
      "PT",
      "EUR",
      13.99,
      sourceUrl,
      "direct"
    ),
    ...exactForRoute(
      "youtube-premium",
      "Family",
      "PT",
      "EUR",
      25.99,
      sourceUrl,
      "direct"
    )
  ];

  return resolvePriceCandidates(
    ctx,
    officialStoreCandidates(items)
  );
}

async function youtubePremiumAdapter(
  ctx: AdapterContext
): Promise<AdapterPrice[]> {
  const candidates: PriceCandidate[] = [
    ...registryCandidates(
      "youtube-premium",
      ctx
    )
  ];

  if (
    ctx.countryCode === "PT" &&
    ctx.currency === "EUR"
  ) {
    return youtubePremiumPortugalStoreAdapter(ctx);
  }

  /*
   * This structured parser has been verified specifically against
   * YouTube's Norwegian purchase-flow payload.
   *
   * Do not generalize it to other markets until their localized
   * recurring-price structure has been independently verified.
   */
  if (
    ctx.countryCode !== "NO" ||
    ctx.currency !== "NOK"
  ) {
    return resolvePriceCandidates(
      ctx,
      candidates
    );
  }

  const url =
    "https" +
    "://" +
    "www.youtube.com/premium?gl=NO&hl=no";

  try {
    const html =
      await fetchText(
        url,
        "nb-NO,nb;q=0.9,no;q=0.8,en;q=0.7"
      );

    const prices =
      parseYouTubePremiumPrices(
        html,
        ctx.currency
      );

    for (const price of prices) {
      const items =
        exactForRoute(
          "youtube-premium",
          price.planName,
          ctx.countryCode,
          ctx.currency,
          price.amount,
          url,
          "direct"
        );

      candidates.push(
        ...officialStructuredCandidates(
          items
        )
      );
    }
  } catch {
    /*
     * Network/provider/parser failures retain verified registry
     * pricing rather than publishing guessed live values.
     */
  }

  return resolvePriceCandidates(
    ctx,
    candidates
  );
}



type ChinaStoreEstimatedPlan = {
  planName: string;
  monthlyPriceMinor: number;
};

const chinaStoreEstimatedCatalog: Record<
  string,
  {
    sourceUrl: string;
    plans: ChinaStoreEstimatedPlan[];
  }
> = {
  "tencent-video": {
    sourceUrl:
      "https" + "://" + "apps.apple.com/cn/app/id458318329",
    plans: [
      { planName: "Tencent Video VIP", monthlyPriceMinor: 2500 },
      { planName: "Super Film VIP", monthlyPriceMinor: 3500 }
    ]
  },
  iqiyi: {
    sourceUrl:
      "https" + "://" + "apps.apple.com/cn/app/id1012296988",
    plans: [
      { planName: "Gold VIP", monthlyPriceMinor: 2500 },
      { planName: "Platinum VIP", monthlyPriceMinor: 3500 },
      { planName: "Star Diamond VIP", monthlyPriceMinor: 4500 }
    ]
  },
  "mango-tv": {
    sourceUrl:
      "https" + "://" + "apps.apple.com/cn/app/id1462725166",
    plans: [
      { planName: "VIP", monthlyPriceMinor: 2200 },
      { planName: "SVIP", monthlyPriceMinor: 2800 },
      { planName: "Full-screen VIP", monthlyPriceMinor: 3500 }
    ]
  },
  bilibili: {
    sourceUrl:
      "https" + "://" + "apps.apple.com/cn/app/id736536022",
    plans: [
      { planName: "Big Member", monthlyPriceMinor: 1500 }
    ]
  },
  "qq-music": {
    sourceUrl:
      "https" + "://" + "apps.apple.com/cn/app/id414603431",
    plans: [
      { planName: "Green Diamond", monthlyPriceMinor: 1500 }
    ]
  },
  "netease-cloud-music": {
    sourceUrl:
      "https" + "://" + "apps.apple.com/cn/app/id590338362",
    plans: [
      { planName: "Black Vinyl VIP", monthlyPriceMinor: 1500 },
      { planName: "Black Vinyl SVIP", monthlyPriceMinor: 2800 }
    ]
  },
  "kugou-music": {
    sourceUrl:
      "https" + "://" + "apps.apple.com/cn/app/id472208016",
    plans: [
      { planName: "Luxury VIP", monthlyPriceMinor: 1500 },
      { planName: "Super VIP", monthlyPriceMinor: 3000 }
    ]
  },
  "baidu-netdisk": {
    sourceUrl:
      "https" + "://" + "apps.apple.com/cn/app/id547166701",
    plans: [
      { planName: "Member", monthlyPriceMinor: 1900 },
      { planName: "Super Member", monthlyPriceMinor: 2500 }
    ]
  },
  wps: {
    sourceUrl:
      "https" + "://" + "apps.apple.com/cn/app/id599852710",
    plans: [
      { planName: "WPS Member", monthlyPriceMinor: 900 },
      { planName: "WPS Super Member", monthlyPriceMinor: 2100 }
    ]
  }
};

function chinaStoreEstimatedAdapter(
  serviceSlug: string
) {
  return async (
    ctx: AdapterContext
  ): Promise<AdapterPrice[]> => {
    if (
      ctx.countryCode !== "CN" ||
      ctx.currency !== "CNY"
    ) {
      return [];
    }

    const entry =
      chinaStoreEstimatedCatalog[serviceSlug];

    if (!entry) {
      return [];
    }

    const items = entry.plans.flatMap((plan) =>
      exactForRoute(
        serviceSlug,
        plan.planName,
        ctx.countryCode,
        ctx.currency,
        plan.monthlyPriceMinor / 100,
        entry.sourceUrl,
        "direct"
      )
    );

    return resolvePriceCandidates(
      ctx,
      officialStoreCandidates(items)
    );
  };
}


type RegionalStoreEstimatedPlan = {
  planName: string;
  monthlyPriceMinor: number;
};

type RegionalStoreEstimatedMarket = {
  currency: string;
  sourceUrl: string;
  plans: RegionalStoreEstimatedPlan[];
};

const regionalStoreEstimatedCatalog: Record<
  string,
  Record<string, RegionalStoreEstimatedMarket>
> = {
  crunchyroll: {
    US: {
      currency: "USD",
      sourceUrl:
        "https" + "://" + "apps.apple.com/us/app/id329913454",
      plans: [
        { planName: "Fan", monthlyPriceMinor: 999 },
        { planName: "Mega Fan", monthlyPriceMinor: 1399 },
        { planName: "Ultimate Fan", monthlyPriceMinor: 1799 }
      ]
    },
    NO: {
      currency: "NOK",
      sourceUrl:
        "https" + "://" + "apps.apple.com/no/app/id329913454",
      plans: [
        { planName: "Fan", monthlyPriceMinor: 7900 },
        { planName: "Mega Fan", monthlyPriceMinor: 9900 },
        { planName: "Ultimate Fan", monthlyPriceMinor: 15500 }
      ]
    },
    SE: {
      currency: "SEK",
      sourceUrl:
        "https" + "://" + "apps.apple.com/se/app/id329913454",
      plans: [
        { planName: "Fan", monthlyPriceMinor: 8500 },
        { planName: "Mega Fan", monthlyPriceMinor: 9900 },
        { planName: "Ultimate Fan", monthlyPriceMinor: 16900 }
      ]
    },
    DK: {
      currency: "DKK",
      sourceUrl:
        "https" + "://" + "apps.apple.com/dk/app/id329913454",
      plans: [
        { planName: "Fan", monthlyPriceMinor: 6500 },
        { planName: "Mega Fan", monthlyPriceMinor: 7900 },
        { planName: "Ultimate Fan", monthlyPriceMinor: 11500 }
      ]
    },
    DE: {
      currency: "EUR",
      sourceUrl:
        "https" + "://" + "apps.apple.com/de/app/id329913454",
      plans: [
        { planName: "Premium Monthly", monthlyPriceMinor: 899 },
        { planName: "Mega Fan", monthlyPriceMinor: 1199 },
        { planName: "Ultimate Fan", monthlyPriceMinor: 1499 }
      ]
    },
    FR: {
      currency: "EUR",
      sourceUrl:
        "https" + "://" + "apps.apple.com/fr/app/id329913454",
      plans: [
        { planName: "Premium Monthly", monthlyPriceMinor: 699 },
        { planName: "Mega Fan", monthlyPriceMinor: 899 },
        { planName: "Ultimate Fan", monthlyPriceMinor: 1499 }
      ]
    },
    IE: {
      currency: "EUR",
      sourceUrl:
        "https" + "://" + "apps.apple.com/ie/app/id329913454",
      plans: [
        { planName: "Fan", monthlyPriceMinor: 599 },
        { planName: "Mega Fan", monthlyPriceMinor: 799 },
        { planName: "Ultimate Fan", monthlyPriceMinor: 1499 }
      ]
    }
  ,
    ES: {
      currency: "EUR",
      sourceUrl:
        "https" + "://" + "www.crunchyroll.com/es/premium",
      plans: [
        { planName: "Fan", monthlyPriceMinor: 599 },
        { planName: "Mega Fan", monthlyPriceMinor: 749 }
      ]
    }
,
    IT: {
      currency: "EUR",
      sourceUrl:
        "https" + "://" +
        "apps.apple.com/it/app/crunchyroll/id329913454",
      plans: [
        {
          planName: "Fan",
          monthlyPriceMinor: 599
        },
        {
          planName: "Mega Fan",
          monthlyPriceMinor: 749
        },
        {
          planName: "Ultimate Fan",
          monthlyPriceMinor: 1499
        }
      ]
    }
,
    AT: {
      currency: "EUR",
      sourceUrl:
        "https" + "://" +
        "apps.apple.com/at/app/crunchyroll/id329913454",
      plans: [
        {
          planName: "Fan",
          monthlyPriceMinor: 899
        },
        {
          planName: "Mega Fan",
          monthlyPriceMinor: 1199
        },
        {
          planName: "Ultimate Fan",
          monthlyPriceMinor: 1499
        }
      ]
    }
,
    FI: {
      currency: "EUR",
      sourceUrl:
        "https" + "://" +
        "apps.apple.com/fi/app/crunchyroll/id329913454",
      plans: [
        {
          planName: "Fan",
          monthlyPriceMinor: 699
        },
        {
          planName: "Mega Fan",
          monthlyPriceMinor: 999
        },
        {
          planName: "Ultimate Fan",
          monthlyPriceMinor: 1499
        }
      ]
    }
,
    NL: {
      currency: "EUR",
      sourceUrl:
        "https" + "://" +
        "apps.apple.com/nl/app/crunchyroll/id329913454",
      plans: [
        {
          planName: "Fan",
          monthlyPriceMinor: 799
        },
        {
          planName: "Mega Fan",
          monthlyPriceMinor: 1099
        },
        {
          planName: "Ultimate Fan",
          monthlyPriceMinor: 1499
        }
      ]
    }
,
    BE: {
      currency: "EUR",
      sourceUrl:
        "https" + "://" +
        "apps.apple.com/be/app/crunchyroll/id329913454",
      plans: [
        {
          planName: "Fan",
          monthlyPriceMinor: 799
        },
        {
          planName: "Mega Fan",
          monthlyPriceMinor: 999
        },
        {
          planName: "Ultimate Fan",
          monthlyPriceMinor: 1499
        }
      ]
    }
,
    PT: {
      currency: "EUR",
      sourceUrl:
        "https" + "://" +
        "apps.apple.com/pt/app/crunchyroll/id329913454",
      plans: [
        {
          planName: "Fan",
          monthlyPriceMinor: 799
        },
        {
          planName: "Mega Fan",
          monthlyPriceMinor: 999
        },
        {
          planName: "Ultimate Fan",
          monthlyPriceMinor: 1499
        }
      ]
    }
},

  tidal: {
    NO: {
      currency: "NOK",
      sourceUrl:
        "https" + "://" + "apps.apple.com/no/app/id913943275",
      plans: [
        { planName: "Individual", monthlyPriceMinor: 17500 },
        { planName: "Family", monthlyPriceMinor: 29900 }
      ]
    },
    SE: {
      currency: "SEK",
      sourceUrl:
        "https" + "://" + "apps.apple.com/se/app/id913943275",
      plans: [
        { planName: "Individual", monthlyPriceMinor: 16500 },
        { planName: "Family", monthlyPriceMinor: 30500 }
      ]
    },
    DK: {
      currency: "DKK",
      sourceUrl:
        "https" + "://" + "apps.apple.com/dk/app/id913943275",
      plans: [
        { planName: "Individual", monthlyPriceMinor: 15500 },
        { planName: "Family", monthlyPriceMinor: 27000 }
      ]
    },
    DE: {
      currency: "EUR",
      sourceUrl:
        "https" + "://" + "apps.apple.com/de/app/id913943275",
      plans: [
        { planName: "Individual", monthlyPriceMinor: 1699 },
        { planName: "Family", monthlyPriceMinor: 2999 }
      ]
    },
    ES: {
      currency: "EUR",
      sourceUrl:
        "https" + "://" + "apps.apple.com/es/app/id913943275",
      plans: [
        { planName: "Individual", monthlyPriceMinor: 1549 },
        { planName: "Family", monthlyPriceMinor: 2799 }
      ]
    },
    IT: {
      currency: "EUR",
      sourceUrl:
        "https" + "://" + "apps.apple.com/it/app/id913943275",
      plans: [
        { planName: "Individual", monthlyPriceMinor: 1549 },
        { planName: "Family", monthlyPriceMinor: 2799 }
      ]
    },
    NL: {
      currency: "EUR",
      sourceUrl:
        "https" + "://" + "apps.apple.com/nl/app/id913943275",
      plans: [
        { planName: "Individual", monthlyPriceMinor: 1699 },
        { planName: "Family", monthlyPriceMinor: 2999 }
      ]
    },
    IE: {
      currency: "EUR",
      sourceUrl:
        "https" + "://" + "apps.apple.com/ie/app/id913943275",
      plans: [
        { planName: "Individual", monthlyPriceMinor: 1699 },
        { planName: "Family", monthlyPriceMinor: 2999 }
      ]
    },
    FI: {
      currency: "EUR",
      sourceUrl:
        "https" + "://" + "apps.apple.com/fi/app/id913943275",
      plans: [
        { planName: "Individual", monthlyPriceMinor: 1699 },
        { planName: "Family", monthlyPriceMinor: 2999 }
      ]
    }
  ,
    US: {
      currency: "USD",
      sourceUrl:
        "https" + "://" + "tidal.com/plans/family",
      plans: [
        { planName: "Individual", monthlyPriceMinor: 1199 },
        { planName: "Family", monthlyPriceMinor: 1999 }
      ]
    }
,
    FR: {
      currency: "EUR",
      sourceUrl:
        "https" + "://" +
        "apps.apple.com/fr/app/tidal-music-un-son-hifi/id913943275",
      plans: [
        {
          planName: "Individual",
          monthlyPriceMinor: 1549
        },
        {
          planName: "Family",
          monthlyPriceMinor: 2899
        }
      ]
    }
,
    PT: {
      currency: "EUR",
      sourceUrl:
        "https" + "://" +
        "apps.apple.com/pt/app/tidal-music-hifi-som/id913943275",
      plans: [
        {
          planName: "Individual",
          monthlyPriceMinor: 1149
        },
        {
          planName: "Family",
          monthlyPriceMinor: 2349
        }
      ]
    }
,
    BE: {
      currency: "EUR",
      sourceUrl:
        "https" + "://" +
        "apps.apple.com/be/app/tidal-music-hifi-sound/id913943275",
      plans: [
        {
          planName: "Individual",
          monthlyPriceMinor: 1699
        },
        {
          planName: "Family",
          monthlyPriceMinor: 2999
        }
      ]
    }
,
    AT: {
      currency: "EUR",
      sourceUrl:
        "https" + "://" +
        "apps.apple.com/at/app/tidal-music-hifi-sound/id913943275",
      plans: [
        {
          planName: "Individual",
          monthlyPriceMinor: 1699
        },
        {
          planName: "Family",
          monthlyPriceMinor: 2999
        }
      ]
    }
},
  "xbox-game-pass": {
    NO: {
      currency: "NOK",
      sourceUrl:
        "https" +
        "://" +
        "www.xbox.com/nb-no/games/store/xbox-game-pass-ultimate/cfq7ttc0khs0",
      plans: [
        { planName: "Ultimate", monthlyPriceMinor: 20900 },
        { planName: "Premium", monthlyPriceMinor: 14900 },
        { planName: "Essential", monthlyPriceMinor: 10500 },
        { planName: "PC Game Pass", monthlyPriceMinor: 13900 }
      ]
    },
    SE: {
      currency: "SEK",
      sourceUrl:
        "https" +
        "://" +
        "www.xbox.com/sv-se/games/store/xbox-game-pass-essential/cfq7ttc0k5dj/000c",
      plans: [
        { planName: "Ultimate", monthlyPriceMinor: 21500 },
        { planName: "Premium", monthlyPriceMinor: 14500 },
        { planName: "Essential", monthlyPriceMinor: 9500 },
        { planName: "PC Game Pass", monthlyPriceMinor: 13500 }
      ]
    },
    DK: {
      currency: "DKK",
      sourceUrl:
        "https" +
        "://" +
        "www.xbox.com/da-dk/games/store/xbox-game-pass-ultimate/cfq7ttc0khs0",
      plans: [
        { planName: "Ultimate", monthlyPriceMinor: 14900 },
        { planName: "Premium", monthlyPriceMinor: 9900 },
        { planName: "Essential", monthlyPriceMinor: 6500 },
        { planName: "PC Game Pass", monthlyPriceMinor: 8900 }
      ]
    },
    IE: {
      currency: "EUR",
      sourceUrl:
        "https" +
        "://" +
        "www.xbox.com/en-ie/games/store/xbox-game-pass-ultimate/cfq7ttc0khs0",
      plans: [
        { planName: "Ultimate", monthlyPriceMinor: 2099 },
        { planName: "Premium", monthlyPriceMinor: 1299 },
        { planName: "Essential", monthlyPriceMinor: 899 },
        { planName: "PC Game Pass", monthlyPriceMinor: 1299 }
      ]
    }
  ,
    DE: {
      currency: "EUR",
      sourceUrl:
        "https" + "://" +
        "www.xbox.com/de-DE/games/store/game-pass-essential/CFQ7TTC0K5DJ",
      plans: [
        {
          planName: "Ultimate",
          monthlyPriceMinor: 2099
        },
        {
          planName: "Premium",
          monthlyPriceMinor: 1299
        },
        {
          planName: "Essential",
          monthlyPriceMinor: 899
        },
        {
          planName: "PC Game Pass",
          monthlyPriceMinor: 1299
        }
      ]
    }
,
    ES: {
      currency: "EUR",
      sourceUrl:
        "https" + "://" +
        "www.xbox.com/es-ES/games/store/game-pass-essential/CFQ7TTC0K5DJ",
      plans: [
        {
          planName: "Ultimate",
          monthlyPriceMinor: 2099
        },
        {
          planName: "Premium",
          monthlyPriceMinor: 1299
        },
        {
          planName: "Essential",
          monthlyPriceMinor: 899
        },
        {
          planName: "PC Game Pass",
          monthlyPriceMinor: 1299
        }
      ]
    }
,
    FR: {
      currency: "EUR",
      sourceUrl:
        "https" + "://" +
        "www.xbox.com/fr-FR/games/store/game-pass-essential/CFQ7TTC0K5DJ",
      plans: [
        {
          planName: "Ultimate",
          monthlyPriceMinor: 2099
        },
        {
          planName: "Premium",
          monthlyPriceMinor: 1299
        },
        {
          planName: "Essential",
          monthlyPriceMinor: 899
        },
        {
          planName: "PC Game Pass",
          monthlyPriceMinor: 1299
        }
      ]
    }
,
    IT: {
      currency: "EUR",
      sourceUrl:
        "https" + "://" +
        "www.xbox.com/it-IT/games/store/game-pass-core/CFQ7TTC0K5DJ/000C",
      plans: [
        {
          planName: "Ultimate",
          monthlyPriceMinor: 2099
        },
        {
          planName: "Premium",
          monthlyPriceMinor: 1299
        },
        {
          planName: "Essential",
          monthlyPriceMinor: 899
        },
        {
          planName: "PC Game Pass",
          monthlyPriceMinor: 1299
        }
      ]
    }
,
    PT: {
      currency: "EUR",
      sourceUrl:
        "https" + "://" +
        "www.xbox.com/pt-PT/games/store/xbox-game-pass-essential/CFQ7TTC0K5DJ",
      plans: [
        {
          planName: "Ultimate",
          monthlyPriceMinor: 2099
        },
        {
          planName: "Premium",
          monthlyPriceMinor: 1299
        },
        {
          planName: "Essential",
          monthlyPriceMinor: 899
        },
        {
          planName: "PC Game Pass",
          monthlyPriceMinor: 1299
        }
      ]
    }
,
    NL: {
      currency: "EUR",
      sourceUrl:
        "https" + "://" +
        "www.xbox.com/nl-NL/games/store/xbox-game-pass-core/CFQ7TTC0K5DJ/000C",
      plans: [
        {
          planName: "Ultimate",
          monthlyPriceMinor: 2099
        },
        {
          planName: "Premium",
          monthlyPriceMinor: 1299
        },
        {
          planName: "Essential",
          monthlyPriceMinor: 899
        },
        {
          planName: "PC Game Pass",
          monthlyPriceMinor: 1299
        }
      ]
    }
,
    AT: {
      currency: "EUR",
      sourceUrl:
        "https" + "://" +
        "www.xbox.com/de-AT/games/store/game-pass-core/CFQ7TTC0K5DJ",
      plans: [
        {
          planName: "Ultimate",
          monthlyPriceMinor: 2099
        },
        {
          planName: "Premium",
          monthlyPriceMinor: 1299
        },
        {
          planName: "Essential",
          monthlyPriceMinor: 899
        },
        {
          planName: "PC Game Pass",
          monthlyPriceMinor: 1299
        }
      ]
    }
,
    FI: {
      currency: "EUR",
      sourceUrl:
        "https" + "://" +
        "www.xbox.com/fi-FI/games/store/game-pass/CFQ7TTC0KGQ8",
      plans: [
        {
          planName: "Ultimate",
          monthlyPriceMinor: 2099
        },
        {
          planName: "Premium",
          monthlyPriceMinor: 1299
        },
        {
          planName: "Essential",
          monthlyPriceMinor: 899
        },
        {
          planName: "PC Game Pass",
          monthlyPriceMinor: 1299
        }
      ]
    }
,
    US: {
      currency: "USD",
      sourceUrl:
        "https" + "://" +
        "www.xbox.com/en-us/games/store/game-pass-ultimate/CFQ7TTC0KHS0",
      plans: [
        {
          planName: "Ultimate",
          monthlyPriceMinor: 2299
        },
        {
          planName: "Premium",
          monthlyPriceMinor: 1499
        },
        {
          planName: "Essential",
          monthlyPriceMinor: 999
        },
        {
          planName: "PC Game Pass",
          monthlyPriceMinor: 1399
        }
      ]
    }
,
    BE: {
      currency: "EUR",
      sourceUrl:
        "https" + "://" +
        "www.xbox.com/nl-be/games/store/xbox-game-pass-core/CFQ7TTC0K5DJ/000C",
      plans: [
        {
          planName: "Ultimate",
          monthlyPriceMinor: 2099
        },
        {
          planName: "Premium",
          monthlyPriceMinor: 1299
        },
        {
          planName: "Essential",
          monthlyPriceMinor: 899
        },
        {
          planName: "PC Game Pass",
          monthlyPriceMinor: 1299
        }
      ]
    }
},

  "geforce-now": {
    US: {
      currency: "USD",
      sourceUrl:
        "https" +
        "://" +
        "marketplace.nvidia.com/en-us/consumer/gfn/",
      plans: [
        { planName: "Performance", monthlyPriceMinor: 999 },
        { planName: "Ultimate", monthlyPriceMinor: 1999 }
      ]
    }
  }
,
  "ea-play": {
    US: {
      currency: "USD",
      sourceUrl:
        "https" + "://" + "www.ea.com/ea-play",
      plans: [
        { planName: "EA Play", monthlyPriceMinor: 599 },
        { planName: "EA Play Pro", monthlyPriceMinor: 1699 }
      ]
    },
    NO: {
      currency: "NOK",
      sourceUrl:
        "https" + "://" + "www.ea.com/nb-no/ea-play",
      plans: [
        { planName: "EA Play", monthlyPriceMinor: 5900 },
        { planName: "EA Play Pro", monthlyPriceMinor: 18300 }
      ]
    },
    SE: {
      currency: "SEK",
      sourceUrl:
        "https" + "://" + "www.ea.com/sv-se/ea-play",
      plans: [
        { planName: "EA Play", monthlyPriceMinor: 5900 },
        { planName: "EA Play Pro", monthlyPriceMinor: 20500 }
      ]
    },
    DK: {
      currency: "DKK",
      sourceUrl:
        "https" + "://" + "www.ea.com/da-dk/ea-play",
      plans: [
        { planName: "EA Play", monthlyPriceMinor: 4900 },
        { planName: "EA Play Pro", monthlyPriceMinor: 13500 }
      ]
    }
  ,
    DE: {
      currency: "EUR",
      sourceUrl:
        "https" + "://" +
        "www.ea.com/de-de/ea-play",
      plans: [
        {
          planName: "EA Play",
          monthlyPriceMinor: 599
        },
        {
          planName: "EA Play Pro",
          monthlyPriceMinor: 1699
        }
      ]
    }
,
    ES: {
      currency: "EUR",
      sourceUrl:
        "https" + "://" +
        "www.ea.com/es-es/ea-play",
      plans: [
        {
          planName: "EA Play",
          monthlyPriceMinor: 599
        },
        {
          planName: "EA Play Pro",
          monthlyPriceMinor: 1699
        }
      ]
    }
,
    FR: {
      currency: "EUR",
      sourceUrl:
        "https" + "://" +
        "www.ea.com/fr-fr/ea-play",
      plans: [
        {
          planName: "EA Play",
          monthlyPriceMinor: 599
        },
        {
          planName: "EA Play Pro",
          monthlyPriceMinor: 1699
        }
      ]
    }
,
    IT: {
      currency: "EUR",
      sourceUrl:
        "https" + "://" +
        "www.ea.com/it-it/games/the-sims/ea-play",
      plans: [
        {
          planName: "EA Play",
          monthlyPriceMinor: 599
        },
        {
          planName: "EA Play Pro",
          monthlyPriceMinor: 1699
        }
      ]
    }
,
    FI: {
      currency: "EUR",
      sourceUrl:
        "https" + "://" +
        "www.ea.com/fi-fi/ea-play",
      plans: [
        {
          planName: "EA Play",
          monthlyPriceMinor: 599
        },
        {
          planName: "EA Play Pro",
          monthlyPriceMinor: 1699
        }
      ]
    }
,
    NL: {
      currency: "EUR",
      sourceUrl:
        "https" + "://" +
        "www.ea.com/nl-nl/ea-play",
      plans: [
        {
          planName: "EA Play",
          monthlyPriceMinor: 599
        },
        {
          planName: "EA Play Pro",
          monthlyPriceMinor: 1699
        }
      ]
    }
},

  "ubisoft-plus": {
    US: {
      currency: "USD",
      sourceUrl:
        "https" + "://" + "store.ubisoft.com/us/select-plan",
      plans: [
        { planName: "Classics", monthlyPriceMinor: 799 },
        { planName: "Premium", monthlyPriceMinor: 1799 }
      ]
    },
    DE: {
      currency: "EUR",
      sourceUrl:
        "https" + "://" + "store.ubisoft.com/eu/select-plan",
      plans: [
        { planName: "Classics", monthlyPriceMinor: 799 },
        { planName: "Premium", monthlyPriceMinor: 1799 }
      ]
    },
    ES: {
      currency: "EUR",
      sourceUrl:
        "https" + "://" + "store.ubisoft.com/eu/select-plan",
      plans: [
        { planName: "Classics", monthlyPriceMinor: 799 },
        { planName: "Premium", monthlyPriceMinor: 1799 }
      ]
    },
    FR: {
      currency: "EUR",
      sourceUrl:
        "https" + "://" + "store.ubisoft.com/eu/select-plan",
      plans: [
        { planName: "Classics", monthlyPriceMinor: 799 },
        { planName: "Premium", monthlyPriceMinor: 1799 }
      ]
    },
    IT: {
      currency: "EUR",
      sourceUrl:
        "https" + "://" + "store.ubisoft.com/eu/select-plan",
      plans: [
        { planName: "Classics", monthlyPriceMinor: 799 },
        { planName: "Premium", monthlyPriceMinor: 1799 }
      ]
    },
    PT: {
      currency: "EUR",
      sourceUrl:
        "https" + "://" + "store.ubisoft.com/eu/select-plan",
      plans: [
        { planName: "Classics", monthlyPriceMinor: 799 },
        { planName: "Premium", monthlyPriceMinor: 1799 }
      ]
    },
    NL: {
      currency: "EUR",
      sourceUrl:
        "https" + "://" + "store.ubisoft.com/eu/select-plan",
      plans: [
        { planName: "Classics", monthlyPriceMinor: 799 },
        { planName: "Premium", monthlyPriceMinor: 1799 }
      ]
    },
    BE: {
      currency: "EUR",
      sourceUrl:
        "https" + "://" + "store.ubisoft.com/eu/select-plan",
      plans: [
        { planName: "Classics", monthlyPriceMinor: 799 },
        { planName: "Premium", monthlyPriceMinor: 1799 }
      ]
    },
    AT: {
      currency: "EUR",
      sourceUrl:
        "https" + "://" + "store.ubisoft.com/eu/select-plan",
      plans: [
        { planName: "Classics", monthlyPriceMinor: 799 },
        { planName: "Premium", monthlyPriceMinor: 1799 }
      ]
    },
    IE: {
      currency: "EUR",
      sourceUrl:
        "https" + "://" + "store.ubisoft.com/eu/select-plan",
      plans: [
        { planName: "Classics", monthlyPriceMinor: 799 },
        { planName: "Premium", monthlyPriceMinor: 1799 }
      ]
    },
    FI: {
      currency: "EUR",
      sourceUrl:
        "https" + "://" + "store.ubisoft.com/eu/select-plan",
      plans: [
        { planName: "Classics", monthlyPriceMinor: 799 },
        { planName: "Premium", monthlyPriceMinor: 1799 }
      ]
    }
  }
,
  "amazon-music-unlimited": {
    US: {
      currency: "USD",
      sourceUrl:
        "https" +
        "://" +
        "apps.apple.com/us/app/id510855668",
      plans: [
        { planName: "Individual", monthlyPriceMinor: 1399 },
        { planName: "Family", monthlyPriceMinor: 2499 }
      ]
    },
    DE: {
      currency: "EUR",
      sourceUrl:
        "https" +
        "://" +
        "apps.apple.com/de/app/id510855668",
      plans: [
        { planName: "Individual", monthlyPriceMinor: 1399 },
        { planName: "Family", monthlyPriceMinor: 2499 }
      ]
    },
    FR: {
      currency: "EUR",
      sourceUrl:
        "https" +
        "://" +
        "apps.apple.com/fr/app/id510855668",
      plans: [
        { planName: "Individual", monthlyPriceMinor: 1299 },
        { planName: "Family", monthlyPriceMinor: 2299 }
      ]
    },
    AT: {
      currency: "EUR",
      sourceUrl:
        "https" +
        "://" +
        "apps.apple.com/at/app/id510855668",
      plans: [
        { planName: "Individual", monthlyPriceMinor: 1099 },
        { planName: "Family", monthlyPriceMinor: 1999 }
      ]
    }
  ,
    IT: {
      currency: "EUR",
      sourceUrl:
        "https" + "://" +
        "apps.apple.com/it/app/amazon-music-musica-e-podcast/id510855668",
      plans: [
        {
          planName: "Individual",
          monthlyPriceMinor: 1399
        },
        {
          planName: "Family",
          monthlyPriceMinor: 2499
        }
      ]
    }
,
    ES: {
      currency: "EUR",
      sourceUrl:
        "https" + "://" +
        "apps.apple.com/es/app/amazon-music/id510855668",
      plans: [
        {
          planName: "Individual",
          monthlyPriceMinor: 1399
        },
        {
          planName: "Family",
          monthlyPriceMinor: 2499
        }
      ]
    }
}
,
  "chatgpt": {
    US: {
      currency: "USD",
      sourceUrl: "https" + "://" + "apps.apple.com/us/app/id6448311069",
      plans: [
        { planName: "ChatGPT Plus", monthlyPriceMinor: 1999 }
      ]
    },
    NO: {
      currency: "NOK",
      sourceUrl: "https" + "://" + "apps.apple.com/no/app/id6448311069",
      plans: [
        { planName: "ChatGPT Plus", monthlyPriceMinor: 24900 }
      ]
    },
    SE: {
      currency: "SEK",
      sourceUrl: "https" + "://" + "apps.apple.com/se/app/id6448311069",
      plans: [
        { planName: "ChatGPT Plus", monthlyPriceMinor: 24900 }
      ]
    },
    DK: {
      currency: "DKK",
      sourceUrl: "https" + "://" + "apps.apple.com/dk/app/id6448311069",
      plans: [
        { planName: "ChatGPT Plus", monthlyPriceMinor: 17900 }
      ]
    },
    DE: {
      currency: "EUR",
      sourceUrl: "https" + "://" + "apps.apple.com/de/app/id6448311069",
      plans: [
        { planName: "ChatGPT Plus", monthlyPriceMinor: 2299 }
      ]
    },
    FR: {
      currency: "EUR",
      sourceUrl: "https" + "://" + "apps.apple.com/fr/app/id6448311069",
      plans: [
        { planName: "ChatGPT Plus", monthlyPriceMinor: 2299 }
      ]
    },
    IE: {
      currency: "EUR",
      sourceUrl: "https" + "://" + "apps.apple.com/ie/app/id6448311069",
      plans: [
        { planName: "ChatGPT Plus", monthlyPriceMinor: 2299 }
      ]
    },
    FI: {
      currency: "EUR",
      sourceUrl: "https" + "://" + "apps.apple.com/fi/app/id6448311069",
      plans: [
        { planName: "ChatGPT Plus", monthlyPriceMinor: 2299 }
      ]
    }
  ,
    ES: {
      currency: "EUR",
      sourceUrl:
        "https" + "://" +
        "apps.apple.com/es/app/chatgpt/id6448311069",
      plans: [
        {
          planName: "Plus",
          monthlyPriceMinor: 2299
        }
      ]
    }
,
    IT: {
      currency: "EUR",
      sourceUrl:
        "https" + "://" +
        "apps.apple.com/it/app/chatgpt/id6448311069",
      plans: [
        {
          planName: "Plus",
          monthlyPriceMinor: 2299
        }
      ]
    }
,
    PT: {
      currency: "EUR",
      sourceUrl:
        "https" + "://" +
        "apps.apple.com/pt/app/chatgpt/id6448311069",
      plans: [
        {
          planName: "Plus",
          monthlyPriceMinor: 2299
        }
      ]
    }
,
    NL: {
      currency: "EUR",
      sourceUrl:
        "https" + "://" +
        "apps.apple.com/nl/app/chatgpt/id6448311069",
      plans: [
        {
          planName: "Plus",
          monthlyPriceMinor: 2299
        }
      ]
    }
,
    BE: {
      currency: "EUR",
      sourceUrl:
        "https" + "://" +
        "apps.apple.com/be/app/chatgpt/id6448311069",
      plans: [
        {
          planName: "Plus",
          monthlyPriceMinor: 2299
        }
      ]
    }
,
    AT: {
      currency: "EUR",
      sourceUrl:
        "https" + "://" +
        "apps.apple.com/at/app/chatgpt/id6448311069",
      plans: [
        {
          planName: "Plus",
          monthlyPriceMinor: 2299
        }
      ]
    }
},

  "claude": {
    US: {
      currency: "USD",
      sourceUrl: "https" + "://" + "apps.apple.com/us/app/id6473753684",
      plans: [
        { planName: "Claude Pro", monthlyPriceMinor: 2000 },
        { planName: "Claude Max 5x", monthlyPriceMinor: 12499 },
        { planName: "Claude Max 20x", monthlyPriceMinor: 24999 }
      ]
    },
    NO: {
      currency: "NOK",
      sourceUrl: "https" + "://" + "apps.apple.com/no/app/id6473753684",
      plans: [
        { planName: "Claude Pro", monthlyPriceMinor: 24900 },
        { planName: "Claude Max 5x", monthlyPriceMinor: 149000 },
        { planName: "Claude Max 20x", monthlyPriceMinor: 299000 }
      ]
    },
    SE: {
      currency: "SEK",
      sourceUrl: "https" + "://" + "apps.apple.com/se/app/id6473753684",
      plans: [
        { planName: "Claude Pro", monthlyPriceMinor: 24900 },
        { planName: "Claude Max 5x", monthlyPriceMinor: 149500 },
        { planName: "Claude Max 20x", monthlyPriceMinor: 299500 }
      ]
    },
    DK: {
      currency: "DKK",
      sourceUrl: "https" + "://" + "apps.apple.com/dk/app/id6473753684",
      plans: [
        { planName: "Claude Pro", monthlyPriceMinor: 17900 },
        { planName: "Claude Max 5x", monthlyPriceMinor: 99900 },
        { planName: "Claude Max 20x", monthlyPriceMinor: 199900 }
      ]
    },
    DE: {
      currency: "EUR",
      sourceUrl: "https" + "://" + "apps.apple.com/de/app/id6473753684",
      plans: [
        { planName: "Claude Pro", monthlyPriceMinor: 2200 },
        { planName: "Claude Max 5x", monthlyPriceMinor: 14999 },
        { planName: "Claude Max 20x", monthlyPriceMinor: 29999 }
      ]
    },
    FR: {
      currency: "EUR",
      sourceUrl: "https" + "://" + "apps.apple.com/fr/app/id6473753684",
      plans: [
        { planName: "Claude Pro", monthlyPriceMinor: 2200 },
        { planName: "Claude Max 5x", monthlyPriceMinor: 14999 },
        { planName: "Claude Max 20x", monthlyPriceMinor: 29999 }
      ]
    },
    IE: {
      currency: "EUR",
      sourceUrl: "https" + "://" + "apps.apple.com/ie/app/id6473753684",
      plans: [
        { planName: "Claude Pro", monthlyPriceMinor: 2200 },
        { planName: "Claude Max 5x", monthlyPriceMinor: 14999 },
        { planName: "Claude Max 20x", monthlyPriceMinor: 29999 }
      ]
    },
    FI: {
      currency: "EUR",
      sourceUrl: "https" + "://" + "apps.apple.com/fi/app/id6473753684",
      plans: [
        { planName: "Claude Pro", monthlyPriceMinor: 2200 },
        { planName: "Claude Max 5x", monthlyPriceMinor: 14999 },
        { planName: "Claude Max 20x", monthlyPriceMinor: 29999 }
      ]
    }
  ,
    ES: {
      currency: "EUR",
      sourceUrl:
        "https" + "://" +
        "apps.apple.com/es/app/claude-by-anthropic/id6473753684",
      plans: [
        {
          planName: "Pro",
          monthlyPriceMinor: 2200
        },
        {
          planName: "Max 5x",
          monthlyPriceMinor: 14999
        },
        {
          planName: "Max 20x",
          monthlyPriceMinor: 29999
        }
      ]
    }
,
    IT: {
      currency: "EUR",
      sourceUrl:
        "https" + "://" +
        "apps.apple.com/it/app/claude-by-anthropic/id6473753684",
      plans: [
        {
          planName: "Pro",
          monthlyPriceMinor: 2200
        },
        {
          planName: "Max 5x",
          monthlyPriceMinor: 14999
        },
        {
          planName: "Max 20x",
          monthlyPriceMinor: 29999
        }
      ]
    }
,
    PT: {
      currency: "EUR",
      sourceUrl:
        "https" + "://" +
        "apps.apple.com/pt/app/claude-by-anthropic/id6473753684",
      plans: [
        {
          planName: "Pro",
          monthlyPriceMinor: 2200
        },
        {
          planName: "Max 5x",
          monthlyPriceMinor: 14999
        },
        {
          planName: "Max 20x",
          monthlyPriceMinor: 29999
        }
      ]
    }
,
    NL: {
      currency: "EUR",
      sourceUrl:
        "https" + "://" +
        "apps.apple.com/nl/app/claude-by-anthropic/id6473753684",
      plans: [
        {
          planName: "Pro",
          monthlyPriceMinor: 2200
        },
        {
          planName: "Max 5x",
          monthlyPriceMinor: 14999
        },
        {
          planName: "Max 20x",
          monthlyPriceMinor: 29999
        }
      ]
    }
,
    BE: {
      currency: "EUR",
      sourceUrl:
        "https" + "://" +
        "apps.apple.com/be/app/claude-by-anthropic/id6473753684",
      plans: [
        {
          planName: "Pro",
          monthlyPriceMinor: 2200
        },
        {
          planName: "Max 5x",
          monthlyPriceMinor: 14999
        },
        {
          planName: "Max 20x",
          monthlyPriceMinor: 29999
        }
      ]
    }
,
    AT: {
      currency: "EUR",
      sourceUrl:
        "https" + "://" +
        "apps.apple.com/at/app/claude-by-anthropic/id6473753684",
      plans: [
        {
          planName: "Pro",
          monthlyPriceMinor: 2200
        },
        {
          planName: "Max 5x",
          monthlyPriceMinor: 14999
        },
        {
          planName: "Max 20x",
          monthlyPriceMinor: 29999
        }
      ]
    }
}
,
  "dropbox": {
    US: {
      currency: "USD",
      sourceUrl:
        "https" +
        "://" +
        "apps.apple.com/us/app/id327630330",
      plans: [
        { planName: "Plus", monthlyPriceMinor: 1199 },
        { planName: "Professional", monthlyPriceMinor: 1999 },
        { planName: "Simple", monthlyPriceMinor: 699 },
        { planName: "Family", monthlyPriceMinor: 1999 }
      ]
    },
    NO: {
      currency: "NOK",
      sourceUrl:
        "https" +
        "://" +
        "apps.apple.com/no/app/id327630330",
      plans: [
        { planName: "Plus", monthlyPriceMinor: 12900 },
        { planName: "Professional", monthlyPriceMinor: 19900 },
        { planName: "Simple", monthlyPriceMinor: 9900 }
      ]
    }
  ,
    SE: {
      currency: "SEK",
      sourceUrl:
        "https" + "://" +
        "apps.apple.com/se/app/dropbox/id327630330",
      plans: [
        {
          planName: "Plus",
          monthlyPriceMinor: 13900
        },
        {
          planName: "Simple",
          monthlyPriceMinor: 9900
        },
        {
          planName: "Professional",
          monthlyPriceMinor: 20500
        }
      ]
    }
,
    DK: {
      currency: "DKK",
      sourceUrl:
        "https" + "://" +
        "apps.apple.com/dk/app/dropbox/id327630330",
      plans: [
        {
          planName: "Plus",
          monthlyPriceMinor: 9900
        },
        {
          planName: "Simple",
          monthlyPriceMinor: 5900
        },
        {
          planName: "Professional",
          monthlyPriceMinor: 15900
        }
      ]
    }
,
    DE: {
      currency: "EUR",
      sourceUrl:
        "https" + "://" +
        "apps.apple.com/de/app/dropbox/id327630330",
      plans: [
        {
          planName: "Plus",
          monthlyPriceMinor: 1199
        },
        {
          planName: "Simple",
          monthlyPriceMinor: 599
        },
        {
          planName: "Professional",
          monthlyPriceMinor: 1999
        },
        {
          planName: "Family",
          monthlyPriceMinor: 2199
        }
      ]
    }
,
    ES: {
      currency: "EUR",
      sourceUrl:
        "https" + "://" +
        "apps.apple.com/es/app/dropbox/id327630330",
      plans: [
        {
          planName: "Plus",
          monthlyPriceMinor: 1199
        },
        {
          planName: "Professional",
          monthlyPriceMinor: 1999
        }
      ]
    }
,
    FR: {
      currency: "EUR",
      sourceUrl:
        "https" + "://" +
        "apps.apple.com/fr/app/dropbox/id327630330",
      plans: [
        {
          planName: "Plus",
          monthlyPriceMinor: 1199
        },
        {
          planName: "Simple",
          monthlyPriceMinor: 599
        },
        {
          planName: "Professional",
          monthlyPriceMinor: 1999
        },
        {
          planName: "Family",
          monthlyPriceMinor: 2199
        }
      ]
    }
,
    IT: {
      currency: "EUR",
      sourceUrl:
        "https" + "://" +
        "apps.apple.com/it/app/dropbox/id327630330",
      plans: [
        {
          planName: "Plus",
          monthlyPriceMinor: 1199
        },
        {
          planName: "Simple",
          monthlyPriceMinor: 599
        },
        {
          planName: "Professional",
          monthlyPriceMinor: 1999
        }
      ]
    }
,
    PT: {
      currency: "EUR",
      sourceUrl:
        "https" + "://" +
        "apps.apple.com/pt/app/dropbox/id327630330",
      plans: [
        {
          planName: "Plus",
          monthlyPriceMinor: 1199
        },
        {
          planName: "Simple",
          monthlyPriceMinor: 599
        },
        {
          planName: "Professional",
          monthlyPriceMinor: 1999
        }
      ]
    }
,
    NL: {
      currency: "EUR",
      sourceUrl:
        "https" + "://" +
        "apps.apple.com/nl/app/dropbox/id327630330",
      plans: [
        {
          planName: "Plus",
          monthlyPriceMinor: 1199
        },
        {
          planName: "Professional",
          monthlyPriceMinor: 1999
        }
      ]
    }
,
    BE: {
      currency: "EUR",
      sourceUrl:
        "https" + "://" +
        "apps.apple.com/be/app/dropbox/id327630330",
      plans: [
        {
          planName: "Simple",
          monthlyPriceMinor: 599
        },
        {
          planName: "Professional",
          monthlyPriceMinor: 1999
        }
      ]
    }
,
    AT: {
      currency: "EUR",
      sourceUrl:
        "https" + "://" +
        "apps.apple.com/at/app/dropbox/id327630330",
      plans: [
        {
          planName: "Plus",
          monthlyPriceMinor: 1199
        },
        {
          planName: "Simple",
          monthlyPriceMinor: 599
        },
        {
          planName: "Professional",
          monthlyPriceMinor: 1999
        },
        {
          planName: "Family",
          monthlyPriceMinor: 2199
        }
      ]
    }
,
    IE: {
      currency: "EUR",
      sourceUrl:
        "https" + "://" +
        "apps.apple.com/ie/app/dropbox/id327630330",
      plans: [
        {
          planName: "Plus",
          monthlyPriceMinor: 1199
        },
        {
          planName: "Professional",
          monthlyPriceMinor: 1999
        }
      ]
    }
,
    FI: {
      currency: "EUR",
      sourceUrl:
        "https" + "://" +
        "apps.apple.com/fi/app/dropbox/id327630330",
      plans: [
        {
          planName: "Plus",
          monthlyPriceMinor: 1199
        },
        {
          planName: "Simple",
          monthlyPriceMinor: 599
        },
        {
          planName: "Professional",
          monthlyPriceMinor: 1999
        }
      ]
    }
}
,
  "strava": {
    US: {
      currency: "USD",
      sourceUrl:
        "https" +
        "://" +
        "apps.apple.com/us/app/id426826309",
      plans: [
        { planName: "Subscription", monthlyPriceMinor: 1199 }
      ]
    },
    NO: {
      currency: "NOK",
      sourceUrl:
        "https" +
        "://" +
        "apps.apple.com/no/app/id426826309",
      plans: [
        { planName: "Subscription", monthlyPriceMinor: 9900 }
      ]
    },
    SE: {
      currency: "SEK",
      sourceUrl:
        "https" +
        "://" +
        "apps.apple.com/se/app/id426826309",
      plans: [
        { planName: "Subscription", monthlyPriceMinor: 9900 }
      ]
    }
  ,
    DK: {
      currency: "DKK",
      sourceUrl:
        "https" + "://" +
        "apps.apple.com/dk/app/strava-run-bike-hike/id426826309",
      plans: [
        {
          planName: "Subscription",
          monthlyPriceMinor: 6900
        }
      ]
    }
,
    DE: {
      currency: "EUR",
      sourceUrl:
        "https" + "://" +
        "apps.apple.com/de/app/strava/id426826309",
      plans: [
        {
          planName: "Subscription",
          monthlyPriceMinor: 1099
        }
      ]
    }
,
    ES: {
      currency: "EUR",
      sourceUrl:
        "https" + "://" +
        "apps.apple.com/es/app/strava/id426826309",
      plans: [
        {
          planName: "Subscription",
          monthlyPriceMinor: 799
        }
      ]
    }
,
    FR: {
      currency: "EUR",
      sourceUrl:
        "https" + "://" +
        "apps.apple.com/fr/app/strava/id426826309",
      plans: [
        {
          planName: "Subscription",
          monthlyPriceMinor: 999
        }
      ]
    }
,
    IT: {
      currency: "EUR",
      sourceUrl:
        "https" + "://" +
        "apps.apple.com/it/app/strava/id426826309",
      plans: [
        {
          planName: "Subscription",
          monthlyPriceMinor: 999
        }
      ]
    }
,
    PT: {
      currency: "EUR",
      sourceUrl:
        "https" + "://" +
        "apps.apple.com/pt/app/strava/id426826309",
      plans: [
        {
          planName: "Subscription",
          monthlyPriceMinor: 799
        }
      ]
    }
,
    NL: {
      currency: "EUR",
      sourceUrl:
        "https" + "://" +
        "apps.apple.com/nl/app/strava/id426826309",
      plans: [
        {
          planName: "Subscription",
          monthlyPriceMinor: 1099
        }
      ]
    }
,
    BE: {
      currency: "EUR",
      sourceUrl:
        "https" + "://" +
        "apps.apple.com/be/app/strava/id426826309",
      plans: [
        {
          planName: "Subscription",
          monthlyPriceMinor: 1099
        }
      ]
    }
,
    AT: {
      currency: "EUR",
      sourceUrl:
        "https" + "://" +
        "apps.apple.com/at/app/strava/id426826309",
      plans: [
        {
          planName: "Subscription",
          monthlyPriceMinor: 1099
        }
      ]
    }
,
    IE: {
      currency: "EUR",
      sourceUrl:
        "https" + "://" +
        "apps.apple.com/ie/app/strava/id426826309",
      plans: [
        {
          planName: "Subscription",
          monthlyPriceMinor: 999
        }
      ]
    }
,
    FI: {
      currency: "EUR",
      sourceUrl:
        "https" + "://" +
        "apps.apple.com/fi/app/strava/id426826309",
      plans: [
        {
          planName: "Subscription",
          monthlyPriceMinor: 1099
        }
      ]
    }
},

  "headspace": {
    US: {
      currency: "USD",
      sourceUrl:
        "https" +
        "://" +
        "apps.apple.com/us/app/id493145008",
      plans: [
        { planName: "Monthly", monthlyPriceMinor: 1299 }
      ]
    },
    NO: {
      currency: "NOK",
      sourceUrl:
        "https" +
        "://" +
        "apps.apple.com/no/app/id493145008",
      plans: [
        { planName: "Monthly", monthlyPriceMinor: 13900 }
      ]
    },
    SE: {
      currency: "SEK",
      sourceUrl:
        "https" +
        "://" +
        "apps.apple.com/se/app/id493145008",
      plans: [
        { planName: "Monthly", monthlyPriceMinor: 13900 }
      ]
    }
  ,
    DK: {
      currency: "DKK",
      sourceUrl:
        "https" + "://" +
        "apps.apple.com/dk/app/headspace-sleep-meditation/id493145008",
      plans: [
        {
          planName: "Monthly",
          monthlyPriceMinor: 9900
        }
      ]
    }
,
    DE: {
      currency: "EUR",
      sourceUrl:
        "https" + "://" +
        "apps.apple.com/de/app/headspace-meditation-sleep/id493145008",
      plans: [
        {
          planName: "Monthly",
          monthlyPriceMinor: 1299
        }
      ]
    }
,
    FR: {
      currency: "EUR",
      sourceUrl:
        "https" + "://" +
        "apps.apple.com/fr/app/headspace-m%C3%A9ditation-sommeil/id493145008",
      plans: [
        {
          planName: "Monthly",
          monthlyPriceMinor: 1299
        }
      ]
    }
,
    ES: {
      currency: "EUR",
      sourceUrl:
        "https" + "://" +
        "apps.apple.com/es/app/headspace-sue%C3%B1o-y-meditaci%C3%B3n/id493145008",
      plans: [
        {
          planName: "Monthly",
          monthlyPriceMinor: 1299
        }
      ]
    }
,
    IT: {
      currency: "EUR",
      sourceUrl:
        "https" + "://" +
        "apps.apple.com/it/app/headspace-meditazione-sonno/id493145008",
      plans: [
        {
          planName: "Monthly",
          monthlyPriceMinor: 1299
        }
      ]
    }
,
    PT: {
      currency: "EUR",
      sourceUrl:
        "https" + "://" +
        "apps.apple.com/pt/app/headspace-medita%C3%A7%C3%A3o-e-sono/id493145008",
      plans: [
        {
          planName: "Monthly",
          monthlyPriceMinor: 1299
        }
      ]
    }
,
    NL: {
      currency: "EUR",
      sourceUrl:
        "https" + "://" +
        "apps.apple.com/nl/app/headspace-meditatie-slaap/id493145008",
      plans: [
        {
          planName: "Monthly",
          monthlyPriceMinor: 1299
        }
      ]
    }
,
    BE: {
      currency: "EUR",
      sourceUrl:
        "https" + "://" +
        "apps.apple.com/be/app/headspace-meditation-sleep/id493145008",
      plans: [
        {
          planName: "Monthly",
          monthlyPriceMinor: 1299
        }
      ]
    }
,
    AT: {
      currency: "EUR",
      sourceUrl:
        "https" + "://" +
        "apps.apple.com/at/app/headspace-meditation-sleep/id493145008",
      plans: [
        {
          planName: "Monthly",
          monthlyPriceMinor: 1299
        }
      ]
    }
,
    IE: {
      currency: "EUR",
      sourceUrl:
        "https" + "://" +
        "apps.apple.com/ie/app/headspace-meditation-sleep/id493145008",
      plans: [
        {
          planName: "Monthly",
          monthlyPriceMinor: 1299
        }
      ]
    }
,
    FI: {
      currency: "EUR",
      sourceUrl:
        "https" + "://" +
        "apps.apple.com/fi/app/headspace-meditation-sleep/id493145008",
      plans: [
        {
          planName: "Monthly",
          monthlyPriceMinor: 1299
        }
      ]
    }
}
,
  "calm": {
    US: {
      currency: "USD",
      sourceUrl:
        "https" +
        "://" +
        "apps.apple.com/us/app/calm/id571800810",
      plans: [
        { planName: "Monthly", monthlyPriceMinor: 1499 }
      ]
    }
  }
,
  "paramount-plus": {
    US: {
      currency: "USD",
      sourceUrl:
        "https" +
        "://" +
        "www.paramountplus.com/account/signup/pickplan/",
      plans: [
        { planName: "Essential", monthlyPriceMinor: 899 },
        { planName: "Premium", monthlyPriceMinor: 1399 }
      ]
    }
  ,
    DE: {
      currency: "EUR",
      sourceUrl:
        "https" + "://" +
        "apps.apple.com/de/app/paramount/id1340650234",
      plans: [
        {
          planName: "Basic (with ads)",
          monthlyPriceMinor: 599
        },
        {
          planName: "Standard",
          monthlyPriceMinor: 999
        },
        {
          planName: "Premium",
          monthlyPriceMinor: 1299
        }
      ]
    }
,
    AT: {
      currency: "EUR",
      sourceUrl:
        "https" + "://" +
        "apps.apple.com/at/app/paramount/id1340650234",
      plans: [
        {
          planName: "Basic (with ads)",
          monthlyPriceMinor: 599
        },
        {
          planName: "Standard",
          monthlyPriceMinor: 999
        },
        {
          planName: "Premium",
          monthlyPriceMinor: 1299
        }
      ]
    }
,
    IE: {
      currency: "EUR",
      sourceUrl:
        "https" + "://" +
        "apps.apple.com/ie/app/paramount/id1340650234",
      plans: [
        {
          planName: "Basic (with ads)",
          monthlyPriceMinor: 599
        },
        {
          planName: "Standard",
          monthlyPriceMinor: 999
        },
        {
          planName: "Premium",
          monthlyPriceMinor: 1299
        }
      ]
    }
,
    FR: {
      currency: "EUR",
      sourceUrl:
        "https" + "://" +
        "apps.apple.com/fr/app/paramount/id1340650234",
      plans: [
        {
          planName: "Standard",
          monthlyPriceMinor: 799
        },
        {
          planName: "Premium",
          monthlyPriceMinor: 1099
        }
      ]
    }
,
    IT: {
      currency: "EUR",
      sourceUrl:
        "https" + "://" +
        "apps.apple.com/it/app/paramount/id1340650234",
      plans: [
        {
          planName: "Standard",
          monthlyPriceMinor: 799
        },
        {
          planName: "Premium",
          monthlyPriceMinor: 1299
        }
      ]
    }
}
,
  "hulu": {
    US: {
      currency: "USD",
      sourceUrl:
        "https" +
        "://" +
        "www.hulu.com/annual-offer",
      plans: [
        {
          planName: "Hulu (With Ads)",
          monthlyPriceMinor: 1199
        }
      ]
    }
  },
  "peacock": {
    US: {
      currency: "USD",
      sourceUrl:
        "https" +
        "://" +
        "www.peacocktv.com/help/article/price-increase",
      plans: [
        {
          planName: "Select",
          monthlyPriceMinor: 899
        },
        {
          planName: "Premium",
          monthlyPriceMinor: 1299
        },
        {
          planName: "Premium Plus",
          monthlyPriceMinor: 1999
        }
      ]
    }
  }
,
  audible: {
    US: {
      currency: "USD",
      sourceUrl:
        "https" + "://" + "www.audible.com/",
      plans: [
        { planName: "Standard", monthlyPriceMinor: 899 },
        { planName: "Premium Plus", monthlyPriceMinor: 1495 }
      ]
    },
    DE: {
      currency: "EUR",
      sourceUrl:
        "https" + "://" + "www.audible.de/",
      plans: [
        { planName: "Standard", monthlyPriceMinor: 699 },
        { planName: "Premium", monthlyPriceMinor: 995 }
      ]
    }
  },
  "playstation-plus": {
    US: {
      currency: "USD",
      sourceUrl:
        "https" +
        "://" +
        "www.playstation.com/en-us/ps-plus/",
      plans: [
        { planName: "Essential", monthlyPriceMinor: 1099 },
        { planName: "Extra", monthlyPriceMinor: 1699 },
        { planName: "Premium", monthlyPriceMinor: 1999 }
      ]
    }
  }

};

function regionalStoreEstimatedAdapter(
  serviceSlug: string
) {
  return async (
    ctx: AdapterContext
  ): Promise<AdapterPrice[]> => {
    const market =
      regionalStoreEstimatedCatalog[serviceSlug]?.[
        ctx.countryCode
      ];

    if (
      !market ||
      market.currency !== ctx.currency
    ) {
      return [];
    }

    const items = market.plans.flatMap((plan) =>
      exactForRoute(
        serviceSlug,
        plan.planName,
        ctx.countryCode,
        ctx.currency,
        plan.monthlyPriceMinor / 100,
        market.sourceUrl,
        "direct"
      )
    );

    return resolvePriceCandidates(
      ctx,
      officialStoreCandidates(items)
    );
  };
}

export const providerAdapters = {
  "tencent-video": chinaStoreEstimatedAdapter("tencent-video"),
  iqiyi: chinaStoreEstimatedAdapter("iqiyi"),
  "mango-tv": chinaStoreEstimatedAdapter("mango-tv"),
  bilibili: chinaStoreEstimatedAdapter("bilibili"),
  "qq-music": chinaStoreEstimatedAdapter("qq-music"),
  "netease-cloud-music": chinaStoreEstimatedAdapter(
    "netease-cloud-music"
  ),
  "kugou-music": chinaStoreEstimatedAdapter("kugou-music"),
  "baidu-netdisk": chinaStoreEstimatedAdapter("baidu-netdisk"),
  wps: chinaStoreEstimatedAdapter("wps"),
  crunchyroll: regionalStoreEstimatedAdapter("crunchyroll"),
  tidal: regionalStoreEstimatedAdapter("tidal"),
  "xbox-game-pass": regionalStoreEstimatedAdapter("xbox-game-pass"),
  "geforce-now": regionalStoreEstimatedAdapter("geforce-now"),
  "ea-play": regionalStoreEstimatedAdapter("ea-play"),
  "ubisoft-plus": regionalStoreEstimatedAdapter("ubisoft-plus"),
  "amazon-music-unlimited": regionalStoreEstimatedAdapter("amazon-music-unlimited"),
  chatgpt: regionalStoreEstimatedAdapter("chatgpt"),
  claude: regionalStoreEstimatedAdapter("claude"),
  dropbox: regionalStoreEstimatedAdapter("dropbox"),
  strava: regionalStoreEstimatedAdapter("strava"),
  headspace: regionalStoreEstimatedAdapter("headspace"),
  calm: regionalStoreEstimatedAdapter("calm"),
  "paramount-plus": regionalStoreEstimatedAdapter("paramount-plus"),
  hulu: regionalStoreEstimatedAdapter("hulu"),
  peacock: regionalStoreEstimatedAdapter("peacock"),
  audible: regionalStoreEstimatedAdapter("audible"),
  "playstation-plus": regionalStoreEstimatedAdapter("playstation-plus"),
  spotify: spotifyAdapter,
  "google-one": googleOneAdapter,
  netflix: netflixAdapter,
  "disney-plus": disneyAdapter,
  max: maxAdapter,
  "microsoft-365": microsoft365Adapter,
  "icloud-plus": icloudPlusAdapter,
  "apple-music": appleMusicAdapter,
  youku: youkuAdapter,
  "amazon-prime": amazonPrimeAdapter,
  "prime-video": primeVideoAdapter,
  "apple-tv-plus": appleTvAdapter,
  "youtube-premium": youtubePremiumAdapter
};

export async function fetchProviderLocalPrices(
  countryCode: string,
  currency: string
) {
  const ctx = { countryCode, currency };

  /*
   * Run service-specific adapters first.
   *
   * These adapters may combine verified registry values with
   * independently verified official sources.
   */
  const results = await Promise.allSettled(
    Object.entries(providerAdapters).map(
      async ([serviceSlug, adapter]) => {
        const items = await adapter(ctx);

        return items.map((item) => ({
          ...item,
          serviceSlug
        }));
      }
    )
  );

  const adapterItems = results.flatMap((result) =>
    result.status === "fulfilled"
      ? result.value
      : []
  );

  /*
   * The verified registry contains services that do not need a
   * custom live adapter.
   *
   * Previously these rows were unreachable because this function
   * only iterated providerAdapters. That meant verified services
   * such as Spotify, Apple Music, Microsoft 365 and iCloud+ could
   * exist in the registry but never reach /v1/pricing.
   *
   * Add registry-backed services that have no custom adapter.
   */
  const registryServiceSlugs = [
    ...new Set(
      (
        verifiedProviderRegistry[countryCode] ??
        []
      )
        .filter(
          (row) =>
            row.currency === currency
        )
        .map((row) => row.serviceSlug)
    )
  ];

  const registryOnlyItems =
    registryServiceSlugs.flatMap(
      (serviceSlug) => {
        if (
          Object.prototype.hasOwnProperty.call(
            providerAdapters,
            serviceSlug
          )
        ) {
          return [];
        }

        return registryPrices(
          serviceSlug,
          ctx
        );
      }
    );

  return [
    ...adapterItems,
    ...registryOnlyItems
  ];
}
