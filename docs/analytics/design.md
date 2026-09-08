# Privacy-first data foundation: audit and activation decisions

Starting HEAD bab1216, build10-final; only unrelated untracked .htaccess. Accepted AI behavior is protected. No production inspection, migration, rollout or privacy-policy publication is authorized here.

## Audit before implementation

Auth: `auth.ts` signs HS256 bearer tokens (30-day default) with internal UUID/email/expiry; production requires JWT_SECRET. Password hashes and password reset exist. There are no roles or admin authorization. Mobile keeps a token in memory and optionally AsyncStorage; no mandatory name. Admin must not trust token/client role claims or reuse a long-lived customer token as a privileged session.

Database: PostgreSQL/pg. Users, entitlements, subscriptions, subscription_actions, status history, savings events, notification endpoints/preferences/jobs, purchase_events, reset tokens and verified_provider_prices already exist. FKs generally cascade account deletion; the manual-subscription migration uses nullable service_id and custom_service_name. Verified pricing is an upsert of the latest strong value, with verified/checked timestamps; it is not a change history. Operational action/purchase tables are not product analytics.

API: hand-written Node HTTP router, bearer auth followed by account-deletion checks, parameterized repositories, background jobs every 15 minutes and pricing refresh daily. Existing JSON reader is unbounded; no shared rate limiter or admin endpoints were found. CORS currently allows all origins for customer endpoints. New admin/event routes need their own bounded reader, authorization, origin controls, rate limits and generic errors, without broadly rewriting customer auth. Existing operational console errors must not be copied into analytics.

Web: static HTML/CSS landing/privacy/reset-password pages, no framework, router, bundler or web auth. A static /admin/index.html can use the existing API; no separate app/deployment/charting library is justified. Browser must have no database connection or embedded secret. Privileged tokens belong only in memory.

Mobile: authenticated internal user, selected-market context, catalog/confirmed Add/manual service, multilingual AI candidates, existing user-confirmed management, PDF and entitlement flows. Instrumentation must not alter bab1216. This batch will not send mobile analytics before privacy activation decisions. Existing authenticated API activity and confirmed operations can be instrumented behind a server-side off switch; a typed client event endpoint can be prepared separately.

Privacy: current policy describes account/subscription/preferences/operational AI context, no separate AI chat-history record, no behavioral-analytics SDKs, and general purpose-based retention. It does not establish a detailed first-party product-event retention/activation policy. Do not invent a lawful basis, legal identity, consent text or compliance conclusion. Public policy remains unchanged.

## Classification and exclusions

Account data: existing UUID/email/password hash, user-entered subscriptions including manual names/plans, transactions and notification addresses. Keep in operational systems, not analytics copies.

Product analytics: pseudonymous actor UUID plus tightly enumerated event dimensions; not anonymous. Server-only actor mapping has user FK and cascade deletion. No email/name, prompt/response, manual-service text, user notes, URL, cookie, credential, device ID, IP identity or location is an event dimension. Selected market is app state, not physical location.

Aggregated business data: thresholded operational/event counts and same-currency recorded spending, no user rows. Minimum cohort 10 is a technical disclosure safeguard, not an anonymity/compliance claim. Repeated observations/differencing remain a risk; dashboard access stays restricted.

Admin audit: separate privileged identity/action/time/expiry, no request payloads or secrets. Operational security IP rate-limit keys are transient in-memory values, not persisted analytics.

Public market intelligence: observations of independently persisted verified provider prices only, distinct from user bills and product events. No historical price is invented before the first observation.

## Activation and policy review

Proposed review defaults (not silently enabled policy): raw events 30 days, daily thresholded aggregates 365 days, admin audit 180 days. These balance short debugging/funnel windows against seasonal trends and security review. Operator/product/legal review must approve purposes, applicable basis/consent/opt-out, retention, deletion rights and policy facts before collection. No legal conclusion is made.

Implementation must require explicit retention configuration and collection approval; no configured policy means no event collection. Store expiry per row so future cleanup does not depend on remembering the original setting. Maintenance must remain enabled when collection is stopped, until retained rows expire. Account deletion must cascade actor mappings/events immediately. Aggregates have no actor reference but are not promised irreversibly anonymous.

Missing-service strategy: counts of no-result/manual fallback by market/category only. Do not hash/store arbitrary unknown strings. This quantifies the size/location of catalog gaps, but cannot name the missing providers. Naming demand requires a later explicit, separate user-submitted suggestion workflow and privacy review.

Admin: separate random opaque short-lived session after existing password verification plus a DB role lookup. Recheck role and account deletion status on every request; grants only by separately approved DB operation. No public role-grant/mutation/export APIs. Origin allowlist, bounded bodies/ranges, per-process rate limits, audited reads and fail-closed audit storage. MFA/passkey or a reviewed upstream MFA access boundary remains required before broadly exposing production admin; not implemented or claimed here.

## Implemented scope (not automatic activation)

The implementation is a prepared first-party foundation, not universal usage tracking. **No mobile or existing customer-operation instrumentation was added.** bab1216's AI/mobile code is unchanged. A dedicated authenticated `POST /v1/analytics/events` endpoint accepts the contract below; existing clients do not call it. A 202 is a best-effort acknowledgement, not a durable delivery guarantee. It remains harmless when collection is disabled.

Allowed client-reported event names:

- app_active
- catalog_search
- catalog_result_selected
- catalog_no_result
- manual_service_fallback_selected
- category_filter_used
- subscription_add_started
- subscription_add_cancelled
- ai_add_form_opened
- ai_add_cancelled
- management_flow_opened
- management_browser_returned
- report_generated

Every event requires `event`, `market` (one of the current selectable ISO codes), and `platform` (ios/android/web). Optional `service` must be a canonical slug and optional `category` must be a canonical category ID. No-result/manual fallback events forbid a service slug. No other keys are accepted. There is no plan, route, price, text, prompt, response, URL, device, user, timestamp or arbitrary JSON field. A client-reported dimension is not evidence of availability or a completed provider action. Server time and the authenticated user's random actor mapping are assigned only at persistence. User deletion cascades mappings and events. Pending-deletion users cannot acquire an actor/write events.

The endpoint has a 1 KiB body limit and 30 requests/minute per authenticated user per API process. Recorder queue: at most 128 events, one write at a time, drops on validation/queue/database failure. Optional data work uses a separate lazy PostgreSQL pool with at most two connections, 1.5-second connection timeout and 3-second statement timeout. Customer request connections and pricing persistence do not use this pool.

Schema 013 adds five tables: analytics_actors, analytics_events, admin_roles, admin_sessions, admin_audit. Actor/user and session/role relations cascade; audit identity becomes null after user deletion. Indexes cover event time/market/event, actor, expiries and session hashes. There is no raw-payload JSON column.

Admin API: POST/DELETE `/v1/admin/session`, GET `/v1/admin/overview?days=7|30|90&market=NO` (market optional). Only DB role `analytics_reader` grants access. Existing password verification is reused, with dummy password work for unknown/non-admin identities. Opaque 256-bit random session tokens expire absolutely after 15 minutes; only their SHA-256 hash is stored. Customer JWTs and client role claims cannot authorize admin reads. Every read rechecks role, expiry and pending account deletion. Successful session creation, logout and dashboard reads are audited; audit failure fails closed. No role mutation, user viewer, export or destructive admin API exists.

Admin login limits: 5/minute per remote socket address and 30/minute globally per process. Reads: 30/minute per admin. In-memory keys expire after one minute and maps have hard capacity. Behind a proxy, socket addresses may group clients; forwarded headers are deliberately not trusted without a separately reviewed proxy configuration. These limits are not a distributed/WAF replacement. Denied attempts are rate-limited but are not persisted as an audit stream. MFA/passkeys are not implemented.

Static `/admin` uses no framework/build tool/dependency, no cookies/localStorage/sessionStorage, and no raw HTML insertion. The token stays in memory, is cleared on expiry/pagehide/logout, and late responses cannot restore a signed-out view. Password input clears before the request. API calls time out after 10 seconds. CSP limits script/style/connect sources. Hosting must add `frame-ancestors 'none'`/`X-Frame-Options: DENY` as HTTP response headers before production exposure; a meta CSP cannot implement frame-ancestors. Hosting configuration was not changed. No chart library was needed for these bounded tables.

## Reporting: available versus deferred

Implemented aggregate-only queries, with 3-second timeout in a read-only transaction:

- New accounts in the requested window; account-country filter.
- Last stored entitlement records by plan; account-country filter. Not a verified current-access count or historical conversion rate.
- Stored ACTIVE subscription count, distinct account count, summed recorded monthly hundredths and unknown-amount count, grouped by currency and subscription-country. No FX conversion; no reinterpretation of the stored hundredths convention. Zero amounts remain zero; null amounts remain unknown. Scheduled/effective-date status adjustments are not applied, so this is explicitly not a complete current spending estimate. Annual estimates can later be derived as 12 times a known monthly amount, not actual annual receipts.
- Top 20 stored ACTIVE canonical service/manual bucket × billing-route groups, using subscription country. Manual service names are never returned.
- Event count and distinct actors by event over retained rows in the selected window/selected market. Explicitly client-reported. No-result counts do not identify missing providers.
- Non-personal data quality: selectable-market/catalog count, registry fallback row count in scope and persisted pricing rows grouped by existing verification label.

Every user-derived group requires at least 10 distinct users/actors (entitlement rows are unique per user). A suppressed/empty group means unavailable, not zero. Repeated filtered queries can still permit inference; access remains restricted. No raw user/event/AI conversation explorer is present.

Deferred: DAU/WAU/MAU, return/retention cohorts, entitlement conversion, AI request→action→save funnel, category breakdown, named missing-service demand, monthly growth-report generation, and Savlivo revenue. Current IAP evidence contains transaction validity/product/expiry, not trustworthy proceeds/fees/refunds; user subscription spending is never revenue. Client emission and authoritative confirmation instrumentation need a reviewed follow-up, with deduplication and completeness definitions before claiming funnel rates.

No aggregate table/job is installed in this batch. Queries aggregate on the server and return only bounded groups. A future daily aggregate table should contain completed UTC day + event + market + counts only after cohort suppression, with its own approved expiry. Do not sum daily distinct actors into monthly active users. The proposed 365-day aggregate retention is a review proposal, not an implemented policy. Until then, raw-event metrics disappear on expiry, and wider requested windows may be incomplete. Growth reports can consume current aggregate API results but cannot reconstruct absent historical cohorts.

## Independent public price observations

Migration 014 adds `verified_price_observations` and an identity/latest-observation index. With its own explicit flag, the 15-minute maintenance runner snapshots the existing persisted verified-price table, independently of all pricing writes/resolution. It accepts only authoritative-provider or multi-source (agreement true, source_count >= 2), positive amounts, canonical services and explicit matching country/currency mappings. Registry/weak/mismatched rows are not converted into history. An advisory transaction lock prevents concurrent snapshot duplication.

Only changed amount, plan name or verification strength creates another observation for the same service/plan/route/country/currency. A→B→A produces three observations. Identical checks do not grow history. Source/evidence and provider verification timestamp accompany each observation. Observation date is not a claimed historical effective date. Initial snapshot is a baseline, not a known price-change date. Changes between polling observations can be missed; source-only evidence changes are not recorded. These are public provider prices, never users' actual bills. No retention period is imposed on this non-personal observation table in this batch; storage should be reviewed over time.

Failure of history storage never rolls back or deletes a verified price. No resolver, adapter, registry or pricing-store file is modified.

## Future activation order — explicit approval required

No production DB state was inspected. Pending production migrations from previous work remain a deployment prerequisite, not an assumption of completion.

1. Review code/security and privacy decisions; confirm backup and actual migration state.
2. Apply the existing migration sequence, including 011_add_viaplay.sql then 012_manual_subscriptions.sql, followed by 013_private_analytics.sql and 014_verified_price_observations.sql. Preserve the existing runner's other migrations. No production migration was run here.
3. Deploy API/web only after separate authorization; existing mobile requires no change for this foundation.
4. Review strong admin authentication: existing MFA access boundary or focused MFA/passkey work, HTTPS and frame-ancestors headers. Grant the DB analytics_reader role only through a separately approved operator action. There is no default admin and no automatic grant.
5. Configure ADMIN_ENABLED=true, exact ADMIN_ALLOWED_ORIGIN (HTTPS; localhost HTTP allowed only outside production), ADMIN_AUDIT_RETENTION_DAYS (30–365), and ANALYTICS_MAINTENANCE_ENABLED=true. No origin wildcard. The shipped web client uses the existing Render API; local development uses localhost:3000.
6. Collection additionally requires ANALYTICS_COLLECTION_ENABLED=true, ANALYTICS_PRIVACY_REVIEWED=true and ANALYTICS_RAW_RETENTION_DAYS (7–90). No accepted events are written without all of these plus maintenance enabled. Review/consent or opt-out decisions are not replaced by setting a flag. Mobile emission is still a future change even after configuration. If review requires per-user consent or opt-out, implement that mechanism before enabling collection; it is not supplied by this global switch.
7. PRICING_HISTORY_ENABLED=true independently enables public observations after migration 014.

Maintenance runs on API startup and every 15 minutes; a per-process in-flight guard prevents overlap. Cleanup deletes expired rows in batches of at most 5,000 per table/run and removes empty actor mappings. Expired raw events are excluded from dashboard queries even before cleanup. Keep maintenance enabled when collection/admin is switched off, until stored rows have expired and been purged. Downtime or sustained backlog can delay physical deletion; monitor generic retention failure messages and database row counts. Session expiry/role revocation is enforced even if cleanup is unavailable. Retention runs are audited with a null user identity when an audit retention policy is configured (system job, not a human).

Technical policy facts for human/legal review: first-party pseudonymous events and association/deletion, selected market not physical location, exact event fields, short raw retention and purge delays, internal aggregate reporting and residual small-cohort/differencing risk, admin security records, no raw AI text/no external tracking SDK. Review lawful basis, consent/objection choices, notice, retention and access controls. Public legal/privacy pages were not changed; no compliance or anonymity conclusion is made.

## Cost and scale

No new recurring service, tracking vendor, deployment or dependency. At most two additional database connections per API instance, created lazily. Current clients emit zero events. After future instrumentation, estimate events/day as active users × reviewed events/user (e.g. 1,000 × 10 = 10,000/day; 30-day retention = about 300,000 rows plus indexes, not a storage-size guarantee). Bound frequency before activation; do not emit per keystroke. Query timeouts deliberately fail closed when reporting exceeds capacity. Raw aggregation will eventually need completed-day aggregates and query-plan review. Dedicated analytics infrastructure is justified only by measured PostgreSQL/write/query pressure. Price observations grow only on initial/changed snapshots, not every unchanged refresh.
