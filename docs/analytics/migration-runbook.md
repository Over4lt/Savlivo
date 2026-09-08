# Controlled migration/deployment review runbook

This is a future, separately authorized procedure. No production command was executed. The security-review-173b743.md activation blockers remain; migration/deployment review is distinct from enabling collection or admin access.

## Preflight

1. Confirm approved branch/commit, target DB identity and current schema with the operator. Never paste credentials into tickets/logs. Confirm recoverable backup/PITR and rehearse restore with synthetic or appropriately controlled data. Establish a maintenance window, monitored connections, and operator-approved lock/statement timeouts from rehearsal results.
2. Keep analytics/admin/history flags disabled. Determine whether 011/012 were already deployed; do not assume either state. The existing migrate-production.ts runner reapplies an explicit list; it has no per-migration checksum ledger. For the requested verify-after-each-step procedure, execute each reviewed file independently with stop-on-error, then verify before the next. Do not run the bulk runner and claim intermediate checkpoints happened.
3. Base schema and earlier required migrations must already be verified, especially auth password_hash, subscription country_code, deletion_scheduled_for and existing pricing tables. Preserve the runner's other savings/notification/password-reset prerequisites for the backend.
4. Capture pre-change subscription/service/pricing counts and a controlled comparison of existing IDs/values using the existing backup or a scoped rehearsal snapshot. Do not export user portfolios into analytics/docs. Counts alone do not prove unchanged values.
5. Inspect definitions, not just existence. CREATE TABLE/INDEX IF NOT EXISTS does not repair a partially incompatible object. For migration 012, inspect every constraint named subscription_service_identity: the file's existence test is name-based, so a same-named constraint on another relation requires investigation before proceeding.

Useful read-only inspection queries (run only after target authorization):

```sql
SELECT current_database(), current_schema();
SELECT slug, name FROM services WHERE slug = 'viaplay';
SELECT conrelid::regclass, conname, convalidated, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conname = 'subscription_service_identity'
   OR conrelid IN (to_regclass('public.analytics_actors'), to_regclass('public.analytics_events'),
                  to_regclass('public.admin_roles'), to_regclass('public.admin_sessions'),
                  to_regclass('public.admin_audit'), to_regclass('public.verified_price_observations'));
SELECT table_name, column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema='public' AND table_name IN ('subscriptions','analytics_actors','analytics_events',
 'admin_roles','admin_sessions','admin_audit','verified_price_observations');
SELECT tablename,indexname,indexdef FROM pg_indexes
WHERE schemaname='public' AND tablename IN ('analytics_actors','analytics_events',
 'admin_roles','admin_sessions','admin_audit','verified_price_observations');
```

## 011 → verify

Apply `db/migrations/011_add_viaplay.sql` as committed. It inserts the Viaplay service if absent, preserving any existing ID. No subscription or pricing updates. Verify exactly one viaplay slug and expected display identity, with existing service IDs/rows preserved. Rerunning intentionally does not overwrite an existing service name. Insert/unique-key locks should be brief; stop on unexpected conflicts.

## 012 → verify

Apply `db/migrations/012_manual_subscriptions.sql` as committed. It adds nullable custom_service_name, permits null service_id, and validates the mutually exclusive known/manual identity constraint. Verify constraint belongs to subscriptions and is validated; verify old known rows retain IDs/fields with custom_service_name null. Existing FK remains for non-null service_id. Rehearse manual known/custom create/edit and ownership isolation against the new backend.

ALTER TABLE requires strong locks; adding/validating the CHECK may scan existing subscription rows while holding a lock. Do not promise zero downtime. Test realistic volume, use approved lock/statement timeouts, inspect blockers, and abort rather than kill unrelated production transactions blindly.

## 013 → verify

Apply `db/migrations/013_private_analytics.sql` as committed. Verify five new tables, all expected columns/checks/indexes, user/actor/role/session cascading FKs and audit user_id SET NULL. There is no default administrator and no automatic grant. Confirm no role/session/event rows were created merely by migration and no operational rows changed.

On fresh tables index creation is small; FK creation can briefly lock referenced tables. On a partial installation, IF NOT EXISTS may leave incompatible definitions or require index work on populated tables: inspect and stop rather than assume idempotence means repair.

## 014 → verify

Apply `db/migrations/014_verified_price_observations.sql` as committed. Verify positive amount and strong-verification constraints plus identity/latest-observation index. Table is initially empty; no existing pricing data is updated or retroactively dated by this migration. No trigger connects history failure to pricing writes. Preserve existing verified_provider_prices values exactly.

## Backend deploy → verify (separate authorization)

Deploy the reviewed backend with all collection/admin/history flags still false. Confirm existing login, subscription reads/writes, manual records/Viaplay, AI general/multilingual/structured actions, selected markets, pricing fallbacks and reminders continue to work. Admin should return 404 while disabled. Existing clients should make zero analytics requests. Optional database pool adds at most two lazy connections per API instance; verify capacity against actual DB limits.

A separate controlled test environment should then verify authorized admin/denial/expiry/revocation, atomic audit/session creation, logout during audit failure, expiry purge and non-disclosure fixtures. Apply production hosting headers only through reviewed actual host configuration; publish only index.html/admin.js/admin.css, not test files. Complete passkey authentication, verify hosting and resolve privacy decisions before approving production flags/role grants. Client instrumentation is not included in this deployment.

## Rollback limitations

Each of 011–014 is individually transactional. A failed file rolls back its own transaction; earlier successfully committed files remain. No automatic down migration exists.

Prefer disabling the optional flags and keeping additive tables/maintenance over dropping data. Dropping 013 would destroy roles/sessions/audit/events; dropping 014 would destroy observations. Those are destructive actions requiring separate approval. Restoring a DB backup can discard subsequent operational writes and needs reconciliation planning.

Do not remove Viaplay if subscriptions reference it. Do not restore service_id NOT NULL after manual rows exist; that would require destroying or misrepresenting manual records. A backend rollback must remain manual-subscription aware after 012; older code may hide or mishandle those rows. Retain cleanup while pseudonymous data remains, even when collection/admin access are turned off.

## Local evidence

The guarded disposable PostgreSQL test applies 011/012 twice with a pre-existing known subscription and verifies identity/value preservation. It applies 013/014 twice with existing subscription fixtures, exercises constraints/FK deletion/session expiry, tests 0/1/9/10/11 cohorts and bounded retention, and proves price-observation failure leaves current pricing untouched. It is not evidence of actual production table sizes, locks, migration status, permissions, headers or recoverability.

## Update after f5530fa

See activation-blockers-f5530fa.md. User-derived reports have been removed; no cohort threshold alone is treated as sufficient. Admin now requires an explicitly non-production development/test runtime in addition to prior flags, and the client is localhost-only. Keep production NODE_ENV=production; never bypass the gate by changing it to development/test. Existing production/unconfigured admin requests return 404. No new migration was added in this batch. Passkey credential/challenge/enrollment and credential-bound session migration is still required before production exposure; prepare and rehearse that follow-up before revising this sequence. No TOTP requirement is imposed in addition to a correctly implemented passkey flow.
