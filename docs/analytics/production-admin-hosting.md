# Private admin: production hosting readiness

This supersedes earlier localhost-only deployment instructions. Starting revision:
7fe0899. Target origin is **https://admin.savlivo.com**, API
**https://savlivo-api.onrender.com**, WebAuthn RP ID **admin.savlivo.com**.

## Status and boundaries

The operator reports Webhuset has created the empty /subdomener/admin/ document
root and a valid TLS certificate explicitly covering admin.savlivo.com; HTTPS
currently returns 403. These are supplied facts, not live checks performed here.
The operator also confirms production migrations 011–015 are applied and verified.
**Do not rerun them. No new migration is required.**

This repository change neither deploys nor activates anything. Production exposure,
environment changes, uploads, role assignment and enrollment all require separate
approval. Collection and price history remain disabled; no client instrumentation
or user-derived reports have been added.

## Blockers found and disposition

- Backend deliberately rejected NODE_ENV=production: now accepts only the exact
  production origin/RP and existing explicit enable/maintenance/retention settings.
  Missing, malformed, inconsistent or unspecified runtime configuration fails closed.
- Static client deliberately rejected hosted origins and targeted localhost: now
  recognizes only the exact production origin and fixed Render API, or localhost
  HTTP/HTTPS rehearsal using http://localhost:3000. No URL/query/storage override.
- HTML metadata cannot enforce frame-ancestors or response headers: an admin-only
  Apache deployment artifact is provided. Actual Webhuset directive compatibility,
  response headers, redirect behavior and browser ceremonies remain unverified.
- Approved audit retention must be configured: there is no default. The existing
  allowed 30–365 day range is technical validation, not an approved retention policy.
- First administrator and credentials require explicit operator setup. None created.
- Production passkeys cannot reuse localhost credentials. Enroll at the exact RP.
- Existing rates are per API process, not distributed. Render proxy peers may share
  a rate bucket because arbitrary forwarded IP headers are deliberately not trusted.
  Check expected low-volume operator access without weakening these limits.
- Recovery/backup-passkey procedures and native-browser acceptance remain operator
  prerequisites. A stolen session token can be replayed until revocation/15-minute
  absolute expiry; no device fingerprinting or security guarantees are claimed.

## Future Render configuration — not applied

Keep ADMIN_ENABLED=false until the separately approved activation step. The future
enabled configuration requires every row below; values have no permissive defaults:

| Variable | Future value |
| --- | --- |
| NODE_ENV | production |
| ADMIN_ENABLED | true only after explicit authorization; false until then |
| ADMIN_ALLOWED_ORIGIN | https://admin.savlivo.com |
| ADMIN_RP_ID | admin.savlivo.com |
| ANALYTICS_MAINTENANCE_ENABLED | true for bounded session/audit/challenge cleanup |
| ADMIN_AUDIT_RETENTION_DAYS | An explicitly approved whole integer from 30 through 365; policy decision still required |
| ANALYTICS_COLLECTION_ENABLED | false |
| ANALYTICS_PRIVACY_REVIEWED | false (or remain unset); never assume approval |
| PRICING_HISTORY_ENABLED | false |

Use the existing secure DATABASE_URL and normal backend secrets unchanged. Do not
copy them into the client, documentation or command line. There is no client API
URL environment variable. ADMIN_ENROLLMENT_CONFIRM is temporary operator-process
configuration only, not a permanent Render setting.

Maintenance is independent of analytics collection. Existing startup/15-minute
maintenance bounds deletion batches to 5,000 rows per table and isolates failures.
Expired sessions are denied immediately, regardless of physical cleanup timing.
Enabling maintenance does not enable collection or history. Legal/product decisions
about collection, lawful basis and retention remain separate; no privacy policy is
published or legal conclusion asserted here.

## Later Webhuset upload — admin document root only

After separate approval, upload exactly:

| Repository file | Server destination |
| --- | --- |
| apps/web/admin/index.html | /subdomener/admin/index.html |
| apps/web/admin/admin.js | /subdomener/admin/admin.js |
| apps/web/admin/admin.css | /subdomener/admin/admin.css |
| apps/web/admin/deploy/webhuset-admin.htaccess | /subdomener/admin/.htaccess |

Do not upload tests, source maps, documentation, server code or the whole apps/web
directory. Never modify the public savlivo.com configuration or
apps/web/.well-known/.htaccess.

The artifact requires Apache 2.4 mod_rewrite/mod_headers and AllowOverride permission
for Options, DirectoryIndex, rewrite and Header directives. Unsupported directives
must fail closed, not be silently omitted. Confirm with Webhuset before exposure.
It denies directory listings, alternate Host values and all files except the three
client assets/root; redirects HTTP to the fixed HTTPS hostname; and sets:

- CSP: default-src 'none'; script-src 'self'; style-src 'self';
  connect-src https://savlivo-api.onrender.com; base-uri 'none'; form-action 'none';
  frame-ancestors 'none'; object-src 'none'.
- X-Frame-Options: DENY; X-Content-Type-Options: nosniff.
- Referrer-Policy: no-referrer; Cache-Control: no-store.
- Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(),
  publickey-credentials-get=(self), publickey-credentials-create=(self).
- HTTPS-only Strict-Transport-Security: max-age=31536000, scoped to this hostname,
  without includeSubDomains or preload.

The HTML meta CSP also permits localhost for the shared rehearsal file. Production
response CSP further restricts connections to Render only; meta is not a substitute.
Verify the host serves HTML/CSS/JS with correct MIME types and preserves these headers
on successful and error responses. Do not expose the page if security headers fail.
If TLS terminates before Apache, Webhuset must supply a trusted HTTPS indication or
equivalent host-level redirect/header rules; do not blindly trust browser-supplied
X-Forwarded-Proto. Avoid redirect loops. Review the one-year, admin-only HSTS policy
with the host before upload; an active HSTS policy cannot be instantly undone.

CORS is handled before the existing general API CORS code. Valid admin preflights
allow only the exact configured Origin, Authorization/Content-Type and GET/POST/DELETE.
Missing/wrong Origin gets 403 without an allow-origin header; disabled config gets 404.
No cookie credentials, wildcard admin origins or global CORS expansion. API responses
already send no-store and restrictive security headers. Browser requests cannot set
the verifier's expectedOrigin/RP ID: these come exclusively from server configuration.

## Controlled first-admin enrollment — not executed

1. Separately authorize backend deployment with ADMIN_ENABLED=false. Verify normal
   customer functions, absent collection/history, and unavailable admin endpoints.
   Do not rerun migrations. Verify existing 015 objects using read-only schema checks.
2. Approve audit retention and host deployment. Verify TLS, exact hostname, redirects,
   MIME and all response headers before allowing admin authentication. Then separately
   authorize the exact enabled Render configuration above.
3. Independently identify the approved existing internal account UUID and confirm it
   is not pending deletion. In authorized database psql, use the existing secure
   connection and the following explicit operator transaction (never a public API):

   ```sql
   \set ON_ERROR_STOP on
   \set ON_ERROR_ROLLBACK off
   \prompt 'Approved internal account UUID: ' admin_user_id
   \prompt 'Configured/approved audit retention days: ' audit_days
   BEGIN;
   WITH granted AS (
     INSERT INTO admin_roles(user_id,role)
     SELECT id,'analytics_reader' FROM users
     WHERE id=:'admin_user_id'::uuid AND deletion_scheduled_for IS NULL
     ON CONFLICT(user_id) DO NOTHING RETURNING user_id
   )
   INSERT INTO admin_audit(user_id,action,expires_at)
   SELECT user_id,'role_granted',now()+:'audit_days'::integer*interval '1 day'
   FROM granted;
   COMMIT;
   ```

   Verify exactly one intended role/audit row. A zero-row result requires inspection;
   do not assume success or create another account. Use only the approved retention
   value already configured. No role can be assigned by client claims or passkeys.
4. In an authorized, non-recorded interactive server terminal, using the deployed
   API package directory and existing secure environment, run:

   ```sh
   ADMIN_ENROLLMENT_CONFIRM=issue-one-use-grant node dist/services/api/src/admin-enroll.js <approved-internal-account-UUID>
   ```

   This intentionally requires a real TTY. Do not pipe/capture its output, put the
   grant into history, paste it in chat, or use logged automation. If the available
   Render shell is recorded or not a TTY, stop and arrange an approved secure operator
   terminal; do not remove the check. The grant is displayed only there, expires in
   five minutes, is enrollment-only and cannot read statistics or assign roles.
5. Open exactly https://admin.savlivo.com. Enter the grant in Register passkey; use
   the native user-verified ceremony. The field clears immediately. Registration
   consumes the grant, stores only public credential material, revokes old sessions
   and does not sign in. Sign in separately with the new passkey.
6. Verify only non-personal catalog/provider-price counts appear. Check logout,
   revoke-all, expiry, browser cancellation and wrong-origin denial. An authenticated
   admin can register a second independently controlled passkey; registration revokes
   sessions, so sign in again. Establish an approved recovery procedure before relying
   on a single credential. Operator credential deletion cascades sessions; role/account
   deletion revokes access. Lost credentials never justify public self-enrollment.

Do not change NODE_ENV to development to bypass a production configuration failure.
Stop on any missing header, invalid origin/RP, unexpected user-derived data, unavailable
audit writes, missing role or uncertainty about secure grant delivery.

## Preserved security and data scope

SimpleWebAuthn verification, required user verification, fresh single-use five-minute
challenges, counters/replay protections and server-owned expected origin/RP are unchanged.
Every privileged request rechecks DB role/account/passkey and a hashed 15-minute session.
Password-only login remains absent in both production and rehearsal. Audits remain
mandatory for protected reads and credential/session issuance; logout still revokes
even if its audit write fails. Existing rate limits and enrollment scope are unchanged.

Dashboard reads only canonical catalog/registry and verified provider-price coverage.
No accounts, portfolios, spending, revenue, funnels, AI conversations or raw events.
Stored admin fields remain public credential material/counters, internal operator IDs,
hashed tokens, challenge/origin/RP/version/expiry and allowlisted audit actions. Product
analytics remains disabled and no new fields or pseudonymous collection were introduced.

## Validation for this change

- Focused private-data/config/CORS/privacy tests: 23 passed.
- Admin client/static-header tests: 11 passed.
- Disposable PostgreSQL migration/privacy/retention/admin tests: 12 passed.
- Disposable PostgreSQL passkey tests: 37 passed, including real production-origin
  ECDSA registration/authentication, wrong origin/RP rejection and HTTP logout.
  Existing RSA, replay, revocation, audit-failure and cleanup cases remain green.
- Full API suite: 366 passed, zero failures/skips.
- Full mobile library suite: 121 passed, zero failures/skips.
- API and mobile TypeScript checks passed; production API build passed.
- Admin JavaScript syntax check passed. Static web has no separate build pipeline.
- No mobile changes; Hermes/native export and physical tests were not rerun.
- No production connection, migration, configuration change, upload or activation.

Host response behavior and real platform-passkey acceptance remain later controlled
checks. Automated fixtures prove verifier behavior, not actual Webhuset/browser behavior.
