import {
  normalizeAssistantText
} from "./ai-intent";

export type AssistantPreferences = {
  monthlySavingsGoalMinor?: number;
  protectedSubscriptionIds: string[];
};

export const emptyAssistantPreferences:
  AssistantPreferences = {
    protectedSubscriptionIds: []
  };

export function parseSavingsGoalAmount(
  question: string
) {
  const normalized =
    normalizeAssistantText(question);

  const match =
    normalized.match(
      /\b(?:save|cut|reduce|lower|get rid of)\s+(?:about\s+|around\s+|roughly\s+)?(?:kr\s*)?(\d+(?:[.,]\d{1,2})?)(?:\s*kr)?(?:\s+(?:a|per)\s+month)?\b/
    );

  if (!match) {
    return null;
  }

  const amount =
    Number(
      match[1].replace(",", ".")
    );

  if (
    !Number.isFinite(amount) ||
    amount <= 0
  ) {
    return null;
  }

  return Math.round(
    amount * 100
  );
}

export function isProtectionRequest(
  question: string
) {
  const q =
    normalizeAssistantText(question);

  return (
    q.includes("never cancel") ||
    q.includes("never pause") ||
    q.includes("dont cancel") ||
    q.includes("don t cancel") ||
    q.includes("dont pause") ||
    q.includes("don t pause") ||
    q.includes("keep ") ||
    q.includes("protect ")
  );
}

export function protectSubscription(
  preferences: AssistantPreferences,
  subscriptionId: string
): AssistantPreferences {
  if (
    preferences
      .protectedSubscriptionIds
      .includes(subscriptionId)
  ) {
    return preferences;
  }

  return {
    ...preferences,
    protectedSubscriptionIds: [
      ...preferences
        .protectedSubscriptionIds,
      subscriptionId
    ]
  };
}

export function unprotectSubscription(
  preferences: AssistantPreferences,
  subscriptionId: string
): AssistantPreferences {
  return {
    ...preferences,
    protectedSubscriptionIds:
      preferences
        .protectedSubscriptionIds
        .filter(
          (id) =>
            id !== subscriptionId
        )
  };
}

export function setMonthlySavingsGoal(
  preferences: AssistantPreferences,
  monthlySavingsGoalMinor: number
): AssistantPreferences {
  return {
    ...preferences,
    monthlySavingsGoalMinor:
      Math.max(
        0,
        Math.round(
          monthlySavingsGoalMinor
        )
      )
  };
}

export type RecommendationCandidate = {
  id: string;
  serviceName: string;
  monthlyMinor: number | null;
  status: string;
};

export function rankAllowedRecommendations(
  items: RecommendationCandidate[],
  preferences: AssistantPreferences
) {
  return [...items]
    .filter(
      (item) =>
        item.status === "ACTIVE" &&
        typeof item.monthlyMinor ===
          "number" &&
        item.monthlyMinor > 0 &&
        !preferences
          .protectedSubscriptionIds
          .includes(item.id)
    )
    .sort(
      (a, b) =>
        (b.monthlyMinor ?? 0) -
        (a.monthlyMinor ?? 0)
    );
}

export function buildSavingsGoalPlan(
  items: RecommendationCandidate[],
  preferences: AssistantPreferences
) {
  const target =
    preferences
      .monthlySavingsGoalMinor;

  if (
    target == null ||
    target <= 0
  ) {
    return null;
  }

  const candidates =
    rankAllowedRecommendations(
      items,
      preferences
    );

  const selected:
    RecommendationCandidate[] = [];

  let monthlyReductionMinor = 0;

  for (const item of candidates) {
    if (
      monthlyReductionMinor >=
      target
    ) {
      break;
    }

    selected.push(item);

    monthlyReductionMinor +=
      item.monthlyMinor ?? 0;
  }

  return {
    targetMinor: target,
    monthlyReductionMinor,
    reachesGoal:
      monthlyReductionMinor >= target,
    selected
  };
}
