import {
  levenshteinDistance,
  normalizeAssistantText
} from "./ai-intent";

export type AssistantSubscriptionEntity = {
  id: string;
  serviceName: string;
  serviceSlug?: string;
};

export type ResolvedSubscriptionEntity = {
  item: AssistantSubscriptionEntity;
  score: number;
  matchedAlias: string;
};

function serviceAliases(
  item: AssistantSubscriptionEntity
) {
  const name =
    normalizeAssistantText(
      item.serviceName
    );

  const slug =
    normalizeAssistantText(
      String(
        item.serviceSlug ?? ""
      ).replace(/-/g, " ")
    );

  const aliases = new Set<string>([
    name,
    slug
  ]);

  if (name.includes("netflix")) {
    aliases.add("netflix");
  }

  if (name.includes("youtube")) {
    aliases.add("youtube");
    aliases.add("youtube premium");
    aliases.add("yt");
  }

  if (name.includes("disney")) {
    aliases.add("disney");
    aliases.add("disney plus");
  }

  if (
    name === "max" ||
    name.includes("hbo max")
  ) {
    aliases.add("max");
    aliases.add("hbo max");
    aliases.add("hbo");
  }

  if (name.includes("prime")) {
    aliases.add("prime");
    aliases.add("prime video");
    aliases.add("amazon prime");
  }

  if (name.includes("apple tv")) {
    aliases.add("apple tv");
    aliases.add("apple tv plus");
    aliases.add("appletv");
  }

  return [...aliases]
    .filter(Boolean);
}

function tokenScore(
  token: string,
  aliasToken: string
) {
  if (token === aliasToken) {
    return 100;
  }

  const distance =
    levenshteinDistance(
      token,
      aliasToken
    );

  /*
   * Service names need slightly different fuzzy rules
   * from general intent words.
   *
   * A 3-letter service such as Max may tolerate one
   * missing character ("mx"), but only when comparing
   * individual tokens.
   */
  const threshold =
    aliasToken.length <= 2
      ? 0
      : aliasToken.length <= 4
        ? 1
        : aliasToken.length <= 7
          ? 2
          : 3;

  if (distance > threshold) {
    return null;
  }

  return 80 - distance * 10;
}

function aliasScore(
  question: string,
  alias: string
) {
  const normalizedQuestion =
    normalizeAssistantText(
      question
    );

  const normalizedAlias =
    normalizeAssistantText(
      alias
    );

  if (
    !normalizedQuestion ||
    !normalizedAlias
  ) {
    return null;
  }

  const questionWords =
    normalizedQuestion
      .split(" ")
      .filter(Boolean);

  const aliasWords =
    normalizedAlias
      .split(" ")
      .filter(Boolean);

  if (
    ` ${normalizedQuestion} `.includes(
      ` ${normalizedAlias} `
    )
  ) {
    return (
      1000 +
      aliasWords.length * 100
    );
  }

  if (
    aliasWords.length >
    questionWords.length
  ) {
    return null;
  }

  let best:
    | number
    | null = null;

  for (
    let start = 0;
    start <=
      questionWords.length -
        aliasWords.length;
    start++
  ) {
    const window =
      questionWords.slice(
        start,
        start + aliasWords.length
      );

    let score = 0;
    let valid = true;

    for (
      let index = 0;
      index < aliasWords.length;
      index++
    ) {
      const wordScore =
        tokenScore(
          window[index],
          aliasWords[index]
        );

      if (wordScore == null) {
        valid = false;
        break;
      }

      score += wordScore;
    }

    if (!valid) continue;

    score +=
      aliasWords.length * 20;

    if (
      best == null ||
      score > best
    ) {
      best = score;
    }
  }

  return best;
}

export function resolveSubscriptionEntities(
  question: string,
  items: AssistantSubscriptionEntity[]
) {
  const resolved:
    ResolvedSubscriptionEntity[] = [];

  for (const item of items) {
    let best:
      | ResolvedSubscriptionEntity
      | null = null;

    for (
      const alias of serviceAliases(item)
    ) {
      const score =
        aliasScore(
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
          item,
          score,
          matchedAlias: alias
        };
      }
    }

    if (best) {
      resolved.push(best);
    }
  }

  return resolved.sort(
    (a, b) =>
      b.score - a.score
  );
}

export function resolveBestSubscriptionEntity(
  question: string,
  items: AssistantSubscriptionEntity[]
) {
  return (
    resolveSubscriptionEntities(
      question,
      items
    )[0]?.item
  );
}
