import {
  useEffect,
  useRef,
  useState } from "react";
import {
  ActivityIndicator,
  Alert,
  AppState,
  Keyboard,
  KeyboardAvoidingView,
  Image,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import DateTimePicker, {
  type DateTimePickerEvent
} from "@react-native-community/datetimepicker";
import { StatusBar } from "expo-status-bar";
import { Ionicons } from "@expo/vector-icons";
import { api, clearToken, getToken, setToken } from "../src/api";
import { purchasePlan } from "../src/billing";
import {
  getSubscriptionManagementUrl,
  openProviderUrl,
  supportsSubscriptionAction
} from "../src/providerRouting";
import {
  effectiveSubscriptionStatus as resolveEffectiveSubscriptionStatus
} from "../lib/subscription-status";
import {
  needsRenewalDateRefresh,
  willSubscriptionRenewOn
} from "../lib/subscription-renewal";
import {
  classifySubscriptionIntent
} from "../lib/ai-intent";
import {
  getSavlivoHelp
} from "../lib/ai-app-help";
import {
  compareSubscriptions,
  parseScenarioMonths,
  rankSubscriptionsByCost,
  simulateSubscriptionRemoval
} from "../lib/ai-account-reasoning";
import {
  resolveSubscriptionEntities
} from "../lib/ai-entities";
import {
  emptyAssistantConversationContext,
  isComparisonFollowUp,
  isRenewalFollowUp,
  isScenarioFollowUp,
  rememberComparison,
  rememberScenario,
  rememberSubscription,
  resolveReferencedSubscriptionId,
  resolveScenarioMonths
} from "../lib/ai-conversation";
import {
  buildSavingsGoalPlan,
  emptyAssistantPreferences,
  isProtectionRequest,
  parseSavingsGoalAmount,
  protectSubscription,
  rankAllowedRecommendations,
  setMonthlySavingsGoal
} from "../lib/ai-preferences";
import {
  askRemoteAssistant
} from "../lib/ai-remote";
import {
  transcribeSavlivoVoice
} from "../lib/ai-voice";
import {
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState
} from "expo-audio";
import * as Speech from "expo-speech";
import { registerSavlivoPushNotifications, subscribeToSavlivoNotificationTaps } from "../src/notifications";

type Subscription = {
  id: string;
  serviceName: string;
  serviceSlug: string;
  billingProviderSlug: string;
  status: string;
  monthlyPriceMinor?: number;
  currency?: string;
  renewalDate?: string;
  planName?: string;
  statusEffectiveDate?: string;
  savedSoFarMinor?: number;
};

type Screen = "home" | "subscriptions" | "savings" | "autopilot" | "ai" | "settings" | "plans";

type AppLanguage =
  | "en"
  | "no"
  | "sv"
  | "da"
  | "de"
  | "es"
  | "fr"
  | "it"
  | "pt"
  | "nl"
  | "fi"
  | "zh-CN";

const serviceInitials: Record<string, string> = {
  netflix: "N",
  "disney-plus": "D+",
  max: "M",
  "prime-video": "P",
  "amazon-prime": "P",
  "apple-tv-plus": "A",
  "youtube-premium": "Y",

  hulu: "H",
  "paramount-plus": "P+",
  peacock: "P",
  crunchyroll: "C",

  spotify: "S",
  "apple-music": "AM",
  "amazon-music-unlimited": "AM",
  tidal: "T",
  audible: "A",

  "xbox-game-pass": "X",
  "playstation-plus": "PS",
  "ea-play": "EA",
  "ubisoft-plus": "U+",
  "geforce-now": "GFN",

  chatgpt: "AI",
  claude: "C",
  "microsoft-365": "M",
  "adobe-creative-cloud": "CC",
  canva: "C",
  dropbox: "D",
  "google-one": "G",
  "icloud-plus": "iC",

  "tencent-video": "TV",
  iqiyi: "IQ",
  "mango-tv": "MG",
  youku: "YK",
  bilibili: "B",
  "qq-music": "QQ",
  "netease-cloud-music": "NE",
  "kugou-music": "KG",
  "baidu-netdisk": "BD",
  wps: "W",

  strava: "S",
  calm: "C",
  headspace: "H"
};

const serviceBrandColors: Record<string, string> = {
  netflix: "#E50914",
  "disney-plus": "#113CCF",
  max: "#002BE7",
  "prime-video": "#00A8E1",
  "amazon-prime": "#00A8E1",
  "apple-tv-plus": "#000000",
  "youtube-premium": "#FF0000",

  hulu: "#1CE783",
  "paramount-plus": "#0064FF",
  peacock: "#111827",
  crunchyroll: "#F47521",

  spotify: "#1DB954",
  "apple-music": "#FA2D48",
  "amazon-music-unlimited": "#00A8E1",
  tidal: "#111111",
  audible: "#F8991D",

  "xbox-game-pass": "#107C10",
  "playstation-plus": "#006FCD",
  "ea-play": "#FF4747",
  "ubisoft-plus": "#0070FF",
  "geforce-now": "#76B900",

  chatgpt: "#10A37F",
  claude: "#D97757",
  "microsoft-365": "#D83B01",
  "adobe-creative-cloud": "#FF0000",
  canva: "#00C4CC",
  dropbox: "#0061FF",
  "google-one": "#4285F4",
  "icloud-plus": "#3693F3",

  strava: "#FC4C02",
  calm: "#4B6CB7",
  headspace: "#F47D31"
};



const serviceLogoAssets: Record<string, any> = {
  "amazon-music-unlimited": require("../assets/service-logos/amazon-music-unlimited.png"),
  "amazon-prime": require("../assets/service-logos/amazon-prime.png"),
  "apple-music": require("../assets/service-logos/apple-music.png"),
  "apple-tv-plus": require("../assets/service-logos/apple-tv-plus.png"),
  audible: require("../assets/service-logos/audible.png"),
  calm: require("../assets/service-logos/calm.png"),
  canva: require("../assets/service-logos/canva.png"),
  chatgpt: require("../assets/service-logos/chatgpt.png"),
  claude: require("../assets/service-logos/claude.png"),
  crunchyroll: require("../assets/service-logos/crunchyroll.png"),
  "disney-plus": require("../assets/service-logos/disney-plus.png"),
  dropbox: require("../assets/service-logos/dropbox.png"),
  "ea-play": require("../assets/service-logos/ea-play.png"),
  "google-one": require("../assets/service-logos/google-one.png"),
  headspace: require("../assets/service-logos/headspace.png"),
  hulu: require("../assets/service-logos/hulu.png"),
  "icloud-plus": require("../assets/service-logos/icloud-plus.png"),
  max: require("../assets/service-logos/max.png"),
  "microsoft-365": require("../assets/service-logos/microsoft-365.png"),
  netflix: require("../assets/service-logos/netflix.png"),
  "paramount-plus": require("../assets/service-logos/paramount-plus.png"),
  peacock: require("../assets/service-logos/peacock.png"),
  "playstation-plus": require("../assets/service-logos/playstation-plus.png"),
  "prime-video": require("../assets/service-logos/prime-video.png"),
  spotify: require("../assets/service-logos/spotify.png"),
  strava: require("../assets/service-logos/strava.png"),
  tidal: require("../assets/service-logos/tidal.png"),
  "xbox-game-pass": require("../assets/service-logos/xbox-game-pass.png"),
  "youtube-premium": require("../assets/service-logos/youtube-premium.png"),

  "tencent-video": require("../assets/service-logos/tencent-video.png"),
  iqiyi: require("../assets/service-logos/iqiyi.png"),
  "mango-tv": require("../assets/service-logos/mango-tv.png"),
  youku: require("../assets/service-logos/youku.png"),
  bilibili: require("../assets/service-logos/bilibili.png"),
  "qq-music": require("../assets/service-logos/qq-music.png"),
  "netease-cloud-music": require("../assets/service-logos/netease-cloud-music.png"),
  "kugou-music": require("../assets/service-logos/kugou-music.png"),
  "baidu-netdisk": require("../assets/service-logos/baidu-netdisk.png"),
  wps: require("../assets/service-logos/wps.png"),
};

const serviceLogoPresentation: Record<
  string,
  {
    scale?: number;
    backgroundColor?: string;
    radiusFactor?: number;
  }
> = {
  netflix: {
    scale: 0.82,
    backgroundColor: "#000000"
  },

  "disney-plus": {
    scale: 1
  },

  "paramount-plus": {
    scale: 1
  },

  "xbox-game-pass": {
    scale: 0.9
  }
};

type ServiceLogoProps = {
  serviceSlug: string;
  serviceName: string;
  size?: number;
};

function ServiceLogo({
  serviceSlug,
  serviceName,
  size = 44
}: ServiceLogoProps) {
  const initials =
    serviceInitials[serviceSlug] ??
    serviceName
      .slice(0, 2)
      .toUpperCase();

  const backgroundColor =
    serviceBrandColors[serviceSlug] ??
    "#111827";

  const logoSource =
    serviceLogoAssets[serviceSlug];

  const presentation =
    serviceLogoPresentation[serviceSlug] ?? {};

  const imageScale =
    presentation.scale ?? 1;

  const logoBackground =
    presentation.backgroundColor ??
    backgroundColor;

  const radius =
    Math.round(
      size *
        (presentation.radiusFactor ?? 0.24)
    );

  if (logoSource) {
    return (
      <View
        style={{
          width: size,
          height: size,
          borderRadius: radius,
          overflow: "hidden",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          backgroundColor: logoBackground
        }}
      >
        <Image
          source={logoSource}
          style={{
            width: size * imageScale,
            height: size * imageScale
          }}
          resizeMode="contain"
        />
      </View>
    );
  }

  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        backgroundColor,
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0
      }}
    >
      <Text
        style={{
          color: "#FFFFFF",
          fontSize: Math.max(
            10,
            Math.round(size * 0.33)
          ),
          fontWeight: "900"
        }}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.65}
      >
        {initials}
      </Text>
    </View>
  );
}


const serviceCatalog = [
  // Video
  { slug: "netflix", name: "Netflix" },
  { slug: "disney-plus", name: "Disney+" },
  { slug: "max", name: "Max" },
  { slug: "prime-video", name: "Prime Video" },
  { slug: "amazon-prime", name: "Amazon Prime" },
  { slug: "apple-tv-plus", name: "Apple TV+" },
  { slug: "youtube-premium", name: "YouTube Premium" },
  { slug: "hulu", name: "Hulu" },
  { slug: "paramount-plus", name: "Paramount+" },
  { slug: "peacock", name: "Peacock" },
  { slug: "crunchyroll", name: "Crunchyroll" },

  // Music & audio
  { slug: "spotify", name: "Spotify" },
  { slug: "apple-music", name: "Apple Music" },
  {
    slug: "amazon-music-unlimited",
    name: "Amazon Music Unlimited"
  },
  { slug: "tidal", name: "TIDAL" },
  { slug: "audible", name: "Audible" },

  // Gaming
  { slug: "xbox-game-pass", name: "Xbox Game Pass" },
  { slug: "playstation-plus", name: "PlayStation Plus" },
  { slug: "ea-play", name: "EA Play" },
  { slug: "ubisoft-plus", name: "Ubisoft+" },
  { slug: "geforce-now", name: "GeForce NOW" },

  // AI, software & cloud
  { slug: "chatgpt", name: "ChatGPT" },
  { slug: "claude", name: "Claude" },
  { slug: "microsoft-365", name: "Microsoft 365" },
  {
    slug: "adobe-creative-cloud",
    name: "Adobe Creative Cloud"
  },
  { slug: "canva", name: "Canva" },
  { slug: "dropbox", name: "Dropbox" },
  { slug: "google-one", name: "Google One" },
  { slug: "icloud-plus", name: "iCloud+" },

  // Mainland China
  { slug: "tencent-video", name: "Tencent Video / 腾讯视频" },
  { slug: "iqiyi", name: "iQIYI / 爱奇艺" },
  { slug: "mango-tv", name: "Mango TV / 芒果TV" },
  { slug: "youku", name: "Youku / 优酷" },
  { slug: "bilibili", name: "Bilibili / 哔哩哔哩" },
  { slug: "qq-music", name: "QQ Music / QQ音乐" },
  {
    slug: "netease-cloud-music",
    name: "NetEase Cloud Music / 网易云音乐"
  },
  { slug: "kugou-music", name: "KuGou Music / 酷狗音乐" },
  { slug: "baidu-netdisk", name: "Baidu Netdisk / 百度网盘" },
  { slug: "wps", name: "WPS Office" },

  // Fitness & wellness
  { slug: "strava", name: "Strava" },
  { slug: "calm", name: "Calm" },
  { slug: "headspace", name: "Headspace" }
];

const serviceCategories = [
  {
    key: "video",
    name: "Video",
    slugs: [
      "netflix",
      "disney-plus",
      "max",
      "prime-video",
      "amazon-prime",
      "apple-tv-plus",
      "youtube-premium",
      "hulu",
      "paramount-plus",
      "peacock",
      "crunchyroll",
      "tencent-video",
      "iqiyi",
      "mango-tv",
      "youku",
      "bilibili"
    ]
  },
  {
    key: "music-audio",
    name: "Music & Audio",
    slugs: [
      "spotify",
      "apple-music",
      "amazon-music-unlimited",
      "tidal",
      "audible",
      "qq-music",
      "netease-cloud-music",
      "kugou-music"
    ]
  },
  {
    key: "gaming",
    name: "Gaming",
    slugs: [
      "xbox-game-pass",
      "playstation-plus",
      "ea-play",
      "ubisoft-plus",
      "geforce-now"
    ]
  },
  {
    key: "ai-software-cloud",
    name: "AI, Software & Cloud",
    slugs: [
      "chatgpt",
      "claude",
      "microsoft-365",
      "adobe-creative-cloud",
      "canva",
      "dropbox",
      "google-one",
      "icloud-plus",
      "baidu-netdisk",
      "wps"
    ]
  },
  {
    key: "fitness-wellness",
    name: "Fitness & Wellness",
    slugs: [
      "strava",
      "calm",
      "headspace"
    ]
  }
] as const;

const billingProviders = [
  { slug: "direct", name: "Direct" },
  { slug: "apple", name: "Apple" },
  { slug: "google-play", name: "Google Play" },
  { slug: "amazon", name: "Amazon" },
  { slug: "carrier", name: "Carrier / TV provider" }
] as const;

type BillingProviderSlug =
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
const serviceBillingProviders: Record<
  string,
  readonly BillingProviderSlug[]
> = {
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

function billingProvidersForService(
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

function defaultBillingProviderForService(
  serviceSlug: string
): BillingProviderSlug {
  const available =
    billingProvidersForService(serviceSlug);

  return available[0]?.slug ?? "direct";
}

function isBillingProviderAllowed(
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

const countryCurrencyData = [
  ["US", "United States", "USD"],
  ["NO", "Norway", "NOK"],
  ["SE", "Sweden", "SEK"],
  ["DK", "Denmark", "DKK"],
  ["DE", "Germany", "EUR"],
  ["ES", "Spain", "EUR"],
  ["FR", "France", "EUR"],
  ["IT", "Italy", "EUR"],
  ["PT", "Portugal", "EUR"],
  ["NL", "Netherlands", "EUR"],
  ["BE", "Belgium", "EUR"],
  ["AT", "Austria", "EUR"],
  ["IE", "Ireland", "EUR"],
  ["FI", "Finland", "EUR"],
  ["CN", "China", "CNY"]
] as const;

const allCurrencies = Array.from(
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

function serviceAvailableInMarket(
  serviceSlug: string,
  countryCode: string
) {
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


const fxRatesFromUsd: Record<string, number> = {
  USD: 1,
  EUR: 0.92,
  GBP: 0.78,
  NOK: 10.60,
  SEK: 10.30,
  DKK: 6.90,
  CAD: 1.36,
  AUD: 1.52,
  NZD: 1.66,
  CHF: 0.87,
  JPY: 147,
  CNY: 7.15,
  INR: 83.7,
  BRL: 5.45,
  MXN: 18.7,
  PLN: 3.95,
  CZK: 23.2,
  ISK: 138,
  KRW: 1350,
  SGD: 1.34,
  ZAR: 18.1,
  AED: 3.67,
  SAR: 3.75,
  TRY: 33.7
};


export default function Home() {
  const [email, setEmail] = useState("demo@savlivo.local");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [authed, setAuthed] = useState(false);
  const [plan, setPlan] = useState("VIEWER");
  const [items, setItems] = useState<Subscription[]>([]);
  const [screen, setScreen] = useState<Screen>("home");
  const [darkMode, setDarkMode] = useState(false);
  const [actionSheet, setActionSheet] = useState<null | {
    subscription: Subscription;
    action: "PAUSE" | "CANCEL" | "REACTIVATE";
  }>(null);
  const [pendingProviderResult, setPendingProviderResult] = useState<null | {
    subscription: Subscription;
    action: "PAUSE" | "CANCEL" | "REACTIVATE";
  }>(null);
  const [statusConfirmOpen, setStatusConfirmOpen] = useState(false);
  const [statusEffectiveDateInput, setStatusEffectiveDateInput] = useState("");
  const providerWasOpenedRef = useRef(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [regionModalOpen, setRegionModalOpen] = useState(false);
  const [languageModalOpen, setLanguageModalOpen] = useState(false);
  const [renewalsSheetOpen, setRenewalsSheetOpen] = useState(false);
  const [aiInput, setAiInput] = useState("");
  const [
    aiVoiceBusy,
    setAiVoiceBusy
  ] = useState(false);

  const [
    aiVoiceSending,
    setAiVoiceSending
  ] = useState(false);

  const [
    aiSpeakingMessageIndex,
    setAiSpeakingMessageIndex
  ] = useState<number | null>(null);

  const aiAudioRecorder =
    useAudioRecorder(
      RecordingPresets.HIGH_QUALITY
    );

  const aiRecorderState =
    useAudioRecorderState(
      aiAudioRecorder
    );
  const [
    aiConversationContext,
    setAiConversationContext
  ] = useState(
    emptyAssistantConversationContext
  );
  const [
    aiPreferences,
    setAiPreferences
  ] = useState(
    emptyAssistantPreferences
  );
  const [aiMessages, setAiMessages] = useState<Array<{ role: "assistant" | "user"; text: string }>>([
    { role: "assistant", text: "Hi — I can help you set up Savlivo, troubleshoot prices and renewal dates, and decide what to keep, pause or cancel." }
  ]);
  const [aiGuidedAction, setAiGuidedAction] = useState<null | {
    subscription: Subscription;
    action: "PAUSE" | "CANCEL" | "REACTIVATE";
    stepText: string;
  }>(null);
  const aiScrollRef = useRef<ScrollView | null>(null);
  const aiInputRef = useRef<TextInput | null>(null);
  const [aiKeyboardHeight, setAiKeyboardHeight] = useState(0);
  const [countrySearch, setCountrySearch] = useState("");
  const [selectedCountryCode, setSelectedCountryCode] = useState("US");
  const [selectedCountryName, setSelectedCountryName] = useState("United States");
  const [selectedCurrency, setSelectedCurrency] = useState("USD");
  const [selectedLanguage, setSelectedLanguage] =
    useState<AppLanguage>("en");
  const [onboardingComplete, setOnboardingComplete] =
    useState(false);
  const [onboardingStep, setOnboardingStep] =
    useState<"market" | "language">("market");
  const [
    registrationOnboarding,
    setRegistrationOnboarding
  ] = useState(false);

  function regionalOverrideKey(
    serviceSlug: string,
    billingProviderSlug: string,
    planName?: string
  ) {
    return [
      selectedCountryCode,
      serviceSlug,
      billingProviderSlug,
      String(planName ?? "")
        .trim()
        .toLowerCase()
    ].join("|");
  }

  function manualRegionalPriceMinor(
    serviceSlug: string,
    billingProviderSlug: string,
    planName?: string
  ) {
    const key = regionalOverrideKey(
      serviceSlug,
      billingProviderSlug,
      planName
    );

    const value =
      manualRegionalPriceOverrides[key];

    return typeof value === "number" &&
      Number.isFinite(value) &&
      value > 0
      ? value
      : null;
  }

  function selectedCountryCurrency() {

  return (
      countryCurrencyData.find(
        ([code]) => code === selectedCountryCode
      )?.[2] ?? selectedCurrency
    );
  }


  const [pricingSnapshot, setPricingSnapshot] = useState<any | null>(null);

  const [
    manualRegionalPriceOverrides,
    setManualRegionalPriceOverrides
  ] = useState<Record<string, number>>({});
  const [preferencesHydrated, setPreferencesHydrated] = useState(false);


  useEffect(() => {
    AsyncStorage.getItem("savlivo_last_email")
      .then((savedEmail) => {
        if (savedEmail) {
          setEmail(savedEmail);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const token = await getToken();
        if (!token) return;
        await refresh();
        setScreen("home");
        setAuthed(true);
      } catch {
        await clearToken();
        setAuthed(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (!authed) return;

    const syncDeviceTimezone = async () => {
      try {
        const timezone =
          Intl.DateTimeFormat()
            .resolvedOptions()
            .timeZone || "";

        if (!timezone) return;

        await api("/v1/me", {
          method: "PATCH",
          body: JSON.stringify({
            timezone
          })
        });
      } catch (err) {
        // Timezone sync should never block normal app startup.
        console.warn(
          "Timezone sync failed",
          err
        );
      }
    };

    syncDeviceTimezone();
  }, [authed]);

  useEffect(() => {
    (async () => {
      try {
        const [
          savedTheme,
          savedCountryCode,
          savedCountryName,
          savedCurrency,
          savedLanguage,
          savedOnboardingComplete,
          savedRegionalOverrides
        ] = await Promise.all([
            AsyncStorage.getItem("savlivo_theme"),
            AsyncStorage.getItem("savlivo_country_code"),
            AsyncStorage.getItem("savlivo_country_name"),
            AsyncStorage.getItem("savlivo_currency"),
            AsyncStorage.getItem("savlivo_language"),
            AsyncStorage.getItem("savlivo_onboarding_complete"),
            AsyncStorage.getItem(
              "savlivo_manual_regional_price_overrides"
            )
          ]);

        if (savedRegionalOverrides) {
          try {
            const parsed =
              JSON.parse(savedRegionalOverrides);

            if (
              parsed &&
              typeof parsed === "object"
            ) {
              setManualRegionalPriceOverrides(
                parsed
              );
            }
          } catch {
            // Ignore invalid locally stored overrides.
          }
        }

        if (savedTheme === "dark" || savedTheme === "light") {
          setDarkMode(savedTheme === "dark");
        }

        if (
          [
            "en",
            "no",
            "sv",
            "da",
            "de",
            "es",
            "fr",
            "it",
            "pt",
            "nl",
            "fi",
            "zh-CN"
          ].includes(savedLanguage ?? "")
        ) {
          setSelectedLanguage(savedLanguage as AppLanguage);
        }

        const migratedOnboardingComplete =
          savedOnboardingComplete === "true" ||
          (
            savedOnboardingComplete === null &&
            Boolean(savedCountryCode)
          );

        setOnboardingComplete(
          migratedOnboardingComplete
        );

        if (
          savedOnboardingComplete === null &&
          savedCountryCode
        ) {
          AsyncStorage.setItem(
            "savlivo_onboarding_complete",
            "true"
          ).catch(() => {});
        }

        let resolvedCountryCode = savedCountryCode;
        let resolvedCountryName = savedCountryName;
        let resolvedCurrency = savedCurrency;

        if (!resolvedCountryCode) {
          const deviceLocale =
            Intl.DateTimeFormat().resolvedOptions().locale || "";
          const localeRegion =
            deviceLocale.match(/[-_]([A-Z]{2})\b/i)?.[1]?.toUpperCase();

          const localeCountry = localeRegion
            ? countryCurrencyData.find(([code]) => code === localeRegion)
            : undefined;

          const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
          const timeZoneMap: Record<string, string> = {
            "Europe/Oslo": "NO",
            "Europe/Stockholm": "SE",
            "Europe/Copenhagen": "DK",
            "Europe/London": "GB",
            "Europe/Berlin": "DE",
            "Europe/Paris": "FR",
            "Europe/Madrid": "ES",
            "Europe/Rome": "IT",
            "Europe/Amsterdam": "NL",
            "Europe/Helsinki": "FI",
            "Europe/Warsaw": "PL",
            "Europe/Zurich": "CH",
            "Asia/Tokyo": "JP",
            "Asia/Seoul": "KR",
            "Asia/Singapore": "SG",
            "Asia/Kolkata": "IN",
            "Australia/Sydney": "AU",
            "Australia/Melbourne": "AU",
            "Pacific/Auckland": "NZ"
          };

          const timeZoneCountryCode =
            timeZoneMap[timeZone] ||
            (timeZone.startsWith("America/Toronto") ||
            timeZone.startsWith("America/Vancouver")
              ? "CA"
              : timeZone.startsWith("America/Mexico_City")
                ? "MX"
                : timeZone.startsWith("America/Sao_Paulo")
                  ? "BR"
                  : timeZone.startsWith("America/Argentina")
                    ? "AR"
                    : timeZone.startsWith("America/New_York") ||
                        timeZone.startsWith("America/Chicago") ||
                        timeZone.startsWith("America/Denver") ||
                        timeZone.startsWith("America/Los_Angeles")
                      ? "US"
                      : "");

          const detectedCountry =
            localeCountry ||
            countryCurrencyData.find(
              ([code]) => code === timeZoneCountryCode
            ) ||
            countryCurrencyData.find(([code]) => code === "US");

          if (detectedCountry) {
            resolvedCountryCode = detectedCountry[0];
            resolvedCountryName = detectedCountry[1];
            resolvedCurrency = detectedCountry[2];

            await Promise.all([
              AsyncStorage.setItem(
                "savlivo_country_code",
                resolvedCountryCode
              ),
              AsyncStorage.setItem(
                "savlivo_country_name",
                resolvedCountryName
              ),
              AsyncStorage.setItem(
                "savlivo_currency",
                resolvedCurrency
              )
            ]);
          }
        } else {
          const savedCountry = countryCurrencyData.find(
            ([code]) => code === resolvedCountryCode
          );

          if (!resolvedCountryName && savedCountry) {
            resolvedCountryName = savedCountry[1];
          }

          if (!resolvedCurrency && savedCountry) {
            resolvedCurrency = savedCountry[2];
          }
        }

        if (resolvedCountryCode) {
          setSelectedCountryCode(resolvedCountryCode);
        }
        if (resolvedCountryName) {
          setSelectedCountryName(resolvedCountryName);
        }
        if (resolvedCurrency) {
          setSelectedCurrency(resolvedCurrency);
        }
      } catch {
        // Fall back to the built-in defaults if preferences cannot be read.
      } finally {
        setPreferencesHydrated(true);
      }
    })();
  }, []);

  useEffect(() => {
    if (
      plan !== "PREMIUM" &&
      (screen === "autopilot" || screen === "ai")
    ) {
      setScreen("home");
    }
  }, [plan, screen]);

  useEffect(() => {
    if (screen !== "ai") return;

    keepLatestAiMessageVisible(false);
  }, [aiMessages, aiGuidedAction, screen]);

  useEffect(() => {
    const showEvent =
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent =
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

    const showSub = Keyboard.addListener(showEvent, (event) => {
      setAiKeyboardHeight(event.endCoordinates.height);
      setTimeout(() => {
        keepLatestAiMessageVisible(false);
      }, 50);
    });

    const hideSub = Keyboard.addListener(hideEvent, () => {
      setAiKeyboardHeight(0);
      setTimeout(() => {
        keepLatestAiMessageVisible(false);
      }, 50);
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  useEffect(() => {
    if (!preferencesHydrated) return;

    AsyncStorage.setItem(
      "savlivo_theme",
      darkMode ? "dark" : "light"
    ).catch(() => {});
  }, [darkMode, preferencesHydrated]);

  useEffect(() => {
    if (!preferencesHydrated) return;

    AsyncStorage.setItem(
      "savlivo_manual_regional_price_overrides",
      JSON.stringify(
        manualRegionalPriceOverrides
      )
    ).catch(() => {});
  }, [
    manualRegionalPriceOverrides,
    preferencesHydrated
  ]);

  useEffect(() => {
    if (!preferencesHydrated) return;

    Promise.all([
      AsyncStorage.setItem("savlivo_country_code", selectedCountryCode),
      AsyncStorage.setItem("savlivo_country_name", selectedCountryName),
      AsyncStorage.setItem("savlivo_currency", selectedCurrency)
    ]).catch(() => {});
  }, [
    selectedCountryCode,
    selectedCountryName,
    selectedCurrency,
    preferencesHydrated
  ]);


  useEffect(() => {
    if (!preferencesHydrated) return;
    Promise.all([
      AsyncStorage.setItem("savlivo_language", selectedLanguage),
      AsyncStorage.setItem(
        "savlivo_onboarding_complete",
        onboardingComplete ? "true" : "false"
      )
    ]).catch(() => {});
  }, [
    selectedLanguage,
    onboardingComplete,
    preferencesHydrated
  ]);

  useEffect(() => {
    if (!preferencesHydrated) return;

    setPricingSnapshot(null);
    refreshRegionalPricing(
      selectedCountryCode,
      true
    ).catch(() => {});
  }, [selectedCountryCode, preferencesHydrated]);

  function convertUsdMinor(minor: number) {
    const rate = fxRatesFromUsd[selectedCurrency] ?? 1;
    return Math.round(minor * rate);
  }

  function formatMoneyFromUsdMinor(
    minor: number,
    options?: { maximumFractionDigits?: number }
  ) {
    const convertedMinor = convertUsdMinor(minor);
    const amount = convertedMinor / 100;

    try {
      return new Intl.NumberFormat(undefined, {
        style: "currency",
        currency: selectedCurrency,
        maximumFractionDigits: options?.maximumFractionDigits ?? 2
      }).format(amount);
    } catch {
      return `${selectedCurrency} ${amount.toFixed(
        options?.maximumFractionDigits ?? 2
      )}`;
    }
  }
  const [servicePickerOpen, setServicePickerOpen] = useState(false);
  const [serviceSelectionLocked, setServiceSelectionLocked] = useState(false);
  const [serviceFormOpen, setServiceFormOpen] = useState(false);
  const [editingSubscriptionId, setEditingSubscriptionId] = useState<string | null>(null);
  const editingSubscriptionIdRef = useRef<string | null>(null);
  const [serviceSlugInput, setServiceSlugInput] = useState("netflix");
  const [billingProviderInput, setBillingProviderInput] = useState("direct");
  const [subscriptionPlanInput, setSubscriptionPlanInput] = useState("");
  const [monthlyPriceInput, setMonthlyPriceInput] = useState("");
  const [renewalDateInput, setRenewalDateInput] = useState("");
  const [showRenewalDatePicker, setShowRenewalDatePicker] = useState(false);

  const theme = darkMode
    ? {
        bg: "#080C0F",
        surface: "rgba(255,255,255,0.045)",
        surfaceSoft: "rgba(255,255,255,0.065)",
        text: "#F7F9FB",
        muted: "#AAB4BE",
        border: "rgba(255,255,255,0.10)",
        pill: "rgba(255,255,255,0.065)"
      }
    : {
        bg: "#F7F8F7",
        surface: "#FFFFFF",
        surfaceSoft: "#F2F5F3",
        text: "#0C1115",
        muted: "#4B5B66",
        border: "#E2E8E4",
        pill: "#EDF1EE"
      };

  const visual = {
    green: darkMode ? "#32E58A" : "#22D978",
    greenSoft: darkMode ? "#385F4C" : "#EDF9F2",
    greenMuted: darkMode ? "#86F2B9" : "#0F9958",
    greenHero: darkMode ? "#426E58" : "#D5F4E3",
    surfaceRaised: darkMode ? "rgba(255,255,255,0.045)" : "#FFFFFF",
    surfaceInteractive: darkMode ? "rgba(255,255,255,0.065)" : "#F4F7F5",
    borderSubtle: darkMode ? "rgba(255,255,255,0.09)" : "#E6ECE8",
    borderInteractive: darkMode ? "rgba(255,255,255,0.14)" : "#D8E0DB",
    purple: darkMode ? "#9B7BFF" : "#5577E8",
    purpleSoft: darkMode ? "rgba(255,255,255,0.055)" : "#F2F5FF",
    purpleBorder: darkMode ? "rgba(255,255,255,0.10)" : "#DCE3FA",
    amber: "#F6BD42",
    amberSoft: darkMode ? "#756A50" : "#FFF8E8"
  };

  const cardShadow = darkMode
    ? {
        shadowColor: "#000000",
        shadowOffset: {
          width: 0,
          height: 10
        },
        shadowOpacity: 0.34,
        shadowRadius: 20,
        elevation: 6
      }
    : {
        shadowColor: "#18352A",
        shadowOffset: {
          width: 0,
          height: 10
        },
        shadowOpacity: 0.11,
        shadowRadius: 22,
        elevation: 5
      };

  const softShadow = darkMode
    ? {
        shadowColor: "#000000",
        shadowOffset: {
          width: 0,
          height: 6
        },
        shadowOpacity: 0.24,
        shadowRadius: 14,
        elevation: 4
      }
    : {
        shadowColor: "#18352A",
        shadowOffset: {
          width: 0,
          height: 6
        },
        shadowOpacity: 0.08,
        shadowRadius: 14,
        elevation: 3
      };

  const floatingShadow = darkMode
    ? {
        shadowColor: "#000000",
        shadowOffset: {
          width: 0,
          height: 7
        },
        shadowOpacity: 0.32,
        shadowRadius: 15,
        elevation: 6
      }
    : {
        shadowColor: "#18352A",
        shadowOffset: {
          width: 0,
          height: 8
        },
        shadowOpacity: 0.14,
        shadowRadius: 16,
        elevation: 5
      };

  useEffect(() => {
    const subscription = AppState.addEventListener(
      "change",
      (nextState) => {
        if (
          nextState === "active" &&
          providerWasOpenedRef.current &&
          pendingProviderResult
        ) {
          providerWasOpenedRef.current = false;

          const suggestedDate =
            new Date().toISOString().slice(0, 10);

          setStatusEffectiveDateInput(suggestedDate);
          setStatusConfirmOpen(true);
        }
      }
    );

    return () => subscription.remove();
  }, [pendingProviderResult]);

  useEffect(() => {
    if (!authed) return;
    registerSavlivoPushNotifications().catch(() => {
      // Notification permission or device registration can be retried later.
    });
  }, [authed]);

  useEffect(() => {
    if (!authed) return;
    return subscribeToSavlivoNotificationTaps((subscriptionId) => {
      const target = items.find((item) => item.id === subscriptionId);
      setScreen("subscriptions");
      if (target) openEditService(target);
    });
  }, [authed, items]);

  async function refresh() {
    const me = await api<{ plan: string }>("/v1/me");
    const subs = await api<{ items: Subscription[] }>("/v1/subscriptions");

    const deduped = new Map<string, Subscription>();

    for (const item of subs.items) {
      const key = `${item.serviceSlug}|${item.billingProviderSlug}`;
      const existing = deduped.get(key);

      if (!existing) {
        deduped.set(key, item);
        continue;
      }

      // Prefer the more complete record so an older demo row does not
      // replace a subscription where the user has already selected a plan.
      const existingScore =
        (existing.planName ? 2 : 0) +
        (existing.monthlyPriceMinor ? 1 : 0);
      const nextScore =
        (item.planName ? 2 : 0) +
        (item.monthlyPriceMinor ? 1 : 0);

      if (nextScore >= existingScore) {
        deduped.set(key, item);
      }
    }

    setPlan(me.plan);
    setItems([...deduped.values()]);
  }

  async function loginOrRegister(register: boolean) {
    setLoading(true);
    try {
      const result = await api<{ token: string }>(
        register ? "/v1/auth/register" : "/v1/auth/login",
        {
          method: "POST",
          body: JSON.stringify({ email, password })
        }
      );
      await setToken(result.token, register || rememberMe);
      await AsyncStorage.setItem("savlivo_last_email", email.trim());
      setScreen("home");
      setAuthed(true);

      if (register) {
        setRegistrationOnboarding(false);
      }

      await refresh();

      if (
        preferencesHydrated &&
        (onboardingComplete || register)
      ) {
        setPricingSnapshot(null);
        await refreshRegionalPricing(
          selectedCountryCode,
          true
        );
      }
    } catch (err: any) {
      Alert.alert("Savlivo", err?.body?.error ?? err.message);
    } finally {
      setLoading(false);
    }
  }

  async function logout() {
    await clearToken();
    setRememberMe(false);
    setPassword("");
    setShowPassword(false);
    setItems([]);
    setPlan("VIEWER");
    setScreen("home");
    setAuthed(false);
  }

  async function upgrade(planName: "manual" | "premium") {
    setLoading(true);
    try {
      await purchasePlan(planName);
      await refresh();
      setScreen("home");
      Alert.alert(
        "Savlivo",
        planName === "manual"
          ? "Manual is active. You control each subscription yourself."
          : "Premium is active. Autopilot recommendations are unlocked."
      );
    } catch (err: any) {
      Alert.alert("Purchase failed", err.message);
    } finally {
      setLoading(false);
    }
  }

  async function addDemoSubscriptions() {
    setLoading(true);
    try {
      const payloads = [
        {
          serviceSlug: "netflix",
          billingProviderSlug: "direct",
          monthlyPriceMinor: 1799,
          currency: "USD"
        },
        {
          serviceSlug: "max",
          billingProviderSlug: "apple",
          monthlyPriceMinor: 1299,
          currency: "USD"
        },
        {
          serviceSlug: "disney-plus",
          billingProviderSlug: "direct",
          monthlyPriceMinor: 1599,
          currency: "USD"
        }
      ];

      for (const body of payloads) {
        await api("/v1/subscriptions", {
          method: "POST",
          body: JSON.stringify(body)
        });
      }
      await refresh();
    } catch (err: any) {
      Alert.alert("Could not add subscriptions", err.message);
    } finally {
      setLoading(false);
    }
  }

  function openActionSheet(
    subscription: Subscription,
    action: "PAUSE" | "CANCEL" | "REACTIVATE"
  ) {
    setActionSheet({ subscription, action });
  }

  function getActionSheetCopy() {
    if (!actionSheet) {
      return { title: "", body: "", confirm: "Continue" };
    }

    const { subscription, action } = actionSheet;
    const actionLabel =
      action === "PAUSE"
        ? "Pause"
        : action === "CANCEL"
          ? "Cancel"
          : "Reactivate";

    const provider = subscription.billingProviderSlug;

    if (provider === "apple") {
      return {
        title: `Manage ${subscription.serviceName}`,
        body: `This subscription is billed through Apple. Savlivo will take you to Apple subscription settings to ${actionLabel.toLowerCase()} it.`,
        confirm: "Open Apple"
      };
    }

    if (provider === "google-play") {
      return {
        title: `Manage ${subscription.serviceName}`,
        body: `This subscription is billed through Google Play. Savlivo will take you to Google Play to ${actionLabel.toLowerCase()} it.`,
        confirm: "Open Google Play"
      };
    }

    if (provider === "amazon") {
      return {
        title: `Manage ${subscription.serviceName}`,
        body: `This subscription is billed through Amazon. Savlivo will take you to the correct Amazon subscription page to ${actionLabel.toLowerCase()} it.`,
        confirm: "Open Amazon"
      };
    }

    return {
      title: `${actionLabel} ${subscription.serviceName}?`,
      body: `Savlivo will help you ${actionLabel.toLowerCase()} this subscription. You can review the final provider step before anything changes.`,
      confirm: actionLabel
    };
  }

  function providerManagementFallbackUrl(
    subscription: Subscription,
    action: "PAUSE" | "CANCEL" | "REACTIVATE"
  ) {
    return getSubscriptionManagementUrl({
      serviceSlug: subscription.serviceSlug,
      billingProviderSlug:
        subscription.billingProviderSlug,
      action,
      countryCode: selectedCountryCode
    });
  }

  async function openManagementFallback(
    subscription: Subscription,
    action: "PAUSE" | "CANCEL" | "REACTIVATE"
  ) {
    const url = providerManagementFallbackUrl(subscription, action);

    if (!url) {
      return false;
    }

    return await openProviderUrl(url);
  }

  function rememberProviderRedirect(
    subscription: Subscription,
    action: "PAUSE" | "CANCEL" | "REACTIVATE"
  ) {
    setPendingProviderResult({ subscription, action });
    providerWasOpenedRef.current = true;
  }

  async function confirmProviderStatus(
    result: "PAUSED" | "CANCELLED" | "ACTIVE" | "UNCHANGED"
  ) {
    if (!pendingProviderResult) return;

    if (result === "UNCHANGED") {
      setStatusConfirmOpen(false);
      setPendingProviderResult(null);
      providerWasOpenedRef.current = false;
      return;
    }

    try {
      await api(
        `/v1/subscriptions/${pendingProviderResult.subscription.id}/status`,
        {
          method: "PATCH",
          body: JSON.stringify({
            status: result,
            effectiveDate:
              statusEffectiveDateInput ||
              new Date().toISOString().slice(0, 10)
          })
        }
      );

      await refresh();

      setSuccessMessage(
        `${pendingProviderResult.subscription.serviceName} updated to ${
          result === "ACTIVE"
            ? "active"
            : result === "PAUSED"
              ? "paused"
              : "cancelled"
        } from ${
          statusEffectiveDateInput ||
          new Date().toISOString().slice(0, 10)
        }.`
      );
      setTimeout(() => setSuccessMessage(null), 3200);
    } catch (err: any) {
      Alert.alert(
        "Savlivo",
        err?.body?.error ?? "Could not update subscription status."
      );
    } finally {
      setStatusConfirmOpen(false);
      setPendingProviderResult(null);
      providerWasOpenedRef.current = false;
    }
  }

  async function removeSubscription() {
    const targetId =
      editingSubscriptionIdRef.current ?? editingSubscriptionId;

    if (!targetId) return;

    try {
      await api(`/v1/subscriptions/${targetId}`, {
        method: "DELETE"
      });

      editingSubscriptionIdRef.current = null;
      setEditingSubscriptionId(null);
      setServiceFormOpen(false);
      await refresh();

      setSuccessMessage("Subscription removed from Savlivo.");
      setTimeout(() => setSuccessMessage(null), 2600);
    } catch (err: any) {
      Alert.alert(
        "Savlivo",
        err?.body?.error ?? "Could not remove subscription."
      );
    }
  }

  async function confirmActionSheet() {
    if (!actionSheet) return;

    const { subscription, action } = actionSheet;

    // Close the sheet before handing control to the provider.
    setActionSheet(null);

    try {
      // Restore the reliable subscription-management flow:
      //
      // 1. Open the known provider/service management destination.
      // 2. Remember which subscription/action was being managed.
      // 3. When Savlivo becomes active again, ask the user what changed.
      //
      // The backend action lifecycle must not block basic provider
      // management navigation.
      const opened = await openManagementFallback(
        subscription,
        action
      );

      if (opened) {
        rememberProviderRedirect(
          subscription,
          action
        );

        const suggestedDate =
          new Date().toISOString().slice(0, 10);

        setStatusEffectiveDateInput(
          suggestedDate
        );

        setStatusConfirmOpen(true);

        return;
      }

      // No local verified destination is known. Try the backend route as
      // a secondary source, but do not create an action merely to navigate.
      try {
        const route = await api<any>(
          `/v1/subscriptions/${subscription.id}/provider-route`
        );

        const url =
          route?.redirectUrl ??
          route?.url ??
          route?.managementUrl;

        if (url) {
          const backendOpened =
            await openProviderUrl(url);

          if (backendOpened) {
            rememberProviderRedirect(
              subscription,
              action
            );

            const suggestedDate =
              new Date().toISOString().slice(0, 10);

            setStatusEffectiveDateInput(
              suggestedDate
            );

            setStatusConfirmOpen(true);

            return;
          }
        }
      } catch {
        // Fall through to the user-facing error below.
      }

      Alert.alert(
        "Action unavailable",
        "Savlivo could not open a verified management page for this subscription."
      );
    } catch (err: any) {
      Alert.alert(
        "Savlivo",
        err?.message ??
          "Could not open the provider management page."
      );
    }
  }

  const todayDateOnly = formatDateForInput(new Date());

  function effectiveSubscriptionStatus(
    item: Subscription
  ) {
    return resolveEffectiveSubscriptionStatus({
      status: item.status,
      statusEffectiveDate: item.statusEffectiveDate,
      todayDateOnly
    });
  }

  const activeRegionalPrices = items
    .filter((item) => effectiveSubscriptionStatus(item) === "ACTIVE")
    .map((item) => selectedCountryCatalogMonthlyMinor(item));


  const totalMonthlyRegionalMinor =
    activeRegionalPrices.length === 0
      ? 0
      : activeRegionalPrices.every((value) => value != null)
        ? activeRegionalPrices.reduce(
            (sum, value) => sum + (value ?? 0),
            0
          )
        : null;

  function statusIsSavingNow(item: Subscription) {
    if (effectiveSubscriptionStatus(item) === "ACTIVE") return false;

    if (!item.statusEffectiveDate) return true;

    const effectiveAt = new Date(
      `${item.statusEffectiveDate}T00:00:00`
    ).getTime();

    if (!Number.isFinite(effectiveAt)) return true;

    return effectiveAt <= Date.now();
  }

  const savingNowRegionalPrices = items
    .filter(statusIsSavingNow)
    .map((item) => selectedCountryCatalogMonthlyMinor(item));

  const currentMonthlySavingsRegionalMinor =
    savingNowRegionalPrices.length === 0
      ? 0
      : savingNowRegionalPrices.every((value) => value != null)
        ? savingNowRegionalPrices.reduce(
            (sum, value) => sum + (value ?? 0),
            0
          )
        : null;

  const currentYearlySavingsRegionalMinor =
    currentMonthlySavingsRegionalMinor != null
      ? currentMonthlySavingsRegionalMinor * 12
      : null;

  const savedSoFarRegionalMinor = items.reduce(
    (sum, item) =>
      sum +
      (
        typeof item.savedSoFarMinor === "number" &&
        Number.isFinite(item.savedSoFarMinor)
          ? item.savedSoFarMinor
          : 0
      ),
    0
  );

  const annualizedReviewableSpendRegionalMinor = items
    .filter(
      (item) => effectiveSubscriptionStatus(item) === "ACTIVE"
    )
    .reduce((sum, item) => {
      const monthly = billedMonthlyMinor(item);
      return sum + (monthly ?? 0) * 12;
    }, 0);


  const currentMonthlySpendRegionalMinor = items
    .filter(
      (item) => effectiveSubscriptionStatus(item) === "ACTIVE"
    )
    .reduce((sum, item) => {
      const monthly = billedMonthlyMinor(item);
      return sum + (monthly ?? 0);
    }, 0);

  const currentAnnualSpendRegionalMinor =
    currentMonthlySpendRegionalMinor * 12;

  const savingsTabPotentialThreeMonthRegionalMinor =
    totalMonthlyRegionalMinor != null
      ? totalMonthlyRegionalMinor * 3
      : null;

  const activeItems = items.filter(
    (item) => effectiveSubscriptionStatus(item) === "ACTIVE"
  );

  const recommendationCandidates = [...activeItems]
    .sort(
      (a, b) =>
        (billedMonthlyMinor(b) ?? 0) -
        (billedMonthlyMinor(a) ?? 0)
    )
    .slice(0, 2);

  const activeCount = items.filter(
    (item) => effectiveSubscriptionStatus(item) === "ACTIVE"
  ).length;

  const nextRenewal = [...items]
    .filter(
      (item) =>
        effectiveSubscriptionStatus(item) === "ACTIVE" &&
        Boolean(item.renewalDate) &&
        normalizeDateOnly(item.renewalDate) >= todayDateOnly &&
        willSubscriptionRenewOn({
          status: item.status,
          statusEffectiveDate: item.statusEffectiveDate,
          renewalDate: item.renewalDate
        })
    )
    .sort((a, b) =>
      normalizeDateOnly(a.renewalDate).localeCompare(
        normalizeDateOnly(b.renewalDate)
      )
    )[0];

  const nextRenewalDisplay = nextRenewal?.renewalDate
    ? `${nextRenewal.serviceName} · ${formatRenewalDateDisplay(
        nextRenewal.renewalDate
      )}`
    : "Renewal date not set";

  const upcomingRenewals = [...items]
    .filter(
      (item) =>
        effectiveSubscriptionStatus(item) === "ACTIVE" &&
        Boolean(item.renewalDate) &&
        normalizeDateOnly(item.renewalDate) >= todayDateOnly &&
        willSubscriptionRenewOn({
          status: item.status,
          statusEffectiveDate: item.statusEffectiveDate,
          renewalDate: item.renewalDate
        })
    )
    .sort((a, b) =>
      normalizeDateOnly(a.renewalDate).localeCompare(
        normalizeDateOnly(b.renewalDate)
      )
    );

  const premiumRecommendations = [...items]
    .map((item) => ({
      item,
      monthly: selectedCountryCatalogMonthlyMinor(item) ?? 0
    }))
    .sort((a, b) => b.monthly - a.monthly);

  const premiumKeep = premiumRecommendations
    .filter(({ item }) => effectiveSubscriptionStatus(item) === "ACTIVE")
    .sort((a, b) => a.monthly - b.monthly)
    .slice(0, 2);

  const premiumPause = premiumRecommendations.find(
    ({ item }) => effectiveSubscriptionStatus(item) === "ACTIVE"
  );

  const premiumLeaveOff = premiumRecommendations.find(
    ({ item }) =>
      effectiveSubscriptionStatus(item) === "CANCELLED" ||
      effectiveSubscriptionStatus(item) === "PAUSED"
  );

  const dataHealthIssue = items
    .map((item) => {
      const missing: string[] = [];
      if (!item.renewalDate) {
        missing.push("renewal date");
      } else if (
        needsRenewalDateRefresh({
          status: item.status,
          statusEffectiveDate: item.statusEffectiveDate,
          renewalDate: item.renewalDate,
          todayDateOnly
        })
      ) {
        missing.push("updated renewal date");
      }
      if (!item.billingProviderSlug) missing.push("billing route");
      if (!item.monthlyPriceMinor || item.monthlyPriceMinor <= 0) missing.push("price");
      if (!item.status) missing.push("status");
      return missing.length ? { item, missing } : null;
    })
    .find(Boolean) as { item: Subscription; missing: string[] } | undefined;

  const attentionItems = [
    dataHealthIssue
      ? {
          key: `data-health-${dataHealthIssue.item.id}`,
          title: `${dataHealthIssue.item.serviceName} needs more information`,
          detail: `Missing ${dataHealthIssue.missing.join(", ")}. Fix this so reminders and recommendations stay accurate.`,
          action: "Fix now" as const,
          subscription: dataHealthIssue.item,
          fixData: true
        }
      : null,
    nextRenewal
      ? {
          key: "renewal",
          title: `${nextRenewal.serviceName} renews soon`,
          detail: nextRenewal.renewalDate
            ? `Renews ${nextRenewal.renewalDate}`
            : "Renewal date available",
          action: "Review" as const,
          subscription: nextRenewal
        }
      : null,
    items.find((item) => effectiveSubscriptionStatus(item) === "PAUSED")
      ? (() => {
          const item = items.find(
            (entry) => effectiveSubscriptionStatus(entry) === "PAUSED"
          )!;
          return {
            key: "paused",
            title: `${item.serviceName} is paused`,
            detail: "You are not currently paying for this service.",
            action: "Manage" as const,
            subscription: item
          };
        })()
      : null,
    recommendationCandidates[0]
      ? {
          key: "saving",
          title: `Review ${recommendationCandidates[0].serviceName}`,
          detail: `3-month spend: ${formatRegionalAggregate(
            (selectedCountryCatalogMonthlyMinor(
              recommendationCandidates[0]
            ) ?? 0) * 3
          )}`,
          action: "Review" as const,
          subscription: recommendationCandidates[0]
        }
      : null
  ].filter(Boolean) as Array<{
    key: string;
    title: string;
    detail: string;
    action: "Review" | "Manage" | "Fix now";
    subscription: Subscription;
    fixData?: boolean;
  }>;

  if (
    !authed &&
    preferencesHydrated &&
    registrationOnboarding
  ) {
    const localLanguagesByMarket: Partial<
      Record<
        string,
        Array<{
          code: AppLanguage;
          label: string;
          detail: string;
        }>
      >
    > = {
      NO: [{ code: "no", label: "Norsk", detail: "Norwegian" }],
      SE: [{ code: "sv", label: "Svenska", detail: "Swedish" }],
      DK: [{ code: "da", label: "Dansk", detail: "Danish" }],
      DE: [{ code: "de", label: "Deutsch", detail: "German" }],
      AT: [{ code: "de", label: "Deutsch", detail: "German" }],
      ES: [{ code: "es", label: "Español", detail: "Spanish" }],
      FR: [{ code: "fr", label: "Français", detail: "French" }],
      IT: [{ code: "it", label: "Italiano", detail: "Italian" }],
      PT: [{ code: "pt", label: "Português", detail: "Portuguese" }],
      NL: [{ code: "nl", label: "Nederlands", detail: "Dutch" }],
      BE: [
        { code: "nl", label: "Nederlands", detail: "Dutch" },
        { code: "fr", label: "Français", detail: "French" }
      ],
      FI: [{ code: "fi", label: "Suomi", detail: "Finnish" }],
      CN: [
        {
          code: "zh-CN",
          label: "简体中文",
          detail: "Simplified Chinese"
        }
      ]
    };

    const languageOptions: Array<{
      code: AppLanguage;
      label: string;
      detail: string;
    }> = [
      {
        code: "en",
        label: "English",
        detail: "English"
      },
      ...(localLanguagesByMarket[selectedCountryCode] ?? [])
    ];

    if (onboardingStep === "language") {
      return (
        <SafeAreaView
          style={[
            styles.screen,
            { backgroundColor: theme.bg }
          ]}
        >
          <StatusBar
            style={darkMode ? "light" : "dark"}
            backgroundColor={theme.bg}
          />

          <View style={styles.authCard}>
            <Text
              style={[
                styles.brand,
                { color: theme.text }
              ]}
            >
              Savlivo
            </Text>

            <Text
              style={[
                styles.sectionTitle,
                {
                  color: theme.text,
                  textAlign: "center",
                  marginBottom: 8
                }
              ]}
            >
              Choose your language
            </Text>

            <Text
              style={[
                styles.formHint,
                {
                  color: theme.muted,
                  textAlign: "center",
                  marginBottom: 20
                }
              ]}
            >
              You can change this later in Settings.
            </Text>

            {languageOptions.map((option) => {
              const selected =
                selectedLanguage === option.code;

              return (
                <Pressable
                  key={option.code}
                  style={[
                    styles.secondary,
                    {
                      backgroundColor: selected
                        ? visual.greenSoft
                        : darkMode
                          ? "#11171C"
                          : "#FFFFFF",
                      borderColor: selected
                        ? visual.greenMuted
                        : theme.border,
                      marginBottom: 10
                    }
                  ]}
                  onPress={() =>
                    setSelectedLanguage(option.code)
                  }
                >
                  <View
                    style={{
                      flex: 1,
                      alignItems: "flex-start"
                    }}
                  >
                    <Text
                      style={[
                        styles.secondaryText,
                        {
                          color: selected
                            ? visual.greenMuted
                            : theme.text
                        }
                      ]}
                    >
                      {option.label}
                    </Text>

                    <Text
                      style={[
                        styles.formHint,
                        {
                          color: theme.muted,
                          marginTop: 2
                        }
                      ]}
                    >
                      {option.detail}
                    </Text>
                  </View>

                  {selected ? (
                    <Ionicons
                      name="checkmark-circle"
                      size={22}
                      color={visual.greenMuted}
                    />
                  ) : null}
                </Pressable>
              );
            })}

            <Pressable
              style={[
                styles.primary,
                { marginTop: 12 }
              ]}
              onPress={async () => {
                setOnboardingComplete(true);
                await loginOrRegister(true);
              }}
              disabled={loading}
            >
              <Text style={styles.primaryText}>
                Create my account
              </Text>
            </Pressable>
          </View>
        </SafeAreaView>
      );
    }

    return (
      <SafeAreaView
        style={[
          styles.screen,
          { backgroundColor: theme.bg }
        ]}
      >
        <StatusBar
          style={darkMode ? "light" : "dark"}
          backgroundColor={theme.bg}
        />

        <View
          style={[
            styles.authCard,
            {
              maxHeight: "92%",
              width: "92%"
            }
          ]}
        >
          <Text
            style={[
              styles.brand,
              { color: theme.text }
            ]}
          >
            Savlivo
          </Text>

          <Text
            style={[
              styles.sectionTitle,
              {
                color: theme.text,
                textAlign: "center",
                marginBottom: 8
              }
            ]}
          >
            Choose your subscription market
          </Text>

          <Text
            style={[
              styles.formHint,
              {
                color: theme.muted,
                textAlign: "center",
                marginBottom: 16
              }
            ]}
          >
            This controls which services, plans and local prices Savlivo shows you.
          </Text>

          <ScrollView
            style={{
              width: "100%",
              maxHeight: 390
            }}
            contentContainerStyle={{
              paddingBottom: 6
            }}
            showsVerticalScrollIndicator={false}
          >
            {countryCurrencyData.map(
              ([code, name, currency]) => {
                const selected =
                  selectedCountryCode === code;

                return (
                  <Pressable
                    key={code}
                    style={[
                      styles.secondary,
                      {
                        backgroundColor: selected
                          ? visual.greenSoft
                          : darkMode
                            ? "#11171C"
                            : "#FFFFFF",
                        borderColor: selected
                          ? visual.greenMuted
                          : theme.border,
                        marginBottom: 10
                      }
                    ]}
                    onPress={() =>
                      selectCountry(
                        code,
                        name,
                        currency
                      )
                    }
                  >
                    <View
                      style={{
                        flex: 1,
                        alignItems: "flex-start"
                      }}
                    >
                      <Text
                        style={[
                          styles.secondaryText,
                          {
                            color: selected
                              ? visual.greenMuted
                              : theme.text
                          }
                        ]}
                      >
                        {name}
                      </Text>

                      <Text
                        style={[
                          styles.formHint,
                          {
                            color: theme.muted,
                            marginTop: 2
                          }
                        ]}
                      >
                        {code} · {currency}
                      </Text>
                    </View>

                    {selected ? (
                      <Ionicons
                        name="checkmark-circle"
                        size={22}
                        color={visual.greenMuted}
                      />
                    ) : null}
                  </Pressable>
                );
              }
            )}
          </ScrollView>

          <Pressable
            style={[
              styles.primary,
              { marginTop: 12 }
            ]}
            onPress={() => {
              const availableLanguages: AppLanguage[] = [
                "en",
                ...(
                  localLanguagesByMarket[selectedCountryCode] ?? []
                ).map((option) => option.code)
              ];

              if (
                !availableLanguages.includes(selectedLanguage)
              ) {
                setSelectedLanguage("en");
              }

              setOnboardingStep("language");
            }}
          >
            <Text style={styles.primaryText}>
              Continue
            </Text>
          </Pressable>


        </View>
      </SafeAreaView>
    );
  }

  if (!authed) {
    return (
      <SafeAreaView style={[styles.screen, { backgroundColor: theme.bg }]}>
        <StatusBar style={darkMode ? "light" : "dark"} backgroundColor={theme.bg} />
        <View style={styles.authCard}>
          <Text style={[styles.brand, { color: theme.text }]}>Savlivo</Text>
          <Text style={[styles.tagline, { color: theme.muted }]}>Watch more. Pay less.</Text>

          <TextInput
            style={[
              styles.input,
              {
                backgroundColor: darkMode
                  ? "#11171C"
                  : "#FFFFFF",
                borderColor: theme.border,
                color: theme.text
              }
            ]}
            placeholderTextColor={theme.muted}
            autoCapitalize="none"
            value={email}
            onChangeText={setEmail}
            placeholder="Email"
          />

          <View style={styles.passwordInputWrap}>
            <TextInput
              style={[
                styles.input,
                styles.passwordInput,
                {
                  backgroundColor: darkMode
                    ? "#11171C"
                    : "#FFFFFF",
                  borderColor: theme.border,
                  color: theme.text
                }
              ]}
              placeholderTextColor={theme.muted}
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              placeholder="Password"
            />
            <Pressable
              style={styles.passwordVisibilityButton}
              onPress={() =>
                setShowPassword((value) => !value)
              }
              accessibilityRole="button"
              accessibilityLabel={
                showPassword
                  ? "Hide password"
                  : "Show password"
              }
            >
              <Ionicons
                name={
                  showPassword
                    ? "eye-off-outline"
                    : "eye-outline"
                }
                size={22}
                color={theme.muted}
              />
            </Pressable>
          </View>
          <Pressable
            style={styles.rememberMeRow}
            onPress={() => setRememberMe((value) => !value)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: rememberMe }}
          >
            <View
              style={[
                styles.rememberMeBox,
                {
                  borderColor: rememberMe
                    ? visual.green
                    : theme.border,
                  backgroundColor: rememberMe
                    ? visual.green
                    : "transparent"
                }
              ]}
            >
              {rememberMe ? (
                <Ionicons
                  name="checkmark"
                  size={15}
                  color="#FFFFFF"
                />
              ) : null}
            </View>
            <Text
              style={[
                styles.rememberMeText,
                { color: theme.text }
              ]}
            >
              Remember me
            </Text>
          </Pressable>


          <Pressable
            style={styles.primary}
            onPress={() => loginOrRegister(false)}
            disabled={loading}
          >
            <Text style={styles.primaryText}>Log in</Text>
          </Pressable>

          <Pressable
            style={[
              styles.secondary,
              {
                backgroundColor: darkMode
                  ? "#11171C"
                  : "#FFFFFF",
                borderColor: theme.border
              }
            ]}
            onPress={() => {
              setOnboardingStep("market");
              setRegistrationOnboarding(true);
            }}
            disabled={loading}
          >
            <Text style={[styles.secondaryText, { color: theme.text }]}>
              Create account
            </Text>
          </Pressable>

          {loading ? <ActivityIndicator style={{ marginTop: 16 }} /> : null}
        </View>
      </SafeAreaView>
    );
  }

  function keepLatestAiMessageVisible(animated = true) {
    requestAnimationFrame(() => {
      aiScrollRef.current?.scrollToEnd({ animated });
    });
  }

  function aiFindSubscription(question: string) {
    const normalize = (value: string) =>
      value
        .toLowerCase()
        .replace("+", " plus ")
        .replace(/[^a-z0-9 ]/g, " ")
        .replace(/\s+/g, " ")
        .trim();

    const levenshtein = (a: string, b: string) => {
      const rows = a.length + 1;
      const cols = b.length + 1;
      const matrix = Array.from({ length: rows }, () =>
        Array(cols).fill(0)
      );

      for (let i = 0; i < rows; i++) matrix[i][0] = i;
      for (let j = 0; j < cols; j++) matrix[0][j] = j;

      for (let i = 1; i < rows; i++) {
        for (let j = 1; j < cols; j++) {
          matrix[i][j] = Math.min(
            matrix[i - 1][j] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j - 1] +
              (a[i - 1] === b[j - 1] ? 0 : 1)
          );
        }
      }

      return matrix[a.length][b.length];
    };

    const serviceAliases = (item: Subscription) => {
      const normalizedName = normalize(item.serviceName);
      const aliases = new Set<string>([
        normalizedName,
        normalize(String(item.serviceSlug ?? "")),
        normalize(item.serviceName.replace("+", " plus"))
      ]);

      if (normalizedName.includes("youtube")) {
        aliases.add("youtube");
        aliases.add("youtube premium");
        aliases.add("yt");
        aliases.add("youtbe");
        aliases.add("yutube");
        aliases.add("you tube");
      }

      if (normalizedName.includes("prime")) {
        aliases.add("prime");
        aliases.add("prime video");
        aliases.add("amazon");
        aliases.add("amazon prime");
        aliases.add("amazon video");
        aliases.add("amazn");
        aliases.add("amzon");
        aliases.add("amason");
      }

      if (normalizedName.includes("apple tv")) {
        aliases.add("apple");
        aliases.add("apple tv");
        aliases.add("apple tv plus");
        aliases.add("appletv");
        aliases.add("appletvplus");
      }

      if (normalizedName.includes("disney")) {
        aliases.add("disney");
        aliases.add("disney plus");
        aliases.add("disny");
        aliases.add("diseny");
      }

      if (normalizedName.includes("netflix")) {
        aliases.add("netflix");
        aliases.add("netflx");
        aliases.add("netfix");
        aliases.add("netfli");
      }

      if (normalizedName === "max") {
        aliases.add("max");
        aliases.add("hbo max");
        aliases.add("hbomax");
        aliases.add("hbo");
      }

      return [...aliases].filter(Boolean);
    };

    const normalizedQuestion = normalize(question);
    const questionWords = normalizedQuestion
      .split(" ")
      .filter(Boolean);

    let bestItem: Subscription | undefined;
    let bestScore = Number.POSITIVE_INFINITY;

    for (const item of items) {
      for (const alias of serviceAliases(item)) {
        const aliasWords = alias.split(" ").filter(Boolean);

        if (
          aliasWords.length &&
          aliasWords.every((word) =>
            questionWords.includes(word)
          )
        ) {
          return item;
        }

        for (const word of questionWords) {
          const aliasCandidates = [
            alias,
            ...alias.split(" ").filter(Boolean)
          ];

          for (const candidate of aliasCandidates) {
            const score = levenshtein(word, candidate);
            const threshold =
              candidate.length <= 4
                ? 1
                : candidate.length <= 7
                  ? 2
                  : 3;

            if (score <= threshold && score < bestScore) {
              bestItem = item;
              bestScore = score;
            }
          }
        }
      }
    }

    return bestItem;
  }

  function beginAiGuidedAction(
    subscription: Subscription,
    action: "PAUSE" | "CANCEL" | "REACTIVATE"
  ) {
    setAiGuidedAction({
      subscription,
      action,
      stepText:
        action === "CANCEL"
          ? "Savlivo will open the correct provider management page. Complete the cancellation there, then return to Savlivo and confirm the result and effective date."
          : action === "PAUSE"
            ? "Savlivo will open the correct provider management page. Complete the pause there, then return to Savlivo and confirm the result and effective date."
            : "Savlivo will open the correct provider management page. Reactivate or renew there, then return to Savlivo and confirm the result and effective date."
    });
  }

  async function openAiGuidedAction() {
    if (!aiGuidedAction) return;

    const { subscription, action } = aiGuidedAction;
    const currentStatus = effectiveSubscriptionStatus(subscription);

    if (action === "PAUSE" && currentStatus === "PAUSED") {
      setAiMessages((current) => [
        ...current,
        {
          role: "assistant",
          text: `${subscription.serviceName} is already paused. You can reactivate it or cancel it instead.`
        }
      ]);
      setAiGuidedAction(null);
      return;
    }

    if (action === "REACTIVATE" && currentStatus === "ACTIVE") {
      setAiMessages((current) => [
        ...current,
        {
          role: "assistant",
          text: `${subscription.serviceName} is already active.`
        }
      ]);
      setAiGuidedAction(null);
      return;
    }

    const destination = providerManagementFallbackUrl(
      subscription,
      action
    );

    if (!destination) {
      setAiMessages((current) => [
        ...current,
        {
          role: "assistant",
          text:
            `${subscription.serviceName} is managed through a carrier or TV provider, ` +
            "and Savlivo does not have a verified account URL for that billing route yet. " +
            "Open your carrier/provider account, make the change there, then return to Savlivo and update the result."
        }
      ]);
      setAiGuidedAction(null);
      return;
    }

    const opened = await openProviderUrl(destination);

    if (!opened) {
      Alert.alert(
        "Could not open provider",
        `Savlivo could not open ${subscription.serviceName} management.`
      );
      return;
    }

    rememberProviderRedirect(subscription, action);

    setAiMessages((current) => [
      ...current,
      {
        role: "assistant",
        text:
          `${subscription.serviceName} management is open. Complete the ${
            action === "CANCEL"
              ? "cancellation"
              : action === "PAUSE"
                ? "pause"
                : "reactivation"
          } there. When you return, Savlivo will ask what happened and the effective date.`
      }
    ]);

    setAiGuidedAction(null);
  }

  function detectSpeechLanguage(
    value: string
  ) {
    const text =
      value.toLowerCase();

    if (
      /[æøå]/.test(text) ||
      /\b(ikke|jeg|deg|kan|hva|hvordan|abonnement|fornyer|sparing)\b/.test(text)
    ) {
      return "nb-NO";
    }

    if (
      /[äöüß]/.test(text) ||
      /\b(ich|du|nicht|was|wie|kann|abonnement|erklären|macht)\b/.test(text)
    ) {
      return "de-DE";
    }

    if (
      /[áéíóúñ¿¡]/.test(text) ||
      /\b(que|qué|como|cómo|puedes|suscripción|ahorro)\b/.test(text)
    ) {
      return "es-ES";
    }

    if (
      /[àâçéèêëîïôûùüÿœ]/.test(text) ||
      /\b(je|vous|pas|comment|abonnement|économie)\b/.test(text)
    ) {
      return "fr-FR";
    }

    if (
      /\b(io|non|come|puoi|abbonamento|risparmio)\b/.test(text)
    ) {
      return "it-IT";
    }

    if (
      /\b(não|como|você|assinatura|poupança)\b/.test(text)
    ) {
      return "pt-PT";
    }

    return "en-US";
  }

  async function logAvailableSpeechVoices() {
    try {
      const voices =
        await Speech.getAvailableVoicesAsync();

      console.log(
        "SAVLIVO SPEECH VOICES",
        voices.map((voice) => ({
          identifier: voice.identifier,
          name: voice.name,
          language: voice.language,
          quality: voice.quality
        }))
      );
    } catch (err) {
      console.error(
        "speech voice listing failed",
        err
      );
    }
  }

  async function stopAiSpeech() {
    try {
      await Speech.stop();
    } finally {
      setAiSpeakingMessageIndex(null);
    }
  }

  async function speakAiMessage(
    text: string,
    index: number
  ) {
    void logAvailableSpeechVoices();
    try {
      await Speech.stop();

      setAiSpeakingMessageIndex(
        index
      );

      Speech.speak(
        text,
        {
          language:
            detectSpeechLanguage(
              text
            ),
          rate: 0.95,
          pitch: 1.0,
          onDone: () => {
            setAiSpeakingMessageIndex(
              null
            );
          },
          onStopped: () => {
            setAiSpeakingMessageIndex(
              null
            );
          },
          onError: () => {
            setAiSpeakingMessageIndex(
              null
            );
          }
        }
      );
    } catch (err) {
      console.error(
        "Savlivo speech failed",
        err
      );

      setAiSpeakingMessageIndex(
        null
      );

      Alert.alert(
        "Could not play reply",
        "Please try again."
      );
    }
  }

  async function startAiVoiceRecording() {
    try {
      const permission =
        await AudioModule
          .requestRecordingPermissionsAsync();

      if (!permission.granted) {
        Alert.alert(
          "Microphone access",
          "Savlivo needs microphone permission so you can dictate a message."
        );
        return;
      }

      Keyboard.dismiss();

      await setAudioModeAsync({
        playsInSilentMode: true,
        allowsRecording: true
      });

      await aiAudioRecorder
        .prepareToRecordAsync();

      aiAudioRecorder.record();
    } catch (err: any) {
      console.error(
        "voice recording start failed",
        err
      );

      Alert.alert(
        "Could not start microphone",
        err?.message ??
          "Please try again."
      );
    }
  }

  async function stopAiVoiceRecording() {
    if (
      !aiRecorderState.isRecording
    ) {
      return;
    }

    setAiVoiceBusy(true);

    try {
      await aiAudioRecorder.stop();

      await setAudioModeAsync({
        playsInSilentMode: true,
        allowsRecording: false
      });

      const uri =
        aiAudioRecorder.uri;

      if (!uri) {
        throw new Error(
          "VOICE_RECORDING_MISSING"
        );
      }

      const transcript =
        await transcribeSavlivoVoice(
          uri
        );

      if (!transcript) {
        throw new Error(
          "EMPTY_TRANSCRIPTION"
        );
      }

      setAiInput(transcript);

      setAiVoiceSending(true);

      await askSavlivo(
        transcript
      );
    } catch (err: any) {
      console.error(
        "voice transcription failed",
        err
      );

      Alert.alert(
        "Could not understand recording",
        err?.body?.error ??
          err?.message ??
          "Please try again."
      );
    } finally {
      setAiVoiceSending(false);
      setAiVoiceBusy(false);
    }
  }

  async function askSavlivo(
    questionOverride?: unknown
  ) {
    const question =
      (
        typeof questionOverride === "string"
          ? questionOverride
          : aiInput
      ).trim();

    if (!question) return;

    const q = question.toLowerCase();
    const subscriptionIntent =
      classifySubscriptionIntent(question);

    setAiGuidedAction(null);

    let answer =
      "I can help with your subscriptions, spending, savings, renewals, app features and subscription decisions.";

    const reasoningItems = items.map((item) => {
      const issues: string[] = [];

      if (!item.renewalDate) {
        issues.push("renewal date");
      } else if (
        needsRenewalDateRefresh({
          status: item.status,
          statusEffectiveDate: item.statusEffectiveDate,
          renewalDate: item.renewalDate,
          todayDateOnly
        })
      ) {
        issues.push("updated renewal date");
      }

      if (!item.billingProviderSlug) {
        issues.push("billing route");
      }

      if (
        typeof item.monthlyPriceMinor !== "number" ||
        item.monthlyPriceMinor <= 0
      ) {
        issues.push("price");
      }

      if (!item.status) {
        issues.push("status");
      }

      return {
        id: item.id,
        serviceName: item.serviceName,
        status: effectiveSubscriptionStatus(item),
        monthlyMinor: billedMonthlyMinor(item),
        renewalDate: item.renewalDate,
        dataIssues: issues
      };
    });

    const explicitScenarioMonths =
      parseScenarioMonths(question);

    const scenarioMonths =
      resolveScenarioMonths(
        explicitScenarioMonths,
        aiConversationContext
      );

    const resolvedEntities =
      resolveSubscriptionEntities(
        question,
        items
      );

    const explicitlyNamedSubscriptions =
      resolvedEntities.map(
        (result) => result.item
      );

    const referencedSubscriptionId =
      resolveReferencedSubscriptionId(
        question,
        aiConversationContext
      );

    const contextualSubscription =
      referencedSubscriptionId
        ? items.find(
            (item) =>
              item.id ===
              referencedSubscriptionId
          )
        : undefined;

    const namedReasoningSubscription =
      explicitlyNamedSubscriptions[0] ??
      contextualSubscription ??
      aiFindSubscription(question);

    const requestedSavingsGoalMinor =
      parseSavingsGoalAmount(question);

    const protectionRequest =
      isProtectionRequest(question);

    const wantsSavingsGoalPlan =
      q.includes("what should i change") ||
      q.includes("what should i cut") ||
      q.includes("what can i cut") ||
      q.includes("reach my goal") ||
      q.includes("hit my goal") ||
      q.includes("savings plan") ||
      q.includes("build me a plan") ||
      q.includes("make me a plan");

    const scenarioFollowUp =
      aiConversationContext.lastTopic ===
        "scenario" &&
      isScenarioFollowUp(question);

    const wantsScenario =
      scenarioMonths != null &&
      (
        q.includes("what if") ||
        q.includes("would i save") ||
        q.includes("would i spend") ||
        q.includes("if i pause") ||
        q.includes("if i cancel") ||
        q.includes("pause") ||
        q.includes("cancel") ||
        scenarioFollowUp
      );

    const wantsRanking =
      q.includes("most expensive") ||
      q.includes("highest cost") ||
      q.includes("cost the most") ||
      q.includes("top subscription") ||
      q.includes("biggest subscription");

    const wantsRecommendationExplanation =
      q.includes("review first") ||
      q.includes("recommend") ||
      q.includes("why") &&
        (
          q.includes("review") ||
          q.includes("autopilot")
        );

    const wantsComparison =
      q.includes("compare") ||
      q.includes("which costs more") ||
      q.includes("more expensive") ||
      q.includes("which is cheaper") ||
      (
        aiConversationContext.lastTopic ===
          "comparison" &&
        isComparisonFollowUp(question)
      );

    const wantsDataHealth =
      q.includes("data health") ||
      q.includes("missing information") ||
      q.includes("needs information") ||
      q.includes("wrong data") ||
      q.includes("stale");

    if (
      protectionRequest
    ) {
      const protectedTarget =
        explicitlyNamedSubscriptions[0] ??
        contextualSubscription ??
        aiFindSubscription(question);

      if (protectedTarget) {
        setAiPreferences(
          (current) =>
            protectSubscription(
              current,
              protectedTarget.id
            )
        );

        setAiConversationContext(
          (current) =>
            rememberSubscription(
              current,
              protectedTarget.id,
              "recommendation"
            )
        );

        answer =
          `Got it. I'll treat ${protectedTarget.serviceName} as protected when I suggest savings opportunities. I won't include it in cost-cutting recommendations unless you change that preference.`;
      } else {
        answer =
          "I can protect a subscription from savings recommendations. Tell me which service you want me to keep, for example “never recommend cancelling Spotify”.";
      }
    } else if (
      requestedSavingsGoalMinor != null
    ) {
      const nextPreferences =
        setMonthlySavingsGoal(
          aiPreferences,
          requestedSavingsGoalMinor
        );

      setAiPreferences(
        nextPreferences
      );

      const goalPlan =
        buildSavingsGoalPlan(
          reasoningItems,
          nextPreferences
        );

      if (
        goalPlan &&
        goalPlan.selected.length
      ) {
        const selectedCopy =
          goalPlan.selected
            .map(
              (item) =>
                `${item.serviceName} (${formatFinancialAggregate(
                  item.monthlyMinor ?? 0
                )}/month)`
            )
            .join(", ");

        answer =
          `Your savings target is ${formatFinancialAggregate(
            requestedSavingsGoalMinor
          )} per month. Based only on current subscription costs and your protected services, reviewing ${selectedCopy} would represent about ${formatFinancialAggregate(
            goalPlan.monthlyReductionMinor
          )} per month of modeled reduction. ${
            goalPlan.reachesGoal
              ? "That is enough to reach the target."
              : "That does not fully reach the target with the eligible subscriptions I can currently see."
          } This is a cost-based plan, not a recommendation that you must cancel those services.`;
      } else {
        answer =
          `I've set your savings target to ${formatFinancialAggregate(
            requestedSavingsGoalMinor
          )} per month. I don't currently have enough eligible active subscription cost data to build a useful plan yet.`;
      }
    } else if (
      wantsSavingsGoalPlan
    ) {
      const goalPlan =
        buildSavingsGoalPlan(
          reasoningItems,
          aiPreferences
        );

      if (
        aiPreferences.monthlySavingsGoalMinor == null
      ) {
        answer =
          "Tell me your monthly savings target first, for example “I want to save kr 500 a month”. Then I can build a plan around it.";
      } else if (
        !goalPlan ||
        !goalPlan.selected.length
      ) {
        answer =
          "I have your savings goal, but I don't currently see eligible active subscriptions with enough usable pricing data to build a plan.";
      } else {
        const selectedCopy =
          goalPlan.selected
            .map(
              (item) =>
                `${item.serviceName} (${formatFinancialAggregate(
                  item.monthlyMinor ?? 0
                )}/month)`
            )
            .join(", ");

        answer =
          `To work toward your ${formatFinancialAggregate(
            goalPlan.targetMinor
          )}/month target, the smallest cost-first set I can identify is ${selectedCopy}. Together they represent about ${formatFinancialAggregate(
            goalPlan.monthlyReductionMinor
          )} per month. ${
            goalPlan.reachesGoal
              ? "That reaches the target."
              : "That still falls short of the target."
          } Protected subscriptions are excluded.`;
      }
    } else if (
      subscriptionIntent.kind === "NAVIGATION"
    ) {
      setScreen(subscriptionIntent.screen);

      const destinationNames: Record<string, string> = {
        home: "Home",
        subscriptions: "Subscriptions",
        savings: "Savings",
        autopilot: "Autopilot",
        ai: "Savlivo Assistant",
        settings: "Settings",
        plans: "Plans"
      };

      answer =
        `I've opened ${
          destinationNames[subscriptionIntent.screen] ??
          subscriptionIntent.screen
        }.`;
    } else if (
      subscriptionIntent.kind === "APP_HELP"
    ) {
      answer = getSavlivoHelp(
        question,
        subscriptionIntent.topic
      );
    } else if (
      wantsScenario &&
      namedReasoningSubscription &&
      scenarioMonths != null
    ) {
      const reasoningTarget =
        reasoningItems.find(
          (candidate) =>
            candidate.id ===
            namedReasoningSubscription.id
        );

      const scenario =
        reasoningTarget
          ? simulateSubscriptionRemoval(
              reasoningTarget,
              currentMonthlySpendRegionalMinor,
              scenarioMonths
            )
          : null;

      if (scenario) {
        setAiConversationContext(
          (current) =>
            rememberScenario(
              current,
              scenario.subscription.id,
              scenario.months
            )
        );

        answer =
          `If ${scenario.subscription.serviceName} stopped billing now and stayed off for ${scenario.months} ${
            scenario.months === 1 ? "month" : "months"
          }, the modeled reduction would be ${formatFinancialAggregate(
            scenario.savingsMinor
          )}. Your monthly spend would fall from ${formatFinancialAggregate(
            scenario.currentMonthlySpendMinor
          )} to about ${formatFinancialAggregate(
            scenario.projectedMonthlySpendMinor
          )}. This is a scenario, not recorded savings; the actual result depends on the provider's effective date.`;
      } else {
        answer =
          `${namedReasoningSubscription.serviceName} is not currently an active subscription with a usable monthly price, so I can't model new savings from removing it.`;
      }
    } else if (
      wantsComparison
    ) {
      let mentioned =
        explicitlyNamedSubscriptions;

      if (
        mentioned.length < 2 &&
        aiConversationContext
          .comparedSubscriptionIds
          .length >= 2
      ) {
        mentioned =
          aiConversationContext
            .comparedSubscriptionIds
            .map(
              (id) =>
                items.find(
                  (item) =>
                    item.id === id
                )
            )
            .filter(
              (
                item
              ): item is Subscription =>
                Boolean(item)
            );
      }

      if (mentioned.length >= 2) {
        const first =
          reasoningItems.find(
            (candidate) =>
              candidate.id === mentioned[0].id
          );

        const second =
          reasoningItems.find(
            (candidate) =>
              candidate.id === mentioned[1].id
          );

        const comparison =
          first && second
            ? compareSubscriptions(
                first,
                second
              )
            : null;

        if (comparison) {
          setAiConversationContext(
            (current) =>
              rememberComparison(
                current,
                [
                  comparison.first.id,
                  comparison.second.id
                ]
              )
          );
          const firstPrice =
            comparison.first.monthlyMinor ?? 0;

          const secondPrice =
            comparison.second.monthlyMinor ?? 0;

          if (
            comparison.differenceMinor === 0
          ) {
            answer =
              `${comparison.first.serviceName} and ${comparison.second.serviceName} currently cost the same at ${formatFinancialAggregate(
                firstPrice
              )} per month.`;
          } else {
            const higher =
              comparison.differenceMinor > 0
                ? comparison.first
                : comparison.second;

            const lower =
              comparison.differenceMinor > 0
                ? comparison.second
                : comparison.first;

            answer =
              `${comparison.first.serviceName} is ${formatFinancialAggregate(
                firstPrice
              )} per month and ${comparison.second.serviceName} is ${formatFinancialAggregate(
                secondPrice
              )}. ${higher.serviceName} costs ${formatFinancialAggregate(
                Math.abs(
                  comparison.differenceMinor
                )
              )} more per month than ${lower.serviceName}.`;
          }
        } else {
          answer =
            "I found those subscriptions, but one of them does not have a usable monthly price yet.";
        }
      } else {
        answer =
          "Tell me the two subscriptions you want to compare, for example “compare Netflix and Max”.";
      }
    } else if (
      wantsRanking
    ) {
      const ranked =
        rankSubscriptionsByCost(
          reasoningItems
        ).slice(0, 3);

      if (!ranked.length) {
        answer =
          "You do not currently have active subscriptions with usable monthly prices to rank.";
      } else {
        answer =
          `Your highest-cost active ${
            ranked.length === 1
              ? "subscription is"
              : "subscriptions are"
          } ${ranked
            .map(
              (item, index) =>
                `${index + 1}. ${item.serviceName} (${formatFinancialAggregate(
                  item.monthlyMinor ?? 0
                )}/month)`
            )
            .join(", ")}.`;
      }
    } else if (
      wantsRecommendationExplanation
    ) {
      const ranked =
        rankAllowedRecommendations(
          reasoningItems,
          aiPreferences
        );

      const explicitlyRequestedTarget =
        namedReasoningSubscription
          ? reasoningItems.find(
              (candidate) =>
                candidate.id ===
                namedReasoningSubscription.id
            )
          : undefined;

      const target =
        explicitlyRequestedTarget ??
        ranked[0];

      if (target) {
        setAiConversationContext(
          (current) =>
            rememberSubscription(
              current,
              target.id,
              "recommendation"
            )
        );

        const targetIsProtected =
          aiPreferences
            .protectedSubscriptionIds
            .includes(target.id);

        answer =
          targetIsProtected
            ? `${target.serviceName} is currently protected from Savlivo's savings recommendations. Its recorded monthly cost is ${formatFinancialAggregate(
                target.monthlyMinor ?? 0
              )}, but I won't suggest cutting it unless you change that preference.`
            : `${target.serviceName} is worth reviewing because it is currently ${formatFinancialAggregate(
            target.monthlyMinor ?? 0
          )} per month${
            ranked[0]?.id === target.id
              ? " and is your highest-cost active subscription"
              : ""
          }. That is a cost-based review signal, not a claim that you should cancel it. Savlivo does not currently know how much you use the service.`;
      } else {
        answer =
          "I don't currently have enough active subscription pricing data to make a useful review recommendation.";
      }
    } else if (
      wantsDataHealth
    ) {
      const unhealthy =
        reasoningItems.filter(
          (item) =>
            (item.dataIssues?.length ?? 0) > 0
        );

      if (!unhealthy.length) {
        answer =
          "Your subscription data looks healthy: I don't currently see missing prices, billing routes, statuses or renewal-date issues.";
      } else {
        answer =
          `I found ${unhealthy.length} ${
            unhealthy.length === 1
              ? "subscription"
              : "subscriptions"
          } that could use attention: ${unhealthy
            .slice(0, 4)
            .map(
              (item) =>
                `${item.serviceName} (${item.dataIssues?.join(
                  ", "
                )})`
            )
            .join("; ")}. Fixing these fields will make spend, renewal reminders and recommendations more reliable.`;
      }
    } else if (
      subscriptionIntent.kind === "SPENDING_INFO"
    ) {
      answer =
        `Your effectively active subscriptions currently cost ${formatFinancialAggregate(
          currentMonthlySpendRegionalMinor
        )} per month, or ${formatFinancialAggregate(
          currentAnnualSpendRegionalMinor
        )} annualized at their current monthly prices.`;
    } else if (
      subscriptionIntent.kind === "SAVINGS_INFO"
    ) {
      answer =
        `You are currently saving ${formatFinancialAggregate(
          currentMonthlySavingsRegionalMinor
        )} per month. Savlivo has recorded ${formatFinancialAggregate(
          savedSoFarRegionalMinor
        )} of accumulated savings so far.`;
    } else if (
      q.includes("connect") ||
      q.includes("setup") ||
      q.includes("set up")
    ) {
      answer =
        "Open Subscriptions, add or edit each service, choose the correct billing route, select the actual monthly price and set a confirmed renewal date. Then check Settings for the correct country and currency.";
    } else if (
      isRenewalFollowUp(question) &&
      (
        contextualSubscription ||
        namedReasoningSubscription
      )
    ) {
      const renewalTargetId =
        contextualSubscription?.id ??
        namedReasoningSubscription?.id;

      const renewalTarget =
        renewalTargetId
          ? items.find(
              (item) =>
                item.id === renewalTargetId
            )
          : undefined;

      if (renewalTarget) {
        setAiConversationContext(
          (current) =>
            rememberSubscription(
              current,
              renewalTarget.id,
              "renewal"
            )
        );

        if (renewalTarget.renewalDate) {
          const willRenew =
            willSubscriptionRenewOn({
              status:
                renewalTarget.status,
              statusEffectiveDate:
                renewalTarget.statusEffectiveDate,
              renewalDate:
                renewalTarget.renewalDate
            });

          answer = willRenew
            ? `${renewalTarget.serviceName} is currently expected to renew on ${formatRenewalDateDisplay(
                renewalTarget.renewalDate
              )}.`
            : `${renewalTarget.serviceName} has ${formatRenewalDateDisplay(
                renewalTarget.renewalDate
              )} recorded, but its current status/effective date means Savlivo does not expect it to renew then.`;
        } else {
          answer =
            `${renewalTarget.serviceName} does not have a confirmed renewal date recorded yet.`;
        }
      }
    } else if (
      subscriptionIntent.kind === "ACTION"
    ) {
      const requestedAction =
        subscriptionIntent.action;

      const namedSubscription = aiFindSubscription(question);

      const fallbackSubscription =
        requestedAction === "REACTIVATE"
          ? items.find(
              (item) => effectiveSubscriptionStatus(item) !== "ACTIVE"
            )
          : [...items]
              .filter(
                (item) => effectiveSubscriptionStatus(item) === "ACTIVE"
              )
              .sort(
                (a, b) =>
                  (billedMonthlyMinor(b) ?? 0) -
                  (billedMonthlyMinor(a) ?? 0)
              )[0];

      const target = namedSubscription ?? fallbackSubscription;

      if (target) {
        const currentStatus = effectiveSubscriptionStatus(target);

        if (
          requestedAction === "PAUSE" &&
          currentStatus === "PAUSED"
        ) {
          answer = `${target.serviceName} is already paused. I can help you reactivate or cancel it instead.`;
        } else if (
          requestedAction === "REACTIVATE" &&
          currentStatus === "ACTIVE"
        ) {
          answer = `${target.serviceName} is already active.`;
        } else {
          const targetWillRenew =
            Boolean(target.renewalDate) &&
            willSubscriptionRenewOn({
              status: target.status,
              statusEffectiveDate: target.statusEffectiveDate,
              renewalDate: target.renewalDate
            });

          const renewalCopy = targetWillRenew
            ? ` Its next confirmed renewal is ${formatRenewalDateDisplay(
                target.renewalDate
              )}.`
            : target.renewalDate
              ? " No further renewal is expected based on its current status."
              : " No confirmed renewal date is set yet.";

          answer =
            `I can guide you through ${
              requestedAction === "CANCEL"
                ? "cancelling"
                : requestedAction === "PAUSE"
                  ? "pausing"
                  : "reactivating"
            } ${target.serviceName}.${renewalCopy} ` +
            "Tap Open provider and continue below. Savlivo will open the same management flow as the subscription button, then ask what happened and when it takes effect when you return.";

          beginAiGuidedAction(target, requestedAction);
        }
      } else {
        answer =
          "I could not find a matching subscription for that action. Tell me the service name, for example “pause Netflix” or “reactivate Max”.";
      }
    } else if (
      subscriptionIntent.kind === "RENEWAL_INFO"
    ) {
      const namedRenewalSubscription =
        aiFindSubscription(question);

      if (namedRenewalSubscription) {
        const renewalDate =
          namedRenewalSubscription.renewalDate;

        if (!renewalDate) {
          answer = `${namedRenewalSubscription.serviceName} has no confirmed renewal date set yet.`;
        } else if (
          needsRenewalDateRefresh({
            status: namedRenewalSubscription.status,
            statusEffectiveDate:
              namedRenewalSubscription.statusEffectiveDate,
            renewalDate,
            todayDateOnly
          })
        ) {
          answer = `${namedRenewalSubscription.serviceName}'s confirmed renewal date of ${formatRenewalDateDisplay(renewalDate)} has passed and needs to be updated.`;
        } else if (
          willSubscriptionRenewOn({
            status: namedRenewalSubscription.status,
            statusEffectiveDate:
              namedRenewalSubscription.statusEffectiveDate,
            renewalDate
          })
        ) {
          answer = `${namedRenewalSubscription.serviceName}'s next confirmed renewal is ${formatRenewalDateDisplay(renewalDate)}.`;
        } else {
          answer = `${namedRenewalSubscription.serviceName} is not expected to renew again based on its current status.`;
        }
      } else {
        answer = upcomingRenewals.length
          ? `Your next confirmed renewal is ${upcomingRenewals[0].serviceName} on ${formatRenewalDateDisplay(upcomingRenewals[0].renewalDate)}.`
          : "No upcoming confirmed renewals are currently expected. Add or update renewal dates in Edit Subscription if needed.";
      }
    }

    const localFallbackAnswer =
      "I can help with your subscriptions, spending, savings, renewals, app features and subscription decisions.";

    const shouldUseRemoteAssistant =
      answer === localFallbackAnswer;

    if (shouldUseRemoteAssistant) {
      try {
        const remote =
          await askRemoteAssistant(
            question,
            aiMessages.slice(-10),
            {
              countryCode:
                selectedCountryCode,
              countryName:
                selectedCountryName,
              currency:
                selectedCurrency,
              currentMonthlySpendMinor:
                currentMonthlySpendRegionalMinor,
              currentAnnualSpendMinor:
                currentAnnualSpendRegionalMinor,
              currentMonthlySavingsMinor:
                currentMonthlySavingsRegionalMinor,
              savedSoFarMinor:
                savedSoFarRegionalMinor
            }
          );

        if (
          remote.intent === "NAVIGATION" &&
          remote.navigationTarget
        ) {
          setScreen(
            remote.navigationTarget as Screen
          );
        }

        if (
          remote.intent === "ACTION" &&
          remote.action &&
          remote.serviceNames.length
        ) {
          const serviceQuestion =
            remote.serviceNames.join(" ");

          const resolved =
            resolveSubscriptionEntities(
              serviceQuestion,
              items
            );

          const target =
            resolved[0]?.item
              ? items.find(
                  (item) =>
                    item.id ===
                    resolved[0].item.id
                )
              : undefined;

          if (target) {
            const status =
              effectiveSubscriptionStatus(
                target
              );

            if (
              remote.action === "PAUSE" &&
              status === "PAUSED"
            ) {
              answer =
                `${target.serviceName} is already paused.`;
            } else if (
              remote.action === "REACTIVATE" &&
              status === "ACTIVE"
            ) {
              answer =
                `${target.serviceName} is already active.`;
            } else {
              beginAiGuidedAction(
                target,
                remote.action
              );

              answer =
                `I understood that you want to ${
                  remote.action === "PAUSE"
                    ? "pause"
                    : remote.action === "CANCEL"
                      ? "cancel"
                      : "reactivate"
                } ${target.serviceName}. Use the guided action below to continue safely.`;
            }
          } else {
            answer = remote.answer;
          }
        } else {
          answer = remote.answer;
        }
      } catch (err: any) {
        console.error(
          "remote Savlivo assistant failed",
          err
        );

        answer =
          `Remote AI unavailable: ${
            err?.body?.error ??
            err?.message ??
            "unknown error"
          }`;
      }
    }

    setAiMessages((current) => [
      ...current,
      { role: "user", text: question },
      { role: "assistant", text: answer }
    ]);
    setAiInput("");

    setTimeout(() => {
      aiInputRef.current?.focus();
      keepLatestAiMessageVisible(false);
    }, 80);

    setTimeout(() => {
      keepLatestAiMessageVisible(false);
    }, 260);
  }

  function Nav() {
    const itemsNav: {
      key: Screen;
      label: string;
      accessibilityLabel: string;
      icon: keyof typeof Ionicons.glyphMap;
      activeIcon: keyof typeof Ionicons.glyphMap;
    }[] = [
      {
        key: "home",
        label: "Home",
        accessibilityLabel: "Home",
        icon: "home-outline",
        activeIcon: "home"
      },
      {
        key: "subscriptions",
        label: "Subs",
        accessibilityLabel: "Subscriptions",
        icon: "card-outline",
        activeIcon: "card"
      },
      {
        key: "savings",
        label: "Savings",
        accessibilityLabel: "Savings",
        icon: "trending-up-outline",
        activeIcon: "trending-up"
      },
      ...(plan === "PREMIUM"
        ? [
            {
              key: "autopilot" as Screen,
              label: "Auto",
              accessibilityLabel: "Autopilot",
              icon: "sparkles-outline" as keyof typeof Ionicons.glyphMap,
              activeIcon: "sparkles" as keyof typeof Ionicons.glyphMap
            },
            {
              key: "ai" as Screen,
              label: "AI",
              accessibilityLabel: "AI assistant",
              icon: "chatbubble-ellipses-outline" as keyof typeof Ionicons.glyphMap,
              activeIcon: "chatbubble-ellipses" as keyof typeof Ionicons.glyphMap
            }
          ]
        : []),
      {
        key: "settings",
        label: "Settings",
        accessibilityLabel: "Settings",
        icon: "settings-outline",
        activeIcon: "settings"
      }
    ];

    return (
      <View
        style={[
          styles.modernNavRow,
          cardShadow,
          {
            backgroundColor: visual.surfaceRaised,
            borderColor: visual.borderSubtle
          }
        ]}
      >
        {itemsNav.map((nav) => {
          const active = screen === nav.key;

          return (
            <Pressable
              key={nav.key}
              accessibilityRole="button"
              accessibilityLabel={nav.accessibilityLabel}
              style={styles.modernNavItem}
              onPress={() => setScreen(nav.key)}
            >
              <View
                style={[
                  styles.modernNavIconWrap,
                  active && {
                    backgroundColor: visual.greenSoft
                  }
                ]}
              >
                <Ionicons
                  name={active ? nav.activeIcon : nav.icon}
                  size={20}
                  color={
                    active
                      ? visual.green
                      : theme.muted
                  }
                />
              </View>

              <Text
                numberOfLines={1}
                style={[
                  styles.modernNavText,
                  {
                    color: active
                      ? visual.green
                      : theme.muted
                  },
                  active && styles.modernNavTextActive
                ]}
              >
                {nav.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    );
  }

  async function refreshRegionalPricing(
    countryCode = selectedCountryCode,
    forceRefresh = false
  ) {
    try {
      const snapshot = await api<any>(
        `/v1/pricing?country=${encodeURIComponent(countryCode)}${
          forceRefresh ? "&refresh=1" : ""
        }`
      );
      setPricingSnapshot(snapshot);

      if (
        snapshot?.currency &&
        countryCode === selectedCountryCode &&
        !selectedCurrency
      ) {
        setSelectedCurrency(snapshot.currency);
      }

      return snapshot;
    } catch {
      return null;
    }
  }

  function regionalPriceRange(
    serviceSlug: string,
    billingProviderSlug: string
  ) {
    const expectedCurrency = selectedCountryCurrency();

    return (pricingSnapshot?.items ?? []).find(
      (entry: any) =>
        entry.countryCode === selectedCountryCode &&
        entry.currency === expectedCurrency &&
        entry.serviceSlug === serviceSlug &&
        entry.billingProviderSlug === billingProviderSlug &&
        entry.priceType === "range" &&
        String(entry.source ?? "").startsWith(
          "official-provider-adapter:"
        ) &&
        typeof entry.monthlyPriceMinor === "number" &&
        typeof entry.monthlyPriceMaxMinor === "number"
    );
  }

  function promptRegionalPriceCorrection(
    item: Subscription
  ) {
    const currency =
      selectedCountryCurrency();

    const existing =
      manualRegionalPriceMinor(
        item.serviceSlug,
        item.billingProviderSlug,
        item.planName
      ) ??
      regionalPriceMinor(
        item.serviceSlug,
        item.billingProviderSlug,
        item.planName
      );

    Alert.prompt(
      "Correct local price",
      `Enter the monthly ${currency} price for ${item.serviceName}. This correction only applies on this device for ${selectedCountryName}.`,
      [
        {
          text: "Cancel",
          style: "cancel"
        },
        {
          text: "Reset",
          style: "destructive",
          onPress: () => {
            const key = regionalOverrideKey(
              item.serviceSlug,
              item.billingProviderSlug,
              item.planName
            );

            setManualRegionalPriceOverrides(
              (current) => {
                const next = { ...current };
                delete next[key];
                return next;
              }
            );
          }
        },
        {
          text: "Save",
          onPress: (value?: string) => {
            const normalized =
              String(value ?? "")
                .trim()
                .replace(",", ".");

            const amount =
              Number(normalized);

            if (
              !Number.isFinite(amount) ||
              amount <= 0
            ) {
              Alert.alert(
                "Savlivo",
                "Enter a valid monthly price."
              );
              return;
            }

            const key = regionalOverrideKey(
              item.serviceSlug,
              item.billingProviderSlug,
              item.planName
            );

            setManualRegionalPriceOverrides(
              (current) => ({
                ...current,
                [key]: Math.round(
                  amount * 100
                )
              })
            );
          }
        }
      ],
      "plain-text",
      existing != null
        ? (existing / 100).toFixed(2)
        : "",
      "decimal-pad"
    );
  }

  function selectedCountryCatalogMonthlyMinor(
    item: Subscription
  ) {
    // Savings in country-comparison mode must use an actual
    // verified local catalog price for the selected country.
    //
    // Prefer the subscription's billing route.
    const routePrice =
      manualRegionalPriceMinor(
        item.serviceSlug,
        item.billingProviderSlug,
        item.planName
      ) ??
      regionalPriceMinor(
        item.serviceSlug,
        item.billingProviderSlug,
        item.planName
      );

    if (routePrice != null) {
      return routePrice;
    }

    // If that billing route has no verified regional price,
    // the verified DIRECT provider catalog may be used as the
    // local comparison price.
    if (item.billingProviderSlug !== "direct") {
      const directPrice = regionalPriceMinor(
        item.serviceSlug,
        "direct",
        item.planName
      );

      if (directPrice != null) {
        return directPrice;
      }
    }

    // Never FX-convert the user's saved bill to manufacture
    // a local price.
    const expectedCurrency = selectedCountryCurrency();

    if (
      expectedCurrency &&
      item.currency === expectedCurrency &&
      typeof item.monthlyPriceMinor === "number" &&
      Number.isFinite(item.monthlyPriceMinor) &&
      item.monthlyPriceMinor > 0
    ) {
      return item.monthlyPriceMinor;
    }

    return null;
  }

  function billedMonthlyMinor(item: Subscription) {
    // Financial totals must reflect the amount the user actually pays.
    //
    // Never FX-convert this amount because the user changed the
    // comparison country in Settings.
    //
    // Regional provider pricing is catalog/comparison evidence only.
    return item.monthlyPriceMinor ?? null;
  }

  function financialCurrency() {
    const currencies = new Set(
      items
        .filter(
          (item) =>
            item.monthlyPriceMinor != null &&
            Boolean(item.currency)
        )
        .map((item) => String(item.currency))
    );

    return currencies.size === 1
      ? [...currencies][0]
      : null;
  }

  function formatFinancialAggregate(minor: number) {
    const currency = financialCurrency();

    if (!currency) {
      return "Mixed currencies";
    }

    return formatRegionalMinor(
      minor,
      currency
    );
  }

  function savedSoFarCurrency() {
    const currencies = new Set(
      items
        .filter(
          (item) =>
            typeof item.savedSoFarMinor === "number" &&
            Number.isFinite(item.savedSoFarMinor) &&
            item.savedSoFarMinor > 0 &&
            Boolean(item.currency)
        )
        .map((item) => String(item.currency))
    );

    return currencies.size === 1
      ? [...currencies][0]
      : currencies.size === 0
        ? selectedCountryCurrency()
        : null;
  }

  function formatSavedSoFarAggregate(minor: number) {
    const currency = savedSoFarCurrency();

    if (!currency) {
      return "Multiple currencies";
    }

    return formatRegionalMinor(
      minor,
      currency
    );
  }

  function regionalPlanOptions(
    serviceSlug: string,
    billingProviderSlug: string
  ) {
    const expectedCurrency = selectedCountryCurrency();

    const rows = (pricingSnapshot?.items ?? []).filter(
      (entry: any) =>
        entry.countryCode === selectedCountryCode &&
        entry.currency === expectedCurrency &&
        entry.serviceSlug === serviceSlug &&
        entry.billingProviderSlug === billingProviderSlug &&
        entry.priceType === "exact" &&
        String(entry.source ?? "").startsWith(
          "official-provider-adapter:"
        ) &&
        typeof entry.monthlyPriceMinor === "number"
    );

    const unique = new Map<string, any>();
    for (const row of rows) {
      const key = String(row.planSlug ?? row.planName ?? "default");
      unique.set(key, row);
    }
    return [...unique.values()];
  }

  function regionalPriceMinor(
    serviceSlug: string,
    billingProviderSlug: string,
    planName?: string
  ) {
    const rows = regionalPlanOptions(serviceSlug, billingProviderSlug);

    if (planName) {
      const wanted = planName.toLowerCase();
      const exact = rows.find(
        (entry: any) =>
          String(entry.planName ?? "").toLowerCase() === wanted ||
          String(entry.planSlug ?? "").toLowerCase() === wanted
      );
      return typeof exact?.monthlyPriceMinor === "number"
        ? exact.monthlyPriceMinor
        : null;
    }

    return rows.length === 1 ? rows[0].monthlyPriceMinor : null;
  }

  function selectedPlanPriceMinor() {
    return regionalPriceMinor(
      serviceSlugInput,
      billingProviderInput,
      subscriptionPlanInput || undefined
    );
  }

  function syncPlanAndPrice(
    serviceSlug: string,
    billingProviderSlug: string,
    preferredPlan?: string
  ) {
    const plans = regionalPlanOptions(
      serviceSlug,
      billingProviderSlug
    );

    const preferred =
      plans.find(
        (row: any) =>
          preferredPlan &&
          (
            String(row.planName).toLowerCase() ===
              preferredPlan.toLowerCase() ||
            String(row.planSlug).toLowerCase() ===
              preferredPlan.toLowerCase()
          )
      ) ??
      (plans.length === 1 ? plans[0] : null);

    const nextPlan = preferred
      ? String(
          preferred.planName ??
          preferred.planSlug ??
          ""
        )
      : "";

    if (preferred) {
      setSubscriptionPlanInput(nextPlan);
    }

    if (
      !preferred ||
      typeof preferred.monthlyPriceMinor !== "number"
    ) {
      /*
       * No verified catalog price exists for this selection.
       * Leave the fields available for manual entry.
       *
       * Do not invent or FX-convert a price.
       */
      return;
    }

    // The catalog price already belongs to the selected country.
    // Never FX-convert it.
    setMonthlyPriceInput(
      (preferred.monthlyPriceMinor / 100).toFixed(2)
    );
  }

  function formatRegionalAggregate(
    minor: number | null
  ) {
    const currency = selectedCountryCurrency();

    if (minor == null || !currency) {
      return "Price unavailable";
    }

    // The amount is already a verified local amount for this country.
    return formatRegionalMinor(
      minor,
      currency
    );
  }

  function formatRegionalMinor(minor: number, currency: string) {
    try {
      return new Intl.NumberFormat(undefined, {
        style: "currency",
        currency
      }).format(minor / 100);
    } catch {
      return `${currency} ${(minor / 100).toFixed(2)}`;
    }
  }

  function formatStoredSubscriptionPrice(item: Subscription) {
    const minor = item.monthlyPriceMinor ?? 0;
    const storedCurrency = item.currency || "USD";

    try {
      return new Intl.NumberFormat(undefined, {
        style: "currency",
        currency: storedCurrency
      }).format(minor / 100);
    } catch {
      return `${storedCurrency} ${(minor / 100).toFixed(2)}`;
    }
  }

  function regionalDisplayRange(
    serviceSlug: string,
    billingProviderSlug: string
  ) {
    const expectedCurrency = selectedCountryCurrency();

    if (
      pricingSnapshot?.countryCode !== selectedCountryCode ||
      pricingSnapshot?.currency !== expectedCurrency
    ) {
      return null;
    }

    const range = regionalPriceRange(
      serviceSlug,
      billingProviderSlug
    );

    if (
      !range ||
      typeof range.monthlyPriceMinor !== "number" ||
      typeof range.monthlyPriceMaxMinor !== "number"
    ) {
      return null;
    }

    const currency = pricingSnapshot?.currency || "";

    if (!currency) return null;

    return `${formatRegionalMinor(
      range.monthlyPriceMinor,
      currency
    )}–${formatRegionalMinor(
      range.monthlyPriceMaxMinor,
      currency
    )}`;
  }

  function regionalDisplayPrice(
    serviceSlug: string,
    billingProviderSlug: string,
    planName?: string
  ) {
    const expectedCurrency =
      selectedCountryCurrency();

    if (
      pricingSnapshot?.countryCode !==
        selectedCountryCode ||
      pricingSnapshot?.currency !==
        expectedCurrency
    ) {
      return null;
    }

    const minor =
      manualRegionalPriceMinor(
        serviceSlug,
        billingProviderSlug,
        planName
      ) ??
      regionalPriceMinor(
        serviceSlug,
        billingProviderSlug,
        planName
      );

    const currency =
      pricingSnapshot?.currency || "";

    if (
      minor == null ||
      !currency
    ) {
      return null;
    }

    // Verified regional price already belongs to this country.
    // Never convert it through USD or any other currency.
    return formatRegionalMinor(
      minor,
      currency
    );
  }

  const filteredCountries = countryCurrencyData.filter(
    ([code, name]) =>
      name.toLowerCase().includes(countrySearch.toLowerCase()) ||
      code.toLowerCase().includes(countrySearch.toLowerCase())
  );

  function selectCountry(code: string, name: string, currency: string) {
    setPricingSnapshot(null);
    setSelectedCountryCode(code);
    setSelectedCountryName(name);
    setSelectedCurrency(currency);
  }

  function dateOnlyToLocalDate(value?: string | null) {
    const normalized = normalizeDateOnly(value);
    if (!normalized) {
      const now = new Date();
      return new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate(),
        12,
        0,
        0,
        0
      );
    }

    const [year, month, day] = normalized.split("-").map(Number);
    return new Date(year, month - 1, day, 12, 0, 0, 0);
  }

  function renewalPickerDate() {
    return dateOnlyToLocalDate(renewalDateInput);
  }

  function formatDateForInput(date: Date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function normalizeDateOnly(value?: string | null) {
    if (!value) return "";

    const direct = String(value).match(/^(\d{4}-\d{2}-\d{2})/);
    if (direct?.[1]) {
      return direct[1];
    }

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return "";
    }

    return formatDateForInput(parsed);
  }

  function formatRenewalDateDisplay(value?: string | null) {
    const dateOnly = normalizeDateOnly(value);
    if (!dateOnly) return "Renewal date not set";

    const [year, month, day] = dateOnly.split("-").map(Number);
    const parsed = new Date(year, month - 1, day);

    return new Intl.DateTimeFormat("en", {
      year: "numeric",
      month: "short",
      day: "numeric"
    }).format(parsed);
  }

  function onRenewalDateChange(
    event: DateTimePickerEvent,
    selectedDate?: Date
  ) {
    if (Platform.OS === "android") {
      setShowRenewalDatePicker(false);
    }

    if (event.type === "dismissed" || !selectedDate) {
      return;
    }

    const localCalendarDate = new Date(
      selectedDate.getFullYear(),
      selectedDate.getMonth(),
      selectedDate.getDate(),
      12,
      0,
      0,
      0
    );

    setRenewalDateInput(formatDateForInput(localCalendarDate));

    if (Platform.OS === "ios") {
      setShowRenewalDatePicker(false);
    }
  }

  function openAddService() {
    setServiceSelectionLocked(false);
    setServicePickerOpen(true);
  }

  function beginAddService(serviceSlug: string) {
    const service =
      serviceCatalog.find(
        (entry) => entry.slug === serviceSlug
      ) ?? serviceCatalog[0];

    if (!service) return;

    editingSubscriptionIdRef.current = null;
    setEditingSubscriptionId(null);

    setServiceSlugInput(service.slug);
    setServiceSelectionLocked(true);
    const defaultBillingProvider =
      defaultBillingProviderForService(
        service.slug
      );

    setBillingProviderInput(
      defaultBillingProvider
    );
    setSubscriptionPlanInput("");
    setMonthlyPriceInput("");
    setRenewalDateInput("");
    setShowRenewalDatePicker(false);

    syncPlanAndPrice(
      service.slug,
      defaultBillingProvider
    );

    setServicePickerOpen(false);
    setServiceFormOpen(true);
  }

  function openEditService(item: Subscription) {
    setShowRenewalDatePicker(false);
    setServiceSelectionLocked(true);
    editingSubscriptionIdRef.current = item.id;
    setEditingSubscriptionId(item.id);
    setServiceSlugInput(item.serviceSlug);
    setBillingProviderInput(item.billingProviderSlug);
    setRenewalDateInput(normalizeDateOnly(item.renewalDate));

    const plans = regionalPlanOptions(
      item.serviceSlug,
      item.billingProviderSlug
    );

    const exactPlan = item.planName
      ? plans.find(
          (row: any) =>
            String(row.planName ?? "").toLowerCase() ===
              item.planName!.toLowerCase() ||
            String(row.planSlug ?? "").toLowerCase() ===
              item.planName!.toLowerCase()
        )
      : null;

    // Editing an existing subscription must always preserve
    // the user's saved bill. Catalog pricing is reference data
    // only and must never overwrite what the user actually pays.
    if (exactPlan) {
      setSubscriptionPlanInput(
        String(
          exactPlan.planName ??
          exactPlan.planSlug ??
          item.planName ??
          ""
        )
      );
    } else {
      setSubscriptionPlanInput(item.planName ?? "");
    }

    if (item.monthlyPriceMinor != null) {
      setMonthlyPriceInput(
        (item.monthlyPriceMinor / 100).toFixed(2)
      );
    } else {
      setMonthlyPriceInput("");
    }

    setServiceFormOpen(true);
  }

  async function saveServiceForm() {
    const monthly = Number(monthlyPriceInput);
    if (!Number.isFinite(monthly) || monthly <= 0) {
      Alert.alert(
        "Monthly price required",
        "Savlivo does not have a verified price for every service and billing route yet. Enter the amount you actually pay each month."
      );
      return;
    }

    const targetSubscriptionId =
      editingSubscriptionIdRef.current ??
      editingSubscriptionId ??
      null;

    const existingSubscription =
      targetSubscriptionId
        ? items.find(
            (item) => item.id === targetSubscriptionId
          ) ?? null
        : null;

    // A saved bill owns its currency.
    //
    // Changing the comparison country must never relabel an
    // existing subscription amount as another currency.
    //
    // New subscriptions use the selected country's currency.
    const subscriptionCurrency =
      existingSubscription?.currency ||
      selectedCountryCurrency();

    const body = {
      serviceSlug: serviceSlugInput,
      billingProviderSlug: billingProviderInput,
      monthlyPriceMinor: Math.round(monthly * 100),
      currency: subscriptionCurrency,
      renewalDate:
        normalizeDateOnly(renewalDateInput) || undefined,
      planName: subscriptionPlanInput || undefined
    };

    try {
      if (targetSubscriptionId) {
        const updated = await api<Subscription>(
          `/v1/subscriptions/${targetSubscriptionId}`,
          {
            method: "PATCH",
            body: JSON.stringify(body)
          }
        );

        setItems((current) =>
          current.map((item) =>
            item.id === targetSubscriptionId ? updated : item
          )
        );
      } else {
        await api("/v1/subscriptions", {
          method: "POST",
          body: JSON.stringify(body)
        });
      }

      await refresh();
      setServiceFormOpen(false);

      const wasEditing = Boolean(targetSubscriptionId);
      editingSubscriptionIdRef.current = null;
      setEditingSubscriptionId(null);

      setSuccessMessage(
        wasEditing
          ? "Subscription updated."
          : "Subscription added."
      );
      setTimeout(() => setSuccessMessage(null), 2600);
    } catch (err: any) {
      Alert.alert(
        "Savlivo",
        err?.body?.error ?? "Could not save subscription."
      );
    }
  }

  function normalizedStatus(status?: string) {
    return (status ?? "ACTIVE").toUpperCase();
  }

  function statusLabel(status?: string) {
    const value = normalizedStatus(status);
    if (value === "PAUSED") return "Paused";
    if (value === "CANCELLED") return "Cancelled";
    return "Active";
  }

  function statusColors(status?: string) {
    const value = normalizedStatus(status);

    if (value === "PAUSED") {
      return darkMode
        ? { bg: "#3B2D15", text: "#F5C46B" }
        : { bg: "#FFF4D8", text: "#8A5A00" };
    }

    if (value === "CANCELLED") {
      return darkMode
        ? { bg: "#3A1F21", text: "#FF8A80" }
        : { bg: "#FDECEC", text: "#B42318" };
    }

    return darkMode
      ? { bg: "#173226", text: "#8DDEAE" }
      : { bg: "#E8F5EE", text: "#1E6B45" };
  }

  function applyDemoStatus(
    subscriptionId: string,
    action: "PAUSE" | "CANCEL" | "REACTIVATE"
  ) {
    const nextStatus =
      action === "PAUSE"
        ? "PAUSED"
        : action === "CANCEL"
          ? "CANCELLED"
          : "ACTIVE";

    setItems((current) =>
      current.map((item) =>
        item.id === subscriptionId ? { ...item, status: nextStatus } : item
      )
    );
  }

  function ServiceCard({ item }: { item: Subscription }) {
    const currentStatus = normalizedStatus(item.status);

    const statusEffectiveDate =
      item.statusEffectiveDate
        ? normalizeDateOnly(item.statusEffectiveDate)
        : "";

    const statusIsFutureEffective =
      currentStatus !== "ACTIVE" &&
      Boolean(statusEffectiveDate) &&
      statusEffectiveDate > todayDateOnly;

    const displayedStatus =
      statusIsFutureEffective
        ? "ACTIVE"
        : currentStatus;

    const scheduledStatusLabel =
      statusIsFutureEffective
        ? `${
            currentStatus === "PAUSED"
              ? "Pauses"
              : "Cancels"
          } ${formatRenewalDateDisplay(
            item.statusEffectiveDate!
          )}`
        : null;

    const statusColor =
      statusColors(displayedStatus);

    const routeExactLocal =
      regionalDisplayPrice(
        item.serviceSlug,
        item.billingProviderSlug,
        item.planName
      );

    const directExactLocal =
      item.billingProviderSlug !== "direct"
        ? regionalDisplayPrice(
            item.serviceSlug,
            "direct",
            item.planName
          )
        : null;

    const routeRange =
      regionalDisplayRange(
        item.serviceSlug,
        item.billingProviderSlug
      );

    const directRange =
      item.billingProviderSlug !== "direct"
        ? regionalDisplayRange(
            item.serviceSlug,
            "direct"
          )
        : null;

    const displayedPrice =
      item.monthlyPriceMinor
        ? formatStoredSubscriptionPrice(item)
        : routeExactLocal ??
          directExactLocal ??
          routeRange ??
          directRange ??
          "Price unavailable";

    const renewalCopy =
      scheduledStatusLabel ??
      (
        item.renewalDate
          ? `Renewal ${formatRenewalDateDisplay(
              item.renewalDate
            )}`
          : "Renewal date not set"
      );

    return (
      <View
        style={[
          styles.modernSubscriptionCard,
          softShadow,
          {
            backgroundColor: visual.surfaceRaised,
            borderColor: visual.borderSubtle
          }
        ]}
      >
        <View style={styles.modernSubscriptionTop}>
          <ServiceLogo
            serviceSlug={item.serviceSlug}
            serviceName={item.serviceName}
            size={44}
          />

          <View style={styles.modernSubscriptionInfo}>
            <Text
              style={[
                styles.modernSubscriptionName,
                { color: theme.text }
              ]}
              numberOfLines={1}
            >
              {item.serviceName}
            </Text>

            <Text
              style={[
                styles.modernSubscriptionProvider,
                { color: theme.muted }
              ]}
              numberOfLines={1}
            >
              {item.billingProviderSlug}
              {item.planName
                ? ` · ${item.planName}`
                : ""}
            </Text>
          </View>

          <View style={styles.modernSubscriptionPriceBlock}>
            <Text
              style={[
                styles.modernSubscriptionPrice,
                { color: theme.text }
              ]}
              numberOfLines={1}
            >
              {displayedPrice}
            </Text>

            <Text
              style={[
                styles.modernSubscriptionPerMonth,
                { color: theme.muted }
              ]}
            >
              / month
            </Text>
          </View>
        </View>

        <View style={styles.modernSubscriptionMetaRow}>
          <View
            style={[
              styles.modernStatusPill,
              { backgroundColor: statusColor.bg }
            ]}
          >
            <View
              style={[
                styles.modernStatusDot,
                { backgroundColor: statusColor.text }
              ]}
            />

            <Text
              style={[
                styles.modernStatusText,
                { color: statusColor.text }
              ]}
            >
              {statusLabel(displayedStatus)}
            </Text>
          </View>

          <View style={styles.modernRenewalMeta}>
            <Ionicons
              name={
                scheduledStatusLabel
                  ? "time-outline"
                  : "calendar-outline"
              }
              size={14}
              color={theme.muted}
            />

            <Text
              style={[
                styles.modernRenewalText,
                { color: theme.muted }
              ]}
              numberOfLines={1}
            >
              {renewalCopy}
            </Text>
          </View>
        </View>

        {displayedStatus !== "ACTIVE" ? (
          <View
            style={[
              styles.modernSavedRow,
              {
                backgroundColor: visual.greenSoft
              }
            ]}
          >
            <Text
              style={[
                styles.modernSavedLabel,
                { color: visual.greenMuted }
              ]}
            >
              Saved so far
            </Text>

            <Text
              style={[
                styles.modernSavedValue,
                { color: visual.green }
              ]}
            >
              {formatFinancialAggregate(
                typeof item.savedSoFarMinor === "number" &&
                Number.isFinite(item.savedSoFarMinor)
                  ? item.savedSoFarMinor
                  : 0
              )}
            </Text>
          </View>
        ) : null}

        <View style={styles.modernSubscriptionActions}>
          {displayedStatus === "ACTIVE" ? (
            <>
              {supportsSubscriptionAction(
                item.serviceSlug,
                item.billingProviderSlug,
                "PAUSE"
              ) ? (
                <Pressable
                  style={[
                    styles.modernActionButton,
                    {
                      backgroundColor: darkMode
                        ? "rgba(255,255,255,0.045)"
                        : theme.surface,
                      borderColor: darkMode
                        ? "rgba(255,255,255,0.12)"
                        : theme.border
                    }
                  ]}
                  onPress={() =>
                    openActionSheet(item, "PAUSE")
                  }
                >
                  <Ionicons
                    name="pause-outline"
                    size={15}
                    color={theme.text}
                  />
                  <Text
                    style={[
                      styles.modernActionText,
                      {
                        color: theme.text
                      }
                    ]}
                  >
                    Pause
                  </Text>
                </Pressable>
              ) : null}

              <Pressable
                style={[
                  styles.modernActionButton,
                  {
                    backgroundColor: darkMode
                      ? "rgba(255,255,255,0.045)"
                      : theme.surface,
                    borderColor: darkMode
                      ? "rgba(255,255,255,0.12)"
                      : theme.border
                  }
                ]}
                onPress={() =>
                  openActionSheet(item, "CANCEL")
                }
              >
                <Ionicons
                  name="close-outline"
                  size={16}
                  color={theme.text}
                />
                <Text
                  style={[
                    styles.modernActionText,
                    {
                      color: theme.text
                    }
                  ]}
                >
                  Cancel
                </Text>
              </Pressable>
            </>
          ) : null}

          {displayedStatus === "PAUSED" ? (
            <>
              <Pressable
                style={[
                  styles.modernActionButton,
                  {
                    backgroundColor: visual.greenSoft,
                    borderColor: darkMode
                      ? "#19583D"
                      : "#CBEBD9"
                  }
                ]}
                onPress={() =>
                  openActionSheet(item, "REACTIVATE")
                }
              >
                <Ionicons
                  name="play-outline"
                  size={15}
                  color={visual.greenMuted}
                />
                <Text
                  style={[
                    styles.modernActionText,
                    { color: visual.greenMuted }
                  ]}
                >
                  Reactivate
                </Text>
              </Pressable>

              <Pressable
                style={[
                  styles.modernActionButton,
                  {
                    backgroundColor: darkMode
                      ? "rgba(255,255,255,0.045)"
                      : theme.surface,
                    borderColor: darkMode
                      ? "rgba(255,255,255,0.12)"
                      : theme.border
                  }
                ]}
                onPress={() =>
                  openActionSheet(item, "CANCEL")
                }
              >
                <Text
                  style={[
                    styles.modernActionText,
                    {
                      color: theme.text
                    }
                  ]}
                >
                  Cancel
                </Text>
              </Pressable>
            </>
          ) : null}

          {displayedStatus === "CANCELLED" ? (
            <Pressable
              style={[
                styles.modernActionButton,
                {
                  backgroundColor: visual.greenSoft,
                  borderColor: darkMode
                    ? "#19583D"
                    : "#CBEBD9"
                }
              ]}
              onPress={() =>
                openActionSheet(item, "REACTIVATE")
              }
            >
              <Ionicons
                name="refresh-outline"
                size={15}
                color={visual.greenMuted}
              />
              <Text
                style={[
                  styles.modernActionText,
                  { color: visual.greenMuted }
                ]}
              >
                Reactivate
              </Text>
            </Pressable>
          ) : null}

          <Pressable
            accessibilityLabel={`Edit ${item.serviceName}`}
            style={[
              styles.modernEditButton,
              softShadow,
              {
                backgroundColor: darkMode
                  ? "#11171C"
                  : "#FFFFFF",
                borderColor: visual.borderSubtle
              }
            ]}
            onPress={() => openEditService(item)}
          >
            <Ionicons
              name="pencil-outline"
              size={16}
              color={theme.muted}
            />
          </Pressable>
        </View>
      </View>
    );
  }

  if (screen === "plans") {
    return (
      <SafeAreaView style={[styles.screen, { backgroundColor: theme.bg }]}>
        <StatusBar style={darkMode ? "light" : "dark"} backgroundColor={theme.bg} />
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.planHeader}>
            <Pressable style={styles.backButton} onPress={() => setScreen("home")}>
              <Text style={[styles.backText, { color: theme.text }]}>← Home</Text>
            </Pressable>
            <Text style={[styles.planHeaderTitle, { color: theme.text }]}>Plans</Text>
            <View style={styles.headerSpacer} />
          </View>

          <View style={[styles.planIntro, { backgroundColor: theme.surface }]}>
            <Text style={[styles.planPageTitle, { color: theme.text }]}>Choose your Savlivo plan</Text>
            <Text style={[styles.muted, { color: theme.muted }]}>
              Manual gives you the management toolbox. Premium adds Savlivo's decision engine and AI assistant.
            </Text>
          </View>

          <Pressable
            style={[
              styles.planOption,
              {
                backgroundColor:
                  plan === "MANUAL"
                    ? visual.greenHero
                    : theme.surface,
                borderColor:
                  plan === "MANUAL"
                    ? visual.greenMuted
                    : theme.border
              }
            ]}
            onPress={() => upgrade("manual")}
          >
            <Text style={[styles.planName, { color: theme.text }]}>Manual</Text>
            <Text style={[styles.planPrice, { color: theme.text }]}>$19/year</Text>
            <Text style={[styles.planCopy, { color: theme.muted }]}>
              Self-service toolbox: manage subscriptions, renewal dates and savings yourself.
            </Text>
          </Pressable>

          <Pressable
            style={[
              styles.planOption,
              styles.planOptionFeatured,
              {
                backgroundColor:
                  plan === "PREMIUM"
                    ? visual.greenHero
                    : theme.surface,
                borderColor:
                  plan === "PREMIUM"
                    ? visual.greenMuted
                    : theme.border
              }
            ]}
            onPress={() => upgrade("premium")}
          >
            <Text
              style={[
                styles.planName,
                { color: theme.text }
              ]}
            >
              Premium
            </Text>
            <Text
              style={[
                styles.planPrice,
                { color: theme.text }
              ]}
            >
              {formatMoneyFromUsdMinor(3900, { maximumFractionDigits: 0 })}/year
            </Text>
            <Text
              style={[
                styles.planCopy,
                { color: plan === "PREMIUM" && darkMode
                    ? "#D7E9DF"
                    : theme.muted }
              ]}
            >
              Decision engine + AI assistant: monthly optimization plans, renewal timing alerts, what-if savings, Autopilot recommendations, setup help and troubleshooting.
            </Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: theme.bg }]}>
      <StatusBar style={darkMode ? "light" : "dark"} backgroundColor={theme.bg} />
      <View
        style={[
          styles.stickyHeader,
          {
            backgroundColor: theme.bg,
            borderBottomColor: theme.border
          }
        ]}
      >
        <View style={styles.top}>
          <View style={styles.modernBrandLockup}>
            <Image
              source={require("../assets/logo.png")}
              style={styles.modernHeaderLogo}
              resizeMode="cover"
            />

            <Text
              style={[
                styles.modernBrandName,
                { color: theme.text }
              ]}
            >
              Savlivo
            </Text>

            <Pressable
              style={[
                styles.modernPlanBadge,
                {
                  backgroundColor:
                    plan === "PREMIUM"
                      ? visual.greenSoft
                      : visual.surfaceInteractive
                }
              ]}
              onPress={() => setScreen("plans")}
            >
              <Text
                style={[
                  styles.modernPlanBadgeText,
                  {
                    color:
                      plan === "PREMIUM"
                        ? visual.green
                        : theme.muted
                  }
                ]}
              >
                {plan}
              </Text>
            </Pressable>
          </View>
          <View style={styles.topActions}>
            <Pressable
              accessibilityLabel={darkMode ? "Switch to light mode" : "Switch to dark mode"}
              style={[
                styles.themeToggle,
                { backgroundColor: theme.surface, borderColor: theme.border }
              ]}
              onPress={() => setDarkMode((value) => !value)}
            >
              <Text style={[styles.themeIcon, { color: theme.text }]}>
                {darkMode ? "☀" : "☾"}
              </Text>
            </Pressable>
            <Pressable style={styles.logoutButton} onPress={logout}>
              <Text style={[styles.logoutText, { color: theme.muted }]}>Log out</Text>
            </Pressable>
          </View>
        </View>

        <Nav />
      </View>

      <KeyboardAvoidingView
        style={styles.mainKeyboardViewport}
        behavior={
          screen === "ai"
            ? Platform.OS === "ios"
              ? "padding"
              : "height"
            : undefined
        }
        keyboardVerticalOffset={0}
      >
      {screen === "ai" ? (
        <View style={styles.aiStandaloneViewport}>
          <View
            style={styles.aiKeyboardAvoider}
          >
            <View style={styles.modernAiHeading}>
              <View
                style={[
                  styles.modernAiHeadingIcon,
                  {
                    backgroundColor: visual.greenSoft
                  }
                ]}
              >
                <Ionicons
                  name="sparkles"
                  size={20}
                  color={visual.green}
                />
              </View>

              <View style={{ flex: 1 }}>
                <Text
                  style={[
                    styles.modernScreenEyebrow,
                    { color: visual.green }
                  ]}
                >
                  SAVLIVO ASSISTANT
                </Text>

                <Text
                  style={[
                    styles.modernAiTitle,
                    { color: theme.text }
                  ]}
                >
                  What can I help with?
                </Text>

                <Text
                  style={[
                    styles.modernAiSubtitle,
                    { color: theme.muted }
                  ]}
                >
                  Ask about spending, renewals or subscription
                  actions.
                </Text>
              </View>
            </View>

            {aiMessages.length <= 1 ? (
              <View style={styles.modernAiSuggestions}>
                {[
                  "What renews next?",
                  "How much am I saving?",
                  "What should I review?"
                ].map((suggestion) => (
                  <Pressable
                    key={suggestion}
                    style={[
                      styles.modernAiSuggestionChip,
                      {
                        backgroundColor:
                          visual.surfaceRaised,
                        borderColor:
                          visual.borderSubtle
                      }
                    ]}
                    onPress={() =>
                      setAiInput(suggestion)
                    }
                  >
                    <Text
                      style={[
                        styles.modernAiSuggestionText,
                        { color: theme.muted }
                      ]}
                    >
                      {suggestion}
                    </Text>
                  </Pressable>
                ))}
              </View>
            ) : null}

            <View
              style={[
                styles.aiChatCard,
                styles.modernAiChatCard,
                cardShadow,
                {
                  backgroundColor:
                    visual.surfaceRaised,
                  borderColor:
                    visual.borderSubtle
                }
              ]}
            >
              <ScrollView
                ref={aiScrollRef}
                style={styles.aiChatLog}
                contentContainerStyle={styles.aiChatLogContent}
                nestedScrollEnabled
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="interactive"
                onContentSizeChange={() =>
                  keepLatestAiMessageVisible(false)
                }
                onLayout={() =>
                  keepLatestAiMessageVisible(false)
                }
              >
                {aiMessages.map((message, index) => (
                  <View
                    key={`${message.role}-${index}`}
                    style={[
                      styles.aiMessage,
                      message.role === "user"
                        ? styles.aiMessageUser
                        : styles.aiMessageAssistant,
                      {
                        backgroundColor:
                          message.role === "user"
                            ? visual.greenSoft
                            : visual.surfaceInteractive,
                        borderColor:
                          message.role === "user"
                            ? darkMode
                              ? "#19583D"
                              : "#BCEBD2"
                            : visual.borderSubtle
                      }
                    ]}
                  >
                    <Text style={[styles.aiMessageText, { color: theme.text }]}>
                      {message.text}
                    </Text>

                    {message.role === "assistant" ? (
                      <Pressable
                        accessibilityLabel={
                          aiSpeakingMessageIndex === index
                            ? "Stop spoken reply"
                            : "Listen to reply"
                        }
                        style={styles.aiListenButton}
                        onPress={() => {
                          if (
                            aiSpeakingMessageIndex === index
                          ) {
                            void stopAiSpeech();
                          } else {
                            void speakAiMessage(
                              message.text,
                              index
                            );
                          }
                        }}
                      >
                        <Ionicons
                          name={
                            aiSpeakingMessageIndex === index
                              ? "stop-circle-outline"
                              : "volume-high-outline"
                          }
                          size={15}
                          color={theme.muted}
                        />

                        <Text
                          style={[
                            styles.aiListenButtonText,
                            { color: theme.muted }
                          ]}
                        >
                          {aiSpeakingMessageIndex === index
                            ? "Stop"
                            : "Listen"}
                        </Text>
                      </Pressable>
                    ) : null}
                  </View>
                ))}

                {aiGuidedAction ? (
                  <View
                    style={[
                      styles.aiGuideCard,
                      {
                        backgroundColor: theme.surfaceSoft,
                        borderColor: theme.border
                      }
                    ]}
                  >
                    <Text style={[styles.aiGuideEyebrow, { color: theme.muted }]}>
                      GUIDED ACTION
                    </Text>
                    <Text style={[styles.aiGuideTitle, { color: theme.text }]}>
                      {aiGuidedAction.action === "CANCEL"
                        ? "Cancel"
                        : aiGuidedAction.action === "PAUSE"
                          ? "Pause"
                          : "Reactivate"}{" "}
                      {aiGuidedAction.subscription.serviceName}
                    </Text>
                    <Text style={[styles.aiGuideCopy, { color: theme.muted }]}>
                      {aiGuidedAction.stepText}
                    </Text>

                    <Pressable
                      style={styles.aiGuideButton}
                      onPress={openAiGuidedAction}
                    >
                      <Text style={styles.aiAssistantButtonText}>
                        Open provider and continue
                      </Text>
                    </Pressable>
                  </View>
                ) : null}
              </ScrollView>

              {(aiRecorderState.isRecording || aiVoiceBusy) ? (
                <View style={styles.aiVoiceStatusRow}>
                  {aiRecorderState.isRecording ? (
                    <>
                      <View
                        style={[
                          styles.aiVoiceStatusDot,
                          { backgroundColor: "#E5484D" }
                        ]}
                      />
                      <Text
                        style={[
                          styles.aiVoiceStatusText,
                          { color: theme.text }
                        ]}
                      >
                        Listening… Tap stop when you're done
                      </Text>
                    </>
                  ) : (
                    <>
                      <ActivityIndicator
                        size="small"
                        color={theme.muted}
                      />
                      <Text
                        style={[
                          styles.aiVoiceStatusText,
                          { color: theme.muted }
                        ]}
                      >
                        {aiVoiceSending
                          ? "Sending…"
                          : "Transcribing…"}
                      </Text>
                    </>
                  )}
                </View>
              ) : null}

              <View style={styles.aiComposer}>
                <TextInput
                  ref={aiInputRef}
                  style={[
                    styles.aiComposerInput,
                    {
                      backgroundColor:
                        visual.surfaceInteractive,
                      borderColor:
                        visual.borderSubtle,
                      color: theme.text
                    }
                  ]}
                  placeholder="Try “pause YouTube”, “cancel Prime” or ask for help..."
                  placeholderTextColor={theme.muted}
                  value={aiInput}
                  onChangeText={setAiInput}
                  onSubmitEditing={askSavlivo}
                  onFocus={() => {
                    setTimeout(() => {
                      keepLatestAiMessageVisible(false);
                    }, 180);
                  }}
                  returnKeyType="send"
                />
                <Pressable
                  accessibilityLabel={
                    aiRecorderState.isRecording
                      ? "Stop voice recording"
                      : "Start voice recording"
                  }
                  style={[
                    styles.aiVoiceButton,
                    aiRecorderState.isRecording &&
                      styles.aiVoiceButtonRecording,
                    {
                      backgroundColor:
                        aiRecorderState.isRecording
                          ? "#FDECEC"
                          : visual.surfaceInteractive,
                      borderColor:
                        aiRecorderState.isRecording
                          ? "#E5484D"
                          : visual.borderSubtle
                    }
                  ]}
                  disabled={aiVoiceBusy}
                  onPress={
                    aiRecorderState.isRecording
                      ? stopAiVoiceRecording
                      : startAiVoiceRecording
                  }
                >
                  {aiVoiceBusy ? (
                    <ActivityIndicator
                      size="small"
                      color={theme.text}
                    />
                  ) : (
                    <>
                      <Ionicons
                        name={
                          aiRecorderState.isRecording
                            ? "stop"
                            : "mic-outline"
                        }
                        size={18}
                        color={
                          aiRecorderState.isRecording
                            ? "#C9363E"
                            : theme.text
                        }
                      />

                      <Text
                        style={[
                          styles.aiVoiceButtonLabel,
                          {
                            color:
                              aiRecorderState.isRecording
                                ? "#C9363E"
                                : theme.text
                          }
                        ]}
                      >
                        {aiRecorderState.isRecording
                          ? "Stop"
                          : "Talk"}
                      </Text>
                    </>
                  )}
                </Pressable>

                <Pressable
                  style={styles.aiSendButton}
                  onPress={askSavlivo}
                >
                  <Text style={styles.aiAssistantButtonText}>Send</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </View>
      ) : (
      <ScrollView
        style={styles.mainScroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {screen === "home" ? (
          <>
            <View style={styles.compactHomeHeading}>
              <View>
                <Text style={[styles.compactHomeEyebrow, { color: theme.muted }]}>
                  OVERVIEW
                </Text>
                <Text style={[styles.compactHomeTitle, { color: theme.text }]}>
                  Your subscriptions
                </Text>
              </View>

              <Pressable
                style={[
                  styles.compactPlanPill,
                  {
                    backgroundColor: theme.surface,
                    borderColor: theme.border
                  }
                ]}
                onPress={() => setScreen("plans")}
              >
                <Text style={[styles.compactPlanPillText, { color: theme.text }]}>
                  {plan} ›
                </Text>
              </Pressable>
            </View>

            <Pressable
              style={[
                styles.compactSavingsCard,
                softShadow,
                {
                  backgroundColor: visual.greenHero,
                  borderColor: darkMode ? "#175B3D" : visual.borderSubtle
                }
              ]}
              onPress={() => setScreen("savings")}
            >
              <View style={styles.compactSavingsHeader}>
                <View
                  style={[
                    styles.compactSavingsIcon,
                    { backgroundColor: darkMode ? "#15563A" : "#D2F5E1" }
                  ]}
                >
                  <Ionicons
                    name="trending-down-outline"
                    size={20}
                    color={visual.green}
                  />
                </View>

                <View style={styles.compactSavingsHeadingText}>
                  <Text
                    style={[
                      styles.compactSavingsEyebrow,
                      { color: visual.greenMuted }
                    ]}
                  >
                    YOU'RE SAVING
                  </Text>

                  <Text
                    style={[
                      styles.compactSavingsValue,
                      { color: theme.text }
                    ]}
                  >
                    {formatRegionalAggregate(currentMonthlySavingsRegionalMinor)}
                    <Text
                      style={[
                        styles.compactSavingsPeriod,
                        { color: theme.muted }
                      ]}
                    >
                      {" "}/ month
                    </Text>
                  </Text>
                </View>

                <Text
                  style={[
                    styles.compactChevronLarge,
                    { color: visual.greenMuted }
                  ]}
                >
                  ›
                </Text>
              </View>

              <View
                style={[
                  styles.compactSavingsDivider,
                  {
                    backgroundColor: darkMode
                      ? "#1B6244"
                      : "#BDEED2"
                  }
                ]}
              />

              <View style={styles.compactSavingsFooter}>
                <Text
                  style={[
                    styles.compactSavingsFooterLabel,
                    { color: theme.muted }
                  ]}
                >
                  Annual savings
                </Text>

                <Text
                  style={[
                    styles.compactSavingsFooterValue,
                    { color: visual.greenMuted }
                  ]}
                >
                  {formatRegionalAggregate(currentYearlySavingsRegionalMinor)}
                </Text>
              </View>
            </Pressable>

            <Pressable
              style={[
                styles.compactSpendCard,
                cardShadow,
                {
                  backgroundColor: darkMode
                    ? "rgba(255,255,255,0.045)"
                    : visual.surfaceRaised,
                  borderColor: darkMode
                    ? "rgba(255,255,255,0.09)"
                    : visual.borderSubtle
                }
              ]}
              onPress={() => setScreen("subscriptions")}
            >
              <View style={styles.compactCardTopRow}>
                <View
                  style={[
                    styles.compactMetricIconTile,
                    { backgroundColor: visual.greenSoft }
                  ]}
                >
                  <Ionicons
                    name="wallet-outline"
                    size={17}
                    color={visual.greenMuted}
                  />
                </View>

                <View
                  style={[
                    styles.compactMetricChevronButton,
                    {
                      backgroundColor: visual.surfaceInteractive
                    }
                  ]}
                >
                  <Ionicons
                    name="chevron-forward"
                    size={15}
                    color={theme.muted}
                  />
                </View>
              </View>

              <Text
                style={[
                  styles.compactMetricLabel,
                  { color: theme.muted }
                ]}
              >
                Current monthly spend
              </Text>

              <Text style={[styles.compactSpendValue, { color: theme.text }]}>
                {formatRegionalAggregate(totalMonthlyRegionalMinor)}
              </Text>

              <Text style={[styles.compactMetricHint, { color: theme.muted }]}>
                {activeCount} active of {items.length} subscriptions
              </Text>
            </Pressable>

            <View style={styles.compactAtGlanceHeader}>
              <Text
                style={[
                  styles.compactSectionLabel,
                  { color: theme.muted }
                ]}
              >
                AT A GLANCE
              </Text>
            </View>

            <View style={styles.compactMetricGrid}>
              <Pressable
                style={[
                  styles.compactMetricCard,
                  softShadow,
                  {
                    backgroundColor: visual.surfaceRaised,
                    borderColor: visual.borderSubtle
                  }
                ]}
                onPress={() => setRenewalsSheetOpen(true)}
              >
                <View style={styles.compactCardTopRow}>
                  <View
                    style={[
                      styles.compactMetricIconTile,
                      {
                        backgroundColor: visual.greenSoft
                      }
                    ]}
                  >
                    <Ionicons
                      name="calendar-outline"
                      size={17}
                      color={visual.greenMuted}
                    />
                  </View>

                  <View
                    style={[
                      styles.compactMetricChevronButton,
                      {
                        backgroundColor: visual.surfaceInteractive
                      }
                    ]}
                  >
                    <Ionicons
                      name="chevron-forward"
                      size={15}
                      color={theme.muted}
                    />
                  </View>
                </View>

                <Text
                  style={[
                    styles.compactMetricLabel,
                    { color: theme.muted }
                  ]}
                >
                  Next renewal
                </Text>

                <Text
                  style={[
                    styles.compactMetricValueSmall,
                    { color: theme.text }
                  ]}
                  numberOfLines={2}
                >
                  {nextRenewalDisplay}
                </Text>
              </Pressable>

              <Pressable
                style={[
                  styles.compactMetricCard,
                  softShadow,
                  {
                    backgroundColor: visual.surfaceRaised,
                    borderColor: visual.borderSubtle
                  }
                ]}
                onPress={() => setScreen("savings")}
              >
                <View style={styles.compactCardTopRow}>
                  <View
                    style={[
                      styles.compactMetricIconTile,
                      {
                        backgroundColor: visual.greenSoft
                      }
                    ]}
                  >
                    <Ionicons
                      name="wallet-outline"
                      size={17}
                      color={visual.greenMuted}
                    />
                  </View>

                  <View
                    style={[
                      styles.compactMetricChevronButton,
                      {
                        backgroundColor: visual.surfaceInteractive
                      }
                    ]}
                  >
                    <Ionicons
                      name="chevron-forward"
                      size={15}
                      color={theme.muted}
                    />
                  </View>
                </View>

                <Text
                  style={[
                    styles.compactMetricLabel,
                    { color: theme.muted }
                  ]}
                >
                  Annual spend
                </Text>

                <Text
                  style={[
                    styles.compactMetricValue,
                    { color: theme.text }
                  ]}
                >
                  {formatRegionalAggregate(
                    totalMonthlyRegionalMinor != null
                      ? totalMonthlyRegionalMinor * 12
                      : null
                  )}
                </Text>
              </Pressable>
            </View>

            {plan === "PREMIUM" ? (
              <>
                <View style={styles.compactSectionHeader}>
                  <Text style={[styles.compactSectionLabel, { color: theme.muted }]}>
                    NEXT BEST MOVE
                  </Text>
                </View>

                <Pressable
                  style={[
                    styles.compactActionCard,
                    softShadow,
                    {
                      backgroundColor: darkMode
                        ? visual.surfaceRaised
                        : visual.greenHero,
                      borderColor: darkMode
                        ? visual.borderSubtle
                        : visual.borderSubtle
                    }
                  ]}
                  onPress={() => setScreen("autopilot")}
                >
                  <View
                    style={[
                      styles.compactActionIcon,
                      {
                        backgroundColor: darkMode
                          ? visual.greenSoft
                          : "#FFFFFF",
                        borderColor: darkMode
                          ? "#19583D"
                          : visual.borderSubtle
                      }
                    ]}
                  >
                    <Ionicons
                      name="sparkles"
                      size={19}
                      color={visual.greenMuted}
                    />
                  </View>

                  <View style={styles.compactActionText}>
                    <Text style={[styles.compactActionTitle, { color: theme.text }]}>
                      {premiumPause
                        ? `Review ${premiumPause.item.serviceName}`
                        : "Your subscriptions look optimized"}
                    </Text>

                    <Text style={[styles.compactActionCopy, { color: theme.muted }]}>
                      {premiumPause
                        ? `3-month spend: ${formatRegionalAggregate(
                            premiumPause.monthly * 3
                          )}`
                        : "Open Autopilot to review your monthly action plan."}
                    </Text>
                  </View>

                  <View
                    style={[
                      styles.compactMetricChevronButton,
                      {
                        backgroundColor: darkMode
                          ? visual.surfaceInteractive
                          : "#FFFFFF"
                      }
                    ]}
                  >
                    <Ionicons
                      name="chevron-forward"
                      size={16}
                      color={visual.greenMuted}
                    />
                  </View>
                </Pressable>
              </>
            ) : null}

            {attentionItems.length > 0 ? (
              <>
                <View style={styles.compactSectionHeader}>
                  <Text style={[styles.compactSectionLabel, { color: theme.muted }]}>
                    NEEDS ATTENTION
                  </Text>

                  <View
                    style={[
                      styles.compactCountBadge,
                      { backgroundColor: theme.pill }
                    ]}
                  >
                    <Text style={[styles.compactCountText, { color: theme.text }]}>
                      {attentionItems.length}
                    </Text>
                  </View>
                </View>

                {attentionItems.slice(0, 2).map((attention) => (
                  <Pressable
                    key={attention.key}
                    style={[
                      styles.compactAttentionCard,
                      {
                        backgroundColor: theme.surface,
                        borderColor: theme.border
                      }
                    ]}
                    onPress={() => {
                      setScreen("subscriptions");
                      if (attention.fixData) {
                        openEditService(attention.subscription);
                      }
                    }}
                  >
                    <View style={styles.compactAttentionText}>
                      <Text
                        style={[styles.compactAttentionTitle, { color: theme.text }]}
                        numberOfLines={1}
                      >
                        {attention.title}
                      </Text>

                      <Text
                        style={[styles.compactActionCopy, { color: theme.muted }]}
                        numberOfLines={2}
                      >
                        {attention.detail}
                      </Text>
                    </View>

                    <Text style={[styles.compactChevronLarge, { color: theme.muted }]}>
                      ›
                    </Text>
                  </Pressable>
                ))}
              </>
            ) : null}

            <Pressable
              style={[
                styles.compactAiShortcut,
                {
                  borderColor: visual.borderSubtle
                }
              ]}
              onPress={() => setScreen("ai")}
            >
              <Ionicons
                name="chatbubble-ellipses-outline"
                size={18}
                color={theme.muted}
              />

              <Text style={[styles.compactAiText, { color: theme.muted }]}>
                Ask Savlivo AI
              </Text>

              <Text style={[styles.compactChevron, { color: theme.muted }]}>›</Text>
            </Pressable>
          </>
        ) : null}

        {screen === "subscriptions" ? (
          <>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: theme.text }]}>Subscriptions</Text>
              <Text style={[styles.badge, { backgroundColor: theme.pill, color: theme.text }]}>{items.length}</Text>
            </View>

            <Pressable
              style={[
                styles.addServiceButton,
                {
                  backgroundColor: visual.greenHero,
                  borderColor: visual.greenMuted
                }
              ]}
              onPress={openAddService}
            >
              <Text
                style={[
                  styles.addServiceText,
                  { color: theme.text }
                ]}
              >
                + Add service
              </Text>
            </Pressable>
            {items.map((item) => (
              <ServiceCard key={item.id} item={item} />
            ))}
          </>
        ) : null}

        {screen === "savings" ? (
          <>
            <View style={styles.modernScreenHeading}>
              <Text
                style={[
                  styles.modernScreenEyebrow,
                  { color: theme.muted }
                ]}
              >
                YOUR PROGRESS
              </Text>

              <Text
                style={[
                  styles.modernScreenTitle,
                  { color: theme.text }
                ]}
              >
                Savings
              </Text>

              <Text
                style={[
                  styles.modernScreenSubtitle,
                  { color: theme.muted }
                ]}
              >
                See what you are saving now and where your
                next review could make the biggest difference.
              </Text>
            </View>

            <View
              style={[
                styles.modernSavingsHero,
                cardShadow,
                {
                  backgroundColor: visual.greenHero,
                  borderColor: darkMode
                    ? "#19583D"
                    : visual.borderSubtle
                }
              ]}
            >
              <View style={styles.modernSavingsHeroTop}>
                <View
                  style={[
                    styles.modernSavingsHeroIcon,
                    {
                      backgroundColor: darkMode
                        ? "#145236"
                        : "#D5F5E3"
                    }
                  ]}
                >
                  <Ionicons
                    name="trending-up"
                    size={22}
                    color={visual.green}
                  />
                </View>

                <Text
                  style={[
                    styles.modernSavingsHeroLabel,
                    { color: visual.greenMuted }
                  ]}
                >
                  SAVED SO FAR
                </Text>
              </View>

              <Text
                style={[
                  styles.modernSavingsHeroValue,
                  { color: theme.text }
                ]}
              >
                {formatSavedSoFarAggregate(
                  savedSoFarRegionalMinor
                )}
              </Text>

              <Text
                style={[
                  styles.modernSavingsHeroNote,
                  { color: theme.muted }
                ]}
              >
                Accumulated while subscriptions were paused
                or cancelled.
              </Text>

              <View
                style={[
                  styles.modernSavingsHeroDivider,
                  {
                    backgroundColor: darkMode
                      ? "#235C43"
                      : "#BCEBD2"
                  }
                ]}
              />

              <View style={styles.modernSavingsHeroFooter}>
                <View style={styles.modernSavingsHeroStat}>
                  <Text
                    style={[
                      styles.modernSavingsStatLabel,
                      { color: theme.muted }
                    ]}
                  >
                    Saving now
                  </Text>

                  <Text
                    style={[
                      styles.modernSavingsStatValue,
                      { color: visual.green }
                    ]}
                  >
                    {formatRegionalAggregate(
                      currentMonthlySavingsRegionalMinor
                    )}
                    <Text
                      style={[
                        styles.modernSavingsStatPeriod,
                        { color: theme.muted }
                      ]}
                    >
                      {" "}/ mo
                    </Text>
                  </Text>
                </View>

                <View
                  style={[
                    styles.modernSavingsVerticalDivider,
                    {
                      backgroundColor: darkMode
                        ? "#235C43"
                        : "#BCEBD2"
                    }
                  ]}
                />

                <View style={styles.modernSavingsHeroStat}>
                  <Text
                    style={[
                      styles.modernSavingsStatLabel,
                      { color: theme.muted }
                    ]}
                  >
                    Annual pace
                  </Text>

                  <Text
                    style={[
                      styles.modernSavingsStatValue,
                      { color: theme.text }
                    ]}
                  >
                    {formatRegionalAggregate(
                      currentYearlySavingsRegionalMinor
                    )}
                  </Text>
                </View>
              </View>
            </View>

            <Text
              style={[
                styles.modernSectionEyebrow,
                { color: theme.muted }
              ]}
            >
              CURRENT POSITION
            </Text>

            <View style={styles.modernSavingsGrid}>
              <View
                style={[
                  styles.modernSavingsMetric,
                  {
                    backgroundColor: visual.surfaceRaised,
                    borderColor: visual.borderSubtle
                  }
                ]}
              >
                <View
                  style={[
                    styles.modernMetricIcon,
                    {
                      backgroundColor:
                        visual.greenSoft
                    }
                  ]}
                >
                  <Ionicons
                    name="card-outline"
                    size={18}
                    color={visual.greenMuted}
                  />
                </View>

                <Text
                  style={[
                    styles.modernSavingsMetricLabel,
                    { color: theme.muted }
                  ]}
                >
                  Monthly spend
                </Text>

                <Text
                  style={[
                    styles.modernSavingsMetricValue,
                    { color: theme.text }
                  ]}
                >
                  {formatRegionalAggregate(
                    totalMonthlyRegionalMinor
                  )}
                </Text>
              </View>

              <View
                style={[
                  styles.modernSavingsMetric,
                  {
                    backgroundColor: visual.surfaceRaised,
                    borderColor: visual.borderSubtle
                  }
                ]}
              >
                <View
                  style={[
                    styles.modernMetricIcon,
                    {
                      backgroundColor:
                        visual.greenSoft
                    }
                  ]}
                >
                  <Ionicons
                    name="calendar-outline"
                    size={18}
                    color={visual.greenMuted}
                  />
                </View>

                <Text
                  style={[
                    styles.modernSavingsMetricLabel,
                    { color: theme.muted }
                  ]}
                >
                  Annual spend
                </Text>

                <Text
                  style={[
                    styles.modernSavingsMetricValue,
                    { color: theme.text }
                  ]}
                >
                  {formatRegionalAggregate(
                    totalMonthlyRegionalMinor != null
                      ? totalMonthlyRegionalMinor * 12
                      : null
                  )}
                </Text>
              </View>
            </View>

            <View
              style={[
                styles.modernReviewableCard,
                softShadow,
                {
                  backgroundColor: visual.surfaceRaised,
                  borderColor: visual.borderSubtle
                }
              ]}
            >
              <View
                style={[
                  styles.modernReviewableIcon,
                  {
                    backgroundColor: visual.greenSoft
                  }
                ]}
              >
                <Ionicons
                  name="search-outline"
                  size={20}
                  color={visual.greenMuted}
                />
              </View>

              <View style={styles.modernReviewableContent}>
                <Text
                  style={[
                    styles.modernReviewableLabel,
                    { color: theme.muted }
                  ]}
                >
                  REVIEWABLE SPEND · 3 MONTHS
                </Text>

                <Text
                  style={[
                    styles.modernReviewableValue,
                    { color: theme.text }
                  ]}
                >
                  {formatRegionalAggregate(
                    savingsTabPotentialThreeMonthRegionalMinor
                  )}
                </Text>

                <Text
                  style={[
                    styles.modernReviewableNote,
                    { color: theme.muted }
                  ]}
                >
                  Active subscription spend worth reviewing,
                  not guaranteed savings.
                </Text>
              </View>
            </View>

            <View style={styles.modernRecommendationsHeader}>
              <View>
                <Text
                  style={[
                    styles.modernSectionEyebrow,
                    { color: theme.muted }
                  ]}
                >
                  WHERE TO LOOK NEXT
                </Text>

                <Text
                  style={[
                    styles.modernRecommendationsTitle,
                    { color: theme.text }
                  ]}
                >
                  Subscriptions to review
                </Text>
              </View>

              {recommendationCandidates.length > 0 ? (
                <View
                  style={[
                    styles.modernRecommendationCount,
                    {
                      backgroundColor:
                        visual.greenSoft
                    }
                  ]}
                >
                  <Text
                    style={[
                      styles.modernRecommendationCountText,
                      { color: theme.muted }
                    ]}
                  >
                    {recommendationCandidates.length}
                  </Text>
                </View>
              ) : null}
            </View>

            {recommendationCandidates.length === 0 ? (
              <View
                style={[
                  styles.modernEmptyCard,
                  {
                    backgroundColor: visual.surfaceRaised,
                    borderColor: visual.borderSubtle
                  }
                ]}
              >
                <Ionicons
                  name="checkmark-circle-outline"
                  size={22}
                  color={visual.green}
                />

                <Text
                  style={[
                    styles.modernEmptyText,
                    { color: theme.muted }
                  ]}
                >
                  You have no active services to review
                  right now.
                </Text>
              </View>
            ) : (
              recommendationCandidates.map((item, index) => (
                <Pressable
                  key={`rec-${item.id}`}
                  style={[
                    styles.modernRecommendationCard,
                    {
                      backgroundColor:
                        visual.surfaceRaised,
                      borderColor:
                        visual.borderSubtle
                    }
                  ]}
                  onPress={() =>
                    openActionSheet(item, "PAUSE")
                  }
                >
                  <View
                    style={[
                      styles.modernRecommendationRank,
                      {
                        backgroundColor:
                          index === 0
                            ? visual.greenSoft
                            : visual.surfaceInteractive
                      }
                    ]}
                  >
                    <Text
                      style={[
                        styles.modernRecommendationRankText,
                        {
                          color:
                            index === 0
                              ? visual.green
                              : theme.muted
                        }
                      ]}
                    >
                      {index + 1}
                    </Text>
                  </View>

                  <View
                    style={styles.modernRecommendationInfo}
                  >
                    <Text
                      style={[
                        styles.modernRecommendationName,
                        { color: theme.text }
                      ]}
                      numberOfLines={1}
                    >
                      Review {item.serviceName}
                    </Text>

                    <Text
                      style={[
                        styles.modernRecommendationCopy,
                        { color: theme.muted }
                      ]}
                    >
                      3-month spend:{" "}
                      {formatFinancialAggregate(
                        (billedMonthlyMinor(item) ?? 0) * 3
                      )}
                    </Text>
                  </View>

                  <Ionicons
                    name="chevron-forward"
                    size={18}
                    color={visual.greenMuted}
                  />
                </Pressable>
              ))
            )}
          </>
        ) : null}

        {screen === "autopilot" ? (
          <>
            <View style={styles.modernScreenHeading}>
              <Text
                style={[
                  styles.modernScreenEyebrow,
                  { color: visual.green }
                ]}
              >
                PREMIUM
              </Text>

              <Text
                style={[
                  styles.modernScreenTitle,
                  { color: theme.text }
                ]}
              >
                Autopilot
              </Text>

              <Text
                style={[
                  styles.modernScreenSubtitle,
                  { color: theme.muted }
                ]}
              >
                A focused monthly action plan based on your
                current subscriptions.
              </Text>
            </View>

            <View
              style={[
                styles.modernAutopilotHero,
                cardShadow,
                {
                  backgroundColor: visual.surfaceRaised,
                  borderColor: visual.borderSubtle
                }
              ]}
            >
              <View style={styles.modernAutopilotHeroTop}>
                <View
                  style={[
                    styles.modernAutopilotIcon,
                    {
                      backgroundColor: visual.greenSoft
                    }
                  ]}
                >
                  <Ionicons
                    name="sparkles"
                    size={22}
                    color={visual.green}
                  />
                </View>

                <View style={{ flex: 1 }}>
                  <Text
                    style={[
                      styles.modernAutopilotEyebrow,
                      { color: visual.green }
                    ]}
                  >
                    MONTHLY ACTION PLAN
                  </Text>

                  <Text
                    style={[
                      styles.modernAutopilotTitle,
                      { color: theme.text }
                    ]}
                  >
                    Focus on what matters
                  </Text>
                </View>
              </View>

              <Text
                style={[
                  styles.modernAutopilotIntro,
                  { color: theme.muted }
                ]}
              >
                Savlivo uses your active prices, statuses and
                renewal dates to prioritize what is worth
                reviewing. You stay in control of every change.
              </Text>
            </View>

            <Text
              style={[
                styles.modernSectionEyebrow,
                { color: theme.muted }
              ]}
            >
              THIS MONTH
            </Text>

            {premiumPause ? (
              <Pressable
                style={[
                  styles.modernPrimaryActionCard,
                  softShadow,
                  {
                    backgroundColor: visual.greenHero,
                    borderColor: darkMode
                      ? "#19583D"
                      : visual.borderSubtle
                  }
                ]}
                onPress={() =>
                  openActionSheet(
                    premiumPause.item,
                    "PAUSE"
                  )
                }
              >
                <View style={styles.modernActionRankColumn}>
                  <View
                    style={[
                      styles.modernPrimaryActionRank,
                      {
                        backgroundColor: visual.green
                      }
                    ]}
                  >
                    <Text
                      style={styles.modernPrimaryActionRankText}
                    >
                      1
                    </Text>
                  </View>
                </View>

                <View style={styles.modernPrimaryActionInfo}>
                  <Text
                    style={[
                      styles.modernPrimaryActionEyebrow,
                      { color: visual.greenMuted }
                    ]}
                  >
                    REVIEW FIRST
                  </Text>

                  <Text
                    style={[
                      styles.modernPrimaryActionTitle,
                      { color: theme.text }
                    ]}
                  >
                    {premiumPause.item.serviceName}
                  </Text>

                  <Text
                    style={[
                      styles.modernPrimaryActionCopy,
                      { color: theme.muted }
                    ]}
                  >
                    3-month spend:{" "}
                    {formatFinancialAggregate(
                      premiumPause.monthly * 3
                    )}
                  </Text>
                </View>

                <Ionicons
                  name="chevron-forward"
                  size={20}
                  color={visual.green}
                />
              </Pressable>
            ) : (
              <View
                style={[
                  styles.modernEmptyCard,
                  {
                    backgroundColor: visual.greenSoft,
                    borderColor: darkMode
                      ? "#19583D"
                      : visual.borderSubtle
                  }
                ]}
              >
                <Ionicons
                  name="checkmark-circle"
                  size={23}
                  color={visual.green}
                />

                <Text
                  style={[
                    styles.modernEmptyText,
                    { color: theme.text }
                  ]}
                >
                  Nothing urgent to review right now.
                </Text>
              </View>
            )}

            {premiumKeep.length ? (
              <>
                <Text
                  style={[
                    styles.modernSectionEyebrow,
                    {
                      color: theme.muted,
                      marginTop: 22
                    }
                  ]}
                >
                  GOOD TO KEEP
                </Text>

                {premiumKeep.map(({ item }) => (
                  <View
                    key={`keep-${item.id}`}
                    style={[
                      styles.modernKeepCard,
                      {
                        backgroundColor:
                          visual.surfaceRaised,
                        borderColor:
                          visual.borderSubtle
                      }
                    ]}
                  >
                    <View
                      style={[
                        styles.modernKeepIcon,
                        {
                          backgroundColor:
                            visual.surfaceInteractive
                        }
                      ]}
                    >
                      <Ionicons
                        name="checkmark"
                        size={17}
                        color={visual.green}
                      />
                    </View>

                    <View style={{ flex: 1 }}>
                      <Text
                        style={[
                          styles.modernKeepName,
                          { color: theme.text }
                        ]}
                      >
                        {item.serviceName}
                      </Text>

                      <Text
                        style={[
                          styles.modernKeepCopy,
                          { color: theme.muted }
                        ]}
                      >
                        Lower-cost active subscription
                      </Text>
                    </View>

                    <View
                      style={[
                        styles.modernKeepPill,
                        {
                          backgroundColor:
                            visual.surfaceInteractive
                        }
                      ]}
                    >
                      <Text
                        style={[
                          styles.modernKeepPillText,
                          { color: theme.muted }
                        ]}
                      >
                        KEEP
                      </Text>
                    </View>
                  </View>
                ))}
              </>
            ) : null}

            <View
              style={[
                styles.modernControlCard,
                {
                  backgroundColor: visual.surfaceRaised,
                  borderColor: visual.borderSubtle
                }
              ]}
            >
              <Ionicons
                name="shield-checkmark-outline"
                size={19}
                color={theme.muted}
              />

              <Text
                style={[
                  styles.modernControlCopy,
                  { color: theme.muted }
                ]}
              >
                Savlivo will ask before any subscription
                change is made.
              </Text>
            </View>
          </>
        ) : null}

        {screen === "settings" ? (
          <>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: theme.text }]}>
                Settings
              </Text>
            </View>

            {[
              {
                title: "Account & plan",
                icon: "person-outline" as const,
                rows: [
                  ["Email", email, ""],
                  ["Savlivo plan", plan, "Manage"]
                ]
              },
              {
                title: "Preferences",
                icon: "options-outline" as const,
                rows: [
                  ["Appearance", darkMode ? "Dark" : "Light", "Change"],
                  [
                    "Language",
                    ({
                    en: "English",
                    no: "Norsk",
                    sv: "Svenska",
                    da: "Dansk",
                    de: "Deutsch",
                    es: "Español",
                    fr: "Français",
                    it: "Italiano",
                    pt: "Português",
                    nl: "Nederlands",
                    fi: "Suomi",
                    "zh-CN": "简体中文"
                  } as Record<AppLanguage, string>)[selectedLanguage],
                    "Change"
                  ],
                  [
                    "Subscription market",
                    `${selectedCurrency} · ${selectedCountryName}${
                      pricingSnapshot?.updatedAt
                        ? ` · Prices checked ${new Date(
                            pricingSnapshot.updatedAt
                          ).toLocaleDateString()}`
                        : " · Pricing update pending"
                    }`,
                    "Change"
                  ]
                ]
              },
              {
                title: "Notifications",
                icon: "notifications-outline" as const,
                rows: [
                  ["Renewal reminders", "Alert before a subscription renews", "On"],
                  ["Savings opportunities", "Surface potential savings", "On"]
                ]
              },
              {
                title: "Premium & Autopilot",
                icon: "sparkles-outline" as const,
                rows: [
                  ["Ask before changes", "Require approval before automated actions", "On"],
                  ["Never pause", "Choose protected services later", "Configure"]
                ]
              },
              {
                title: "Privacy & data",
                icon: "shield-checkmark-outline" as const,
                rows: [
                  ["Export data", "Subscriptions and savings history", "Later"],
                  ["Delete account", "Remove your Savlivo account and data", "Later"]
                ]
              }
            ].map((group) => (
              <View
                key={group.title}
                style={[
                  styles.settingsGroup,
                  softShadow,
                  {
                    backgroundColor: visual.surfaceRaised,
                    borderColor: visual.borderSubtle
                  }
                ]}
              >
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: 4
                  }}
                >
                  <Text
                    style={[
                      styles.settingsGroupTitle,
                      { color: theme.text }
                    ]}
                  >
                    {group.title}
                  </Text>

                  <View
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: 11,
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: visual.greenSoft
                    }}
                  >
                    <Ionicons
                      name={group.icon}
                      size={18}
                      color={visual.greenMuted}
                    />
                  </View>
                </View>

                {group.rows.map(([title, value, action]) => (
                  <View
                    key={title}
                    style={[
                      styles.settingsRow,
                      { borderColor: visual.borderSubtle }
                    ]}
                  >
                    <View style={styles.settingsRowInfo}>
                      <Text style={[styles.settingsRowTitle, { color: theme.text }]}>
                        {title}
                      </Text>
                      <Text style={[styles.settingsRowValue, { color: theme.muted }]}>
                        {value}
                      </Text>
                    </View>

                    {action ? (
                      <Pressable
                        style={[
                          styles.settingsAction,
                          softShadow,
                          {
                            backgroundColor:
                              title === "Delete account"
                                ? darkMode
                                  ? "#3A1F21"
                                  : "#FDECEC"
                                : action === "On"
                                  ? visual.greenSoft
                                  : visual.surfaceInteractive
                          }
                        ]}
                        onPress={() => {
                          if (title === "Savlivo plan") setScreen("plans");
                          if (title === "Appearance") {
                            setDarkMode((value) => !value);
                          }
                          if (title === "Language") {
                            setLanguageModalOpen(true);
                          }
                          if (title === "Subscription market") {
                            setCountrySearch("");
                            setRegionModalOpen(true);
                          }
                        }}
                      >
                        <Text
                          style={[
                            styles.settingsActionText,
                            {
                              color:
                                title === "Delete account"
                                  ? darkMode
                                    ? "#FF8A80"
                                    : "#B42318"
                                  : action === "On"
                                    ? visual.greenMuted
                                    : theme.text
                            }
                          ]}
                        >
                          {action}
                        </Text>
                      </Pressable>
                    ) : null}
                  </View>
                ))}
              </View>
            ))}

            <Pressable
              style={[
                styles.settingsLogout,
                {
                  backgroundColor: visual.surfaceInteractive,
                  borderColor: visual.borderSubtle
                }
              ]}
              onPress={logout}
            >
              <Text
                style={[
                  styles.secondaryText,
                  { color: darkMode ? "#F3F4F6" : theme.text }
                ]}
              >
                Log out
              </Text>
            </Pressable>
          </>
        ) : null}
      </ScrollView>
      )}
      </KeyboardAvoidingView>

      {successMessage ? (
        <View pointerEvents="none" style={styles.successFloatingWrap}>
          <View
            style={[
              styles.successBanner,
              {
                backgroundColor: darkMode ? "#173226" : visual.greenSoft,
                borderColor: darkMode ? "#29543E" : visual.borderSubtle
              }
            ]}
          >
            <Text
              style={[
                styles.successBannerText,
                { color: darkMode ? "#E9F7EF" : visual.greenMuted }
              ]}
            >
              ✓ {successMessage}
            </Text>
          </View>
        </View>
      ) : null}

      <Modal
        transparent
        visible={languageModalOpen}
        animationType="fade"
        onRequestClose={() =>
          setLanguageModalOpen(false)
        }
      >
        <View style={styles.modalBackdrop}>
          <View
            style={[
              styles.regionSheet,
              {
                backgroundColor: darkMode
                  ? "#11171C"
                  : "#FFFFFF",
                borderColor: visual.borderSubtle
              }
            ]}
          >
            <View style={styles.regionHeader}>
              <View style={{ flex: 1 }}>
                <Text
                  style={[
                    styles.actionSheetTitle,
                    { color: theme.text }
                  ]}
                >
                  Language
                </Text>
                <Text
                  style={[
                    styles.formHint,
                    { color: theme.muted }
                  ]}
                >
                  Choose the language you want Savlivo to use.
                </Text>
              </View>

              <Pressable
                style={[
                  styles.regionClose,
                  {
                    backgroundColor: visual.greenSoft
                  }
                ]}
                onPress={() =>
                  setLanguageModalOpen(false)
                }
              >
                <Text
                  style={[
                    styles.actionText,
                    { color: visual.greenMuted }
                  ]}
                >
                  Done
                </Text>
              </Pressable>
            </View>

            {([
              ["en", "English"],
              ["no", "Norsk"],
              ["sv", "Svenska"],
              ["da", "Dansk"],
              ["de", "Deutsch"],
              ["es", "Español"],
              ["fr", "Français"],
              ["it", "Italiano"],
              ["pt", "Português"],
              ["nl", "Nederlands"],
              ["fi", "Suomi"],
              ["zh-CN", "简体中文"]
            ] as Array<[AppLanguage, string]>).map(
              ([code, label]) => {
                const selected =
                  selectedLanguage === code;

                return (
                  <Pressable
                    key={code}
                    style={[
                      styles.countryRow,
                      {
                        backgroundColor: selected
                          ? darkMode
                            ? "#3B4654"
                            : "#DDE7F2"
                          : theme.surface,
                        borderColor: selected
                          ? darkMode
                            ? "#8FB7E5"
                            : "#667D96"
                          : theme.border,
                        borderWidth: selected ? 2 : 1,
                        marginBottom: 10
                      }
                    ]}
                    onPress={() =>
                      setSelectedLanguage(code)
                    }
                  >
                    <View style={styles.countryInfo}>
                      <Text
                        style={[
                          styles.settingsRowTitle,
                          { color: theme.text }
                        ]}
                      >
                        {label}
                      </Text>
                    </View>

                    {selected ? (
                      <Ionicons
                        name="checkmark-circle"
                        size={22}
                        color={visual.green}
                      />
                    ) : null}
                  </Pressable>
                );
              }
            )}
          </View>
        </View>
      </Modal>

      <Modal
        transparent
        visible={regionModalOpen}
        animationType="slide"
        onRequestClose={() => setRegionModalOpen(false)}
      >
        <KeyboardAvoidingView
          style={styles.keyboardAvoider}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          keyboardVerticalOffset={12}
        >
          <View style={styles.modalBackdrop}>
            <View
              style={[
                styles.regionSheet,
                {
                  backgroundColor: darkMode
                    ? "#11171C"
                    : "#FFFFFF",
                  borderColor: visual.borderSubtle
                }
              ]}
            >
            <View style={styles.regionHeader}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.actionSheetTitle, { color: theme.text }]}>
                  Subscription market
                </Text>
                <Text style={[styles.formHint, { color: theme.muted }]}>
                  Choose the market for your subscriptions. Savlivo uses its local services, plans and currency.
                </Text>
              </View>
              <Pressable
                style={[
                  styles.regionClose,
                  { backgroundColor: visual.greenSoft }
                ]}
                onPress={() => setRegionModalOpen(false)}
              >
                <Text style={[styles.actionText, { color: visual.greenMuted }]}>Done</Text>
              </Pressable>
            </View>

            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: visual.surfaceInteractive,
                  borderColor: visual.borderInteractive,
                  color: theme.text
                }
              ]}
              placeholder="Search country"
              placeholderTextColor={theme.muted}
              value={countrySearch}
              onChangeText={setCountrySearch}
              autoCapitalize="none"
              autoCorrect={false}
            />

            <Text style={[styles.fieldLabel, { color: theme.muted }]}>
              Country / region
            </Text>

            <ScrollView
              style={[
                styles.countryList,
                {
                  backgroundColor: darkMode
                    ? "#11171C"
                    : "#FFFFFF"
                }
              ]}
              contentContainerStyle={styles.countryListContent}
              keyboardShouldPersistTaps="handled"
            >
              {filteredCountries.map(([code, name, currency]) => {
                const selected = code === selectedCountryCode;

                return (
                  <Pressable
                    key={code}
                    style={[
                      styles.countryRow,
                      {
                        backgroundColor: selected
                          ? darkMode
                            ? "#3B4654"
                            : "#DDE7F2"
                          : theme.surface,
                        borderColor: selected
                          ? darkMode
                            ? "#8FB7E5"
                            : "#667D96"
                          : theme.border,
                        borderWidth: selected ? 2 : 1
                      }
                    ]}
                    onPress={() => selectCountry(code, name, currency)}
                  >
                    <View style={styles.countryInfo}>
                      <Text style={[styles.countryName, { color: theme.text }]}>
                        {name}
                      </Text>
                      <Text style={[styles.countryMeta, { color: theme.muted }]}>
                        {code} · local currency {currency}
                      </Text>
                    </View>

                    {selected ? (
                      <Text style={[styles.countryCheck, { color: theme.text }]}>
                        ✓
                      </Text>
                    ) : null}
                  </Pressable>
                );
              })}
            </ScrollView>

            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal
        transparent
        visible={servicePickerOpen}
        animationType="slide"
        onRequestClose={() => setServicePickerOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <View
            style={[
              styles.servicePickerSheet,
              {
                backgroundColor: darkMode
                  ? "#11171C"
                  : "#FFFFFF",
                borderColor: theme.border
              }
            ]}
          >
            <View style={styles.servicePickerHeader}>
              <View style={{ flex: 1 }}>
                <Text
                  style={[
                    styles.actionSheetTitle,
                    { color: theme.text }
                  ]}
                >
                  Choose service
                </Text>

                <Text
                  style={[
                    styles.actionSheetBody,
                    {
                      color: theme.muted,
                      marginTop: 4
                    }
                  ]}
                >
                  Select the subscription service you want to add.
                </Text>
              </View>

              <Pressable
                accessibilityLabel="Close service picker"
                style={[
                  styles.servicePickerClose,
                  {
                    backgroundColor: theme.surfaceSoft,
                    borderColor: theme.border
                  }
                ]}
                onPress={() => setServicePickerOpen(false)}
              >
                <Ionicons
                  name="close"
                  size={20}
                  color={theme.text}
                />
              </Pressable>
            </View>

            <ScrollView
              style={[
                styles.servicePickerScroll,
                {
                  backgroundColor: darkMode
                    ? "#11171C"
                    : "#FFFFFF"
                }
              ]}
              contentContainerStyle={
                styles.servicePickerScrollContent
              }
              showsVerticalScrollIndicator={false}
            >
              {serviceCategories.map((category) => {
                const availableServices = serviceCatalog
                  .filter(
                    (service) =>
                      serviceAvailableInMarket(
                        service.slug,
                        selectedCountryCode
                      ) &&
                      category.slugs.includes(
                        service.slug as never
                      ) &&
                      !items.some(
                        (item) =>
                          item.serviceSlug === service.slug
                      )
                  )
                  .sort((a, b) =>
                    a.name.localeCompare(b.name)
                  );

                if (!availableServices.length) {
                  return null;
                }

                return (
                  <View
                    key={category.key}
                    style={styles.servicePickerCategory}
                  >
                    <Text
                      style={[
                        styles.servicePickerCategoryTitle,
                        { color: visual.greenMuted }
                      ]}
                    >
                      {category.name.toUpperCase()}
                    </Text>

                    <View
                      style={[
                        styles.servicePickerCategoryCard,
                        {
                          backgroundColor: theme.surfaceSoft,
                          borderColor: theme.border
                        }
                      ]}
                    >
                      {availableServices.map(
                        (service, index) => (
                          <Pressable
                            key={service.slug}
                            style={[
                              styles.servicePickerRow,
                              index <
                                availableServices.length - 1
                                ? {
                                    borderBottomWidth: 1,
                                    borderBottomColor:
                                      theme.border
                                  }
                                : null
                            ]}
                            onPress={() =>
                              beginAddService(service.slug)
                            }
                          >
                            <View
                              style={{
                                marginRight: 12
                              }}
                            >
                              <ServiceLogo
                                serviceSlug={service.slug}
                                serviceName={service.name}
                                size={38}
                              />
                            </View>

                            <Text
                              style={[
                                styles.servicePickerName,
                                { color: theme.text }
                              ]}
                            >
                              {service.name}
                            </Text>

                            <Ionicons
                              name="chevron-forward"
                              size={18}
                              color={visual.greenMuted}
                            />
                          </Pressable>
                        )
                      )}
                    </View>
                  </View>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal
        transparent
        visible={serviceFormOpen}
        animationType="slide"
        onRequestClose={() => setServiceFormOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <KeyboardAvoidingView
            style={{ flex: 1, width: "100%", justifyContent: "flex-end" }}
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            keyboardVerticalOffset={0}
          >
            <View
              style={[
                styles.serviceFormSheet,
                {
                  backgroundColor: darkMode
                    ? "#11171C"
                    : "#FFFFFF",
                  borderColor: theme.border
                }
              ]}
            >
              <ScrollView
                style={[
                  styles.serviceFormScroll,
                  {
                    backgroundColor: darkMode
                      ? "#11171C"
                      : "#FFFFFF"
                  }
                ]}
                contentContainerStyle={styles.serviceFormScrollContent}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode={
                  Platform.OS === "ios"
                    ? "interactive"
                    : "on-drag"
                }
                automaticallyAdjustKeyboardInsets={
                  Platform.OS === "ios"
                }
                showsVerticalScrollIndicator
              >
            <Text style={[styles.actionSheetTitle, { color: theme.text }]}>
              {editingSubscriptionId ? "Edit subscription" : "Add service"}
            </Text>

            <Text style={[styles.formHint, { color: theme.muted }]}>
              Tap a local plan price to fill it automatically. You can still edit the monthly price manually if your actual billed amount is different.
            </Text>

            <Text style={[styles.fieldLabel, { color: theme.muted }]}>
              Service
            </Text>
            <View style={styles.choiceWrap}>
              {(serviceSelectionLocked
                ? serviceCatalog.filter(
                    (service) =>
                      service.slug === serviceSlugInput
                  )
                : serviceCatalog.filter(
                    (service) =>
                      serviceAvailableInMarket(
                        service.slug,
                        selectedCountryCode
                      )
                  )
              ).map((service) => (
                <Pressable
                  key={service.slug}
                  style={[
                    styles.choiceChip,
                    {
                      backgroundColor:
                        serviceSlugInput === service.slug
                          ? darkMode
                            ? "#3B4654"
                            : "#DDE7F2"
                          : theme.surface,
                      borderColor:
                        serviceSlugInput === service.slug
                          ? darkMode
                            ? "#8FB7E5"
                            : "#667D96"
                          : theme.border,
                      borderWidth:
                        serviceSlugInput === service.slug ? 2 : 1
                    }
                  ]}
                  onPress={() => {
                    const nextServiceSlug =
                      service.slug;

                    const nextBillingProvider =
                      isBillingProviderAllowed(
                        nextServiceSlug,
                        billingProviderInput
                      )
                        ? billingProviderInput
                        : defaultBillingProviderForService(
                            nextServiceSlug
                          );

                    setServiceSlugInput(
                      nextServiceSlug
                    );

                    if (
                      nextBillingProvider !==
                      billingProviderInput
                    ) {
                      setBillingProviderInput(
                        nextBillingProvider
                      );
                    }

                    syncPlanAndPrice(
                      nextServiceSlug,
                      nextBillingProvider
                    );
                  }}
                >
                  <Text style={[styles.choiceChipText, { color: theme.text }]}>
                    {service.name}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text style={[styles.fieldLabel, { color: theme.muted }]}>
              Billing route
            </Text>
            <View style={styles.choiceWrap}>
              {billingProvidersForService(
                serviceSlugInput
              ).map((provider) => (
                <Pressable
                  key={provider.slug}
                  style={[
                    styles.choiceChip,
                    {
                      backgroundColor:
                        billingProviderInput === provider.slug
                          ? darkMode
                            ? "#3B4654"
                            : "#DDE7F2"
                          : theme.surface,
                      borderColor:
                        billingProviderInput === provider.slug
                          ? darkMode
                            ? "#8FB7E5"
                            : "#667D96"
                          : theme.border,
                      borderWidth:
                        billingProviderInput === provider.slug ? 2 : 1
                    }
                  ]}
                  onPress={() => {
                    setBillingProviderInput(provider.slug);
                    syncPlanAndPrice(
                      serviceSlugInput,
                      provider.slug
                    );
                  }}
                >
                  <Text style={[styles.choiceChipText, { color: theme.text }]}>
                    {provider.name}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text style={[styles.fieldLabel, { color: theme.muted }]}>
              Plan
            </Text>

            {regionalPlanOptions(
              serviceSlugInput,
              billingProviderInput
            ).length ? (
              <View style={styles.choiceWrap}>
                {regionalPlanOptions(
                  serviceSlugInput,
                  billingProviderInput
                ).map((planOption: any) => {
                  const name = String(
                    planOption.planName ??
                      planOption.planSlug ??
                      "Standard"
                  );
                  const selected =
                    subscriptionPlanInput.toLowerCase() ===
                    name.toLowerCase();

                  return (
                    <Pressable
                      key={`${planOption.planSlug}-${planOption.monthlyPriceMinor}`}
                      style={[
                        styles.choiceChip,
                        {
                          backgroundColor: selected
                            ? darkMode
                              ? "#3B4654"
                              : "#DDE7F2"
                            : theme.surface,
                          borderColor: selected
                            ? darkMode
                              ? "#8FB7E5"
                              : "#667D96"
                            : theme.border,
                          borderWidth: selected ? 2 : 1
                        }
                      ]}
                      onPress={() => {
                        setSubscriptionPlanInput(name);
                        syncPlanAndPrice(
                          serviceSlugInput,
                          billingProviderInput,
                          name
                        );
                      }}
                    >
                      <Text
                        style={[
                          styles.choiceChipText,
                          { color: theme.text }
                        ]}
                      >
                        {name} ·{" "}
                        {formatRegionalMinor(
                          planOption.monthlyPriceMinor,
                          planOption.currency ||
                            selectedCountryCurrency()
                        )}
                      </Text>

                      <Text
                        style={[
                          styles.priceVerificationText,
                          {
                            color:
                              planOption.verification === "registry" ||
                              planOption.verification === "multi-source" ||
                              planOption.verification ===
                                "authoritative-provider"
                                ? darkMode
                                  ? "#A7D7B8"
                                  : "#357A4F"
                                : theme.muted
                          }
                        ]}
                      >
                        {planOption.verification === "registry" ||
                        planOption.verification === "multi-source" ||
                        planOption.verification ===
                          "authoritative-provider"
                          ? "✓ Verified"
                          : "Estimated current price"}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : (
              <Text style={[styles.formHint, { color: theme.muted }]}>
                No verified regional plan pricing is available yet.
              </Text>
            )}

            {selectedCountryCode === "CN" &&
            regionalPlanOptions(
              serviceSlugInput,
              billingProviderInput
            ).some(
              (planOption: any) =>
                planOption.verification === "single-source"
            ) ? (
              <Text style={[styles.formHint, { color: theme.muted }]}>
                Estimated prices can vary by platform, promotion, and
                account. Check your actual subscription and edit the
                price manually below if needed.
              </Text>
            ) : null}

            {(() => {
              const targetId =
                editingSubscriptionIdRef.current ??
                editingSubscriptionId ??
                null;

              const existing =
                targetId
                  ? items.find(
                      (item) => item.id === targetId
                    ) ?? null
                  : null;

              const billCurrency =
                existing?.currency ||
                selectedCountryCurrency();

              const automaticMinor =
                selectedPlanPriceMinor();

              const catalogCurrency =
                selectedCountryCurrency();

              const canUseAutomatic =
                Boolean(targetId) &&
                automaticMinor != null &&
                Boolean(billCurrency) &&
                billCurrency === catalogCurrency;

              return (
                <>
                  <Text
                    style={[
                      styles.fieldLabel,
                      { color: theme.muted }
                    ]}
                  >
                    Monthly price ({billCurrency})
                  </Text>

                  {canUseAutomatic &&
                  automaticMinor != null ? (
                    <Pressable
                      style={[
                        styles.choiceChip,
                        {
                          alignSelf: "stretch",
                          marginBottom: 10,
                          justifyContent: "center",
                          borderColor:
                            darkMode
                              ? "#78B6F5"
                              : "#667D96"
                        }
                      ]}
                      onPress={() => {
                        setMonthlyPriceInput(
                          (
                            automaticMinor / 100
                          ).toFixed(2)
                        );
                      }}
                    >
                      <Text
                        style={[
                          styles.choiceChipText,
                          {
                            color: theme.text,
                            textAlign: "center"
                          }
                        ]}
                      >
                        Use automatic price ·{" "}
                        {formatRegionalMinor(
                          automaticMinor,
                          catalogCurrency
                        )}
                      </Text>

                      <Text
                        style={[
                          styles.priceVerificationText,
                          {
                            color: theme.muted,
                            textAlign: "center",
                            marginTop: 3
                          }
                        ]}
                      >
                        Verified local catalog price
                      </Text>
                    </Pressable>
                  ) : null}

                  <TextInput
                    style={[
                      styles.input,
                      {
                        backgroundColor:
                          theme.surfaceSoft,
                        borderColor: theme.border,
                        color: theme.text
                      }
                    ]}
                    placeholder="12.99"
                    placeholderTextColor={theme.muted}
                    keyboardType="decimal-pad"
                    value={monthlyPriceInput}
                    onChangeText={
                      setMonthlyPriceInput
                    }
                  />

                  {targetId ? (
                    <Text
                      style={[
                        styles.formHint,
                        {
                          color: theme.muted,
                          marginTop: 6,
                          marginBottom: 14
                        }
                      ]}
                    >
                      This is your actual billed amount.
                      You can edit it manually.
                    </Text>
                  ) : null}
                </>
              );
            })()}

            <Text style={[styles.fieldLabel, { color: theme.muted }]}>
              Renewal date
            </Text>

            <View style={styles.renewalDateRow}>
              {Platform.OS === "ios" ? (
                <View
                  style={[
                    styles.renewalDateButton,
                    {
                      backgroundColor: theme.surfaceSoft,
                      borderColor: theme.border
                    }
                  ]}
                >
                  <Text
                    style={[
                      styles.renewalDateValue,
                      { color: theme.muted }
                    ]}
                  >
                    {renewalDateInput
                      ? "Renewal date"
                      : "Choose renewal date"}
                  </Text>

                  <DateTimePicker
                    value={renewalPickerDate()}
                    mode="date"
                    display="compact"
                    minimumDate={dateOnlyToLocalDate(formatDateForInput(new Date()))}
                    onChange={onRenewalDateChange}
                    themeVariant={darkMode ? "dark" : "light"}
                  />
                </View>
              ) : (
                <>
                  <Pressable
                    style={[
                      styles.renewalDateButton,
                      {
                        backgroundColor: theme.surfaceSoft,
                        borderColor: theme.border
                      }
                    ]}
                    onPress={() => setShowRenewalDatePicker(true)}
                  >
                    <Text
                      style={[
                        styles.renewalDateValue,
                        {
                          color: renewalDateInput
                            ? theme.text
                            : theme.muted
                        }
                      ]}
                    >
                      {renewalDateInput || "Choose renewal date"}
                    </Text>

                    <Text
                      style={[
                        styles.renewalCalendarIcon,
                        { color: theme.text }
                      ]}
                    >
                      📅
                    </Text>
                  </Pressable>

                  {showRenewalDatePicker ? (
                    <DateTimePicker
                      value={renewalPickerDate()}
                      mode="date"
                      display="default"
                      minimumDate={dateOnlyToLocalDate(formatDateForInput(new Date()))}
                      onChange={onRenewalDateChange}
                    />
                  ) : null}
                </>
              )}

              {renewalDateInput ? (
                <Pressable
                  style={[
                    styles.clearRenewalButton,
                    { borderColor: theme.border }
                  ]}
                  onPress={() => {
                    setRenewalDateInput("");
                    setShowRenewalDatePicker(false);
                  }}
                >
                  <Text style={{ color: theme.muted, fontWeight: "800" }}>
                    Clear
                  </Text>
                </Pressable>
              ) : null}
            </View>



              </ScrollView>

            <View style={styles.serviceFormFooter}>
              <View style={styles.actionSheetButtons}>
              <Pressable
                style={[styles.sheetButton, { borderColor: theme.border }]}
                onPress={() => {
                editingSubscriptionIdRef.current = null;
                setEditingSubscriptionId(null);
                setServiceFormOpen(false);
              }}
              >
                <Text style={[styles.sheetButtonText, { color: theme.text }]}>
                  Cancel
                </Text>
              </Pressable>

              <Pressable
                style={[
                  styles.sheetButton,
                  styles.sheetButtonPrimary,
                  { backgroundColor: darkMode ? "#F3F4F6" : "#111827" }
                ]}
                onPress={saveServiceForm}
              >
                <Text
                  style={[
                    styles.sheetButtonText,
                    { color: darkMode ? "#111827" : "#FFFFFF" }
                  ]}
                >
                  Save
                </Text>
              </Pressable>
            </View>

            {editingSubscriptionId ? (
              <Pressable
                style={[
                  styles.removeServiceButton,
                  styles.removeServiceButtonBottom,
                  { borderColor: darkMode ? "#FF8A80" : "#D92D20" }
                ]}
                onPress={() => {
                  Alert.alert(
                    "Remove subscription?",
                    "This removes the service from Savlivo. It does not cancel the subscription at the provider.",
                    [
                      { text: "Keep", style: "cancel" },
                      {
                        text: "Remove",
                        style: "destructive",
                        onPress: removeSubscription
                      }
                    ]
                  );
                }}
              >
                <Text
                  style={[
                    styles.removeServiceText,
                    { color: darkMode ? "#FF8A80" : "#B42318" }
                  ]}
                >
                  Remove service
                </Text>
              </Pressable>
            ) : null}
            </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      <Modal
        transparent
        visible={statusConfirmOpen}
        animationType="fade"
        onRequestClose={() => setStatusConfirmOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <View
            style={[
              styles.actionSheet,
              {
                backgroundColor: darkMode
                  ? "#11171C"
                  : "#FFFFFF",
                borderColor: theme.border
              }
            ]}
          >
            <Text style={[styles.actionSheetTitle, { color: theme.text }]}>
              What changed at the provider?
            </Text>

            <Text style={[styles.actionSheetBody, { color: theme.muted }]}>
              Tell Savlivo what actually happened so spending and savings stay accurate.
            </Text>

            <Text style={[styles.fieldLabel, { color: theme.muted }]}>
              Effective date
            </Text>
            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: visual.surfaceInteractive,
                  borderColor: visual.borderInteractive,
                  color: theme.text
                }
              ]}
              placeholder="2026-09-15"
              placeholderTextColor={theme.muted}
              value={statusEffectiveDateInput}
              onChangeText={setStatusEffectiveDateInput}
              autoCapitalize="none"
            />

            <View style={styles.statusChoiceWrap}>
              {pendingProviderResult?.action === "PAUSE" ? (
                <Pressable
                  style={[
                    styles.statusChoiceButton,
                    { borderColor: theme.border }
                  ]}
                  onPress={() =>
                    confirmProviderStatus("PAUSED")
                  }
                >
                  <Text
                    style={[
                      styles.sheetButtonText,
                      { color: theme.text }
                    ]}
                  >
                    Yes, it was paused
                  </Text>
                </Pressable>
              ) : null}

              {pendingProviderResult?.action === "CANCEL" ? (
                <Pressable
                  style={[
                    styles.statusChoiceButton,
                    { borderColor: theme.border }
                  ]}
                  onPress={() =>
                    confirmProviderStatus("CANCELLED")
                  }
                >
                  <Text
                    style={[
                      styles.sheetButtonText,
                      { color: theme.text }
                    ]}
                  >
                    Yes, it was cancelled
                  </Text>
                </Pressable>
              ) : null}

              {pendingProviderResult?.action === "REACTIVATE" ? (
                <Pressable
                  style={[
                    styles.statusChoiceButton,
                    { borderColor: theme.border }
                  ]}
                  onPress={() =>
                    confirmProviderStatus("ACTIVE")
                  }
                >
                  <Text
                    style={[
                      styles.sheetButtonText,
                      { color: theme.text }
                    ]}
                  >
                    Yes, it is active
                  </Text>
                </Pressable>
              ) : null}

              <Pressable
                style={[
                  styles.statusChoiceButton,
                  { borderColor: theme.border }
                ]}
                onPress={() =>
                  confirmProviderStatus("UNCHANGED")
                }
              >
                <Text
                  style={[
                    styles.sheetButtonText,
                    { color: theme.muted }
                  ]}
                >
                  No change
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        transparent
        visible={renewalsSheetOpen}
        animationType="fade"
        onRequestClose={() => setRenewalsSheetOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <View
            style={[
              styles.actionSheet,
              styles.renewalSheet,
              {
                backgroundColor: darkMode
                  ? "#11171C"
                  : "#FFFFFF",
                borderColor: theme.border
              }
            ]}
          >
            <Text style={[styles.actionSheetTitle, { color: theme.text }]}>
              Upcoming renewals
            </Text>

            <Text style={[styles.actionSheetBody, { color: theme.muted }]}>
              Confirmed renewal dates for your active subscriptions.
            </Text>

            <ScrollView
              style={styles.renewalListScroll}
              contentContainerStyle={styles.renewalList}
              showsVerticalScrollIndicator
              nestedScrollEnabled
            >
              {upcomingRenewals.length ? (
                upcomingRenewals.map((item) => (
                  <View
                    key={item.id}
                    style={[
                      styles.renewalListRow,
                      { borderColor: theme.border }
                    ]}
                  >
                    <View style={{ flex: 1 }}>
                      <Text
                        style={[
                          styles.renewalListService,
                          { color: theme.text }
                        ]}
                      >
                        {item.serviceName}
                      </Text>
                      <Text
                        style={[
                          styles.renewalListRoute,
                          { color: theme.muted }
                        ]}
                      >
                        {item.billingProviderSlug}
                      </Text>
                    </View>

                    <Text
                      style={[
                        styles.renewalListDate,
                        { color: theme.text }
                      ]}
                    >
                      {formatRenewalDateDisplay(item.renewalDate)}
                    </Text>
                  </View>
                ))
              ) : (
                <View
                  style={[
                    styles.renewalListRow,
                    { borderColor: theme.border }
                  ]}
                >
                  <Text style={[styles.muted, { color: theme.muted }]}>
                    No confirmed renewal dates yet.
                  </Text>
                </View>
              )}
            </ScrollView>

            <Pressable
              style={[
                styles.sheetButton,
                styles.renewalDoneButton,
                { borderColor: theme.border }
              ]}
              onPress={() => setRenewalsSheetOpen(false)}
            >
              <Text style={[styles.sheetButtonText, { color: theme.text }]}>
                Done
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal
        transparent
        visible={!!actionSheet}
        animationType="fade"
        onRequestClose={() => setActionSheet(null)}
      >
        <View style={styles.modalBackdrop}>
          <View
            style={[
              styles.actionSheet,
              {
                backgroundColor: darkMode
                  ? "#11171C"
                  : "#FFFFFF",
                borderColor: theme.border
              }
            ]}
          >
            <Text style={[styles.actionSheetTitle, { color: theme.text }]}>
              {getActionSheetCopy().title}
            </Text>

            <Text style={[styles.actionSheetBody, { color: theme.muted }]}>
              {getActionSheetCopy().body}
            </Text>

            <View style={styles.actionSheetButtons}>
              <Pressable
                style={[
                  styles.sheetButton,
                  { borderColor: theme.border }
                ]}
                onPress={() => setActionSheet(null)}
              >
                <Text style={[styles.sheetButtonText, { color: theme.text }]}>
                  Not now
                </Text>
              </Pressable>

              <Pressable
                style={[
                  styles.sheetButton,
                  styles.sheetButtonPrimary,
                  {
                    backgroundColor: darkMode ? "#F3F4F6" : "#111827"
                  }
                ]}
                onPress={confirmActionSheet}
              >
                <Text
                  style={[
                    styles.sheetButtonText,
                    { color: darkMode ? "#111827" : "#FFFFFF" }
                  ]}
                >
                  {getActionSheetCopy().confirm}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#f4f6f8"
  },

  content: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 48,
    gap: 12
  },

  aiPageContent: {
    flexGrow: 1,
    paddingBottom: 0
  },

  aiStandaloneViewport: {
    flex: 1,
    minHeight: 0,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 0
  },

  authCard: {
    padding: 24,
    gap: 12,
    marginTop: 80
  },

  brand: {
    fontSize: 32,
    fontWeight: "800",
    letterSpacing: -0.6
  },

  tagline: {
    color: "#667085",
    marginTop: 2
  },

  modernBrandLockup: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    minWidth: 0
  },

  modernHeaderLogo: {
    width: 36,
    height: 36,
    borderRadius: 10,
    marginLeft: 6,
    marginRight: 3
  } as import("react-native").ImageStyle,

  modernBrandName: {
    fontSize: 24,
    fontWeight: "900",
    letterSpacing: -0.7
  },

  modernPlanBadge: {
    marginLeft: 10,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999
  },

  modernPlanBadgeText: {
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.6
  },

  modernNavRow: {
    minHeight: 58,
    borderRadius: 17,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 5,
    paddingVertical: 5,
    marginTop: 8
  },

  modernNavItem: {
    flex: 1,
    minWidth: 0,
    alignItems: "center",
    justifyContent: "center"
  },

  modernNavIconWrap: {
    width: 34,
    height: 29,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center"
  },

  modernNavText: {
    fontSize: 9,
    fontWeight: "700",
    marginTop: 3
  },

  modernNavTextActive: {
    fontWeight: "900"
  },

  stickyHeader: {
    marginHorizontal: -16,
    paddingHorizontal: 16,
    paddingTop: 3,
    paddingBottom: 9,
    borderBottomWidth: StyleSheet.hairlineWidth,
    zIndex: 50,
    elevation: 4
  },

  brandLockup: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    minWidth: 0
  },

  headerLogo: {
    width: 44,
    height: 44,
    borderRadius: 11,
    marginRight: 10
  } as import("react-native").ImageStyle,

  brandTextBlock: {
    flex: 1,
    minWidth: 0
  },

  headerPlanRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 1
  },

  headerPlanText: {
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.4
  },

  headerBuildText: {
    fontSize: 11,
    fontWeight: "600"
  },

  mainKeyboardViewport: {
    flex: 1,
    minHeight: 0
  },

  mainScroll: {
    flex: 1,
    minHeight: 0
  },

  compactHomeHeading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 12,
    marginBottom: 10
  },

  compactHomeEyebrow: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1
  },

  compactHomeTitle: {
    fontSize: 24,
    fontWeight: "900",
    letterSpacing: -0.5,
    marginTop: 2
  },

  compactPlanPill: {
    minHeight: 34,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center"
  },

  compactPlanPillText: {
    fontSize: 11,
    fontWeight: "800"
  },

  compactSpendCard: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 18,
    marginBottom: 14
  },

  compactCardTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },

  compactMetricLabel: {
    fontSize: 11,
    fontWeight: "700"
  },

  compactMetricHint: {
    fontSize: 11,
    marginTop: 3
  },

  compactChevron: {
    fontSize: 20,
    fontWeight: "500",
    lineHeight: 20
  },

  compactChevronLarge: {
    fontSize: 28,
    fontWeight: "400",
    marginLeft: 8
  },

  compactSpendValue: {
    fontSize: 27,
    fontWeight: "900",
    letterSpacing: -1,
    marginTop: 5
  },

  compactSavingsCard: {
    borderWidth: 1,
    borderRadius: 24,
    paddingHorizontal: 20,
    paddingVertical: 19,
    marginBottom: 26
  },
  compactSavingsHeader: {
    flexDirection: "row",
    alignItems: "center"
  },
  compactSavingsIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 14
  },
  compactSavingsHeadingText: {
    flex: 1
  },
  compactSavingsEyebrow: {
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1.4,
    marginBottom: 5
  },
  compactSavingsValue: {
    fontSize: 34,
    fontWeight: "800",
    letterSpacing: -0.6
  },
  compactSavingsPeriod: {
    fontSize: 15,
    fontWeight: "600",
    letterSpacing: 0
  },
  compactSavingsDivider: {
    height: 1,
    marginVertical: 16
  },
  compactSavingsFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },
  compactSavingsFooterLabel: {
    fontSize: 14,
    fontWeight: "600"
  },
  compactSavingsFooterValue: {
    fontSize: 15,
    fontWeight: "800"
  },
  compactAtGlanceHeader: {
    marginBottom: 12
  },

  compactMetricGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    rowGap: 10,
    marginBottom: 8
  },

  compactMetricCard: {
    width: "48.5%",
    minHeight: 128,
    borderRadius: 19,
    borderWidth: 1,
    padding: 14,
    justifyContent: "space-between"
  },

  compactSpendIconTile: {
    width: 36,
    height: 36,
    borderRadius: 11,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center"
  },

  compactMetricIconTile: {
    width: 36,
    height: 36,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center"
  },

  compactMetricChevronButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center"
  },

  compactMetricValue: {
    fontSize: 21,
    fontWeight: "900",
    letterSpacing: -0.4
  },

  compactMetricValueSmall: {
    fontSize: 16,
    lineHeight: 20,
    fontWeight: "800"
  },

  compactSectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 20,
    marginBottom: 9
  },

  compactSectionLabel: {
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1,
    flex: 1
  },

  compactCountBadge: {
    minWidth: 24,
    height: 24,
    paddingHorizontal: 7,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center"
  },

  compactCountText: {
    fontSize: 11,
    fontWeight: "900"
  },

  compactActionCard: {
    minHeight: 88,
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 15,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center"
  },

  compactActionIcon: {
    width: 42,
    height: 42,
    borderRadius: 13,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12
  },

  compactActionText: {
    flex: 1,
    minWidth: 0
  },

  compactActionTitle: {
    fontSize: 15,
    fontWeight: "800"
  },

  compactActionCopy: {
    fontSize: 11,
    lineHeight: 16,
    marginTop: 3
  },

  compactAttentionCard: {
    minHeight: 68,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 11,
    marginBottom: 8,
    flexDirection: "row",
    alignItems: "center"
  },

  compactAttentionText: {
    flex: 1,
    minWidth: 0
  },

  compactAttentionTitle: {
    fontSize: 14,
    fontWeight: "800"
  },

  compactAiShortcut: {
    minHeight: 48,
    borderTopWidth: 1,
    marginTop: 18,
    marginBottom: 10,
    paddingTop: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8
  },

  compactAiText: {
    flex: 1,
    fontSize: 13,
    fontWeight: "700"
  },

  top: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12
  },

  topActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6
  },

  themeToggle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center"
  },

  themeIcon: {
    fontSize: 19,
    fontWeight: "700"
  },

  logoutButton: {
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: 8
  },

  logoutText: {
    color: "#667085",
    fontWeight: "700"
  },

  renewalDateRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8
  },

  renewalDateButton: {
    flex: 1,
    minHeight: 50,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },

  renewalDateValue: {
    fontSize: 15,
    fontWeight: "700"
  },

  renewalCalendarIcon: {
    fontSize: 18
  },

  clearRenewalButton: {
    minHeight: 50,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center"
  },

  renewalPickerWrap: {
    marginTop: 8,
    borderWidth: 1,
    borderRadius: 16,
    padding: 8,
    overflow: "hidden"
  },

  doneDateButton: {
    minHeight: 42,
    marginTop: 6,
    borderWidth: 1,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center"
  },

  input: {
    minHeight: 50,
    borderWidth: 1,
    borderColor: "#D8E0DB",
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    paddingHorizontal: 14
  },

  passwordInputWrap: {
    position: "relative"
  },
  passwordInput: {
    paddingRight: 50
  },
  passwordVisibilityButton: {
    position: "absolute",
    right: 4,
    top: 0,
    bottom: 0,
    width: 44,
    alignItems: "center",
    justifyContent: "center"
  },
  rememberMeRow: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    marginTop: 2,
    marginBottom: 14
  },
  rememberMeBox: {
    width: 22,
    height: 22,
    borderWidth: 1.5,
    borderRadius: 5,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10
  },
  rememberMeText: {
    fontSize: 15,
    fontWeight: "600"
  },
  primary: {
    width: "100%",
    minHeight: 50,
    borderRadius: 14,
    backgroundColor: "#111827",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16
  },

  primaryText: {
    color: "#fff",
    fontWeight: "800"
  },

  secondary: {
    width: "100%",
    minHeight: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#D8E0DB",
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16
  },

  secondaryText: {
    fontWeight: "800"
  },

  navRow: {

    marginTop: 6,width: "100%",
    minHeight: 72,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    borderWidth: 1,
    borderRadius: 22,
    paddingHorizontal: 4,
    paddingVertical: 7,
    marginBottom: 8
  },

  navItem: {
    flex: 1,
    minWidth: 0,
    minHeight: 56,
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    paddingHorizontal: 1
  },

  navIconWrap: {
    minWidth: 38,
    height: 30,
    paddingHorizontal: 9,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center"
  },

  navItemActive: {
    backgroundColor: "transparent"
  },

  navText: {
    fontSize: 10,
    fontWeight: "600",
    textAlign: "center"
  },

  navTextActive: {
    fontWeight: "800"
  },

  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginTop: 4
  },

  sectionTitle: {
    fontSize: 24,
    fontWeight: "800",
    letterSpacing: -0.4
  },

  badge: {
    backgroundColor: "#e7eaee",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    fontWeight: "800"
  },

  planStatus: {
    width: "100%",
    backgroundColor: "#EDF9F2",
    borderWidth: 1,
    borderColor: "#E6ECE8",
    borderRadius: 20,
    padding: 16,
    gap: 12
  },

  planStatusViewer: {
    backgroundColor: "#FFFFFF",
    borderColor: "#E6ECE8"
  },

  planStatusTitle: {
    fontSize: 18,
    fontWeight: "800",
    marginBottom: 4
  },

  changePlan: {
    width: "100%",
    minHeight: 46,
    borderWidth: 1,
    borderColor: "#D8E0DB",
    borderRadius: 12,
    paddingHorizontal: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF"
  },

  changePlanText: {
    fontWeight: "800"
  },

  muted: {
    color: "#667085",
    lineHeight: 20
  },

  empty: {
    width: "100%",
    backgroundColor: "#fff",
    borderRadius: 18,
    padding: 18,
    gap: 12
  },

  emptyTitle: {
    fontSize: 18,
    fontWeight: "800"
  },

  modernSubscriptionCard: {
    width: "100%",
    borderWidth: 1,
    borderRadius: 19,
    padding: 15,
    marginBottom: 9
  },

  modernSubscriptionTop: {
    flexDirection: "row",
    alignItems: "center"
  },

  modernSubscriptionLogo: {
    width: 48,
    height: 48,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
    flexShrink: 0
  },

  modernSubscriptionLogoText: {
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "900"
  },

  modernSubscriptionInfo: {
    flex: 1,
    minWidth: 0
  },

  modernSubscriptionName: {
    fontSize: 17,
    fontWeight: "900",
    letterSpacing: -0.25
  },

  modernSubscriptionProvider: {
    fontSize: 12,
    marginTop: 3
  },

  modernSubscriptionPriceBlock: {
    alignItems: "flex-end",
    marginLeft: 10,
    maxWidth: "40%"
  },

  modernSubscriptionPrice: {
    fontSize: 17,
    fontWeight: "900",
    letterSpacing: -0.3
  },

  modernSubscriptionPerMonth: {
    fontSize: 10,
    marginTop: 2
  },

  modernSubscriptionMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 13
  },

  modernStatusPill: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 999
  },

  modernStatusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 5
  },

  modernStatusText: {
    fontSize: 10,
    fontWeight: "900"
  },

  modernRenewalMeta: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    marginLeft: 11
  },

  modernRenewalText: {
    flex: 1,
    minWidth: 0,
    fontSize: 11,
    marginLeft: 5
  },

  modernSavedRow: {
    minHeight: 34,
    borderRadius: 11,
    marginTop: 12,
    paddingHorizontal: 11,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },

  modernSavedLabel: {
    fontSize: 11,
    fontWeight: "700"
  },

  modernSavedValue: {
    fontSize: 13,
    fontWeight: "900"
  },

  modernSubscriptionActions: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 13,
    gap: 8
  },

  modernActionButton: {
    minHeight: 36,
    borderRadius: 11,
    borderWidth: 1,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5
  },

  modernActionText: {
    fontSize: 11,
    fontWeight: "800"
  },

  modernEditButton: {
    width: 36,
    height: 36,
    borderRadius: 11,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: "auto"
  },

  card: {
    width: "100%",
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 16,
    gap: 14
  },

  cardTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12
  },

  logoBubble: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: "#111827",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0
  },

  logoText: {
    color: "#fff",
    fontWeight: "900",
    fontSize: 17
  },

  cardInfo: {
    flex: 1,
    minWidth: 0
  },

  service: {
    fontSize: 18,
    fontWeight: "800"
  },

  provider: {
    color: "#667085",
    marginTop: 3,
    flexShrink: 1
  },

  statusPill: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 5,
    marginTop: 8
  },

  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4
  },

  statusPillText: {
    fontSize: 12,
    fontWeight: "800"
  },

  manualModeCard: {
    borderWidth: 1,
    borderRadius: 22,
    padding: 16,
    marginBottom: 18,
    gap: 10
  },

  aiKeyboardAvoider: {
    flex: 1,
    minHeight: 0
  },

  aiGuideCard: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    marginTop: 10
  },

  aiGuideEyebrow: {
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1
  },

  aiGuideTitle: {
    fontSize: 15,
    fontWeight: "900",
    marginTop: 4
  },

  aiGuideCopy: {
    fontSize: 11,
    lineHeight: 16,
    marginTop: 5
  },

  aiGuideButton: {
    minHeight: 42,
    borderRadius: 11,
    backgroundColor: "#111827",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 10,
    paddingHorizontal: 12
  },

  aiChatCard: {
    flex: 1,
    minHeight: 0,
    borderWidth: 1,
    borderRadius: 22,
    padding: 12,
    marginBottom: 0
  },

  aiChatLog: {
    flex: 1,
    minHeight: 0
  },

  aiChatLogContent: {
    flexGrow: 1,
    justifyContent: "flex-end",
    gap: 10,
    paddingTop: 12,
    paddingBottom: 14
  },

  aiMessage: {
    maxWidth: "88%",
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 11,
    paddingVertical: 9
  },

  aiMessageUser: {
    alignSelf: "flex-end"
  },

  aiMessageAssistant: {
    alignSelf: "flex-start"
  },

  aiMessageText: {
    fontSize: 12,
    lineHeight: 18
  },

  aiComposer: {
    flexDirection: "row",
    gap: 8,
    marginTop: 10,
    alignItems: "center",
    paddingTop: 8,
    paddingBottom: 0
  },

  aiComposerInput: {
    flex: 1,
    minHeight: 46,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    fontSize: 13
  },

  aiListenButton: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 8,
    paddingVertical: 3,
    paddingRight: 8
  },

  aiListenButtonText: {
    fontSize: 11,
    fontWeight: "800"
  },

  aiVoiceStatusRow: {
    minHeight: 28,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 3,
    marginTop: 6
  },

  aiVoiceStatusDot: {
    width: 8,
    height: 8,
    borderRadius: 999
  },

  aiVoiceStatusText: {
    fontSize: 12,
    fontWeight: "700"
  },

  aiVoiceButton: {
    minWidth: 58,
    height: 46,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: "row",
    gap: 4,
    paddingHorizontal: 8,
    alignItems: "center",
    justifyContent: "center"
  },

  aiVoiceButtonRecording: {
    minWidth: 64
  },

  aiVoiceButtonLabel: {
    fontSize: 10,
    fontWeight: "900"
  },

  aiSendButton: {
    minHeight: 46,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: "#111827",
    alignItems: "center",
    justifyContent: "center"
  },

  aiAssistantCard: {
    borderWidth: 1,
    borderRadius: 22,
    padding: 16,
    marginBottom: 18
  },

  aiAssistantTitle: {
    fontSize: 20,
    fontWeight: "900",
    marginTop: 5
  },

  aiAssistantIntro: {
    fontSize: 12,
    lineHeight: 18,
    marginTop: 6
  },

  aiAssistantExamples: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 7,
    marginTop: 12,
    marginBottom: 12
  },

  aiExampleChip: {
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 7
  },

  aiExampleChipText: {
    fontSize: 10,
    fontWeight: "800"
  },

  aiAssistantButton: {
    minHeight: 44,
    borderRadius: 13,
    backgroundColor: "#111827",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12
  },

  aiAssistantButtonText: {
    color: "#FFFFFF",
    fontWeight: "900",
    fontSize: 13
  },

  autopilotCard: {
    borderWidth: 1,
    borderRadius: 22,
    padding: 16,
    marginBottom: 18
  },

  autopilotHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12
  },

  autopilotEyebrow: {
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1.2
  },

  autopilotTitle: {
    fontSize: 20,
    fontWeight: "900",
    marginTop: 4
  },

  autopilotIntro: {
    fontSize: 12,
    lineHeight: 18,
    marginTop: 5
  },

  autopilotBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 7
  },

  autopilotBadgeText: {
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.7
  },

  autopilotSteps: {
    gap: 9,
    marginTop: 14
  },

  autopilotStep: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 11,
    flexDirection: "row",
    gap: 10,
    alignItems: "flex-start"
  },

  autopilotActionPill: {
    minWidth: 62,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 6,
    backgroundColor: "#111827",
    alignItems: "center"
  },

  autopilotActionText: {
    color: "#FFFFFF",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.5
  },

  autopilotStepTitle: {
    fontSize: 13,
    fontWeight: "900"
  },

  autopilotStepCopy: {
    fontSize: 11,
    lineHeight: 16,
    marginTop: 3
  },

  autopilotFooter: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 11,
    marginTop: 12,
    gap: 10
  },

  autopilotFooterText: {
    fontSize: 11,
    lineHeight: 16
  },

  autopilotPreviewButton: {
    minHeight: 40,
    borderRadius: 11,
    backgroundColor: "#111827",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12
  },

  autopilotPreviewButtonText: {
    color: "#FFFFFF",
    fontWeight: "900",
    fontSize: 12
  },

  homeSavingsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginTop: 16
  },

  homeSavingsMetric: {
    width: "47%"
  },

  homeSavingsMetricPressable: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 10
  },

  renewalTapHint: {
    fontSize: 11,
    marginTop: 5,
    fontWeight: "700"
  },

  renewalSheet: {
    maxHeight: "90%",
    minHeight: 420,
    alignSelf: "center"
  },

  renewalListScroll: {
    flexGrow: 1,
    flexShrink: 1,
    minHeight: 150,
    maxHeight: 560,
    marginTop: 2
  },

  renewalList: {
    gap: 8,
    paddingVertical: 4,
    paddingBottom: 8
  },

  renewalListRow: {
    minHeight: 58,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 12
  },

  renewalListService: {
    fontSize: 15,
    fontWeight: "800"
  },

  renewalListRoute: {
    fontSize: 11,
    marginTop: 2,
    textTransform: "capitalize"
  },

  renewalListDate: {
    fontSize: 14,
    fontWeight: "800"
  },

  renewalDoneButton: {
    marginTop: 16
  },

  summaryMetricValue: {
    fontSize: 18,
    fontWeight: "800",
    marginTop: 3
  },

  priceBlock: {
    alignItems: "flex-end",
    minWidth: 90
  },

  catalogPrice: {
    fontSize: 10,
    marginTop: 3,
    textAlign: "right"
  },

  price: {
    fontWeight: "800",
    fontSize: 16,
    flexShrink: 0
  },

  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },

  action: {
    flexGrow: 1,
    flexBasis: 100,
    minHeight: 46,
    borderRadius: 12,
    backgroundColor: "#f2f4f7",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12
  },

  actionText: {
    fontWeight: "700"
  },

  metricCard: {
    width: "100%",
    backgroundColor: "#fff",
    borderRadius: 18,
    padding: 18,
    gap: 6
  },

  metricCardAccent: {
    width: "100%",
    backgroundColor: "#EDF9F2",
    borderRadius: 20,
    padding: 18,
    gap: 6
  },

  metricLabel: {
    color: "#667085",
    fontWeight: "700"
  },

  metricValue: {
    fontSize: 30,
    fontWeight: "900",
    letterSpacing: -0.8
  },

  homePlanCard: {
    width: "100%",
    borderRadius: 18,
    borderWidth: 1,
    padding: 16,
    gap: 12
  },

  homePlanInfo: {
    gap: 3
  },

  homePlanEyebrow: {
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase"
  },

  homePlanName: {
    fontSize: 22,
    fontWeight: "900"
  },

  homePlanPrice: {
    fontSize: 14,
    fontWeight: "800",
    marginTop: 1
  },

  homePlanButton: {
    minHeight: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center"
  },

  dashboardHero: {
    width: "100%",
    borderRadius: 24,
    padding: 20,
    gap: 4
  },

  dashboardHeroLabel: {
    color: "#D5DBE3",
    fontWeight: "700",
    fontSize: 13
  },

  dashboardHeroValue: {
    color: "#FFFFFF",
    fontSize: 40,
    fontWeight: "900",
    letterSpacing: -1.1,
    marginTop: 2
  },

  dashboardHeroUnit: {
    color: "#C4CBD4",
    fontSize: 13
  },

  dashboardStatsRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 16
  },

  dashboardStat: {
    flex: 1,
    backgroundColor: "rgba(255,255,255,0.09)",
    borderRadius: 15,
    padding: 12
  },

  dashboardStatLabel: {
    color: "#BFC7D1",
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase"
  },

  dashboardStatValue: {
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "900",
    marginTop: 3
  },

  homeSavingsCard: {
    width: "100%",
    borderRadius: 18,
    padding: 16,
    gap: 12
  },

  homeSavingsText: {
    gap: 3
  },

  homeSavingsLabel: {
    fontSize: 12,
    fontWeight: "800"
  },

  homeSavingsValue: {
    fontSize: 28,
    fontWeight: "900",
    letterSpacing: -0.6
  },

  homeSavingsButton: {
    minHeight: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center"
  },

  homeSectionTitle: {
    fontSize: 19,
    fontWeight: "800"
  },

  attentionCard: {
    width: "100%",
    borderRadius: 17,
    padding: 15,
    gap: 12
  },

  attentionText: {
    gap: 3
  },

  attentionTitle: {
    fontSize: 15,
    fontWeight: "800"
  },

  attentionButton: {
    alignSelf: "flex-start",
    minHeight: 40,
    borderRadius: 11,
    paddingHorizontal: 13,
    alignItems: "center",
    justifyContent: "center"
  },

  viewAllButton: {
    width: "100%",
    minHeight: 48,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center"
  },

  viewAllText: {
    fontWeight: "800"
  },

  modernScreenHeading: {
    marginBottom: 20
  },

  modernScreenEyebrow: {
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.5,
    marginBottom: 6
  },

  modernScreenTitle: {
    fontSize: 28,
    fontWeight: "900",
    letterSpacing: -0.9
  },

  modernScreenSubtitle: {
    fontSize: 13,
    lineHeight: 19,
    marginTop: 7,
    maxWidth: 330
  },

  modernSectionEyebrow: {
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.4,
    marginBottom: 10
  },

  modernSavingsHero: {
    borderWidth: 1,
    borderRadius: 24,
    padding: 19,
    marginBottom: 24
  },

  modernSavingsHeroTop: {
    flexDirection: "row",
    alignItems: "center"
  },

  modernSavingsHeroIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10
  },

  modernSavingsHeroLabel: {
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.3
  },

  modernSavingsHeroValue: {
    fontSize: 38,
    fontWeight: "900",
    letterSpacing: -1.2,
    marginTop: 16
  },

  modernSavingsHeroNote: {
    fontSize: 12,
    lineHeight: 18,
    marginTop: 5
  },

  modernSavingsHeroDivider: {
    height: 1,
    marginVertical: 17
  },

  modernSavingsHeroFooter: {
    flexDirection: "row",
    alignItems: "center"
  },

  modernSavingsHeroStat: {
    flex: 1
  },

  modernSavingsStatLabel: {
    fontSize: 10,
    fontWeight: "700",
    marginBottom: 5
  },

  modernSavingsStatValue: {
    fontSize: 17,
    fontWeight: "900"
  },

  modernSavingsStatPeriod: {
    fontSize: 10,
    fontWeight: "600"
  },

  modernSavingsVerticalDivider: {
    width: 1,
    height: 34,
    marginHorizontal: 15
  },

  modernSavingsGrid: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 12
  },

  modernSavingsMetric: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 18,
    padding: 14,
    minHeight: 124
  },

  modernMetricIcon: {
    width: 34,
    height: 34,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 15
  },

  modernSavingsMetricLabel: {
    fontSize: 10,
    fontWeight: "700",
    marginBottom: 5
  },

  modernSavingsMetricValue: {
    fontSize: 18,
    fontWeight: "900",
    letterSpacing: -0.4
  },

  modernReviewableCard: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 15,
    flexDirection: "row",
    marginBottom: 27
  },

  modernReviewableIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12
  },

  modernReviewableContent: {
    flex: 1
  },

  modernReviewableLabel: {
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1
  },

  modernReviewableValue: {
    fontSize: 21,
    fontWeight: "900",
    marginTop: 4
  },

  modernReviewableNote: {
    fontSize: 10,
    lineHeight: 15,
    marginTop: 4
  },

  modernRecommendationsHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10
  },

  modernRecommendationsTitle: {
    fontSize: 20,
    fontWeight: "900",
    letterSpacing: -0.4
  },

  modernRecommendationCount: {
    minWidth: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center"
  },

  modernRecommendationCountText: {
    fontSize: 11,
    fontWeight: "900"
  },

  modernRecommendationCard: {
    minHeight: 68,
    borderWidth: 1,
    borderRadius: 17,
    paddingHorizontal: 13,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 9
  },

  modernRecommendationRank: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 11
  },

  modernRecommendationRankText: {
    fontSize: 12,
    fontWeight: "900"
  },

  modernRecommendationInfo: {
    flex: 1,
    minWidth: 0
  },

  modernRecommendationName: {
    fontSize: 14,
    fontWeight: "900"
  },

  modernRecommendationCopy: {
    fontSize: 10,
    marginTop: 4
  },

  modernEmptyCard: {
    borderWidth: 1,
    borderRadius: 17,
    minHeight: 66,
    paddingHorizontal: 15,
    flexDirection: "row",
    alignItems: "center",
    gap: 10
  },

  modernEmptyText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "600"
  },

  modernAutopilotHero: {
    borderWidth: 1,
    borderRadius: 22,
    padding: 18,
    marginBottom: 24
  },

  modernAutopilotHeroTop: {
    flexDirection: "row",
    alignItems: "center"
  },

  modernAutopilotIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 13
  },

  modernAutopilotEyebrow: {
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1.2,
    marginBottom: 3
  },

  modernAutopilotTitle: {
    fontSize: 19,
    fontWeight: "900"
  },

  modernAutopilotIntro: {
    fontSize: 12,
    lineHeight: 18,
    marginTop: 15
  },

  modernPrimaryActionCard: {
    borderWidth: 1,
    borderRadius: 20,
    padding: 15,
    flexDirection: "row",
    alignItems: "center"
  },

  modernActionRankColumn: {
    marginRight: 12
  },

  modernPrimaryActionRank: {
    width: 34,
    height: 34,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center"
  },

  modernPrimaryActionRankText: {
    color: "#07110C",
    fontSize: 13,
    fontWeight: "900"
  },

  modernPrimaryActionInfo: {
    flex: 1,
    minWidth: 0
  },

  modernPrimaryActionEyebrow: {
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1
  },

  modernPrimaryActionTitle: {
    fontSize: 17,
    fontWeight: "900",
    marginTop: 3
  },

  modernPrimaryActionCopy: {
    fontSize: 11,
    marginTop: 4
  },

  modernKeepCard: {
    borderWidth: 1,
    borderRadius: 16,
    minHeight: 62,
    paddingHorizontal: 13,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8
  },

  modernKeepIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10
  },

  modernKeepName: {
    fontSize: 13,
    fontWeight: "900"
  },

  modernKeepCopy: {
    fontSize: 10,
    marginTop: 3
  },

  modernKeepPill: {
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 999
  },

  modernKeepPillText: {
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 0.7
  },

  modernControlCard: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 13,
    flexDirection: "row",
    alignItems: "center",
    marginTop: 22
  },

  modernControlCopy: {
    flex: 1,
    fontSize: 10,
    lineHeight: 15,
    marginLeft: 9
  },

  modernAiHeading: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 16
  },

  modernAiHeadingIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12
  },

  modernAiTitle: {
    fontSize: 23,
    fontWeight: "900",
    letterSpacing: -0.6
  },

  modernAiSubtitle: {
    fontSize: 11,
    lineHeight: 16,
    marginTop: 4
  },

  modernAiSuggestions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 7,
    marginBottom: 12
  },

  modernAiSuggestionChip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 8
  },

  modernAiSuggestionText: {
    fontSize: 10,
    fontWeight: "700"
  },

  modernAiChatCard: {
    borderRadius: 22
  },

  savingsHero: {
    width: "100%",
    borderRadius: 22,
    borderWidth: 1,
    padding: 20,
    gap: 6
  },

  savingsHeroLabel: {
    color: "#D5DBE3",
    fontWeight: "700",
    fontSize: 13
  },

  savingsHeroValue: {
    color: "#FFFFFF",
    fontSize: 38,
    fontWeight: "900",
    letterSpacing: -1
  },

  savingsHeroNote: {
    color: "#C4CBD4",
    lineHeight: 20
  },

  recommendationsCard: {
    width: "100%",
    borderRadius: 18,
    padding: 18,
    gap: 8
  },

  recommendationsTitle: {
    fontSize: 19,
    fontWeight: "800",
    marginBottom: 4
  },

  recommendationRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderTopWidth: 1,
    paddingTop: 14,
    marginTop: 6
  },

  recommendationInfo: {
    flex: 1,
    minWidth: 0
  },

  recommendationName: {
    fontWeight: "800",
    marginBottom: 3
  },

  recommendationButton: {
    minHeight: 42,
    borderRadius: 11,
    paddingHorizontal: 13,
    alignItems: "center",
    justifyContent: "center"
  },

  settingsGroup: {
    width: "100%",
    borderRadius: 22,
    borderWidth: 1,
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 6,
    marginBottom: 2
  },

  settingsGroupTitle: {
    fontSize: 16,
    fontWeight: "900",
    letterSpacing: -0.2,
    marginBottom: 9
  },

  settingsRow: {
    minHeight: 66,
    borderTopWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingVertical: 13
  },

  settingsRowInfo: {
    flex: 1,
    minWidth: 0,
    paddingRight: 4
  },

  settingsRowTitle: {
    fontSize: 14,
    fontWeight: "800",
    letterSpacing: -0.1
  },

  settingsRowValue: {
    fontSize: 12,
    lineHeight: 18,
    marginTop: 3
  },

  settingsAction: {
    minHeight: 36,
    borderRadius: 999,
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0
  },

  settingsActionText: {
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.1
  },

  settingsLogout: {
    width: "100%",
    minHeight: 50,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4
  },

  settingsCard: {
    width: "100%",
    backgroundColor: "#fff",
    borderRadius: 18,
    padding: 18,
    gap: 12
  },

  settingsTitle: {
    fontSize: 18,
    fontWeight: "800"
  },

  planHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12
  },

  backButton: {
    minHeight: 44,
    justifyContent: "center",
    paddingRight: 8
  },

  backText: {
    fontSize: 16,
    fontWeight: "800"
  },

  priceVerificationText: {
    marginTop: 3,
    fontSize: 11,
    fontWeight: "700"
  },

  planHeaderTitle: {
    fontSize: 20,
    fontWeight: "800"
  },

  headerSpacer: {
    width: 60
  },

  planIntro: {
    width: "100%",
    backgroundColor: "#fff",
    borderRadius: 18,
    padding: 18,
    gap: 8
  },

  planPageTitle: {
    fontSize: 22,
    fontWeight: "800"
  },

  planOption: {
    width: "100%",
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#E6ECE8",
    padding: 18,
    gap: 8
  },

  planOptionFeatured: {
    borderWidth: 2,
    borderColor: "#111827"
  },

  planName: {
    fontSize: 20,
    fontWeight: "800"
  },

  planPrice: {
    fontSize: 28,
    fontWeight: "900",
    letterSpacing: -0.6
  },

  planCopy: {
    color: "#667085",
    lineHeight: 21
  },

  successFloatingWrap: {
    position: "absolute",
    left: 16,
    right: 16,
    bottom: 24,
    zIndex: 30
  },

  successBanner: {
    width: "100%",
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12
  },

  successBannerText: {
    fontWeight: "800",
    lineHeight: 20
  },

  addServiceButton: {
    width: "100%",
    minHeight: 46,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center"
  },

  addServiceText: {
    fontWeight: "800"
  },

  editServiceButton: {
    minHeight: 40,
    borderTopWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2
  },

  editServiceText: {
    fontWeight: "700",
    fontSize: 13
  },

  keyboardAvoider: {
    flex: 1
  },

  regionSheet: {
    width: "100%",
    maxHeight: "92%",
    borderRadius: 24,
    borderWidth: 1,
    padding: 18,
    gap: 10
  },

  regionHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12
  },

  regionClose: {
    minHeight: 40,
    borderRadius: 11,
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center"
  },

  countryList: {
    maxHeight: 320
  },

  countryListContent: {
    gap: 8,
    paddingBottom: 4
  },

  countryRow: {
    minHeight: 58,
    borderRadius: 14,
    paddingHorizontal: 13,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 10
  },

  countryInfo: {
    flex: 1,
    minWidth: 0
  },

  countryName: {
    fontSize: 14,
    fontWeight: "800"
  },

  countryMeta: {
    fontSize: 11,
    marginTop: 2
  },

  countryCheck: {
    fontSize: 18,
    fontWeight: "900"
  },

  currencyRow: {
    gap: 8,
    paddingRight: 8
  },

  currencyChip: {
    minHeight: 40,
    borderRadius: 999,
    paddingHorizontal: 13,
    alignItems: "center",
    justifyContent: "center"
  },

  serviceFormSheet: {
    width: "100%",
    borderRadius: 24,
    borderWidth: 1,
    maxHeight: "88%",
    overflow: "hidden"
  },

  serviceFormScroll: {
    flexShrink: 1
  },

  serviceFormScrollContent: {
    padding: 20,
    paddingBottom: 16,
    gap: 10
  },

  serviceFormFooter: {
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 20
  },

  formHint: {
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 2
  },

  fieldLabel: {
    fontSize: 12,
    fontWeight: "800",
    marginTop: 6
  },

  choiceWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },

  choiceChip: {
    minHeight: 40,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center"
  },

  choiceChipText: {
    fontWeight: "700",
    fontSize: 13
  },

  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.46)",
    justifyContent: "flex-end",
    padding: 16
  },

  actionSheet: {
    width: "100%",
    borderRadius: 24,
    borderWidth: 1,
    padding: 20,
    gap: 12
  },

  servicePickerSheet: {
    width: "100%",
    height: "88%",
    borderRadius: 24,
    borderWidth: 1,
    overflow: "hidden"
  },

  servicePickerHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16
  },

  servicePickerClose: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center"
  },

  servicePickerScroll: {
    flex: 1
  },

  servicePickerScrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 28,
    gap: 22
  },

  servicePickerCategory: {
    gap: 8
  },

  servicePickerCategoryTitle: {
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 0.8,
    paddingHorizontal: 2
  },

  servicePickerCategoryCard: {
    borderRadius: 18,
    borderWidth: 1,
    overflow: "hidden"
  },

  servicePickerRow: {
    minHeight: 62,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14
  },

  servicePickerLogo: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12
  },

  servicePickerLogoText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "900"
  },

  servicePickerName: {
    flex: 1,
    fontSize: 16,
    fontWeight: "700"
  },

  actionSheetTitle: {
    fontSize: 22,
    fontWeight: "900",
    letterSpacing: -0.4
  },

  actionSheetBody: {
    fontSize: 15,
    lineHeight: 22
  },

  removeServiceButton: {
    minHeight: 46,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8
  },

  removeServiceText: {
    fontSize: 14,
    fontWeight: "800"
  },

  removeServiceButtonBottom: {
    marginTop: 18,
    marginBottom: 8
  },

  statusChoiceWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 14
  },

  statusChoiceButton: {
    width: "48%",
    minHeight: 46,
    borderWidth: 1,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8
  },

  actionSheetButtons: {
    flexDirection: "row",
    gap: 10,
    marginTop: 6
  },

  sheetButton: {
    flex: 1,
    minHeight: 50,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12
  },

  sheetButtonPrimary: {
    borderWidth: 0
  },

  sheetButtonText: {
    fontWeight: "800",
    fontSize: 15,
    textAlign: "center"
  }
});
