import type { AssistantAction } from "../../../packages/contracts/src/assistant-actions";
import type { AddSubscriptionIntent } from "../../../packages/contracts/src/discovery";
import { api } from "../src/api";

export type RemoteAssistantResult = {
  assistantAction?: AssistantAction;
  catalogAction?: AddSubscriptionIntent;
  answer: string;
  language: string;
  intent:
    | "ACTION"
    | "RENEWAL_INFO"
    | "SPENDING_INFO"
    | "SAVINGS_INFO"
    | "APP_HELP"
    | "NAVIGATION"
    | "SCENARIO"
    | "COMPARISON"
    | "GOAL"
    | "PREFERENCE"
    | "GENERAL";
  action:
    | "PAUSE"
    | "CANCEL"
    | "REACTIVATE"
    | null;
  serviceNames: string[];
  navigationTarget:
    | "home"
    | "subscriptions"
    | "savings"
    | "autopilot"
    | "ai"
    | "settings"
    | "plans"
    | null;
  needsExternalResearch: boolean;
};

export type RemoteAssistantHistoryMessage = {
  role: "user" | "assistant";
  text: string;
};

export type RemoteAssistantContext = {
  languageHint?: string;
  countryCode?: string;
  countryName?: string;
  currency?: string;
  currentMonthlySpendMinor?: number;
  currentAnnualSpendMinor?: number;
  currentMonthlySavingsMinor?: number;
  savedSoFarMinor?: number;
};

export async function askRemoteAssistant(
  message: string,
  history: RemoteAssistantHistoryMessage[],
  context: RemoteAssistantContext
) {
  return api<RemoteAssistantResult>(
    "/v1/assistant/chat",
    {
      method: "POST",
      body: JSON.stringify({
        message,
        languageHint: context.languageHint,
        history,
        context
      })
    }
  );
}
