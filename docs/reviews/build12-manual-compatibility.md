# Build 12 / current-client manual compatibility

Starting HEAD 258b0d8. Build 12 reference is 202c09f25f3d3ef4a1f88268c8c15f18f5b42227, the strongest source candidate, not proven artifact provenance.

## Contract

Existing Build 12 and current API wrappers previously sent identical relevant headers; there was no reliable existing version discriminator. Current mobile now sends `X-Savlivo-Subscription-Format: manual-v1`. This is response capability negotiation only, never authentication, entitlement or authorization.

- Explicit capability: existing `serviceSlug: manual`, customServiceName and all modern behavior remain.
- No/unknown capability: manual subscription list/create/edit responses use `serviceSlug: manual:<record-id>`. This is an opaque record-scoped transport alias, not a canonical service. The original id, serviceName, customServiceName, amount, market, status and all other fields remain. Catalog records are unchanged.
- Legacy PATCH must send that exact alias for the URL's record ID. The server translates it internally to manual and sets an internal name-preservation flag. The repository still looks up the authenticated owner's record and requires it to be manual. A fabricated alias for a canonical record, mismatched alias, other user's record or alias sent with modern capability is rejected.
- Legacy edits retain the database's current custom name in the UPDATE itself, even if a newer client concurrently renamed it. An arbitrary replacement customServiceName in a legacy request cannot rename it. Current-client name validation/renaming remains unchanged.
- Alias fields and the internal flag are not persisted; no services/prices/management metadata are created. Server AI uses original repository identities. Delete/status remain ID-based and unchanged; Build 12 refreshes after status confirmation.
- CORS accepts the capability header. Subscription responses are private/no-store and vary by authorization and capability, avoiding reuse of one client's representation for another.

## Results and limitations

Build 12's dedupe key includes serviceSlug; unique aliases retain all manual records. Actual extracted refresh code is tested for zero/one/two/three manual rows and mixed lists. Actual extracted edit request construction retains the alias and omits the custom name as expected. Actual PDF market-filter code retains separate selected-market records. Their amounts/saved totals and names remain, so these records are no longer lost from aggregate/AI/PDF inputs. This does not add new AI functionality to Build 12 or claim physical PDF rendering was tested.

Build 12 cannot rename custom services or display them as canonical picker choices; its form did not have those capabilities. It can retain the displayed record identity and edit the existing amount/plan/date/billing fields. Unknown direct-provider management stays unavailable unless existing routing independently supplies a legitimate destination. No Netflix fallback was introduced.

The new client must retain the capability header; intermediaries must forward it. Capability is not a trustworthy app-version claim and is not used as one. Third-party callers without the header also receive the legacy format. Tests extract the pinned candidate from Git, so CI must retain that historical object (a shallow checkout without it cannot run these tests).

## Validation

- Full API: 364 passed, zero failures/skips, including 9 new format/actual-Build-12 tests.
- Full mobile: 108 passed, zero failures/skips, including the actual current API-wrapper capability/auth test.
- Fresh disposable PostgreSQL manual integration: 1 passed; existing canonical values, legacy edit/name preservation/ownership, forged canonical alias denial, legacy status/delete by ID, modern create/rename/edit/delete, multi-country and reminders verified.
- API/mobile TypeScript, API build and production iOS Hermes export passed.
- An initial integration run exposed an incorrect SQL parameter index; corrected before the successful fresh-database rerun. A test-only URL type conflict was corrected without changing runtime code.

Market definitions, catalog/plan data, pricing registry/adapters/resolver/persistence, management destinations, IAP, analytics/admin/passkeys and migrations are unchanged from the starting commit. The existing 30-market/43-service/107-plan-combination/364-registry-row/757-offline-price/6,300-management-destination baseline is preserved by unchanged source/data and existing regression suites; no new coverage is claimed.

## Rollout / acceptance

Requires migration 012 and existing operational prerequisites; no new migration. This removes the prior manual-row coexistence blocker for this backend, but does not authorize migration/deployment or resolve backup/schema/production checks. Rollback to a backend without this compatibility mechanism restores the Build 12 problem if manual records exist.

After separate approval, test actual Build 12 and the current client against the same controlled account: three distinct same-market/same-route manual rows plus a catalog row; refresh; edit each amount/plan/date; verify names retained; rename in the current client then edit through Build 12; verify rename survives; status-confirm and delete by ID; compare selected-market totals/PDF/AI context; switch market. Confirm current client receives `manual`, while Build 12 receives distinct aliases. No physical-device acceptance was performed here.

No production connection, migration, push, deploy, merge, build/version bump or .htaccess change.
