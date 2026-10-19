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
`provider_effective_at` remains null. Price Analytics uses `observed_at` for
bootstrap ordering, period windows and chart position. `provider_verified_at`
remains provenance, not an asserted provider effective date.
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

## Explicit current-state bootstrap (separate production approval required)

The independent entry point is `node --import tsx
services/api/scripts/bootstrap-verified-history.mjs`. With no flags, it runs a
repeatable-read, read-only preflight. It reports current eligible semantic
series, reason-coded exclusions, review flags, and a digest of proposed source,
identity, value and verification fields. Samples print only source origins.
It never joins the older product `services` table; canonical research-service
identities are used, including Chess.com. Cross-currency current prices are
review flags and retain their actual Verified currencies.

The only write invocation is explicit: `--execute --confirm=BOOTSTRAP_AS_OF
--expected-digest=<digest from reviewed dry-run>`. A changed digest refuses the
entire run. This command requires a fresh SELECT-only production audit and
separate operator approval. No startup, migration, poller, research or normal
Verified writer invokes it.

Each proposed series is re-read under the writer's scoped advisory transaction
lock and row locks. Changed or already initialized rows are skipped. Assignment
and one immutable `BOOTSTRAP_BASELINE` insertion commit together, preserving
current amount, `verified_at`, `last_checked_at`, source and old observations.
Migration 025 adds a unique per-series bootstrap index in addition to the
existing series/time index, so differing verification timestamps cannot create
two as-of baselines for one series. Batches contain at most 25 independent
per-series transactions. A failure rolls back the current series while prior
commits remain; recovery requires a fresh preflight and never deletes events.

The baseline states only that a monthly price was current and provider-Verified
when the snapshot was recorded. The persisted current-price model does not
independently re-prove historical billing cadence for every older row. This
bootstrap creates no earlier effective dates or monetary changes, and leaves
the 62 previously unlinked observations unclassified.
