# Old Verified workflow — V2 Operations

Old Verified is a **research work queue**, not a new authority class and not a
permission to delete historical prices. It is derived read-only from the
current `verified_provider_prices` rows whose `source` matches
`official-provider-adapter:*` and whose original verification passes the
existing qualified-Verified check. It is **not** defined by a blanket cutoff
date. Existing Verified from other source families remains distinct.

## Service-by-service recovery

In Canonical price research, select exactly the service(s) to work on, then
click `Markets -> Old Verified`. The selection includes only eligible
service/market targets; excluded pairs remain excluded. Preflight and Run
continue to freeze the same explicit target set. Nothing is auto-started.

Price research uses its existing V4 Suggested -> V3 Truth pathway, retained
research links, validated pricing route memory, and source/market-aware
country route hints. Old adapter prices are context for plan matching, **not**
source proof and not automatic V3 Truth. A prior `v3-truth` price in another
market cannot establish target-market pricing without new appropriate proof.

Each successful accepted V3 Truth write uses the existing verified pricing
writer. That writer replaces an equivalent *current* row while preserving its
immutable price history. Only actually matched, freshly established plans
leave the Old Verified queue; unmatched old tiers remain there for targeted
follow-up and human resolution. Failed retries leave Old Verified unchanged.
An adapter refresh cannot overwrite an equivalent current `v3-truth` row, even
with a later adapter timestamp. Regional pricing also prefers that stored V3
row over the equivalent fresh adapter result. Unrelated or ambiguous plan names
are not automatically merged; they require a documented identity decision.

The run's `New Verified` metric counts V3-verified plan identities only when
eligible target-market verification evidence is present. Its
`Previously Verified` metric counts existing current Verified plan identities
kept by the monotonic merge, not new research success. If the plan-bound V3
result is unavailable, `New Verified` is unavailable rather than inferred
from a persisted aggregate. Existing run result artifacts are unchanged.

## Read-only classification across displays

The shared `classifyCurrentProviderPrice` projection separates a qualified
`official-provider-adapter:*` row as `OLD_VERIFIED`; qualified current rows
from other sources remain `VERIFIED`, and unqualified rows remain `SUGGESTED`.
The same rule is used by the market-status SQL, product plan projection,
regional API response (`items[].priceStatus`), Admin coverage, and current
Price Analytics counts. Mobile regional plan choices now include current V3
rows and label retained adapter rows as Old Verified. Public plan responses
keep legacy evidence in `plans[].oldVerified` rather than `plans[].verified`.

Historical price observations retain their source, dates, amounts, and
semantic series. Price Analytics labels older adapter observations on chart
points and changes, while its **current Verified** counts exclude them.
An unmatched Old Verified plan can still supply an explicitly labelled
regional price; it is never silently represented as a fresh V3 result.

The regional 24-hour cache continues to bound provider acquisition, but each
cache hit checks the current persisted rows. A later V3 write becomes visible
without another paid provider request. If this bounded DB read fails, the
existing snapshot remains available with its original timestamp.

## Safety boundary and known limitations

* The read-model changes make **no DB updates, migrations, removals,
  re-verifications, or research runs**. They do not bulk-demote or delete
  old price rows.
* When a plan changes identity, name, billing route, or currency, no automatic
  delete/overwrite is allowed without proven equivalence; investigate per
  service rather than guess.
* Current V3 routing-learning and research-link mechanisms are reused. No
  new unsafe path is added for carrying cached legacy prices into Truth.
* The selected market remains Old Verified if **any** legacy row remains, even
  if newly verifiable plans also make that same market eligible for Verified.
* The `verification` field retains its original provider evidence type for
  compatibility; consumers must use `priceStatus` or the `oldVerified` plan
  array for the current display class.
