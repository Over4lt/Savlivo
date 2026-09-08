# Local review and acceptance

Starting bab1216 (17 commits ahead of origin/build10-final); only unrelated .htaccess untracked. Reviewed local series from 36d480f through bab1216 and audited auth, schema/migrations, API, static web, mobile identity, purchases, privacy text and pricing persistence. No live production inspection or secret retrieval.

Preservation: 30 selectable markets/currencies, 43 services, unchanged 107-combination catalog, 364 registry rows, 757 offline prices and 6,300 management destinations. The API/mobile suites compare registry/offline and management baselines directly. `baseline-bab1216.json` additionally records a byte-identical comparison of 142 protected tracked mobile/contracts/pricing files against starting HEAD. AI/general conversation/multilingual actions, manual subscriptions, selected-market PDF/AI, browser confirmation, IAP, reminders/savings/status and app/build configuration remain unchanged.

Validation performed:

- Focused analytics/security unit tests: 13 passed.
- Complete API suite: 347 passed, 0 failed/skipped (includes the 13 new tests).
- Complete mobile library suite: 107 passed, 0 failed/skipped; includes all 11 browser tests and bab1216 multilingual/management regressions.
- Disposable PostgreSQL integration: 1 compound scenario passed. Both migrations applied twice; seeded existing subscription rows unchanged. Real HTTP checks for unauthenticated/customer/non-admin/client-role denial; accepted admin login; origin denial; audit failure; role revocation; expiry; deletion; aggregate window/market/cohort and money correctness; strict actor association; independent price snapshot/deduplication/reversions/failure isolation.
- Admin client tests in a simulated DOM: 4 passed. Text-only rendering/token handling, immediate signout/late-response guard, expiry denial, and late logout denial cannot clear a newer session. This is not a real-browser/physical-device test.
- API TypeScript, mobile TypeScript and API production build passed.
- Static admin JavaScript syntax check passed. apps/web has no package/build/typecheck framework; no web bundler was introduced.
- Production iOS Expo/Hermes export passed: 1,291 modules, 82 assets, one .hbc bundle, output outside worktree. Mobile code was not changed.

Initial test corrections: existing schema already seeded direct billing, so the fixture was made conflict-safe; SQL status uses existing uppercase ACTIVE. Both were caught before final verification. Sandbox blocked tsx IPC and localhost sockets; approved local test commands ran outside the sandbox. No remote DB was used.

## Manual acceptance (not performed)

In a separately approved local/staging environment with disposable accounts and required flags/migrations:

1. Ordinary mobile login, known/manual Add, multilingual/general AI, AI-confirmed form, market switching, PDF, Netflix/Spotify management sheet and post-return confirmation work as before. Reject/disable analytics requests and confirm no visible product-flow failure. Current mobile emits none.
2. Unauthenticated and ordinary customer/admin-claim tokens cannot read admin endpoints. Wrong-origin requests fail. A DB-authorized admin authenticates; removing role/pending account deletion/15-minute expiry immediately denies reads.
3. Test admin keyboard controls, password manager behavior, narrow/desktop layout, loading/error/empty states, selected market and 7/30/90-day filters. Sign out during a delayed fetch; no data should reappear. Test blocked API/logout and expiration.
4. Seed at least 10 controlled distinct accounts per expected cohort; compare filtered counts with fixtures. Fewer than 10 must suppress rather than show zero. Confirm currency totals retain hundredths, null/zero distinction, billing isolation and no FX/revenue confusion.
5. Inspect test analytics rows: random actor FK association only, no email/name/prompt/response/manual-service query/URL/location. Try injecting forbidden fields and invented enums. Verify account deletion cascades, expired events disappear and maintenance physically purges them.
6. Verify successful privileged reads are audited and an unavailable audit table denies the read. No export, raw conversation or user portfolio viewer exists.
7. Validate production hosting HTTPS, CSP/frame-ancestors headers and a reviewed MFA boundary before enabling public admin access. Physical iPhone testing and real-browser admin acceptance remain outstanding.

No push/deploy/merge, production migrations, privacy publication or release actions. Build remains unchanged. The unrelated .htaccess was never opened, modified, staged or deleted.
