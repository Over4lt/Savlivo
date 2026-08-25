import { Platform } from "react-native";
import { api } from "./api";

export const products = {
  manual: "savlivo_manual_annual",
  premium: "savlivo_premium_annual"
} as const;

/**
 * MVP purchase bridge.
 *
 * Replace this mock with:
 * - StoreKit 2 / expo-in-app-purchases alternative on iOS
 * - Google Play Billing on Android
 *
 * The server still owns entitlement state.
 */
export async function purchasePlan(plan: "manual" | "premium") {
  const platform = Platform.OS === "ios" ? "IOS" : "ANDROID";
  const productId = products[plan];

  const mockTransaction = `mock-${platform}-${productId}-${Date.now()}`;

  return api("/v1/billing/verify", {
    method: "POST",
    body: JSON.stringify({
      platform,
      productId,
      transactionId: mockTransaction
    })
  });
}
