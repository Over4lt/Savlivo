# Certified Genesis deployment and repository overlay

## Root cause and permanent contract

The certified export is a repository overlay, not just a `.savlivo` directory.
Restoring only its persistent subtree omits authenticated repository-relative
inputs. A manual repository overlay disappears on a fresh ephemeral deployment.
The genesis seal and protected-reference hashes were correct; placement and
startup enforcement were missing.

Do not change the certified genesis or bulk-commit historical artifacts.
Deploy executable modules and contracts with Git. Keep the currently tracked
immutable inputs in Git as already intended; their deployed bytes must match
the certified closure. Generated historical inputs remain bootstrap artifacts,
even when their certified logical path begins with `docs/`.

The complete 30-file overlay is also retained under:

`.savlivo/research-v2/storage/deployment/<internal-genesisHash>/`

It contains the original sealed export manifest and `repository/<original-path>`
for each non-`.savlivo` reference. It is persistent bootstrap data, never Git
content. Back it up with the genesis and protected corpus. Unknown storage
classification remains protected; no GC or historical migration is introduced.

At startup the supervisor validates the active genesis/input seals, exact export
manifest membership and all overlay hashes before starting either child. It
restores missing data inputs only, never overwrites conflicts, and requires
executable `.mjs`/`.js`/`.ts` files to be deployed with matching bytes. Selection
of an old code version from an archive is not automatic. Missing/corrupt cache,
path escapes or conflicting inputs fail with an actionable bootstrap error.
No research is planned or dispatched by this startup step. Gates stay OFF.

The mature `--check`/`--live` entrypoint independently checks this placement
contract before loading the universe. The existing full genesis validator then
checks the entire evidence closure as before. Startup's small overlay check is
not a replacement for full integrity validation.

## Exact non-persistent closure

This list comes from `PRODUCTION_GENESIS_EXPORT_V1.files`, checked against
`PRODUCTION_GENESIS_V1.protectedReferences`; it is not a string search.
There are 30 files (28 docs, two contracts), totaling 21,431,106 bytes.
Only the implementation of this restore contract is newly committed.

| Certified path | Existing Git status | Deployment role |
|---|---|---|
| `docs/catalog/global-47/evidence.json` | Tracked | Authenticated immutable data; persistent overlay repairs absence |
| `docs/catalog/global-47/research-v2/prepare-v15-new-services.mjs` | Tracked | Deploy matching code; archive never substitutes it |
| `docs/catalog/global-47/research-v2/run-v15-full-v2.mjs` | Tracked | Deploy matching code; archive never substitutes it |
| `docs/catalog/global-47/research-v2/v15-discovery-20260921/base-targets.json` | Bootstrap only; do not add to Git | Authenticated immutable data; persistent overlay repairs absence |
| `docs/catalog/global-47/research-v2/v15-discovery-20260921/blocked-targets.json` | Bootstrap only; do not add to Git | Authenticated immutable data; persistent overlay repairs absence |
| `docs/catalog/global-47/research-v2/v15-discovery-20260921/candidate-reconciliation.json` | Bootstrap only; do not add to Git | Authenticated immutable data; persistent overlay repairs absence |
| `docs/catalog/global-47/research-v2/v15-discovery-20260921/discovery-input.json` | Tracked | Authenticated immutable data; persistent overlay repairs absence |
| `docs/catalog/global-47/research-v2/v15-discovery-20260921/expanded-service-universe.json` | Tracked | Authenticated immutable data; persistent overlay repairs absence |
| `docs/catalog/global-47/research-v2/v15-discovery-20260921/full-identity-decisions.json` | Tracked | Authenticated immutable data; persistent overlay repairs absence |
| `docs/catalog/global-47/research-v2/v15-discovery-20260921/funnel.json` | Bootstrap only; do not add to Git | Authenticated immutable data; persistent overlay repairs absence |
| `docs/catalog/global-47/research-v2/v15-discovery-20260921/launch-targets.json` | Bootstrap only; do not add to Git | Authenticated immutable data; persistent overlay repairs absence |
| `docs/catalog/global-47/research-v2/v15-discovery-20260921/manifest.json` | Tracked | Authenticated immutable data; persistent overlay repairs absence |
| `docs/catalog/global-47/research-v2/v15-discovery-20260921/new-service-market-targets.json` | Bootstrap only; do not add to Git | Authenticated immutable data; persistent overlay repairs absence |
| `docs/catalog/global-47/research-v2/v15-discovery-20260921/overnight-preflight-summary.json` | Bootstrap only; do not add to Git | Authenticated immutable data; persistent overlay repairs absence |
| `docs/catalog/global-47/research-v2/v15-discovery-20260921/reviewed-provider-bindings.json` | Bootstrap only; do not add to Git | Authenticated immutable data; persistent overlay repairs absence |
| `docs/catalog/global-47/research-v2/v15-discovery-20260921/service-cohort.json` | Bootstrap only; do not add to Git | Authenticated immutable data; persistent overlay repairs absence |
| `docs/catalog/global-47/research-v2/v15-mature-handoff-20260921/lifecycle-input.json` | Tracked | Authenticated immutable data; persistent overlay repairs absence |
| `docs/catalog/global-47/research-v2/v15-mature-handoff-20260921/pending-review-findings.json` | Bootstrap only; do not add to Git | Authenticated immutable data; persistent overlay repairs absence |
| `docs/catalog/global-47/research-v2/v15-mature-handoff-20260921/price-output-quarantine.json` | Tracked | Authenticated immutable data; persistent overlay repairs absence |
| `docs/catalog/global-47/research-v2/v15-mature-handoff-20260921/provider-input-corrections.json` | Bootstrap only; do not add to Git | Authenticated immutable data; persistent overlay repairs absence |
| `docs/catalog/global-47/research-v2/v15-mature-handoff-20260921/provider-workbook-input.json` | Bootstrap only; do not add to Git | Authenticated immutable data; persistent overlay repairs absence |
| `docs/catalog/global-47/research-v2/v15-mature-handoff-20260921/research-scope.json` | Tracked | Authenticated immutable data; persistent overlay repairs absence |
| `docs/catalog/global-47/research-v2/v15-mature-handoff-20260921/retained-reconciliation.json` | Bootstrap only; do not add to Git | Authenticated immutable data; persistent overlay repairs absence |
| `docs/catalog/global-47/research-v2/v15-mature-handoff-20260921/review-worklist.json` | Tracked | Authenticated immutable data; persistent overlay repairs absence |
| `docs/catalog/global-47/research-v2/v15-mature-handoff-20260921/reviewed-continuation-states.json` | Bootstrap only; do not add to Git | Authenticated immutable data; persistent overlay repairs absence |
| `docs/catalog/global-47/research-v2/v15-mature-handoff-20260921/reviewed-continuation.json` | Bootstrap only; do not add to Git | Authenticated immutable data; persistent overlay repairs absence |
| `docs/catalog/global-47/research-v2/v15-mature-handoff-20260921/reviewed-provider-bindings.json` | Tracked | Authenticated immutable data; persistent overlay repairs absence |
| `docs/catalog/service-audit.json` | Tracked | Authenticated immutable data; persistent overlay repairs absence |
| `packages/contracts/src/catalog.ts` | Tracked | Deploy matching code; archive never substitutes it |
| `packages/contracts/src/markets.ts` | Tracked | Deploy matching code; archive never substitutes it |

## Full fresh restore

First deploy matching application code with controls OFF. Before setting the
Genesis lifecycle environment variable, restore the complete certified export
(not only `.savlivo`) using:

```sh
node services/api/src/research-v2/storage/cli.mjs genesis-restore --source /tmp/savlivo-genesis-export --destination /opt/render/project/src --expected-genesis-hash 29475fe999d34df20a36d75ea13144e59dac5aa2456872d19f80067f89813145
```

`/tmp/savlivo-genesis-export` must contain the transferred certified export,
including `genesis-export.json`. The command validates the source closure,
preflights every existing destination, copies only missing authenticated files,
validates the installed closure, and registers the persistent overlay last.
Existing historical files are compared, never rewritten. Interrupted restore
cannot produce a ready receipt; re-run after investigating any partial/conflict
error. No cleanup or automatic overwrite is performed.

## Existing manually restored deployment

If all historical files and the 30-file overlay already exist, register them
with the original certified `genesis-export.json`:

```sh
node services/api/src/research-v2/storage/cli.mjs genesis-register-overlay --manifest /tmp/genesis-export.json --destination /opt/render/project/src --expected-genesis-hash 29475fe999d34df20a36d75ea13144e59dac5aa2456872d19f80067f89813145
```

This performs full installed-closure validation before persisting the overlay.
A manual tar is byte-equivalent only if every manifest hash matches; it is not
by itself durable across redeploys. Correct matching files need no replacement.
Register the persistent cache before switching to the new supervisor when the
Genesis input environment variable is already configured. An independently
validated locally generated cache can be transferred instead; its exact files
are the original manifest plus its 30 repository entries, under the persistent
`deployment/<hash>` directory. Never copy publication scratch files or an
entire developer corpus.

## Offline post-restore checks

From `/opt/render/project/src`, with all three feature gates false:

```sh
node services/api/src/research-v2/storage/cli.mjs genesis-deployment-check --input .savlivo/v2-operations-inputs/genesis-8a3c1f4e95249554716f6238cd72ae3fb5e3ddb4d3126c952362f80facd8df53.json
node --import tsx docs/catalog/global-47/research-v2/run-v15-mature-v2.mjs --lifecycle --input .savlivo/v2-operations-inputs/genesis-8a3c1f4e95249554716f6238cd72ae3fb5e3ddb4d3126c952362f80facd8df53.json --check
```

Expected: cohort 188, baselineExcluded 275, reviewed 104, retainedTargets 161,
requestsConsumed 0, executionStarted false. Capability credential readiness may
be false in an offline validation environment; no credentials need be fabricated.
`--check` can publish a new control snapshot in the new genesis execution
namespace; it does not modify historical snapshots or spend budgets.
The genesis hash remains `29475fe999d34df20a36d75ea13144e59dac5aa2456872d19f80067f89813145`.
Startup remains `npm --workspace @savlivo/api start`. No run-control or scheduling
activation is part of restore. Subsequent fresh deployments reconstruct missing
data from the persistent cache automatically and validate conflicts fail-closed.

## Real-corpus validation

The certified export restored through `genesis-restore` into a new isolated
repository. Native `lifecycleMain --check` passed under an OS sandbox denying
network, original `.savlivo`, original certified data-input reads and writes
to the source repository. It reported 188 candidates, 275 exclusions, 104
reviewed providers, 161 retained targets, zero consumed requests and
`executionStarted: false`. Native checkpoint fsync remained enabled in the
isolated new execution namespace. Historical accounting remained 3,838 plus
separate 721 and 404 parent ledgers; Genesis was not resealed.

All 32,991 protected source files and the excluded unsealed snapshot remained
unchanged. All 15 tracked overlay files matched Git's certified byte hashes;
the other 15 remained bootstrap-only. Regression validation: 262 storage,
lifecycle, Operations/Admin and supervisor tests; 407 API tests; production
build and API typecheck. No production or external research was accessed.
