# Build 13 polish review

Starting revision: `41b1255` on `build10-final`. The preceding commits `494d211`
and `41b1255` already set Build 13; this task does not change either build setting.
Starting tracked worktree was clean, with only the unrelated untracked
`apps/web/.well-known/.htaccess`. That file was not read, edited, staged or removed.

## Findings and implementation

### Savlivo plan prices

The paywall used the four StoreKit `displayPrice` strings fetched at startup.
They describe the App Store storefront, which can differ from the selected
subscription market. Changing Savlivo's market did not change those strings.
There was no existing selected-market Savlivo plan price table in this path.

The small mobile display configuration now contains **only the explicitly supplied
release-review prices**:

| Market | Currency | Manual monthly / annual | Premium monthly / annual |
|---|---|---|---|
| US | USD | 1.99 / 19.99 | 3.99 / 29.99 |
| NO | NOK | 29 / 249 | 49 / 399 |

These are configured display prices, not freshly verified StoreKit quotes. They
are stored in Savlivo hundredths without conversion. The UI identifies configured
market pricing and separately displays the fetched App Store quote when present,
explaining that the App Store confirms the final purchase price. In other markets,
the existing StoreKit quote remains available and is labelled **App Store price**;
it is not relabelled as a local-market quote. Without either source, price remains
unavailable. StoreKit failure cannot remove configured US/NO prices.

`billing.ts`, product IDs, purchase callbacks, entitlement checks and backend billing
are unchanged. Premium annual remains `com.thomashodne.savlivo.premium.annual`.

### Catalog and manual subscriptions

Default browse previously used a 12-result relevance limit. The new browse helper
derives every available service from the existing canonical catalog, regardless of
whether every plan/route has an automatic price. Default browsing groups services
by their first canonical category, with each service appearing once. Category
filters also find secondary category membership. No availability list, plan,
billing option, price or management destination was added or inferred.

Search still uses the shared bounded alias matcher (30 results), including explicit
foreign matches with the existing unverified-local-availability notice. The manual
entry button is now before the results so it is visible when opening or searching
the picker. Existing manual initialization, optional plan, actual amount, billing
selection and renewal-date behavior are preserved. Nothing is saved until Save.

### Localization and independent preferences

The original dictionary had 123 Norwegian keys and 121 keys in each other
non-English language. Many UI strings bypassed it, dynamic sentences were built
in English, and the initial AI message permanently stored English display text.

The same dictionary/English-key fallback architecture now lives in
`apps/mobile/lib/ui-localization.ts`, outside the component so it is directly
testable and not rebuilt on each render. All **1,333 original values** are preserved.
Each of the 11 non-English languages now has **307 keys**. English remains the
fallback. Parameterized templates preserve user-entered service names verbatim;
replacement values are not interpreted as new templates.

Coverage includes Settings, Home attention cards, Savings/Autopilot descriptions,
AI welcome/input/suggestions/voice controls, account/password UI and alerts,
onboarding, plan display, catalog/category/manual-entry hints, billing labels and
management confirmation copy. Provider/service/plan names and user/model text are
not translated as if they were UI keys. Missing future translations and unknown
backend diagnostic text retain the English/original fallback.

The AI welcome has an explicit UI key, translated at render time and when read
aloud. User and model replies remain untouched. UI-only keys are removed from the
history sent to the assistant. Static speech uses the app locale; the existing
language detection for conversational replies remains unchanged. Groq, general
conversation, structured-action validation and selected-market AI context are
unchanged. Existing offline conversational help can still contain English prose;
this is not a rewrite of the assistant or a claim that all generated answers have
been linguistically certified.

Both market selection and onboarding previously reset language to English when
it was not in that country's short language list. Those resets are removed. All
12 existing supported app languages are selectable in every market, while market
switching still clears stale drafts/requests and leaves saved subscriptions intact.

### Number/date presentation

Regional amounts previously used the device locale; renewal dates forced English.
UI numbers and dates now use the app locale. Report number/date presentation uses
that locale too, without changing report text, portfolio selection or amounts.
Currency still comes from the subscription/selected-market context, never from
language. The shared hundredths formatter, zero-decimal handling, stored values,
calculations and existing preview data are unchanged. No exchange rate was added.

## Validation

| Baseline | Before | After |
|---|---:|---:|
| Selectable markets / currency definitions | 30 | 30 |
| Catalog services | 43 | 43 |
| Distinct service/plan combinations | 107 | 107 |
| Verified registry rows | 364 | 364 |
| Offline adapter results | 757 | 757 |
| Historical management destinations checked | 6,300 | 6,300 |

Before edits, three existing baseline tests passed: exact country/currency and
registry/offline-output digests, catalog preservation and all 6,300 historical
management destinations. Afterward, the complete suites rechecked those same
baselines. A separate offline enumeration also returned 30/43/107/364/757.
All pricing/shared-market/catalog source files are unchanged.

- `node --import tsx --test apps/mobile/lib/build13-polish.test.ts`: **13 passed**.
- `node --import tsx --test apps/mobile/lib/*.test.ts`: **121 passed**, zero failures.
- `npm --workspace @savlivo/api test`: **364 passed**, zero failures. The sandbox
  initially blocked tsx's local IPC socket; the authorized rerun passed.
- API `run typecheck` and mobile `tsc --noEmit -p apps/mobile/tsconfig.json`: passed.
- `npm --workspace @savlivo/api run build`: passed, including the shared ESM rewrite.
- `npx expo export --platform ios --output-dir /tmp/savlivo-polish-ios-final`:
  passed, production Hermes `.hbc` bundle, 3.8 MB.
- `git diff --check`: passed.

New regressions exercise all markets/categories, aliases and unknown services,
the actual manual-entry and market-switch handlers, dictionary/static JSX coverage,
Chinese fixed AI content, welcome initialization, actual paywall behavior during
StoreKit failure/storefront mismatch, and language-independent currency/precision.
Existing suites cover Build 12 manual transport aliases/edit preservation, pricing
fallbacks, Norway/Google One, AI candidates, browser routing, reminders and savings.
No database integration or physical-device run is claimed for this mobile-only change.

## Physical iPhone acceptance

1. With Simplified Chinese selected, inspect Settings, change-password validation,
   Home missing-data cards, Savings and AI welcome/placeholder/voice controls.
2. Switch NO → CN → US → NO without changing language. Verify subscriptions survive,
   visible amounts use each market's currency, and language remains Chinese.
3. Change language in each of those markets. Verify the market never changes, the
   welcome updates without changing chat history, and dates/numbers follow language.
4. Open Add service in NO: browse every local service under categories, including
   services without an automatic price. Test secondary categories and aliases.
5. Search an unknown name and add manually with an optional plan, actual amount,
   billing route and renewal date. Cancel once, then save/edit/delete a separate
   test record. Verify no Netflix label or invented provider management appears.
6. Check monthly/annual US and NO plan prices. Use a mismatched App Store storefront
   if available: configured price and StoreKit quote must remain distinguishable.
   Review Apple's confirmation sheet without completing an unwanted purchase.
7. Ask AI a general question and request a subscription action. Confirm normal
   deterministic validation and user review remain; inspect the Chinese static
   welcome's spoken voice. Conversational speech behavior was not broadened.
8. Recheck Netflix/Spotify system-browser flow and return confirmation. The approved
   Norwegian instruction stays exactly as previously accepted; close alone changes
   no status. Verify selected-market PDF amounts and renewal reminders.
9. Review long translations, keyboard/scroll behavior, category headers and VoiceOver
   on the device. Native-speaker wording review is still advisable.

No push, deploy, merge, migration, dependency change, release upload or build/version
change belongs to this work. Analytics/admin activation, root `app.json`, migrations,
deployment settings and IAP configuration remain untouched.
