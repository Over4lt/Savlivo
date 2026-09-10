# Web-management eligibility validation — 2026-09-10

Starting/final HEAD: `918838d058837ec252b8b89e4384196d44f450ad`, branch `build10-final`. Index empty. Work remains unstaged/uncommitted.

## Scope

This continuation changes only new catalog discovery eligibility and adds verified fallback web destinations. It does not expand services/markets, change registry/adapters, touch saved-record transport, or alter migrations. The earlier expansion remains in the same diff.

Current-task modified files (including modifications to previously untracked files):

- `packages/contracts/src/catalog.ts`: separate eligibility/classification helpers; filter search/prefill, retain availability/identity/price helpers.
- `packages/contracts/src/discovery.ts`: ineligible known AI Add → manual confirmation draft, no fabricated metadata.
- `apps/mobile/lib/catalog-browse.ts`: eligible browse filter.
- `apps/mobile/app/index.tsx`: new-add guard and unlocked choices; reuse localized neutral catalog-results label instead of claiming all available services. Locked edit identity unchanged.
- `apps/mobile/src/providerRouting.ts`: verified direct fallback only when existing routing profile is absent.
- `services/api/src/assistant.ts`: include eligibility independently from availability in model context; existing deterministic validator remains authoritative.
- `apps/mobile/lib/assistant-management.test.ts`: verified fallback/store isolation and saved excluded service routing.
- `apps/mobile/lib/build13-polish.test.ts`, `catalog.test.ts`, `discovery.test.ts`, `global-catalog-audit.test.ts`: update expectations for the deliberate new selection rule; preserve raw availability assertions and existing behavior tests.
- `docs/catalog/global-47/README.md`: distinguish current discovery counts from historical availability scorecard.

New files in this continuation:

- `packages/contracts/src/catalog-web-management.ts`: explicit provider/country web-flow evidence, no new service identities or price table.
- `apps/mobile/lib/catalog-management-eligibility.test.ts`: six focused contract/runtime tests.
- `docs/catalog/global-47/management-baseline.json`: exact pre-change catalog/billing/availability/registry/offline snapshot.
- `docs/catalog/global-47/build-management-audit.mjs`: deterministic offline preservation and report generator.
- `docs/catalog/global-47/management-eligibility.json`: all 3,588 classifications and evidence, 46-market metrics.
- `docs/catalog/global-47/management-eligibility.md`: readable evidence, exclusions and limitations.
- `docs/catalog/global-47/management-validation.md`: this report.

## Commands and final results

All commands run from repository root unless indicated. Test output logs are in `/tmp/savlivo-management-*`.

|Command|Result|
|---|---|
|`node --import tsx --test apps/mobile/lib/catalog-management-eligibility.test.ts`|6 passed, 0 failed|
|`node --import tsx --test apps/mobile/lib/catalog-management-eligibility.test.ts apps/mobile/lib/catalog.test.ts apps/mobile/lib/discovery.test.ts apps/mobile/lib/assistant-management.test.ts apps/mobile/lib/subscription-management-browser.test.ts`|41 passed, 0 failed|
|`npm --workspace @savlivo/api test`|373 passed, 0 failed, 0 skipped|
|`node --import tsx --test apps/mobile/lib/*.test.ts`|140 passed, 0 failed, 0 skipped|
|`npm --workspace @savlivo/api run typecheck`|passed|
|`npx tsc --noEmit -p apps/mobile/tsconfig.json`|passed|
|`npm --workspace @savlivo/api run build`|passed; compiled shared-contract ESM rewrite succeeded|
|`CI=1 npx expo export --platform ios --output-dir /tmp/savlivo-management-ios-export` (cwd `apps/mobile`)|passed; production Hermes `.hbc` export|
|`node --import tsx docs/catalog/global-47/build-management-audit.mjs`|passed; exact 78 identities, 46 markets, billing choices, 733 availability facts, 465 registry rows, 858 offline results preserved|
|`git diff --check`|passed|
|`git diff --cached --stat`|empty; nothing staged|

Initial mobile run: 124/133 passed, nine previous discovery expectations conflicted with the new requested rule. Updated those expectations to eligibility, while retaining availability/preservation checks separately. Final 140/140 passed. Initial mobile typecheck caught a Node-vs-DOM URL type in the new test; fixed with the existing `node:url` import pattern. Final typecheck passed. Initial API invocation hit sandbox tsx IPC EPERM; authorized retry passed. No dependency workaround or production access.

The API suite includes extracted Build 12 list/edit/manual-alias compatibility, mixed-list PDF inputs, selected-market AI/no-portfolio-on-invalid-market, pricing registry/resolver and notification tests. Mobile includes all 6,300 original management destinations, browser return non-mutation, manual entry, independent language/market switching, localized keys, IAP ID and header/plan-card tests. These are automated regressions, not a physical-device claim.

## Preservation and deployment boundaries

- No new migration. Existing uncommitted 016/017/018 preserved; no PostgreSQL test needed for this no-schema change, and none run in this continuation. No production migrations run.
- No price source/amount changed in this continuation. Protected pricing-adapters.ts still contains only the pre-existing expansion changes; exact offline and registry comparisons pass.
- No record is deleted or filtered out of saved reads. Legacy clients are not forced through a new API write gate. Updated discovery excludes review-required choices; manual entry remains possible.
- No website/admin, root app.json, dependency, IAP, build-number or deployment-config changes. `apps/web/.well-known/.htaccess` and `bilder/` remain unrelated and untouched.
- No stage, commit, push, deployment or production access.

## Remaining human/physical review

Review provider evidence and all review-required exclusions before release. This is a documentation-based flow review, not authenticated completion at every provider in every country. Retained verified price snapshots are not newly freshness-checked. Local prepaid/bundle/annual contracts may have narrower rules than the documented ordinary direct plan. Existing management routes remain untouched even when their service's new-add eligibility is unproven.

On a physical iPhone: verify eligible name/alias search; excluded provider → manual add; saved excluded record edit/delete/status; direct vs Apple/Google management navigation; close browser without inferred completion; market/language independence; selected-market AI and PDF; grouped picker and global plan/header polish. No physical tests performed here.

## Entire worktree diff (includes preserved earlier expansion; untracked files are not in diff --stat)

```
 apps/mobile/app/index.tsx                    |  39 ++--
 apps/mobile/lib/assistant-management.test.ts |  15 ++
 apps/mobile/lib/build13-polish.test.ts       |  16 +-
 apps/mobile/lib/catalog-browse.ts            |   6 +-
 apps/mobile/lib/catalog.test.ts              |  11 +-
 apps/mobile/lib/discovery.test.ts            |   6 +-
 apps/mobile/lib/ui-localization.ts           | 317 ++++++++++++++++++++++++++-
 apps/mobile/src/providerRouting.ts           |   4 +-
 packages/contracts/src/catalog.ts            | 125 ++++++++++-
 packages/contracts/src/discovery.ts          |   3 +
 packages/contracts/src/markets.ts            |  37 +++-
 services/api/src/assistant-actions.test.ts   |  28 +++
 services/api/src/assistant.ts                |  28 ++-
 services/api/src/market-behavior.test.ts     | 100 ++++++++-
 services/api/src/migrate-production.ts       |   3 +
 services/api/src/pricing-adapters.test.ts    |   2 +-
 services/api/src/pricing-adapters.ts         |  26 +++
 services/api/src/pricing-registry.test.ts    |   5 +-
 services/api/src/server.ts                   |   2 +-
 19 files changed, 703 insertions(+), 70 deletions(-)
```

## Entire git status

```
 M apps/mobile/app/index.tsx
 M apps/mobile/lib/assistant-management.test.ts
 M apps/mobile/lib/build13-polish.test.ts
 M apps/mobile/lib/catalog-browse.ts
 M apps/mobile/lib/catalog.test.ts
 M apps/mobile/lib/discovery.test.ts
 M apps/mobile/lib/ui-localization.ts
 M apps/mobile/src/providerRouting.ts
 M packages/contracts/src/catalog.ts
 M packages/contracts/src/discovery.ts
 M packages/contracts/src/markets.ts
 M services/api/src/assistant-actions.test.ts
 M services/api/src/assistant.ts
 M services/api/src/market-behavior.test.ts
 M services/api/src/migrate-production.ts
 M services/api/src/pricing-adapters.test.ts
 M services/api/src/pricing-adapters.ts
 M services/api/src/pricing-registry.test.ts
 M services/api/src/server.ts
?? apps/mobile/lib/catalog-management-eligibility.test.ts
?? apps/mobile/lib/global-catalog-audit.test.ts
?? apps/web/.well-known/.htaccess
?? bilder/
?? db/migrations/016_add_storytel.sql
?? db/migrations/017_add_available_catalog_services.sql
?? db/migrations/018_add_market_catalog_services.sql
?? docs/catalog/global-47/
?? packages/contracts/src/catalog-web-management.ts
?? services/api/src/assistant-language.ts
?? services/api/src/storytel.integration.test.ts
?? services/api/src/verified-expansion-prices.ts
```

## Tracked patches changed since this continuation began

- `apps/mobile/app/index.tsx`
- `apps/mobile/lib/assistant-management.test.ts`
- `apps/mobile/lib/build13-polish.test.ts`
- `apps/mobile/lib/catalog-browse.ts`
- `apps/mobile/lib/catalog.test.ts`
- `apps/mobile/lib/discovery.test.ts`
- `apps/mobile/src/providerRouting.ts`
- `packages/contracts/src/catalog.ts`
- `packages/contracts/src/discovery.ts`
- `services/api/src/assistant.ts`
