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
import { api, setToken } from "../src/api";
import { purchasePlan } from "../src/billing";
import { openProviderUrl } from "../src/providerRouting";
import {
  effectiveSubscriptionStatus as resolveEffectiveSubscriptionStatus
} from "../lib/subscription-status";
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

const serviceInitials: Record<string, string> = {
  netflix: "N",
  "disney-plus": "D+",
  max: "M",
  "prime-video": "P",
  "amazon-prime": "P",
  "apple-tv-plus": "A",
  "youtube-premium": "Y"
};

const serviceBrandColors: Record<string, string> = {
  netflix: "#E50914",
  "disney-plus": "#113CCF",
  max: "#002BE7",
  "prime-video": "#00A8E1",
  "amazon-prime": "#00A8E1",
  "apple-tv-plus": "#000000",
  "youtube-premium": "#FF0000"
};

const serviceCatalog = [
  { slug: "netflix", name: "Netflix" },
  { slug: "disney-plus", name: "Disney+" },
  { slug: "max", name: "Max" },
  { slug: "prime-video", name: "Prime Video" },
  { slug: "amazon-prime", name: "Amazon Prime" },
  { slug: "apple-tv-plus", name: "Apple TV+" },
  { slug: "youtube-premium", name: "YouTube Premium" }
];

const billingProviders = [
  { slug: "direct", name: "Direct" },
  { slug: "apple", name: "Apple" },
  { slug: "google-play", name: "Google Play" },
  { slug: "amazon", name: "Amazon" },
  { slug: "carrier", name: "Carrier / TV provider" }
];

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
  ["FI", "Finland", "EUR"]
] as const;

const allCurrencies = Array.from(
  new Set(countryCurrencyData.map(([, , currency]) => currency))
).sort();


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


const verifiedRegionalFallback: Record<
  string,
  {
    currency: string;
    prices: Record<string, Record<string, number>>;
  }
> = {
  US: {
    currency: "USD",
    prices: {
      netflix: { direct: 1799, apple: 1799, "google-play": 1799, amazon: 1799, carrier: 1799 },
      "disney-plus": { direct: 1599, apple: 1599, "google-play": 1599, amazon: 1599, carrier: 1599 },
      max: { direct: 1299, apple: 1299, "google-play": 1299, amazon: 1299, carrier: 1299 },
      "prime-video": { direct: 899, apple: 899, "google-play": 899, amazon: 899, carrier: 899 },
      "apple-tv-plus": { direct: 999, apple: 999, "google-play": 999, amazon: 999, carrier: 999 },
      "youtube-premium": { direct: 1599, apple: 1899, "google-play": 1399, amazon: 1599, carrier: 1599 }
    }
  },
  NO: {
    currency: "NOK",
    prices: {
      netflix: { direct: 14900, apple: 14900, "google-play": 14900, amazon: 14900, carrier: 14900 },
      "disney-plus": { direct: 10900, apple: 10900, "google-play": 10900, amazon: 10900, carrier: 10900 },
      max: { direct: 12900, apple: 12900, "google-play": 12900, amazon: 12900, carrier: 12900 },
      "prime-video": { direct: 7900, apple: 7900, "google-play": 7900, amazon: 7900, carrier: 7900 },
      "apple-tv-plus": { direct: 11900, apple: 11900, "google-play": 11900, amazon: 11900, carrier: 11900 },
      "youtube-premium": { direct: 16900, apple: 20900, "google-play": 16900, amazon: 16900, carrier: 16900 }
    }
  }
};

const providerPricing: Record<string, Record<string, number>> = {
  netflix: {
    direct: 17.99,
    apple: 17.99,
    "google-play": 17.99,
    amazon: 17.99,
    carrier: 17.99
  },
  "disney-plus": {
    direct: 15.99,
    apple: 15.99,
    "google-play": 15.99,
    amazon: 15.99,
    carrier: 15.99
  },
  max: {
    direct: 12.99,
    apple: 12.99,
    "google-play": 12.99,
    amazon: 12.99,
    carrier: 12.99
  },
  "prime-video": {
    direct: 8.99,
    apple: 8.99,
    "google-play": 8.99,
    amazon: 8.99,
    carrier: 8.99
  },
  "apple-tv-plus": {
    direct: 9.99,
    apple: 9.99,
    "google-play": 9.99,
    amazon: 9.99,
    carrier: 9.99
  },
  "youtube-premium": {
    direct: 15.99,
    apple: 18.99,
    "google-play": 13.99,
    amazon: 15.99,
    carrier: 15.99
  }
};

export default function Home() {
  const [email, setEmail] = useState("demo@savlivo.local");
  const [password, setPassword] = useState("password123");
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
  const [renewalsSheetOpen, setRenewalsSheetOpen] = useState(false);
  const [aiInput, setAiInput] = useState("");
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
          savedRegionalOverrides
        ] = await Promise.all([
            AsyncStorage.getItem("savlivo_theme"),
            AsyncStorage.getItem("savlivo_country_code"),
            AsyncStorage.getItem("savlivo_country_name"),
            AsyncStorage.getItem("savlivo_currency"),
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
        bg: "#0d0f12",
        surface: "#171a1f",
        surfaceSoft: "#20252b",
        text: "#f5f7fa",
        muted: "#a7b0bd",
        border: "#30363e",
        pill: "#252a30"
      }
    : {
        bg: "#f4f6f8",
        surface: "#ffffff",
        surfaceSoft: "#eef1f4",
        text: "#111827",
        muted: "#667085",
        border: "#d0d5dd",
        pill: "#e7eaee"
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
            pendingProviderResult.action === "CANCEL"
              ? pendingProviderResult.subscription.renewalDate ||
                new Date().toISOString().slice(0, 10)
              : new Date().toISOString().slice(0, 10);

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
      await setToken(result.token);
      setScreen("home");
      setAuthed(true);
      await refresh();

      if (preferencesHydrated) {
        setPricingSnapshot(null);
        await refreshRegionalPricing(selectedCountryCode, true);
      }
    } catch (err: any) {
      Alert.alert("Savlivo", err?.body?.error ?? err.message);
    } finally {
      setLoading(false);
    }
  }

  async function logout() {
    await AsyncStorage.removeItem("savlivo_token");
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
    const billing = String(
      subscription.billingProviderSlug ?? ""
    ).toLowerCase();
    const service = String(
      subscription.serviceSlug ?? ""
    ).toLowerCase();

    const europeanRegions = new Set([
      "AL","AD","AT","BY","BE","BA","BG","HR","CY","CZ","DK","EE",
      "FI","FR","DE","GR","HU","IS","IE","IT","LV","LI","LT","LU",
      "MT","MD","MC","ME","NL","MK","NO","PL","PT","RO","SM","RS",
      "SK","SI","ES","SE","CH","UA","GB","VA"
    ]);

    // Prime Video membership is managed in Prime Video itself,
    // even when the account identity is an Amazon account.
    if (service === "prime-video") {
      return europeanRegions.has(selectedCountryCode)
        ? "https://www.primevideo.com/region/eu/settings/your-account"
        : "https://www.primevideo.com/settings/your-account";
    }

    // The actual billing route wins for platform-billed subscriptions.
    if (billing === "apple") {
      return "https://apps.apple.com/account/subscriptions";
    }

    if (billing === "google-play" || billing === "google") {
      return "https://play.google.com/store/account/subscriptions";
    }

    if (billing === "amazon") {
      return "https://www.amazon.com/gp/video/settings/channels";
    }

    // Carrier / TV-provider accounts are provider-specific.
    // Do not send the user to a guessed generic page.
    if (
      billing === "carrier" ||
      billing === "tv-provider" ||
      billing === "carrier-tv"
    ) {
      return null;
    }

    if (service === "netflix") {
      return action === "CANCEL"
        ? "https://www.netflix.com/cancelplan"
        : "https://www.netflix.com/account";
    }

    if (service === "disney-plus") {
      return "https://www.disneyplus.com/account";
    }

    if (service === "max") {
      return "https://auth.max.com/account";
    }

    if (service === "apple-tv-plus") {
      return "https://apps.apple.com/account/subscriptions";
    }

    if (service === "youtube-premium") {
      return "https://www.youtube.com/paid_memberships";
    }

    return null;
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
          action === "CANCEL"
            ? subscription.renewalDate ||
              new Date().toISOString().slice(0, 10)
            : new Date().toISOString().slice(0, 10);

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
              action === "CANCEL"
                ? subscription.renewalDate ||
                  new Date().toISOString().slice(0, 10)
                : new Date().toISOString().slice(0, 10);

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
    activeRegionalPrices.length > 0 &&
    activeRegionalPrices.every((value) => value != null)
      ? activeRegionalPrices.reduce(
          (sum, value) => sum + (value ?? 0),
          0
        )
      : null;

  const potentialAdditionalSavingsMinor = items
    .filter(
      (item) => effectiveSubscriptionStatus(item) === "ACTIVE"
    )
    .reduce((sum, item) => {
      const monthly = billedMonthlyMinor(item);
      return sum + (monthly ?? 0) * 3;
    }, 0);

  function statusIsSavingNow(item: Subscription) {
    if (effectiveSubscriptionStatus(item) === "ACTIVE") return false;

    if (!item.statusEffectiveDate) return true;

    const effectiveAt = new Date(
      `${item.statusEffectiveDate}T00:00:00`
    ).getTime();

    if (!Number.isFinite(effectiveAt)) return true;

    return effectiveAt <= Date.now();
  }

  const currentMonthlySavingsRegionalMinor = items
    .filter(statusIsSavingNow)
    .reduce((sum, item) => {
      const monthly = billedMonthlyMinor(item);
      return sum + (monthly ?? 0);
    }, 0);

  const currentYearlySavingsRegionalMinor =
    currentMonthlySavingsRegionalMinor * 12;

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

  const potentialYearlySavingsRegionalMinor = items
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

  const savingsTabPotentialThreeMonthRegionalMinor = items
    .filter(
      (item) => effectiveSubscriptionStatus(item) === "ACTIVE"
    )
    .reduce((sum, item) => {
      const monthly = billedMonthlyMinor(item);
      return sum + (monthly ?? 0) * 3;
    }, 0);

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
        normalizeDateOnly(item.renewalDate) >= todayDateOnly
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
        normalizeDateOnly(item.renewalDate) >= todayDateOnly
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
      if (!item.renewalDate) missing.push("renewal date");
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
                backgroundColor: theme.surface,
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

          <TextInput
            style={[
              styles.input,
              {
                backgroundColor: theme.surface,
                borderColor: theme.border,
                color: theme.text
              }
            ]}
            placeholderTextColor={theme.muted}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            placeholder="Password"
          />

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
                backgroundColor: theme.surface,
                borderColor: theme.border
              }
            ]}
            onPress={() => loginOrRegister(true)}
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

  function askSavlivo() {
    const question = aiInput.trim();
    if (!question) return;

    const q = question.toLowerCase();
    setAiGuidedAction(null);

    let answer =
      "I can help with setup, prices, billing routes, renewal dates, savings and subscription decisions.";

    if (q.includes("spend") || q.includes("wrong") || q.includes("price")) {
      answer =
        "Check each subscription's selected plan, monthly price, billing route and status. Savlivo uses those fields for spend and savings. If one looks wrong, open Subscriptions and edit that service.";
    } else if (q.includes("connect") || q.includes("setup") || q.includes("set up")) {
      answer =
        "Open Subscriptions, add or edit each service, choose the correct billing route, select the local plan price and set a confirmed renewal date. Then check Settings for the correct country and currency.";
    } else if (
      q.includes("pause") ||
      q.includes("cancel") ||
      q.includes("reactivate") ||
      q.includes("renew")
    ) {
      const requestedAction: "PAUSE" | "CANCEL" | "REACTIVATE" =
        q.includes("cancel")
          ? "CANCEL"
          : q.includes("reactivate") || q.includes("renew")
            ? "REACTIVATE"
            : "PAUSE";

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
          const renewalCopy = target.renewalDate
            ? ` Its next confirmed renewal is ${formatRenewalDateDisplay(
                target.renewalDate
              )}.`
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
    } else if (q.includes("renew")) {
      answer = upcomingRenewals.length
        ? `Your next confirmed renewal is ${upcomingRenewals[0].serviceName} on ${formatRenewalDateDisplay(upcomingRenewals[0].renewalDate)}.`
        : "No confirmed renewal dates are set yet. Add them in Edit Subscription so Savlivo can time reminders and recommendations.";
    } else if (q.includes("save")) {
      answer = `Your current monthly savings are ${formatFinancialAggregate(currentMonthlySavingsRegionalMinor)}, with ${formatFinancialAggregate(potentialYearlySavingsRegionalMinor)} of potential yearly savings based on the current active setup.`;
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
      icon: keyof typeof Ionicons.glyphMap;
      activeIcon: keyof typeof Ionicons.glyphMap;
    }[] = [
      {
        key: "home",
        label: "Home",
        icon: "home-outline",
        activeIcon: "home"
      },
      {
        key: "subscriptions",
        label: "Subscriptions",
        icon: "card-outline",
        activeIcon: "card"
      },
      {
        key: "savings",
        label: "Savings",
        icon: "trending-up-outline",
        activeIcon: "trending-up"
      },
      ...(plan === "PREMIUM"
        ? [
            {
              key: "autopilot" as Screen,
              label: "Autopilot",
              icon: "sparkles-outline" as keyof typeof Ionicons.glyphMap,
              activeIcon: "sparkles" as keyof typeof Ionicons.glyphMap
            },
            {
              key: "ai" as Screen,
              label: "AI",
              icon: "chatbubble-ellipses-outline" as keyof typeof Ionicons.glyphMap,
              activeIcon: "chatbubble-ellipses" as keyof typeof Ionicons.glyphMap
            }
          ]
        : [])
    ];

    return (
      <View
        style={[
          styles.navRow,
          {
            backgroundColor: theme.surface,
            borderColor: theme.border
          }
        ]}
      >
        {itemsNav.map((nav) => {
          const active = screen === nav.key;

          return (
            <Pressable
              key={nav.key}
              accessibilityRole="button"
              accessibilityLabel={nav.label}
              style={styles.navItem}
              onPress={() => setScreen(nav.key)}
            >
              <View
                style={[
                  styles.navIconWrap,
                  active && {
                    backgroundColor: darkMode ? "#343B45" : "#EEF0F3"
                  }
                ]}
              >
                <Ionicons
                  name={active ? nav.activeIcon : nav.icon}
                  size={22}
                  color={active ? theme.text : theme.muted}
                />
              </View>

              <Text
                numberOfLines={1}
                style={[
                  styles.navText,
                  { color: active ? theme.text : theme.muted },
                  active && styles.navTextActive
                ]}
              >
                {nav.label}
              </Text>
            </Pressable>
          );
        })}

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Settings"
          style={styles.navItem}
          onPress={() => setScreen("settings")}
        >
          <View
            style={[
              styles.navIconWrap,
              screen === "settings" && {
                backgroundColor: darkMode ? "#343B45" : "#EEF0F3"
              }
            ]}
          >
            <Ionicons
              name={screen === "settings" ? "settings" : "settings-outline"}
              size={22}
              color={screen === "settings" ? theme.text : theme.muted}
            />
          </View>

          <Text
            numberOfLines={1}
            style={[
              styles.navText,
              { color: screen === "settings" ? theme.text : theme.muted },
              screen === "settings" && styles.navTextActive
            ]}
          >
            Settings
          </Text>
        </Pressable>
      </View>
    );
  }

  function priceForSelection(serviceSlug: string, billingProviderSlug: string) {
    return providerPricing[serviceSlug]?.[billingProviderSlug];
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

    setSubscriptionPlanInput(nextPlan);

    if (
      !preferred ||
      typeof preferred.monthlyPriceMinor !== "number"
    ) {
      setMonthlyPriceInput("");
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
    setBillingProviderInput("direct");
    setSubscriptionPlanInput("");
    setMonthlyPriceInput("");
    setRenewalDateInput("");
    setShowRenewalDatePicker(false);

    syncPlanAndPrice(
      service.slug,
      "direct"
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
      Alert.alert("Savlivo", "Enter a valid monthly price.");
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

    const statusColor = statusColors(displayedStatus);

    return (
      <View style={[styles.card, { backgroundColor: theme.surface }]}>
        <View style={styles.cardTop}>
          <View
            style={[
              styles.logoBubble,
              { backgroundColor: serviceBrandColors[item.serviceSlug] ?? "#111827" }
            ]}
          >
            <Text style={styles.logoText}>
              {serviceInitials[item.serviceSlug] ?? item.serviceName.slice(0, 1)}
            </Text>
          </View>

          <View style={styles.cardInfo}>
            <Text style={[styles.service, { color: theme.text }]}>
              {item.serviceName}
            </Text>
            <Text style={[styles.provider, { color: theme.muted }]}>
              Managed by {item.billingProviderSlug}
              {item.planName ? ` · ${item.planName}` : ""}
            </Text>
            <View style={[styles.statusPill, { backgroundColor: statusColor.bg }]}>
              <View
                style={[
                  styles.statusDot,
                  { backgroundColor: statusColor.text }
                ]}
              />
              <Text style={[styles.statusPillText, { color: statusColor.text }]}>
                {statusLabel(displayedStatus)}
              </Text>
            </View>
          </View>

          <View style={styles.priceBlock}>
            {(() => {
              // Prefer a verified price for the subscription's actual
              // billing route. If none exists, use the verified DIRECT
              // provider catalog price for display only.
              //
              // This must not change the user's stored billed price or
              // financial/savings calculations.
              const routeExactLocal = regionalDisplayPrice(
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

              const exactLocal =
                routeExactLocal ?? directExactLocal;

              const usesDirectCatalogFallback =
                !routeExactLocal &&
                !!directExactLocal &&
                item.billingProviderSlug !== "direct";

              const routeRange = regionalDisplayRange(
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

              const localRange =
                routeRange ?? directRange;

              const usesDirectRangeFallback =
                !routeRange &&
                !!directRange &&
                item.billingProviderSlug !== "direct";

              const billedPrice = item.monthlyPriceMinor
                ? formatStoredSubscriptionPrice(item)
                : null;

              return (
                <>
                  <Text style={[styles.price, { color: theme.text }]}>
                    {billedPrice ??
                      exactLocal ??
                      localRange ??
                      "Price unavailable"}
                  </Text>

                  <Text
                    style={[
                      styles.catalogPrice,
                      { color: theme.muted }
                    ]}
                  >
                    {exactLocal
                      ? usesDirectCatalogFallback
                        ? `Automatic direct price · ${exactLocal}`
                        : `Automatic verified price · ${exactLocal}`
                      : localRange
                        ? usesDirectRangeFallback
                          ? `Automatic direct range · ${localRange}`
                          : `Automatic verified range · ${localRange}`
                        : billedPrice
                          ? "Manual/saved price · No automatic price available"
                          : "No verified price available"}
                  </Text>
                </>
              );
            })()}

            <View>
              <Text
                style={[
                  styles.catalogPrice,
                  { color: theme.muted }
                ]}
              >
                Correct local price
              </Text>
            </View>
          </View>
        </View>

        {displayedStatus !== "ACTIVE" ? (
          <View style={{ marginTop: 10, marginBottom: 4 }}>
            <Text
              style={[
                styles.catalogPrice,
                { color: theme.muted }
              ]}
            >
              Saved so far
            </Text>

            <Text
              style={[
                styles.service,
                { color: theme.text }
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

        {scheduledStatusLabel ? (
          <Text
            style={[
              styles.catalogPrice,
              {
                color: theme.muted,
                marginTop: 8,
                marginBottom: 4
              }
            ]}
          >
            {scheduledStatusLabel}
          </Text>
        ) : null}

        <View style={styles.actions}>
          {displayedStatus === "ACTIVE" ? (
            <>
              <Pressable
                style={[styles.action, { backgroundColor: theme.surfaceSoft }]}
                onPress={() => openActionSheet(item, "PAUSE")}
              >
                <Text style={[styles.actionText, { color: theme.text }]}>
                  Pause
                </Text>
              </Pressable>

              <Pressable
                style={[styles.action, { backgroundColor: theme.surfaceSoft }]}
                onPress={() => openActionSheet(item, "CANCEL")}
              >
                <Text style={[styles.actionText, { color: theme.text }]}>
                  Cancel
                </Text>
              </Pressable>
            </>
          ) : null}

          {displayedStatus === "PAUSED" ? (
            <>
              <Pressable
                style={[styles.action, { backgroundColor: theme.surfaceSoft }]}
                onPress={() => openActionSheet(item, "REACTIVATE")}
              >
                <Text style={[styles.actionText, { color: theme.text }]}>
                  Reactivate
                </Text>
              </Pressable>

              <Pressable
                style={[styles.action, { backgroundColor: theme.surfaceSoft }]}
                onPress={() => openActionSheet(item, "CANCEL")}
              >
                <Text style={[styles.actionText, { color: theme.text }]}>
                  Cancel
                </Text>
              </Pressable>
            </>
          ) : null}

          {displayedStatus === "CANCELLED" ? (
            <Pressable
              style={[styles.action, { backgroundColor: theme.surfaceSoft }]}
              onPress={() => openActionSheet(item, "REACTIVATE")}
            >
              <Text style={[styles.actionText, { color: theme.text }]}>
                Reactivate
              </Text>
            </Pressable>
          ) : null}
        </View>

        <Pressable
          style={[
            styles.editServiceButton,
            { borderColor: theme.border }
          ]}
          onPress={() => openEditService(item)}
        >
          <Text style={[styles.editServiceText, { color: theme.muted }]}>
            Edit subscription
          </Text>
        </Pressable>
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

          <Pressable style={[styles.planOption, { backgroundColor: theme.surface, borderColor: theme.border }]} onPress={() => upgrade("manual")}>
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
                backgroundColor: darkMode ? "#242A31" : theme.surface,
                borderColor: darkMode ? "#4B5563" : "#111827"
              }
            ]}
            onPress={() => upgrade("premium")}
          >
            <Text
              style={[
                styles.planName,
                { color: darkMode ? "#F3F4F6" : theme.text }
              ]}
            >
              Premium
            </Text>
            <Text
              style={[
                styles.planPrice,
                { color: darkMode ? "#F3F4F6" : theme.text }
              ]}
            >
              {formatMoneyFromUsdMinor(3900, { maximumFractionDigits: 0 })}/year
            </Text>
            <Text
              style={[
                styles.planCopy,
                { color: darkMode ? "#C6CDD7" : theme.muted }
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
          <View style={styles.brandLockup}>
            <Image
              source={require("../assets/logo.png")}
              style={styles.headerLogo}
              resizeMode="cover"
            />

            <View style={styles.brandTextBlock}>
              <Text style={[styles.brand, { color: theme.text }]}>
                Savlivo
              </Text>

              <View style={styles.headerPlanRow}>
                <Text style={[styles.headerPlanText, { color: theme.muted }]}>
                  {plan}
                </Text>
                <Text style={[styles.headerBuildText, { color: theme.muted }]}>
                  · 1.6.0
                </Text>
              </View>
            </View>
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

      <ScrollView
        style={styles.mainScroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
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
                styles.compactSpendCard,
                {
                  backgroundColor: darkMode ? "#20242A" : "#FFFFFF",
                  borderColor: theme.border
                }
              ]}
              onPress={() => setScreen("subscriptions")}
            >
              <View style={styles.compactCardTopRow}>
                <Text style={[styles.compactMetricLabel, { color: theme.muted }]}>
                  Current monthly spend
                </Text>
                <Text style={[styles.compactChevron, { color: theme.muted }]}>›</Text>
              </View>

              <Text style={[styles.compactSpendValue, { color: theme.text }]}>
                {totalMonthlyRegionalMinor != null
                  ? formatRegionalAggregate(totalMonthlyRegionalMinor)
                  : formatFinancialAggregate(currentMonthlySpendRegionalMinor)}
              </Text>

              <Text style={[styles.compactMetricHint, { color: theme.muted }]}>
                {activeCount} active of {items.length} subscriptions
              </Text>
            </Pressable>

            <View style={styles.compactMetricGrid}>
              <Pressable
                style={[
                  styles.compactMetricCard,
                  {
                    backgroundColor: theme.surface,
                    borderColor: theme.border
                  }
                ]}
                onPress={() => setScreen("savings")}
              >
                <View style={styles.compactCardTopRow}>
                  <Text style={[styles.compactMetricLabel, { color: theme.muted }]}>
                    Savings / month
                  </Text>
                  <Text style={[styles.compactChevron, { color: theme.muted }]}>›</Text>
                </View>

                <Text style={[styles.compactMetricValue, { color: theme.text }]}>
                  {formatFinancialAggregate(currentMonthlySavingsRegionalMinor)}
                </Text>
              </Pressable>

              <Pressable
                style={[
                  styles.compactMetricCard,
                  {
                    backgroundColor: theme.surface,
                    borderColor: theme.border
                  }
                ]}
                onPress={() => setScreen("savings")}
              >
                <View style={styles.compactCardTopRow}>
                  <Text style={[styles.compactMetricLabel, { color: theme.muted }]}>
                    Savings / year
                  </Text>
                  <Text style={[styles.compactChevron, { color: theme.muted }]}>›</Text>
                </View>

                <Text style={[styles.compactMetricValue, { color: theme.text }]}>
                  {formatFinancialAggregate(currentYearlySavingsRegionalMinor)}
                </Text>
              </Pressable>

              <Pressable
                style={[
                  styles.compactMetricCard,
                  {
                    backgroundColor: theme.surface,
                    borderColor: theme.border
                  }
                ]}
                onPress={() => setRenewalsSheetOpen(true)}
              >
                <View style={styles.compactCardTopRow}>
                  <Text style={[styles.compactMetricLabel, { color: theme.muted }]}>
                    Next renewal
                  </Text>
                  <Text style={[styles.compactChevron, { color: theme.muted }]}>›</Text>
                </View>

                <Text
                  style={[styles.compactMetricValueSmall, { color: theme.text }]}
                  numberOfLines={2}
                >
                  {nextRenewalDisplay}
                </Text>
              </Pressable>

              <Pressable
                style={[
                  styles.compactMetricCard,
                  {
                    backgroundColor: theme.surface,
                    borderColor: theme.border
                  }
                ]}
                onPress={() => setScreen("savings")}
              >
                <View style={styles.compactCardTopRow}>
                  <Text style={[styles.compactMetricLabel, { color: theme.muted }]}>
                    Annual spend
                  </Text>
                  <Text style={[styles.compactChevron, { color: theme.muted }]}>›</Text>
                </View>

                <Text style={[styles.compactMetricValue, { color: theme.text }]}>
                  {formatFinancialAggregate(currentAnnualSpendRegionalMinor)}
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
                    {
                      backgroundColor: theme.surface,
                      borderColor: theme.border
                    }
                  ]}
                  onPress={() => setScreen("autopilot")}
                >
                  <View style={styles.compactActionIcon}>
                    <Ionicons name="sparkles-outline" size={20} color={theme.text} />
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

                  <Text style={[styles.compactChevronLarge, { color: theme.muted }]}>
                    ›
                  </Text>
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
                  borderColor: theme.border
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
                  backgroundColor: theme.surface,
                  borderColor: theme.border
                }
              ]}
              onPress={openAddService}
            >
              <Text style={[styles.addServiceText, { color: theme.text }]}>
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
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: theme.text }]}>
                Savings
              </Text>
            </View>

            <View
              style={[
                styles.savingsHero,
                {
                  backgroundColor: darkMode ? "#20242A" : "#FFFFFF",
                  borderColor: darkMode ? "#30363E" : theme.border
                }
              ]}
            >
              <Text
                style={[
                  styles.savingsHeroLabel,
                  { color: darkMode ? "#D5DBE3" : theme.muted }
                ]}
              >
                Saved so far
              </Text>
              <Text
                style={[
                  styles.savingsHeroValue,
                  { color: darkMode ? "#FFFFFF" : theme.text }
                ]}
              >
                {formatFinancialAggregate(savedSoFarRegionalMinor)}
              </Text>
              <Text
                style={[
                  styles.savingsHeroNote,
                  { color: darkMode ? "#C4CBD4" : theme.muted }
                ]}
              >
                accumulated savings while subscriptions were paused or cancelled
              </Text>
            </View>

            <View style={[styles.metricCard, { backgroundColor: theme.surface }]}>
              <Text style={[styles.metricLabel, { color: theme.muted }]}>
                Saving now / month
              </Text>
              <Text style={[styles.metricValue, { color: theme.text }]}>
                {formatFinancialAggregate(currentMonthlySavingsRegionalMinor)}
              </Text>
            </View>

            <View style={[styles.metricCard, { backgroundColor: theme.surface }]}>
              <Text style={[styles.metricLabel, { color: theme.muted }]}>
                Saving now / year
              </Text>
              <Text style={[styles.metricValue, { color: theme.text }]}>
                {formatFinancialAggregate(currentYearlySavingsRegionalMinor)}
              </Text>
            </View>

            <View style={[styles.metricCard, { backgroundColor: theme.surface }]}>
              <Text style={[styles.metricLabel, { color: theme.muted }]}>
                Current monthly spend
              </Text>
              <Text style={[styles.metricValue, { color: theme.text }]}>
                {formatFinancialAggregate(currentMonthlySpendRegionalMinor)}
              </Text>
            </View>

            <View style={[styles.metricCard, { backgroundColor: theme.surface }]}>
              <Text style={[styles.metricLabel, { color: theme.muted }]}>
                Current annual spend
              </Text>
              <Text style={[styles.metricValue, { color: theme.text }]}>
                {formatFinancialAggregate(currentAnnualSpendRegionalMinor)}
              </Text>
            </View>

            <View
              style={[
                styles.metricCardAccent,
                {
                  backgroundColor: darkMode ? "#293140" : "#EEF3FA"
                }
              ]}
            >
              <Text style={[styles.metricLabel, { color: theme.muted }]}>
                Reviewable spend / 3 months
              </Text>
              <Text style={[styles.metricValue, { color: theme.text }]}>
                {formatFinancialAggregate(savingsTabPotentialThreeMonthRegionalMinor)}
              </Text>
              <Text style={[styles.muted, { color: theme.muted }]}>
                Total spend across your active subscriptions over 3 months.
              </Text>
            </View>

            <View style={[styles.recommendationsCard, { backgroundColor: theme.surface }]}>
              <Text style={[styles.recommendationsTitle, { color: theme.text }]}>
                Subscriptions to review
              </Text>

              {recommendationCandidates.length === 0 ? (
                <Text style={[styles.muted, { color: theme.muted }]}>
                  You have no active services to optimize right now.
                </Text>
              ) : (
                recommendationCandidates.map((item) => (
                  <View
                    key={`rec-${item.id}`}
                    style={[
                      styles.recommendationRow,
                      { borderColor: theme.border }
                    ]}
                  >
                    <View style={styles.recommendationInfo}>
                      <Text style={[styles.recommendationName, { color: theme.text }]}>
                        Review {item.serviceName}
                      </Text>
                      <Text style={[styles.muted, { color: theme.muted }]}>
                        3-month spend:{" "}
                        {formatFinancialAggregate(
                          (billedMonthlyMinor(item) ?? 0) * 3
                        )}
                      </Text>
                    </View>
                    <Pressable
                      style={[
                        styles.recommendationButton,
                        { backgroundColor: theme.surfaceSoft }
                      ]}
                      onPress={() => openActionSheet(item, "PAUSE")}
                    >
                      <Text style={[styles.actionText, { color: theme.text }]}>
                        Review
                      </Text>
                    </Pressable>
                  </View>
                ))
              )}
            </View>
          </>
        ) : null}

        {screen === "autopilot" ? (
          <>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: theme.text }]}>
                Autopilot
              </Text>
            </View>

            <View
              style={[
                styles.autopilotCard,
                {
                  backgroundColor: theme.surface,
                  borderColor: theme.border
                }
              ]}
            >
              <Text style={[styles.autopilotEyebrow, { color: theme.muted }]}>
                PREMIUM DECISION ENGINE
              </Text>
              <Text style={[styles.autopilotTitle, { color: theme.text }]}>
                Your monthly action plan
              </Text>
              <Text style={[styles.autopilotIntro, { color: theme.muted }]}>
                Savlivo uses your active prices, statuses and renewal dates to prioritize subscriptions worth reviewing.
              </Text>

              <View style={styles.autopilotSteps}>
                {premiumKeep.length ? (
                  <View
                    style={[
                      styles.autopilotStep,
                      { backgroundColor: theme.surfaceSoft, borderColor: theme.border }
                    ]}
                  >
                    <View style={styles.autopilotActionPill}>
                      <Text style={styles.autopilotActionText}>KEEP</Text>
                    </View>
                    <Text style={[styles.autopilotStepTitle, { color: theme.text, flex: 1 }]}>
                      {premiumKeep.map(({ item }) => item.serviceName).join(" + ")}
                    </Text>
                  </View>
                ) : null}

                {premiumPause ? (
                  <View
                    style={[
                      styles.autopilotStep,
                      { backgroundColor: theme.surfaceSoft, borderColor: theme.border }
                    ]}
                  >
                    <View style={styles.autopilotActionPill}>
                      <Text style={styles.autopilotActionText}>REVIEW</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.autopilotStepTitle, { color: theme.text }]}>
                        {premiumPause.item.serviceName}
                      </Text>
                      <Text style={[styles.autopilotStepCopy, { color: theme.muted }]}>
                        3-month spend: {formatFinancialAggregate(premiumPause.monthly * 3)}
                      </Text>
                    </View>
                  </View>
                ) : null}
              </View>
            </View>
          </>
        ) : null}

        {screen === "ai" ? (
          <KeyboardAvoidingView
            style={[
              styles.aiKeyboardAvoider,
              {
                paddingBottom:
                  Platform.OS === "ios"
                    ? Math.max(0, aiKeyboardHeight - 18)
                    : 0
              }
            ]}
            behavior={Platform.OS === "ios" ? "position" : "height"}
            keyboardVerticalOffset={0}
          >
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: theme.text }]}>
                Savlivo AI
              </Text>
            </View>

            <View
              style={[
                styles.aiChatCard,
                {
                  backgroundColor: theme.surface,
                  borderColor: theme.border
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
                            ? darkMode
                              ? "#303842"
                              : "#E5EBF2"
                            : theme.surfaceSoft,
                        borderColor: theme.border
                      }
                    ]}
                  >
                    <Text style={[styles.aiMessageText, { color: theme.text }]}>
                      {message.text}
                    </Text>
                  </View>
                ))}
              </ScrollView>

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

              <View style={styles.aiComposer}>
                <TextInput
                  ref={aiInputRef}
                  style={[
                    styles.aiComposerInput,
                    {
                      backgroundColor: theme.surfaceSoft,
                      borderColor: theme.border,
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
                  style={styles.aiSendButton}
                  onPress={askSavlivo}
                >
                  <Text style={styles.aiAssistantButtonText}>Send</Text>
                </Pressable>
              </View>
            </View>
          </KeyboardAvoidingView>
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
                rows: [
                  ["Email", email, ""],
                  ["Savlivo plan", plan, "Manage"]
                ]
              },
              {
                title: "Preferences",
                rows: [
                  ["Appearance", darkMode ? "Dark" : "Light", "Change"],
                  [
                    "Currency & region",
                    `${selectedCurrency} · ${selectedCountryName}${
                      pricingSnapshot?.updatedAt
                        ? ` · checked ${new Date(
                            pricingSnapshot.updatedAt
                          ).toLocaleDateString()} · ${pricingSnapshot.source}`
                        : verifiedRegionalFallback[selectedCountryCode]
                          ? " · verified fallback"
                          : " · awaiting verified feed"
                    }`,
                    "Change"
                  ]
                ]
              },
              {
                title: "Notifications",
                rows: [
                  ["Renewal reminders", "Alert before a subscription renews", "On"],
                  ["Savings opportunities", "Surface potential savings", "On"]
                ]
              },
              {
                title: "Premium & Autopilot",
                rows: [
                  ["Ask before changes", "Require approval before automated actions", "On"],
                  ["Never pause", "Choose protected services later", "Configure"]
                ]
              },
              {
                title: "Privacy & data",
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
                  {
                    backgroundColor: theme.surface,
                    borderColor: theme.border
                  }
                ]}
              >
                <Text style={[styles.settingsGroupTitle, { color: theme.text }]}>
                  {group.title}
                </Text>

                {group.rows.map(([title, value, action]) => (
                  <View
                    key={title}
                    style={[styles.settingsRow, { borderColor: theme.border }]}
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
                          {
                            backgroundColor:
                              title === "Delete account"
                                ? darkMode
                                  ? "#3A1F21"
                                  : "#FDECEC"
                                : action === "On"
                                  ? darkMode
                                    ? "#173226"
                                    : "#E8F5EE"
                                  : theme.surfaceSoft
                          }
                        ]}
                        onPress={() => {
                          if (title === "Savlivo plan") setScreen("plans");
                          if (title === "Appearance") {
                            setDarkMode((value) => !value);
                          }
                          if (title === "Currency & region") {
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
                                    ? darkMode
                                      ? "#8DDEAE"
                                      : "#1E6B45"
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
                  backgroundColor: darkMode ? "#242A31" : theme.surface,
                  borderColor: theme.border
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

      {successMessage ? (
        <View pointerEvents="none" style={styles.successFloatingWrap}>
          <View
            style={[
              styles.successBanner,
              {
                backgroundColor: darkMode ? "#173226" : "#E8F5EE",
                borderColor: darkMode ? "#29543E" : "#CBE7D6"
              }
            ]}
          >
            <Text
              style={[
                styles.successBannerText,
                { color: darkMode ? "#E9F7EF" : "#1E6B45" }
              ]}
            >
              ✓ {successMessage}
            </Text>
          </View>
        </View>
      ) : null}

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
                  backgroundColor: theme.surface,
                  borderColor: theme.border
                }
              ]}
            >
            <View style={styles.regionHeader}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.actionSheetTitle, { color: theme.text }]}>
                  Currency & region
                </Text>
                <Text style={[styles.formHint, { color: theme.muted }]}>
                  Choose your country. Savlivo defaults to the local currency automatically.
                </Text>
              </View>
              <Pressable
                style={[
                  styles.regionClose,
                  { backgroundColor: theme.surfaceSoft }
                ]}
                onPress={() => setRegionModalOpen(false)}
              >
                <Text style={[styles.actionText, { color: theme.text }]}>Done</Text>
              </Pressable>
            </View>

            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: theme.surfaceSoft,
                  borderColor: theme.border,
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
              style={styles.countryList}
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

            <Text style={[styles.fieldLabel, { color: theme.muted }]}>
              Currency override
            </Text>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.currencyRow}
            >
              {allCurrencies.map((currency) => {
                const selected = currency === selectedCurrency;

                return (
                  <Pressable
                    key={currency}
                    style={[
                      styles.currencyChip,
                      {
                        backgroundColor: selected
                          ? darkMode
                            ? "#3B4654"
                            : "#DDE7F2"
                          : theme.surfaceSoft,
                        borderColor: selected
                          ? darkMode
                            ? "#8FB7E5"
                            : "#667D96"
                          : theme.border,
                        borderWidth: selected ? 2 : 1
                      }
                    ]}
                    onPress={() => setSelectedCurrency(currency)}
                  >
                    <Text style={[styles.choiceChipText, { color: theme.text }]}>
                      {currency}
                    </Text>
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
        animationType="fade"
        onRequestClose={() => setServicePickerOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <View
            style={[
              styles.actionSheet,
              {
                backgroundColor: theme.surface,
                borderColor: theme.border
              }
            ]}
          >
            <Text style={[styles.actionSheetTitle, { color: theme.text }]}>
              Choose service
            </Text>

            <Text style={[styles.actionSheetBody, { color: theme.muted }]}>
              Select the subscription service you want to add.
            </Text>

            <View style={{ gap: 10 }}>
              {serviceCatalog
                .filter(
                  (service) =>
                    !items.some(
                      (item) =>
                        item.serviceSlug === service.slug
                    )
                )
                .map((service) => (
                <Pressable
                  key={service.slug}
                  style={[
                    styles.choiceChip,
                    {
                      width: "100%",
                      minHeight: 58,
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "flex-start",
                      backgroundColor: theme.surfaceSoft,
                      borderColor: theme.border,
                      paddingHorizontal: 14
                    }
                  ]}
                  onPress={() =>
                    beginAddService(service.slug)
                  }
                >
                  <View
                    style={{
                      width: 38,
                      height: 38,
                      borderRadius: 10,
                      alignItems: "center",
                      justifyContent: "center",
                      marginRight: 12,
                      backgroundColor:
                        serviceBrandColors[service.slug] ??
                        theme.surface
                    }}
                  >
                    <Text
                      style={{
                        color: "#FFFFFF",
                        fontSize: 16,
                        fontWeight: "800"
                      }}
                    >
                      {serviceInitials[service.slug] ??
                        service.name.slice(0, 1)}
                    </Text>
                  </View>

                  <Text
                    style={[
                      styles.choiceChipText,
                      {
                        color: theme.text,
                        fontSize: 16,
                        flex: 1
                      }
                    ]}
                  >
                    {service.name}
                  </Text>

                  <Ionicons
                    name="chevron-forward"
                    size={20}
                    color={theme.muted}
                  />
                </Pressable>
              ))}
            </View>

            <Pressable
              style={[
                styles.sheetButton,
                {
                  borderColor: theme.border,
                  marginTop: 16
                }
              ]}
              onPress={() => setServicePickerOpen(false)}
            >
              <Text style={[styles.sheetButtonText, { color: theme.text }]}>
                Cancel
              </Text>
            </Pressable>
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
            style={{ flex: 1, width: "100%" }}
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            keyboardVerticalOffset={0}
          >
            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={[
                styles.serviceFormSheet,
                {
                  backgroundColor: theme.surface,
                  borderColor: theme.border,
                  paddingBottom: 40
                }
              ]}
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
                : serviceCatalog
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
                    setServiceSlugInput(service.slug);
                    syncPlanAndPrice(
                      service.slug,
                      billingProviderInput
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
              {billingProviders.map((provider) => (
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
                              planOption.verification === "multi-source"
                                ? darkMode
                                  ? "#A7D7B8"
                                  : "#357A4F"
                                : theme.muted
                          }
                        ]}
                      >
                        {planOption.verification === "registry" ||
                        planOption.verification === "multi-source"
                          ? "✓ Verified"
                          : "Official source"}
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
            </ScrollView>
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
                backgroundColor: theme.surface,
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
                  backgroundColor: theme.surfaceSoft,
                  borderColor: theme.border,
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
              <Pressable
                style={[styles.statusChoiceButton, { borderColor: theme.border }]}
                onPress={() => confirmProviderStatus("PAUSED")}
              >
                <Text style={[styles.sheetButtonText, { color: theme.text }]}>
                  Paused
                </Text>
              </Pressable>

              <Pressable
                style={[styles.statusChoiceButton, { borderColor: theme.border }]}
                onPress={() => confirmProviderStatus("CANCELLED")}
              >
                <Text style={[styles.sheetButtonText, { color: theme.text }]}>
                  Cancelled
                </Text>
              </Pressable>

              <Pressable
                style={[styles.statusChoiceButton, { borderColor: theme.border }]}
                onPress={() => confirmProviderStatus("ACTIVE")}
              >
                <Text style={[styles.sheetButtonText, { color: theme.text }]}>
                  Renewed / active
                </Text>
              </Pressable>

              <Pressable
                style={[styles.statusChoiceButton, { borderColor: theme.border }]}
                onPress={() => confirmProviderStatus("UNCHANGED")}
              >
                <Text style={[styles.sheetButtonText, { color: theme.muted }]}>
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
                backgroundColor: theme.surface,
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
                backgroundColor: theme.surface,
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
    paddingTop: 18,
    paddingBottom: 36,
    gap: 14
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

  stickyHeader: {
    marginHorizontal: -16,
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    zIndex: 50,
    elevation: 8
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

  mainScroll: {
    flex: 1
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
    fontSize: 34,
    fontWeight: "900",
    letterSpacing: -1,
    marginTop: 5
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
    minHeight: 100,
    borderRadius: 17,
    borderWidth: 1,
    padding: 13,
    justifyContent: "space-between"
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
    minHeight: 80,
    borderRadius: 18,
    borderWidth: 1,
    padding: 14,
    flexDirection: "row",
    alignItems: "center"
  },

  compactActionIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 11
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
    borderColor: "#d0d5dd",
    backgroundColor: "#fff",
    borderRadius: 14,
    paddingHorizontal: 14
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
    borderColor: "#d0d5dd",
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
    backgroundColor: "#eef8f1",
    borderWidth: 1,
    borderColor: "#d7eadc",
    borderRadius: 18,
    padding: 16,
    gap: 12
  },

  planStatusViewer: {
    backgroundColor: "#fff",
    borderColor: "#e1e5ea"
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
    borderColor: "#d0d5dd",
    borderRadius: 12,
    paddingHorizontal: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff"
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
    minHeight: 0,
    justifyContent: "flex-end"
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
    minHeight: 260,
    maxHeight: 560,
    borderWidth: 1,
    borderRadius: 22,
    padding: 12,
    marginBottom: 4
  },

  aiChatLog: {
    flex: 1,
    minHeight: 120
  },

  aiChatLogContent: {
    flexGrow: 1,
    justifyContent: "flex-end",
    gap: 9,
    paddingTop: 8,
    paddingBottom: 10
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
    paddingBottom: Platform.OS === "ios" ? 8 : 0
  },

  aiComposerInput: {
    flex: 1,
    minHeight: 46,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    fontSize: 13
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
    backgroundColor: "#eef8f1",
    borderRadius: 18,
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
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 4
  },

  settingsGroupTitle: {
    fontSize: 17,
    fontWeight: "900",
    marginBottom: 8
  },

  settingsRow: {
    minHeight: 62,
    borderTopWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12
  },

  settingsRowInfo: {
    flex: 1,
    minWidth: 0
  },

  settingsRowTitle: {
    fontSize: 14,
    fontWeight: "800"
  },

  settingsRowValue: {
    fontSize: 12,
    lineHeight: 18,
    marginTop: 2
  },

  settingsAction: {
    minHeight: 38,
    borderRadius: 999,
    paddingHorizontal: 11,
    alignItems: "center",
    justifyContent: "center"
  },

  settingsActionText: {
    fontSize: 12,
    fontWeight: "800"
  },

  settingsLogout: {
    width: "100%",
    minHeight: 48,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center"
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
    backgroundColor: "#fff",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#d0d5dd",
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
    padding: 20,
    gap: 10,
    maxHeight: "92%"
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
