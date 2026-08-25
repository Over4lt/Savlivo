import type {
  PurchaseVerificationRequest,
  PurchaseVerificationResult,
  ProductId
} from "../../../packages/contracts/src/billing.js";

export interface StoreVerifier {
  verify(input: PurchaseVerificationRequest): Promise<PurchaseVerificationResult>;
}

const productToPlan: Record<ProductId, "MANUAL" | "PREMIUM"> = {
  savlivo_manual_annual: "MANUAL",
  savlivo_premium_annual: "PREMIUM"
};

class MockStoreVerifier implements StoreVerifier {
  async verify(input: PurchaseVerificationRequest): Promise<PurchaseVerificationResult> {
    const externalTransactionId =
      input.transactionId ??
      input.purchaseToken ??
      "mock-transaction";

    return {
      valid: true,
      productId: input.productId,
      platform: input.platform,
      externalTransactionId,
      expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()
    };
  }
}

export const storeVerifier: StoreVerifier = new MockStoreVerifier();

export function planForProduct(productId: ProductId) {
  return productToPlan[productId];
}
