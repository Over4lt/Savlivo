# Local release review and Netflix Norway browser pilot

Checkpoint: 36d480f. Reviewed HEAD before pilot: 4435b78. Date: 2026-09-08. Local review only; no release or production operation.

## Individual and combined commit review

| Commit | Review |
|---|---|
| 4b3dc43 | GB Google feed recovery runs existing route first and only fills missing Storage 100/200 GB plans; direct billing retained. |
| 5d4d219 | Discovery only after original pinned routes; newer filenames, same-origin assets, bounded requests, explicit feed country/currency validation; pinned fallback and Norway independence retained. |
| 2362cb9 | iCloud support table needs unique named country/ISO currency section and complete five-tier monthly pricing; existing storefront paths unchanged; failures resolve remaining candidates. |
| 3aa7111 | GB/AU/NZ Music additions require matching canonical and locale plus currency-specific monthly gallery evidence; original markets retain their paths. |
| 766d75d | GB/AU/NZ/Belgium TV paths use country/currency/locale checks; standalone TV price parsing excludes competing offers; registry remains available. |
| 937e384 | Shared mappings preserve all prior entries; country filtering matches legacy mobile semantics; remote AI and PDF use selected-market scope; creation retains normalization behavior. |
| a4a0e6b | GB/AU/NZ have bounded catalog, 37 registry rows, stale-country response guard and Metro visibility for shared contracts; no saved-subscription migration. |
| 4558028 | CH/PL/BR/CZ add 52 registry rows and currency-specific Apple paths; original market rules and billing routes unchanged. |
| 4435b78 | MY adds 13 rows; TV accepts exactly one standalone card, avoiding Music Student ambiguity; no changes to earlier markets. |

No reproducible regression requiring a production correction was found in this series. This is a scoped code/automated review, not a claim that remote provider pages can never change.

## Checkpoint comparison

Executed both the checkpoint adapter module and current adapter module with fetch forced to fail, across all 61 API country/currency mappings. All **577 baseline offline rows** remain, matching service, plan, country, currency, amount and billing route. All **184 original registry rows** are deep-equal, including source URLs and explicit routes.

AST declaration comparison confirms resolvePriceCandidates, Google One feed/country/structured parsers and Apple TV Norway parser are byte-identical to checkpoint. pricing-store.ts, repositories.ts, notification-logic.ts, billing.ts, package-lock.json, root/mobile app.json and IAP/release settings have no series diff. pricing.ts only moves its exact country map to shared contracts; merge/persistence behavior is unchanged. Google discovery is additive and never used by NO/NOK's established path.

All 23 markets remain: US NO SE DK DE ES FR IT PT NL BE AT IE FI CN GB AU NZ CH PL BR CZ MY. New regression coverage checks the exact selector list, currency formatting, repeated account filtering, offline price identity and each bounded launch service. Prior tests cover saved-country creation/editing, account separation, Norway legacy inference, late-country responses, persisted-price recovery, annual/ambiguous evidence rejection, provider failures, savings and reminders.

Mobile selection changes only active view and currency. Saved subscriptions are not deleted. AI context and reports consume the same selected-market helper; legacy NOK subscriptions remain visible, shared EUR does not infer a country. Existing reminder timezone remains user-controlled. The small Metro watch-folder addition preserves Expo defaults. API build layout emits shared contracts at the path used by compiled imports.

## Known limits

Registry snapshots may become stale. Provider HTML/component changes may reject live prices and use fallback. No new fallback is removed to accommodate parser failures. HUF/JPY/KRW/VND remain deferred from expansion; all currently selectable currencies retain two fraction digits in the local runtime. English UI is unchanged.

Database tests use mocked pool calls; no production/development database was written. Native device flows, visual PDF rendering and actual Netflix sign-in/cancellation require physical-device acceptance. No automatic Netflix action will be added.

## Netflix Norway pilot

Uses existing expo-web-browser 15.0.11 (Expo SDK 54 recommended version, already present in ios/Podfile.lock). API: openBrowserAsync with PAGE_SHEET and dismissButtonStyle done; iOS uses SFSafariViewController. No WebView, authentication callback, JavaScript injection, cookie/session access or dependency change. See [SDK 54 documentation](https://docs.expo.dev/versions/v54.0.0/sdk/webbrowser/).

Scope: subscription action-sheet navigation only; iOS, selected NO, saved Netflix subscription belonging to NO (including established legacy NOK inference), explicit direct billing, and exact existing https://www.netflix.com/cancelplan or https://www.netflix.com/account destination. Country selection alone cannot reclassify a foreign subscription. Android/web, other services/markets/billing routes, backend fallback and AI-guided navigation keep their existing openers. providerRouting.ts and all management URL definitions are unchanged.

The action sheet's iOS onDismiss event is awaited before presenting Safari, avoiding presentation from a dismissing native modal. The existing screen/market stays mounted. Safari cancel/dismiss means only that the browser closed. The existing "What changed at the provider?" prompt is then shown; only explicit user choices invoke the existing status PATCH. "No change" performs no update. No new cancellation state machine or prompt UI was introduced.

Missing native capability, thrown presentation errors or unrecognized/locked native results fall back to the existing Linking-based opener with the identical URL. An external open failure retains the existing backend fallback/error handling. Webpage/network errors inside an already-open browser are not inspected or automatically retried externally; users can close it and choose No change. Safari sheet cookies are separate from ordinary Safari, so Netflix may require sign-in. No authenticated Netflix session or physical device was tested; no cancellation was performed. The help center confirms user-driven account cancellation and partner-billing separation, but this review does not prove authenticated navigation in a system sheet: https://help.netflix.com/en/node/407.

## Final verification

- Full API tests: 239 passed, zero failed/skipped.
- Full mobile library tests: 83 passed, zero failed/skipped, including all 11 pilot cases.
- API/mobile typechecks and API build: passed.
- Compiled API pricing import: passed, resolving emitted shared contracts.
- Production iOS JavaScript/Hermes export: passed, 1,287 modules, 82 assets, 3.63 MB, output only /tmp/savlivo-netflix-pilot-ios. This is not a native build/upload.
- Explicit Norway outage check: 55 rows remain. Netflix registry Basic/Standard/Premium remain NOK 119/149/219 on direct billing. Norway Google/Apple parser regressions, legacy scoping and Oslo reminder tests pass in the full suite.
- Checkpoint comparison: 184 registry rows unchanged; all 577 baseline offline rows preserved. All 23 current market identities/catalogs pass.
- No root/mobile app configuration, IAP ID, build number, pricing production code, push, deployment or merge changes in this review/pilot. The unrelated .htaccess remains untracked and untouched.

## Physical iPhone acceptance

1. Use a development app loading this local checkout. The previously uploaded Build 12 does not contain this pilot; no new binary was created here.
2. Select Norway and open a directly billed Netflix subscription. Note its status, amount and selected market.
3. Tap Cancel and confirm Savlivo's action sheet. It should disappear before a system Safari sheet opens the existing cancelplan destination. Verify the Netflix domain. For browser-only validation, stop before Netflix's final cancellation confirmation.
4. Try sign-in/normal navigation if desired, then tap Done. Confirm return to the same Savlivo context and its existing result prompt. Choose No change; verify status, amount and savings are unchanged.
5. Repeat opening/closing, including swipe dismissal if offered, and background/foreground once. Verify no stuck modal or duplicate browser. Test the account/reactivation destination on an appropriate saved record without changing Netflix state.
6. Compare Netflix in another market, Spotify in Norway and Apple/Google-billed Netflix records: they must retain their prior external/system management behavior. Switch back to Norway and verify all saved records remain.
7. Try opening with connectivity disabled: a browser page error must not mark the subscription cancelled; close and choose No change. Native-open failure fallback is covered by mocks, not physically reproduced.
8. Only if intentionally testing a real provider change, complete it yourself in Netflix, then explicitly record the correct outcome/effective date in Savlivo. Closing the browser alone must never record that change.
