export type SubscriptionAction =
  | "PAUSE"
  | "CANCEL"
  | "REACTIVATE";

export type SubscriptionIntent =
  | {
      kind: "ACTION";
      action: SubscriptionAction;
    }
  | {
      kind: "RENEWAL_INFO";
    }
  | {
      kind: "SPENDING_INFO";
    }
  | {
      kind: "SAVINGS_INFO";
    }
  | {
      kind: "APP_HELP";
      topic?: string;
    }
  | {
      kind: "NAVIGATION";
      screen:
        | "home"
        | "subscriptions"
        | "savings"
        | "autopilot"
        | "ai"
        | "settings"
        | "plans";
    }
  | {
      kind: "OTHER";
    };

export function normalizeAssistantText(
  value: string
) {
  return value
    .toLowerCase()
    .replace(/\+/g, " plus ")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function levenshteinDistance(
  a: string,
  b: string
) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  const previous = Array.from(
    { length: b.length + 1 },
    (_, index) => index
  );

  for (let i = 1; i <= a.length; i++) {
    const current = [i];

    for (let j = 1; j <= b.length; j++) {
      current[j] = Math.min(
        current[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] +
          (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }

    for (let j = 0; j < current.length; j++) {
      previous[j] = current[j];
    }
  }

  return previous[b.length];
}

function fuzzyThreshold(word: string) {
  if (word.length <= 3) return 0;
  if (word.length <= 5) return 1;
  if (word.length <= 8) return 2;
  return 3;
}

export function assistantWordMatches(
  inputWord: string,
  targetWord: string
) {
  const input = normalizeAssistantText(inputWord);
  const target = normalizeAssistantText(targetWord);

  if (!input || !target) return false;
  if (input === target) return true;

  return (
    levenshteinDistance(input, target) <=
    fuzzyThreshold(target)
  );
}

export type AssistantMatch = {
  target: string;
  score: number;
};

function wordMatchScore(
  inputWord: string,
  targetWord: string
) {
  const input =
    normalizeAssistantText(inputWord);

  const target =
    normalizeAssistantText(targetWord);

  if (!input || !target) return null;

  if (input === target) {
    return 100;
  }

  /*
   * Very short words such as "ai" are dangerous fuzzy
   * candidates because they occur inside many unrelated
   * phrases. Only allow exact matching below 4 characters.
   */
  if (
    input.length < 4 ||
    target.length < 4
  ) {
    return null;
  }

  const distance =
    levenshteinDistance(
      input,
      target
    );

  const threshold =
    fuzzyThreshold(target);

  if (distance > threshold) {
    return null;
  }

  return 80 - distance * 10;
}

export function assistantMatchScore(
  input: string,
  rawTarget: string
) {
  const normalized =
    normalizeAssistantText(input);

  const target =
    normalizeAssistantText(rawTarget);

  if (!normalized || !target) {
    return null;
  }

  const inputWords =
    normalized
      .split(" ")
      .filter(Boolean);

  const targetWords =
    target
      .split(" ")
      .filter(Boolean);

  /*
   * Exact whole-word / whole-phrase match wins.
   * Padding prevents "ai" from matching inside another word.
   */
  if (
    ` ${normalized} `.includes(
      ` ${target} `
    )
  ) {
    return (
      1000 +
      targetWords.length * 100 +
      target.length
    );
  }

  if (
    targetWords.length >
    inputWords.length
  ) {
    return null;
  }

  let bestScore: number | null =
    null;

  for (
    let start = 0;
    start <=
      inputWords.length -
        targetWords.length;
    start++
  ) {
    const window =
      inputWords.slice(
        start,
        start +
          targetWords.length
      );

    let total = 0;
    let valid = true;

    for (
      let index = 0;
      index < targetWords.length;
      index++
    ) {
      const score =
        wordMatchScore(
          window[index],
          targetWords[index]
        );

      if (score == null) {
        valid = false;
        break;
      }

      total += score;
    }

    if (!valid) continue;

    /*
     * Longer phrases are more specific, so give them
     * a modest advantage over one-word fuzzy matches.
     */
    total +=
      targetWords.length * 20;

    if (
      bestScore == null ||
      total > bestScore
    ) {
      bestScore = total;
    }
  }

  return bestScore;
}

export function bestAssistantMatch(
  input: string,
  targets: string[]
): AssistantMatch | null {
  let best:
    | AssistantMatch
    | null = null;

  for (const target of targets) {
    const score =
      assistantMatchScore(
        input,
        target
      );

    if (score == null) continue;

    if (
      !best ||
      score > best.score
    ) {
      best = {
        target,
        score
      };
    }
  }

  return best;
}

export function assistantContains(
  input: string,
  targets: string[]
) {
  return (
    bestAssistantMatch(
      input,
      targets
    ) != null
  );
}

function wantsNavigation(
  question: string
) {
  /*
   * Navigation needs an actual navigation verb.
   * Do not fuzzy-match generic words such as "how"
   * into "show".
   */
  const normalized =
    normalizeAssistantText(question);

  return (
    /(^| )(open|show|navigate)( |$)/.test(
      normalized
    ) ||
    normalized.includes("take me") ||
    normalized.includes("go to")
  );
}

export function classifySubscriptionIntent(
  question: string
): SubscriptionIntent {
  /*
   * Ordering matters.
   *
   * Reactivation is intentionally checked before
   * renewal because "renew" by itself is information,
   * not permission to reactivate a subscription.
   */

  const actionCandidates: Array<{
    action: SubscriptionAction;
    aliases: string[];
  }> = [
    {
      action: "PAUSE",
      aliases: [
        "pause",
        "suspend",
        "temporarily stop"
      ]
    },
    {
      action: "CANCEL",
      aliases: [
        "cancel",
        "cancellation",
        "unsubscribe",
        "stop subscription"
      ]
    },
    {
      action: "REACTIVATE",
      aliases: [
        "reactivate",
        "reactivation",
        "resume",
        "restart",
        "unpause"
      ]
    }
  ];

  let bestAction:
    | {
        action: SubscriptionAction;
        score: number;
      }
    | null = null;

  for (const candidate of actionCandidates) {
    const match =
      bestAssistantMatch(
        question,
        candidate.aliases
      );

    if (
      match &&
      (
        !bestAction ||
        match.score > bestAction.score
      )
    ) {
      bestAction = {
        action: candidate.action,
        score: match.score
      };
    }
  }

  if (bestAction) {
    return {
      kind: "ACTION",
      action: bestAction.action
    };
  }

  if (
    assistantContains(question, [
      "renew",
      "renewal",
      "renews",
      "next charge",
      "charged next",
      "billing date"
    ])
  ) {
    return {
      kind: "RENEWAL_INFO"
    };
  }

  if (
    wantsNavigation(question)
  ) {
    if (
      assistantContains(question, [
        "subscription",
        "subscriptions"
      ])
    ) {
      return {
        kind: "NAVIGATION",
        screen: "subscriptions"
      };
    }

    if (
      assistantContains(question, [
        "setting",
        "settings",
        "country",
        "currency"
      ])
    ) {
      return {
        kind: "NAVIGATION",
        screen: "settings"
      };
    }

    if (
      assistantContains(question, [
        "saving",
        "savings"
      ])
    ) {
      return {
        kind: "NAVIGATION",
        screen: "savings"
      };
    }

    if (
      assistantContains(question, [
        "autopilot",
        "recommendations"
      ])
    ) {
      return {
        kind: "NAVIGATION",
        screen: "autopilot"
      };
    }

    if (
      assistantContains(question, [
        "plan",
        "plans",
        "premium",
        "upgrade"
      ])
    ) {
      return {
        kind: "NAVIGATION",
        screen: "plans"
      };
    }

    if (
      assistantContains(question, [
        "home",
        "dashboard"
      ])
    ) {
      return {
        kind: "NAVIGATION",
        screen: "home"
      };
    }
  }

  if (
    assistantContains(question, [
      "spend",
      "spending",
      "cost",
      "costing",
      "paying",
      "monthly total",
      "monthly spend"
    ])
  ) {
    return {
      kind: "SPENDING_INFO"
    };
  }

  if (
    assistantContains(question, [
      "save",
      "saving",
      "savings",
      "saved",
      "save money"
    ])
  ) {
    return {
      kind: "SAVINGS_INFO"
    };
  }

  if (
    assistantContains(question, [
      "how do i",
      "how does",
      "how to",
      "what does",
      "explain",
      "help",
      "where is",
      "what is"
    ])
  ) {
    let topic: string | undefined;

    if (
      assistantContains(question, [
        "autopilot"
      ])
    ) {
      topic = "autopilot";
    } else if (
      assistantContains(question, [
        "subscription",
        "subscriptions"
      ])
    ) {
      topic = "subscriptions";
    } else if (
      assistantContains(question, [
        "saving",
        "savings"
      ])
    ) {
      topic = "savings";
    } else if (
      assistantContains(question, [
        "renewal",
        "renewal date"
      ])
    ) {
      topic = "renewals";
    } else if (
      assistantContains(question, [
        "country",
        "currency",
        "region"
      ])
    ) {
      topic = "region";
    } else if (
      assistantContains(question, [
        "plan",
        "premium",
        "viewer",
        "manual"
      ])
    ) {
      topic = "plans";
    }

    return {
      kind: "APP_HELP",
      topic
    };
  }

  return {
    kind: "OTHER"
  };
}
