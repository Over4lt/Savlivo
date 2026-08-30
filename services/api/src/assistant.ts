import Groq from "groq-sdk";

export type AssistantHistoryMessage = {
  role: "user" | "assistant";
  text: string;
};

export type AssistantSubscriptionContext = {
  id: string;
  serviceName: string;
  serviceSlug?: string;
  billingProviderSlug?: string;
  status?: string;
  statusEffectiveDate?: string;
  monthlyPriceMinor?: number | null;
  currency?: string;
  renewalDate?: string;
  planName?: string;
};

export type SavlivoAssistantContext = {
  countryCode?: string;
  countryName?: string;
  currency?: string;
  plan?: string;
  currentMonthlySpendMinor?: number;
  currentAnnualSpendMinor?: number;
  currentMonthlySavingsMinor?: number;
  savedSoFarMinor?: number;
  subscriptions?: AssistantSubscriptionContext[];
};

export type AssistantRequest = {
  message: string;
  history?: AssistantHistoryMessage[];
  languageHint?: string;
  context?: SavlivoAssistantContext;
};

export type AssistantResult = {
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
  action: "PAUSE" | "CANCEL" | "REACTIVATE" | null;
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

const groq =
  process.env.GROQ_API_KEY
    ? new Groq({
        apiKey: process.env.GROQ_API_KEY
      })
    : null;

const SYSTEM_PROMPT = `
You are Savlivo Assistant.

You understand users naturally in many languages.
Always reply in the language of the user's latest message unless they ask for another language.

Understand:
- spelling mistakes
- shorthand
- informal wording
- mixed languages
- follow-up questions

Savlivo is the source of truth for:
- subscription prices
- subscription status
- billing routes
- renewal dates
- savings
- account data
- financial calculations
- actions

Never invent missing account facts.

Never claim to execute a pause, cancellation or reactivation.
Those requests must only be interpreted so Savlivo can run its own confirmation flow.

SAVLIVO PRODUCT FACTS:
- Home summarizes the user's subscriptions, spending, savings and upcoming renewals.
- Subscriptions is where services, prices, billing routes, plans and renewal dates are managed.
- Savings shows recorded savings and reviewable subscription spending.
- Autopilot is a recommendation and decision-support feature.
- Autopilot does NOT automatically charge, cancel, pause, reactivate or otherwise manage subscriptions by itself.
- Savlivo always asks before a subscription change is made.
- Guided Actions can help the user reach the correct provider flow for pause, cancellation or reactivation.
- Saved so far means savings already recorded by Savlivo, not hypothetical future savings.
- Reviewable spend is spending that may be worth reviewing; it is NOT guaranteed savings.
- A billing route records where the subscription is actually managed, such as direct, Apple, Google Play, Amazon or a carrier.
- Regional pricing must not be invented through simple currency conversion.
- Never invent app functionality that is not described here or supplied in context.

Classify every message as exactly one of:
ACTION
RENEWAL_INFO
SPENDING_INFO
SAVINGS_INFO
APP_HELP
NAVIGATION
SCENARIO
COMPARISON
GOAL
PREFERENCE
GENERAL

Set needsExternalResearch=true only when the user asks for information that requires current facts outside Savlivo, such as:
- a provider's current cancellation policy
- current provider instructions
- a current external price
- fresh information from the web
`;

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    answer: {
      type: "string"
    },
    language: {
      type: "string"
    },
    intent: {
      type: "string",
      enum: [
        "ACTION",
        "RENEWAL_INFO",
        "SPENDING_INFO",
        "SAVINGS_INFO",
        "APP_HELP",
        "NAVIGATION",
        "SCENARIO",
        "COMPARISON",
        "GOAL",
        "PREFERENCE",
        "GENERAL"
      ]
    },
    action: {
      type: ["string", "null"],
      enum: [
        "PAUSE",
        "CANCEL",
        "REACTIVATE",
        null
      ]
    },
    serviceNames: {
      type: "array",
      items: {
        type: "string"
      }
    },
    navigationTarget: {
      type: ["string", "null"],
      enum: [
        "home",
        "subscriptions",
        "savings",
        "autopilot",
        "ai",
        "settings",
        "plans",
        null
      ]
    },
    needsExternalResearch: {
      type: "boolean"
    }
  },
  required: [
    "answer",
    "language",
    "intent",
    "action",
    "serviceNames",
    "navigationTarget",
    "needsExternalResearch"
  ],
  additionalProperties: false
} as const;

function sanitizeHistory(
  history?: AssistantHistoryMessage[]
) {
  return (history ?? [])
    .slice(-10)
    .filter(
      (item) =>
        item &&
        (
          item.role === "user" ||
          item.role === "assistant"
        ) &&
        typeof item.text === "string" &&
        item.text.trim()
    );
}

export async function askAssistant(
  request: AssistantRequest
): Promise<AssistantResult> {
  const message =
    String(request.message ?? "").trim();

  if (!message) {
    throw new Error(
      "INVALID_ASSISTANT_MESSAGE"
    );
  }

  if (!groq) {
    throw new Error(
      "GROQ_API_KEY_MISSING"
    );
  }

  const history =
    sanitizeHistory(
      request.history
    );

  const completion =
    await groq.chat.completions.create({
      model:
        process.env.GROQ_ASSISTANT_MODEL ??
        "openai/gpt-oss-20b",

      messages: [
        {
          role: "system",
          content: SYSTEM_PROMPT
        },

        ...history.map(
          (item) => ({
            role: item.role,
            content: item.text
          })
        ),

        {
          role: "user",
          content:
            `Latest user message:\n${message}\n\n` +
            `Language hint:\n${request.languageHint ?? "none"}\n\n` +
            `Savlivo context:\n${JSON.stringify(
              request.context ?? {},
              null,
              2
            )}`
        }
      ],

      response_format: {
        type: "json_schema",
        json_schema: {
          name: "savlivo_assistant_response",
          strict: true,
          schema: RESPONSE_SCHEMA
        }
      }
    });

  const raw =
    completion
      .choices[0]
      ?.message
      ?.content
      ?.trim();

  if (!raw) {
    throw new Error(
      "EMPTY_ASSISTANT_RESPONSE"
    );
  }

  const parsed =
    JSON.parse(raw) as AssistantResult;

  return parsed;
}
