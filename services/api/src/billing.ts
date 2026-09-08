import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  Environment,
  SignedDataVerifier
} from "@apple/app-store-server-library";

import type {
  PurchaseVerificationRequest,
  PurchaseVerificationResult,
  ProductId
} from "../../../packages/contracts/src/billing.js";

export interface StoreVerifier {
  verify(input: PurchaseVerificationRequest): Promise<PurchaseVerificationResult>;
}

const productToPlan: Record<ProductId, "MANUAL" | "PREMIUM"> = {
  "com.thomashodne.savlivo.manual.monthly": "MANUAL",
  "com.thomashodne.savlivo.manual.yearly": "MANUAL",
  "com.thomashodne.savlivo.premium.monthly": "PREMIUM",
  "com.thomashodne.savlivo.premium.annual": "PREMIUM"
};

const productIds = new Set<ProductId>(
  Object.keys(productToPlan) as ProductId[]
);

const bundleId = "com.thomashodne.savlivo";
const appAppleId = 6806879834;

function isProductId(value: string | undefined): value is ProductId {
  return Boolean(value && productIds.has(value as ProductId));
}

function loadAppleRootCertificates(): Buffer[] {
  const certDirectories = [
    resolve(process.cwd(), "certs"),
    resolve(process.cwd(), "services/api/certs")
  ];

  const certDirectory = certDirectories.find((directory) =>
    existsSync(resolve(directory, "AppleIncRootCertificate.cer"))
  );

  if (!certDirectory) {
    throw new Error("APPLE_ROOT_CERTIFICATES_NOT_FOUND");
  }

  return [
    readFileSync(resolve(certDirectory, "AppleIncRootCertificate.cer")),
    readFileSync(resolve(certDirectory, "AppleRootCA-G2.cer")),
    readFileSync(resolve(certDirectory, "AppleRootCA-G3.cer"))
  ];
}

const appleRootCertificates = loadAppleRootCertificates();

const productionVerifier = new SignedDataVerifier(
  appleRootCertificates,
  true,
  Environment.PRODUCTION,
  bundleId,
  appAppleId
);

const sandboxVerifier = new SignedDataVerifier(
  appleRootCertificates,
  true,
  Environment.SANDBOX,
  bundleId
);

class AppleStoreVerifier implements StoreVerifier {
  async verify(
    input: PurchaseVerificationRequest
  ): Promise<PurchaseVerificationResult> {
    if (input.platform !== "IOS" || !input.signedTransaction) {
      return invalidResult(input);
    }

    let transaction;

    try {
      transaction =
        await productionVerifier.verifyAndDecodeTransaction(
          input.signedTransaction
        );
    } catch {
      try {
        transaction =
          await sandboxVerifier.verifyAndDecodeTransaction(
            input.signedTransaction
          );
      } catch {
        return invalidResult(input);
      }
    }

    if (
      !isProductId(transaction.productId) ||
      !transaction.transactionId ||
      !transaction.originalTransactionId ||
      !transaction.expiresDate
    ) {
      return invalidResult(input);
    }

    if (transaction.revocationDate) {
      return invalidResult(input);
    }

    if (transaction.expiresDate <= Date.now()) {
      return invalidResult(input);
    }

    return {
      valid: true,
      productId: transaction.productId,
      platform: "IOS",
      externalTransactionId: transaction.originalTransactionId,
      expiresAt: new Date(transaction.expiresDate).toISOString()
    };
  }
}

function invalidResult(
  input: PurchaseVerificationRequest
): PurchaseVerificationResult {
  return {
    valid: false,
    productId: input.productId,
    platform: input.platform,
    externalTransactionId:
      input.transactionId ??
      input.purchaseToken ??
      "unverified-transaction"
  };
}

export const storeVerifier: StoreVerifier = new AppleStoreVerifier();

export function planForProduct(productId: ProductId) {
  return productToPlan[productId];
}
