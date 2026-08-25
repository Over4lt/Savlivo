export type StorePlatform = "IOS" | "ANDROID";
export type ProductId =
  | "savlivo_manual_annual"
  | "savlivo_premium_annual";

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
