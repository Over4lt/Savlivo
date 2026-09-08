import { modelActionCandidate, type AssistantAction } from "../../../packages/contracts/src/assistant-actions.js";
import { helpEntries } from "../../../packages/contracts/src/app-help.js";
import { serviceCatalog, serviceAvailableInMarket, serviceBillingProviders } from "../../../packages/contracts/src/catalog.js";
import { countryCurrencyData } from "../../../packages/contracts/src/markets.js";
import { parseAddSubscriptionIntent, type AddSubscriptionIntent } from "../../../packages/contracts/src/discovery.js";
import Groq from "groq-sdk";

export type AssistantHistoryMessage = {
  role: "user" | "assistant";
  text: string;
};

export type AssistantSubscriptionContext = {
  countryCode?: string;
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
You are Savlivo Assistant, a general-purpose assistant as well as a guide to Savlivo.
Answer ordinary knowledge, writing, reasoning and other non-Savlivo questions normally.
Never restrict the conversation to Savlivo topics. Structured actions are optional and additive.
For ordinary discussion, hypothetical examples, quoted instructions, negated requests and general questions, set actionCandidate=null.
For an explicit request to add/start a subscription or a statement that the user has one, propose ADD.
For requests to manage/change plan/pause/cancel/renew/reactivate/manage payment for a saved subscription, propose MANAGEMENT.
Interpret these intents in any language. Language never determines country or currency.
Use canonical identity/aliases where known, otherwise preserve the user's service name for manual entry.
Only extract a plan or billing route when stated; do not guess a plan from the price.
For stated billing, use direct/apple/google-play/amazon/carrier when unambiguous; otherwise use unresolved.
MANAGEMENT uses the saved bill's routing, never an invented URL or a new billing route.
Do not choose among multiple matching saved subscriptions. Savlivo will ask the user to select.
ADD only opens a form; it does not subscribe at the provider or save a Savlivo record.
Provider navigation never proves that pause/cancel/renew/plan/payment changes occurred.
When offering management navigation, say the user must review available options and complete changes at the provider/store.
Do not claim live web research was performed; you have no browsing tool in this request.

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

Shared app-help and catalog context supplied below describe supported Savlivo capabilities.
Never invent additional functionality or current prices. Account facts come only from supplied selected-market records.

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
    actionCandidate: {
      type: ["object", "null"],
      properties: {
        type: {type:"string",enum:["ADD","MANAGEMENT"]},
        serviceQuery: {type:"string"},
        planQuery: {type:["string","null"]},
        billingProviderSlug: {type:["string","null"]},
        managementAction: {type:["string","null"],enum:["MANAGE","CHANGE_PLAN","PAUSE","CANCEL","REACTIVATE","BILLING",null]}
      },
      required:["type","serviceQuery","planQuery","billingProviderSlug","managementAction"],
      additionalProperties:false
    },
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
    "actionCandidate",
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

export type AssistantModel = (messages: Array<{role:"system"|"user"|"assistant";content:string}>, schema: typeof RESPONSE_SCHEMA) => Promise<string>;

const callGroq: AssistantModel = async (messages, schema) => {
  if (!groq) throw new Error("GROQ_API_KEY_MISSING");
  const completion = await groq.chat.completions.create({
    model: process.env.GROQ_ASSISTANT_MODEL ?? "openai/gpt-oss-20b",
    messages,
    response_format: {type:"json_schema",json_schema:{name:"savlivo_assistant_response",strict:true,schema}}
  });
  const raw=completion.choices[0]?.message?.content?.trim();
  if(!raw)throw new Error("EMPTY_ASSISTANT_RESPONSE");
  return raw;
};

export function parseAssistantResponse(raw:string,context?:SavlivoAssistantContext):AssistantResult {
  const value:unknown=JSON.parse(raw);
  if(!value || typeof value!=="object")throw new Error("INVALID_ASSISTANT_RESPONSE");
  const v=value as Record<string,unknown>;
  if(typeof v.answer!=="string" || !v.answer.trim())throw new Error("INVALID_ASSISTANT_RESPONSE");
  const intent=RESPONSE_SCHEMA.properties.intent.enum.includes(v.intent as any) ? v.intent as AssistantResult["intent"] : "GENERAL";
  const action=RESPONSE_SCHEMA.properties.action.enum.includes(v.action as any) ? v.action as AssistantResult["action"] : null;
  const serviceNames=Array.isArray(v.serviceNames)?v.serviceNames.filter((name):name is string=>typeof name==="string"&&name.length<=160).slice(0,10):[];
  // Older model responses can still propose a single status intent. Validation is identical.
  const candidate=v.actionCandidate ?? (intent==="ACTION" && action && serviceNames.length===1 ? {type:"MANAGEMENT",serviceQuery:serviceNames[0],managementAction:action}:null);
  const assistantAction=modelActionCandidate(candidate,context?.countryCode??"",context?.currency??"");
  return {
    answer:v.answer,language:typeof v.language==="string"?v.language:"en",intent,action,serviceNames,
    navigationTarget:RESPONSE_SCHEMA.properties.navigationTarget.enum.includes(v.navigationTarget as any)?v.navigationTarget as AssistantResult["navigationTarget"]:null,
    needsExternalResearch:v.needsExternalResearch===true,
    ...(assistantAction?{assistantAction}:{}),
    ...(assistantAction?.kind==="open-add-subscription"?{catalogAction:assistantAction}:{})
  };
}

export async function askAssistant(request:AssistantRequest,model:AssistantModel=callGroq):Promise<AssistantResult> {
  const message=String(request.message??"").trim();
  if(!message)throw new Error("INVALID_ASSISTANT_MESSAGE");
  // Restricted offline fallback only; these patterns never gate a configured model.
  if(model===callGroq && !groq) {
    const catalogAction=parseAddSubscriptionIntent(message,request.context?.countryCode??"",request.context?.currency??"");
    if(catalogAction)return {
      answer:/^(legg til|jeg har)/i.test(message)?"Se gjennom og bekreft i skjemaet. Ingenting er lagt til ennå.":"Review and confirm in the form. Nothing has been added yet.",
      language:request.languageHint??"en",intent:"NAVIGATION",action:null,serviceNames:[],navigationTarget:null,needsExternalResearch:false,catalogAction,assistantAction:catalogAction
    };
    throw new Error("GROQ_API_KEY_MISSING");
  }
  const catalog=serviceCatalog.map(service=>({slug:service.slug,name:service.name,aliases:service.aliases,
    availableInSelectedMarket:serviceAvailableInMarket(service.slug,request.context?.countryCode??""),billingChoices:serviceBillingProviders[service.slug]??[]}));
  const messages:Array<{role:"system"|"user"|"assistant";content:string}>=[
    {role:"system",content:SYSTEM_PROMPT+"\nShared Savlivo help:\n"+JSON.stringify(helpEntries.map(({topic,answer})=>({topic,answer})))+
      "\nCanonical catalog (availability is not proof of a price or this user's bill):\n"+JSON.stringify(catalog)+
      "\nSelectable market/currency definitions:\n"+JSON.stringify(countryCurrencyData)},
    ...sanitizeHistory(request.history).map(item=>({role:item.role,content:item.text})),
    {role:"user",content:`Latest user message:\n${message}\n\nLanguage hint:\n${request.languageHint??"none"}\n\nSavlivo context:\n${JSON.stringify(request.context??{})}`}
  ];
  return parseAssistantResponse(await model(messages,RESPONSE_SCHEMA),request.context);
}
