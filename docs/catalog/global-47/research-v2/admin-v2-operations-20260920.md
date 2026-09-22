# Admin V2 Operations — 20 September 2026

## Outcome and scope

Implemented an isolated Admin Analytics Operations section, artifact reader, bounded job control store, and separate scheduling/execution worker. The engine and existing Terminal runner are unchanged. All three Operations flags default off. No worker, scheduled job, or research campaign was launched during implementation. No external network requests were made.

This is a **partial acceptance**, pending deployment/runtime acceptance of the standalone worker. Offline tests validate the control contracts; they do not prove production process supervision, credentials, or live acquisitions. Optional run comparison and exhaustive historical-schema support are not implemented.

## Architecture and data flow

`Admin passkey session → existing admin HTTP authorization/audit → Operations API → durable control store → separately supervised worker → existing LOGIN_MANAGE schedule()/adaptive executor`.

Terminal and Admin results enter the same read-only artifact normalization layer. Scheduled and manual requests share `Operations.enqueue`, the same queued-run preflight, worker, manifest, adapters, checkpoints, and budgets. Operations does not extract evidence, interpret prices, decide provider authority, or implement research routing.

The standalone worker imports the frozen full-catalog scheduler and uses its existing Direct robots/public-page adapter, Tavily discovery boundary, provider classification and per-service adaptive execution. Decodo, browser, configurator and price-acquisition adapters are absent. No HTTP handler waits for campaign completion.

## Read-only Operations

Navigation: Overview, Runs, Schedules, Coverage, Unresolved, Services. Existing Growth, Plans and Product panels retain their behavior and styling.

The backend discovers supported artifacts under `.savlivo/research-v2/{universe-expansion,live,coverage-campaign}` and the dedicated control store. It recognizes catalog snapshots, campaign manifests, summaries, scheduler/adaptive checkpoints and owned job records. Nested replay fixtures are excluded. Malformed or missing optional records do not rewrite history. Scans are bounded and cached for ten seconds. Pagination is server-side.

The actual repository inspection found 17 supported run/artifact bundles, including the Terminal full-catalog campaign. Its retained current state was **275 services, 54 complete, 48 login-only, 6 management-only, 221 incomplete**. These values are observations, not constants. Price data remained **47 HIGH, 40 MEDIUM-only, 87 combined**, and refresh **506/511 observations**. The current refresh due evaluation is read-only and uses the existing refresh planner with the current clock rather than presenting the old synthetic weekly simulation as current freshness.

Incomplete includes login-only and management-only; it does not mean unsupported. Catalog eligibility, provider price confidence, price strategy and user truth are displayed separately. Missing timestamps/metrics remain unavailable. Filesystem creation times are not represented as historical execution times.

Run detail includes before/after values, request routes, fresh/retained gains, efficiency where calculable, checkpoint/progress, safe artifact projections, service drill-down, and owned-job events. HTTP success is explicitly distinguished from useful evidence. Coverage history shows recorded snapshots only, without interpolated datapoints or a winner score.

Evidence inspection separates LOGIN, MANAGEMENT and PRICE. Retained provider text is rendered as text, never HTML. Safe HTTPS links, hashes, scope, authority annotations, timestamps and recorded fresh/retained classification are exposed where available. Missing proof text is not replaced with generated claims. Raw bodies, arbitrary local files, logs and credentials are not downloadable.

## Manual control and preflight

Only `LOGIN_MANAGE` is executable. `PRICE_REFRESH`, `PRICE_INTELLIGENCE`, and `CATALOG_EXPANSION` are read-only/future capability identifiers. A future objective must supply an explicit bounded runner adapter and tests before becoming executable or schedulable.

Supported scopes are full catalog, unresolved only, and selected services. The server validates service IDs against current catalog state. Full catalog still reuses established evidence. Market and due-only execution are unavailable for this service-level objective.

Preflight uses the current retained catalog, latest retained target/checkpoint memory, and the frozen adaptive assessment function. It reports considered services, complete/reused services, actionable services, limits, capabilities, and conflicts. The actor-bound preflight token expires in 15 minutes; changed catalog state requires another preflight. Start requires explicit confirmation and is idempotent for that token.

Bounds: one or two base page reads per service; discovery zero or one; acquisition escalation zero; four scheduler rounds. Provider transport retains the existing eight-request read ceiling, two redirects, 15-second timeout and 2 MiB body bound. The per-service transport ceiling is `(reads + optional discovery destination) × 8 + optional search`, at most 25. The total requested ceiling must be positive and at most current catalog size × 25, and is further clamped to selected unresolved targets. These are safety ceilings, not planned request counts.

A read-only preflight against current artifacts considered 275 services, reused 54 complete services, assessed 221 incomplete targets and found 183 with a runnable next action; no campaign was queued. Counts will change as authoritative evidence changes.

## Durable lifecycle, stop and resume

Control persistence uses private filesystem directories, atomic JSON replacement, exclusive PID locks, UUID job IDs, and an audit event history. A queued job has its manifest, catalog snapshots, retained proofs, and operation metadata before execution. Jobs survive API restart. A corrupted control store fails closed and is not silently replaced with an empty history.

The worker repeats current-scope preflight immediately before a previously unstarted job. Newly complete work can become `SKIPPED_NOT_DUE` with zero acquisition. Once a scheduler checkpoint exists, resume retains the same manifest, lineage, consumed budgets and evidence. There are no automatic retries of interrupted jobs. A dead owned child becomes INTERRUPTED, visible for explicit resume.

Stop sets a durable request checked at the next bounded action boundary. It does not terminate a provider action midway. Resume uses the same run directory. True pause is not exposed. CLI processes are read-only: Admin does not signal, stop or resume them.

## Active Terminal protection and overlap

All objectives are serialized. Preflight and enqueue check active run artifacts and queued/running control jobs. Scheduled conflicts produce a durable `SKIPPED_CONFLICT` record with the conflicting run references.

Before spawning, the worker exclusively claims both its global execution lease and the existing CLI source campaign's `runner.lock`. An active or indeterminate owner fails closed. This closes the race between checking artifacts and starting the child. Owned reservations are distinguished from actual CLI processes in normalization. Ownership transfers to the child before execution; release removes only matching owned locks. No active Terminal lock was acquired or modified in this task.

**Runtime boundary:** this is a single-host, shared persistent-filesystem design. PID leases are not a distributed lock. Do not enable multiple hosts against this store. API and worker must see the same repository, artifact roots, process namespace, and durable state. A cloud API without the retained corpus cannot observe a laptop Terminal run automatically.

## Scheduling

Each schedule stores objective configuration, enabled state, explicit timezone, frequency, next trigger, last trigger/result, last successful job and editor identity. Up to ten schedules are accepted. Only proven LOGIN_MANAGE execution is enabled today; future objective schedules remain rejected.

Presets: Manual, Daily, Every 3 days, Weekly, Every 2 weeks, Monthly. Custom is an integer 1–365 day interval, not raw cron. Weekly schedules choose weekday; monthly chooses day 1–28. Local time is explicit. Default timezone is configurable, falling back to Europe/Oslo.

DST spring gaps advance to the next valid local minute; fall repeated times run once on that local date. Missed occurrences are coalesced into one evaluated trigger, then the next occurrence is calculated after now. Trigger keys are durable and idempotent. Overlap skips are recorded, not retried indefinitely.

Run Now uses the same configuration and queue with its own idempotency key; it does not move the next automatic trigger. Edits change future scheduling only. Disable does not stop active jobs. Manual and scheduling permissions have separate flags. All actions and old/new schedule changes retain actor and timestamp in control events.

## Security and flags

All routes are beneath `/v1/admin/v2-operations/`, after existing passkey authorization, allowed-Origin checks, rate limiting, and mandatory admin audit. Control mutations also write structured actor audit events. Payload size and all objective/scope/budget/frequency values are server-validated.

No commands, environment variables, provider URLs or filesystem paths are accepted from the browser. The worker spawns only its own fixed entrypoint with a generated UUID. Service selection cannot create new authorities. Artifact endpoints return allowlisted structured projections. Secret-bearing URLs are suppressed; provider text is not executable markup.

Flags (all default false):

- `ANALYTICS_V2_OPERATIONS_ENABLED`: read-only API/UI and worker master gate.
- `ANALYTICS_V2_RUN_CONTROL_ENABLED`: manual preflight/start/stop/resume.
- `ANALYTICS_V2_SCHEDULING_ENABLED`: schedule mutations and automatic evaluation.

Runtime configuration: `V2_OPERATIONS_REPOSITORY_ROOT`, `V2_OPERATIONS_STATE_ROOT`, `V2_OPERATIONS_TIMEZONE`. State defaults to `.savlivo/v2-operations`; configure an absolute durable path outside ephemeral deployment output. Back it up with evidence and checkpoint directories.

Read-only monitoring requires only the first flag. Manual controls can run with scheduling disabled. Automatic scheduling can be disabled without deleting configuration or history. Existing Admin dashboard enablement/auth requirements still apply.

For a later authorized activation, supervise `node services/api/src/v2-operations/worker.mjs --poll` from the repository root with matching API/worker environment. This command was **not run** during this task. Configure supervision to preserve active detached child work when restarting the polling process; blanket process-group termination is not a substitute for Stop safely. Discovery additionally needs the existing Tavily credential capability. Missing discovery credentials remain an explicit runner failure; Operations does not manage secrets.

## Validation

- Operations/control/scheduling/lease tests: **45 passed**.
- Admin browser-unit tests: **37 passed**, including **25 existing Admin tests** and 12 new Operations UI tests.
- Existing API suite: **407 passed**.
- Full Research-v2 offline suite: **2,052 passed**, zero failures/skips.
- Total distinct test cases across these commands: **2,541 passed**.
- API TypeScript check and build passed. Static frontend syntax checks passed; this Admin is not a separate bundled frontend project.
- Existing 431-witness checks passed in the Research-v2 suite. The existing 437/437 simulation artifact is retained unchanged; no live simulation was run. Research source hashes remain identical to the pre-task snapshot.
- Offline tests cover unauthorized control, malformed history, idempotency, all scopes, unsafe bounds, active CLI ownership, zero-work schedules, schedule restart persistence, frequency and DST, run-now, conflict skips, retained proof separation, safe paths, stop/resume, fresh pre-spawn assessment, and checkpoint preservation.
- No live research results were fabricated. Fixture control tests operate only on temporary local artifacts; the Research-v2 suite uses its existing retained/offline infrastructure.
- External network calls: **0**. No worker or campaign launch. No production migrations, deployment, push or commit.

Validation commands:

```
node --test services/api/src/v2-operations/*.test.mjs apps/web/admin/admin.test.mjs apps/web/admin/v2-operations.test.mjs
npm --workspace @savlivo/api test
node --import tsx --test docs/catalog/global-47/research-v2/*.test.mjs
npm --workspace @savlivo/api run typecheck
npm --workspace @savlivo/api run build
git diff --check
```

## Exact task files

Added:

- `services/api/src/v2-operations/contracts.ts`
- `services/api/src/v2-operations/artifacts.mjs`
- `services/api/src/v2-operations/control.mjs`
- `services/api/src/v2-operations/http.mjs`
- `services/api/src/v2-operations/scheduling.mjs`
- `services/api/src/v2-operations/leases.mjs`
- `services/api/src/v2-operations/worker.mjs`
- `services/api/src/v2-operations/operations.test.mjs`
- `services/api/src/v2-operations/leases.test.mjs`
- `apps/web/admin/v2-operations.js`
- `apps/web/admin/v2-operations.test.mjs`
- this report.

Modified:

- `services/api/src/private-data-http.ts`
- `apps/web/admin/admin.js`
- `apps/web/admin/admin.css`
- `docs/analytics/design.md` (Operations documentation link).

Build output under ignored `services/api/dist` was regenerated. Pre-existing dirty files were preserved. Frozen research modules and protected files match pre-task hashes; no provider-specific exceptions were introduced.

## Remaining limitations and next action

- No production activation or real worker/process-supervisor acceptance was performed. Validate the collocated durable single-host deployment and credential availability before enabling controls.
- Existing DB-backed passkey integration tests require their dedicated database environment and were not run here; existing API/auth unit and Admin regression tests passed.
- Old artifacts without recognized machine contracts, exact timestamps, route counters or provenance remain partially represented or unavailable. Raw historical reports are not exposed as arbitrary file downloads.
- No arbitrary cron, true pause, CLI process control, multi-host execution, price execution or expansion execution. No run comparison score, ETA, or fabricated coverage history.
- Coverage history is a table; route-efficiency breakdown is limited to recorded counters. Some requested advanced filters/charts and schedule-detail performance aggregates remain future UI work.
- The UI is tested with the repository's DOM harness, not a live browser/device visual acceptance run.

Recommended next action: review this isolated control-plane implementation, then perform deployment/runtime acceptance with execution disabled before explicitly enabling one bounded owned LOGIN_MANAGE job. Do not infer production readiness solely from offline tests.
