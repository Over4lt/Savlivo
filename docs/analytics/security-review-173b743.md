# Analytics/admin security review

Starting state: 173b743 on build10-final, 19 commits ahead of the recorded origin reference. Only unrelated `apps/web/.well-known/.htaccess` untracked. Reviewed 707bde3/173b743, migrations 011–014, all new persistence/HTTP/browser code, customer registration, migration runner and technical docs. No production state was inspected.

## Verdict

**NOT READY — BLOCKERS REMAIN** for production activation. The disabled code/migrations can be considered for a separately authorized controlled staging/migration review; this is not approval to enable production collection or admin access.

Unresolved activation blockers:

1. Reviewed strong admin authentication/MFA boundary is absent. Origin checks are not MFA and can be supplied by non-browser clients. Bearer tokens remain replayable if stolen until revocation/expiry; changing a password alone does not revoke already issued admin sessions. The existing customer password-login endpoint is also a credential-attack surface; this pass did not redesign customer auth.
2. Actual static-host response headers, HTTPS redirect/HSTS policy and reverse-proxy rate-limit boundary are not verified/configured. No tracked hosting configuration establishes which server owns these headers. The forbidden .htaccess was not inspected or changed.
3. Thresholded overlapping reports are not anonymous: 11 accounts globally and 10 in NO can reveal the one-account complement even though the US cell is suppressed. Nested 7/30/90-day windows and repeated snapshots permit similar differencing. Payload validation does not solve this. Complete complementary suppression across overlapping user sets/time/service partitions, disclosure budgeting or a different aggregate-release design needs a separate reviewed decision. No differential-privacy claim. Keep production admin disabled pending that decision; access restrictions alone do not eliminate inference.
4. Purposes, retention, notice and applicable consent/objection decisions need human/legal review. A global configuration flag does not implement per-user consent/opt-out. No client instrumentation is present.

## Narrow defects fixed

- Optional PostgreSQL pool idle `error` events previously lacked a listener and could terminate the API process. The handler now absorbs the event and emits only a fixed operational warning, never the driver error/payload.
- Session issuance and its audit record were separate writes. They now share one atomic SQL statement, rechecking role/account/password state at issuance. Audit failure leaves no session; issuance failure cannot leave a false successful-issuance audit record.
- Logout previously audited before revoking the token. Audit failure left the token replayable. Token deletion now happens first and is not rolled back by audit failure; the HTTP response remains an error if audit failed. Privileged reads still fail closed when auditing fails. If the database itself cannot delete, revocation is not guaranteed and the existing absolute expiry remains the bound.
- A ten-account currency group could expose a single known amount with nine unknown amounts. Monetary sums now require ten distinct known-amount contributors; unknown-amount counts independently require ten distinct unknown-amount contributors. Null means suppressed/unavailable, never zero. This fixes the direct amount disclosure; it does not solve the overlapping-report blocker above.
- Malformed request targets are caught by the private HTTP boundary rather than rejecting the shared async server callback.
- Private JSON responses now also send no-referrer and anti-framing/CSP headers. Static HTML adds no-referrer, and the client refuses non-local plain-HTTP login. This is defense in depth, not a substitute for hosting HTTPS/header enforcement.

No schema, pricing, mobile, AI, product feature, entitlement, market or management-route change.

## Authorization/session/audit findings

DB `analytics_reader` membership is the authority. Customer JWTs, JSON role claims and a hidden page cannot grant access. No API grants roles, modifies audit records or exports raw data; customer registration only creates a customer. Production DB privileges/role administrators still require operational review. This review does not claim an application/DB owner could never tamper with audit rows.

Tokens contain 32 cryptographically random bytes, encoded with an adm_ prefix; only SHA-256 hashes are stored. Expiry is enforced by PostgreSQL on each request, 15 minutes after issuance; no sliding extension. Role deletion cascades sessions. Actual account deletion cascades roles/sessions and actor/events; audit user_id becomes null. Pending deletion denies requests while set; withdrawing a pending deletion can restore a not-yet-expired session unless explicitly revoked. Concurrent sessions are permitted, independently revocable. Logout affects the presented session only. Existing reads already in flight may complete after a concurrent revocation; revocation applies at the next authorization check, not retroactively to bytes already released.

Each authorized dashboard read attempt is audited before querying. Failed reads may therefore have an audit entry; it is not proof of delivery. Session creation audit is now atomic; logout revokes even when auditing is down. No raw request, password, token, email, IP or driver exception is persisted in these audit writes. Denied-login attempts remain transiently rate-limited, not a durable security audit stream. Limits are per-process (5/minute/socket and 30/minute globally for login; 30/minute/admin for reads), not a distributed defense. Forwarded headers are not trusted; proxies can coalesce addresses.

Frontend uses memory-only bearer tokens, fixed API destinations, textContent rendering, no DB driver/secret/config credential, no storage API and no raw-event/user/conversation viewer. Tests exercise expiry, late results and concurrent logout/login. Real-browser acceptance remains outstanding. Do not publish test source files as part of a production asset upload; the intended admin assets are index.html, admin.js and admin.css only.

## Exact persisted fields and free-text boundary

| Table | Fields | Classification/source |
| --- | --- | --- |
| analytics_actors | id, user_id | Random pseudonymous actor mapped to operational user FK; server assigned |
| analytics_events | id, actor_id, event, market, service, category, platform, occurred_at, expires_at | Server identity/time/expiry; whitelisted event/market/platform and optional canonical slug/category only |
| admin_roles | user_id, role | Operator-granted authorization, no client grant path |
| admin_sessions | token_hash, user_id, expires_at | Hashed bearer token, privileged account reference, server expiry |
| admin_audit | id, user_id, action, occurred_at, expires_at | Privileged/system action and nullable account reference; no payload column |
| verified_price_observations | id, observed_at, service_slug, plan_slug, plan_name, billing_provider_slug, country_code, currency, monthly_price_minor, source, source_url, verification, source_count, verified_by_agreement, provider_verified_at | Public pricing intelligence copied from existing persisted strong evidence; separate from user events |

The history table **does store provider plan/source text and source URLs**. They come from the existing internal pricing pipeline, not analytics input or private management pages. It is not accurate to say the entire data foundation stores no URLs/text. Future pricing-source changes must continue excluding private account/credential-bearing URLs. The current user event endpoint cannot write this history table.

Admin login necessarily reads email/password operationally for authentication; it does not add them to analytics/audit. Pseudonymous IDs remain personal-data associations, not irreversible anonymization. Socket IP rate keys live only in bounded one-minute process maps. Selected market is app state, not physical location.

Analytics rejects extra keys and arbitrary metadata, all supplied identity fields, names/emails/credentials/raw AI/search text/URLs, unsupported enums, malformed or unsupported markets, objects/arrays/non-string enum values, oversized strings/payloads. Bodies are capped at 1 KiB; authentication supplies user identity. JSON properties cannot become arbitrary DB columns. Schema TEXT columns are not a universal PII detector: trusted SQL/DB-owner writes bypass API validation, and canonical labels themselves still require catalog governance.

## Retention/deletion findings

The proposed 30-day raw / 180-day audit durations remain proposals. No environment was activated. Every retained event/audit/session has an expiry, and queries filter expired events before cleanup. Cleanup is at most 5,000 rows/table/run; expired audit/session rows and empty actor mappings are removed. Cascades avoid dangling FK references; empty actor mappings may exist until the next cleanup, rather than being guaranteed absent at every instant. Backlog/downtime/a failed statement can delay physical purge. No operational subscription row is deleted by retention. Cleanup failure logs a fixed warning; audit-write failure does not prevent attempting raw cleanup. Keep maintenance on after disabling collection until stored rows are cleared.

## Pricing history findings

Existing authoritative values or multi-source values with agreement and at least two sources qualify. Weak/registry rows do not become authoritative history. Explicit country/currency equality and canonical service membership are required. The existing billing route is copied as part of the identity, never remapped. History is an independent transaction with an advisory lock; no trigger or write to pricing truth. Tested deduplication, A→B→A and failed observation writes with current prices unchanged. Source-only changes and intermediate values between polls may not be captured. observed_at means observation, never a retrospectively invented effective date.

## Headers and transport

API private responses: Cache-Control: no-store, X-Content-Type-Options: nosniff, Referrer-Policy: no-referrer, X-Frame-Options: DENY, CSP default-src 'none'; frame-ancestors 'none'. These apply to JSON, not to the separately hosted page.

Static page has restrictive meta CSP and no-referrer plus HTTPS client guard. Before production exposure, the real host must send at least:

- Content-Security-Policy with default-src 'none'; script-src 'self'; style-src 'self'; connect-src https://savlivo-api.onrender.com; base-uri 'none'; form-action 'none'; frame-ancestors 'none'. Remove local-development connect permission in the hosting policy.
- X-Frame-Options: DENY; X-Content-Type-Options: nosniff; Referrer-Policy: no-referrer.
- Cache-Control: no-store for the admin HTML; verify no caching of API responses at proxies/CDNs. Serve JS/CSS with correct MIME types.
- Enforced HTTPS for both page/API. HSTS scope/duration must be reviewed against actual hosting/subdomains, not blindly invented here.

Meta CSP cannot enforce frame-ancestors or nosniff. JavaScript HTTPS checks cannot defend an already modified HTTP page. API origin checks do not establish transport or MFA. Verify response headers and iframe refusal in a real browser after an explicitly authorized staging deployment; no such deployment occurred here.

## Technical facts vs legal decisions

Future notice review should reflect the exact event fields/association, selected-market meaning, first-party processing/no external tracker, raw expiry and cleanup lag, account deletion cascades, aggregate disclosure limitations, privileged audit data, and public price observations. No raw AI/search text analytics or precise location collection exists. Human/legal review must determine purposes, basis, notice, consent/objection mechanism if applicable, durations and access policy. No controller identity, legal basis or compliance conclusion is invented.

## Activation steps

Use migration-runbook.md. Keep ADMIN_ENABLED, ANALYTICS_COLLECTION_ENABLED and PRICING_HISTORY_ENABLED unset/false during review/deployment smoke tests. No existing mobile/web client calls the analytics event endpoint. Future instrumentation is a separate reviewed change. Server collection requires the existing privacy-reviewed/maintenance/retention flags together; flags alone cannot resolve legal or disclosure-design blockers. Admin enabling additionally needs exact allowed origin, audit retention, operator-granted role, reviewed MFA/transport/headers and cohort disclosure decision. Nothing was activated in this review.
