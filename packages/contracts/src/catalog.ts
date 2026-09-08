import { countryCurrencyData, countryCurrencies, expansionServiceAvailable } from "./markets";

// Canonical identities shared by existing manual selection and future AI discovery.
// This module contains no second price table. Plan evidence is supplied from pricing.
export const catalogCategories = [
  {
    "id": "video",
    "name": "Video & TV"
  },
  {
    "id": "music-audio",
    "name": "Music & Audio"
  },
  {
    "id": "sports",
    "name": "Sports"
  },
  {
    "id": "gaming",
    "name": "Gaming"
  },
  {
    "id": "cloud",
    "name": "Cloud & Storage"
  },
  {
    "id": "news",
    "name": "News & Magazines"
  },
  {
    "id": "books-audio",
    "name": "Books & Audiobooks"
  },
  {
    "id": "comics",
    "name": "Comics / Manga / Webtoon"
  },
  {
    "id": "telecom",
    "name": "Telecom / Bundles"
  },
  {
    "id": "other",
    "name": "Other"
  }
] as const;
export type CatalogCategory = (typeof catalogCategories)[number]["id"];
export type CatalogService = {
  slug: string; name: string; aliases: readonly string[];
  categories: readonly CatalogCategory[]; legacyGroup: string;
  launchMarkets?: readonly string[];
  management?: {countryCode:string;billingProviderSlug:string;url:string;kind:"instructions"}[];
};
export const serviceCatalog: readonly CatalogService[] = [
  {
    "slug": "netflix",
    "name": "Netflix",
    "aliases": [],
    "categories": [
      "video"
    ],
    "legacyGroup": "video"
  },
  {
    "slug": "disney-plus",
    "name": "Disney+",
    "aliases": [
      "disney plus"
    ],
    "categories": [
      "video"
    ],
    "legacyGroup": "video"
  },
  {
    "slug": "max",
    "name": "Max",
    "aliases": [
      "hbo max"
    ],
    "categories": [
      "video"
    ],
    "legacyGroup": "video"
  },
  {
    "slug": "prime-video",
    "name": "Prime Video",
    "aliases": [
      "amazon prime video"
    ],
    "categories": [
      "video"
    ],
    "legacyGroup": "video"
  },
  {
    "slug": "amazon-prime",
    "name": "Amazon Prime",
    "aliases": [
      "amazon prime"
    ],
    "categories": [
      "video"
    ],
    "legacyGroup": "video"
  },
  {
    "slug": "apple-tv-plus",
    "name": "Apple TV+",
    "aliases": [
      "apple tv",
      "apple tv plus"
    ],
    "categories": [
      "video"
    ],
    "legacyGroup": "video"
  },
  {
    "slug": "youtube-premium",
    "name": "YouTube Premium",
    "aliases": [
      "youtube premium"
    ],
    "categories": [
      "video"
    ],
    "legacyGroup": "video"
  },
  {
    "slug": "hulu",
    "name": "Hulu",
    "aliases": [],
    "categories": [
      "video"
    ],
    "legacyGroup": "video"
  },
  {
    "slug": "paramount-plus",
    "name": "Paramount+",
    "aliases": [],
    "categories": [
      "video"
    ],
    "legacyGroup": "video"
  },
  {
    "slug": "peacock",
    "name": "Peacock",
    "aliases": [],
    "categories": [
      "video"
    ],
    "legacyGroup": "video"
  },
  {
    "slug": "crunchyroll",
    "name": "Crunchyroll",
    "aliases": [],
    "categories": [
      "video"
    ],
    "legacyGroup": "video"
  },
  {
    "slug": "spotify",
    "name": "Spotify",
    "aliases": [],
    "categories": [
      "music-audio"
    ],
    "legacyGroup": "music-audio"
  },
  {
    "slug": "apple-music",
    "name": "Apple Music",
    "aliases": [],
    "categories": [
      "music-audio"
    ],
    "legacyGroup": "music-audio"
  },
  {
    "slug": "amazon-music-unlimited",
    "name": "Amazon Music Unlimited",
    "aliases": [],
    "categories": [
      "music-audio"
    ],
    "legacyGroup": "music-audio"
  },
  {
    "slug": "tidal",
    "name": "TIDAL",
    "aliases": [],
    "categories": [
      "music-audio"
    ],
    "legacyGroup": "music-audio"
  },
  {
    "slug": "audible",
    "name": "Audible",
    "aliases": [],
    "categories": [
      "books-audio"
    ],
    "legacyGroup": "music-audio"
  },
  {
    "slug": "xbox-game-pass",
    "name": "Xbox Game Pass",
    "aliases": [],
    "categories": [
      "gaming"
    ],
    "legacyGroup": "gaming"
  },
  {
    "slug": "playstation-plus",
    "name": "PlayStation Plus",
    "aliases": [],
    "categories": [
      "gaming"
    ],
    "legacyGroup": "gaming"
  },
  {
    "slug": "ea-play",
    "name": "EA Play",
    "aliases": [],
    "categories": [
      "gaming"
    ],
    "legacyGroup": "gaming"
  },
  {
    "slug": "ubisoft-plus",
    "name": "Ubisoft+",
    "aliases": [],
    "categories": [
      "gaming"
    ],
    "legacyGroup": "gaming"
  },
  {
    "slug": "geforce-now",
    "name": "GeForce NOW",
    "aliases": [],
    "categories": [
      "gaming"
    ],
    "legacyGroup": "gaming"
  },
  {
    "slug": "chatgpt",
    "name": "ChatGPT",
    "aliases": [],
    "categories": [
      "other"
    ],
    "legacyGroup": "ai-software-cloud"
  },
  {
    "slug": "claude",
    "name": "Claude",
    "aliases": [],
    "categories": [
      "other"
    ],
    "legacyGroup": "ai-software-cloud"
  },
  {
    "slug": "microsoft-365",
    "name": "Microsoft 365",
    "aliases": [],
    "categories": [
      "other"
    ],
    "legacyGroup": "ai-software-cloud"
  },
  {
    "slug": "adobe-creative-cloud",
    "name": "Adobe Creative Cloud",
    "aliases": [],
    "categories": [
      "other"
    ],
    "legacyGroup": "ai-software-cloud"
  },
  {
    "slug": "canva",
    "name": "Canva",
    "aliases": [],
    "categories": [
      "other"
    ],
    "legacyGroup": "ai-software-cloud"
  },
  {
    "slug": "dropbox",
    "name": "Dropbox",
    "aliases": [],
    "categories": [
      "cloud"
    ],
    "legacyGroup": "ai-software-cloud"
  },
  {
    "slug": "google-one",
    "name": "Google One",
    "aliases": [],
    "categories": [
      "cloud"
    ],
    "legacyGroup": "ai-software-cloud"
  },
  {
    "slug": "icloud-plus",
    "name": "iCloud+",
    "aliases": [
      "icloud",
      "icloud plus"
    ],
    "categories": [
      "cloud"
    ],
    "legacyGroup": "ai-software-cloud"
  },
  {
    "slug": "tencent-video",
    "name": "Tencent Video / 腾讯视频",
    "aliases": [
      "腾讯视频"
    ],
    "categories": [
      "video"
    ],
    "legacyGroup": "video"
  },
  {
    "slug": "iqiyi",
    "name": "iQIYI / 爱奇艺",
    "aliases": [
      "爱奇艺"
    ],
    "categories": [
      "video"
    ],
    "legacyGroup": "video"
  },
  {
    "slug": "mango-tv",
    "name": "Mango TV / 芒果TV",
    "aliases": [
      "芒果TV"
    ],
    "categories": [
      "video"
    ],
    "legacyGroup": "video"
  },
  {
    "slug": "youku",
    "name": "Youku / 优酷",
    "aliases": [
      "优酷"
    ],
    "categories": [
      "video"
    ],
    "legacyGroup": "video"
  },
  {
    "slug": "bilibili",
    "name": "Bilibili / 哔哩哔哩",
    "aliases": [
      "哔哩哔哩"
    ],
    "categories": [
      "video"
    ],
    "legacyGroup": "video"
  },
  {
    "slug": "qq-music",
    "name": "QQ Music / QQ音乐",
    "aliases": [
      "QQ音乐"
    ],
    "categories": [
      "music-audio"
    ],
    "legacyGroup": "music-audio"
  },
  {
    "slug": "netease-cloud-music",
    "name": "NetEase Cloud Music / 网易云音乐",
    "aliases": [
      "网易云音乐"
    ],
    "categories": [
      "music-audio"
    ],
    "legacyGroup": "music-audio"
  },
  {
    "slug": "kugou-music",
    "name": "KuGou Music / 酷狗音乐",
    "aliases": [
      "酷狗音乐"
    ],
    "categories": [
      "music-audio"
    ],
    "legacyGroup": "music-audio"
  },
  {
    "slug": "baidu-netdisk",
    "name": "Baidu Netdisk / 百度网盘",
    "aliases": [
      "百度网盘"
    ],
    "categories": [
      "cloud"
    ],
    "legacyGroup": "ai-software-cloud"
  },
  {
    "slug": "wps",
    "name": "WPS Office",
    "aliases": [],
    "categories": [
      "other"
    ],
    "legacyGroup": "ai-software-cloud"
  },
  {
    "slug": "strava",
    "name": "Strava",
    "aliases": [],
    "categories": [
      "other"
    ],
    "legacyGroup": "fitness-wellness"
  },
  {
    "slug": "calm",
    "name": "Calm",
    "aliases": [],
    "categories": [
      "other"
    ],
    "legacyGroup": "fitness-wellness"
  },
  {
    "slug": "headspace",
    "name": "Headspace",
    "aliases": [],
    "categories": [
      "other"
    ],
    "legacyGroup": "fitness-wellness"
  },
{
  "slug": "viaplay",
  "launchMarkets": ["NO"],
  "name": "Viaplay",
  "aliases": [
    "via play"
  ],
  "categories": [
    "video",
    "sports"
  ],
  "legacyGroup": "video",
  "management": [
    {
      "countryCode": "NO",
      "billingProviderSlug": "direct",
      "url": "https://help.viaplay.com/nb/cancel-package/",
      "kind": "instructions"
    }
  ]
}
];

// Preserve the current Build 12 presentation labels and ordering.
export const serviceCategories = [
  {
    "key": "video",
    "name": "Video"
  },
  {
    "key": "music-audio",
    "name": "Music & Audio"
  },
  {
    "key": "gaming",
    "name": "Gaming"
  },
  {
    "key": "ai-software-cloud",
    "name": "AI, Software & Cloud"
  },
  {
    "key": "fitness-wellness",
    "name": "Fitness & Wellness"
  }
].map(category => ({...category, slugs: serviceCatalog.filter(service => service.legacyGroup === category.key).map(service => service.slug)}));

export const billingProviders = [
  { slug: "direct", name: "Direct" },
  { slug: "apple", name: "Apple" },
  { slug: "google-play", name: "Google Play" },
  { slug: "amazon", name: "Amazon" },
  { slug: "carrier", name: "Carrier / TV provider" }
] as const;

export type BillingProviderSlug =
  (typeof billingProviders)[number]["slug"];

/*
 * Billing routes users can realistically select for each service.
 *
 * This matters because Savlivo later uses the billing route to decide
 * where Cancel / Reactivate should send the user.
 *
 * "carrier" is kept only for services where partner / TV / carrier
 * billing is a realistic possibility.
 */
export const serviceBillingProviders: Record<
  string,
  readonly BillingProviderSlug[]
> = {
  viaplay: ["direct", "apple", "carrier"],
  // VIDEO
  netflix: [
    "direct",
    "carrier"
  ],

  "disney-plus": [
    "direct",
    "apple",
    "google-play",
    "amazon",
    "carrier"
  ],

  max: [
    "direct",
    "apple",
    "google-play",
    "amazon",
    "carrier"
  ],

  "prime-video": [
    "amazon",
    "direct"
  ],

  "amazon-prime": [
    "amazon",
    "direct"
  ],

  "apple-tv-plus": [
    "apple",
    "direct"
  ],

  "youtube-premium": [
    "direct",
    "apple",
    "google-play"
  ],

  hulu: [
    "direct",
    "apple",
    "google-play",
    "amazon",
    "carrier"
  ],

  "paramount-plus": [
    "direct",
    "apple",
    "google-play",
    "amazon",
    "carrier"
  ],

  peacock: [
    "direct",
    "apple",
    "google-play",
    "carrier"
  ],

  crunchyroll: [
    "direct",
    "apple",
    "google-play",
    "amazon"
  ],

  // MUSIC & AUDIO
  spotify: [
    "direct",
    "apple",
    "google-play",
    "carrier"
  ],

  "apple-music": [
    "apple",
    "direct",
    "google-play",
    "carrier"
  ],

  "amazon-music-unlimited": [
    "amazon",
    "direct",
    "apple",
    "google-play"
  ],

  tidal: [
    "direct",
    "apple",
    "google-play"
  ],

  audible: [
    "amazon",
    "direct",
    "apple",
    "google-play"
  ],

  // GAMING
  "xbox-game-pass": [
    "direct",
    "carrier"
  ],

  "playstation-plus": [
    "direct"
  ],

  "ea-play": [
    "direct",
    "apple",
    "google-play"
  ],

  "ubisoft-plus": [
    "direct"
  ],

  "geforce-now": [
    "direct"
  ],

  // AI, SOFTWARE & CLOUD
  chatgpt: [
    "direct",
    "apple",
    "google-play"
  ],

  claude: [
    "direct",
    "apple",
    "google-play"
  ],

  "microsoft-365": [
    "direct",
    "apple",
    "google-play",
    "carrier"
  ],

  "adobe-creative-cloud": [
    "direct",
    "apple",
    "google-play"
  ],

  canva: [
    "direct",
    "apple",
    "google-play"
  ],

  dropbox: [
    "direct",
    "apple",
    "google-play"
  ],

  "google-one": [
    "direct",
    "apple",
    "google-play"
  ],

  "icloud-plus": [
    "apple"
  ],

  // MAINLAND CHINA
  "tencent-video": [
    "direct"
  ],
  iqiyi: [
    "direct"
  ],
  "mango-tv": [
    "direct"
  ],
  youku: [
    "direct"
  ],
  bilibili: [
    "direct"
  ],
  "qq-music": [
    "direct"
  ],
  "netease-cloud-music": [
    "direct"
  ],
  "kugou-music": [
    "direct"
  ],
  "baidu-netdisk": [
    "direct"
  ],
  wps: [
    "direct"
  ],

  // FITNESS & WELLNESS
  strava: [
    "direct",
    "apple",
    "google-play"
  ],

  calm: [
    "direct",
    "apple",
    "google-play"
  ],

  headspace: [
    "direct",
    "apple",
    "google-play"
  ]
};

export function billingProvidersForService(
  serviceSlug: string
) {
  const allowed =
    serviceBillingProviders[serviceSlug];

  /*
   * Safe fallback for future services:
   * don't expose every possible billing route.
   */
  if (!allowed?.length) {
    return billingProviders.filter(
      (provider) =>
        provider.slug === "direct"
    );
  }

  return billingProviders.filter(
    (provider) =>
      allowed.includes(provider.slug)
  );
}

export function defaultBillingProviderForService(
  serviceSlug: string
): BillingProviderSlug {
  const available =
    billingProvidersForService(serviceSlug);

  return available[0]?.slug ?? "direct";
}

export function isBillingProviderAllowed(
  serviceSlug: string,
  providerSlug: string
) {
  return billingProvidersForService(
    serviceSlug
  ).some(
    (provider) =>
      provider.slug === providerSlug
  );
}


export const allCurrencies = Array.from(
  new Set(countryCurrencyData.map(([, , currency]) => currency))
).sort();

const mainlandChinaServiceSlugs = new Set([
  "tencent-video",
  "iqiyi",
  "mango-tv",
  "youku",
  "bilibili",
  "qq-music",
  "netease-cloud-music",
  "kugou-music",
  "baidu-netdisk",
  "wps",
  "apple-music",
  "icloud-plus",
  "microsoft-365"
]);

const mainlandChinaOnlyServiceSlugs = new Set([
  "tencent-video",
  "iqiyi",
  "mango-tv",
  "youku",
  "bilibili",
  "qq-music",
  "netease-cloud-music",
  "kugou-music",
  "baidu-netdisk",
  "wps"
]);

const usOnlyServiceSlugs = new Set([
  "hulu",
  "peacock"
]);

const paramountPlusMarketCodes = new Set([
  "US",
  "DE",
  "FR",
  "IT",
  "AT",
  "IE"
]);

export function serviceAvailableInMarket(
  serviceSlug: string,
  countryCode: string
) {
  const launchMarkets = serviceCatalog.find(service=>service.slug===serviceSlug)?.launchMarkets;
  if (launchMarkets) return launchMarkets.includes(countryCode);
  const expansionAvailability = expansionServiceAvailable(serviceSlug, countryCode);
  if (expansionAvailability !== undefined) return expansionAvailability;

  if (countryCode === "CN") {
    return mainlandChinaServiceSlugs.has(serviceSlug);
  }

  if (usOnlyServiceSlugs.has(serviceSlug)) {
    return countryCode === "US";
  }

  if (serviceSlug === "paramount-plus") {
    return paramountPlusMarketCodes.has(countryCode);
  }

  return !mainlandChinaOnlyServiceSlugs.has(serviceSlug);
}



export function normalizeCatalogText(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase("en-US").replace(/\+/g," plus ")
    .replace(/[-_/]/g," ").replace(/\s+/g," ").trim();
}
const searchIndex = serviceCatalog.map(service => ({
  service, keys: [...new Set([service.name, service.slug, ...service.aliases].map(normalizeCatalogText))]
}));

export function searchCatalog(query: string, countryCode: string, options: {limit?: number; category?: CatalogCategory} = {}) {
  const q=normalizeCatalogText(query);
  const limit=Math.max(0,Math.min(50,Math.floor(options.limit ?? 20)));
  return searchIndex.filter(({service,keys}) =>
    (!options.category || service.categories.includes(options.category)) &&
    (q ? keys.some(key=>key.includes(q)) : serviceAvailableInMarket(service.slug,countryCode)))
    .sort((a,b)=>{
      const exact=(entry:typeof a)=>q && entry.keys.includes(q) ? 1 : 0;
      return Number(exact(b))-Number(exact(a)) ||
        Number(serviceAvailableInMarket(b.service.slug,countryCode))-Number(serviceAvailableInMarket(a.service.slug,countryCode)) ||
        a.service.name.localeCompare(b.service.name);
    }).slice(0,limit).map(({service})=>service);
}

export type CatalogPriceEvidence = {
  serviceSlug: string; planName: string; countryCode: string; currency: string;
  billingProviderSlug: string; monthlyPriceMinor: number;
  verification?: string; sourceCount?: number; verifiedByAgreement?: boolean;
};
export function catalogPlans(serviceSlug:string,countryCode:string,currency:string,prices:readonly CatalogPriceEvidence[]) {
  if(countryCurrencies[countryCode]!==currency || !countryCurrencyData.some(([cc,,cur])=>cc===countryCode&&cur===currency))return [];
  return prices.filter(p=>p.serviceSlug===serviceSlug&&p.countryCode===countryCode&&p.currency===currency &&
    (["registry","authoritative-provider"].includes(p.verification??"") || (p.verification === "multi-source" && p.verifiedByAgreement === true && (p.sourceCount ?? 0) >= 2)) &&
    billingProviders.some(route=>route.slug===p.billingProviderSlug) &&
    Number.isSafeInteger(p.monthlyPriceMinor)&&p.monthlyPriceMinor>0);
}

// Navigation/prefill only. There is deliberately no create/update/delete callback.
export function resolveCatalogCandidate(input: {
  serviceQuery:string; countryCode:string; currency:string; planName?:string; billingProviderSlug?:string;
}, prices:readonly CatalogPriceEvidence[]) {
  const query=normalizeCatalogText(input.serviceQuery);
  const exact=searchIndex.filter(entry=>entry.keys.includes(query)).map(entry=>entry.service);
  if(!query || exact.length===0)return {kind:"unknown" as const,requiresConfirmation:true as const};
  if(exact.length!==1)return {kind:"ambiguous" as const,services:exact.map(s=>s.slug),requiresConfirmation:true as const};
  const service=exact[0];
  const candidates=catalogPlans(service.slug,input.countryCode,input.currency,prices);
  const plan=input.planName ? normalizeCatalogText(input.planName) : null;
  const matching=plan && input.billingProviderSlug ? candidates.filter(p=>normalizeCatalogText(p.planName)===plan&&p.billingProviderSlug===input.billingProviderSlug) : [];
  const identities=new Set(matching.map(p=>JSON.stringify([p.planName,p.billingProviderSlug,p.monthlyPriceMinor])));
  const proven=identities.size===1 ? matching[0] : undefined;
  return {
    kind:"service" as const,serviceSlug:service.slug,countryCode:input.countryCode,currency:input.currency,
    availableForSelection:countryCurrencyData.some(([cc,,cur])=>cc===input.countryCode&&cur===input.currency)&&serviceAvailableInMarket(service.slug,input.countryCode),
    prefill:proven ? {planName:proven.planName,billingProviderSlug:proven.billingProviderSlug,monthlyPriceMinor:proven.monthlyPriceMinor} : {},
    requiresConfirmation:true as const
  };
}

// Instruction destinations are explicitly labelled, never represented as cancellation APIs.
export function catalogManagementDestination(serviceSlug:string,countryCode:string,billingProviderSlug:string) {
  return serviceCatalog.find(service=>service.slug===serviceSlug)?.management?.find(route=>route.countryCode===countryCode&&route.billingProviderSlug===billingProviderSlug);
}

export function transitionCatalogDraft<T extends {serviceSlug:string;billingProviderSlug:string;planName:string;monthlyPrice:string}>(draft:T,serviceSlug:string,billingProviderSlug:string):T {
  if(draft.serviceSlug===serviceSlug&&draft.billingProviderSlug===billingProviderSlug)return draft;
  return {...draft,serviceSlug,billingProviderSlug,planName:"",monthlyPrice:""};
}
