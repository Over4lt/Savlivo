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

The run's `New Verified` metric counts V3-verified plan identities only when
eligible target-market verification evidence is present. Its
`Previously Verified` metric counts existing current Verified plan identities
kept by the monotonic merge, not new research success. If the plan-bound V3
result is unavailable, `New Verified` is unavailable rather than inferred
from a persisted aggregate. Existing run result artifacts are unchanged.

## Safety boundary and known limitations

* This patch makes **no DB updates, migrations, removals, re-verifications, or
  research runs**. It does not bulk-demote or delete old price rows.
* Other product/public price views that still directly read
  `verified_provider_prices` may continue to show legacy rows as current.
  That requires a separate audited product-display policy and rollout.
* When a plan changes identity, name, billing route, or currency, no automatic
  delete/overwrite is allowed without proven equivalence; investigate per
  service rather than guess.
* Current V3 routing-learning and research-link mechanisms are reused. No
  new unsafe path is added for carrying cached legacy prices into Truth.
* The selected market remains Old Verified if **any** legacy row remains, even
  if newly verifiable plans also make that same market eligible for Verified.
