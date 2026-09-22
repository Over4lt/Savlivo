# Production genesis reference contracts

A new production genesis is a new trust operation. It must not authenticate,
repair, or inherit authority from an unsealed historical control snapshot.
The existing continuation contract is unchanged.

## Reference adapters

Adapters operate on an in-memory traversal view. Original bytes are retained
and hashed; source artifacts are never normalized or rewritten.

- `new-service-controller.mjs` V1 checkpoint: only
  `services.<id>.stages.<stage>.artifact` is relative to the owning run.
  The companion run manifest must match fingerprint, cohort order and stages.
  Paths must equal the producer's exact `services/<id>/<stage>.json` form.
  Other result fields remain subject to normal unknown-reference rejection.
- Pricing verification, extraction candidate, attribution, provider-market and
  billing-interval records: `$/...` locators identify retained source structure.
  They are not filesystem paths. Filesystem evidence references remain edges.
- Monthly interpretation manifests: input filenames are relative to the named
  sibling `input` directory; source index hashes bind `corpus/sources.json`.
  Historical absolute roots are locator metadata only after the exact sibling
  layout is established. No external filesystem fallback is allowed.
- Market journal records: the record hash covers the original JSON payload
  excluding `hash`; it is distinct from the exact-byte file hash. References
  with a record hash and pointer validate both the seal and pointer. Prior
  records remain protected. Inline body locators are redundant only when the
  exact retained inline body independently matches `bodyHash`.
- Adaptive state reads: bodies belong to the target's native
  `open-web-discovery` directory. Inherited interpreter children retain their
  original directories and must match the child manifest's service/market/ID.
- Native interpreter manifests and discovery journals retain their declared
  child-run and original acquisition references. They do not confer authority.
- Reconciled pricing projections protect the original source hash and preserve
  every quarantine decision. No rejected price is re-admitted.

## Archival terminal locks

Normal reference closure still rejects `.lock` files. The explicit
`genesisArchive` inspection mode may classify exact sealed historical lock
bytes as permanent history, never as production process ownership. This
requires an independently sealed snapshot binding the parent summary, request
ledger, phase checkpoint and lock bytes; execution must be complete, request
counts must agree, and the phase must be terminal without a pending action.
This does not delete a lock, declare an active process dead, release a lease,
or authorize ordinary resume. A production genesis must keep archived lock
bytes outside its new execution ownership namespace.

## Publication gate

No PRODUCTION_GENESIS_V1 instance, bootstrap, or restore certificate may be
published until the complete dependency closure and field-level independent
provenance validate. Unknown references, unresolved required state, or failed
integrity checks remain hard blockers. The unresolved historical snapshot must
be listed as untrusted audit metadata by exact-byte hash and never be an input.

Tests use new OS temporary directories. Neither source `.savlivo` nor the
existing historical fixtures are test output locations.

## Genesis execution contract

`PRODUCTION_GENESIS_V1` binds an independently sealed state source, original
frozen lifecycle input, exact-byte protected closure, explicit capabilities,
new-run budget policy, quarantines and imported request accounting. Its
`fieldProvenance` records independently sourced values, including explicit
unknowns. Comparison with an unsealed snapshot is a separate diagnostic report;
it is never an input to construction. The excluded snapshot's path and byte hash
are audit metadata, not reference edges.

The generated lifecycle input selects a new `production-runs/<genesis-id>`
namespace. `lifecycleMain` validates the genesis before the existing mature
snapshot/planner/executor handoff. Imported states and sources are retained;
old execution locks are never reused as ownership. New snapshots bind the
genesis and protected input hashes. Ordinary resume retains its existing frozen
checkpoint and budget semantics. Imported historical request totals are not
new-run consumption and are not erased or replenished.

No historical continuation is rewritten. Without a genesis input, the original
lifecycle behavior remains in effect. A genesis export is not permission to
run live research or promote catalog prices.

## Offline operator commands

The input specification has schema `PRODUCTION_GENESIS_INPUT_V1`, a sealed
`snapshotPath`, `lifecycleInput`, exact expected cohort/baseline/reviewed/target
and accounting counts, excluded untrusted artifact metadata, creation identity,
creation timestamp, and engine/policy/code versions. Output must be a new
isolated directory outside the source repository.

```sh
node services/api/src/research-v2/storage/cli.mjs genesis-export --spec /absolute/spec.json --output /absolute/new-export
node services/api/src/research-v2/storage/cli.mjs genesis-validate --destination /absolute/restored-export
node services/api/src/research-v2/storage/cli.mjs genesis-plan --destination /absolute/restored-export
```

`genesis-plan` validates the export, seeds the existing mature planner, and
returns bounded action proposals without executing them, writing a checkpoint,
or consuming requests. Restore validation must deny original corpus access;
a passing check while the original corpus remains an implicit fallback is not
a certification.

The export preserves repository-relative immutable inputs as well as `.savlivo`
objects. It is a repository overlay, not a directory to blindly nest under the
persistent mount. Deploy matching committed code separately; restore the
`.savlivo` subtree at the persistent mount and validate the immutable repository
inputs at their original relative locations. Do not upload the developer tree.
The standard runtime still requires its committed static code/configuration and
installed runtime dependencies. None of those is permission to read omitted
historical evidence from the original Mac.

Historical compact Analytics fields are retained only where they exist. This
corpus has no prior `storage/history` projection to import; authenticated run
summaries, ledger records and genesis field provenance preserve readable audit
history. Missing historical capability usage and before/after observations
remain unknown. Subsequent mature finalization continues using the existing
compact history publisher; genesis does not fabricate completed research runs.

## Certification scope and storage

The real independently sealed source closure contains 32,991 files and
2,722,725,795 logical bytes. The source snapshot is `0b837783...`; the excluded
unsealed artifact is `cfd264e4...`, exact-byte SHA-256
`2d586720ca2e9a3bc7e12de48f983abdfe645db60d941d3ad18ffc262e422ada`.
This is a complete reachable closure certification, not a fresh scan of all
1.78 million development files and not proof that excluded files are deletable.

The final export manifest, generated input and genesis add three files. Exact
measured export totals are 32,994 files, 2,768,575,644 logical bytes and
3,270,520,832 allocated bytes on the local filesystem. Allocated storage can
differ after restoration on another filesystem. No historical byte
normalization, evidence migration, deduplication or deletion was performed.

Retain the external certification reports and export manifest with the backup.
A 50 GB initial disk leaves space for this approximately 3.05 GiB allocated
bootstrap, 8 GiB admission reserve, 2 GiB active-stop reserve and a 6 GiB stress
round, plus the expected retained operating window. This is initial headroom,
not a promise of unlimited biweekly retention. Destructive GC remains disabled;
monitor protected growth and revalidate backups before any future cleanup.

The independently restored real export validated with original `.savlivo`
reads denied. It preserved 188 candidates, 275 exclusions, 104 reviewed
providers, 161 retained targets, two quarantines and separate 3,838 / 721 / 404
request histories. The mature planner produced 161 offline target plans and
consumed zero requests. A plan may legitimately be STOP/unresolved.

Field reconciliation contains 1,613 independent provenance records: 1,319
historically comparable matches, zero unexplained differences, and 294
independent identity/authority/new-configuration records without a corresponding
snapshot field. The separate 357-record historical comparison has 355 matches
and expected key/codeHash differences. None of these comparisons authenticates
the excluded snapshot. Source integrity rechecked 32,992 files with zero changes.

Validation: 239 storage, lifecycle, Operations and Admin tests passed; API
production build and launcher syntax check passed. Generated exports and
certificates are external operational artifacts and must never be staged.
