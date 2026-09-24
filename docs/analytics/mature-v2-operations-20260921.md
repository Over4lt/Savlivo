# Mature V2 in existing Admin Operations

Production process startup and runtime packaging are superseded by [Render runtime 2026-09-22](render-v2-runtime-20260922.md). The launcher now supervises API and poller together; no production deployment has been performed.

Implementation is local. No deployment, scheduler polling, provider requests or online research was executed.

## Execution path

Existing authenticated Admin API → existing durable job/schedule store → existing supervised worker → `lifecycleMain` → existing mature executor/adaptive planner/acquisition/authority/verifiers/interpreters. CLI uses the same `lifecycleMain`. No Admin evidence interpreter or authority promotion was added.

Set `V2_OPERATIONS_LIFECYCLE_INPUT` to the existing frozen lifecycle input to enable this mode. Legacy history remains readable. Legacy LOGIN_MANAGE configuration is rejected in configured mature mode; existing old schedules must be edited to the mature objective before activation. No schedule is silently migrated or enabled.

Full cohort, selected services and unresolved-only use the same engine. Selection is validated against the frozen manifest, recorded in a derived immutable input under `.savlivo/v2-operations-inputs`, and included in engine fingerprints. The frozen cohort is never edited. Unresolved-only excludes only explicit engine `researchComplete:true` dispositions, never a process COMPLETE status. Objectives not supported by the lifecycle are not advertised as executable.

Manual and scheduled jobs share preflight/enqueue/worker execution. Resume pins the saved derived input/output. A changed fingerprint fails closed; it does not allocate another budget. The engine reads the original request ledger. A cohort lease also prevents concurrent CLI/Admin runs with different selections. Existing single-host PID lock semantics apply.

A repeated schedule with unchanged inputs resumes the same deterministic lifecycle rather than allocating a fresh budget to a terminal unresolved result. It is not an unbounded retry/refresh policy.

## UI and data

Existing run history discovers lineage-based mature runs before a final report exists. Existing run details and service explorer show engine-owned lifecycle phase, wave, adaptive turn, checkpoint, request usage, remaining budget, dispositions, market investigation scope, authority provenance, login/manage/cancellation and per-market pricing statuses. Engine transitions are retained in `lifecycle-events.jsonl`; the current transition is in `lifecycle-progress.json`. Final dispositions are refreshed after each phase and at termination.

Process completion remains separate from research completion. Authority review does not imply product, market or price verification. Quarantined interpretations are counted separately and are not projected into catalog prices. Missing provenance/coverage remains unavailable. Management-channel, category and price-strategy coverage is not fabricated for new candidates.

Request accounting separates Direct, Tavily and Decodo from immutable historical usage. Page-input outcome counts can include retained pages and are explicitly labelled; they are not fresh-acquisition gains. Exact Tavily-derived acquisition attribution is not present in the existing ledger and remains unavailable. Raw evidence stays in the engine artifacts.

## Runtime correction

The old control module imported `refresh/model.mjs`, which transitively installed the offline interpreter's global network/subprocess guard inside the API/worker. The unchanged pure refresh planning functions now reside in `refresh/planning.mjs`, re-exported by the old module. Admin imports only the pure planner. The interpreter offline guard remains intact. A regression test checks that importing the control plane does not patch process/network primitives.

## Existing deployment arrangement

Static Admin files remain in `apps/web/admin` for the existing Webhuset admin document root. There is no frontend bundle/build system to replace. Upload using the existing procedure in `production-admin-hosting.md`; retain its authentication/CSP/hosting configuration.

The API remains the existing API production build. The research worker is a separately supervised process, not an HTTP task. API and worker must have the same repository root, persistent research/state files and PID namespace. The existing file/PID leases are not distributed locks. Do not enable multi-host workers or put state on an ephemeral filesystem.

The deployment must include source `services/api/src/research-v1`, `research-v2`, `v2-operations`, contracts source, the existing CLI files under `docs/catalog/global-47/research-v2`, configured frozen inputs, authority evidence, quarantines, and retained `.savlivo/research-v2` corpus. Uploading only `dist` or only web files is insufficient. Preserve paths/hashes; do not delete old ledgers. `tsx` is a required runtime dependency for the worker/CLI and is now declared in API `dependencies`. Build tooling still requires development dependencies during build. See the 2026-09-22 runtime procedure for supervised production startup. No new package or database migration is required by this integration.

Use the existing API start command after its build. Working directory must be repository root. Keep the existing API authentication/environment requirements.

Required operational environment:

- `V2_OPERATIONS_REPOSITORY_ROOT`: absolute repository root.
- `V2_OPERATIONS_STATE_ROOT`: persistent writable control-store directory.
- `V2_OPERATIONS_LIFECYCLE_INPUT`: `docs/catalog/global-47/research-v2/v15-mature-handoff-20260921/lifecycle-input.json` for current V15.
- Existing `ANALYTICS_V2_OPERATIONS_ENABLED`, `ANALYTICS_V2_RUN_CONTROL_ENABLED`, `ANALYTICS_V2_SCHEDULING_ENABLED` gates; default off.
- Existing `V2_OPERATIONS_TIMEZONE` (default Europe/Oslo).
- `TAVILY_API_KEY`, `DECODO_USERNAME`, `DECODO_PASSWORD` through server secret configuration. Do not rely on a developer Mac Keychain.
- Existing Decodo authorization/routing/budget configuration from `services/api/src/research-v1/decodo-runtime-config.json` and its supported environment overrides. The integration does not broaden proxy permission; robots alone never authorizes escalation.

Before enabling controls, run from repository root:

```sh
npm --workspace @savlivo/api run build
node --import tsx services/api/src/v2-operations/preflight.mjs
```

The preflight is offline. It checks configured cohort/lineage, local runtime files, `tsx`, credential presence (not validity), writable state, and returns nonzero on missing requirements. It does not start a worker. Set the environment above through the existing host's configuration first.

For later operator-authorized activation, supervise:

```sh
node --import tsx services/api/src/v2-operations/worker.mjs --poll
```

This command can execute queued/scheduled online work and was NOT run. Use Admin Stop safely before shutting down research. Process supervision must preserve detached active workers; interrupted native reservations remain subject to the mature reconciliation policy. Restarting polling must not clear state or ledgers.

## Validation and remaining deployment acceptance

- Research V2 offline suite: 2,817 passing.
- Operations/Admin focused suites: 90 passing.
- API suite: 407 passing.
- API typecheck/build and static frontend syntax checks passed.
- Source worker, source HTTP and compiled HTTP imports passed without launching execution.
- Full-cohort Admin preflight: 188 selected, 104 reviewed, 84 human review, 275 excluded, maximum 4,072 new requests; 3,838 historical plus 1,125 parent requests remain separate.
- Selected-service preflight: one reviewed service, 36-request ceiling, same frozen 188 and baseline exclusion.
- 207,291 preserved historical files hash-checked, zero changes.
- Network calls: zero. No migrations, deployment or online research.

Production process supervision, shared persistent storage, actual configured server secrets and provider connectivity cannot be proven by offline local builds. These are deployment acceptance requirements, not claims of completed activation. Preflight currently validates presence, while the mature engine validates credentials/routing configuration at live start.

Preflight uses a bounded local subprocess and can take time to validate a large retained corpus. Current run projections intentionally do not invent unavailable acquisition attribution or automatically label unresolved dimensions NOT_APPLICABLE.

## Files changed in this integration

- `apps/web/admin/v2-operations.js`
- `services/api/src/v2-operations/artifacts.mjs`
- `services/api/src/v2-operations/control.mjs`
- `services/api/src/v2-operations/contracts.ts`
- `services/api/src/v2-operations/http.mjs`
- `services/api/src/v2-operations/worker.mjs`
- `services/api/src/v2-operations/lifecycle.mjs` (new control adapter)
- `services/api/src/v2-operations/lifecycle.test.mjs` (new tests)
- `services/api/src/v2-operations/preflight.mjs` (new offline deployment check)
- `services/api/src/research-v2/inventory/reviewed-cohort-handoff.mjs`
- `services/api/src/research-v2/inventory/reviewed-cohort-execution.mjs`
- `services/api/src/research-v2/inventory/lifecycle-continuation.mjs`
- `services/api/src/research-v2/refresh/model.mjs`
- `services/api/src/research-v2/refresh/planning.mjs` (pure existing planner extracted)
- `docs/catalog/global-47/research-v2/run-v15-mature-v2.mjs`
- This report.

Generated offline preflight snapshots/derived selection inputs are under ignored `.savlivo` control directories. Builds refresh the existing ignored API `dist`. Pre-existing unrelated dirty files, including the production migration file, were not edited by this integration.
