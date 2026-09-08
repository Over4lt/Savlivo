# Technical activation blockers reviewed from f5530fa

Starting branch: build10-final. Starting tracked tree clean; only the unrelated untracked `.htaccess` existed. This file records a **partial blocker-resolution batch**, not completed passkey delivery or approval to expose admin. No production inspection, collection, role grant or migration was performed.

**Verdict: NOT READY — TECHNICAL BLOCKERS REMAIN.**

## Resolved technical blockers

### Disclosure model: non-personal provider coverage only

The overview query no longer reads users, subscriptions, entitlements, actors or analytics events. It returns canonical market/catalog counts, registry fallback counts, persisted provider-price counts grouped by verification, selected market, collection configuration and explanatory notes. Provider-price records describe public products, not user bills. The optional market filter scopes those public prices only.

All user-derived measures are deferred: active/new users, entitlement distribution, subscription/service/billing counts, spending, event/category/catalog demand and AI funnels. There are no zero placeholders for removed measures. No total, suppressed remainder, threshold-crossing indicator or timestamp exposes whether a personal group changed. The UI removes these tables and rolling-window controls. Only one optional supported market filter is allowed; time windows, duplicate filters, service, category, billing and unknown parameters are rejected.

Classification:

| Report | Classification | Current behavior |
| --- | --- | --- |
| Catalog/registry/provider-price coverage | Safe non-personal aggregate | Available in authorized local rehearsal |
| Live user/account/event/entitlement counts | Unsafe/defer | No query or result field |
| Portfolios, service/billing distribution, spending | Unsafe/defer | No query or result field |
| Retention, conversion, AI/catalog funnels | Unsafe/defer | Not implemented |
| Fixed-release user aggregates | Requires a separately reviewed disclosure mechanism | Not implemented |

Complementary suppression alone cannot repair repeated mutable snapshots. Parent/child suppression and per-measure thresholds also leave rolling-window and successive-release attacks. Restricting filters alone leaves global snapshot differences. Rather than claim protection from an incomplete combination, this batch removes the entire user-derived reporting surface. A later design must define fixed release schedules, disjoint partitions and cross-release disclosure controls (or a properly reviewed statistical mechanism) before restoring it. No mathematical anonymity or compliance claim is made.

Tests cover 0/1/9/10/11 accounts, global 11 vs country 10, parent 20 vs children 10/9/1, repeated snapshots, dates shifted by 1/7/30 days, deletion of one account, null/zero spending and expired events. Public output stays identical. Real HTTP rejects nested-window and combined market/service/category/billing queries. A unit test ensures the query layer reads only verified_provider_prices, so adding personal output later cannot silently restore the previous SQL paths.

### Production legacy-auth lock

Admin configuration now fails closed for production, staging and unspecified NODE_ENV, even with the old flags configured. Only explicitly declared development/test runtimes retain the existing rehearsal login. Hosted admin JavaScript refuses password entry and makes no API request; the backend restriction is the security boundary. The client is localhost-only and no longer targets the production API. Do not relabel production as development/test to bypass this restriction.

This is a restriction, **not passkey implementation**. No new production authentication path, recovery channel or role assignment was introduced.

### Response permissions

Private API JSON responses additionally send `Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()`. Existing no-store, nosniff, no-referrer, X-Frame-Options DENY and CSP default-src/frame-ancestors none remain. These headers are verified through local HTTP. Public-key credential permissions were not prohibited, allowing later deliberate WebAuthn work.

## Remaining technical blockers: passkeys

SimpleWebAuthn server 14.0.1 was evaluated against official documentation and the local Node 24 runtime. A temporary dependency installation was investigated, then its manifest/lock changes were removed; **no dependency is committed and no verifier is wired into production**. Existing authentication has no credential, challenge or enrollment-permit storage. The verification library alone does not implement the required lifecycle safely. The implementation and cryptographic/browser tests below remain outstanding; this batch does not claim that passkeys are infeasible or completed.

Official implementation references:
- [SimpleWebAuthn server](https://simplewebauthn.dev/docs/packages/server)
- [Passkey considerations](https://simplewebauthn.dev/docs/advanced/passkeys)
- [Cross-origin validation](https://simplewebauthn.dev/docs/advanced/server/cross-origin-support)

Required focused follow-up:

1. Confirm deployed Node runtime and canonical HTTPS admin origin/RP ID before choosing the pinned verifier version. Do not upgrade Expo or use a paid identity provider.
2. Add a new migration after 014, never edit historical migrations: credential ID uniqueness, public key bytes, counter, owner FK to DB admin role, RP identity, optional backup/device state, plus expiring single-use challenges and operator-issued enrollment permits. Do not store private keys, raw assertions, names/emails or recovery answers.
3. First-admin bootstrap must be an explicitly approved server/DB operator transaction: independently identify the existing internal account, grant the narrow role and record the grant audit. Issue a random one-use short-lived enrollment permit, store only its hash, and deliver through an already approved operator channel. No public role grant or self-enrollment. No bootstrap was executed, and no unreviewed recovery channel is proposed.
4. Require user verification; validate exact signed origin, RP ID, challenge, signature, credential owner and counter using a maintained verifier. Bind challenge purpose, origin and intended enrollment owner server-side; consume once even on verification failure. Handle synced-passkey zero counters without claiming clone detection. Reject replay and cross-origin assertions unless deliberately supported by the reviewed deployment.
5. Recheck live RBAC and pending deletion. Passkey possession cannot grant a role. Issue the existing 15-minute opaque hashed session only after successful verification and atomic audit. Bind sessions to credential identity. Credential deletion/replacement must revoke associated sessions; role/account deletion must revoke immediately. Add explicit operator revoke-all with audit; do not introduce invasive device fingerprinting.
6. Disable password admin login in production permanently when passkeys arrive. TOTP, SMS and security questions are not required or proposed. Lost-key recovery is an explicit operator identity-verification/re-enrollment process requiring separate review, not an ordinary password bypass.
7. Test actual signature verification, invalid origin/RP/UV, expired and reused challenges, replay, uniqueness, removed credentials/roles/accounts, credential replacement, audit failure and session expiry. Test real browser registration/authentication on the chosen origin. None of those passkey-specific tests was run in this batch because no passkey implementation exists.

Existing local rehearsal sessions retain 256-bit random tokens, SHA-256 hashes, 15-minute absolute expiry, per-request role/account checks, independent logout, audit-gated creation/reads and role/account cascading deletion. A stolen valid bearer token remains replayable until expiry/revocation. There is no idle timeout, session rotation or credential-linked revocation yet. Password reset does not revoke these local-only sessions; therefore the legacy mechanism is not a controlled production fallback. Per-process rate limiting is not a distributed abuse control.

## Hosting prerequisites

apps/web is static HTML/CSS/JavaScript. No tracked hosting/runtime configuration establishes response headers for those files. The API headers do not govern static HTML. HTML meta CSP cannot enforce frame-ancestors, X-Frame-Options, nosniff or cache controls. The unrelated untracked hosting file was not inspected or changed.

Before exposing admin, the actual host must provide HTTPS and reviewed response headers for `/admin` and its assets: CSP with exact required script/style/connect origins, `frame-ancestors 'none'`, `base-uri 'none'`, `form-action 'none'`, X-Frame-Options DENY, nosniff, no-referrer, no-store and a narrowly scoped Permissions-Policy compatible with WebAuthn. Enforce HSTS only at the verified HTTPS layer after reviewing host/subdomain consequences. Verify headers with actual responses, including errors, redirects and cached assets. Do not publish tests or server configuration. No hosting change or new deployment was invented here.

## Privacy inventory and decisions

No stored fields changed:
- Actor mapping: random actor UUID and internal user FK.
- Events: numeric row ID, actor FK, enum event, selected market, optional canonical service/category, enum platform, server occurrence time and expiry.
- Admin role: internal account FK and narrow role enum.
- Sessions: token hash, internal account/role FK, expiry.
- Audit: row ID, nullable internal account FK, action enum, server occurrence time, expiry.
- Provider observations: row ID; service/plan/name/billing/market/currency/amount; source and public source URL; verification/count/agreement; provider verification time and server observation time. These are provider product evidence, not general analytics free text or user account URLs.

No analytics emails/names, raw prompts/responses/searches, notes, arbitrary metadata, credentials/cookies, precise location or IP identity. IP abuse keys are transient in-memory values. Actors remain pseudonymous and linkable to operational accounts; deletion cascades mappings/events. Retention still deletes at most 5,000 rows per table per pass and removes empty actors. Cleanup/audit failures do not rewrite operational subscription/pricing data. Observation time is not a historical effective date.

Raw 30-day/audit 180-day values remain proposals, not activated policy. Explicit approved retention, purposes, privacy notice facts, applicable legal basis/consent and rights-handling decisions remain human/legal/product review. There is no new aggregate retention policy: user-derived aggregate tables were not introduced. Missing-service text is neither stored nor hashed; no-result events cannot identify the missing provider. Selected market is app state, not location.

## Activation and migrations

Collection still requires collection + privacy-reviewed + maintenance flags and an explicit bounded raw retention; all are off absent configuration. Price observation requires its separate history flag. Source search confirms no current mobile or web client calls the analytics endpoint. The admin client calls admin endpoints only, locally. No role is seeded by migrations.

Sequence remains **011 → verify → 012 → verify → 013 → verify → 014 → verify → separately authorized backend deploy → verify**. No migration was added. See migration-runbook.md for backup/target/schema prechecks, definition checks, lock/statement timeouts, operational-row comparisons, each migration's verification, stop conditions and rollback limitations. Stop on mismatched definitions, blocking locks, failed row comparisons or missing backup/recovery evidence. Keep all optional flags off after deployment; production admin cannot be enabled by the previous config alone. Future passkey migration/deployment must be reviewed separately before removing the code gate.

## Validation and manual acceptance

- Full API: **353 passed**, zero failed/skipped (includes **19** focused private-data tests).
- Full mobile library: **107 passed**, zero failed/skipped, including 11 existing browser tests.
- Admin simulated DOM: **6 passed**, zero failed/skipped.
- Disposable PostgreSQL: **12 passed**, zero failed/skipped (one parent and eleven subtests). Includes migration reruns/preservation, real HTTP auth/audit/headers, adversarial disclosure, 5,001-row retention, deletion, and existing price-history rejection/deduplication/A→B→A/write-failure checks.
- API/mobile TypeScript and API build passed. No mobile code changed; Hermes export was not rerun.
- No passkey, physical-device, hosted-header or production testing is claimed.

Manual follow-up: verify production/unconfigured API returns 404 even with old admin flags; hosted page accepts no password; local authorized rehearsal shows only provider coverage and rejects forbidden filters; repeatedly alter disposable personal fixtures and confirm no output change; inspect rows for permitted fields only; verify ordinary mobile Add/AI/management still work. Real passkey and hosting acceptance remain blocked on their implementation/configuration.

No mobile/contracts/pricing/management/migration/build/IAP files changed. Existing regression fixtures remain green. No push, deploy, merge, production migration, production role, activation or release action occurred. No recurring service or committed dependency was added.
