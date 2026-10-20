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

## Read-model consistency still to decide

The current product-pricing projection in `product-pricing.ts` treats any
qualified `official-provider-adapter:*` row as Verified. The legacy provider
dashboard in `private-data-http.ts` also counts it under its original
verification class. `price-analytics.ts` includes such rows in its current
qualified-Verified count, while keeping structured historical series separate.
The regional pricing snapshot in `pricing.ts` retains unmatched old adapter
rows as current offers. These reads have different purposes; changing their
meaning is a product-display policy decision, not a Truth or history rewrite.
Its in-process 24-hour snapshot cache can also delay display of a newly
persisted V3 successor until refresh; the Admin market-status read uses the
database directly. Cross-process cache invalidation needs a separate bounded
design before promising immediate public-price updates.

A consistent next step is a shared, read-only source classification for
qualified current rows: `V3_VERIFIED`, `OLD_ADAPTER_VERIFIED`, and other
qualified provider evidence. Expose the classes separately in Admin coverage
and current-price analytics. Keep immutable observation history under its
original source and verification fields. Decide explicitly whether public
price cards should show an unmatched old row with a legacy/freshness label or
withhold its current-price claim; do not silently demote or delete it. Apply
that decision through the common product projection and tests for every
consumer, including the legacy dashboard, before changing public behavior.
