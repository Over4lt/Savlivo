# Legacy storage certification and large-corpus audit

This extends storage foundation `51bba91`. It does not change research, authority,
cohort membership, historical snapshots, or request accounting. GC is dry-run only.

## Reference semantics

`schema-adapters.mjs` recognizes the version-1 new-service discovery manifest
(`authorityBootstrap: 1`, `NEW_SERVICES_ONLY`) and its version-1 controller:
`controller.entrypoint` is repository code provenance, never an execution instruction.
It retains and hashes that code; it does not restore the old controller. Output hash
maps are dependencies and must match. Unknown additional path fields still fail.

`V2_ADDITIVE_CANDIDATES_V1` distinguishes repository file references plus document
fragments from prose. The version-1 exact-interpretation quarantine distinguishes
hash-bound source files from `V2_FIELD_VERIFICATION_V1` DOM locators.

Legacy lifecycle snapshots retain their original JSON-stringify hash contract.
Source bodies resolve against their acquisition directory and must occur in the
original inputHashes. Embedded state reads must match fingerprinted source
observations; body associations are never guessed. Robots rule paths are URL
patterns, not filesystem paths. Other unknown path semantics fail closed.

## External legacy boundary

`certify-legacy --spec <json> --output <new-external-receipt>` validates original
snapshot seals, cohort, every recognized dependency and all expected hashes.
The spec supplies snapshots, additional roots, cohort, baseline, capabilities,
createdAt, and engine/policy/schema versions. The output MUST be outside the
source repository. An incomplete closure returns an explicit failure and publishes
no receipt. Complete receipts use the existing finalized-reference schema with
`boundaryKind: EXTERNAL_LEGACY_CERTIFICATION_V1` and original legacy contracts.
Publication is atomic and immutable. No historical file is written.

`validate-legacy --receipt <file>` independently revalidates it against a source
root. Bootstrap specifications may use `externalReceipt` instead of `receipt`.
A complete receipt is copied into the isolated package; restored validation uses
only package-relative references. Nonportable historical absolute paths remain
blockers. Certification does not rewrite or silently upgrade legacy runs.

## Streaming inventory

For an exceptional full development-corpus audit:

```sh
node services/api/src/research-v2/storage/cli.mjs gc-dry-run \
  --root /Users/Thomas/Desktop/savlivo-build10 \
  --input docs/catalog/global-47/research-v2/v15-mature-handoff-20260921/lifecycle-input.json \
  --stream true --scan .savlivo --output /tmp/NEW-EMPTY-STORAGE-REPORT
```

Without `--scan`, scanning is reference-root-driven. Lifecycle root discovery
inspects immediate control directories, not every historical subtree. Admin does
not trigger corpus scans.

The streaming command writes ordered JSONL rows and a compact summary. It hashes
required reference objects, not every unrelated body. Unknown files remain
protected. It never certifies reclaimability from metadata alone: `safeToGc:false`,
zero selected deletions, and unknown duplicate bytes are explicit. The earlier
small, fully hashed GC planner remains available for bounded finalized inputs.

Memory is bounded by the reference-closure limit plus directory depth and
per-directory name limits, not total corpus entries. Default scan budgets are
3,000,000 entries (including directories/aliases), 100,000 entries per directory,
128 levels, and 30 minutes. `--limits <json>` overrides explicit limits; exceeding
one fails closed. Progress is emitted every 10,000 entries. The programmatic
iterator also accepts an AbortSignal. Directory publication races are rejected;
stream metadata is not a concurrent-GC authorization. Revalidation is required
before any future destructive implementation.

Internal symlinks are individually resolved and reported, never followed during
scanning. The canonical target must fall within a separately selected scan root;
it is visited through its real path once. Overlapping roots are collapsed. Cycles,
external targets, missing targets, and out-of-scope targets block certification.
These aliases are NOT made portable by the scanner and are not silently exported.
Allocated bytes are summed st_blocks, not unique APFS physical extents. Hardlinked
files are counted and reported; duplicate savings are unknown without hashing.

## Real certification result

The 2026-09-22 validation scanned 1,781,906 files and 239,919 directories.
All nine directory symlinks resolve to internal targets within the selected
`.savlivo` scope. No alias target was traversed twice.

The closure remains incomplete: the unversioned discovery input contains an
absolute original-workbook source, and legacy snapshot state contains additional
`runDirectory` path semantics not yet covered by an explicit adapter. No complete
legacy receipt, real bootstrap, or restore validation was produced. No source
artifact was changed. Do not interpret successful metadata traversal as evidence
closure certification or permission to reclaim space.

The independent legacy seal audit also found one mismatching snapshot:
`lifecycle-control-e49d6659153c5160/cfd264e4948c23ea1df3727d2961a437e220f51a9a88c4cbf8a64f7cb93ff361.json`.
The other six snapshot seals match their original contract. This does not certify
their transitive dependencies. The mismatching snapshot is preserved, not repaired
or silently excluded. Its reachability/current role must be established before a
production closure can be certified. Alias reports and diagnostics also have
explicit memory ceilings (1,024 aliases and 256 diagnostics by default).

Validation note: the existing mature lifecycle regression harness left 114 new
fixture files under `.savlivo/research-v2/lifecycle-test-*`. They were not staged
or removed. All 1,781,906 pre-existing source files retain their metadata and
identity. A scan after tests finished measured 1,782,020 files / 240,018 directories,
143,282,622,464 allocated bytes and 137,663,145,103 logical bytes, including those
fixtures. Future certification should run regression fixtures in isolated storage
before performing the quiescent source inventory.
