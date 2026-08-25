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
  verification?: "registry" | "multi-source" | "single-source";
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

async function fetchText(url: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(url, {
      headers: {
        accept: "text/html,application/xhtml+xml",
        "accept-language": "en",
        "user-agent":
          "Mozilla/5.0 (compatible; SavlivoPricing/1.1; +https://savlivo.local)"
      },
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`HTTP_${response.status}`);
    return await response.text();
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

    resolved.push({
      ...chosen.item,
      verification: hasRegistry
        ? "registry"
        : sourceCount >= 2
          ? "multi-source"
          : "single-source",
      sourceCount,
      verifiedByAgreement: sourceCount >= 2
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


async function netflixAdapter(
  ctx: AdapterContext
): Promise<AdapterPrice[]> {
  const candidates: PriceCandidate[] = [
    ...registryCandidates("netflix", ctx)
  ];

  const cc = ctx.countryCode.toLowerCase();

  const urls = [
    `https://www.netflix.com/${cc}/`,
    `https://www.netflix.com/${cc}-en/`
  ];

  // --------------------------------------------------
  // Source 1: exact prices from official local Netflix pages
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


async function disneyAdapter(
  ctx: AdapterContext
): Promise<AdapterPrice[]> {
  // Savlivo only exposes explicitly verified normal recurring
  // monthly prices for Disney+.
  //
  // Marketing pages frequently contain promotional or introductory
  // prices, so webpage scraping is not authoritative enough here.
  return registryPrices("disney-plus", ctx);
}


async function maxAdapter(
  ctx: AdapterContext
): Promise<AdapterPrice[]> {
  // Savlivo only exposes explicitly verified normal recurring
  // monthly prices for Max.
  //
  // Promotional offers and overlapping plan names on provider pages
  // must never be presented as verified catalog pricing.
  return registryPrices("max", ctx);
}


async function appleTvAdapter(
  ctx: AdapterContext
): Promise<AdapterPrice[]> {
  const candidates: PriceCandidate[] = [
    ...registryCandidates("apple-tv-plus", ctx)
  ];

  const cc = ctx.countryCode.toLowerCase();

  const tvUrl =
    `https://tv.apple.com/${cc}?l=en`;

  const appleCountryPath =
    ctx.countryCode === "US"
      ? ""
      : `${cc}/`;

  const marketingUrl =
    `https://www.apple.com/${appleCountryPath}apple-tv/`;

  async function collectApplePrice(
    url: string,
    sourceKind: PriceSourceKind,
    priority: number
  ) {
    try {
      const text = htmlToText(await fetchText(url));
      const token = currencyPattern(ctx.currency);

      const monthWords =
        "(?:month|monthly|måned|månad|monat|monatlich|mese|mes|mois|maand|kuukausi|månedligt)";

      const patterns = [
        new RegExp(
          `${token}\\s*([\\d.,\\s]+).{0,80}?${monthWords}`,
          "i"
        ),
        new RegExp(
          `([\\d.,\\s]+)\\s*${token}.{0,80}?${monthWords}`,
          "i"
        )
      ];

      for (const pattern of patterns) {
        const match = text.match(pattern);
        const amount = parseNumber(match?.[1] ?? "");

        if (amount == null || amount <= 0) {
          continue;
        }

        const items = exact(
          "apple-tv-plus",
          "Apple TV+",
          ctx.countryCode,
          ctx.currency,
          amount,
          url
        );

        candidates.push(
          ...candidateFromItems(
            items,
            sourceKind,
            priority
          )
        );

        break;
      }
    } catch {}
  }

  // Source A:
  // Apple TV service/store page.
  await collectApplePrice(
    tvUrl,
    "official-store-page",
    75
  );

  // Source B:
  // Apple's main country-specific Apple TV marketing page.
  await collectApplePrice(
    marketingUrl,
    "official-provider-page",
    70
  );

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

async function amazonPrimeAdapter(
  ctx: AdapterContext
): Promise<AdapterPrice[]> {
  // Amazon Prime is a separate membership product from
  // standalone Prime Video.
  //
  // Only publish explicitly verified local Prime membership
  // prices from the registry.
  return resolvePriceCandidates(
    ctx,
    registryCandidates(
      "amazon-prime",
      ctx
    )
  );
}


async function primeVideoAdapter(
  ctx: AdapterContext
): Promise<AdapterPrice[]> {
  // PRIME VIDEO SAFETY MODE
  //
  // Do not publish scraped Prime Video pricing yet.
  //
  // Prime Video pages can expose prices for:
  // - Prime Video Channels
  // - Ad Free upgrades
  // - rentals/purchases
  // - promotional offers
  // - Amazon Prime membership
  //
  // None of those should automatically become the standalone
  // recurring Prime Video subscription price.
  //
  // IMPORTANT:
  //
  // primevideo.com localization was tested with both:
  //
  //   ?gl=CC
  //   /region/cc
  //
  // Neither reliably overrides Amazon's geo-detected territory.
  // The returned page can therefore contain the API server's local
  // Prime Video price instead of the requested Savlivo country.
  //
  // Example observed during verification:
  // requests for US / DE / ES / FR still returned the Norwegian
  // territory and NOK pricing.
  //
  // Amazon Prime membership pages are also not interchangeable with
  // standalone Prime Video pricing. A Prime bundle price must not be
  // published as a Prime Video subscription price.
  //
  // Keep verified registry data as the only production source until
  // a country-addressable official source is independently verified.
  return resolvePriceCandidates(
    ctx,
    registryCandidates("prime-video", ctx)
  );
}


async function youtubePremiumAdapter(
  ctx: AdapterContext
): Promise<AdapterPrice[]> {
  // YouTube Premium pricing is highly dynamic and Google does not
  // expose a stable public country price table that Savlivo can
  // reliably parse as verified recurring pricing.
  //
  // Only return explicitly verified registry prices.
  return registryPrices("youtube-premium", ctx);
}


export const providerAdapters = {
  netflix: netflixAdapter,
  "disney-plus": disneyAdapter,
  max: maxAdapter,
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
  const results = await Promise.allSettled(
    Object.entries(providerAdapters).map(async ([serviceSlug, adapter]) => {
      const items = await adapter(ctx);
      return items.map((item) => ({ ...item, serviceSlug }));
    })
  );

  return results.flatMap((result) =>
    result.status === "fulfilled" ? result.value : []
  );
}
