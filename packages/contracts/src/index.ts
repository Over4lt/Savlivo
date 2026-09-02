export type SavlivoPlan = "VIEWER" | "MANUAL" | "PREMIUM";
export type ActionType = "PAUSE" | "CANCEL" | "REACTIVATE";
export type ExecutionType =
  | "DIRECT"
  | "PROVIDER_REDIRECT"
  | "GUIDED"
  | "UNSUPPORTED";

export type ActionStatus =
  | "REQUESTED"
  | "AWAITING_CONFIRMATION"
  | "AWAITING_USER_ACTION"
  | "SCHEDULED"
  | "EXECUTING"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED";

export interface SubscriptionSummary {
  id: string;
  serviceSlug: string;
  serviceName: string;
  billingProviderSlug: string;
  countryCode?: string;
  status: "ACTIVE" | "PAUSED" | "CANCELLED" | "UNKNOWN";
  monthlyPriceMinor?: number;
  currency?: string;
  renewalDate?: string;
}

export interface Capability {
  action: ActionType;
  supported: boolean;
  execution: ExecutionType;
  premiumOnly?: boolean;
  reason?: string;
}

export interface ActionPreview {
  action: ActionType;
  subscriptionId: string;
  serviceName: string;
  billingProvider: string;
  execution: ExecutionType;
  requiresConfirmation: boolean;
  premiumRequired: boolean;
  redirectUrl?: string;
  explanation: string;
}

export interface ActionRequest {
  subscriptionId: string;
  action: ActionType;
  scheduleFor?: string;
}

export interface ActionRecord extends ActionPreview {
  id: string;
  status: ActionStatus;
  requestedAt: string;
}

export * from "./billing";
