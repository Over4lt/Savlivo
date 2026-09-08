# Scalable Subscription Catalog & Discovery UX + AI Integration

Local implementation from `2258c70` on `build10-final`. No release or deployment is included.

## Starting state and end-to-end audit

Starting tree: only unrelated untracked `apps/web/.well-known/.htaccess`. Reviewed `2258c70`, `ed55e2f`, the preceding catalog README and shared catalog. Baseline: 30 markets, 43 services, 107 service/plan combinations, 364 registry rows, 757 offline adapter results; API 302/mobile 91 tests. `baseline-2258c70.json` records per-market registry and normalized offline-output digests (volatile update timestamps excluded), currencies, availability and billing digest. Pricing files and market definitions have no production changes in this task.

Previously Add opened a category-grouped list, required both market availability and a local price, and hid already-tracked services. Selecting a known slug opened the normal form, selected its existing default billing route, and filled a plan/price only when there was one local row. Plan chips and manually editable amount/plan/date fields used `regionalPlanOptions` and `syncPlanAndPrice`. The latter runs on explicit selection, not asynchronously when a price response arrives. Pricing snapshots already reject responses from another active country/currency. Service/billing transitions already clear stale plan and price.

Save uses the authenticated POST/PATCH subscription endpoints. Existing known-service inserts require a seeded services FK and billing FK. Edits retain the saved currency; selected-market filtering, AI context, report scope, savings and reminder scheduling already operate separately from account identity. Previously no arbitrary unknown-service record could be inserted.

AI combines local intent handling with a remote structured assistant response. Existing action/navigation fields handle saved-subscription management; they do not create subscriptions. The new add intent is separate from cancellation/pause/reactivation, and has no write callback. No subscription POST is called from AI handling.

## Catalog UX

The existing picker now starts with search, shared categories and a bounded result list. Search is case/spacing/approved-alias aware and requires an explicit result tap. Empty search shows up to 12 market-eligible services alphabetically; this is explicitly **unranked availability-based relevance**, not popularity or adoption evidence. `catalogDiscoveryPolicy` holds limits/provenance outside UI. Category/search results are capped at 30, below the shared helper's hard maximum of 50. Narrowing a query finds the complete catalog, including entries outside the current availability policy. Those entries show a local-availability warning and do not receive invented prices. Actual verified country/currency/route rows remain the only source of automatic prices.

Already-tracked services remain visible with a warning rather than disappearing from search. A user can intentionally record another bill; there is no new global uniqueness constraint. A synchronous save guard prevents repeated taps while a request is in flight. API retry idempotency is not added; after an uncertain network outcome, check the list before retrying.

Search uses one prebuilt normalized index and memoized UI results. Catalog identity lookup now uses a map rather than repeated linear lookups inside sorting. Only bounded rows/logos render; there is no thousand-row ScrollView. Search still scans/sorts metadata, so this is not a benchmark claim for arbitrary catalog sizes. Profile real larger catalogs before adding server pagination/indexing.

Search clear, category selection state, result labels, multiline names, keyboard tap persistence/dismissal and iOS automatic keyboard insets are provided. The existing form and visual styling remain. Search itself is local and has no network loading state; prices can arrive later, without overwriting edited fields. Missing pricing retains manual entry. Physical keyboard/VoiceOver/large-text layout acceptance remains required.

## Real manual subscriptions

`012_manual_subscriptions.sql` is additive: nullable `service_id`, optional `custom_service_name`, and an exactly-one-identity check. Existing known rows retain every original value. Unknown services never insert into the global services table and never obtain catalog pricing or guessed management URLs. API responses identify them with `serviceSlug: "manual"` and `customServiceName`; this is an explicit non-catalog discriminator, not a provider slug. The card also labels them Manual.

The same form accepts a user-supplied name (1–100 characters), optional plan (up to 100), positive monthly amount in stored hundredths, explicit billing selection and optional valid date. The selected market supplies currency. Names/plans reject control characters; stored amounts must fit the existing integer column. All five existing billing choices are user assertions for manual records, not claims that the provider supports them. No route is preselected for unknown services. Included/zero/unknown-effective-price bundles remain unsupported; do not enter a fabricated standalone price.

List/read, reminder joins and savings-event names accommodate the nullable FK. User ownership and saved market/currency remain unchanged during edits. Known-service insert/update SQL retains its prior route/price behavior. Canonical rows cannot masquerade as manual rows, and manual rows cannot silently become canonical through an edit. Deletion/status use existing confirmation paths.

**Deployment order:** apply existing `011_add_viaplay.sql`, then `012_manual_subscriptions.sql`, before deploying this backend/mobile combination. The new backend reads the new column, so migration-first ordering is required even for existing subscriptions. Both are listed in the current runner; neither was run against production. The new migration was executed twice in a disposable local PostgreSQL 16 database to prove idempotency and preservation.

## AI and shared candidate contract

`packages/contracts/src/discovery.ts` consumes `catalog.ts`; it contains no additional service/plan/price truth. `AddSubscriptionIntent` carries version, market/currency, user query, optional plan/route query and mandatory confirmation. It contains no trusted price or URL. Mobile revalidates every received candidate using its current pricing snapshot and canonical catalog. Extra model price/prefill fields are ignored; invalid contract/market/currency values are rejected.

The initial deterministic add recognizer supports explicit English/Norwegian patterns (`Add …`, `Legg til …`, `I have …`, `Jeg har …`). It is used by both mobile and backend and works without a model credential. General prose and other languages continue through the existing assistant; unrestricted multilingual add-intent extraction is **not claimed**. No free-form model-generated provider identity can bypass canonical resolution.

Known identities use exact aliases, with an explicitly stated plan suffix checked against actual matching plan names. “Spotify Premium” does not invent a mapping to Individual. “Jeg har Netflix” leaves the plan empty. “Viaplay Film & Serier” can fill the Norway direct registry plan if present in the current snapshot. User-stated Apple pricing is never filled from direct evidence. Unsupported or unrecognized stated billing routes stay blank rather than falling back to direct. When no route was stated for a known service, the existing form default is shown for review; it is not a claim about the user's actual bill.

Unknown queries open the manual form with the user's text as an editable name. Plan/amount/route stay empty. If the name includes a plan suffix the user can separate it; no unverified plan is invented. TV 2 Play is still an unimplemented catalog candidate, so it follows this manual path.

Both discovery paths open the normal Add form. AI never saves, deletes or changes status. The user must press Save; Cancel/back makes no creation request. Missing/ambiguous fields remain selectable/editable. Strong prefill requires exact country, configured currency, service, route and unambiguous plan/price evidence; weak/conflicting rows do not prefill.

Market changes close/clear drafts, leave saved subscriptions untouched, and invalidate pending AI results. A request epoch also prevents an older AI response from replacing a newer form, including an away-and-back country switch. Existing pricing response guards remain. No asynchronous response auto-fills a manually edited amount.

## Verification and limitations

- Full API: **305 passed** (including two new assistant/manual validation tests and the 364/757 baseline digest regression).
- Full mobile: **101 passed**, including **10 discovery tests**, existing six catalog tests and eleven browser tests.
- Disposable PostgreSQL migration/repository integration: **1 passed**, covering migration replay, old-row preservation, create/read/edit/delete, owner isolation, market/currency isolation, no global catalog insertion, reminder names and status/savings query compatibility.
- Existing SQL notification/status/savings integration: **12 passed** against the disposable database.
- API/mobile typechecks and API build passed. Production iOS Hermes export passed (3.65 MB bundle).
- A separate current-routing check preserved **6,300 baseline destinations** and verified Viaplay plus manual direct/carrier/Apple behavior.
- Pricing adapters/store/resolver, selected-market PDF generation, entitlement logic and browser routing were not changed. Generic Safari sheet behavior and the exact Norwegian instruction remain intact.

No device/VoiceOver/visual PDF acceptance is claimed. No production migration/deployment, push/merge, version/build/IAP/dependency change is part of this work. Older backend versions do not support these manual records; coordinate migration and backend rollout before enabling the new mobile flow. Zero/unknown-price bundles, full multilingual add extraction, server idempotency and measured thousand-entry search remain bounded follow-ups, not hidden completed work.

## Physical iPhone acceptance after review

1. Open Add: search is visible; test keyboard, clear, category scrolling, narrow/large-text layout and VoiceOver result labels.
2. Search Netflix and `HBO Max`; explicitly select a result; Cancel/back must create nothing.
3. Compare NO and IN suggestions. Search a service outside the selected market and check the warning and absence of invented local pricing.
4. Add a known plan with actual verified price. Change billing route and verify stale price/plan clears; enter the actual amount when unavailable.
5. After the approved migrations/backend rollout, add an unknown service with a custom name/plan/price/date and chosen route. Refresh/relaunch, edit it and verify the Manual label and saved values.
6. Switch countries repeatedly; existing subscriptions remain in their original markets. Check AI summaries and PDF selected-market scope.
7. Ask `Jeg har Netflix`, `Legg til Spotify Premium` and `Legg til Viaplay Film & Serier` in NO. Verify only safe fields are populated; nothing exists until Save.
8. Ask for an unknown service and an unsupported billing route. Verify manual fallback or blank route rather than invented data.
9. While AI/pricing is pending, change country or open another form. Old responses must not replace current selections.
10. Double-tap Save; verify one in-flight request. For any connection failure, refresh before retrying.
11. Test existing Netflix/Spotify Safari sheet instruction, close and normal confirmation; closing alone never changes status. Check Apple/store links and Viaplay help routing separately.
12. Verify manual reminder/date behavior and representative PDF output. No physical acceptance means no Build 13 readiness claim.
