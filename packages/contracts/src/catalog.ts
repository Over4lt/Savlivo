import { webEvidenceFor } from "./catalog-web-management";
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
  additionalAvailability?: {markets:readonly string[];sourceUrl:string;verifiedAt:string};
  management?: {countryCode:string;billingProviderSlug:string;url:string;kind:"instructions"}[];
};
export const serviceCatalog: readonly CatalogService[] = [
  {
    "slug": "netflix",
    "name": "Netflix",
    additionalAvailability: {markets:["GB","AU","NZ","CH","PL","BR","CZ","MY","IN","SG","HK","TW","AE","TH","PH"],
      sourceUrl:"https://help.netflix.com/en/node/14164",verifiedAt:"2026-09-10"},
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
    additionalAvailability:{markets:["IN","SG","HK","TW","AE","TH","PH","AU","NZ"],
      sourceUrl:"https://support.spotify.com/us/article/where-spotify-is-available/",verifiedAt:"2026-09-10"},
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
},
  {
    slug: "storytel", name: "Storytel", aliases: ["story tel"],
    categories: ["books-audio"], legacyGroup: "music-audio", launchMarkets: ["NO"],
    management: [{ countryCode: "NO", billingProviderSlug: "direct", kind: "instructions",
      url: "https://support.storytel.com/hc/en-001/articles/360010486719-Cancel-your-subscription" }]
  },
  // Availability-only additions: no plan, price or management capability is
  // inferred. Evidence and narrower-than-provider launch scope: global-47 audit.
  {slug:"rtl-plus",name:"RTL+",aliases:["rtl plus"],categories:["video","sports","books-audio"],legacyGroup:"video",launchMarkets:["DE"]},
  {slug:"videoland",name:"Videoland",aliases:[],categories:["video"],legacyGroup:"video",launchMarkets:["NL"]},
  {slug:"nintendo-switch-online",name:"Nintendo Switch Online",aliases:["switch online","nintendo online"],categories:["gaming"],legacyGroup:"gaming",launchMarkets:["US","BR","JP","CA","MX","CL","CO"]},
  {slug:"osn-plus",name:"OSN+",aliases:["osn plus"],categories:["video"],legacyGroup:"video",launchMarkets:["AE","SA","QA","EG"]},
  {"slug": "apple-arcade", "name": "Apple Arcade", "aliases": ["arcade"], "categories": ["gaming"], "legacyGroup": "gaming", "launchMarkets": ["US", "NO", "SE", "DK", "DE", "ES", "FR", "IT", "PT", "NL", "BE", "AT", "IE", "FI", "GB", "AU", "NZ", "CH", "PL", "BR", "CZ", "MY", "IN", "SG", "TW", "AE", "TH", "PH", "JP", "CA", "SA", "KR", "MX", "ID", "TR", "ZA", "IL", "QA", "EG", "VN", "RO", "GR", "CL", "CO"]},
  {"slug": "u-next", "name": "U-NEXT", "aliases": ["ユーネクスト", "unext"], "categories": ["video", "books-audio"], "legacyGroup": "video", "launchMarkets": ["JP"]},
  {"slug": "hulu-japan", "name": "Hulu Japan", "aliases": ["フールー", "hulu japan"], "categories": ["video"], "legacyGroup": "video", "launchMarkets": ["JP"]},
  {"slug": "dmm-tv", "name": "DMM TV", "aliases": ["DMMプレミアム", "dmm premium"], "categories": ["video"], "legacyGroup": "video", "launchMarkets": ["JP"]},
  {"slug": "tving", "name": "TVING", "aliases": ["티빙"], "categories": ["video", "sports"], "legacyGroup": "video", "launchMarkets": ["KR"]},
  {"slug": "melon", "name": "Melon", "aliases": ["멜론"], "categories": ["music-audio"], "legacyGroup": "music-audio", "launchMarkets": ["KR"]},
  {"slug": "crave", "name": "Crave", "aliases": [], "categories": ["video"], "legacyGroup": "video", "launchMarkets": ["CA"]},
  {"slug": "tsn", "name": "TSN", "aliases": [], "categories": ["sports"], "legacyGroup": "video", "launchMarkets": ["CA"]},
  {"slug": "sportsnet-plus", "name": "Sportsnet+", "aliases": ["sportsnet plus"], "categories": ["sports"], "legacyGroup": "video", "launchMarkets": ["CA"]},
  {"slug": "siriusxm-canada", "name": "SiriusXM Canada", "aliases": ["sirius xm canada"], "categories": ["music-audio"], "legacyGroup": "music-audio", "launchMarkets": ["CA"]},
  {"slug": "shahid", "name": "Shahid", "aliases": ["شاهد"], "categories": ["video", "sports"], "legacyGroup": "video", "launchMarkets": ["AE", "SA", "QA", "EG"]},
  {"slug": "anghami", "name": "Anghami", "aliases": ["أنغامي"], "categories": ["music-audio"], "legacyGroup": "music-audio", "launchMarkets": ["AE", "SA", "QA", "EG"]},
  {"slug": "stc-tv", "name": "stc tv", "aliases": ["jawwy tv"], "categories": ["video", "telecom"], "legacyGroup": "video", "launchMarkets": ["SA"]},
  {"slug": "tod", "name": "TOD", "aliases": [], "categories": ["video", "sports"], "legacyGroup": "video", "launchMarkets": ["QA"]},
  {"slug": "vix", "name": "ViX", "aliases": [], "categories": ["video", "sports"], "legacyGroup": "video", "launchMarkets": ["MX"]},
  {"slug": "vidio", "name": "Vidio", "aliases": [], "categories": ["video", "sports"], "legacyGroup": "video", "launchMarkets": ["ID"]},
  {"slug": "vision-plus", "name": "VISION+", "aliases": ["vision plus"], "categories": ["video", "sports"], "legacyGroup": "video", "launchMarkets": ["ID"]},
  {"slug": "gain", "name": "GAİN", "aliases": ["gain"], "categories": ["video"], "legacyGroup": "video", "launchMarkets": ["TR"]},
  {"slug": "exxen", "name": "Exxen", "aliases": [], "categories": ["video", "sports"], "legacyGroup": "video", "launchMarkets": ["TR"]},
  {"slug": "dstv-stream", "name": "DStv Stream", "aliases": ["dstv"], "categories": ["video", "sports"], "legacyGroup": "video", "launchMarkets": ["ZA"]},
  {"slug": "sting-plus", "name": "STING+", "aliases": ["sting plus", "סטינג"], "categories": ["video"], "legacyGroup": "video", "launchMarkets": ["IL"]},
  {"slug": "yes-plus", "name": "yes+", "aliases": ["yes plus"], "categories": ["video"], "legacyGroup": "video", "launchMarkets": ["IL"]},
  {"slug": "watch-it", "name": "WATCH IT", "aliases": ["watchit"], "categories": ["video"], "legacyGroup": "video", "launchMarkets": ["EG"]},
  {"slug": "fpt-play", "name": "FPT Play", "aliases": [], "categories": ["video", "sports"], "legacyGroup": "video", "launchMarkets": ["VN"]},
  {"slug": "voyo-ro", "name": "VOYO Romania", "aliases": ["voyo romania", "voyo"], "categories": ["video", "sports"], "legacyGroup": "video", "launchMarkets": ["RO"]},
  {"slug": "antenaplay", "name": "AntenaPLAY", "aliases": ["antena play"], "categories": ["video", "sports"], "legacyGroup": "video", "launchMarkets": ["RO"]},
  {"slug": "magenta-tv-gr", "name": "MagentaTV Greece", "aliases": ["cosmote tv", "cosmotetv", "magenta tv greece"], "categories": ["video", "sports"], "legacyGroup": "video", "launchMarkets": ["GR"]},
  {"slug": "cinobo", "name": "Cinobo", "aliases": [], "categories": ["video"], "legacyGroup": "video", "launchMarkets": ["GR"]},
  {"slug": "zapping", "name": "Zapping", "aliases": [], "categories": ["video", "sports"], "legacyGroup": "video", "launchMarkets": ["CL"]},
  {"slug": "win-play", "name": "Win Play", "aliases": ["win sports", "win sports online", "winplay"], "categories": ["video", "sports"], "legacyGroup": "video", "launchMarkets": ["CO"]},

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
  // Explicit supported launch routes; no provider management URL is inferred.
  "apple-arcade": ["apple"],
  "u-next": ["direct"],
  "hulu-japan": ["direct"],
  "dmm-tv": ["direct", "apple", "google-play"],
  "tving": ["direct"],
  "melon": ["direct"],
  "crave": ["direct"],
  "tsn": ["direct"],
  "sportsnet-plus": ["direct"],
  "siriusxm-canada": ["direct"],
  "shahid": ["direct"],
  "anghami": ["direct"],
  "stc-tv": ["direct"],
  "tod": ["direct"],
  "vix": ["direct"],
  "vidio": ["direct"],
  "vision-plus": ["direct"],
  "gain": ["direct"],
  "exxen": ["direct"],
  "dstv-stream": ["direct"],
  "sting-plus": ["direct"],
  "yes-plus": ["direct"],
  "watch-it": ["direct"],
  "fpt-play": ["direct"],
  "voyo-ro": ["direct"],
  "antenaplay": ["direct"],
  "magenta-tv-gr": ["direct"],
  "cinobo": ["direct"],
  "zapping": ["direct"],
  "win-play": ["direct"],
  viaplay: ["direct", "apple", "carrier"],
  storytel: ["direct"],
  "rtl-plus": ["direct"],
  videoland: ["direct"],
  "nintendo-switch-online": ["direct"],
  "osn-plus": ["direct"],
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
  // Availability fact only; web eligibility is separate. Never filter saved subscriptions here.
  if (!catalogBySlug.has(serviceSlug) || !countryCurrencyData.some(([code]) => code === countryCode)) return false;
  const launchMarkets = catalogBySlug.get(serviceSlug)?.launchMarkets;
  if (launchMarkets) return launchMarkets.includes(countryCode);
  if (catalogBySlug.get(serviceSlug)?.additionalAvailability?.markets.includes(countryCode)) return true;
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
const catalogBySlug = new Map(serviceCatalog.map(service => [service.slug, service]));

// Relevance is availability, not a popularity/market-share claim.
export const catalogDiscoveryPolicy = { defaultLimit: 12, searchLimit: 30, rankEvidence: "unranked" } as const;

const searchIndex = serviceCatalog.map(service => ({
  service, name: normalizeCatalogText(service.name), keys: [...new Set([service.name, service.slug, ...service.aliases].map(normalizeCatalogText))]
}));

// New discovery only. Availability, pricing and saved identities are independent.
export function serviceEligibleForCatalog(serviceSlug: string, countryCode: string) {
  const evidence = webEvidenceFor(serviceSlug, countryCode);
  return serviceAvailableInMarket(serviceSlug, countryCode) &&
    evidence?.startWeb.status === "VERIFIED" && evidence.cancelWeb.status === "VERIFIED";
}
export function catalogManagementEligibility(serviceSlug: string, countryCode: string, verifiedDirectPrice = false) {
  const evidence = webEvidenceFor(serviceSlug, countryCode);
  if (evidence?.startWeb.status === "NOT_WEB" || evidence?.cancelWeb.status === "NOT_WEB") return "NOT_CATALOG_ELIGIBLE" as const;
  if (!serviceEligibleForCatalog(serviceSlug, countryCode)) return "REVIEW_REQUIRED" as const;
  return verifiedDirectPrice ? "FULLY_VERIFIED" as const : "CATALOG_ELIGIBLE_PRICE_UNVERIFIED" as const;
}
// Additive fallback only; existing provider/store destinations take precedence.
export function catalogWebManagementDestination(serviceSlug: string, countryCode: string, billingProvider: string) {
  if (billingProvider !== "direct") return null;
  const evidence = webEvidenceFor(serviceSlug, countryCode);
  return evidence?.cancelWeb.status === "VERIFIED" ? evidence.cancelWeb.url ?? null : null;
}

export function searchCatalog(query: string, countryCode: string, options: {limit?: number; category?: CatalogCategory} = {}) {
  const q=normalizeCatalogText(query);
  const limit=Math.max(0,Math.min(50,Math.floor(options.limit ?? 20)));
  return searchIndex.filter(({service,keys}) =>
    serviceEligibleForCatalog(service.slug,countryCode) &&
    (!options.category || service.categories.includes(options.category)) &&
    (q ? keys.some(key=>key.includes(q)) : serviceAvailableInMarket(service.slug,countryCode)))
    .sort((a,b)=>{
      // Names outrank aliases: short prefixes such as "ne" must prefer Netflix.
      // No fuzzy provider selection. Availability breaks ties, never changes identity.
      const rank = (entry: typeof a) => !q ? 0 : entry.name === q ? 0
        : entry.name.startsWith(q) ? 1
        : entry.name.split(" ").some(word => word.startsWith(q)) ? 2
        : entry.name.includes(q) ? 3 : 4;
      return rank(a)-rank(b) ||
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
    availableForSelection:countryCurrencyData.some(([cc,,cur])=>cc===input.countryCode&&cur===input.currency)&&serviceEligibleForCatalog(service.slug,input.countryCode),
    prefill:proven && serviceEligibleForCatalog(service.slug,input.countryCode) ? {planName:proven.planName,billingProviderSlug:proven.billingProviderSlug,monthlyPriceMinor:proven.monthlyPriceMinor} : {},
    requiresConfirmation:true as const
  };
}

// Instruction destinations are explicitly labelled, never represented as cancellation APIs.
export function catalogManagementDestination(serviceSlug:string,countryCode:string,billingProviderSlug:string) {
  return catalogBySlug.get(serviceSlug)?.management?.find(route=>route.countryCode===countryCode&&route.billingProviderSlug===billingProviderSlug);
}

export function transitionCatalogDraft<T extends {serviceSlug:string;billingProviderSlug:string;planName:string;monthlyPrice:string}>(draft:T,serviceSlug:string,billingProviderSlug:string):T {
  if(draft.serviceSlug===serviceSlug&&draft.billingProviderSlug===billingProviderSlug)return draft;
  return {...draft,serviceSlug,billingProviderSlug,planName:"",monthlyPrice:""};
}
