# Max V3 plan identity repair — read-only proposal

Production was inspected read-only on 2026-10-21. There are 82 current Max
`v3-truth` rows whose plan slug and display name are 64-character offer IDs,
across 31 markets. All 82 have a unique, non-null history series with one V3
history observation. The retained body, SHA-256, G1 market receipt, V3 source
classification and source-bound name locator were checked for all 82. This
identifies 82 **potential** repairs; it does not authorize or certify a write.
The full original acquisition journal and an atomic database snapshot still
need to pass `dryRunVerifiedPlanIdentityRepair` for each row before any can be
certified for repair.

| Scope | V3 rows | Old Verified predecessor rows | Adapter-only bundles |
| --- | ---: | ---: | ---: |
| NO, SE, DK | 9 | 9 | 0 |
| All 31 Max markets | 82 | 27 | 3 (NL Max + Videoland) |

The 27 predecessors match documented tier names within the same service,
market, billing provider and currency. No match uses price equality alone.
The three NL bundles have no independent V3 successor. They remain stored as
old evidence and are hidden from active product options. A future bundle needs
its own official source and ordinary V3 verification; it cannot inherit a
standalone plan's evidence.

## NL read projection (2026-10-21)

The completed `c50b560d-dc8d-d08e-99a1-306ddcbf4593` Max NL target has
one retained Decodo provider body at `https://www.hbomax.com/nl/en`, SHA-256
`e7667c6e1aa08ee9a09d8671474650e540cb6502b9ad76ee76c8d534f97b0afc`.
The original journal and G1 receipt passed `loadRetainedVerifiedEvidence`.
Its source-bound V3 references link offer IDs `54c576…2580d`,
`41227e…cbc6b5` and `e02a30…ff98` to Basic With Ads, Standard and Premium,
respectively. They match the three existing readable V3 rows by exact plan
identity, service, market, billing route, currency and source URL; price
equality alone was not used. The three adapter-only Max + Videoland rows are
bundles, not predecessors of those standalone subscriptions.

The read projection contains only these three documented links. It shows the
three readable V3 plans as active and keeps all nine database rows and their
history unchanged. Any absent, changed or ambiguous successor makes a hash
row visible again rather than guessing. This is a compatibility projection,
not a database repair or a new Verified admission path. Other hash-named rows
remain visible until they receive their own proof and repair.

The existing 82-row repair dry-run still blocks the NL rows. The authentic
source was acquired at `2026-10-21T10:49:53.483Z`, while the current V3 rows
were written with `verified_at=2026-10-21T10:49:59.605Z`; the dry-run currently
requires those timestamps to be identical. After that contract is corrected,
the NL rows also need a separately reviewed collision plan because their
readable successors already occupy the canonical keys. No production repair
was run here.

Original retained NO, SE and DK sources and receipts were replayed read-only:

| Market | Body SHA-256 | Source-bound monthly offerings |
| --- | --- | --- |
| NO | `fedeb763fe9c16a41fbfc586d3e5365d8891fc1d466eeb12f0eed21568abf616` | Basis med reklame 89 NOK; Standard 149 NOK; Premium 189 NOK |
| SE | `3037a6657caeea8997834d53edcaebc030eed1a645ff43c5d96c1a7a97efc076` | Basic With Ads 89 SEK; Standard 149 SEK; Premium 189 SEK |
| DK | `65738bc014abb606534847e478486274edac6cf7e85cad4defcd69f7eef0de2e` | Basic With Ads 79 DKK; Standard 129 DKK; Premium 169 DKK |

Each source was classified `PROVIDER_SOURCE` with hash-verified G1 evidence.
This replay did not write a Verified price or alter the original observation.

## Separate future preflight

The local `dryRunVerifiedPlanIdentityRepair` module has no write path, API,
startup hook or CLI entry point. Its inputs must be a transactionally consistent
snapshot of current rows, history observations and exact original selectors.
For every candidate, it loads the original retained journal, body and receipt;
rechecks SHA-256 and the unchanged V3 Truth pipeline; and requires exact service,
market, URL, amount, currency, timestamp, offer ID, source-bound name and one
history observation. It blocks missing or ambiguous selectors, names, history,
canonical slugs and Old Verified predecessors. It emits proposed mappings,
specific block reasons, a database snapshot digest and a deterministic report
digest. Repeated dry-runs on unchanged inputs must have the same digest.

Before any production write, an operator must independently review the full
per-row report and approve its exact digest. A changed current row, history
row or retained evidence invalidates that approval. The 82 potential mappings
must not be treated as 82 certified write operations until this preflight runs
against the complete original journals and current database snapshot.

## Future transaction requiring separate approval

Under the ordinary Verified writer's service-market advisory lock, lock the
exact current rows and history series. Re-run the evidence preflight and
compare the approved digest. Preserve a traceable copy of every retired Old
Verified row and its reason. Retire only uniquely replaced old current rows.
Rekey the corresponding V3 current row to the canonical slug, readable
source-bound name and catalog identity while retaining its original source URL,
verified timestamp and history series ID. The repair itself must not admit a
new price, change an amount, add a history event or rewrite original evidence.
Any mismatch rolls back the entire transaction.

After commit, verify one active V3 row per documented tier, zero replaced Old
Verified rows, unchanged prices, history series, observations, receipts and
source hashes, and readable API/mobile plan options. Repeat the dry-run to
prove idempotency. Preserve a separate backup and audit record; recovery must
be a separately approved transaction. No production repair is performed by
this implementation.
