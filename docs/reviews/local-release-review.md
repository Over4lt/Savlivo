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
