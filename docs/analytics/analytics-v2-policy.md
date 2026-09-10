# Analytics v2 — approved proportionate disclosure policy

Date: 2026-09-10. This supersedes the historical zero-inference reporting policy; it does not activate collection, establish a legal basis, amend public privacy copy or authorize deployment.

## Accepted reporting boundary

Exact global first-party aggregate counts, including one account, are allowed for authorized private admin use. The operator accepts limited inference such as Premium increasing from three to four. This is not a claim of anonymity. Individual analytics remain prohibited.

No names, emails, phones, user/account IDs, user lookup, portfolios, spending, raw AI/search text, query hashes, tokens, IP/geolocation, free-text dimensions, arbitrary metadata, user lists, exports or drill-downs may leave the reporting layer. Operational account identifiers remain inside server-side queries only. Raw pseudonymous signals remain personal/linkable data; finalized aggregates are not presumed anonymous.

Global filters are exactly `range=7d|30d|90d|12m`. Days end at the latest complete UTC day; 12m is twelve complete calendar months. No timestamps, duplicate parameters, exclusions or dimension combinations. Current cards are independent of range.

Segments are only `report=selected-markets|top-services&month=YYYY-MM`, from the last twelve complete UTC calendar months. No market/plan/service/platform cross-filter. A displayed cell needs ten distinct contributors, not ten events. Zero through nine use the same suppressed state, without percentages or an exact remainder. One additional smallest otherwise-visible service cell is suppressed whenever any cell is below threshold, including zero; ties use service slug order. This deliberately trades completeness for a conservative complementary rule. Fixed published monthly cells are not recomputed on repeated reads. No claim that threshold ten guarantees anonymity.

## Implementation and historical honesty

- `/v1/admin/overview` stays public catalog/provider coverage only, with its own market filter. It advertises whether v2 reporting is explicitly enabled.
- `/v1/admin/analytics?range=30d` returns current aggregate plan membership, bounded history buckets, allowed months, collection/schema state, and explicit unavailable reasons.
- `/v1/admin/analytics/segments?report=top-services&month=...` returns finalized safe cells, or unavailable. Selected markets currently returns unavailable; no country of residence or IP proxy is substituted.
- Both new reads pass unchanged production origin, passkey-backed session, server role, expiry and rate checks and mandatory `dashboard_read` audit before any data query. Missing audit denies access. Tokens remain browser memory-only, late responses cannot reopen a logged-out dashboard, response headers/CSP are unchanged.
- Current accounts exclude `deletion_scheduled_for IS NOT NULL`. A single SQL aggregate joins users to entitlements and uses **plan**, never effectivePlan. VIEWER is Preview. Invalid/missing plan contributes to an explicit unclassified count; percentages are unavailable in that state. Zero denominator yields null. Paid means MANUAL + PREMIUM membership, not receipts/revenue or an assertion that the store collected payment.
- One maintenance snapshot per UTC day records the **first real observation**, with its actual timestamp. It is not an end-of-day or midnight balance. Daily history uses that observation; monthly history uses only the final calendar day's observation. Missing last-day observation is a gap; no interpolation or carried-forward values. Stock counts are never summed.
- Daily flows are counts of accepted observations, summed for monthly views. Missing flow observations are unavailable, not fabricated zeros. Range sums are explicitly recorded best-effort counts, not complete population measures. Rates use captured AI outcomes only and may be biased by dropped observations.
- No operational current-state timestamp is used to reconstruct deleted accounts or past plans. No backfill.

## Metric feasibility and shipped scope

| Metric | Source / status |
|---|---|
| Current accounts, Preview/Manual/Premium, paid share | Existing-state, exact consistent global aggregate; available without 019 |
| Plan graph | Forward-only daily observed snapshots after separately enabled collection; missing days unavailable |
| New accounts | Forward-only confirmed createUser commit signal; recorded counts, not reconstructed historic acquisition |
| Plan transitions | Forward-only authoritative old/new plan at applyVerifiedPurchase; excludes no-op restore/retry; missing old state unknown, not Preview |
| Expiry / ended paid status | Unavailable: no authoritative expiry/downgrade persistence hook outside verified purchases; not inferred from expiry date or purchase-event count |
| DAU/WAU/MAU | Unavailable: no qualifying foreground instrumentation; never sum DAU for WAU/MAU |
| D7 / D30 retention | Unavailable: no qualifying return signal. Future definition below, no fabricated cohorts |
| Selected market activity | Unavailable: no qualifying foreground selected-view signal. No use of user default country, subscription country or geography |
| Canonical service popularity | Forward-only confirmed canonical add; distinct current contributor per service/month; manual branch excluded |
| No-result search | Existing enum-only client primitive can feed a global counter; current mobile does not emit it, so absence remains unavailable |
| AI | Forward-only chat route/model completion, route failure and specifically offline navigation fallback counters. No prompts, responses, errors, language or market dimensions copied |
| AI users / sessions | Unavailable; no inferred session definition or summed distinct counts |
| Push | Current exact count of registered enabled PUSH endpoint rows belonging to current accounts; no token/destination is selected. Permission/delivery remain unavailable. Query/schema failure returns unavailable, not zero |
| General technical errors | Unavailable; no general request/error logging introduced. AI route failures are the only implemented technical outcome counter |

Activity/retention/market activation later requires explicit, separately reviewed foreground instrumentation. One qualifying foreground observation/account/UTC day is enough; push/background refresh must not count. Selected market requires explicit current view, not location, and one account may contribute to multiple markets. These are not mutually exclusive geography counts.

Future retention: acquisition cohort is account creation UTC calendar week; D7/D30 means activity specifically on the seventh/thirtieth UTC calendar day after creation. Publish only fully matured cohorts and cohort size; never "ever returned". Distinct weekly/monthly activity needs actual retained actors across the whole period. No such metric is claimed by this implementation.

## Collection, queue and persistence

019 adds five tables; no applied migration is modified:

- `analytics_v2_actors`: random UUID, server-only unique user FK, deletion cascade. Separate from 013 actors so historical cleanup cannot erase v2 signals accidentally.
- `analytics_v2_signals`: random per-observation UUID (idempotency), actor FK, kind enum, optional canonical service FK, optional old/new plan enums, server observation time, expiry. No amount, market, platform, transaction ID, manual name or free text.
- `analytics_v2_snapshots`: day, actual observation timestamp, total/Preview/Manual/Premium/unclassified counts, expiry; count consistency constraints.
- `analytics_v2_flows`: day, closed metric enum, count, expiry. Signal insertion and counter increment are one SQL statement; duplicate signal UUID cannot increment twice.
- `analytics_v2_service_months`: month, whitelist-only released/suppressed service cells, finalization time, expiry. No actors, denominator, suppressed count or exact remainder. JSON is built server-side only; API projects only service/state/contributor count even from unexpected stored fields.

Raw signal retention must explicitly be **45 days**, aggregates **400 days** for this implementation. No permissive defaults. Collection's independent 128-item serial noncritical queue never rejects a customer action. Gates rechecked when writes execute; expired queue-day observations are discarded instead of revising a closed period. Delivery is best effort: process exit, timeout or full queue can lose events; there is no durable delivery SLA or financial accounting claim.

Only server-confirmed account creation, canonical additions, authoritative entitlement persistence, chat outcomes and the existing sanitized no-result event are wired. **No mobile instrumentation added.** Background/push activity and arbitrary client outcome submissions are not accepted as v2 signals.

Purchase observation: when collection is enabled only, an optional savepoint reads/locks the existing canonical entitlement with a 500ms lock timeout, restoring the caller's timeout. Missing/failed observation returns unknown. Existing purchase validation and entitlement upsert still decide the actual outcome. An observation failure rolls back only its savepoint; a queue/write failure cannot undo a committed purchase. No-op restore emits nothing; actual authoritative old/new changes emit after commit. No product IDs, payment logic or claims of store revenue changed. Cold/missing entitlements are not invented as Preview.

Service monthly release requires a snapshot before the month and one observation for every day of the month. Finalize only on days 2–10 of the following month, within raw retention; otherwise no retrospective reconstruction. Distinct contributors exclude pending-deletion accounts and deleted actor rows at finalization. Published cells are immutable on normal runtime reruns and not recalculated using later operational state. First partial activation month is unavailable. Daily presence proves sampling occurred, not uninterrupted process uptime; service counts remain best effort.

## Deletion and retention

Account hard deletion cascades v2 actor/signals. Pending deletion prevents new actor writes, excludes current cards and excludes monthly contributors not yet finalized. Durable aggregate counts already recorded are retained without actor lists; they cannot reliably be individually retracted and are not promised anonymous. This consequence needs privacy-policy review before activation. Raw expiry is excluded in finalization immediately, not just by cleanup; expired durable rows are excluded from reporting immediately.

Maintenance attempts v2 expiry even if snapshot/finalization fails. Cleanup is bounded to 5,000 rows/table/run plus orphan actor cleanup, independent of operational pricing. It runs when maintenance is enabled even if collection later stops. Operators must keep maintenance scheduled through final expiry. The existing 013 retention, admin audit/session/passkey cleanup and price observation remain independent.

## Explicit configuration — future operator action only

Existing exact production admin setup remains required, unchanged. New gates have **no default activation**:

- `ANALYTICS_V2_REPORTING_ENABLED=true`, `ANALYTICS_PRIVACY_REVIEWED=true`, `ANALYTICS_MAINTENANCE_ENABLED=true`: permit private aggregate reads only; not behavioral collection.
- For forward collection additionally require `ANALYTICS_V2_COLLECTION_ENABLED=true`, existing `ANALYTICS_COLLECTION_ENABLED=true`, `ANALYTICS_RAW_RETENTION_DAYS=45`, and `ANALYTICS_AGGREGATE_RETENTION_DAYS=400`.
- Existing `ADMIN_ENABLED`, origin/RP, admin audit retention, operator enrollment/role setup remain required. No change/seed here.

Reporting-only mode may read retained history with collection disabled. Without 019 current cards still work, but history reports `migration-required`. No actual environment file, deployment config or production value is changed by this task.

## Future migration prechecks — do not run now

Never use migrate:production: its historical list is unsuitable. 011–015 are already applied; do not rerun. 016–018 remain the separate Build 15 canonical-identity sequence; do not modify them. Verify each before the next. 019 is additive after that approved sequence.

Read-only precheck in an already authorized operator session:

```sql
SELECT current_database(), current_user, current_setting('server_version'),
       to_regclass('public.users') AS users,
       to_regclass('public.entitlements') AS entitlements,
       to_regclass('public.services') AS services,
       to_regprocedure('gen_random_uuid()') AS uuid_function,
       to_regclass('public.analytics_v2_actors') AS v2_actors,
       to_regclass('public.analytics_v2_signals') AS v2_signals,
       to_regclass('public.analytics_v2_snapshots') AS v2_snapshots,
       to_regclass('public.analytics_v2_flows') AS v2_flows,
       to_regclass('public.analytics_v2_service_months') AS v2_months;
SELECT table_name,column_name,data_type,is_nullable
FROM information_schema.columns WHERE table_schema='public'
AND ((table_name='users' AND column_name IN ('id','deletion_scheduled_for'))
 OR (table_name='entitlements' AND column_name IN ('user_id','plan'))
 OR (table_name='services' AND column_name='slug'));
SELECT conrelid::regclass,conname,pg_get_constraintdef(oid)
FROM pg_constraint WHERE conrelid IN ('public.users'::regclass,'public.entitlements'::regclass,'public.services'::regclass);
```

Confirm ownership/CREATE and FK permissions, unique users.id and services.slug, entitlements.user_id uniqueness, approved restore/PITR readiness and no conflicting active transactions before any separately authorized migration. Stop on any pre-existing 019 object unless all definitions match exactly. IF NOT EXISTS is rerun safety for the same schema, not a repair of mismatched objects.

019's BEGIN/COMMIT creates tables/indexes/FKs only. It does not scan/rewrite existing user rows, grant admin roles or seed history. Creating FKs may wait on referenced table locks; use bounded operator-approved lock/statement timeouts. A SQL error aborts the transaction; explicitly roll back before proceeding. Do not run this migration during this implementation task.

After future authorized execution, verify five tables, all named indexes/checks/PK/FKs against the file, zero rows before collection, cascade definitions and unchanged operational row counts. Rehearse rollback-on-error, identical rerun, distinct contributors, concurrent restore, deletion and finalized-month SQL on disposable PostgreSQL **before production approval**. No migration, including disposable, was executed during this task. No down migration is supplied; disable collection/reporting to roll back behavior, keep expiry maintenance, and retain additive tables. Never casually drop retained aggregates or actor data.

## Remaining review before production

- Physical/local admin UI and real passkey-host retest, including logout during a slow report and keyboard chart/table navigation.
- Disposable PostgreSQL execution and concurrency testing of 019/new aggregation queries after separate authorization; SQL/mocked tests are not database execution proof.
- Review the accepted exact-global inference risk, purposes, transparency, applicable legal basis/consent decisions, 45/400 retention, best-effort signals and durable aggregate deletion consequences. No legal conclusion is asserted.
- Current policy approval is not permission to deploy, publish privacy copy, activate collection or seed an admin.
