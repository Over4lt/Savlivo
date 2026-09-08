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
  ZA:"ZAR"
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
  ["NZ", "New Zealand", "NZD"]
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
    return new Intl.NumberFormat(locale, { style: "currency", currency }).format(minor / 100);
  } catch {
    return `${currency} ${(minor / 100).toFixed(2)}`;
  }
}


// Only independently verified launch services are offered in newly activated markets.
// Existing market availability rules are left unchanged.
export const expansionMarketServices: Record<string, readonly string[]> = {
  GB: ["icloud-plus", "apple-music", "apple-tv-plus", "google-one", "spotify"],
  AU: ["icloud-plus", "apple-music", "apple-tv-plus", "google-one"],
  NZ: ["icloud-plus", "apple-music", "apple-tv-plus", "google-one"]
};

export function expansionServiceAvailable(serviceSlug: string, countryCode: string): boolean | undefined {
  return expansionMarketServices[countryCode]?.includes(serviceSlug);
}
