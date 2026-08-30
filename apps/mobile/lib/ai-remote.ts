import { api } from "../src/api";

export type RemoteAssistantResult = {
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
        history,
        context
      })
    }
  );
}
