import { translateUi, appLocale, appLanguages, type AppLanguage } from "../lib/ui-localization";
import { browseCatalog } from "../lib/catalog-browse";
import { configuredSavlivoPrice } from "../lib/savlivo-plan-prices";
import { resolveSavedManagement, type ManagementIntent } from "../../../packages/contracts/src/assistant-actions";
import { discoveryRequestIsCurrent, parseAddSubscriptionIntent, validateAddSubscriptionIntent, validateManualSubscription } from "../../../packages/contracts/src/discovery";
import { transitionCatalogDraft, serviceCatalog, searchCatalog, catalogDiscoveryPolicy, catalogCategories, type CatalogCategory, billingProviders, serviceBillingProviders, billingProvidersForService, defaultBillingProviderForService, isBillingProviderAllowed, allCurrencies, serviceAvailableInMarket, type BillingProviderSlug } from "../../../packages/contracts/src/catalog";
import {
  countryCurrencyData, subscriptionsForMarket, formatMarketMinor, isCurrentMarketPricing, expansionServiceAvailable
} from "../../../packages/contracts/src/markets";
import {
  Fragment,
  useMemo,
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
  Linking,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import DateTimePicker, {
  type DateTimePickerEvent
} from "@react-native-community/datetimepicker";
import { StatusBar } from "expo-status-bar";
import * as WebBrowser from "expo-web-browser";
import { openSubscriptionManagementBrowser, usesSubscriptionManagementBrowser } from "../lib/subscription-management-browser";
import { useLocalSearchParams } from "expo-router";
import { Asset } from "expo-asset";
import * as FileSystem from "expo-file-system/legacy";
import { Ionicons } from "@expo/vector-icons";
import { api, clearToken, getToken, setToken } from "../src/api";
import { getPlanPrices, purchasePlan, type BillingPeriod } from "../src/billing";
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
  unprotectSubscription,
  rankAllowedRecommendations,
  setMonthlySavingsGoal
} from "../lib/ai-preferences";
import {
  askRemoteAssistant, type RemoteAssistantResult
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
import * as LocalAuthentication from "expo-local-authentication";
import { registerSavlivoPushNotifications, subscribeToSavlivoNotificationTaps } from "../src/notifications";

type Subscription = {
  customServiceName?: string;
  id: string;
  serviceName: string;
  serviceSlug: string;
  billingProviderSlug: string;
  countryCode?: string;
  status: string;
  monthlyPriceMinor?: number;
  currency?: string;
  renewalDate?: string;
  planName?: string;
  statusEffectiveDate?: string;
  savedSoFarMinor?: number;
};

type Screen = "home" | "subscriptions" | "savings" | "autopilot" | "ai" | "settings" | "plans";

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
  const routeParams = useLocalSearchParams<{
    resetToken?: string;
  }>();

  const [email, setEmail] = useState("demo@savlivo.local");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [resetToken, setResetToken] = useState<string | null>(null);
  const [resetPassword, setResetPassword] = useState("");
  const [resetPasswordConfirm, setResetPasswordConfirm] = useState("");
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [showResetPasswordConfirm, setShowResetPasswordConfirm] =
    useState(false);
  const [loading, setLoading] = useState(false);
  const [authed, setAuthed] = useState(false);
  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const [renewalRemindersEnabled, setRenewalRemindersEnabled] = useState(true);
  const [savingsOpportunitiesEnabled, setSavingsOpportunitiesEnabled] = useState(true);
  const [askBeforeChangesEnabled, setAskBeforeChangesEnabled] = useState(true);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricLocked, setBiometricLocked] = useState(false);
  const [biometricHydrated, setBiometricHydrated] = useState(false);
  const biometricAuthenticatingRef = useRef(false);
  const appStateRef = useRef(AppState.currentState);
  const [plan, setPlan] = useState("VIEWER");
  const [userId, setUserId] = useState<string | null>(null);
  const [previewPlan, setPreviewPlan] = useState<"MANUAL" | "PREMIUM">("PREMIUM");
  const effectivePlan = plan === "VIEWER" ? previewPlan : plan;
  const [billingPeriod, setBillingPeriod] = useState<BillingPeriod>("annual");
  const [manualMonthlyPrice, setManualMonthlyPrice] = useState<string | null>(null);
  const [manualAnnualPrice, setManualAnnualPrice] = useState<string | null>(null);
  const [premiumMonthlyPrice, setPremiumMonthlyPrice] = useState<string | null>(null);
  const [premiumAnnualPrice, setPremiumAnnualPrice] = useState<string | null>(null);
  const planDisplayName =
    plan === "VIEWER"
      ? "Preview"
      : plan === "MANUAL"
        ? "Manual"
        : plan === "PREMIUM"
          ? "Premium"
          : plan;
  const [items, setItems] = useState<Subscription[]>([]);
  const [screen, setScreen] = useState<Screen>("home");
  const [darkMode, setDarkMode] = useState(true);

  async function refreshBiometricAvailability() {
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    const enrolled = hasHardware
      ? await LocalAuthentication.isEnrolledAsync()
      : false;

    setBiometricAvailable(hasHardware && enrolled);
    return hasHardware && enrolled;
  }

  async function authenticateWithBiometrics() {
    if (biometricAuthenticatingRef.current) {
      return false;
    }

    biometricAuthenticatingRef.current = true;

    try {
      const available = await refreshBiometricAvailability();
      if (!available) {
        return false;
      }

      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: tr("Unlock Savlivo"),
        cancelLabel: tr("Use password"),
        disableDeviceFallback: false
      });

      return result.success;
    } finally {
      biometricAuthenticatingRef.current = false;
    }
  }

  async function toggleBiometricUnlock() {
    if (biometricEnabled) {
      await AsyncStorage.removeItem("savlivo_biometrics_enabled");
      setBiometricEnabled(false);
      setBiometricLocked(false);
      return;
    }

    const authenticated = await authenticateWithBiometrics();
    if (!authenticated) {
      return;
    }

    const token = await getToken();
    if (token) {
      await setToken(token, true);
    }

    await AsyncStorage.setItem("savlivo_biometrics_enabled", "true");
    setBiometricEnabled(true);
    setBiometricLocked(false);
  }

  async function offerBiometricUnlockOnce() {
    if (biometricEnabled) return;

    const dismissed = await AsyncStorage.getItem(
      "savlivo_biometrics_prompt_dismissed"
    );
    if (dismissed === "true") return;

    const available = await refreshBiometricAvailability();
    if (!available) return;

    Alert.alert(
      tr("Biometric unlock"),
      tr("Use Face ID or Touch ID to unlock Savlivo?"),
      [
        {
          text: tr("Not now"),
          style: "cancel",
          onPress: () => {
            void AsyncStorage.setItem(
              "savlivo_biometrics_prompt_dismissed",
              "true"
            );
          }
        },
        {
          text: tr("Enable"),
          onPress: () => {
            void (async () => {
              const authenticated = await authenticateWithBiometrics();
              if (!authenticated) return;

              const token = await getToken();
              if (token) {
                await setToken(token, true);
              }

              await AsyncStorage.setItem(
                "savlivo_biometrics_enabled",
                "true"
              );
              await AsyncStorage.setItem(
                "savlivo_biometrics_prompt_dismissed",
                "true"
              );
              setBiometricEnabled(true);
              setBiometricLocked(false);
            })();
          }
        }
      ]
    );
  }
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
  const actionSheetDismissedRef = useRef<(() => void) | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [regionModalOpen, setRegionModalOpen] = useState(false);
  const [neverPauseModalOpen, setNeverPauseModalOpen] = useState(false);
  const [changePasswordModalOpen, setChangePasswordModalOpen] =
    useState(false);
  const [currentPasswordInput, setCurrentPasswordInput] = useState("");
  const [newPasswordInput, setNewPasswordInput] = useState("");
  const [confirmNewPasswordInput, setConfirmNewPasswordInput] =
    useState("");
  const [showCurrentPasswordInput, setShowCurrentPasswordInput] =
    useState(false);
  const [showNewPasswordInput, setShowNewPasswordInput] =
    useState(false);
  const [
    showConfirmNewPasswordInput,
    setShowConfirmNewPasswordInput
  ] = useState(false);
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
  const [
    aiPreferencesLoadedUserId,
    setAiPreferencesLoadedUserId
  ] = useState<string | null>(null);
  const [aiMessages, setAiMessages] = useState<Array<{ role: "assistant" | "user"; text: string; uiKey?: string }>>([
    { role: "assistant", text: "Hi — ask me general questions or get help with Savlivo, your subscriptions, prices and renewal dates. Subscription changes always stay under your control.", uiKey: "Hi — ask me general questions or get help with Savlivo, your subscriptions, prices and renewal dates. Subscription changes always stay under your control." }
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
  const selectedCountryCodeRef = useRef(selectedCountryCode);
  selectedCountryCodeRef.current = selectedCountryCode;
  const [selectedCountryName, setSelectedCountryName] = useState("United States");
  const [selectedCurrency, setSelectedCurrency] = useState("USD");
  const [selectedLanguage, setSelectedLanguage] =
    useState<AppLanguage>("en");

  const navLabels: Record<
    AppLanguage,
    {
      home: string;
      subscriptions: string;
      savings: string;
      autopilot: string;
      ai: string;
      settings: string;
    }
  > = {
    en: {
      home: "Home",
      subscriptions: "Subs",
      savings: "Savings",
      autopilot: "Auto",
      ai: "AI",
      settings: "Settings"
    },
    no: {
      home: "Hjem",
      subscriptions: "Abonn.",
      savings: "Sparing",
      autopilot: "Auto",
      ai: "AI",
      settings: "Innstill."
    },
    sv: {
      home: "Hem",
      subscriptions: "Abonn.",
      savings: "Sparande",
      autopilot: "Auto",
      ai: "AI",
      settings: "Inställn."
    },
    da: {
      home: "Hjem",
      subscriptions: "Abonn.",
      savings: "Besparelse",
      autopilot: "Auto",
      ai: "AI",
      settings: "Indstill."
    },
    de: {
      home: "Start",
      subscriptions: "Abos",
      savings: "Sparen",
      autopilot: "Auto",
      ai: "KI",
      settings: "Einstell."
    },
    es: {
      home: "Inicio",
      subscriptions: "Suscrip.",
      savings: "Ahorro",
      autopilot: "Auto",
      ai: "IA",
      settings: "Ajustes"
    },
    fr: {
      home: "Accueil",
      subscriptions: "Abonn.",
      savings: "Épargne",
      autopilot: "Auto",
      ai: "IA",
      settings: "Réglages"
    },
    it: {
      home: "Home",
      subscriptions: "Abbon.",
      savings: "Risparmio",
      autopilot: "Auto",
      ai: "IA",
      settings: "Impost."
    },
    pt: {
      home: "Início",
      subscriptions: "Subscr.",
      savings: "Poupança",
      autopilot: "Auto",
      ai: "IA",
      settings: "Definiç."
    },
    nl: {
      home: "Home",
      subscriptions: "Abonn.",
      savings: "Besparing",
      autopilot: "Auto",
      ai: "AI",
      settings: "Instell."
    },
    fi: {
      home: "Koti",
      subscriptions: "Tilaukset",
      savings: "Säästöt",
      autopilot: "Auto",
      ai: "AI",
      settings: "Asetukset"
    },
    "zh-CN": {
      home: "首页",
      subscriptions: "订阅",
      savings: "节省",
      autopilot: "自动",
      ai: "AI",
      settings: "设置"
    }
  };

  const currentNavLabels = navLabels[selectedLanguage];

  function tr(english: string, values: Record<string, string> = {}) {
    return translateUi(selectedLanguage, english, values);
  }

  function localizedStatus(status: string) {
    const labels: Partial<Record<AppLanguage, Record<string, string>>> = {
      no: { ACTIVE: "Aktiv", PAUSED: "Pauset", CANCELLED: "Kansellert" },
      sv: { ACTIVE: "Aktiv", PAUSED: "Pausad", CANCELLED: "Avslutad" },
      da: { ACTIVE: "Aktiv", PAUSED: "Sat på pause", CANCELLED: "Annulleret" },
      de: { ACTIVE: "Aktiv", PAUSED: "Pausiert", CANCELLED: "Gekündigt" },
      es: { ACTIVE: "Activa", PAUSED: "Pausada", CANCELLED: "Cancelada" },
      fr: { ACTIVE: "Actif", PAUSED: "En pause", CANCELLED: "Résilié" },
      it: { ACTIVE: "Attivo", PAUSED: "In pausa", CANCELLED: "Annullato" },
      pt: { ACTIVE: "Ativa", PAUSED: "Pausada", CANCELLED: "Cancelada" },
      nl: { ACTIVE: "Actief", PAUSED: "Gepauzeerd", CANCELLED: "Opgezegd" },
      fi: { ACTIVE: "Aktiivinen", PAUSED: "Keskeytetty", CANCELLED: "Peruutettu" },
      "zh-CN": { ACTIVE: "有效", PAUSED: "已暂停", CANCELLED: "已取消" }
    };
    return labels[selectedLanguage]?.[status] ?? statusLabel(status);
  }

  function editSubscriptionLabel(serviceName: string) {
    const prefixes: Partial<Record<AppLanguage, string>> = {
      no: "Rediger",
      sv: "Redigera",
      da: "Rediger",
      de: "Bearbeiten:",
      es: "Editar",
      fr: "Modifier",
      it: "Modifica",
      pt: "Editar",
      nl: "Bewerk",
      fi: "Muokkaa:",
      "zh-CN": "编辑"
    };
    return `${prefixes[selectedLanguage] ?? "Edit"} ${serviceName}`;
  }

  function activeSubscriptionSummary(active: number, total: number) {
    const templates: Partial<Record<AppLanguage, (a: number, t: number) => string>> = {
      no: (a, t) => `${a} aktive av ${t} abonnementer`,
      sv: (a, t) => `${a} aktiva av ${t} abonnemang`,
      da: (a, t) => `${a} aktive ud af ${t} abonnementer`,
      de: (a, t) => `${a} von ${t} Abonnements aktiv`,
      es: (a, t) => `${a} de ${t} suscripciones activas`,
      fr: (a, t) => `${a} abonnements actifs sur ${t}`,
      it: (a, t) => `${a} abbonamenti attivi su ${t}`,
      pt: (a, t) => `${a} de ${t} subscrições ativas`,
      nl: (a, t) => `${a} van ${t} abonnementen actief`,
      fi: (a, t) => `${a}/${t} tilausta aktiivisena`,
      "zh-CN": (a, t) => `${t} 个订阅中有 ${a} 个有效`
    };
    return (templates[selectedLanguage] ?? ((a, t) => `${a} active of ${t} subscriptions`))(active, total);
  }

  function reviewServiceLabel(serviceName: string) {
    const prefixes: Partial<Record<AppLanguage, string>> = {
      no: "Se gjennom",
      sv: "Granska",
      da: "Gennemgå",
      de: "Prüfen:",
      es: "Revisar",
      fr: "Examiner",
      it: "Rivedi",
      pt: "Rever",
      nl: "Beoordeel",
      fi: "Tarkista:",
      "zh-CN": "审查"
    };
    return `${prefixes[selectedLanguage] ?? "Review"} ${serviceName}`;
  }

  function threeMonthSpendLabel(amount: string) {
    const labels: Partial<Record<AppLanguage, string>> = {
      no: "3-måneders forbruk:",
      sv: "Utgifter senaste 3 månaderna:",
      da: "Forbrug sidste 3 måneder:",
      de: "Ausgaben der letzten 3 Monate:",
      es: "Gasto de 3 meses:",
      fr: "Dépenses sur 3 mois :",
      it: "Spesa ultimi 3 mesi:",
      pt: "Despesa de 3 meses:",
      nl: "Uitgaven afgelopen 3 maanden:",
      fi: "3 kuukauden kulut:",
      "zh-CN": "3个月支出："
    };
    return `${labels[selectedLanguage] ?? "3-month spend:"} ${amount}`;
  }
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
    const token =
      typeof routeParams.resetToken === "string"
        ? routeParams.resetToken.trim()
        : "";

    if (!token) return;

    setResetToken(token);
    setResetPassword("");
    setResetPasswordConfirm("");
    setShowResetPassword(false);
    setShowResetPasswordConfirm(false);
  }, [routeParams.resetToken]);

  useEffect(() => {
    function handlePasswordResetUrl(url: string | null) {
      if (!url) return;

      const match = url.match(
        /^savlivo:\/\/reset-password(?:\?|$)(.*)$/
      );

      if (!match) return;

      const query = match[1] ?? "";
      const tokenMatch = query.match(
        /(?:^|&)token=([^&]+)/
      );

      if (!tokenMatch?.[1]) return;

      try {
        setResetToken(
          decodeURIComponent(tokenMatch[1])
        );
        setResetPassword("");
        setResetPasswordConfirm("");
        setShowResetPassword(false);
        setShowResetPasswordConfirm(false);
      } catch {
        setResetToken(null);
      }
    }

    void Linking.getInitialURL()
      .then(handlePasswordResetUrl)
      .catch(() => {});

    const subscription = Linking.addEventListener(
      "url",
      ({ url }) => {
        handlePasswordResetUrl(url);
      }
    );

    return () => {
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    void getPlanPrices()
      .then((prices) => {
        if (cancelled || !prices) {
          return;
        }

        setManualMonthlyPrice(prices.manual.monthly);
        setManualAnnualPrice(prices.manual.annual);
        setPremiumMonthlyPrice(prices.premium.monthly);
        setPremiumAnnualPrice(prices.premium.annual);
      })
      .catch(() => {
        // StoreKit price unavailable; keep fallback display prices.
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    (async () => {
      const [savedBiometricEnabled] = await Promise.all([
        AsyncStorage.getItem("savlivo_biometrics_enabled"),
        refreshBiometricAvailability()
      ]);

      setBiometricEnabled(savedBiometricEnabled === "true");
    })()
      .catch(() => {
        setBiometricEnabled(false);
        setBiometricAvailable(false);
      })
      .finally(() => {
        setBiometricHydrated(true);
      });
  }, []);

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
    if (!biometricHydrated) return;

    (async () => {
      try {
        const token = await getToken();
        if (!token) return;

        if (biometricEnabled && biometricAvailable) {
          setBiometricLocked(true);
          const authenticated = await authenticateWithBiometrics();
          setBiometricLocked(!authenticated);

          if (!authenticated) {
            return;
          }
        }

        await refresh();
        setScreen("home");
        setAuthed(true);
      } catch {
        await clearToken();
        setAuthed(false);
      }
    })();
  }, [biometricHydrated]);

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
      effectivePlan !== "PREMIUM" &&
      (screen === "autopilot" || screen === "ai")
    ) {
      setScreen("home");
    }
  }, [effectivePlan, screen]);

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
    if (!preferencesHydrated || !userId) {
      setAiPreferencesLoadedUserId(null);
      setAiPreferences(emptyAssistantPreferences);
      return;
    }

    let cancelled = false;
    const storageKey = `savlivo_ai_preferences_${userId}`;

    (async () => {
      try {
        const saved = await AsyncStorage.getItem(storageKey);

        if (cancelled) return;

        if (!saved) {
          setAiPreferences(emptyAssistantPreferences);
          setAiPreferencesLoadedUserId(userId);
          return;
        }

        const parsed = JSON.parse(saved);

        if (
          parsed &&
          typeof parsed === "object" &&
          Array.isArray(parsed.protectedSubscriptionIds)
        ) {
          setAiPreferences({
            ...emptyAssistantPreferences,
            ...parsed,
            protectedSubscriptionIds:
              parsed.protectedSubscriptionIds.filter(
                (id: unknown): id is string =>
                  typeof id === "string"
              )
          });
        } else {
          setAiPreferences(emptyAssistantPreferences);
        }
      } catch {
        setAiPreferences(emptyAssistantPreferences);
      } finally {
        if (!cancelled) {
          setAiPreferencesLoadedUserId(userId);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [preferencesHydrated, userId]);

  useEffect(() => {
    if (
      !userId ||
      aiPreferencesLoadedUserId !== userId
    ) {
      return;
    }

    AsyncStorage.setItem(
      `savlivo_ai_preferences_${userId}`,
      JSON.stringify(aiPreferences)
    ).catch(() => {});
  }, [
    aiPreferences,
    aiPreferencesLoadedUserId,
    userId
  ]);

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
      return new Intl.NumberFormat(appLocale(selectedLanguage), {
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
  function savlivoPlanPrice(planName: "manual" | "premium") {
    const configured = configuredSavlivoPrice(selectedCountryCode, planName, billingPeriod, appLocale(selectedLanguage));
    const store = planName === "manual"
      ? billingPeriod === "monthly" ? manualMonthlyPrice : manualAnnualPrice
      : billingPeriod === "monthly" ? premiumMonthlyPrice : premiumAnnualPrice;
    const display = configured ?? store;
    return {
      display: display ? `${display}${tr(billingPeriod === "monthly" ? "/month" : "/year")}` : tr("Price unavailable"),
      note: configured
        ? tr("Configured market price. The App Store confirms the final purchase price.") + (store ? ` ${tr("App Store price")}: ${store}` : "")
        : tr("App Store price")
    };
  }

  const [catalogQuery, setCatalogQuery] = useState("");
  const [catalogCategory, setCatalogCategory] = useState<CatalogCategory | undefined>();
  const [customServiceName, setCustomServiceName] = useState("");
  const saveServiceBusyRef = useRef(false);
  const discoveryEpochRef = useRef(0);
  const formMarketRef = useRef(selectedCountryCode);
  const [servicePickerOpen, setServicePickerOpen] = useState(false);
  const catalogResults = useMemo(() => catalogQuery.trim() ? searchCatalog(catalogQuery, selectedCountryCode, {
    category: catalogCategory, limit: catalogDiscoveryPolicy.searchLimit
  }) : browseCatalog(selectedCountryCode, catalogCategory), [catalogQuery, selectedCountryCode, catalogCategory]);
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
    greenText: darkMode ? "#32E58A" : "#0F9958",
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
        const previousState = appStateRef.current;
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

        if (
          nextState === "active" &&
          previousState === "background" &&
          authed &&
          biometricEnabled &&
          biometricAvailable
        ) {

          void authenticateWithBiometrics().then((authenticated) => {
            if (authenticated) {
              setBiometricLocked(false);
              return;
            }
            setBiometricLocked(false);
            setAuthed(false);
          });
        }

        appStateRef.current = nextState;
      }
    );

    return () => subscription.remove();
  }, [
    pendingProviderResult,
    authed,
    biometricEnabled,
    biometricAvailable
  ]);

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
    const me = await api<{
      user: { id: string; email: string };
      plan: string;
    }>("/v1/me");
    const subs = await api<{ items: Subscription[] }>("/v1/subscriptions");

    const deduped = new Map<string, Subscription>();

    for (const item of subs.items) {
      const key = `${item.countryCode ?? "legacy"}|${item.serviceSlug}|${item.billingProviderSlug}`;
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

    setUserId(me.user.id);
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
      await setToken(result.token, register || rememberMe || biometricEnabled);
      await AsyncStorage.setItem("savlivo_last_email", email.trim());
      setPassword("");
      setShowPassword(false);
      setScreen("home");
      setBiometricLocked(false);
      setAuthed(true);

      if (register) {
        setRegistrationOnboarding(false);
      }

      await refresh();

      void offerBiometricUnlockOnce();

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

  async function requestPasswordReset() {
    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedEmail.includes("@")) {
      Alert.alert("Savlivo", tr("Enter your email address first."));
      return;
    }

    setLoading(true);

    try {
      await api("/v1/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({
          email: normalizedEmail
        })
      });

      Alert.alert(
        tr("Check your email"),
        tr("If a Savlivo account exists for that email, we'll send a password reset link.")
      );
    } catch {
      Alert.alert(
        "Savlivo",
        tr("We couldn't send the reset request right now. Please try again.")
      );
    } finally {
      setLoading(false);
    }
  }

  async function submitPasswordReset() {
    if (!resetToken) {
      Alert.alert(
        "Savlivo",
        tr("This password reset link is invalid or has expired.")
      );
      return;
    }

    if (resetPassword.length < 8) {
      Alert.alert(
        "Savlivo",
        tr("Your new password must be at least 8 characters.")
      );
      return;
    }

    if (resetPassword !== resetPasswordConfirm) {
      Alert.alert(
        "Savlivo",
        tr("The new passwords do not match.")
      );
      return;
    }

    setLoading(true);

    try {
      await api("/v1/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({
          token: resetToken,
          newPassword: resetPassword
        })
      });

      await clearToken();
      setAuthed(false);
      setResetToken(null);
      setResetPassword("");
      setResetPasswordConfirm("");
      setPassword("");

      Alert.alert(
        tr("Password changed"),
        tr("Your Savlivo password has been reset. You can now log in with your new password.")
      );
    } catch {
      Alert.alert(
        tr("Reset link expired"),
        tr("This password reset link is invalid, expired, or has already been used. Request a new reset link and try again.")
      );
    } finally {
      setLoading(false);
    }
  }

  async function submitPasswordChange() {
    if (!currentPasswordInput) {
      Alert.alert(
        "Savlivo",
        tr("Enter your current password.")
      );
      return;
    }

    if (newPasswordInput.length < 8) {
      Alert.alert(
        "Savlivo",
        tr("Your new password must be at least 8 characters.")
      );
      return;
    }

    if (newPasswordInput !== confirmNewPasswordInput) {
      Alert.alert(
        "Savlivo",
        tr("The new passwords do not match.")
      );
      return;
    }

    setLoading(true);

    try {
      await api("/v1/auth/change-password", {
        method: "POST",
        body: JSON.stringify({
          currentPassword: currentPasswordInput,
          newPassword: newPasswordInput
        })
      });

      setChangePasswordModalOpen(false);
      setCurrentPasswordInput("");
      setNewPasswordInput("");
      setConfirmNewPasswordInput("");

      Alert.alert(
        tr("Password changed"),
        tr("Your Savlivo password has been updated.")
      );
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "";

      if (message.includes("CURRENT_PASSWORD_INCORRECT")) {
        Alert.alert(
          tr("Incorrect password"),
          tr("Your current password is incorrect.")
        );
      } else {
        Alert.alert(
          "Savlivo",
          message || tr("We couldn't change your password right now. Please try again.")
        );
      }
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
    setUserId(null);
    setAiPreferencesLoadedUserId(null);
    setAiPreferences(emptyAssistantPreferences);
    setPlan("VIEWER");
    setScreen("home");
    setAuthed(false);
  }

  function requireActivePlan(feature = "this feature") {
    if (plan !== "VIEWER") {
      return true;
    }

    Alert.alert(
      tr("Preview mode"),
      tr("You're previewing {plan}. Choose a plan to use these features with your own data.", {plan:previewPlan === "PREMIUM" ? "Premium" : "Manual"}),
      [
        { text: tr("Not now"), style: "cancel" },
        {
          text: tr("View plans"),
          onPress: () => setScreen("plans")
        }
      ]
    );

    return false;
  }

  async function upgrade(planName: "manual" | "premium") {
    setLoading(true);
    try {
      await purchasePlan(planName, billingPeriod);
      await refresh();
      setScreen("home");
      Alert.alert(
        "Savlivo",
        planName === "manual"
          ? tr("Manual is active. You control each subscription yourself.")
          : tr("Premium is active. Autopilot recommendations are unlocked.")
      );
    } catch (err: any) {
      const purchaseErrorMessage =
        typeof err?.message === "string" &&
        err.message.trim() &&
        err.message.toLowerCase() !== "unknown error"
          ? err.message
          : "Apple could not complete this purchase. Check that your App Store account country matches the selected Savlivo market, then try again.";

      Alert.alert(tr("Purchase failed"), purchaseErrorMessage);
    } finally {
      setLoading(false);
    }
  }

  async function addDemoSubscriptions() {
    if (!requireActivePlan("subscriptions")) return;

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
      Alert.alert(tr("Could not add subscriptions"), err.message);
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
      return { title: "", body: "", confirm: tr("Continue") };
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
        title: tr("Manage {service}", {service: subscription.serviceName}),
        body: tr("This subscription is billed through Apple. Savlivo will take you to Apple subscription settings to {action} it.", {action: selectedLanguage === "en" ? actionLabel.toLowerCase() : tr(actionLabel)}),
        confirm: tr("Open {provider}", {provider:"Apple"})
      };
    }

    if (provider === "google-play") {
      return {
        title: tr("Manage {service}", {service: subscription.serviceName}),
        body: tr("This subscription is billed through Google Play. Savlivo will take you to Google Play to {action} it.", {action: selectedLanguage === "en" ? actionLabel.toLowerCase() : tr(actionLabel)}),
        confirm: tr("Open {provider}", {provider:"Google Play"})
      };
    }

    if (provider === "amazon") {
      return {
        title: tr("Manage {service}", {service: subscription.serviceName}),
        body: tr("This subscription is billed through Amazon. Savlivo will take you to the correct Amazon subscription page to {action} it.", {action: selectedLanguage === "en" ? actionLabel.toLowerCase() : tr(actionLabel)}),
        confirm: tr("Open {provider}", {provider:"Amazon"})
      };
    }

    return {
      title: `${tr(actionLabel)} ${subscription.serviceName}?`,
      body: tr("Savlivo will help you {action} this subscription. You can review the final provider step before anything changes.", {action: selectedLanguage === "en" ? actionLabel.toLowerCase() : tr(actionLabel)}),
      confirm: tr(actionLabel)
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
      countryCode: subscription.countryCode ?? selectedCountryCode
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

    return openSubscriptionManagementBrowser(url, {
      platform: Platform.OS,
      openSystemBrowser: (destination) => WebBrowser.openBrowserAsync(destination, {
        dismissButtonStyle: "done",
        presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET
      }),
      openExternal: openProviderUrl
    });
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
    if (!requireActivePlan("subscription management")) return;
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
        err?.body?.error ?? tr("Could not update subscription status.")
      );
    } finally {
      setStatusConfirmOpen(false);
      setPendingProviderResult(null);
      providerWasOpenedRef.current = false;
    }
  }

  async function removeSubscription() {
    if (!requireActivePlan("subscription management")) return;

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
        err?.body?.error ?? tr("Could not remove subscription.")
      );
    }
  }

  async function confirmActionSheet() {
    if (!requireActivePlan("subscription management")) return;
    if (!actionSheet) return;

    const { subscription, action } = actionSheet;

    // Safari must be presented after the native action sheet has dismissed.
    // Keep external/deep-link timing unchanged for destinations outside the Safari sheet flow.
    if (actionSheetDismissedRef.current) return;
    const managementUrl = providerManagementFallbackUrl(subscription, action);
    const usesSystemBrowser = usesSubscriptionManagementBrowser(managementUrl, Platform.OS);
    const sheetDismissed = usesSystemBrowser
      ? new Promise<void>(resolve => { actionSheetDismissedRef.current = resolve; })
      : null;
    setActionSheet(null);

    try {
      if (sheetDismissed) await sheetDismissed;

      if (usesSystemBrowser) {
        await new Promise<void>((resolve) => {
          Alert.alert(
            "Savlivo",
            "Når du er ferdig med abonnementsendringene, trykk på ✓ øverst til venstre for å gå tilbake til Savlivo.",
            [{ text: "Fortsett", onPress: () => resolve() }],
            { cancelable: false }
          );
        });
      }

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
        tr("Action unavailable"),
        tr("Savlivo could not open a verified management page for this subscription.")
      );
    } catch (err: any) {
      Alert.alert(
        "Savlivo",
        err?.message ??
          tr("Could not open the provider management page.")
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

  const marketItems = subscriptionsForMarket(items, selectedCountryCode);

  const activeRegionalPrices = marketItems
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

  const savingNowRegionalPrices = marketItems
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

  const savedSoFarRegionalMinor = marketItems.reduce(
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

  const annualizedReviewableSpendRegionalMinor = marketItems
    .filter(
      (item) => effectiveSubscriptionStatus(item) === "ACTIVE"
    )
    .reduce((sum, item) => {
      const monthly = billedMonthlyMinor(item);
      return sum + (monthly ?? 0) * 12;
    }, 0);


  const currentMonthlySpendRegionalMinor = marketItems
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

  const activeItems = marketItems.filter(
    (item) => effectiveSubscriptionStatus(item) === "ACTIVE"
  );

  const recommendationCandidates = [...activeItems]
    .sort(
      (a, b) =>
        (billedMonthlyMinor(b) ?? 0) -
        (billedMonthlyMinor(a) ?? 0)
    )
    .slice(0, 2);

  const activeCount = marketItems.filter(
    (item) => effectiveSubscriptionStatus(item) === "ACTIVE"
  ).length;

  const nextRenewal = [...marketItems]
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
    : tr("Renewal date not set");

  const upcomingRenewals = [...marketItems]
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

  const premiumRecommendations = [...marketItems]
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

  const dataHealthIssue = marketItems
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
          title: tr("{service} needs more information", {service: dataHealthIssue.item.serviceName}),
          detail: tr("Missing {fields}. Fix this so reminders and recommendations stay accurate.", {fields: dataHealthIssue.missing.map(field => tr(field)).join(tr(", "))}),
          action: "Fix now" as const,
          subscription: dataHealthIssue.item,
          fixData: true
        }
      : null,
    nextRenewal
      ? {
          key: "renewal",
          title: tr("{service} renews soon", {service: nextRenewal.serviceName}),
          detail: nextRenewal.renewalDate
            ? tr("Renews {date}", {date: formatRenewalDateDisplay(nextRenewal.renewalDate)})
            : "Renewal date available",
          action: "Review" as const,
          subscription: nextRenewal
        }
      : null,
    marketItems.find((item) => effectiveSubscriptionStatus(item) === "PAUSED")
      ? (() => {
          const item = marketItems.find(
            (entry) => effectiveSubscriptionStatus(entry) === "PAUSED"
          )!;
          return {
            key: "paused",
            title: tr("{service} is paused", {service: item.serviceName}),
            detail: tr("You are not currently paying for this service."),
            action: "Manage" as const,
            subscription: item
          };
        })()
      : null,
    recommendationCandidates[0]
      ? {
          key: "saving",
          title: reviewServiceLabel(recommendationCandidates[0].serviceName),
          detail: `${tr("3-month spend:")} ${formatRegionalAggregate(
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

  if (resetToken) {
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
          <View style={styles.modernBrandLockup}>
            <Image
              source={require("../assets/logo.png")}
              style={styles.modernHeaderLogo as any}
              resizeMode="cover"
            />

            <Text
              style={[
                styles.modernBrandLine,
                { color: theme.text }
              ]}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.82}
            >
              <Text style={styles.modernBrandName}>
                Savlivo
              </Text>
              <Text
                style={[
                  styles.modernBrandSlogan,
                  { color: visual.greenText }
                ]}
              >
                {` — ${tr("Smart money stays with you")}`}
              </Text>
            </Text>
          </View>

          <Text
            style={{
              color: theme.text,
              fontSize: 20,
              fontWeight: "700",
              marginBottom: 8
            }}
          >{tr("Reset password")}</Text>

          <Text
            style={{
              color: theme.muted,
              fontSize: 14,
              lineHeight: 20,
              marginBottom: 18
            }}
          >{tr("Choose a new password for your Savlivo account.")}</Text>

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
              value={resetPassword}
              onChangeText={setResetPassword}
              secureTextEntry={!showResetPassword}
              placeholder={tr("New password")}
              autoCapitalize="none"
              autoCorrect={false}
            />

            <Pressable
              style={styles.passwordVisibilityButton}
              onPress={() =>
                setShowResetPassword((value) => !value)
              }
              accessibilityRole="button"
              accessibilityLabel={
                showResetPassword
                  ? "Hide new password"
                  : "Show new password"
              }
            >
              <Ionicons
                name={
                  showResetPassword
                    ? "eye-off-outline"
                    : "eye-outline"
                }
                size={22}
                color={theme.muted}
              />
            </Pressable>
          </View>

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
              value={resetPasswordConfirm}
              onChangeText={setResetPasswordConfirm}
              secureTextEntry={!showResetPasswordConfirm}
              placeholder={tr("Confirm new password")}
              autoCapitalize="none"
              autoCorrect={false}
              onSubmitEditing={() => {
                if (!loading) {
                  void submitPasswordReset();
                }
              }}
            />

            <Pressable
              style={styles.passwordVisibilityButton}
              onPress={() =>
                setShowResetPasswordConfirm(
                  (value) => !value
                )
              }
              accessibilityRole="button"
              accessibilityLabel={
                showResetPasswordConfirm
                  ? "Hide confirmed password"
                  : "Show confirmed password"
              }
            >
              <Ionicons
                name={
                  showResetPasswordConfirm
                    ? "eye-off-outline"
                    : "eye-outline"
                }
                size={22}
                color={theme.muted}
              />
            </Pressable>
          </View>

          <Text
            style={{
              color: theme.muted,
              fontSize: 12,
              marginTop: -2,
              marginBottom: 14
            }}
          >{tr("Minimum 8 characters")}</Text>

          <Pressable
            style={[
              styles.primary,
              { backgroundColor: visual.greenHero },
              loading && { opacity: 0.6 }
            ]}
            disabled={loading}
            onPress={() => {
              void submitPasswordReset();
            }}
          >
            {loading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.primaryText}>{tr("Set new password")}</Text>
            )}
          </Pressable>

          <Pressable
            style={{
              alignSelf: "center",
              marginTop: 16
            }}
            disabled={loading}
            onPress={() => {
              setResetToken(null);
              setResetPassword("");
              setResetPasswordConfirm("");
            }}
          >
            <Text
              style={{
                color: theme.muted,
                fontSize: 12,
                fontWeight: "600"
              }}
            >{tr("Back to login")}</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  if (
    !authed &&
    preferencesHydrated &&
    registrationOnboarding
  ) {
    const languageOptions = appLanguages;

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
            >{tr("Choose your language")}</Text>

            <Text
              style={[
                styles.formHint,
                {
                  color: theme.muted,
                  textAlign: "center",
                  marginBottom: 20
                }
              ]}
            >{tr("You can change this later in Settings.")}</Text>

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
              <Text style={styles.primaryText}>{tr("Create my account")}</Text>
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
          >{tr("Choose your subscription market")}</Text>

          <Text
            style={[
              styles.formHint,
              {
                color: theme.muted,
                textAlign: "center",
                marginBottom: 16
              }
            ]}
          >{tr("This controls which services, plans and local prices Savlivo shows you.")}</Text>

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
              setOnboardingStep("language");
            }}
          >
            <Text style={styles.primaryText}>{tr("Continue")}</Text>
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
          <View style={styles.modernBrandLockup}>
            <Image
              source={require("../assets/logo.png")}
              style={styles.modernHeaderLogo as any}
              resizeMode="cover"
            />

            <Text
              style={[styles.modernBrandLine, { color: theme.text }]}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.82}
            >
              <Text style={styles.modernBrandName}>Savlivo</Text>

              <Text
                style={[
                  styles.modernBrandSlogan,
                  { color: visual.greenText }
                ]}
              >
                {` — ${tr("Smart money stays with you")}`}
              </Text>
            </Text>
          </View>

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
            placeholder={tr("Email")}
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
              placeholder={tr("Password")}
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
            >{tr("Remember me")}</Text>
          </Pressable>

          <Pressable
            style={[
              styles.primary,
              { backgroundColor: visual.greenHero }
            ]}
            onPress={() => loginOrRegister(false)}
            disabled={loading}
          >
            <Text style={styles.primaryText}>{tr("Log in")}</Text>
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
            <Text style={[styles.secondaryText, { color: theme.text }]}>{tr("Create account")}</Text>
          </Pressable>

          <Pressable
            onPress={() => void requestPasswordReset()}
            disabled={loading}
            accessibilityRole="button"
            accessibilityLabel={tr("Forgot password?")}
            style={{
              alignSelf: "flex-end",
              marginTop: 8,
              marginBottom: 14
            }}
          >
            <Text
              style={{
                color: theme.muted,
                fontSize: 12,
                fontWeight: "600",
                letterSpacing: -0.1
              }}
            >{tr("Forgot password?")}</Text>
          </Pressable>

          {loading ? <ActivityIndicator style={{ marginTop: 16 }} /> : null}
        </View>
      </SafeAreaView>
    );
  }

  if (authed && biometricLocked) {
    return (
      <SafeAreaView style={[styles.screen, { backgroundColor: theme.bg }]}>
        <StatusBar
          style={darkMode ? "light" : "dark"}
          backgroundColor={theme.bg}
        />
        <View style={styles.authCard}>
          <Ionicons
            name="lock-closed-outline"
            size={42}
            color={visual.green}
          />
          <Text style={[styles.brand, { color: theme.text }]}>
            Savlivo
          </Text>
          <Text style={[styles.tagline, { color: theme.muted }]}>
            {tr("Unlock to continue")}
          </Text>
          <Pressable
            style={styles.primary}
            onPress={() => {
              void authenticateWithBiometrics().then((authenticated) => {
                setBiometricLocked(!authenticated);
              });
            }}
          >
            <Text style={styles.primaryText}>
              {tr("Unlock with Face ID / Touch ID")}
            </Text>
          </Pressable>
          <Pressable
            style={styles.secondary}
            onPress={() => {
              setBiometricLocked(false);
              setAuthed(false);
            }}
          >
            <Text style={[styles.secondaryText, { color: theme.text }]}>
              {tr("Use password")}
            </Text>
          </Pressable>
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

    for (const item of marketItems) {
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
    if (!requireActivePlan("Premium actions")) return;
    if (!aiGuidedAction) return;

    const { subscription: requested, action } = aiGuidedAction;
    const current=resolveSavedManagement({kind:"open-subscription-management",version:1,requiresConfirmation:true,
      countryCode:selectedCountryCodeRef.current,currency:selectedCountryCurrency(),serviceQuery:requested.serviceName,managementAction:action},
      items,selectedCountryCodeRef.current,selectedCountryCurrency());
    if(current.kind!=="subscription" || current.subscription.id!==requested.id) {
      setAiGuidedAction(null);
      setScreen("subscriptions");
      return;
    }
    const subscription=current.subscription;
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

    // Reuse the same native sheet, URL-capability browser and explicit result confirmation as the subscription card.
    setAiGuidedAction(null);
    openActionSheet(subscription, action);
  }

  function routeAssistantManagement(intent: ManagementIntent): string | null {
    const resolved=resolveSavedManagement(intent,items,selectedCountryCodeRef.current,selectedCountryCurrency());
    if(resolved.kind!=="subscription") {
      if(resolved.kind!=="invalid")setScreen("subscriptions");
      return resolved.kind==="ambiguous" ? tr("More than one saved subscription matches. Select the exact subscription in Subscriptions; nothing has changed.") :
        tr("No unique saved subscription matches in this market. Select the subscription in Subscriptions; no management destination was opened.");
    }
    const {subscription,action}=resolved;
    const destination=getSubscriptionManagementUrl({serviceSlug:subscription.serviceSlug,billingProviderSlug:subscription.billingProviderSlug,
      countryCode:subscription.countryCode??selectedCountryCode,action});
    if(!destination)return tr("Savlivo does not have a verified management destination for this saved billing route. Open your provider account yourself; nothing has changed.");
    if(action==="CANCEL" || (action==="REACTIVATE" && effectiveSubscriptionStatus(subscription)!=="ACTIVE") ||
      (action==="PAUSE" && supportsSubscriptionAction(subscription.serviceSlug,subscription.billingProviderSlug,"PAUSE"))) {
      beginAiGuidedAction(subscription,action);
      return null;
    }
    const market=selectedCountryCodeRef.current;
    const epoch=discoveryEpochRef.current;
    Alert.alert(tr("Manage subscription"),tr("{service} · {billing}. Savlivo can open the existing management destination. Choose the requested option there if available; opening or closing the page does not change your saved subscription.", {service:subscription.serviceName,billing:tr(billingProviders.find(provider=>provider.slug===subscription.billingProviderSlug)?.name ?? subscription.billingProviderSlug)}),[
      {text:tr("Cancel"),style:"cancel"},
      {text:tr("Open management"),onPress:()=>{ void (async()=>{
        if(!discoveryRequestIsCurrent({countryCode:market,epoch},{countryCode:selectedCountryCodeRef.current,epoch:discoveryEpochRef.current}))return;
        if(usesSubscriptionManagementBrowser(destination,Platform.OS))await new Promise<void>(resolve=>Alert.alert("Savlivo",
          "Når du er ferdig med abonnementsendringene, trykk på ✓ øverst til venstre for å gå tilbake til Savlivo.",
          [{text:"Fortsett",onPress:()=>resolve()}],{cancelable:false}));
        if(!discoveryRequestIsCurrent({countryCode:market,epoch},{countryCode:selectedCountryCodeRef.current,epoch:discoveryEpochRef.current}))return;
        try {
          const opened=await openSubscriptionManagementBrowser(destination,{platform:Platform.OS,
            openSystemBrowser:url=>WebBrowser.openBrowserAsync(url,{dismissButtonStyle:"done",presentationStyle:WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET}),openExternal:openProviderUrl});
          if(!opened)Alert.alert("Savlivo",tr("Could not open management. No subscription was changed."));
        } catch {Alert.alert("Savlivo",tr("Could not open management. No subscription was changed."));}
      })();}}
    ]);
    return null;
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
    index: number,
    uiLocale?: string
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
            uiLocale ?? detectSpeechLanguage(
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
        tr("Could not play reply"),
        tr("Please try again.")
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
          tr("Microphone access"),
          tr("Savlivo needs microphone permission so you can dictate a message.")
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
        tr("Could not start microphone"),
        err?.message ??
          tr("Please try again.")
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
        tr("Could not understand recording"),
        err?.body?.error ??
          err?.message ??
          tr("Please try again.")
      );
    } finally {
      setAiVoiceSending(false);
      setAiVoiceBusy(false);
    }
  }

  async function askSavlivo(
    questionOverride?: unknown
  ) {
    if (!requireActivePlan("Savlivo AI")) return;

    const question =
      (
        typeof questionOverride === "string"
          ? questionOverride
          : aiInput
      ).trim();

    if (!question) return;
    const requestEpoch=++discoveryEpochRef.current;

    const requestMarket=selectedCountryCodeRef.current;
    let interpretedRemote: RemoteAssistantResult | undefined;
    setAiGuidedAction(null);
    try {
      const remote=await askRemoteAssistant(question,aiMessages.slice(-10).map(({role,text})=>({role,text})),{
        countryCode:selectedCountryCode,countryName:selectedCountryName,currency:selectedCurrency,languageHint:selectedLanguage,
        currentMonthlySpendMinor:currentMonthlySpendRegionalMinor,currentAnnualSpendMinor:currentAnnualSpendRegionalMinor,
        currentMonthlySavingsMinor:currentMonthlySavingsRegionalMinor,savedSoFarMinor:savedSoFarRegionalMinor
      });
      if(!discoveryRequestIsCurrent({countryCode:requestMarket,epoch:requestEpoch},{countryCode:selectedCountryCodeRef.current,epoch:discoveryEpochRef.current}))return;
      if(typeof remote.answer!=="string")throw new Error("INVALID_ASSISTANT_RESPONSE");
      interpretedRemote=remote;
      const candidate=remote.assistantAction??remote.catalogAction;
      let guidance:string|null=null;
      if(candidate?.kind==="open-add-subscription")openCatalogAction(candidate);
      else if(candidate?.kind==="open-subscription-management")guidance=routeAssistantManagement(candidate);
      else if(remote.intent==="NAVIGATION" && ["home","subscriptions","savings","autopilot","ai","settings","plans"].includes(remote.navigationTarget??""))setScreen(remote.navigationTarget as Screen);
      // Preserve the existing deterministic account calculations and preference handlers where they understand the request.
      if(candidate || !["GOAL","PREFERENCE","SCENARIO","COMPARISON","SPENDING_INFO","SAVINGS_INFO","RENEWAL_INFO"].includes(remote.intent)) {
        setAiMessages(current=>[...current,{role:"user",text:question},{role:"assistant",text:guidance ? remote.answer+"\n\n"+guidance:remote.answer}]);
        setAiInput("");
        if(!candidate)keepLatestAiMessageVisible(false);
        return;
      }
    } catch {
      if(!discoveryRequestIsCurrent({countryCode:requestMarket,epoch:requestEpoch},{countryCode:selectedCountryCodeRef.current,epoch:discoveryEpochRef.current}))return;
      // Offline support remains bounded; the multilingual path above never uses these patterns as a gate.
      const addIntent=parseAddSubscriptionIntent(question,selectedCountryCode,selectedCountryCurrency());
      if(addIntent && openCatalogAction(addIntent)) {
        setAiMessages(current=>[...current,{role:"user",text:question},{role:"assistant",text:tr("Review and confirm in the form. Nothing has been added yet."),uiKey:"Review and confirm in the form. Nothing has been added yet."}]);
        setAiInput("");return;
      }
    }

    const q = question.toLowerCase();
    const subscriptionIntent =
      classifySubscriptionIntent(question);

    setAiGuidedAction(null);

    let answer =
      "I can help with your subscriptions, spending, savings, renewals, app features and subscription decisions.";

    const reasoningItems = marketItems.map((item) => {
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
        marketItems
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
        ? marketItems.find(
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
                marketItems.find(
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
          ? marketItems.find(
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
      // The offline matcher is intentionally not authority for a specific saved bill.
      setScreen("subscriptions");
      answer="Select the exact saved subscription in Subscriptions and use its management button. No provider page was opened and nothing was changed.";
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

    if(answer===localFallbackAnswer)answer=interpretedRemote?.answer ?? "The general assistant is currently unavailable. You can still use Savlivo's local help and subscription forms.";

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
        label: currentNavLabels.home,
        accessibilityLabel: currentNavLabels.home,
        icon: "home-outline",
        activeIcon: "home"
      },
      {
        key: "subscriptions",
        label: currentNavLabels.subscriptions,
        accessibilityLabel: currentNavLabels.subscriptions,
        icon: "card-outline",
        activeIcon: "card"
      },
      {
        key: "savings",
        label: currentNavLabels.savings,
        accessibilityLabel: currentNavLabels.savings,
        icon: "trending-up-outline",
        activeIcon: "trending-up"
      },
      ...(effectivePlan === "PREMIUM"
        ? [
            {
              key: "autopilot" as Screen,
              label: currentNavLabels.autopilot,
              accessibilityLabel: currentNavLabels.autopilot,
              icon: "sparkles-outline" as keyof typeof Ionicons.glyphMap,
              activeIcon: "sparkles" as keyof typeof Ionicons.glyphMap
            },
            {
              key: "ai" as Screen,
              label: currentNavLabels.ai,
              accessibilityLabel: currentNavLabels.ai,
              icon: "chatbubble-ellipses-outline" as keyof typeof Ionicons.glyphMap,
              activeIcon: "chatbubble-ellipses" as keyof typeof Ionicons.glyphMap
            }
          ]
        : []),
      {
        key: "settings",
        label: currentNavLabels.settings,
        accessibilityLabel: currentNavLabels.settings,
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
      if (isCurrentMarketPricing(snapshot, countryCode, selectedCountryCodeRef.current)) {
        setPricingSnapshot(snapshot);
      }

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
          text: tr("Cancel"),
          style: "cancel"
        },
        {
          text: tr("Reset"),
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
          text: tr("Save"),
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
                tr("Enter a valid monthly price.")
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
      marketItems
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
      marketItems
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
    if(serviceSlug === "manual")return [];

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

  function serviceHasRegionalPricing(serviceSlug: string) {
    return billingProvidersForService(serviceSlug).some(
      (provider) =>
        regionalPlanOptions(serviceSlug, provider.slug).length > 0
    );
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
      return tr("Price unavailable");
    }

    // The amount is already a verified local amount for this country.
    return formatRegionalMinor(
      minor,
      currency
    );
  }

  function formatRegionalMinor(minor: number, currency: string) {
    return formatMarketMinor(minor, currency, appLocale(selectedLanguage));
  }

  function formatStoredSubscriptionPrice(item: Subscription) {
    const minor = item.monthlyPriceMinor ?? 0;
    const storedCurrency = item.currency || "USD";

    return formatMarketMinor(minor, storedCurrency, appLocale(selectedLanguage));
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
    if (code !== selectedCountryCodeRef.current) {
      discoveryEpochRef.current += 1;
      setAiGuidedAction(null);
      setServiceFormOpen(false);
      setSubscriptionPlanInput("");
      setMonthlyPriceInput("");
      setCustomServiceName("");
      setCatalogQuery("");
      setCatalogCategory(undefined);
    }
    selectedCountryCodeRef.current = code;
    setPricingSnapshot(null);
    setSelectedCountryCode(code);
    setSelectedCountryName(name);
    setSelectedCurrency(currency);

    // Language remains independent of subscription market.
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
    if (!dateOnly) return tr("Renewal date not set");

    const [year, month, day] = dateOnly.split("-").map(Number);
    const parsed = new Date(year, month - 1, day);

    return new Intl.DateTimeFormat(appLocale(selectedLanguage), {
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
    if(saveServiceBusyRef.current)return;
    discoveryEpochRef.current += 1;
    setCatalogQuery("");
    setCatalogCategory(undefined);
    setServiceSelectionLocked(false);
    setServicePickerOpen(true);
  }

  function beginAddService(serviceSlug: string) {
    const service =
      serviceCatalog.find(
        (entry) => entry.slug === serviceSlug
      );

    if (!service || saveServiceBusyRef.current) return;
    discoveryEpochRef.current += 1;
    formMarketRef.current = selectedCountryCodeRef.current;
    setCustomServiceName("");

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

    if (serviceAvailableInMarket(service.slug, selectedCountryCode)) syncPlanAndPrice(
      service.slug,
      defaultBillingProvider
    );

    setServicePickerOpen(false);
    setServiceFormOpen(true);
  }

  function beginManualService(name = "") {
    if(saveServiceBusyRef.current)return;
    discoveryEpochRef.current += 1;
    if (!requireActivePlan("subscription management")) return;
    formMarketRef.current = selectedCountryCodeRef.current;
    editingSubscriptionIdRef.current = null;
    setEditingSubscriptionId(null);
    setServiceSlugInput("manual");
    setCustomServiceName(name.slice(0,100));
    setServiceSelectionLocked(true);
    setBillingProviderInput("");
    setSubscriptionPlanInput("");
    setMonthlyPriceInput("");
    setRenewalDateInput("");
    setShowRenewalDatePicker(false);
    setServicePickerOpen(false);
    setServiceFormOpen(true);
  }

  function openCatalogAction(action: unknown) {
    if(saveServiceBusyRef.current)return false;
    const candidate=validateAddSubscriptionIntent(action,selectedCountryCodeRef.current,selectedCountryCurrency(),pricingSnapshot?.items??[]);
    if(!candidate || !requireActivePlan("subscription management"))return false;
    Keyboard.dismiss();
    if(candidate.kind==="manual")beginManualService(candidate.customServiceName);
    else {
      beginAddService(candidate.serviceSlug);
      setBillingProviderInput(candidate.billingProviderSlug);
      setSubscriptionPlanInput("planName" in candidate.prefill ? String(candidate.prefill.planName) : "");
      setMonthlyPriceInput("monthlyPriceMinor" in candidate.prefill ? (Number(candidate.prefill.monthlyPriceMinor)/100).toFixed(2) : "");
    }
    return true;
  }

  function openEditService(item: Subscription) {
    if(saveServiceBusyRef.current)return;
    discoveryEpochRef.current += 1;
    formMarketRef.current = selectedCountryCodeRef.current;
    setCustomServiceName(item.customServiceName ?? "");
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
    if (!requireActivePlan("subscription management")) return;

    if(saveServiceBusyRef.current || formMarketRef.current !== selectedCountryCodeRef.current) return;
    if(!billingProviderInput) { Alert.alert(tr("Billing route required"), tr("Select how you actually pay for this subscription.")); return; }
    const monthly = Number(monthlyPriceInput.trim().replace(",", "."));
    if (!Number.isFinite(monthly) || monthly <= 0) {
      Alert.alert(
        tr("Monthly price required"),
        tr("Savlivo does not have a verified price for every service and billing route yet. Enter the amount you actually pay each month.")
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
      ...(serviceSlugInput === "manual" ? {customServiceName:customServiceName.trim()} : {}),
      serviceSlug: serviceSlugInput,
      billingProviderSlug: billingProviderInput,
      countryCode: selectedCountryCode,
      monthlyPriceMinor: Math.round(monthly * 100),
      currency: subscriptionCurrency,
      renewalDate:
        normalizeDateOnly(renewalDateInput) || undefined,
      planName: subscriptionPlanInput || undefined
    };

    try {
      if(serviceSlugInput === "manual")validateManualSubscription(body);
      if(!Number.isSafeInteger(body.monthlyPriceMinor) || body.monthlyPriceMinor>2147483647)throw new Error("Amount too large");
      saveServiceBusyRef.current=true;
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
        err?.body?.error ?? err?.message ?? tr("Could not save subscription.")
      );
    } finally { saveServiceBusyRef.current=false; }
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
              ? tr("Pauses")
              : tr("Cancels")
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
          tr("Price unavailable");

    const renewalCopy =
      scheduledStatusLabel ??
      (
        item.renewalDate
          ? `${tr("Renewal")} ${formatRenewalDateDisplay(
              item.renewalDate
            )}`
          : tr("Renewal date not set")
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
              {item.customServiceName ? `${tr("Manual subscription")} · ` : ""}{item.billingProviderSlug}
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
              {tr("/ month")}
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
              {localizedStatus(displayedStatus)}
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
              {tr("Saved so far")}
            </Text>

            <Text
              style={[
                styles.modernSavedValue,
                { color: visual.greenText }
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
                    {tr("Pause")}
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
                  {tr("Cancel")}
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
                  {tr("Reactivate")}
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
                  {tr("Cancel")}
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
                {tr("Reactivate")}
              </Text>
            </Pressable>
          ) : null}

          <Pressable
            accessibilityLabel={
              editSubscriptionLabel(item.serviceName)
            }
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
              <Text style={[styles.backText, { color: theme.text }]}>{tr("← Home")}</Text>
            </Pressable>
            <Text style={[styles.planHeaderTitle, { color: theme.text }]}>{tr("Plans")}</Text>
            <View style={styles.headerSpacer} />
          </View>

          <View style={[styles.planIntro, { backgroundColor: theme.surface }]}>
            <Text style={[styles.planPageTitle, { color: theme.text }]}>{tr("Choose your Savlivo plan")}</Text>
            <Text style={[styles.muted, { color: theme.muted }]}>{tr("Preview Savlivo before subscribing. Manual unlocks the self-service tools. Premium adds Savlivo AI, Autopilot and advanced insights.")}</Text>

            {plan === "VIEWER" ? (
              <View style={{ marginTop: 14 }}>
                <Text style={[styles.planCopy, { color: theme.muted, marginBottom: 8 }]}>{tr("Preview mode")}</Text>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <Pressable
                    onPress={() => setPreviewPlan("MANUAL")}
                    style={[
                      styles.backButton,
                      {
                        flex: 1,
                        borderRadius: 14,
                        alignItems: "center",
                        justifyContent: "center",
                        backgroundColor:
                          previewPlan === "MANUAL"
                            ? visual.greenHero
                            : theme.surface,
                        borderColor:
                          previewPlan === "MANUAL"
                            ? visual.greenMuted
                            : theme.border
                      }
                    ]}
                  >
                    <Text style={[styles.backText, { color: theme.text }]}>{tr("Manual Preview")}</Text>
                  </Pressable>

                  <Pressable
                    onPress={() => setPreviewPlan("PREMIUM")}
                    style={[
                      styles.backButton,
                      {
                        flex: 1,
                        borderRadius: 14,
                        alignItems: "center",
                        justifyContent: "center",
                        backgroundColor:
                          previewPlan === "PREMIUM"
                            ? visual.greenHero
                            : theme.surface,
                        borderColor:
                          previewPlan === "PREMIUM"
                            ? visual.greenMuted
                            : theme.border
                      }
                    ]}
                  >
                    <Text style={[styles.backText, { color: theme.text }]}>{tr("Premium Preview")}</Text>
                  </Pressable>
                </View>

                <Text style={[styles.planCopy, { color: theme.muted, marginTop: 10 }]}>{tr("You are previewing")}{previewPlan === "PREMIUM" ? "Premium" : "Manual"}{tr(". Upgrade to use these features with your own data.")}</Text>
              </View>
            ) : null}
          </View>

          <View
            style={[
              styles.planOption,
              {
                backgroundColor:
                  plan === "VIEWER"
                    ? visual.greenHero
                    : theme.surface,
                borderColor:
                  plan === "VIEWER"
                    ? visual.greenMuted
                    : theme.border
              }
            ]}
          >
            <Text style={[styles.planName, { color: theme.text }]}>Preview</Text>
            <Text style={[styles.planPrice, { color: theme.text }]}>{tr("Preview mode")}</Text>
            <Text style={[styles.planCopy, { color: theme.muted }]}>{tr("Explore the Manual and Premium experiences before subscribing. Real actions require an active plan.")}</Text>
            {plan === "VIEWER" ? (
              <Text style={[styles.planCopy, { color: theme.muted }]}>{tr("Current plan")}</Text>
            ) : null}
          </View>
          <View
            style={{
              flexDirection: "row",
              gap: 8,
              marginTop: 24,
              marginBottom: 4
            }}
          >
            <Pressable
              onPress={() => setBillingPeriod("monthly")}
              style={[
                styles.backButton,
                {
                  flex: 1,
                  borderRadius: 14,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor:
                    billingPeriod === "monthly"
                      ? visual.greenHero
                      : theme.surface,
                  borderColor:
                    billingPeriod === "monthly"
                      ? visual.greenMuted
                      : theme.border
                }
              ]}
            >
              <Text style={[styles.backText, { color: theme.text }]}>{tr("Monthly")}</Text>
            </Pressable>

            <Pressable
              onPress={() => setBillingPeriod("annual")}
              style={[
                styles.backButton,
                {
                  flex: 1,
                  borderRadius: 14,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor:
                    billingPeriod === "annual"
                      ? visual.greenHero
                      : theme.surface,
                  borderColor:
                    billingPeriod === "annual"
                      ? visual.greenMuted
                      : theme.border
                }
              ]}
            >
              <Text style={[styles.backText, { color: theme.text }]}>{tr("Annual")}</Text>
            </Pressable>
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
            <Text style={[styles.planPrice, { color: theme.text }]}>
              {savlivoPlanPrice("manual").display}
            </Text>
            <Text style={[styles.formHint, {color: theme.muted}]}>{savlivoPlanPrice("manual").note}</Text>
            <Text style={[styles.planCopy, { color: theme.muted }]}>{tr("Self-service toolbox: manage subscriptions, renewal dates and savings yourself.")}</Text>
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
              {savlivoPlanPrice("premium").display}
            </Text>
            <Text style={[styles.formHint, {color: theme.muted}]}>{savlivoPlanPrice("premium").note}</Text>
            <Text
              style={[
                styles.planCopy,
                { color: plan === "PREMIUM" && darkMode
                    ? "#D7E9DF"
                    : theme.muted }
              ]}
            >{tr("Decision engine + AI assistant: monthly optimization plans, renewal timing alerts, what-if savings, Autopilot recommendations, setup help and troubleshooting.")}</Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    );
  }

  async function exportSavlivoData() {
    try {
      const escapeHtml = (value: unknown) =>
        String(value ?? "")
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;")
          .replace(/'/g, "&#039;");

      const formatMinor = (
        minor?: number,
        currency?: string
      ) => {
        if (typeof minor !== "number") return "—";

        const code = currency || selectedCurrency || "USD";

        try {
          return new Intl.NumberFormat(appLocale(selectedLanguage), {
            style: "currency",
            currency: code,
            maximumFractionDigits: 2
          }).format(minor / 100);
        } catch {
          return `${code} ${(minor / 100).toFixed(2)}`;
        }
      };

      const logoAsset = Asset.fromModule(
        require("../assets/logo.png")
      );
      await logoAsset.downloadAsync();

      const logoBase64 = logoAsset.localUri
        ? await FileSystem.readAsStringAsync(
            logoAsset.localUri,
            {
              encoding: FileSystem.EncodingType.Base64
            }
          )
        : "";

      const logoSrc = logoBase64
        ? `data:image/png;base64,${logoBase64}`
        : "";

      const statusMeta = (statusValue: string) => {
        const normalized =
          statusValue.trim().toUpperCase();

        if (normalized === "ACTIVE") {
          return {
            label: "Active",
            className: "status-active"
          };
        }

        if (normalized === "PAUSED") {
          return {
            label: "Paused",
            className: "status-paused"
          };
        }

        if (
          normalized === "CANCELLED" ||
          normalized === "CANCELED"
        ) {
          return {
            label: "Cancelled",
            className: "status-cancelled"
          };
        }

        return {
          label:
            statusValue.charAt(0).toUpperCase() +
            statusValue.slice(1).toLowerCase(),
          className: "status-neutral"
        };
      };

      const reportItems = subscriptionsForMarket(items, selectedCountryCode);

      const protectedNames =
        aiPreferences.protectedSubscriptionIds
          .map(
            (id) =>
              reportItems.find((item) => item.id === id)
                ?.serviceName
          )
          .filter(
            (name): name is string => Boolean(name)
          );

      const currentSubscriptions = reportItems.filter(
        (item) => {
          const status = effectiveSubscriptionStatus(item)
            .trim()
            .toUpperCase();

          return (
            status !== "CANCELLED" &&
            status !== "CANCELED"
          );
        }
      );

      const cancelledSubscriptions = reportItems.filter(
        (item) => {
          const status = effectiveSubscriptionStatus(item)
            .trim()
            .toUpperCase();

          return (
            status === "CANCELLED" ||
            status === "CANCELED"
          );
        }
      );

      const savedCurrencies = new Set(
        reportItems
          .filter(
            (item) =>
              typeof item.savedSoFarMinor === "number" &&
              Number.isFinite(item.savedSoFarMinor) &&
              item.savedSoFarMinor > 0 &&
              Boolean(item.currency)
          )
          .map((item) => String(item.currency))
      );

      const totalSavedMinor = reportItems.reduce(
        (sum, item) =>
          sum + (item.savedSoFarMinor ?? 0),
        0
      );

      const recordedSavingsDisplay =
        savedCurrencies.size > 1
          ? "Multiple currencies"
          : formatMinor(
              totalSavedMinor,
              savedCurrencies.size === 1
                ? [...savedCurrencies][0]
                : selectedCurrency
            );

      const renderSubscriptionCards = (
        subscriptions: Subscription[],
        emptyMessage: string
      ) =>
        subscriptions.length > 0
          ? subscriptions
              .map((item) => {
                const status = statusMeta(
                  effectiveSubscriptionStatus(item)
                );

                return `
                  <div class="subscription">
                    <div class="subscription-main">
                      <div class="subscription-name-wrap">
                        <div class="service">
                          ${escapeHtml(item.serviceName)}
                        </div>
                        <div class="plan">
                          ${escapeHtml(
                            item.planName || "Subscription"
                          )}
                        </div>
                      </div>

                      <div class="status-wrap">
                        <span
                          class="status-pill ${status.className}"
                        >
                          ${escapeHtml(status.label)}
                        </span>
                      </div>
                    </div>

                    <div class="details">
                      <div class="detail">
                        <span>Monthly price</span>
                        <strong>
                          ${escapeHtml(
                            formatMinor(
                              item.monthlyPriceMinor,
                              item.currency
                            )
                          )}
                        </strong>
                      </div>

                      <div class="detail">
                        <span>Renewal date</span>
                        <strong>
                          ${escapeHtml(
                            item.renewalDate || "—"
                          )}
                        </strong>
                      </div>

                      <div class="detail">
                        <span>Saved so far</span>
                        <strong>
                          ${escapeHtml(
                            formatMinor(
                              item.savedSoFarMinor,
                              item.currency
                            )
                          )}
                        </strong>
                      </div>
                    </div>
                  </div>
                `;
              })
              .join("")
          : `
              <div class="empty">
                ${escapeHtml(emptyMessage)}
              </div>
            `;

      const subscriptionCards =
        renderSubscriptionCards(
          currentSubscriptions,
          "No current subscriptions."
        );

      const cancelledSubscriptionCards =
        cancelledSubscriptions.length > 0
          ? `
              <div class="section">
                <div class="section-label">
                  Subscription history
                </div>
                ${renderSubscriptionCards(
                  cancelledSubscriptions,
                  ""
                )}
              </div>
            `
          : "";

      const exportedAt = new Date();

      const html = `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8" />
            <style>
              @page {
                margin: 32px;
              }

              * {
                box-sizing: border-box;
              }

              body {
                margin: 0;
                background: #ffffff;
                color: #17352a;
                font-family:
                  -apple-system,
                  BlinkMacSystemFont,
                  "Helvetica Neue",
                  Arial,
                  sans-serif;
                font-size: 13px;
                line-height: 1.45;
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
              }

              .header {
                display: flex;
                justify-content: space-between;
                align-items: flex-start;
                gap: 24px;
                padding: 4px 0 22px;
                border-bottom: 1px solid #dfe8e3;
              }

              .header-brand {
                display: flex;
                align-items: center;
                gap: 12px;
              }

              .logo {
                width: 48px;
                height: 48px;
                object-fit: cover;
                border-radius: 12px;
              }

              .brand-name {
                color: #173d30;
                font-size: 27px;
                line-height: 1;
                font-weight: 800;
                letter-spacing: -0.8px;
              }

              .tagline {
                margin-top: 5px;
                color: #27895c;
                font-size: 10px;
                font-weight: 700;
              }

              .header-copy {
                text-align: right;
              }

              h1 {
                margin: 0;
                color: #173d30;
                font-size: 25px;
                line-height: 1.1;
                font-weight: 800;
                letter-spacing: -0.6px;
              }

              .subtitle {
                margin-top: 6px;
                color: #7a8982;
                font-size: 10px;
              }

              .section {
                margin-top: 24px;
              }

              .section-label {
                margin-bottom: 11px;
                color: #27895c;
                font-size: 10px;
                font-weight: 800;
                letter-spacing: 1.1px;
                text-transform: uppercase;
              }

              .overview {
                display: flex;
                flex-wrap: wrap;
                gap: 9px;
              }

              .metric {
                width: 48%;
                min-height: 72px;
                padding: 13px 14px;
                background: #f5f8f6;
                border: 1px solid #dfe8e3;
                border-radius: 12px;
                page-break-inside: avoid;
              }

              .metric-label {
                color: #7a8982;
                font-size: 10px;
                margin-bottom: 4px;
              }

              .metric-value {
                color: #173d30;
                font-size: 16px;
                font-weight: 800;
              }

              .subscription {
                margin-bottom: 9px;
                padding: 14px;
                background: #ffffff;
                border: 1px solid #e0e8e3;
                border-radius: 12px;
                page-break-inside: avoid;
              }

              .subscription-main {
                display: flex;
                justify-content: space-between;
                align-items: center;
                gap: 16px;
                margin-bottom: 12px;
              }

              .subscription-name-wrap {
                flex: 1;
              }

              .service {
                color: #17352a;
                font-size: 15px;
                font-weight: 800;
              }

              .plan {
                margin-top: 2px;
                color: #87938e;
                font-size: 11px;
              }

              .status-wrap {
                display: flex;
                align-items: center;
                justify-content: flex-end;
              }

              .status-pill {
                display: inline-block;
                min-width: 70px;
                padding: 5px 10px;
                border-radius: 999px;
                text-align: center;
                font-size: 9px;
                line-height: 1;
                font-weight: 800;
              }

              .status-active {
                color: #286a4a;
                background: #dcece3;
                border: 1px solid #c9dfd2;
              }

              .status-paused {
                color: #755b18;
                background: #f5e9c6;
                border: 1px solid #ead9a8;
              }

              .status-cancelled {
                color: #8a3d3f;
                background: #f3dfe0;
                border: 1px solid #e8cacc;
              }

              .status-neutral {
                color: #626f69;
                background: #edf1ef;
                border: 1px solid #dde4e0;
              }

              .details {
                display: flex;
                gap: 8px;
              }

              .detail {
                flex: 1;
                padding-top: 9px;
                border-top: 1px solid #edf1ef;
              }

              .detail span {
                display: block;
                margin-bottom: 3px;
                color: #87938e;
                font-size: 9px;
              }

              .detail strong {
                color: #354a42;
                font-size: 11px;
                font-weight: 700;
              }

              .preference {
                padding: 12px 14px;
                margin-bottom: 7px;
                background: #f5f8f6;
                border: 1px solid #dfe8e3;
                border-radius: 11px;
                page-break-inside: avoid;
              }

              .preference-label {
                color: #7a8982;
                font-size: 10px;
              }

              .preference-value {
                margin-top: 3px;
                color: #29463a;
                font-weight: 700;
              }

              .empty {
                padding: 18px;
                color: #75847d;
                background: #f5f8f6;
                border: 1px solid #e0e8e3;
                border-radius: 12px;
              }

              .footer {
                margin-top: 28px;
                padding-top: 13px;
                border-top: 1px solid #dfe8e3;
                color: #8b9792;
                font-size: 9px;
              }

              .footer strong {
                color: #5f746a;
              }
            </style>
          </head>

          <body>
            <div class="header">
              <div class="header-brand">
                ${
                  logoSrc
                    ? `<img
                        class="logo"
                        src="${logoSrc}"
                      />`
                    : ""
                }

                <div>
                  <div class="brand-name">
                    Savlivo
                  </div>
                  <div class="tagline">
                    Smart money stays with you
                  </div>
                </div>
              </div>

              <div class="header-copy">
                <h1>Data Export</h1>
                <div class="subtitle">
                  Your subscriptions, savings
                  and preferences
                </div>
              </div>
            </div>

            <div class="section">
              <div class="section-label">
                Account overview
              </div>

              <div class="overview">
                <div class="metric">
                  <div class="metric-label">
                    Savlivo plan
                  </div>
                  <div class="metric-value">
                    ${escapeHtml(planDisplayName)}
                  </div>
                </div>

                <div class="metric">
                  <div class="metric-label">
                    Subscription market
                  </div>
                  <div class="metric-value">
                    ${escapeHtml(selectedCountryName)}
                  </div>
                </div>

                <div class="metric">
                  <div class="metric-label">
                    Currency
                  </div>
                  <div class="metric-value">
                    ${escapeHtml(selectedCurrency)}
                  </div>
                </div>

                <div class="metric">
                  <div class="metric-label">
                    Subscriptions
                  </div>
                  <div class="metric-value">
                    ${currentSubscriptions.length}
                  </div>
                </div>

                <div class="metric">
                  <div class="metric-label">
                    Recorded savings
                  </div>
                  <div class="metric-value">
                    ${escapeHtml(recordedSavingsDisplay)}
                  </div>
                </div>
              </div>
            </div>

            <div class="section">
              <div class="section-label">
                Current subscriptions
              </div>
              ${subscriptionCards}
            </div>

            ${cancelledSubscriptionCards}

            <div class="section">
              <div class="section-label">
                Savings & preferences
              </div>

              <div class="preference">
                <div class="preference-label">
                  Monthly savings goal
                </div>
                <div class="preference-value">
                  ${
                    typeof aiPreferences
                      .monthlySavingsGoalMinor === "number"
                      ? escapeHtml(
                          formatMinor(
                            aiPreferences
                              .monthlySavingsGoalMinor,
                            selectedCurrency
                          )
                        )
                      : "Not set"
                  }
                </div>
              </div>

              <div class="preference">
                <div class="preference-label">
                  Protected services
                </div>
                <div class="preference-value">
                  ${
                    protectedNames.length
                      ? protectedNames
                          .map(escapeHtml)
                          .join(", ")
                      : "None"
                  }
                </div>
              </div>
            </div>

            <div class="footer">
              <strong>Exported from Savlivo</strong>
              ·
              ${escapeHtml(
                exportedAt.toLocaleString(appLocale(selectedLanguage))
              )}
              · Smart money stays with you
            </div>
          </body>
        </html>
      `;

      const { uri } =
        await Print.printToFileAsync({ html });

      const reportDate =
        exportedAt.toISOString().slice(0, 10);

      const reportUri =
        `${FileSystem.cacheDirectory}Savlivo-Report-${reportDate}.pdf`;

      await FileSystem.copyAsync({
        from: uri,
        to: reportUri
      });

      const sharingAvailable =
        await Sharing.isAvailableAsync();

      if (!sharingAvailable) {
        Alert.alert(
          "Savlivo",
          tr("Your data export was created, but sharing is not available on this device.")
        );
        return;
      }

      await Sharing.shareAsync(reportUri, {
        mimeType: "application/pdf",
        dialogTitle: "Export Savlivo data",
        UTI: "com.adobe.pdf"
      });
    } catch (err: any) {
      Alert.alert(
        "Savlivo",
        err?.message ??
          tr("Could not export your data.")
      );
    }
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
              style={styles.modernHeaderLogo as any}
              resizeMode="cover"
            />
            <Text
              style={[styles.modernBrandLine, { color: theme.text }]}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.82}
            >
              <Text style={styles.modernBrandName}>Savlivo</Text>
              <Text style={[styles.modernBrandSlogan, { color: visual.greenText }]}>
                {` — ${tr("Smart money stays with you")}`}
              </Text>
            </Text>
          </View>
          <View
            style={[
              styles.modernPlanSlot,
              {
                width: plan === "PREMIUM" ? "16.6667%" : "25%"
              }
            ]}
          >
            <Pressable
              style={[
                styles.modernPlanBadge,
                {
                  backgroundColor:
                    plan === "PREMIUM"
                      ? visual.greenSoft
                      : visual.surfaceInteractive,
                  borderColor:
                    plan === "PREMIUM"
                      ? "transparent"
                      : visual.greenMuted
                }
              ]}
              onPress={() => setScreen("plans")}
            >
              <Text
                style={[
                  styles.modernPlanBadgeText,
                  {
                    color:
                      darkMode
                        ? plan === "PREMIUM"
                          ? visual.green
                          : theme.muted
                        : visual.greenText
                  }
                ]}
              >
                {planDisplayName}
              </Text>
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
                    { color: visual.greenText }
                  ]}
                >
                  {tr("SAVLIVO ASSISTANT")}
                </Text>

                <Text
                  style={[
                    styles.modernAiTitle,
                    { color: theme.text }
                  ]}
                >
                  {tr("What can I help with?")}
                </Text>

                <Text
                  style={[
                    styles.modernAiSubtitle,
                    { color: theme.muted }
                  ]}
                >
                  {tr("Ask about spending, renewals or subscription actions.")}
                </Text>
              </View>
            </View>

            {aiMessages.length <= 1 ? (
              <View style={styles.modernAiSuggestions}>
                {[
                  tr("What renews next?"),
                  tr("How much am I saving?"),
                  tr("What should I review?")
                ].map((suggestion) => (
                  <Pressable
                    key={suggestion}
                    style={[
                      styles.modernAiSuggestionChip,
                      {
                        backgroundColor:
                          visual.surfaceRaised,
                        borderColor:
                          visual.greenMuted
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
                      {message.uiKey ? tr(message.uiKey) : message.text}
                    </Text>

                    {message.role === "assistant" ? (
                      <Pressable
                        accessibilityLabel={
                          aiSpeakingMessageIndex === index
                            ? tr("Stop spoken reply")
                            : tr("Listen to reply")
                        }
                        style={styles.aiListenButton}
                        onPress={() => {
                          if (
                            aiSpeakingMessageIndex === index
                          ) {
                            void stopAiSpeech();
                          } else {
                            void speakAiMessage(
                              message.uiKey ? tr(message.uiKey) : message.text,
                              index,
                              message.uiKey ? appLocale(selectedLanguage) : undefined
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
                            ? tr("Stop")
                            : tr("Listen")}
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
                    <Text style={[styles.aiGuideEyebrow, { color: visual.greenText }]}>
                      {tr("GUIDED ACTION")}
                    </Text>
                    <Text style={[styles.aiGuideTitle, { color: theme.text }]}>
                      {aiGuidedAction.action === "CANCEL"
                        ? tr("Cancel")
                        : aiGuidedAction.action === "PAUSE"
                          ? tr("Pause")
                          : tr("Reactivate")}{" "}
                      {aiGuidedAction.subscription.serviceName}
                    </Text>
                    <Text style={[styles.aiGuideCopy, { color: theme.muted }]}>
                      {tr(aiGuidedAction.stepText)}
                    </Text>

                    <Pressable
                      style={styles.aiGuideButton}
                      onPress={openAiGuidedAction}
                    >
                      <Text style={styles.aiAssistantButtonText}>
                        {tr("Open provider and continue")}
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
                        {tr("Listening… Tap stop when you're done")}
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
                          ? tr("Sending…")
                          : tr("Transcribing…")}
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
                  placeholder={
                    tr("Try “pause YouTube”, “cancel Prime” or ask for help...")
                  }
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
                      ? tr("Stop voice recording")
                      : tr("Start voice recording")
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
                          : visual.greenMuted
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
                            : visual.green
                        }
                      />

                      <Text
                        style={[
                          styles.aiVoiceButtonLabel,
                          {
                            color:
                              aiRecorderState.isRecording
                                ? "#C9363E"
                                : visual.green
                          }
                        ]}
                      >
                        {aiRecorderState.isRecording
                          ? tr("Stop")
                          : tr("Talk")}
                      </Text>
                    </>
                  )}
                </Pressable>

                <Pressable
                  style={[
                    styles.aiSendButton,
                    {
                      backgroundColor: visual.greenHero,
                      borderColor: visual.greenMuted,
                      borderWidth: 1
                    }
                  ]}
                  onPress={askSavlivo}
                >
                  <Text style={styles.aiAssistantButtonText}>{tr("Send")}</Text>
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
                <Text style={[styles.compactHomeEyebrow, { color: visual.greenText }]}>
                  {tr("OVERVIEW")}
                </Text>
                <Text style={[styles.compactHomeTitle, { color: theme.text }]}>
                  {tr("Your subscriptions")}
                </Text>
              </View>

              <Pressable
                style={[
                  styles.compactPlanPill,
                  {
                    backgroundColor: theme.surface,
                    borderColor: visual.greenMuted
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
                    {tr("YOU'RE SAVING")}
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
                      {" "}{tr("/ month")}
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
                  {tr("Annual savings")}
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
                      backgroundColor: visual.surfaceInteractive,
                      borderColor: visual.greenMuted
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
                {tr("Current monthly spend")}
              </Text>

              <Text style={[styles.compactSpendValue, { color: theme.text }]}>
                {formatRegionalAggregate(totalMonthlyRegionalMinor)}
              </Text>

              <Text style={[styles.compactMetricHint, { color: theme.muted }]}>
                {activeSubscriptionSummary(activeCount, marketItems.length)}
              </Text>
            </Pressable>

            <View style={styles.compactAtGlanceHeader}>
              <Text
                style={[
                  styles.compactSectionLabel,
                  { color: theme.muted }
                ]}
              >
                {tr("AT A GLANCE")}
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
                        backgroundColor: visual.surfaceInteractive,
                      borderColor: visual.greenMuted
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
                  {tr("Next renewal")}
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
                        backgroundColor: visual.surfaceInteractive,
                      borderColor: visual.greenMuted
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
                  {tr("Annual spend")}
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
                  <Text style={[styles.compactSectionLabel, { color: visual.greenText }]}>
                    {tr("NEXT BEST MOVE")}
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
                        ? reviewServiceLabel(premiumPause.item.serviceName)
                        : tr("Your subscriptions look optimized")}
                    </Text>

                    <Text style={[styles.compactActionCopy, { color: theme.muted }]}>
                      {premiumPause
                        ? threeMonthSpendLabel(formatRegionalAggregate(premiumPause.monthly * 3))
                        : tr("Open Autopilot to review your monthly action plan.")}
                    </Text>
                  </View>

                  <View
                    style={[
                      styles.compactMetricChevronButton,
                      {
                        backgroundColor: darkMode
                          ? visual.surfaceInteractive
                          : "#FFFFFF",
                        borderColor: visual.greenMuted
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
                  <Text style={[styles.compactSectionLabel, { color: visual.greenText }]}>
                    {tr("NEEDS ATTENTION")}
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
                  backgroundColor: visual.greenSoft,
                  borderColor: darkMode
                    ? "#19583D"
                    : visual.borderSubtle
                }
              ]}
              onPress={() => setScreen("ai")}
            >
              <Ionicons
                name="chatbubble-ellipses-outline"
                size={18}
                color={visual.green}
              />

              <Text style={[styles.compactAiText, { color: visual.greenMuted }]}>
                {tr("Ask Savlivo AI")}
              </Text>

              <Text style={[styles.compactChevron, { color: visual.greenMuted }]}>›</Text>
            </Pressable>
          </>
        ) : null}

        {screen === "subscriptions" ? (
          <>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: theme.text }]}>{tr("Subscriptions")}</Text>
              <Text style={[styles.badge, { backgroundColor: theme.pill, color: theme.text }]}>{marketItems.length}</Text>
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
                {tr("+ Add service")}
              </Text>
            </Pressable>
            {marketItems.map((item) => (
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
                  { color: visual.greenText }
                ]}
              >
                {tr("YOUR PROGRESS")}
              </Text>

              <Text
                style={[
                  styles.modernScreenTitle,
                  { color: theme.text }
                ]}
              >
                {tr("Savings")}
              </Text>

              <Text
                style={[
                  styles.modernScreenSubtitle,
                  { color: theme.muted }
                ]}
              >
                {tr("See what you are saving now and where your next review could make the biggest difference.")}
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
                  {tr("SAVED SO FAR")}
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
                {tr("Accumulated while subscriptions were paused or cancelled.")}
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
                    {tr("Saving now")}
                  </Text>

                  <Text
                    style={[
                      styles.modernSavingsStatValue,
                      { color: visual.greenText }
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
                      {" "}{tr("/ mo")}
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
                    {tr("Annual pace")}
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
                { color: visual.greenText }
              ]}
            >
              {tr("CURRENT POSITION")}
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
                  {tr("Monthly spend")}
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
                  {tr("Annual spend")}
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
                  {tr("REVIEWABLE SPEND · 3 MONTHS")}
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
                  {tr("Active subscription spend worth reviewing, not guaranteed savings.")}
                </Text>
              </View>
            </View>

            <View style={styles.modernRecommendationsHeader}>
              <View>
                <Text
                  style={[
                    styles.modernSectionEyebrow,
                    { color: visual.greenText }
                  ]}
                >
                  {tr("WHERE TO LOOK NEXT")}
                </Text>

                <Text
                  style={[
                    styles.modernRecommendationsTitle,
                    { color: theme.text }
                  ]}
                >
                  {tr("Subscriptions to review")}
                </Text>
              </View>

              {recommendationCandidates.length > 0 ? (
                <View
                  style={[
                    styles.modernRecommendationCount,
                    {
                      backgroundColor:
                        darkMode ? "#174D35" : "#D5F4E3"
                    }
                  ]}
                >
                  <Text
                    style={[
                      styles.modernRecommendationCountText,
                      { color: visual.greenMuted }
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
                    backgroundColor: visual.greenSoft,
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
                  {tr("You have no active services to review right now.")}
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
                            : visual.surfaceInteractive,
                        borderColor:
                        index === 0
                          ? "transparent"
                          : visual.greenMuted
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
                      {tr("Review")} {item.serviceName}
                    </Text>

                    <Text
                      style={[
                        styles.modernRecommendationCopy,
                        { color: theme.muted }
                      ]}
                    >
                      {tr("3-month spend:")}{" "}
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
                  { color: visual.greenText }
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
                {tr("A focused monthly action plan based on your current subscriptions.")}
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
                      { color: visual.greenText }
                    ]}
                  >
                    {tr("MONTHLY ACTION PLAN")}
                  </Text>

                  <Text
                    style={[
                      styles.modernAutopilotTitle,
                      { color: theme.text }
                    ]}
                  >
                    {tr("Focus on what matters")}
                  </Text>
                </View>
              </View>

              <Text
                style={[
                  styles.modernAutopilotIntro,
                  { color: theme.muted }
                ]}
              >
                {tr("Savlivo uses your active prices, statuses and renewal dates to prioritize what is worth reviewing. You stay in control of every change.")}
              </Text>
            </View>

            <Text
              style={[
                styles.modernSectionEyebrow,
                { color: visual.greenText }
              ]}
            >
              {tr("THIS MONTH")}
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
                    {tr("REVIEW FIRST")}
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
                    {tr("3-month spend:")}{" "}
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
                  {tr("Nothing urgent to review right now.")}
                </Text>
              </View>
            )}

            {premiumKeep.length ? (
              <>
                <Text
                  style={[
                    styles.modernSectionEyebrow,
                    {
                      color: visual.greenText,
                      marginTop: 22
                    }
                  ]}
                >
                  {tr("GOOD TO KEEP")}
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
                        {tr("Lower-cost active subscription")}
                      </Text>
                    </View>

                    <View
                      style={[
                        styles.modernKeepPill,
                        {
                          backgroundColor:
                            darkMode ? "#174D35" : "#D5F4E3"
                        }
                      ]}
                    >
                      <Text
                        style={[
                          styles.modernKeepPillText,
                          { color: visual.greenMuted }
                        ]}
                      >
                        {tr("KEEP")}
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
                  backgroundColor: visual.greenSoft,
                  borderColor: darkMode
                    ? "#19583D"
                    : visual.borderSubtle
                }
              ]}
            >
              <Ionicons
                name="shield-checkmark-outline"
                size={19}
                color={visual.green}
              />

              <Text
                style={[
                  styles.modernControlCopy,
                  { color: visual.greenMuted }
                ]}
              >
                {tr("Savlivo will ask before any subscription change is made.")}
              </Text>
            </View>
          </>
        ) : null}

        {screen === "settings" ? (
          <>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: theme.text }]}>
                {tr("Settings")}
              </Text>
            </View>

            {[
              {
                title: "Account & plan",
                icon: "person-outline" as const,
                rows: [
                  ["Email", email, ""],
                  ["Savlivo plan", planDisplayName, "Manage"]
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
                        ? ` · ${
                            tr("Prices checked")
                          } ${new Date(
                            pricingSnapshot.updatedAt
                          ).toLocaleDateString(appLocale(selectedLanguage))}`
                        : ` · ${tr("Pricing update pending")}`
                    }`,
                    "Change"
                  ]
                ]
              },
              {
                title: "Security",
                icon: "lock-closed-outline" as const,
                rows: [
                  [
                    "Face ID / Touch ID",
                    biometricAvailable
                      ? "Use biometrics to unlock Savlivo"
                      : "Biometrics unavailable on this device",
                    biometricEnabled ? "On" : "Off"
                  ],
                  [
                    "Change password",
                    "Update your account password",
                    "Change"
                  ]
                ]
              },
              {
                title: "Notifications",
                icon: "notifications-outline" as const,
                rows: [
                  [
                    "Renewal reminders",
                    "Alert before a subscription renews",
                    renewalRemindersEnabled ? "On" : "Off"
                  ],
                  [
                    "Savings opportunities",
                    "Surface potential savings",
                    savingsOpportunitiesEnabled ? "On" : "Off"
                  ]
                ]
              },
              {
                title: "Premium & Autopilot",
                icon: "sparkles-outline" as const,
                rows: [
                  [
                    "Ask before changes",
                    "Require approval before automated actions",
                    askBeforeChangesEnabled ? "On" : "Off"
                  ],
                  ["Never pause", "Choose protected services later", "Configure"]
                ]
              },
              {
                title: "Privacy & data",
                icon: "shield-checkmark-outline" as const,
                rows: [
                  ["Export data", "Subscriptions, savings and preferences", "PDF"],
                  ["Delete account", "Remove your Savlivo account and data", "Remove"]
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
                    {tr(group.title)}
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
                        {tr(title)}
                      </Text>
                      <Text style={[styles.settingsRowValue, { color: theme.muted }]}>
                        {tr(value)}
                      </Text>
                    </View>

                    {action ? (
                      title === "Face ID / Touch ID" ||
                      title === "Renewal reminders" ||
                      title === "Savings opportunities" ||
                      title === "Ask before changes" ? (
                        <Switch
                          value={
                            title === "Face ID / Touch ID"
                              ? biometricEnabled
                              : title === "Renewal reminders"
                                ? renewalRemindersEnabled
                                : title === "Savings opportunities"
                                  ? savingsOpportunitiesEnabled
                                  : askBeforeChangesEnabled
                          }
                          disabled={
                            title === "Face ID / Touch ID" &&
                            !biometricAvailable
                          }
                          onValueChange={() => {
                            if (title === "Face ID / Touch ID") {
                              void toggleBiometricUnlock();
                            } else if (title === "Renewal reminders") {
                              setRenewalRemindersEnabled((value) => !value);
                            } else if (title === "Savings opportunities") {
                              setSavingsOpportunitiesEnabled((value) => !value);
                            } else if (title === "Ask before changes") {
                              setAskBeforeChangesEnabled((value) => !value);
                            }
                          }}
                          trackColor={{
                            false: darkMode ? "#5A5A5E" : "#D1D1D6",
                            true: visual.greenMuted
                          }}
                          ios_backgroundColor={
                            darkMode ? "#5A5A5E" : "#D1D1D6"
                          }
                        />
                      ) : (
                      <Pressable
                        style={[
                          styles.settingsAction,
                          softShadow,
                          {
                            backgroundColor: visual.surfaceInteractive,
                            borderColor:
                              title === "Delete account"
                                ? darkMode
                                  ? "#FF8A80"
                                  : "#D92D20"
                                : action === "Off"
                                  ? darkMode
                                    ? "#FF8A80"
                                    : "#B42318"
                                  : visual.greenMuted
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
                          if (title === "Never pause") {
                            setNeverPauseModalOpen(true);
                          }
                          if (title === "Change password") {
                            setCurrentPasswordInput("");
                            setNewPasswordInput("");
                            setConfirmNewPasswordInput("");
                            setShowCurrentPasswordInput(false);
                            setShowNewPasswordInput(false);
                            setShowConfirmNewPasswordInput(false);
                            setChangePasswordModalOpen(true);
                          }
                          if (title === "Export data") {
                            void exportSavlivoData();
                          }
                          if (title === "Face ID / Touch ID") {
                            void toggleBiometricUnlock();
                          }
                          if (title === "Delete account") {
                            Alert.alert(
                              tr("Remove account?"),
                              tr(
                                "Your Savlivo account will be scheduled for deletion in 7 days. Sign in again within that period to cancel the deletion."
                              ),
                              [
                                {
                                  text: tr("Keep"),
                                  style: "cancel"
                                },
                                {
                                  text: tr("Remove"),
                                  style: "destructive",
                                  onPress: async () => {
                                    try {
                                      await api("/v1/me", {
                                        method: "DELETE"
                                      });
                                      await clearToken();
                                      setAuthed(false);
                                      setBiometricEnabled(false);
                                      setBiometricLocked(false);
                                      setScreen("home");
                                    } catch (err) {
                                      const message =
                                        err instanceof Error
                                          ? err.message
                                          : "UNKNOWN_ERROR";
                                      Alert.alert(
                                        tr("Could not remove account"),
                                        message
                                      );
                                    }
                                  }
                                }
                              ]
                            );
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
                                  : theme.text
                            }
                          ]}
                        >
                          {tr(action)}
                        </Text>
                      </Pressable>
                      )
                    ) : null}
                  </View>
                ))}
              </View>
            ))}

            <Pressable
              style={[
                styles.settingsLogout,
                {
                  backgroundColor: darkMode ? "#3A1F21" : "#FDECEC",
                  borderColor: darkMode ? "#FF8A80" : "#D92D20"
                }
              ]}
              onPress={logout}
            >
              <Text
                style={[
                  styles.secondaryText,
                  { color: darkMode ? "#FF8A80" : "#B42318" }
                ]}
              >
                {tr("Log out")}
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
        visible={changePasswordModalOpen}
        animationType="fade"
        onRequestClose={() =>
          setChangePasswordModalOpen(false)
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
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12
              }}
            >
              <View style={{ flex: 1 }}>
                <Text
                  style={[
                    styles.settingsRowTitle,
                    { color: theme.text }
                  ]}
                >
                  {tr("Change password")}
                </Text>

                <Text
                  style={[
                    styles.formHint,
                    { color: theme.muted }
                  ]}
                >
                  {tr("Update your account password")}
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
                  setChangePasswordModalOpen(false)
                }
              >
                <Ionicons
                  name="close"
                  size={20}
                  color={visual.greenMuted}
                />
              </Pressable>
            </View>

            <View
              style={[
                styles.passwordInputWrap,
                { marginTop: 18 }
              ]}
            >
              <TextInput
                style={[
                  styles.input,
                  styles.passwordInput,
                  {
                    backgroundColor: darkMode
                      ? "#0B1014"
                      : "#FFFFFF",
                    borderColor: theme.border,
                    color: theme.text
                  }
                ]}
                placeholderTextColor={theme.muted}
                value={currentPasswordInput}
                onChangeText={setCurrentPasswordInput}
                secureTextEntry={!showCurrentPasswordInput}
                placeholder={tr("Current password")}
                autoCapitalize="none"
                autoCorrect={false}
              />

              <Pressable
                style={styles.passwordVisibilityButton}
                onPress={() =>
                  setShowCurrentPasswordInput(
                    (value) => !value
                  )
                }
              >
                <Ionicons
                  name={
                    showCurrentPasswordInput
                      ? "eye-off-outline"
                      : "eye-outline"
                  }
                  size={22}
                  color={theme.muted}
                />
              </Pressable>
            </View>

            <View style={styles.passwordInputWrap}>
              <TextInput
                style={[
                  styles.input,
                  styles.passwordInput,
                  {
                    backgroundColor: darkMode
                      ? "#0B1014"
                      : "#FFFFFF",
                    borderColor: theme.border,
                    color: theme.text
                  }
                ]}
                placeholderTextColor={theme.muted}
                value={newPasswordInput}
                onChangeText={setNewPasswordInput}
                secureTextEntry={!showNewPasswordInput}
                placeholder={tr("New password")}
                autoCapitalize="none"
                autoCorrect={false}
              />

              <Pressable
                style={styles.passwordVisibilityButton}
                onPress={() =>
                  setShowNewPasswordInput(
                    (value) => !value
                  )
                }
              >
                <Ionicons
                  name={
                    showNewPasswordInput
                      ? "eye-off-outline"
                      : "eye-outline"
                  }
                  size={22}
                  color={theme.muted}
                />
              </Pressable>
            </View>

            <View style={styles.passwordInputWrap}>
              <TextInput
                style={[
                  styles.input,
                  styles.passwordInput,
                  {
                    backgroundColor: darkMode
                      ? "#0B1014"
                      : "#FFFFFF",
                    borderColor: theme.border,
                    color: theme.text
                  }
                ]}
                placeholderTextColor={theme.muted}
                value={confirmNewPasswordInput}
                onChangeText={setConfirmNewPasswordInput}
                secureTextEntry={!showConfirmNewPasswordInput}
                placeholder={tr("Confirm new password")}
                autoCapitalize="none"
                autoCorrect={false}
                onSubmitEditing={() => {
                  if (!loading) {
                    void submitPasswordChange();
                  }
                }}
              />

              <Pressable
                style={styles.passwordVisibilityButton}
                onPress={() =>
                  setShowConfirmNewPasswordInput(
                    (value) => !value
                  )
                }
              >
                <Ionicons
                  name={
                    showConfirmNewPasswordInput
                      ? "eye-off-outline"
                      : "eye-outline"
                  }
                  size={22}
                  color={theme.muted}
                />
              </Pressable>
            </View>

            <Text
              style={[
                styles.formHint,
                {
                  color: theme.muted,
                  marginBottom: 14
                }
              ]}
            >{tr("Minimum 8 characters")}</Text>

            <Pressable
              style={[
                styles.primary,
                { backgroundColor: visual.greenHero },
                loading && { opacity: 0.6 }
              ]}
              disabled={loading}
              onPress={() => {
                void submitPasswordChange();
              }}
            >
              {loading ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.primaryText}>{tr("Change password")}</Text>
              )}
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal
        transparent
        visible={neverPauseModalOpen}
        animationType="fade"
        onRequestClose={() => setNeverPauseModalOpen(false)}
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
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12
              }}
            >
              <View style={{ flex: 1 }}>
                <Text
                  style={[
                    styles.settingsRowTitle,
                    { color: theme.text }
                  ]}
                >
                  {tr("Never pause")}
                </Text>
                <Text
                  style={[
                    styles.formHint,
                    { color: theme.muted }
                  ]}
                >
                  {tr("Choose services Savlivo should protect")}
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
                  setNeverPauseModalOpen(false)
                }
              >
                <Text
                  style={[
                    styles.actionText,
                    { color: visual.greenMuted }
                  ]}
                >
                  {tr("Done")}
                </Text>
              </Pressable>
            </View>

            <ScrollView
              style={{
                maxHeight: 420,
                marginTop: 16
              }}
              showsVerticalScrollIndicator={false}
            >
              {marketItems
                .filter(
                  (item) =>
                    effectiveSubscriptionStatus(item) === "ACTIVE"
                )
                .map((item) => {
                  const protectedService =
                    aiPreferences
                      .protectedSubscriptionIds
                      .includes(item.id);

                  return (
                    <View
                      key={item.id}
                      style={[
                        styles.settingsRow,
                        {
                          borderColor:
                            visual.borderSubtle
                        }
                      ]}
                    >
                      <View
                        style={
                          styles.settingsRowInfo
                        }
                      >
                        <Text
                          style={[
                            styles.settingsRowTitle,
                            {
                              color: theme.text
                            }
                          ]}
                        >
                          {item.serviceName}
                        </Text>

                        {item.planName ? (
                          <Text
                            style={[
                              styles.settingsRowValue,
                              {
                                color: theme.muted
                              }
                            ]}
                          >
                            {item.planName}
                          </Text>
                        ) : null}
                      </View>

                      <Switch
                        value={protectedService}
                        onValueChange={(value) => {
                          setAiPreferences(
                            (current) =>
                              value
                                ? protectSubscription(
                                    current,
                                    item.id
                                  )
                                : unprotectSubscription(
                                    current,
                                    item.id
                                  )
                          );
                        }}
                        trackColor={{
                          false: darkMode
                            ? "#5A5A5E"
                            : "#D1D1D6",
                          true:
                            visual.greenMuted
                        }}
                        ios_backgroundColor={
                          darkMode
                            ? "#5A5A5E"
                            : "#D1D1D6"
                        }
                      />
                    </View>
                  );
                })}
            </ScrollView>
          </View>
        </View>
      </Modal>

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
                >{tr("Language")}</Text>
                <Text
                  style={[
                    styles.formHint,
                    { color: theme.muted }
                  ]}
                >
                  {tr("Choose the language you want Savlivo to use.")}
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
                  {tr("Done")}
                </Text>
              </Pressable>
            </View>

            <ScrollView
              style={styles.countryList}
              contentContainerStyle={styles.countryListContent}
              showsVerticalScrollIndicator
            >
              {appLanguages.map((option) => {
                const selected =
                  selectedLanguage === option.code;

                return (
                  <Pressable
                    key={option.code}
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
                    onPress={() =>
                      setSelectedLanguage(option.code)
                    }
                  >
                    <View style={styles.countryInfo}>
                      <Text
                        style={[
                          styles.settingsRowTitle,
                          { color: theme.text }
                        ]}
                      >
                        {option.label}
                      </Text>
                      <Text
                        style={[
                          styles.countryMeta,
                          { color: theme.muted }
                        ]}
                      >
                        {option.detail}
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
              })}
            </ScrollView>
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
                  {tr("Subscription market")}
                </Text>
                <Text style={[styles.formHint, { color: theme.muted }]}>
                  {tr("Choose the market for your subscriptions. Savlivo uses its local services, plans and currency.")}
                </Text>
              </View>
              <Pressable
                style={[
                  styles.regionClose,
                  { backgroundColor: visual.greenSoft }
                ]}
                onPress={() => setRegionModalOpen(false)}
              >
                <Text style={[styles.actionText, { color: visual.greenMuted }]}>
                  {tr("Done")}
                </Text>
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
              placeholder={tr("Search country")}
              placeholderTextColor={theme.muted}
              value={countrySearch}
              onChangeText={setCountrySearch}
              autoCapitalize="none"
              autoCorrect={false}
            />

            <Text style={[styles.fieldLabel, { color: theme.muted }]}>
              {tr("Country / region")}
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
                        {code} · {tr("local currency")} {currency}
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
                >{tr("Choose service")}</Text>

                <Text
                  style={[
                    styles.actionSheetBody,
                    {
                      color: theme.muted,
                      marginTop: 4
                    }
                  ]}
                >{tr("Select the subscription service you want to add.")}</Text>
              </View>

              <Pressable
                accessibilityLabel={tr("Close service picker")}
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
              automaticallyAdjustKeyboardInsets={Platform.OS === "ios"}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
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
              <TextInput
                accessibilityLabel={tr("Search subscription catalog")}
                placeholder={tr("Search services")}
                placeholderTextColor={theme.muted}
                autoCorrect={false}
                value={catalogQuery}
                onChangeText={setCatalogQuery}
                returnKeyType="search"
                onSubmitEditing={()=>Keyboard.dismiss()}
                style={[styles.input,{color:theme.text,backgroundColor:theme.surfaceSoft,borderColor:theme.border}]}
              />
              {catalogQuery ? <Pressable accessibilityLabel={tr("Clear catalog search")} onPress={()=>setCatalogQuery("")} style={{padding:12}}><Text style={{color:theme.text}}>{tr("Clear search")}</Text></Pressable> : null}
              <Pressable accessibilityRole="button" onPress={()=>beginManualService(catalogQuery)} style={[styles.servicePickerRow,{borderColor:theme.border}]}>
                <Text style={{color:theme.text}}>{tr("Add manually")}</Text>
              </Pressable>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                {[{id:undefined,name:"All categories"},...catalogCategories].map(category=>(
                  <Pressable key={category.id??"all"} accessibilityRole="button" accessibilityState={{selected:catalogCategory===category.id}}
                    onPress={()=>setCatalogCategory(category.id)} style={[styles.choiceChip,{borderColor:theme.border,backgroundColor:catalogCategory===category.id?theme.pill:theme.surface}]}>
                    <Text style={{color:theme.text}}>{tr(category.name)}</Text>
                  </Pressable>
                ))}
              </ScrollView>
              <Text style={[styles.formHint,{color:theme.muted}]}>{tr(catalogQuery?"Catalog results — select a service":"All available services in this market")}</Text>
              {catalogResults.length===0 ? <Text style={[styles.formHint,{color:theme.muted}]}>{tr("No matching services. You can add your subscription manually.")}</Text> : null}
              {catalogResults.map((service, index)=>(
                <Fragment key={service.slug}>
                {!catalogQuery.trim() && !catalogCategory && (index === 0 || catalogResults[index-1].categories[0] !== service.categories[0]) ? <Text accessibilityRole="header" style={[styles.formHint,{color:theme.text,fontWeight:"700",marginTop:12}]}>{tr(catalogCategories.find(category=>category.id===service.categories[0])?.name ?? "Other")}</Text> : null}
                <Pressable key={service.slug} accessibilityRole="button" accessibilityLabel={tr("Add {service}", {service:service.name})}
                  style={[styles.servicePickerRow,{borderBottomWidth:1,borderBottomColor:theme.border}]} onPress={()=>beginAddService(service.slug)}>
                  <ServiceLogo serviceSlug={service.slug} serviceName={service.name} size={38}/>
                  <View style={{flex:1,marginLeft:12}}>
                    <Text style={[styles.servicePickerName,{color:theme.text}]}>{service.name}</Text>
                    {!serviceAvailableInMarket(service.slug,selectedCountryCode) ? <Text style={{color:theme.muted}}>{tr("Local availability unverified · enter your actual bill")}</Text> : null}
                    {marketItems.some(item=>item.serviceSlug===service.slug) ? <Text style={{color:theme.muted}}>{tr("Already in this market — review before adding another")}</Text> : null}
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={visual.greenMuted}/>
                </Pressable>
                </Fragment>
              ))}

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
              {editingSubscriptionId
                ? tr("Edit subscription")
                : tr("Add service")}
            </Text>

            <Text style={[styles.formHint, { color: theme.muted }]}>
              {tr("Tap a local plan price to fill it automatically. You can still edit the monthly price manually if your actual billed amount is different.")}
            </Text>

            <Text style={[styles.formHint,{color:theme.muted}]}>{selectedCountryName} · {selectedCountryCurrency()}</Text>
            {serviceSlugInput === "manual" ? <>
              <Text style={[styles.formHint,{color:theme.muted}]}>{tr("Manual subscription · details are supplied by you, not verified provider metadata. Choose your actual billing route.")}</Text>
              <TextInput accessibilityLabel={tr("Manual service name")} placeholder={tr("Service name")} maxLength={100} value={customServiceName} onChangeText={setCustomServiceName} style={[styles.input,{color:theme.text,borderColor:theme.border,backgroundColor:theme.surfaceSoft}]} />
            </> : null}
            <Text style={[styles.fieldLabel, { color: theme.muted }]}>
              {tr("Service")}
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

                    const nextDraft = transitionCatalogDraft({serviceSlug:serviceSlugInput,billingProviderSlug:billingProviderInput,planName:subscriptionPlanInput,monthlyPrice:monthlyPriceInput}, nextServiceSlug, nextBillingProvider);
                    setSubscriptionPlanInput(nextDraft.planName);
                    setMonthlyPriceInput(nextDraft.monthlyPrice);
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
              {tr("Billing route")}
            </Text>
            <View style={styles.choiceWrap}>
              {(serviceSlugInput === "manual" ? billingProviders : billingProvidersForService(
                serviceSlugInput
              )).map((provider) => (
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
                    const nextDraft = transitionCatalogDraft({serviceSlug:serviceSlugInput,billingProviderSlug:billingProviderInput,planName:subscriptionPlanInput,monthlyPrice:monthlyPriceInput}, serviceSlugInput, provider.slug);
                    setSubscriptionPlanInput(nextDraft.planName);
                    setMonthlyPriceInput(nextDraft.monthlyPrice);
                    setBillingProviderInput(provider.slug);
                    syncPlanAndPrice(
                      serviceSlugInput,
                      provider.slug
                    );
                  }}
                >
                  <Text style={[styles.choiceChipText, { color: theme.text }]}>
                    {tr(provider.name)}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text style={[styles.fieldLabel, { color: theme.muted }]}>
              {tr("Plan")}
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
                          ? tr("✓ Verified")
                          : tr("Estimated current price")}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : (
              <Text style={[styles.formHint, { color: theme.muted }]}>
                {tr("No verified regional plan pricing is available yet.")}
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
                {tr("Estimated prices can vary by platform, promotion, and account. Check your actual subscription and edit the price manually below if needed.")}
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
                    {tr("Monthly price")} ({billCurrency})
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
                        {tr("Use automatic price")} ·{" "}
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
                        {tr("Verified local catalog price")}
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
                      {tr("This is your actual billed amount. You can edit it manually.")}
                    </Text>
                  ) : null}
                </>
              );
            })()}

            <Text style={[styles.fieldLabel, { color: theme.muted }]}>
              {tr("Renewal date")}
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
                      ? tr("Renewal date")
                      : tr("Choose renewal date")}
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
                      {renewalDateInput ||
                        (tr("Choose renewal date"))}
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
                    {tr("Clear")}
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
                  {tr("Cancel")}
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
                  {tr("Save")}
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
                    tr("Remove subscription?"),
                    tr("This removes the service from Savlivo. It does not cancel the subscription at the provider."),
                    [
                      {
                        text: tr("Keep"),
                        style: "cancel"
                      },
                      {
                        text: tr("Remove"),
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
                  {tr("Remove service")}
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
            <Text style={[styles.actionSheetTitle, { color: theme.text }]}>{tr("What changed at the provider?")}</Text>

            <Text style={[styles.actionSheetBody, { color: theme.muted }]}>{tr("Tell Savlivo what actually happened so spending and savings stay accurate.")}</Text>

            <Text style={[styles.fieldLabel, { color: theme.muted }]}>{tr("Effective date")}</Text>
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
                  >{tr("Yes, it was paused")}</Text>
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
                  >{tr("Yes, it was cancelled")}</Text>
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
                  >{tr("Yes, it is active")}</Text>
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
                >{tr("No change")}</Text>
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
            <Text style={[styles.actionSheetTitle, { color: theme.text }]}>{tr("Upcoming renewals")}</Text>

            <Text style={[styles.actionSheetBody, { color: theme.muted }]}>{tr("Confirmed renewal dates for your active subscriptions.")}</Text>

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
                  <Text style={[styles.muted, { color: theme.muted }]}>{tr("No confirmed renewal dates yet.")}</Text>
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
              <Text style={[styles.sheetButtonText, { color: theme.text }]}>{tr("Done")}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal
        transparent
        visible={!!actionSheet}
        onDismiss={() => {
          const resolve = actionSheetDismissedRef.current;
          actionSheetDismissedRef.current = null;
          resolve?.();
        }}
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
                <Text style={[styles.sheetButtonText, { color: theme.text }]}>{tr("Not now")}</Text>
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

  modernBrandLine: {
    flex: 1,
    minWidth: 0
  },
  modernBrandName: {
    fontSize: 22,
    fontWeight: "900",
    letterSpacing: -0.7
  },
  modernBrandSlogan: {
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: -0.1,
    position: "relative",
    top: -1
  },

  modernPlanSlot: {
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    transform: [{ translateX: -4 }, { translateY: 4 }]
  },
  modernPlanBadge: {
    marginLeft: 0,
    width: 72,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1
  },

  modernPlanBadgeText: {
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.6,
    textAlign: "center"
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
    borderWidth: 1,
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
    minHeight: 50,
    borderRadius: 16,
    marginTop: 14,
    marginBottom: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 10
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
    borderWidth: 1,
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
    borderWidth: 1,
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
