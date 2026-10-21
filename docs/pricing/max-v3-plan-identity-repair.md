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
