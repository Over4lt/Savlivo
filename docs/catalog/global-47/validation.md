> Historical first-audit validation. See [current continuation results](operation-validation.md); the counts below are not the current result.

# Validation — local uncommitted audit batch

Starting/final committed HEAD: `918838d058837ec252b8b89e4384196d44f450ad`. All implementation remains unstaged/uncommitted for review.

|Check actually run|Result|
|---|---|
|`node --import tsx --test apps/mobile/lib/global-catalog-audit.test.ts services/api/src/market-behavior.test.ts`|26 passed, 0 failed|
|`npm --workspace @savlivo/api test`|368 passed, 0 failed|
|`node --import tsx --test apps/mobile/lib/*.test.ts`|128 passed, 0 failed|
|Disposable local PostgreSQL 16 `storytel.integration.test.ts`|1 passed, 0 failed, not skipped|
|`npm --workspace @savlivo/api run typecheck`|Passed|
|`npx tsc --noEmit -p apps/mobile/tsconfig.json`|Passed|
|`npm --workspace @savlivo/api run build`|Passed, including compiled shared-contract ESM import rewrite|
|`CI=1 npx expo export --platform ios --output-dir /tmp/savlivo-global-ios-export` from apps/mobile|Passed, iOS Hermes `.hbc`, approximately 3.8 MB|
|`node --import tsx docs/catalog/global-47/build-scorecard.mjs`|Passed all exact baseline preservation assertions; generated final scorecard|
|`git diff --check`|Passed|

The API runner initially hit sandbox IPC restrictions; rerun with approved local permissions passed. The mobile package has no `typecheck` script: direct `tsc` was used. A new test initially needed the existing Node URL import convention; corrected and typecheck rerun. Local PostgreSQL initially hit sandbox loopback restrictions; approved execution used only the explicit disposable fixture URL on port 55439. No production connection, data or migration was involved.

The PostgreSQL fixture executes 016 twice, verifies every pre-existing service/subscription row unchanged, verifies one Storytel identity, and tests canonical Storytel add/edit/delete alongside preserved catalog and manual records. Old migration files are used only to initialize the newly-created disposable test database. The production migration runner was never run.

## Measured preservation

|Measure|Before|After|
|---|---:|---:|
|Selectable markets|30|30|
|Canonical services|43|44|
|Distinct offline service/plan names|107|112|
|Registry rows|364|369|
|Offline adapter results|757|762|
|Pre-existing management destinations checked|6300|6300 unchanged|

`baseline.json` stores exact initial metadata, currencies, registry and normalized offline outputs. `build-scorecard.mjs` compares every old row and every old catalog/billing entry, not just counts. `preservation.json` records results. Historical 2258c70 full-price hashes are still checked after excluding ONLY the new Storytel output; the new service has its own five-row proof test.

Existing full mobile suites include catalog/discovery, aliases, manual fallback/legacy compatibility, language-market independence, selected-market spending/report behavior, browser routing, status/reminders and header/plan-card regressions. Existing API suites include pricing adapters/resolver/persistence, wrong-country/currency handling, source outage, multilingual assistant actions and entitlement-adjacent subscription contracts. No full external live price refresh or performance benchmark is claimed.

The new currency test covers JPY/KRW/VND/KWD/CLP/COP at one stored hundredth, fractional values and large nominal values, matching current Intl formatting without FX. Genuine thousandths remain unsupported and Kuwait stays inactive. Saved unavailable/manual identities remain visible under their own stored country. Equal EUR currency never joins French and German portfolios.

Actual remote server context selection is executed in a test with missing, malformed and explicit selected-market inputs. General assistant code is unchanged; no-market context receives no private portfolio. This closes the prior all-market fallback rather than guessing a country.

## Physical iPhone acceptance still required

1. Confirm the existing enlarged header and noninteractive plan badge, full plan-card tap, and existing plan flow.
2. Browse NO: static localized category headings, Storytel among Books & Audiobooks, existing services retained; no horizontal category controls.
3. Search `ne`, `netf`, aliases and Chinese names; direct name prefixes first, foreign results show availability warning.
4. Add an unknown manual subscription, cancel once and save once; no Netflix/default identity. Edit an existing manual record.
5. After separately approved 016 deployment, add Storytel NO with each regular plan; verify user-selected route/renewal date and displayed NOK. Changing service/route clears stale fields.
6. Switch SE/NO/FR/DE and app language independently. Saved records, totals, AI context and PDF stay country-scoped; unavailable new-addition Storytel in SE must not hide an existing saved SE record.
7. Open Storytel instructions and existing Netflix/Spotify provider/store flows; return without automatic status changes. The approved Norwegian instruction is unchanged.
8. Verify localized money display and PDF on narrow screens; no claim of KWD thousandth input support.

No real-device, production backend, production migration, admin, analytics, App Store, build-number, deployment or release action was performed.
