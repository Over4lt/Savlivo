# Production preflight: cb3f182

> Follow-up: [Build 12 manual compatibility](../reviews/build12-manual-compatibility.md) adds negotiated legacy response identities and safe manual edits. The manual-row limitation below describes cb3f182 before that fix. Production schema/recovery verification and physical acceptance remain separate prerequisites; rollback to an older backend still restores the limitation.

Reviewed 2026-09-09. Starting branch `build10-final`, 23 commits ahead of the locally recorded remote, clean tracked tree. Only the unrelated untracked `.htaccess` was present. No production connection, migration, deployment, bootstrap or activation was performed. This document supplements the [migration runbook](migration-runbook.md); it does not authorize execution.

**Verdict: NOT READY — BLOCKERS REMAIN.** Local validation passes. Actual production schema/deployed revision, recoverability, database permissions/volume/locks, runtime configuration and actual Build 12 compatibility have not been established. These are operator evidence gates, not claims of observed production defects.

## Compatibility boundaries

| Schema | Current backend | Earlier backend |
|---|---|---|
| Before 011 | Viaplay creation lacks its DB service; before 012, ordinary subscription queries fail on `custom_service_name` | Depends on actual deployed revision; establish it first |
| After 011 | Still unsafe before 012 | Additive service insert; existing IDs preserved |
| After 012 | Core known/manual reads and writes supported, provided all earlier operational prerequisites exist | Known-only code can hide manual rows through inner joins or misinterpret manual identity; unsafe rollback after manual writes |
| After 013 | Analytics tables exist; keep collection/admin disabled. Not a complete passkey schema | Additive tables do not change customer queries |
| After 014 | History storage exists; keep history disabled. Still no passkey schema | No pricing trigger or replacement of current prices |
| After 015 | Complete optional schema; production admin remains code-blocked | Do not run older admin authorization against enrollment/session additions with admin enabled |

011–015 alone do not establish all backend prerequisites. Verify schema.sql and migrations 002/003/004/005/007/008/009/010, savings ledger, notifications (20260824) and password reset (20260907), as listed in `migrate-production.ts`. That runner has no checksum migration ledger and no verification pauses. Do not use its bulk execution for this procedure.

Current mobile contracts and tests pass; this is not proof of the uploaded Build 12 binary. Before rollout, test actual Build 12 with the candidate backend in a controlled environment: known subscription read/create/edit, unknown/manual records in the same account, Viaplay identity, reminders, AI responses, and management return. Capture its actual source/artifact provenance. Do not assume an old client recognizes the `manual` service discriminator. Stop if it hides/mislabels rows or handles new responses incorrectly.

## Production prechecks — all required

1. Identify the approved deployed backend revision, candidate artifact, DB/service identity, PostgreSQL version, Node version, start/build commands and any automatic pre-deploy migration command. Prevent an automatic bulk migration from bypassing these checkpoints. No release action is authorized here.
2. Obtain operator confirmation of the recovery point, recovery window, latest backup/export, successful restore rehearsal, restoration permissions, recovery time and reconciliation of writes after that point. Render documents PITR for paid Postgres; this repository does not establish this database's plan or recoverability. See [Render recovery documentation](https://render.com/docs/postgresql-backups). Do not infer PITR from the Render name alone.
3. Compare schema definitions against the committed files, including constraints, defaults, indexes, triggers, FK actions and privileges. IF NOT EXISTS does not repair mismatched objects. Stop on drift, unknown partial installation or an unexpected same-named constraint.
4. Capture exact counts and compare representative pre-existing service/subscription/pricing rows using a restricted operator snapshot or controlled restored backup. Keep account data out of this repository, analytics and tickets. Counts alone cannot prove preservation. Arrange an approved write-quiescence window for meaningful before/after comparisons; concurrent legitimate writes otherwise invalidate equality checks.
5. Establish an approved lock timeout and statement timeout from realistic-volume rehearsal. Inspect active transactions and blockers without logging their SQL/payloads. Do not kill unrelated transactions. Check disk/headroom, connection capacity (main pool up to 10 plus optional pool up to 2 per instance), and table sizes.
6. Verify the migration identity owns affected relations or has equivalent required privileges, CREATE on schema, REFERENCES where required, and can create the function/trigger. Verify `gen_random_uuid()` exists. Stop on missing privileges; do not grant broad privileges automatically.
7. Preserve current operational environment values without printing secrets. `NODE_ENV=production`, explicit correct `DATABASE_URL`, and existing nonempty strong `JWT_SECRET` are required. Missing JWT secret fails startup in production; missing DATABASE_URL is not explicitly rejected by the runtime pool and may use libpq defaults, so verify it independently. Do not rotate JWT signing material incidentally. Preserve current AI, email, IAP and notification configuration.
8. Require `ADMIN_ENABLED=false`, `ANALYTICS_COLLECTION_ENABLED=false`, `ANALYTICS_PRIVACY_REVIEWED=false`, `PRICING_HISTORY_ENABLED=false`. Leave new retention policy unconfigured. If pre-existing retained data exists, STOP to establish its approved maintenance/retention handling rather than disabling cleanup blindly. No roles or enrollment grants may be created.

### Operator command templates (not executed)

Use a restricted libpq service/password file provisioned through the approved operator channel. Do not put passwords/URLs in shell history or this report. Replace placeholders only after approval. Run from the reviewed checkout root.

```sh
git rev-parse HEAD
git status --short --branch
git diff cb3f182 -- db/migrations services/api apps/mobile packages/contracts
psql 'service=<APPROVED_PRODUCTION_SERVICE>' -X --set=ON_ERROR_STOP=1
```

Inside that one operator psql session, first run read-only checks:

```sql
SELECT current_database(), current_user, current_schema(), version(), pg_is_in_recovery();
SHOW search_path;
SELECT to_regprocedure('gen_random_uuid()');
SELECT nspname, has_schema_privilege(current_user, oid, 'CREATE') FROM pg_namespace WHERE nspname='public';
SELECT relname, pg_get_userbyid(relowner) AS owner, pg_total_relation_size(oid) AS bytes
FROM pg_class WHERE relnamespace='public'::regnamespace AND relkind='r' ORDER BY relname;
SELECT pid, state, xact_start, wait_event_type, wait_event, pg_blocking_pids(pid)
FROM pg_stat_activity WHERE datname=current_database();
SELECT count(*) AS users FROM users;
SELECT count(*) AS services FROM services;
SELECT count(*) AS subscriptions FROM subscriptions;
SELECT count(*) AS verified_prices FROM verified_provider_prices;
SELECT conrelid::regclass, conname, convalidated, pg_get_constraintdef(oid)
FROM pg_constraint WHERE connamespace='public'::regnamespace ORDER BY conrelid, conname;
SELECT table_name,column_name,data_type,is_nullable,column_default
FROM information_schema.columns WHERE table_schema='public' ORDER BY table_name,ordinal_position;
SELECT tablename,indexname,indexdef FROM pg_indexes WHERE schemaname='public' ORDER BY tablename,indexname;
SELECT tgrelid::regclass,tgname,pg_get_triggerdef(oid) FROM pg_trigger WHERE NOT tgisinternal;
```

For existing optional tables, also record counts before changing them (only after confirming existence). Do not expect an already-installed table to be empty. Record approved representative row comparisons separately in restricted operator tooling. STOP if the target, baseline or permissions cannot be established.

After prechecks, set reviewed timeouts (placeholders deliberately require an operator decision):

```sql
SET lock_timeout = '<APPROVED_LOCK_TIMEOUT>';
SET statement_timeout = '<APPROVED_STATEMENT_TIMEOUT>';
```

Execute **one** file, run its checks below, and stop for verification before entering the next command. Do not paste the entire sequence as a batch. Do not wrap files in another transaction: each already has BEGIN/COMMIT.

```text
\i db/migrations/011_add_viaplay.sql
[verify 011; STOP on failure]
\i db/migrations/012_manual_subscriptions.sql
[verify 012; STOP on failure]
\i db/migrations/013_private_analytics.sql
[verify 013; STOP on failure]
\i db/migrations/014_verified_price_observations.sql
[verify 014; STOP on failure]
\i db/migrations/015_admin_passkeys.sql
[verify 015; STOP on failure]
\q
```

Any SQL error, timeout or disconnect means STOP. A failed transaction must be rolled back/connection closed before further work. If a connection drops around COMMIT, determine whether it committed using the checks; do not assume success or failure. Earlier committed migrations remain. Inspect incompatible objects before any rerun.

## Per-file risks and mandatory postchecks

After **every** file repeat the schema/constraint/index inspection above and controlled baseline row comparisons. Compare definitions to the actual reviewed SQL, not just names. Unexpected row changes, missing/invalid constraints, absent indexes, unexpected grants or collection are STOP conditions.

### 011

Unique-slug INSERT/ON CONFLICT DO NOTHING, transaction-contained. Brief insert/unique locks; conflicting concurrent insert can wait. Rerun does not correct an existing wrong display name.

```sql
SELECT slug,name,count(*) OVER () AS matching_rows FROM services WHERE slug='viaplay';
```

Require exactly one `viaplay` / `Viaplay`, existing IDs unchanged, all subscription/pricing rows unchanged. STOP on identity mismatch. No deletion rollback if references exist.

### 012

Strong ALTER TABLE locks and CHECK validation scan of subscriptions. Nullable service FK is retained; a canonical service and custom name are mutually exclusive. Existing known rows gain null custom name without amount reinterpretation. The constraint-existence check is globally name-based: STOP if `subscription_service_identity` belongs to another relation or has the wrong definition.

```sql
SELECT conrelid::regclass,convalidated,pg_get_constraintdef(oid)
FROM pg_constraint WHERE conname='subscription_service_identity';
SELECT count(*) AS invalid_identities FROM subscriptions WHERE NOT (
 (service_id IS NOT NULL AND custom_service_name IS NULL) OR
 (service_id IS NULL AND custom_service_name IS NOT NULL AND length(btrim(custom_service_name)) BETWEEN 1 AND 100));
SELECT count(*) AS manual_rows FROM subscriptions WHERE service_id IS NULL;
```

Require one correct validated constraint on subscriptions, zero invalid identities, nullable service_id/custom_service_name, retained service FK and all existing values preserved. Current-backend manual/known round trips are locally tested; exercise equivalent controlled acceptance before rollout. Do not insert synthetic customer records directly into production as a schema check.

### 013

Five empty tables on first install: analytics_actors/events, admin_roles/sessions/audit. Unique actor user ID; cascading user→actor→events and role→sessions; audit user FK SET NULL. New indexes on event time/market/event, actor, expiry and session/audit expiry. FK creation can lock existing referenced tables; indexes can scan populated partial installations.

Require exact columns/checks/FKs/indexes from file, no unexpected role/session/event creation, and unchanged existing counts when rerun. First-install counts must all be zero. No public role-grant endpoint. Collection remains disabled by config; schema presence is not activation.

### 014

New observation table and identity/latest-ID index; no FK to customer data, no current-price trigger or backfill. Positive amounts/counts and strong-verification CHECKs required. First install empty; rerun preserves prior observations. Verify `verified_provider_prices` values unchanged. History flag remains false. Observation time is observation time, not an inferred historical effective date.

### 015

Requires 013 roles/sessions/audit. Adds unique role WebAuthn handles and enrollment versions, credentials, challenges, credential-bound sessions and replacement trigger. Volatile UUID defaults may rewrite/populate existing role rows; unique index and updated audit CHECK can scan/lock populated tables. All work transactional, including trigger replacement.

Require unique credential IDs/handles/challenges; credential counter and public-key bounds; role/account cascades; session credential deletion cascade; challenge session/role cascade; enrollment-only fields/defaults; updated audit action CHECK; `admin_passkey_replacement` trigger and function exactly matching file. Verify existing credentials, counters, handles and sessions are unchanged on rerun. No automatic enrollment/roles. Credential-less sessions are rejected by current authorization; role/account deletion and credential replacement revoke access. Do not drop credentials to roll back code.

## Backend deployment checkpoint

Only after all five verified steps and separate deployment authorization: deploy the reviewed immutable backend artifact using the established host workflow, with flags off. Do not invent a Render service ID/API deployment command. Confirm actual Node runtime supports the pinned passkey dependency (local validation used Node 24); confirm lockfile installation and approved build/start commands without dependency upgrades.

Startup itself runs country-column ensure/backfill, China service upserts and background savings/reminder jobs. It is not a read-only health probe. Check existing country nulls, expected China identities and worker behavior before starting another instance. Required operational prerequisites must be present before startup; health alone cannot establish full compatibility.

Verify `/health` (DB-backed; confirm route against server), customer authentication with a controlled account, known/manual subscription read/edit isolation, Viaplay, selected-market AI/PDF, pricing including Norway/Google One fallbacks, and reminders. Use existing approved test accounts and explicit user-confirmed writes, not unreviewed production fixtures. Stop on error-rate increase, lost/misnamed subscriptions, wrong routes/prices, worker failures or unexpected admin/analytics activity. `/v1/admin/overview` must remain 404. Password admin route stays unavailable. No current mobile/web instrumentation emits analytics. Production `NODE_ENV=production` blocks admin even with other config; never change it to development to bypass that gate. Hosted admin client is also blocked.

## Rollback and web separation

Prefer compatible code rollback leaving additive schema intact. Before any code rollback compare SQL/DTO support for manual records and session authorization. Do not roll back to known-only joins after manual rows exist, or legacy admin authorization with admin enabled. There are no down migrations. Dropping custom identity can destroy/misrepresent manual subscriptions; dropping analytics/history/passkey tables loses their state; restoring a backup can discard subsequent customer writes. Recovery needs explicit reconciliation and authorization.

Static favicon deployment is independent of the API/DB. Publish only reviewed homepage plus favicon.ico, favicon-96x96.png, favicon-192x192.png and apple-touch-icon.png through the existing web-host workflow. Do not upload the entire directory or expose admin/test files. Keep prior static assets for rollback. After separately approved deployment check HTTPS homepage and each icon return 200 with correct MIME/image contents, canonical is https://savlivo.com/, robots permits crawling, no noindex/auth barrier, and sitemap remains accessible. Example read-only future check: `curl -fsSL -D - -o /dev/null 'https://savlivo.com/favicon.ico'`; repeat for each path and inspect homepage head. Google refresh timing is outside Savlivo control. No web deployment occurred here.

## Local validation in this preflight

- Full API: 355 passed, zero failed/skipped (includes pricing, history/validation unit coverage, multilingual actions and markets).
- Mobile library: 107 passed, zero failed/skipped, including 11 browser tests.
- Web: 13 passed (8 admin client, 5 favicon).
- Disposable PostgreSQL private-data/migrations/history: 12 passed (parent plus 11 subtests; history assertions also in parent setup).
- Disposable PostgreSQL passkeys: 36 passed (parent plus 35 subtests), including real signatures, replay, role deletion and 015 rerun preservation.
- Fresh disposable PostgreSQL manual subscription compatibility: 1 passed, including known-row preservation, repeated 012, ownership, market isolation and reminders.
- API and mobile TypeScript and API build passed.
- No mobile changes; Hermes export not rerun. No physical Build 12 acceptance or production-scale lock/restore rehearsal performed.

No production code, schema files, pricing data, mobile code or release configuration changed in this preflight. Only this review document was added. Production state remains unverified; do not turn successful fixture tests into a production-readiness claim.
