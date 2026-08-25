import {
  fetchProviderLocalPrices,
  verifiedProviderRegistry,
  type AdapterPrice
} from "./pricing-adapters.js";
import {
  loadPersistedVerifiedPrices,
  persistVerifiedLivePrices
} from "./pricing-store.js";

export type PricingSnapshot = {
  countryCode: string;
  currency: string;
  updatedAt: string;
  source: string;
  items: AdapterPrice[];
};

const REFRESH_MS = 24 * 60 * 60 * 1000;
const memoryCache = new Map<
  string,
  { fetchedAt: number; snapshot: PricingSnapshot }
>();

const countryCurrencies: Record<string, string> = {
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

function dedupe(items: AdapterPrice[]) {
  const map = new Map<string, AdapterPrice>();
  for (const item of items) {
    const key = [
      item.serviceSlug,
      item.planSlug,
      item.billingProviderSlug,
      item.countryCode,
      item.currency
    ].join("|");
    map.set(key, item);
  }
  return [...map.values()];
}

export function mergeFreshAndPersistedPricing(
  freshItems: AdapterPrice[],
  persistedItems: AdapterPrice[]
) {
  const keyFor = (item: AdapterPrice) =>
    [
      item.serviceSlug,
      item.planSlug,
      item.billingProviderSlug,
      item.countryCode,
      item.currency
    ].join("|");

  const merged = new Map<string, AdapterPrice>();

  for (const item of freshItems) {
    merged.set(
      keyFor(item),
      item
    );
  }

  for (const persisted of persistedItems) {
    const key = keyFor(persisted);
    const fresh = merged.get(key);

    const freshIsStrong =
      fresh?.verification === "multi-source" &&
      fresh?.verifiedByAgreement === true &&
      (fresh?.sourceCount ?? 0) >= 2;

    if (!freshIsStrong) {
      merged.set(
        key,
        persisted
      );
    }
  }

  return [...merged.values()];
}

export async function getRegionalPricing(
  countryCode: string,
  options?: { forceRefresh?: boolean }
): Promise<PricingSnapshot> {
  const code = String(countryCode || "US").toUpperCase();
  const currency = countryCurrencies[code] ?? "";
  const cached = memoryCache.get(code);

  if (
    !options?.forceRefresh &&
    cached &&
    Date.now() - cached.fetchedAt < REFRESH_MS
  ) {
    return cached.snapshot;
  }

  if (!currency) {
    const empty: PricingSnapshot = {
      countryCode: code,
      currency: "",
      updatedAt: new Date().toISOString(),
      source: "unsupported-currency-map",
      items: []
    };
    memoryCache.set(code, { fetchedAt: Date.now(), snapshot: empty });
    return empty;
  }

  const freshItems = dedupe(
    await fetchProviderLocalPrices(code, currency)
  );

  let persistedItems: AdapterPrice[] = [];

  try {
    persistedItems =
      await loadPersistedVerifiedPrices(
        code,
        currency
      );
  } catch (err) {
    console.error(
      "persisted pricing read failed",
      err
    );
  }

  const items = mergeFreshAndPersistedPricing(
    freshItems,
    persistedItems
  );

  try {
    await persistVerifiedLivePrices(
      freshItems
    );
  } catch (err) {
    console.error(
      "verified pricing persistence failed",
      err
    );
  }

  if (!items.length && cached?.snapshot.items.length) {
    return cached.snapshot;
  }

  const snapshot: PricingSnapshot = {
    countryCode: code,
    currency,
    updatedAt:
      items
        .map((item) => item.updatedAt)
        .sort()
        .at(-1) ?? new Date().toISOString(),
    source:
      items.length
        ? [...new Set(items.map((item) => item.source))].join(",")
        : "no-exact-provider-price-found",
    items
  };

  memoryCache.set(code, {
    fetchedAt: Date.now(),
    snapshot
  });

  return snapshot;
}

export function getPricingRefreshIntervalMs() {
  return REFRESH_MS;
}

export async function runPricingRefreshBatch(
  countries: string[],
  refreshCountry: (
    countryCode: string
  ) => Promise<unknown>
) {
  const orderedCountries = [
    ...countries
  ].sort();

  const results = await Promise.allSettled(
    orderedCountries.map(
      (countryCode) =>
        refreshCountry(countryCode)
    )
  );

  const failures = results
    .map((result, index) => ({
      result,
      countryCode:
        orderedCountries[index]
    }))
    .filter(
      ({ result }) =>
        result.status === "rejected"
    );

  return {
    checked: orderedCountries.length,
    refreshed:
      results.length - failures.length,
    failed: failures.map(
      ({ countryCode }) =>
        countryCode
    )
  };
}

export async function refreshVerifiedPricingCountries() {
  const countries = Object.keys(
    verifiedProviderRegistry
  );

  return runPricingRefreshBatch(
    countries,
    (countryCode) =>
      getRegionalPricing(
        countryCode,
        { forceRefresh: true }
      )
  );
}

