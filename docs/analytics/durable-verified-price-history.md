# Durable Verified price history: rollout boundary

Migration 023 adds nullable series metadata to the existing current and historical
Verified tables. It does not update a price or assign an identity to any older
observation. The production runtime applies pending migrations before starting
the API and worker. Older application code can ignore the added nullable fields
if an application rollback is needed; do not reverse the migration or delete
historical rows as part of that rollback.

The authoritative writer appends `BASELINE` for a first new Verified price and
`PRICE_CHANGE` only when its previously accepted amount changes. A current
Verified row that predates migration 023 first receives a
`BOOTSTRAP_BASELINE`, marked as an **as-of initialization**, when that row is
next written. The row's genuine `verified_at` is retained as
`provider_verified_at`; `observed_at` is the actual insertion time, and
`provider_effective_at` remains null. For an as-of baseline, future charts must
not use `provider_verified_at` as an asserted provider effective date.
Name-only updates and unchanged re-verifications do not append monetary events.
All current and event writes use one transaction and the existing scoped
advisory lock. The partial unique index prevents duplicate series events for
one verification instant.

`history_series_id` is assigned at first admission from the exact service,
market, billing route, currency, monthly interval and plan identity/slug, then
stored on the current row. Only the existing proved semantic prefix-alias
reconciliation carries it to a successor. A newly admitted plan after an
explicit current-row removal begins a new series. Ambiguous series collisions
fail closed. Annual input is explicitly rejected by this monthly-only writer;
annual price history requires a separately typed amount and interval model.

Pre-migration historical observations stay unchanged with null
`history_series_id` and `history_event_kind`. This includes the 62 Disney+
observations seen in the read-only audit on 18 October 2026. A future analytics
reader must not automatically join them to new series or count them as new
price-change events. The independent optional history sampler can still append
legacy unlinked observations; structured series events come from the Verified
writer regardless of `PRICING_HISTORY_ENABLED`.

## Proposed one-time current-state bootstrap (separate approval required)

No bootstrap is part of migration 023 or this change. The previous read-only
audit counted 857 current authoritative-provider Verified rows; that is an
estimate, not a fixed execution count. Immediately before a separately
approved bootstrap, run a read-only dry run that counts current rows eligible
for strong Verified evidence, rows already carrying `history_series_id`, and
rows with ambiguous semantic aliases. Record a digest of each proposed row's
current identity, amount, verification timestamp and source reference. Review
the 62 pre-existing Disney+ observations separately; do not reclassify them.

An approved utility should reuse the writer's series derivation and scoped
advisory lock. In small transactions, lock each still-current row, recheck its
digest, and assign a series only if it remains unassigned and unambiguous.
Append one `BOOTSTRAP_BASELINE` for its current Verified amount, with actual
insertion time, original verification time and null provider effective date.
Use the same uniqueness rule as the writer so reruns skip identical completed
rows. Report inserted, skipped, changed and refused counts; never infer older
prices from today's value or from Suggested prices.

On failure, roll back the affected transaction and retain committed immutable
observations. Recovery is a reviewed retry from a new dry run, not deletion of
the prior 62 observations or a speculative historical backfill. Production
execution, including the dry-run connection and any later write, requires
separate operator approval.
