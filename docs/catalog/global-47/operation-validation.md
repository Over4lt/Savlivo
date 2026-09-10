# Continuation validation — 10 September 2026

Catalog validation baseline: `918838d058837ec252b8b89e4384196d44f450ad`, branch `build10-final`. At validation time the catalog work was uncommitted and unstaged. The repository later received the separate Analytics v2 commit `df5f78f`; no production catalog access, migration or deployment was performed here. Protected .htaccess and bilder/ were not read or changed.

## Final successful commands

|Command (repository root unless noted)|Result|
|---|---|
|`node --import tsx --test services/api/src/assistant-actions.test.ts apps/mobile/lib/global-catalog-audit.test.ts services/api/src/market-behavior.test.ts`|65 passed, 0 failed|
|`npm --workspace @savlivo/api test`|373 passed, 0 failed|
|`node --import tsx --test apps/mobile/lib/*.test.ts`|133 passed, 0 failed|
|`npm --workspace @savlivo/api run typecheck`|Passed|
|`npx tsc --noEmit -p apps/mobile/tsconfig.json`|Passed|
|`npm --workspace @savlivo/api run build`|Passed; compiled-only ESM import rewrite updated five files|
|From apps/mobile: `CI=1 npx expo export --platform ios --output-dir /tmp/savlivo-continuation-ios-export`|Passed; production Hermes .hbc 3.82 MB|
|`SAVLIVO_DISPOSABLE_DB_TEST=1 DATABASE_URL=postgresql://postgres@127.0.0.1:55439/savlivo_test node --import tsx --test services/api/src/storytel.integration.test.ts`|1 passed, 0 failed; 016/017/018 each twice; preserved rows; Storytel and availability-only canonical subscriptions; manual create/legacy-compatible edit/delete in every new market|
|`node --import tsx docs/catalog/global-47/build-scorecard.mjs`|Passed; 47 audit rows, 46 selectable, 78 services, 465 registry rows, 858 offline results, 140 distinct service/plan names|
|`git diff --check`|Passed|

Tests used a newly created disposable postgres:16-alpine container on localhost:55439, with an exact URL guard and synthetic fixtures. It was stopped afterward. The unrelated existing Docker database was not used. No production 011–015 rerun. Migration runner registration includes 018 after 017; operators must determine pending migrations separately, not blindly rerun production history.

## Earlier runs and corrections

- AI-only boundary: 31 passed. Catalog/mobile focused rerun: 49 passed. Language/AI focused: 45 passed. Expanded catalog/currency/pricing: 34 passed. Final combined focused: 65 passed.
- Initial expected old counts/market lists failed after additive expansion. Updated fixtures explicitly enumerate new markets/currencies/services; baseline preservation assertions remain.
- API registry tests exposed outdated country fixtures and a uniqueness key missing billing route. Corrected to country/service/plan/billing identity; independently tested DMM direct 55000, Apple 65000 and Google Play 65000 stored hundredths.
- One API runner invocation was sandbox-blocked on its IPC socket before tests; authorized retry passed.
- Initial new manual-edit integration fixture omitted both modern custom name and legacy compatibility mapping. Corrected it to invoke actual subscriptionForClient/subscriptionEditIdentity, without changing repository/API behavior; clean disposable rerun passed.
- Japanese completeness fixture initially assumed a separate English dictionary. Existing architecture uses English keys as fallback; corrected to compare all 309 Norwegian key identities and English-key interpolation placeholders. A TypeScript literal-country comparison was corrected to use string comparison for excluded KW.
- Adding evidenced Apple Arcade availability exposed an old India explicit-result list; extended that fixture only. Final mobile run passes all 133 tests.

## Preservation evidence

Both original committed 43/364/757 and continuation 48/371/764 snapshots are preserved as subsets, with exact old registry and offline price identity/amount/source checks. Current counts: 78/465/858. Existing catalog metadata and billing choices remain identical except additive launch-country lists. All original offered services and currencies remain. New source failure tests never remove old output. Original 6300 management destinations have explicit mobile regression coverage. Unknown/manual services receive no fake canonical identity or management route.

Full mobile/API suites include Build 12 manual dedup/edit compatibility, ownership/status, reminders/savings, selected-market PDF and shared-EUR isolation, price currency isolation, picker exact/prefix/alias ranking, manual fallback, header non-interactive status/full plan-card action and language/market independence. AI mocked-boundary tests exercise supported/fallback language alongside valid/missing/malformed market context. No live model output evaluation or physical device test was performed.

JPY/KRW/VND/CLP/COP retain integer hundredths and fractional display without 10x/100x changes. All 16 new market manual amounts round-trip in disposable PostgreSQL. KW is excluded; three-decimal KWD cannot be honestly represented by integer hundredths. No monetary migration or FX conversion.

## Remaining release work

1. Review the entire catalog diff and source evidence. These are launch catalogs, not exhaustive Tier 1/Tier 2 coverage; missing services and deferred candidates remain explicit in scorecards.
2. Apply only actually pending 016 → 017 → 018 under separately authorized production migration/deploy procedure. No migration has been executed in production here.
3. Recheck dated direct evidence at release, especially DStv's announced 17 September 2026 package transition, conflicting GAİN help and tax/commitment restrictions. Annual offers are evidence only, not monthly/12 output.
4. Native Japanese proofreading and physical iPhone language persistence, text wrapping, input and optional speech checks. Arabic/Hebrew RTL remains unimplemented; other missing languages remain unadvertised.
5. Physical market switch, selected-market totals/PDF/AI, known service/manual amount, unknown manual service, stale request cancellation, provider management return, header/plan-card and purchase/restore checks. AI per-language quality needs live evaluation; mocked tests establish routing/policy, not generated prose quality.
6. Expand unresolved local/global catalog gaps and direct pricing without weakening preserved fallback data. No claim of exhaustive market significance census or complete automatic price coverage.

Root app.json, dependencies, public/admin web, analytics activation, build number, purchase logic and `com.thomashodne.savlivo.premium.annual` are unchanged by this catalog work. At the time this validation was recorded, the catalog work was unstaged and uncommitted. Earlier validation.md and dated checkpoint describe earlier runs; this document is the current continuation result.
