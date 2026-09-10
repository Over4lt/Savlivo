# Language / RTL / AI readiness — 10 September 2026 continuation

Before: 12 languages — en, no, sv, da, de, es, fr, it, pt, nl, fi, zh-CN.
After: **13**, adding **Japanese (`ja`)**. Existing language dictionaries and keys are preserved. Japanese has all 309 existing dictionary keys and matching interpolation placeholders; navigation/status/settings/speech-language maps and saved-language restoration were extended in the existing architecture. English remains the fallback for unresolved text. No country selects or resets language. Native Japanese proofreading and physical iPhone layout/speech checks remain required; automated completeness is not a translation-quality certificate.

Important missing UI languages: Korean, Turkish, Indonesian, Vietnamese, Romanian, Greek, Arabic, Hebrew; also Polish, Czech, Thai, Malay, Hindi and Traditional Chinese. No partial language-picker entries were added. Market support does not depend on these translations.

## Arabic / Hebrew

Neither is implemented or claimed production-ready. Existing mobile layout uses physical left/right margins and LTR row/chevron assumptions, without a complete language-driven I18nManager policy. Safe RTL work requires coordinated review of header/status, plan card, subscription rows, grouped picker, search/input, forms/modals, selectors, settings and PDF fonts/direction. It requires native-language review and physical iPhone testing, including direction changes without market changes. The relevant markets work in existing supported languages. No risky global forceRTL or partial RTL patch was introduced.

## Evidence-based Groq policy

Actual path remains Groq chat completions, strict structured output, default `openai/gpt-oss-20b`; the existing `GROQ_ASSISTANT_MODEL` override remains. No provider/model replacement.

[Groq's model documentation](https://console.groq.com/docs/model/openai/gpt-oss-20b) reports 75.7% MMMLU average and recommends target-language instructions. [OpenAI's MMMLU dataset](https://huggingface.co/datasets/openai/MMMLU) identifies its professionally translated evaluation locales. The conservative intersection of those locales with Savlivo's UI languages provides a defensible capability basis for **en, de, es, fr, it, pt, ja, zh-CN**. This is an inference from multilingual benchmark coverage, not a per-language production accuracy guarantee. English-only is no longer the policy.

**no, sv, da, nl, fi** intentionally fall back to English because this evidence does not establish those individual locales. Unknown, missing, malformed and unsupported tags also use English. A configured model other than the evaluated default falls back to English until explicitly assessed. Normalization permits common regional variants of approved languages; Traditional Chinese is not silently relabeled Simplified Chinese.

The centralized helper sets the response-language instruction and returned language metadata. Offline fallback prose is English and labeled English. Tests mock the model boundary; no live Groq output-quality evaluation was run. Native review of general answers, app help and structured actions remains desirable before release.

Language policy never writes preferences, changes country or creates a subscription. Portfolio scoping is independent and checked again at the remote boundary: valid selectable market → that market only; missing/malformed/unselectable market → no portfolio. General-purpose conversation and deterministic validation of model action candidates remain intact. No analytics instrumentation or raw-conversation audit storage was added.
