export const countryCurrencies: Record<string, string> = {
  US:"USD",CA:"CAD",MX:"MXN",BR:"BRL",AR:"ARS",
  GB:"GBP",NO:"NOK",SE:"SEK",DK:"DKK",IS:"ISK",CH:"CHF",
  PL:"PLN",CZ:"CZK",HU:"HUF",RO:"RON",
  DE:"EUR",FR:"EUR",ES:"EUR",IT:"EUR",PT:"EUR",NL:"EUR",
  BE:"EUR",AT:"EUR",IE:"EUR",FI:"EUR",GR:"EUR",SK:"EUR",
  SI:"EUR",EE:"EUR",LV:"EUR",LT:"EUR",LU:"EUR",CY:"EUR",
  MT:"EUR",HR:"EUR",BG:"EUR",
  AU:"AUD",NZ:"NZD",JP:"JPY",KR:"KRW",CN:"CNY",HK:"HKD",
  TW:"TWD",SG:"SGD",IN:"INR",ID:"IDR",MY:"MYR",TH:"THB",
  PH:"PHP",VN:"VND",AE:"AED",SA:"SAR",IL:"ILS",TR:"TRY",
  UA:"UAH",RS:"RSD",BA:"BAM",AL:"ALL",MK:"MKD",MD:"MDL",
  ZA:"ZAR",QA:"QAR",EG:"EGP",CL:"CLP",CO:"COP",KW:"KWD"
};

export const countryCurrencyData = [
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
  ["CN", "China", "CNY"],
  ["GB", "United Kingdom", "GBP"],
  ["AU", "Australia", "AUD"],
  ["NZ", "New Zealand", "NZD"],
  ["CH", "Switzerland", "CHF"],
  ["PL", "Poland", "PLN"],
  ["BR", "Brazil", "BRL"],
  ["CZ", "Czechia", "CZK"],
  ["MY", "Malaysia", "MYR"],
  ["IN", "India", "INR"],
  ["SG", "Singapore", "SGD"],
  ["HK", "Hong Kong", "HKD"],
  ["TW", "Taiwan", "TWD"],
  ["AE", "United Arab Emirates", "AED"],
  ["TH", "Thailand", "THB"],
  ["PH", "Philippines", "PHP"],
  ["JP", "Japan", "JPY"],
  ["CA", "Canada", "CAD"],
  ["SA", "Saudi Arabia", "SAR"],
  ["KR", "South Korea", "KRW"],
  ["MX", "Mexico", "MXN"],
  ["ID", "Indonesia", "IDR"],
  ["TR", "Türkiye", "TRY"],
  ["ZA", "South Africa", "ZAR"],
  ["IL", "Israel", "ILS"],
  ["QA", "Qatar", "QAR"],
  ["EG", "Egypt", "EGP"],
  ["VN", "Vietnam", "VND"],
  ["RO", "Romania", "RON"],
  ["GR", "Greece", "EUR"],
  ["CL", "Chile", "CLP"],
  ["CO", "Colombia", "COP"]
] as const;


// Historical inference only. Shared currencies (especially EUR) never imply a country.
const legacyCountryByCurrency: Record<string, string> = {
  USD: "US", NOK: "NO", SEK: "SE", DKK: "DK", CNY: "CN"
};

export function subscriptionBelongsToMarket(
  item: { countryCode?: string | null; currency?: string | null }, countryCode: string
) {
  return item.countryCode === countryCode ||
    (!item.countryCode && legacyCountryByCurrency[item.currency ?? ""] === countryCode);
}

export function subscriptionsForMarket<T extends { countryCode?: string | null; currency?: string | null }>(
  items: T[], countryCode: string
): T[] {
  return items.filter(item => subscriptionBelongsToMarket(item, countryCode));
}

export function subscriptionCountry(countryCode: string, currency?: string) {
  const code = countryCode.trim().toUpperCase();
  return /^[A-Z]{2}$/.test(code) ? code : legacyCountryByCurrency[currency ?? ""];
}

export function isCurrentMarketPricing(
  snapshot: { countryCode?: string; currency?: string } | null | undefined,
  requestedCountry: string, selectedCountry: string
) {
  return requestedCountry === selectedCountry &&
    snapshot?.countryCode === selectedCountry &&
    Boolean(countryCurrencies[selectedCountry]) &&
    snapshot?.currency === countryCurrencies[selectedCountry];
}

export function formatMarketMinor(minor: number, currency: string, locale?: string) {
  try {
    // Savlivo stores hundredths for every currency, not ISO currency minor units.
    // Keep whole-unit display where appropriate, but never round away stored cents.
    const formatter = new Intl.NumberFormat(locale, { style: "currency", currency });
    const digits = formatter.resolvedOptions().maximumFractionDigits ?? 2;
    return (digits < 2
      ? new Intl.NumberFormat(locale, { style: "currency", currency, maximumFractionDigits: 2 })
      : formatter).format(minor / 100);
  } catch {
    return `${currency} ${(minor / 100).toFixed(2)}`;
  }
}


// Only independently verified launch services are offered in newly activated markets.
// Existing market availability rules are left unchanged.
export const expansionMarketServices: Record<string, readonly string[]> = {
  // September 2026: explicit availability; unknown prices remain manual.
  JP: ["netflix", "spotify", "apple-music", "google-one", "youtube-premium", "chatgpt", "apple-tv-plus", "disney-plus"],
  CA: ["netflix", "spotify", "apple-music", "google-one", "youtube-premium", "chatgpt", "apple-tv-plus", "amazon-prime", "playstation-plus", "xbox-game-pass", "disney-plus"],
  SA: ["netflix", "spotify", "apple-music", "google-one", "youtube-premium", "chatgpt", "apple-tv-plus"],
  KR: ["netflix", "spotify", "apple-music", "google-one", "youtube-premium", "chatgpt", "apple-tv-plus", "disney-plus"],
  MX: ["netflix", "spotify", "apple-music", "google-one", "youtube-premium", "chatgpt", "apple-tv-plus", "max", "disney-plus"],
  ID: ["netflix", "spotify", "apple-music", "google-one", "youtube-premium", "chatgpt", "apple-tv-plus", "max"],
  TR: ["netflix", "spotify", "apple-music", "google-one", "youtube-premium", "chatgpt", "max"],
  ZA: ["netflix", "spotify", "apple-music", "google-one", "youtube-premium", "chatgpt", "apple-tv-plus"],
  IL: ["netflix", "spotify", "apple-music", "google-one", "youtube-premium", "chatgpt", "apple-tv-plus"],
  QA: ["netflix", "spotify", "apple-music", "google-one", "youtube-premium", "chatgpt", "apple-tv-plus"],
  EG: ["netflix", "spotify", "apple-music", "google-one", "youtube-premium", "chatgpt", "apple-tv-plus"],
  VN: ["netflix", "spotify", "apple-music", "google-one", "youtube-premium", "chatgpt", "apple-tv-plus", "max"],
  RO: ["netflix", "spotify", "apple-music", "google-one", "youtube-premium", "chatgpt", "max", "disney-plus"],
  GR: ["netflix", "spotify", "apple-music", "google-one", "youtube-premium", "chatgpt", "apple-tv-plus", "disney-plus", "max"],
  CL: ["netflix", "spotify", "apple-music", "google-one", "youtube-premium", "chatgpt", "apple-tv-plus", "max"],
  CO: ["netflix", "spotify", "apple-music", "google-one", "youtube-premium", "chatgpt", "apple-tv-plus", "max"],
  IN: ["icloud-plus", "apple-music", "apple-tv-plus", "google-one"],
  SG: ["icloud-plus", "apple-music", "apple-tv-plus", "google-one"],
  HK: ["icloud-plus", "apple-music", "apple-tv-plus", "google-one"],
  TW: ["icloud-plus", "apple-music", "apple-tv-plus", "google-one"],
  AE: ["icloud-plus", "apple-music", "apple-tv-plus", "google-one"],
  TH: ["icloud-plus", "apple-music", "apple-tv-plus", "google-one"],
  PH: ["icloud-plus", "apple-music", "apple-tv-plus", "google-one"],
  MY: ["icloud-plus", "apple-music", "apple-tv-plus", "spotify"],
  CH: ["icloud-plus", "apple-music", "apple-tv-plus", "spotify"],
  PL: ["icloud-plus", "apple-music", "apple-tv-plus", "spotify"],
  BR: ["icloud-plus", "apple-music", "apple-tv-plus", "spotify"],
  CZ: ["icloud-plus", "apple-music", "apple-tv-plus", "spotify"],
  GB: ["icloud-plus", "apple-music", "apple-tv-plus", "google-one", "spotify"],
  AU: ["icloud-plus", "apple-music", "apple-tv-plus", "google-one"],
  NZ: ["icloud-plus", "apple-music", "apple-tv-plus", "google-one"]
};

export function expansionServiceAvailable(serviceSlug: string, countryCode: string): boolean | undefined {
  return expansionMarketServices[countryCode]?.includes(serviceSlug);
}
