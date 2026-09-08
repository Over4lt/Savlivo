import {
  assistantMatchScore
} from "./ai-intent";

import { helpEntries, type SavlivoHelpTopic } from "../../../packages/contracts/src/app-help";
export type { SavlivoHelpTopic } from "../../../packages/contracts/src/app-help";

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
    "I can help you understand and use Savlivo, including Home, Subscriptions, " +
    "Savings, Autopilot, plans, subscription markets, reports, renewal dates, " +
    "spending, billing routes, statuses, Settings, passwords, privacy and notifications. " +
    "Ask what you want to do, what something means, or why something looks different."
  );
}
