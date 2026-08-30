import {
  assistantMatchScore
} from "./ai-intent";

export type SavlivoHelpTopic =
  | "home"
  | "subscriptions"
  | "savings"
  | "autopilot"
  | "ai"
  | "settings"
  | "plans"
  | "renewals"
  | "spending"
  | "saved-so-far"
  | "reviewable-spend"
  | "billing-route"
  | "status"
  | "notifications"
  | "region"
  | "appearance"
  | "data-health";

type HelpEntry = {
  topic: SavlivoHelpTopic;
  aliases: string[];
  answer: string;
};

const helpEntries: HelpEntry[] = [
  {
    topic: "home",
    aliases: [
      "home",
      "overview",
      "dashboard",
      "at a glance"
    ],
    answer:
      "Home is your subscription overview. It shows current monthly spend, current savings, your next confirmed renewal, annual spend and, on Premium, the next subscription Savlivo thinks is worth reviewing. Tap a card to open the relevant screen."
  },
  {
    topic: "subscriptions",
    aliases: [
      "subscription",
      "subscriptions",
      "edit subscription",
      "add subscription",
      "manage subscription"
    ],
    answer:
      "Subscriptions is where you manage each service. You can add or edit the service, billing route, plan, actual monthly price and confirmed renewal date. You can also start Pause, Cancel or Reactivate flows from each subscription card."
  },
  {
    topic: "savings",
    aliases: [
      "saving",
      "savings",
      "saving now"
    ],
    answer:
      "Savings summarizes what your subscription decisions are saving. Saving now reflects subscriptions that are currently paused or cancelled and have taken effect. The page also shows Saved so far and spending that is worth reviewing."
  },
  {
    topic: "saved-so-far",
    aliases: [
      "saved so far",
      "accumulated savings",
      "already saved"
    ],
    answer:
      "Saved so far is accumulated savings recorded while subscriptions were paused or cancelled. It is different from a forecast: it represents savings Savlivo has already recorded, not hypothetical future savings."
  },
  {
    topic: "reviewable-spend",
    aliases: [
      "reviewable spend",
      "reviewable",
      "3 month spend",
      "three month spend",
      "annualized reviewable spend"
    ],
    answer:
      "Reviewable spend is spending across active subscriptions that Savlivo can help you review. It is not the same as guaranteed savings. For example, a 3-month reviewable-spend figure shows what those active subscriptions would cost over three months if their current monthly prices continue."
  },
  {
    topic: "autopilot",
    aliases: [
      "autopilot",
      "auto pilot",
      "recommendation",
      "recommendations",
      "monthly action plan"
    ],
    answer:
      "Autopilot is Savlivo's Premium review assistant. It uses active prices, subscription statuses and renewal information to prioritize what may be worth reviewing. It does not assume that the highest-cost service should be cancelled, and Savlivo still asks before a subscription change is made."
  },
  {
    topic: "ai",
    aliases: [
      "assistant",
      "savlivo assistant",
      "ai",
      "chat"
    ],
    answer:
      "Savlivo Assistant helps you understand your subscriptions, spending, savings, renewals and app features. It can also guide subscription actions. Actions still use Savlivo's normal provider and confirmation flow rather than changing a subscription silently."
  },
  {
    topic: "renewals",
    aliases: [
      "renewal",
      "renewal date",
      "renews",
      "next renewal",
      "confirmed renewal"
    ],
    answer:
      "A renewal date is the next confirmed billing date Savlivo has recorded for a subscription. Savlivo only treats it as an upcoming renewal when the current subscription status and effective date indicate that the service is still expected to renew. If an active subscription's recorded renewal date has already passed, Savlivo asks you to update it."
  },
  {
    topic: "spending",
    aliases: [
      "monthly spend",
      "annual spend",
      "current spend",
      "spending",
      "price"
    ],
    answer:
      "Current monthly spend is based on the actual monthly prices recorded for subscriptions that are effectively active. Current annual spend is the current monthly amount multiplied by 12. Changing the comparison country does not manufacture a different bill through currency conversion."
  },
  {
    topic: "billing-route",
    aliases: [
      "billing route",
      "billing provider",
      "apple billing",
      "google play billing",
      "amazon billing",
      "carrier billing"
    ],
    answer:
      "The billing route records where a subscription is actually managed, such as directly with the service, Apple, Google Play, Amazon or a carrier/TV provider. Savlivo uses it to choose the correct management flow and to understand which verified pricing evidence is relevant."
  },
  {
    topic: "status",
    aliases: [
      "status",
      "active",
      "paused",
      "cancelled",
      "effective date"
    ],
    answer:
      "Subscription status can be Active, Paused or Cancelled. A pause or cancellation can also have a future effective date. Until that date arrives, Savlivo treats the subscription as effectively active for spend and renewal decisions."
  },
  {
    topic: "settings",
    aliases: [
      "setting",
      "settings"
    ],
    answer:
      "Settings contains your Savlivo plan, appearance, country and currency, notification preferences, Premium/Autopilot controls and privacy/data options."
  },
  {
    topic: "region",
    aliases: [
      "country",
      "currency",
      "region",
      "currency and region"
    ],
    answer:
      "Currency & region controls the country Savlivo uses for regional pricing and the local currency shown for that country. Your recorded subscription bill remains the actual amount you entered; Savlivo does not simply FX-convert that bill to create a local price."
  },
  {
    topic: "appearance",
    aliases: [
      "appearance",
      "dark mode",
      "light mode",
      "day mode",
      "night mode",
      "theme"
    ],
    answer:
      "Appearance switches Savlivo between light and dark mode. Open Settings and choose Appearance to change it."
  },
  {
    topic: "notifications",
    aliases: [
      "notification",
      "notifications",
      "renewal reminder",
      "renewal reminders",
      "savings opportunities"
    ],
    answer:
      "Savlivo notifications include renewal reminders and savings-opportunity alerts. Renewal reminders depend on having a valid renewal date and a subscription that is still expected to renew."
  },
  {
    topic: "plans",
    aliases: [
      "plan",
      "plans",
      "premium",
      "viewer",
      "manual",
      "upgrade"
    ],
    answer:
      "Savlivo has plan-based features. Premium unlocks Autopilot recommendations and the Savlivo Assistant experience. You can open the plan screen from the badge in the header or from Settings."
  },
  {
    topic: "data-health",
    aliases: [
      "data health",
      "missing information",
      "needs information",
      "wrong data",
      "stale renewal"
    ],
    answer:
      "Savlivo's data-health checks look for missing or stale information that can make reminders or recommendations inaccurate, including renewal dates, billing routes, prices and statuses. Fixing those fields improves the reliability of the rest of the app."
  }
];

export function findSavlivoHelpTopic(
  question: string
): SavlivoHelpTopic | undefined {
  let best:
    | {
        topic: SavlivoHelpTopic;
        score: number;
      }
    | undefined;

  for (const entry of helpEntries) {
    for (const alias of entry.aliases) {
      const score =
        assistantMatchScore(
          question,
          alias
        );

      if (score == null) {
        continue;
      }

      if (
        !best ||
        score > best.score
      ) {
        best = {
          topic: entry.topic,
          score
        };
      }
    }
  }

  return best?.topic;
}

export function getSavlivoHelp(
  question: string,
  preferredTopic?: string
): string {
  const topic =
    (
      preferredTopic &&
      helpEntries.find(
        (entry) =>
          entry.topic === preferredTopic
      )?.topic
    ) ??
    findSavlivoHelpTopic(question);

  if (topic) {
    const entry = helpEntries.find(
      (candidate) =>
        candidate.topic === topic
    );

    if (entry) return entry.answer;
  }

  return (
    "I can explain any part of Savlivo, including Home, Subscriptions, " +
    "Savings, Autopilot, renewal dates, spending, billing routes, " +
    "statuses, Settings, plans and notifications. Ask me what a feature " +
    "does or how to use it."
  );
}
