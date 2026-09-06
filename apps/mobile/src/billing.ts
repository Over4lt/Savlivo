import { Platform } from "react-native";

import {
  finishTransaction,
  initConnection,
  purchaseErrorListener,
  purchaseUpdatedListener,
  requestPurchase,
  type Purchase
} from "expo-iap";

import { api } from "./api";

export const products = {
  manualMonthly: "com.thomashodne.savlivo.manual.monthly",
  manualYearly: "com.thomashodne.savlivo.manual.yearly",
  premiumMonthly: "com.thomashodne.savlivo.premium.monthly",
  premiumYearly: "com.thomashodne.savlivo.premium.yearly"
} as const;

let connectionPromise: Promise<boolean> | null = null;

async function ensureStoreConnection() {
  if (!connectionPromise) {
    connectionPromise = initConnection().catch((error) => {
      connectionPromise = null;
      throw error;
    });
  }

  const connected = await connectionPromise;

  if (!connected) {
    connectionPromise = null;
    throw new Error("STORE_CONNECTION_FAILED");
  }
}

async function verifyAndFinishPurchase(purchase: Purchase) {
  if (Platform.OS !== "ios") {
    throw new Error("ANDROID_BILLING_NOT_IMPLEMENTED");
  }

  if (
    purchase.purchaseState !== "purchased" ||
    !purchase.purchaseToken
  ) {
    throw new Error("PURCHASE_NOT_READY");
  }

  const result = await api("/v1/billing/verify", {
    method: "POST",
    body: JSON.stringify({
      platform: "IOS",
      productId: purchase.productId,
      transactionId: purchase.transactionId,
      signedTransaction: purchase.purchaseToken
    })
  });

  await finishTransaction({
    purchase,
    isConsumable: false
  });

  return result;
}

export async function purchasePlan(plan: "manual" | "premium") {
  if (Platform.OS !== "ios") {
    throw new Error("ANDROID_BILLING_NOT_IMPLEMENTED");
  }

  await ensureStoreConnection();

  const productId =
    plan === "manual"
      ? products.manualYearly
      : products.premiumYearly;

  return new Promise((resolve, reject) => {
    let settled = false;

    const cleanup = () => {
      purchaseSubscription.remove();
      errorSubscription.remove();
    };

    const succeed = (value: unknown) => {
      if (settled) {
        return;
      }

      settled = true;
      cleanup();
      resolve(value);
    };

    const fail = (error: unknown) => {
      if (settled) {
        return;
      }

      settled = true;
      cleanup();
      reject(error);
    };

    const purchaseSubscription = purchaseUpdatedListener(
      async (purchase) => {
        if (purchase.productId !== productId) {
          return;
        }

        try {
          const result = await verifyAndFinishPurchase(purchase);
          succeed(result);
        } catch (error) {
          fail(error);
        }
      }
    );

    const errorSubscription = purchaseErrorListener((error) => {
      if (error.productId && error.productId !== productId) {
        return;
      }

      fail(error);
    });

    void requestPurchase({
      request: {
        apple: {
          sku: productId,
          andDangerouslyFinishTransactionAutomatically: false
        }
      },
      type: "subs"
    }).catch(fail);
  });
}
