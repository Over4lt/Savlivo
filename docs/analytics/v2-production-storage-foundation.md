# Mature V2 production storage foundation

This is an additive, offline-tested foundation, not permission to delete the current research tree. Destructive GC has no implementation or Admin route. Historical fingerprints, evidence and request ledgers are not migrated or rewritten. The suggested initial Render persistent disk remains **50 GB**, mounted at `/opt/render/project/src/.savlivo` and shared by API and supervised worker.

## Contracts and protected boundary

`services/api/src/research-v2/storage/` owns the versioned filesystem protocols. SHA-256 covers exact bytes; canonical JSON serialization only applies to newly published metadata. All references must remain inside the repository/package root, without symlinks or traversal. Stable reads check inode/size/mtime/ctime before and after reading.

A `V2_STORAGE_ROOTS_V1` inventory identifies canonical inputs, Operations state, lifecycle snapshots, completed/recent runs and explicit roots. Classes are PERMANENT_CANONICAL, PERMANENT_HISTORY, REFERENCED_EVIDENCE, RESUME_CRITICAL, SHORT_TERM_DIAGNOSTIC, REGENERABLE_CACHE, DUPLICATE_CONTENT, DEVELOPMENT_FORENSIC_ONLY and UNKNOWN_OR_UNSAFE_TO_DELETE. Duplicate groups do not replace the protecting class.

Closure traversal understands explicit JSON/JSONL references, `inputHashes`, native body paths, legacy lifecycle snapshots and finalized receipts. Unexpected schemas/path fields, missing files, hash mismatches, lock references, symlinks and scan limits block certification. Unknown files stay protected. It is intentionally conservative: more historical adapters may be needed before the existing development corpus can be certified. Never bypass a blocker by declaring structured JSON to be opaque bytes.

New mature run lineages carry `storageBoundaryVersion: 1`. On successful execution finalization the existing executor attempts to publish `V2_FINALIZED_REFERENCES_V1` under:

```
.savlivo/research-v2/storage/finalized/<hash-of-run-path>.json
```

The receipt records cohort/baseline/capabilities, roots, files/hashes/classes/reasons, engine/policy/schema versions and continuation state/page inputs. Both file hashes and a fresh traversal of its declared roots are validated. Later snapshots can consume that explicit closure instead of indiscriminately hashing all files under that parent. Research evidence can remain unresolved: execution finalization does not mean verification.

Historical runs without this lineage version keep the existing whole-parent-file contract. Existing snapshot hashes are never rewritten. A closure blocked by an unknown dependency stays under legacy protection; history can still be published with a null finalization hash. Storage finalization failure is reported separately and never fabricates research success or deletes a checkpoint. Parent locks are still rejected even when a finalized receipt exists.

This foundation does **not** compact the existing inherited payloads or break their transitive pins. A current V15 production bootstrap may therefore remain large or blocked. No current-corpus size reduction is certified by installation alone.

## Compact permanent Analytics

New finalizations publish immutable per-run `summary.json` and per-service `services.jsonl` under `storage/history/<run-path-hash>/`. A content-addressed index and atomically replaced pointer are rebuildable projections, not new evidence truth. Existing PID leases serialize index rebuilding. An incomplete publication is not visible until its summary is published; repeat publication must match exact bytes.

The projection records actual available statuses, prices as observations (not catalog defaults), frozen capabilities, route accounting, budget, uncertainty and provenance hashes. Prior published parent observations provide before/after state and price differences. Unavailable values stay null. Missing ledgers never mean zero usage. Groq stays separate from Direct; Browser reservations remain charged when results are uncertain. Raw semantic output/prompts are not copied into Analytics.

`GET /v1/admin/v2-operations/history` exposes the compact index with pagination. It does not scan the heavy research tree. Old run detail remains unchanged. After a crash, rerunning the finalizer/index builder is idempotent; no duplicate service/run observations are appended. A retained receipt protects the full source final-disposition evidence behind the compact projection.

## Exact-byte evidence store

`putEvidence` writes one immutable `blobs/sha256/<prefix>/<hash>` and separate sealed `observations/<observation-id>.json` records. Two retrievals remain two observations even when bytes are identical. `resolveEvidence` supports explicit V2 blob and legacy byte-path references; it verifies hashes and sizes. Authority, retrieval and verifier decisions are never merged. Encoding and quote offsets remain compatible because no normalization is performed.

This task provides the resolver/store API and tests; it does not rewrite all mature acquisition adapters or migrate historical paths. Existing consumers continue using legacy evidence unchanged. Broader producer adoption can happen incrementally with explicit versioned references.

Immutable publication uses fsync and atomic no-replace hard-link publication, never symlinks. Publication scratch links are deliberately retained; they share the inode and are treated as protected/unknown by inventory. They are not authority aliases. A later cleanup implementation may handle these only under a specific validated publication protocol.

## Retention and dry-run GC

Policy: permanent canonical/history; referenced evidence protected; active/queued/interrupted/resumable state protected without TTL; latest four finalized completed runs **plus all younger than 60 days** retained. Only explicitly declared, finalized and unreferenced diagnostic artifacts can expire after 30 days, diagnostic screenshots after 14, and rebuildable caches after seven. A failed run without a proven boundary is protected. A stale PID is not abandonment.

Dry-run reads Operations coordination hashes, inventories the scoped files, traverses references and rechecks files, directory membership and coordination state. Any race invalidates certification. The plan contains a root-generation fingerprint; `validatePlan` rejects a stale generation. Allocated bytes are deduplicated by inode. Exact-content duplicate groups are reported separately.

There is no deletion executor. Every uncertain plan has `safeToGc: false`, zero reclaimable files and zero referenced artifacts selected. Even a true value is only a scoped dry-run result, not permission to execute deletion.

Offline operator command (potentially expensive; never execute in an HTTP request):

```sh
node --import tsx services/api/src/research-v2/storage/cli.mjs gc-dry-run \
  --root "$PWD" \
  --input docs/catalog/global-47/research-v2/v15-mature-handoff-20260921/lifecycle-input.json \
  --output /tmp/savlivo-storage-inventory-NEW \
  --publish-index true
```

Output must be a new/empty directory. `--publish-index true` writes only new storage metrics and its rebuildable pointer, not source run artifacts. Omit it for a fully read-only source inventory. `--spec` accepts an explicitly reviewed `V2_STORAGE_ROOTS_V1` scope instead of inferred lifecycle roots. Scan limits and unknown schemas are blockers, not reasons to omit roots.

Admin Storage reads only that bounded compact metrics document and filesystem `statfs`; it never starts inventory, GC or research. Capacity/used/available and admission reserve are live metrics. Class bytes, duplicate bytes and reclaimable bytes are timestamped inventory results. Missing inventory and growth forecasts are reported unavailable. No exhaustion estimate is invented.

## Production bootstrap/export

Export accepts `V2_BOOTSTRAP_INPUT_V1`:

```json
{
  "schema": "V2_BOOTSTRAP_INPUT_V1",
  "lifecycleInput": "path/to/frozen-lifecycle-input.json",
  "receipt": ".savlivo/research-v2/storage/finalized/<run-path-hash>.json",
  "history": [".savlivo/research-v2/storage/history/<run-path-hash>/summary.json"]
}
```

The builder validates receipt completeness and follows the frozen input, receipt and all available permanent history summaries/indexes. It invokes the existing `inspectLifecycleInput` validator with an explicit restored root; cohort, alias, reviewed-binding, frozen-hash and historical-ledger checks are not reimplemented or weakened. It validates exact cohort/baseline/capabilities against the receipt. It rejects absolute runtime references, escaping paths, secret-bearing configuration fields, hash mismatches and missing references. All included source bytes are copied unchanged to a new destination; the source is never modified. Restore uses relative paths under the new root. The bootstrap is a data overlay onto the separately deployed repository, not a replacement application build.

```sh
node --import tsx services/api/src/research-v2/storage/cli.mjs export \
  --root "$PWD" --spec /tmp/reviewed-bootstrap-input.json \
  --destination /tmp/savlivo-bootstrap-NEW \
  --at 2026-09-22T00:00:00Z --source-identity <source-commit-and-run>
node --import tsx services/api/src/research-v2/storage/cli.mjs validate-export \
  --destination /tmp/savlivo-bootstrap-NEW
```

Run the same validation against a copied/restored destination. If the rebuildable history pointer needs rebuilding, run `node --import tsx services/api/src/research-v2/storage/cli.mjs rebuild-history --root <restored-repository>`. `bootstrap-manifest.json` records hashes, sizes, classes, source identity, closure footprint, included footprint and validation. Uninspected outside-closure bytes/counts remain null. A failed export is never usable; its manifest/validation must not be bypassed. Never upload the 133 GiB development tree indiscriminately. The existing 188 cohort and 275 excluded baseline must compare exactly after restore. Capability permission defaults cannot be silently changed.

Only synthetic exports are validated by the implementation tests. A real production package is **not** claimed valid until the actual source closure passes. Historical absolute references or unsupported path forms require a separately tested adapter, not rewriting historical JSON.

## Low space

`V2_STORAGE_MIN_FREE_BYTES` defaults to 8 GiB (minimum configurable value 1 GiB). New Operations jobs and queued execution require sufficient measured capacity. Preflight exposes the result. CLI mature live entry uses the same gate. Missing filesystem metrics block new admission; no emergency deletion occurs. The existing active lifecycle stops between bounded actions when measured free space falls below 2 GiB, preserving checkpoint/finalization headroom. Missing metrics do not kill an already active worker. Admission is not a filesystem quota: simultaneous non-V2 disk writers can still consume the reserve.

Keep API and worker on the same persistent filesystem with the existing single-instance/supervisor arrangement. No Render configuration is changed here. All mutable `.savlivo` contents remain Git-ignored.

## Backup/restore and future destructive GC

Back up canonical inputs, protected receipt closure, compact history, immutable evidence and necessary Operations job/schedule/checkpoint state to an encrypted off-volume store. Take a quiescent or coordinated filesystem snapshot; live copying alone cannot prove consistent queue/checkpoint state. Keep the deployed engine/policy version and bootstrap manifest with each backup. Do not include credentials in the package.

Restore with controls/scheduling OFF. Validate every hash/reference, frozen cohort, excluded baseline and frozen capabilities. Rebuild the Analytics index, inspect uncertain intents and preserve spent budgets; never treat a stale PID as completed research. Validate API/worker shared storage and disk reserve before enabling controls. Render persistent disk is not backup.

Before future destructive GC: support all real reference schemas; complete production export/restore acceptance; prove canonical and historical root completeness; implement a coordinated retirement journal and grace period; test crashes at every phase and queue/publication races; require zero referenced deletions and a matching current root generation. Keep that activation a separate reviewed change. This release has no destructive Admin action or command.
