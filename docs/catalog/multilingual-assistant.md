# Multilingual general assistant and safe Savlivo navigation

Local starting HEAD: `77356e0`, branch `build10-final`, ahead 16. Starting tree contained only unrelated untracked `apps/web/.well-known/.htaccess`. No analytics/admin work is included.

## Architecture audit

At the starting commit, `parseAddSubscriptionIntent` ran **before Groq** in both mobile `askSavlivo` and backend `askAssistant`. Its anchored patterns were `please add`, `add a subscription for`, `add`, `legg til`, `jeg har`, and `i have`. Billing extraction recognized English/Norwegian through/via phrases. Canonical aliases and capitalization/spacing normalization were already shared, not tied to country. French/German/Spanish/etc could be understood by Groq conversationally, but the model response schema did not contain an Add candidate, so understanding alone could not open the form.

Groq already used structured JSON output and a multilingual system instruction. Language hints were accepted by the endpoint, but mobile did not send one. Model text and parsed fields were returned with a type assertion rather than runtime validation. Existing model actions were PAUSE/CANCEL/REACTIVATE and screen navigation. Mobile normally called Groq only when local English-oriented help/intent handlers had no answer. The remote saved-subscription path selected the first fuzzy match. The offline action handler could select the highest-cost active subscription when no named match existed. Those are unsafe authorities for provider navigation.

`ai-app-help.ts` held descriptions of Home, Subscriptions, Savings, Autopilot, AI, Settings, plans, renewals, spending, recorded savings, reviewable spend, billing routes, status/effective dates, notifications, markets, appearance, data health, PDFs, password reset and privacy/data controls. Backend SYSTEM_PROMPT separately summarized some of the same behavior. Catalog/manual-service/AI-preference help was missing despite stable shared implementation.

Provider routing lives in `apps/mobile/src/providerRouting.ts`. Stored Apple/Google/Amazon/carrier billing is checked before direct metadata. Direct metadata may contain action-specific URLs or a general management entry point. Carrier routes without a known destination return null. The generic browser helper chooses system Safari versus external opening by URL capability. Normal status-action sheets dismiss before Safari presentation, show the approved Norwegian instruction, and ask the user to confirm the outcome/effective date afterward. The old AI guided-action button bypassed this experience by calling the external opener itself.

## Implementation

### General conversation and multilingual interpretation

Configured Groq is now the primary interpreter, before local phrase routing. Its optional `actionCandidate` describes ADD or MANAGEMENT, a service query, optional user-stated plan/billing query and management action. It contains no price, URL, credentials or country authority. Ordinary knowledge/writing/conversation receives a normal model response with no candidate. System instructions explicitly retain general-purpose behavior and reject action routing for quoted, hypothetical or negated requests. No web-search tool was added; the assistant must not claim live external verification.

The model boundary is injectable in tests. `parseAssistantResponse` validates the response envelope and converts candidates into the shared transport contract. Unrecognized intents/navigation targets are neutralized; malformed candidates do not discard otherwise valid conversational answers. One legacy model status candidate can still be normalized through the same validator. There is no direct subscription write path in the model adapter.

Mobile sends the existing selected language as a hint, while the latest message determines response language. Language never chooses the subscription market. Market/currency are bound from current application context, not copied from model fields. Mobile validates again before opening any form or management path.

The old English/Norwegian Add parser remains **only for unavailable-model/network fallback**. It is not the configured model's language gate. Ordinary unknown `I have…`/`Jeg har…` statements such as “I have a cold” no longer become manual subscriptions. Offline fuzzy management opens Subscriptions for explicit record selection; it no longer chooses the first/highest-cost bill. Existing local financial calculations and preference handlers remain available where they understand the original request; unsupported phrasing can retain the model's answer. Their complete multilingual preference-editing semantics are not claimed.

### One help/catalog source

Existing help entries were moved to `packages/contracts/src/app-help.ts`. Mobile retains its matching wrapper and uses the same entries that the backend supplies to Groq. Added help describes catalog search, true manual records, unknown/zero bundle-price limits and recommendation preferences. The AI description now explicitly includes general questions/writing. Backend help summaries were replaced by shared help context rather than maintained as another behavior table.

Canonical service names, aliases, billing choices and availability are supplied from `catalog.ts`; selectable markets/currencies come from the existing market contract. No independent AI plan/price/service list was created. User-requested plans still resolve only through current matching verified pricing at the existing Add handoff. Manual records remain clearly non-catalog. No migration or storage change was made.

### Management navigation

`resolveSavedManagement` matches exact saved names, canonical slugs and approved aliases within selected-market account records. It never trusts a model URL, billing override or subscription ID to disambiguate records. Multiple matches require selection in Subscriptions; unknown matches do not fabricate records. Unknown stored billing values are rejected. Manual records match their actual saved names, not the generic `manual` discriminator.

The existing route resolver accepts three additional navigation intents (MANAGE, CHANGE_PLAN, BILLING), which use its existing general destination. No URL literal or old route behavior was changed. Saved country and billing determine routing. AI status-action buttons now use the normal action sheet, system-browser capability helper and explicit post-return status confirmation. The saved record is rechecked immediately before the guided button proceeds.

| Requested action | Result |
|---|---|
| Add/start/subscribe | Normal Add form; verified prefill where available, otherwise user selection/manual entry. No provider signup URL invented and no record until Save. |
| Manage | Existing general management destination after user confirmation, when present. |
| Change plan | Existing general management destination; user must locate/complete the provider option. No claim of an exact plan-change endpoint. |
| Billing/payment | Existing general management destination; no credentials/payment data handling. |
| Cancel | Existing action-specific cancel URL if present, otherwise existing general route; normal result confirmation afterward. |
| Pause | Existing supported pause flow when declared. Otherwise only general management navigation, clearly conditional on provider options; no asserted pause capability. |
| Renew/reactivate | Existing reactivation/general route. Inactive bills use normal explicit status confirmation. Already-active bills may inspect provider options without an automatic status change. |
| Missing route/carrier/ambiguous bill | No guessed URL or record; explain and direct the user to select/manage explicitly. |

Generic manage/change/payment browsing performs no status update on return. The user can edit their saved record through the normal form. The exact approved Norwegian Safari instruction remains unchanged. The existing external fallback remains. No browser cookies, page scripting, account automation or provider completion inference is introduced.

## Verification

- **29 focused API model-boundary tests**: 18 Add language fixtures, six management-language fixtures and five validation/general/help cases.
- **6 focused mobile management tests**: actual routing module with only React Native Linking mocked, all 6,300 baseline destinations, direct/store/general routes, ambiguity, manual records, browser-return and stale-generation safety.
- Full API suite: **334 passed**.
- Full mobile suite: **107 passed**, including existing catalog/discovery, app-help, preferences, browser, renewal/status/savings-related unit coverage.
- API TypeScript: passed. Mobile TypeScript: passed. A test-only Node-versus-DOM URL typing conflict was corrected with an explicit Node URL import.
- API build: passed. Production iOS Hermes export: passed, **3.66 MB**.
- Existing digest regressions preserve **30 markets, 43 catalog services, 107 service/plan combinations, all 364 registry rows and all 757 offline pricing results**. All **6,300 baseline management destinations** were compared in the new automated routing test.
- No pricing adapters/resolver/store, currency definitions, entitlement logic, PDF generator, reminders/status/savings persistence, IAPs, migrations or generic browser helper changed. Real PostgreSQL integration suites were not rerun in this task because those implementations are unchanged; their prior results are historical, not claimed as new executions.

Language fixtures: Norwegian, English, Swedish, Danish, German, French, Spanish, Italian, Portuguese, Dutch, Polish, Czech, Finnish, Simplified Chinese, Thai, Malay, Hindi and Traditional Chinese. Management fixtures use Norwegian, German, French, Spanish, Portuguese and Traditional Chinese. All deterministic fixture routes passed. **These are mocked model-boundary tests, not proof of live Groq understanding for every phrase. No live Groq or physical-device language acceptance was performed.**

## Remaining acceptance and release prerequisites

1. With the configured backend/model, ask ordinary knowledge and writing questions in several languages. Verify normal conversation and no form/navigation.
2. In Norway, ask Spanish/French/German/Chinese Add requests for Spotify/Netflix and “Start Viaplay”. Check selected market remains NO and ambiguous plans remain blank.
3. Test Viaplay Film & Serier with its actual Norway registry snapshot and store-route mismatch; no direct price may carry into Apple.
4. Ask for an unknown service. Confirm manual form, empty unverified fields, Cancel/back creates nothing and only Save creates a record.
5. Test direct Netflix cancel, Apple-billed service management, Spotify pause fallback, plan change, payment management and renewal of an active/inactive bill. Confirm correct stored-route destination and browser return behavior.
6. Create two same-service bills in the selected market: AI must ask for explicit selection, not choose an ID. Switch market and repeat; language must not move the account view.
7. Change market/open another form while Groq is pending, and edit/delete the target before pressing its guided button. Stale routes must not proceed.
8. Verify native Alert-to-Safari presentation and the existing Norwegian instruction on physical iPhone. General navigation must not change status; status flows require explicit outcome/date confirmation.

Live model accuracy, arbitrary multilingual phrasing, provider-site changes and native presentation remain acceptance risks. Existing metadata destinations are reused, not freshly recertified provider functionality. No new signup, carrier-specific route or exact plan/payment endpoint is claimed. Larger shared help/catalog context increases model input size; no new vendor/dependency or model upgrade was added.

Existing migration prerequisites `011_add_viaplay.sql` and `012_manual_subscriptions.sql` remain pending unless separately deployed. This task runs no production migration/deploy/push/merge, changes no build/version, and does not start analytics/admin or Build 13 release work.
