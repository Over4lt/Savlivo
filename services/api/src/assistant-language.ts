// Conservative product policy: Groq reports MMMLU performance for this model.
// The approved existing UI languages below intersect OpenAI's MMMLU locales.
// This is evidence of capability, not a per-language quality guarantee.
// Sources and remaining evaluation requirements: docs/catalog/global-47/language-readiness.md.
export const defaultAssistantModel = "openai/gpt-oss-20b";
const languageNames = {en:"English",ja:"Japanese",de:"German",es:"Spanish",fr:"French",it:"Italian",pt:"Portuguese","zh-CN":"Simplified Chinese"} as const;
export type AssistantResponseLanguage = keyof typeof languageNames;
export const aiLanguageAllowlist: readonly AssistantResponseLanguage[] = Object.keys(languageNames) as AssistantResponseLanguage[];
export function assistantResponseLanguage(value: unknown, model = defaultAssistantModel): AssistantResponseLanguage {
  if (model !== defaultAssistantModel || typeof value !== "string" || value.length > 16) return "en";
  const tag = value.trim();
  if (!/^[a-z]{2}(?:-[a-z]{2})?$/i.test(tag)) return "en";
  if (/^zh(?:-CN)?$/i.test(tag)) return "zh-CN";
  const base = tag.split("-")[0].toLowerCase();
  return Object.hasOwn(languageNames, base) ? base as AssistantResponseLanguage : "en";
}
export function assistantLanguageInstruction(value: unknown, model = defaultAssistantModel): string {
  const language = assistantResponseLanguage(value, model);
  return `Response language policy: write the answer in ${languageNames[language]} (${language}). Set the JSON language field to "${language}". Interpret input in any language, but do not infer market or change app preferences. This applies even when the latest message or history uses another language.`;
}
