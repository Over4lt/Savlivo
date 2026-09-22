# Render API + V2 poller runtime — 2026-09-22

Local implementation only. No deployment, service update, disk creation, migration, Git commit/push, provider acquisition or online V2 execution was performed.

## Production process entrypoint

Keep the manually confirmed Render service `savlivo-api`, Frankfurt, branch `main`.

Build remains:

```sh
npm ci && npm --workspace @savlivo/api run build
```

Start remains:

```sh
npm --workspace @savlivo/api start
```

The workspace `start` script now invokes `node scripts/production-runtime.mjs` instead of launching the API directly. The repository-owned launcher resolves the repository root from its own location, sets both children's working directory to that root, and supervises:

```text
node services/api/dist/services/api/src/server.js
node --import tsx services/api/src/v2-operations/worker.mjs --poll
```

No PM2, concurrently, separate Render Background Worker or HTTP research handler is introduced. Existing API periodic jobs are unchanged; this patch does not authorize or reconfigure the separate runtime pricing policy.

The poller always runs and writes heartbeat even with all V2 gates OFF. Actual jobs still require the existing Operations read/control/scheduling gates and queue. Startup neither creates a research job nor invokes `--live`. Existing explicitly queued/authorized work can run only after the appropriate gates are explicitly enabled.

## Shutdown, failure and recovery

- API and poller are separate supervised children/process groups on POSIX (Render Linux and macOS tests).
- The poller has an IPC lifetime connection to the launcher. Under this connection, its execution children stay in the poller's process group instead of detaching into separate groups. Native interpretation subprocesses inherit that same group. Standalone operator poller use retains detached execution groups.
- SIGTERM/SIGINT stops both leaders. The poller interrupts its idle wait immediately, stops queue dispatch, signals only its own execution children and allows up to 18 seconds for them to finish/checkpoint. It never signals arbitrary PIDs recovered from historical files.
- At 20 seconds the launcher kills any remaining owned process groups. A further bounded exit wait is at most one second. Configure/verify Render's termination grace is longer than 21 seconds, with margin. Forced termination is logged as `SHUTDOWN_DEADLINE`.
- Any unexpected child exit, including code 0, stops its sibling and causes a nonzero launcher exit. There is no internal restart loop that could repeat dispatch. Host process restart policy handles recovery.
- If the launcher dies unexpectedly, the poller's IPC disconnect handler drains its children and cleans up its own group.
- Graceful execution stop uses existing mature checkpoint boundaries. Forced interruption retains pending reservations, ledgers and leases. It does not synthesize a completed action or return spent budget. Existing interrupted-action reconciliation can require human review before resume.
- On restart, the same state is read; nothing is reset. Dead-owner leases remain governed by existing lease logic. PID-only locks are not distributed coordination and must not be shared by multiple service instances.

## Source runtime and dependencies

API runs its compiled build. Keep the poller on its existing source entrypoint: the mature path dynamically loads the repository CLI under `docs/catalog/global-47/research-v2`, source modules and TypeScript contracts, and fingerprints source modules. Merely pointing the poller at `dist` does not remove these dependencies. A compiled-only migration would be a larger, separate change.

`tsx` was moved from API `devDependencies` to `dependencies`, retaining its version range and locked package versions. Its required esbuild dependency flags are updated in the lockfile. TypeScript remains a build dependency, so the build environment must install dev dependencies as in the existing successful build; production pruning after build may omit dev dependencies without removing `tsx`.

Include the existing mature V2/required V1 code, CLI files, contracts source, frozen configuration and API build in the release. This runtime patch is not independently deployable on old GitHub `main` without the preceding V2/Admin integration and its dependencies.

## Persistent filesystem requirement

For Render's native Node repository root `/opt/render/project/src`, use an actual persistent disk mount at:

```text
/opt/render/project/src/.savlivo
```

If the configured repository root differs, mount `<actual-repository-root>/.savlivo` instead and set matching environment. It must be a real mount, not a symlink to an external directory: existing V2 path/hash guards reject symlink escapes. Use one Render service instance; API and poller share the same filesystem and PID namespace.

This preserves:

```text
.savlivo/research-v2/            retained corpus, authority evidence, runs, ledgers, checkpoints, lineage
.savlivo/v2-operations/         durable queue, schedules, audit, heartbeat, process leases
.savlivo/v2-operations-inputs/  fingerprinted derived selection inputs
```

Research inputs outside `.savlivo`, including the frozen manifest, reviewed bindings, research scopes, worklist, lifecycle input and quarantine definitions under `docs/catalog/global-47/research-v2`, are release/configuration artifacts. Keep them unchanged and include them through reviewed Git staging. The new ignore rule covers only root `.savlivo/`; these small inputs remain eligible for Git. No file under `.savlivo` was previously tracked in this repository.

Do not put runtime corpus into Git. Do not regenerate historical evidence at build. Do not delete ledgers/checkpoints on restart or deploy.

## Required environment names

Initial safe activation settings (exact strings):

```text
ANALYTICS_V2_OPERATIONS_ENABLED=false
ANALYTICS_V2_RUN_CONTROL_ENABLED=false
ANALYTICS_V2_SCHEDULING_ENABLED=false
V2_OPERATIONS_REPOSITORY_ROOT=/opt/render/project/src
V2_OPERATIONS_STATE_ROOT=/opt/render/project/src/.savlivo/v2-operations
V2_OPERATIONS_LIFECYCLE_INPUT=docs/catalog/global-47/research-v2/v15-mature-handoff-20260921/lifecycle-input.json
V2_OPERATIONS_TIMEZONE=Europe/Oslo
```

Unset gates default to `false`; invalid gate strings fail startup. Explicit `true` remains an operator decision. The launcher rejects a repository-root mismatch rather than running against another checkout.

Configure existing secrets before live authorization, never in Git or static Admin files:

- `TAVILY_API_KEY`
- `SAVLIVO_DECODO_USERNAME`
- `SAVLIVO_DECODO_PASSWORD`

Keep the existing mature Decodo runtime authorization/routing/cost settings, via its existing config file and supported `SAVLIVO_DECODO_*` / `SAVLIVO_GEO_VERIFIER_APPROVED` overrides. No proxy-policy expansion was made. A Mac Keychain is not a production credential source.

Retain existing API requirements such as `PORT`, `NODE_ENV`, `DATABASE_URL`, `JWT_SECRET`, and current Admin authentication/origin/RP/audit settings. No additional database migration is required by the launcher.

## One-time corpus transfer

After separately approving/creating the persistent disk:

1. Keep all three V2 gates OFF and avoid an in-progress Mac research run during export.
2. Build a reviewed inventory of retained files referenced by the lifecycle/authority/continuation inputs. Transfer those files preserving their relative paths and bytes; verify SHA-256 values at the destination.
3. Preserve original failed/candidate/completed continuation ledgers (including historical 3,838, candidate 721 and completed continuation 404 requests) and their lineage. Do not rewrite original run files or counters.
4. Do not blindly activate a copied Mac Operations queue or adopt old Mac PIDs as live production ownership. Archive any Mac control-store export; initialize or deliberately migrate production control jobs through the existing controls. Preserve research checkpoints and review interrupted ownership explicitly where required.
5. Verify the server service user can read immutable corpus and write Operations/new continuation paths. Use private state permissions; do not expose `.savlivo` through the public web root.

No transfer was performed in this task. The required data volume/disk capacity must be measured on the reviewed export before provisioning.

## Offline preflight and heartbeat

Run from repository root on the service runtime (with disk mounted), not during Render's build phase:

```sh
node --import tsx services/api/src/v2-operations/preflight.mjs
```

This performs no provider requests. It validates local runtime/input/lineage and credential presence, not live credential validity. It can create local derived preflight inputs; it never starts online research.

With Operations still disabled, inspect heartbeat without secrets:

```sh
node --input-type=module -e 'import fs from "node:fs"; import path from "node:path"; const root=process.env.V2_OPERATIONS_STATE_ROOT??path.join(process.cwd(),".savlivo/v2-operations"); const h=JSON.parse(fs.readFileSync(path.join(root,"worker.json"),"utf8")); console.log({pid:h.pid,status:h.status,at:h.at,supervised:h.supervised,read:h.read,manual:h.manual,scheduling:h.scheduling});'
```

Expect a fresh heartbeat (normally every 15 seconds when idle), `RUNNING`, `supervised:true`, and gates false. Under a long bounded preflight the polling process can be busy; a stale timestamp alone is not proof of a dead process. Launcher logs identify API/poller child start/exit without printing environment values. After enabling read-only Operations, use the existing Operations summary/worker heartbeat and run detail.

## Offline shutdown/restart/resume smoke test

```sh
node --test services/api/scripts/production-runtime.test.mjs
node --import tsx --test services/api/src/v2-operations/*.test.mjs docs/catalog/global-47/research-v2/mature-lifecycle.test.mjs
```

Tests use local fake API/research children and the real poller with network denied and isolated temporary state. They exercise SIGTERM/SIGINT, unexpected child exit, a stubborn research descendant, checkpoint drain, IPC parent loss, disabled startup/restart with queued work and immutable ledger, and existing checkpoint/resume behavior. They never launch the real API against a production database or run V2 online.

For later production acceptance with gates OFF: verify `/health`, both child logs and heartbeat, then perform an explicitly authorized service restart. Confirm no owned process remains from the stopped instance, a new heartbeat appears, and corpus/ledger hashes remain unchanged. For a future authorized active run, use existing Stop safely and Resume and verify the same checkpoint/output/request usage; do not create a fresh budget to make resume pass. Do not use real online research as a deployment smoke test.

## Activation order

1. Deploy reviewed code with all three controls OFF.
2. Verify API health and existing application behavior.
3. Verify supervised poller logs and disabled heartbeat.
4. Verify actual persistent mount, permissions, corpus hashes and restart persistence.
5. Run offline V2 preflight successfully on the service runtime.
6. Enable read-only Operations (`ANALYTICS_V2_OPERATIONS_ENABLED=true`), keep both execution gates false.
7. Only after explicit authorization, enable manual Run Control.
8. Enable Scheduling only later, after reviewing persisted schedules and their next triggers.

## Release hygiene — files belonging to this runtime change

- `.gitignore` — root `.savlivo/` exclusion only.
- `services/api/package.json` — start command and tsx dependency relocation only.
- `package-lock.json` — matching tsx/esbuild production dependency flags only.
- `services/api/scripts/production-runtime.mjs` — new launcher.
- `services/api/scripts/production-runtime.test.mjs` — isolated runtime tests.
- `services/api/src/v2-operations/worker.mjs` — poller lifetime integration, execution-group ownership and early stop handling.
- `services/api/src/v2-operations/poller-runtime.mjs` — new poller shutdown helper.
- `docs/analytics/render-v2-runtime-20260922.md` — this deployment procedure.
- `docs/analytics/mature-v2-operations-20260921.md` — supersession/runtime dependency note.

Do not use `git add .`. The package/lockfile and untracked worker already contain prior integration work: stage/review that prerequisite integration separately or deliberately include it as a dependency, then stage these runtime changes. Do not include unrelated mobile, catalog, pricing-owner or migration activation edits by accident. No commit/push was performed.
