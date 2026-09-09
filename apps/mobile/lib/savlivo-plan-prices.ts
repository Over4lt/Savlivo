import { formatMarketMinor } from "../../../packages/contracts/src/markets";

// Explicit Savlivo market prices supplied for this release review. No FX conversion.
// These are display configuration, not a replacement for StoreKit's purchase quote.
const configuredPrices: Record<string, { currency: string; manual: [number, number]; premium: [number, number] }> = {
  US: { currency: "USD", manual: [199, 1999], premium: [399, 2999] },
  NO: { currency: "NOK", manual: [2900, 24900], premium: [4900, 39900] }
};

export function configuredSavlivoPrice(country: string, plan: "manual" | "premium", period: "monthly" | "annual", locale: string) {
  const configured = configuredPrices[country];
  return configured ? formatMarketMinor(configured[plan][period === "monthly" ? 0 : 1], configured.currency, locale) : null;
}
