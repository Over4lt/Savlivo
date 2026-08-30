export type ReasoningSubscription = {
  id: string;
  serviceName: string;
  status: string;
  monthlyMinor: number | null;
  renewalDate?: string;
  dataIssues?: string[];
};

export type SubscriptionComparison = {
  first: ReasoningSubscription;
  second: ReasoningSubscription;
  differenceMinor: number;
};

export type SavingsScenario = {
  subscription: ReasoningSubscription;
  months: number;
  savingsMinor: number;
  currentMonthlySpendMinor: number;
  projectedMonthlySpendMinor: number;
};

function usableMonthlyMinor(
  item: ReasoningSubscription
) {
  return typeof item.monthlyMinor === "number" &&
    Number.isFinite(item.monthlyMinor) &&
    item.monthlyMinor >= 0
    ? item.monthlyMinor
    : null;
}

export function rankSubscriptionsByCost(
  items: ReasoningSubscription[]
) {
  return [...items]
    .filter(
      (item) =>
        item.status === "ACTIVE" &&
        usableMonthlyMinor(item) != null
    )
    .sort(
      (a, b) =>
        (usableMonthlyMinor(b) ?? 0) -
        (usableMonthlyMinor(a) ?? 0)
    );
}

export function compareSubscriptions(
  first: ReasoningSubscription,
  second: ReasoningSubscription
): SubscriptionComparison | null {
  const firstMonthly =
    usableMonthlyMinor(first);

  const secondMonthly =
    usableMonthlyMinor(second);

  if (
    firstMonthly == null ||
    secondMonthly == null
  ) {
    return null;
  }

  return {
    first,
    second,
    differenceMinor:
      firstMonthly - secondMonthly
  };
}

export function simulateSubscriptionRemoval(
  item: ReasoningSubscription,
  currentMonthlySpendMinor: number,
  months: number
): SavingsScenario | null {
  const monthly =
    usableMonthlyMinor(item);

  if (
    item.status !== "ACTIVE" ||
    monthly == null ||
    !Number.isFinite(months) ||
    months <= 0
  ) {
    return null;
  }

  const safeCurrentSpend =
    Math.max(
      0,
      currentMonthlySpendMinor
    );

  return {
    subscription: item,
    months,
    savingsMinor:
      monthly * months,
    currentMonthlySpendMinor:
      safeCurrentSpend,
    projectedMonthlySpendMinor:
      Math.max(
        0,
        safeCurrentSpend - monthly
      )
  };
}

export function upcomingRenewalItems(
  items: ReasoningSubscription[],
  todayDateOnly: string
) {
  return [...items]
    .filter(
      (item) =>
        item.status === "ACTIVE" &&
        Boolean(item.renewalDate) &&
        String(item.renewalDate)
          .slice(0, 10) >= todayDateOnly
    )
    .sort((a, b) =>
      String(a.renewalDate)
        .localeCompare(
          String(b.renewalDate)
        )
    );
}

export function subscriptionsWithDataIssues(
  items: ReasoningSubscription[]
) {
  return items.filter(
    (item) =>
      (item.dataIssues?.length ?? 0) > 0
  );
}

export function parseScenarioMonths(
  question: string
) {
  const normalized =
    question.toLowerCase();

  const numeric =
    normalized.match(
      /\b(\d{1,2})\s*months?\b/
    );

  if (numeric) {
    const months =
      Number(numeric[1]);

    if (
      Number.isFinite(months) &&
      months > 0
    ) {
      return months;
    }
  }

  if (
    /\b(one|a)\s+month\b/.test(
      normalized
    ) ||
    /\bfor\s+a\s+month\b/.test(
      normalized
    ) ||
    /\ba\s+month\b/.test(
      normalized
    ) ||
    normalized === "month"
  ) {
    return 1;
  }

  if (
    /\btwo\s+months?\b/.test(
      normalized
    )
  ) {
    return 2;
  }

  if (
    /\bthree\s+months?\b/.test(
      normalized
    )
  ) {
    return 3;
  }

  if (
    /\bsix\s+months?\b/.test(
      normalized
    )
  ) {
    return 6;
  }

  if (
    /\b(one\s+year|a\s+year|year)\b/.test(
      normalized
    )
  ) {
    return 12;
  }

  return null;
}
