export type StorePlatform = "IOS" | "ANDROID";
export type ProductId =
  | "com.thomashodne.savlivo.manual.monthly"
  | "com.thomashodne.savlivo.manual.yearly"
  | "com.thomashodne.savlivo.premium.monthly"
  | "com.thomashodne.savlivo.premium.yearly";

export interface PurchaseVerificationRequest {
  platform: StorePlatform;
  productId: ProductId;
  purchaseToken?: string;
  transactionId?: string;
  signedTransaction?: string;
}

export interface PurchaseVerificationResult {
  valid: boolean;
  productId: ProductId;
  platform: StorePlatform;
  externalTransactionId: string;
  expiresAt?: string;
}
