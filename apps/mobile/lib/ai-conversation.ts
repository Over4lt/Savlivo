export type AssistantConversationTopic =
  | "comparison"
  | "scenario"
  | "renewal"
  | "recommendation"
  | "spending"
  | "savings"
  | "app-help"
  | "action"
  | "other";

export type AssistantConversationContext = {
  lastSubscriptionId?: string;
  comparedSubscriptionIds: string[];
  lastScenarioMonths?: number;
  lastTopic?: AssistantConversationTopic;
};

export const emptyAssistantConversationContext:
  AssistantConversationContext = {
    comparedSubscriptionIds: []
  };

export function rememberSubscription(
  context: AssistantConversationContext,
  subscriptionId: string,
  topic?: AssistantConversationTopic
): AssistantConversationContext {
  return {
    ...context,
    lastSubscriptionId:
      subscriptionId,
    lastTopic:
      topic ?? context.lastTopic
  };
}

export function rememberComparison(
  context: AssistantConversationContext,
  subscriptionIds: string[]
): AssistantConversationContext {
  return {
    ...context,
    lastSubscriptionId:
      subscriptionIds[
        subscriptionIds.length - 1
      ] ??
      context.lastSubscriptionId,
    comparedSubscriptionIds:
      subscriptionIds.slice(0, 2),
    lastTopic: "comparison"
  };
}

export function rememberScenario(
  context: AssistantConversationContext,
  subscriptionId: string,
  months: number
): AssistantConversationContext {
  return {
    ...context,
    lastSubscriptionId:
      subscriptionId,
    lastScenarioMonths:
      months,
    lastTopic: "scenario"
  };
}

export function resolveReferencedSubscriptionId(
  question: string,
  context: AssistantConversationContext
) {
  const q =
    question
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

  if (
    /\b(first|first one|former)\b/.test(q)
  ) {
    return (
      context.comparedSubscriptionIds[0] ??
      context.lastSubscriptionId
    );
  }

  if (
    /\b(second|second one|latter)\b/.test(q)
  ) {
    return (
      context.comparedSubscriptionIds[1] ??
      context.lastSubscriptionId
    );
  }

  if (
    /\b(it|that|that one|this one|the service|the subscription)\b/.test(
      q
    )
  ) {
    return context.lastSubscriptionId;
  }

  return undefined;
}

export function resolveScenarioMonths(
  explicitMonths: number | null,
  context: AssistantConversationContext
) {
  return (
    explicitMonths ??
    context.lastScenarioMonths ??
    null
  );
}

export function isScenarioFollowUp(
  question: string
) {
  const q =
    question.toLowerCase();

  return (
    q.includes("what about") ||
    q.includes("instead") ||
    q.includes("and for") ||
    q.includes("how about") ||
    q.includes("then") ||
    q.includes("that one") ||
    q.includes("first one") ||
    q.includes("second one")
  );
}

export function isRenewalFollowUp(
  question: string
) {
  const q =
    question.toLowerCase();

  return (
    q.includes("when does it renew") ||
    q.includes("when does that renew") ||
    q.includes("when is its renewal") ||
    q.includes("what about its renewal") ||
    q.includes("and the renewal")
  );
}

export function isComparisonFollowUp(
  question: string
) {
  const q =
    question.toLowerCase();

  return (
    q.includes("which one") ||
    q.includes("which costs more") ||
    q.includes("which is cheaper") ||
    q.includes("which is more expensive") ||
    q.includes("the first one") ||
    q.includes("the second one")
  );
}
