# Real bootstrap blocker disposition — 2026-09-22

## Frozen workbook extraction

Classification: **provenance-only source locator**.

`prepare-v15-new-services.mjs` reads `discovery-input.json` rows, sidepool rows,
main sheet, and workbook hash. It never opens `input.source`. The mature handoff
reads the frozen manifest and derived universe, not the workbook. The extraction
is itself pinned by the manifest:

- Extract SHA-256: `12a015abcfb37b2cb5777a1d9bf5febafdcf675cdcf7bf34659d5328e912e31f`
- Recorded workbook SHA-256: `877dba9b313373e71902747c7fdaacb74e75bffe0b45f719e28ac4477e7c7897`

The adapter recognizes this unversioned extraction only through the companion
version-1, authority-bootstrap-1 frozen manifest, matching extract hash, workbook
hash, sheet and row shape. The companion manifest is a protected dependency.
Only `source` is a historical locator. Original JSON bytes and the original path
remain intact. Other unknown path fields still fail. Bootstrap portability uses
this same adapter; it does not generally exempt absolute paths. An isolated
export/restore regression proves no access to the original workbook is necessary.
The workbook itself was not opened or copied.

## Nested provider interpretations

All 113 `runDirectory` occurrences in the inspected legacy snapshot occur at
`states[*].target.providerInterpretations[*]`. The producer is
`live/open-web-discovery.mjs`; `retainedPriceReview` consumes the latest
`interpretation-N/provider-price-intelligence.json` in that child run.

These are immutable child-run dependency roots, not mere display strings.
The version-1 snapshot adapter requires containment within a declared parent,
the direct-acquisition namespace, and exact equality between the child's current
file membership and original `inputHashes`. It produces hash-bound file
references instead of globally permitting `runDirectory`. Files are deduplicated
by the existing closure. Escapes, symlink cycles and unfingerprinted additions
fail closed. Unknown occurrences elsewhere fail closed too.

Real validation checked 5,584 unique child files / 248,691,632 bytes; every
expected hash matched. This proves those references, not the complete snapshot
closure. Nested quarantine decisions and field-verification DOM locators retain
their existing versioned semantics.

## Unsealed historical snapshot

Artifact:
`lifecycle-control-e49d6659153c5160/cfd264e4948c23ea1df3727d2961a437e220f51a9a88c4cbf8a64f7cb93ff361.json`

Classification: **UNRESOLVED**. The reason for the missing seal is not proven.

- Stored `snapshotHash`: **ABSENT**, not a differing digest string.
- Exact-byte SHA-256: `2d586720ca2e9a3bc7e12de48f983abdfe645db60d941d3ad18ffc262e422ada`
- Recomputed payload SHA-256: `06733cc7a62bca7eb7ecb684d40f0745256117863e73b3e56b634c9bbf4b70ae`

The producer committed in `d9d4a7b` and retained through `51bba91` hashes UTF-8
`JSON.stringify(snapshot)` before appending `snapshotHash`; `atomic` then writes
pretty JSON. Validation removes `snapshotHash` and repeats that exact algorithm.
All other fields participate, in insertion order: version, key, cohort, parents,
states, sources, inputHashes, quarantine, codeHash, historicalRequests and
parentRequests. Sorted-key hashing is not the historical contract.

The six other snapshots contain valid seals. Comparison with them shows mostly
key/codeHash differences, but this does not authenticate the unsealed artifact.
No match to its exact byte hash or filename was found in their inputHashes or the
six inspected run lineages. No original authenticated copy or mutation log was
found. Filesystem timestamps do not prove whether a producer bug or later
mutation removed the seal. Current validation is not a demonstrated semantics bug.

The new read-only audit distinguishes an absent seal from an incorrect seal.
Neither is accepted. **No exception receipt is authorized or published.**
A future exception would need independent authenticated downstream references,
all dependency hashes, exact original bytes, stored/absent seal, recomputed hash,
proven cause, and scope limited to this exact artifact hash. A new hash computed
now is not independent authentication. Alternatively, exclusion would require an
explicit proof that this artifact is outside every required/resumable root; it
must not be silently dropped from the existing conservative root set.

## Certification and source protection

Certification was restarted from the real roots, not resumed past an error.
The incomplete legacy boundary remains blocked. No real bootstrap was generated,
no restored production copy was validated, and the disk purchase gate remains
**NOT YET CERTIFIED**. GC is dry-run only, with zero selected deletions.

The earlier 114 fixture files are left untouched. The mature lifecycle regression
now runs in a dedicated OS temporary repository, copies only its three immutable
registry inputs, and explicitly reads the real frozen cohort through the original
repository root. New test output does not enter the source `.savlivo` tree.

Validation: 237 focused storage/lifecycle/Operations/Admin/capability tests passed;
API production build passed. No network, research, upload, or deployment was run.
Operational reports and inventories live only under
`/tmp/savlivo-final-blockers-20260922/` and are not committed.

The repeated real scan completed with 1,782,020 files and 240,018 directories:
143,282,622,464 allocated bytes / 137,663,145,103 logical bytes. All 2,022,047
file/directory/alias metadata entries match the previous quiescent inventory.
Reference traversal stops at `STORAGE_LEGACY_SEAL_MISSING`. The source snapshot's
exact byte hash also remains unchanged. No additional source fixtures were created.
