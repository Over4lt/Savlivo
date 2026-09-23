# Durable Admin Preflight

The previous HTTP handler called `Operations.preflight` → `lifecyclePlan` →
`spawnSync(--check)`. A 336-second check blocked the API event loop for that entire
period, including passkey/auth requests (normally a 10-second client deadline).
The Preflight client deadline was 630 seconds, not the limiting auth deadline.
Admin sessions independently expire after 60 minutes, with a browser expiry timer.
An abort/502 does not revoke a session; a current-token 401 or that timer clears it.
Production diagnostics prove native completion, not the exact logout timing or
any Render proxy limit. No production traffic is needed to identify the synchronous
HTTP-thread defect. Inability to log in after the check would need separate evidence.

POST `/v1/admin/v2-operations/preflight` now atomically reserves an opaque operation
and promptly returns RUNNING. A bounded worker-thread isolate invokes the SAME
Operations.preflight, retaining all native Genesis/selection/revision/capability/
storage checks. It does not enqueue research. The native check remains bounded at
600 seconds; the isolate has a 256 MiB heap limit and a 15-minute outer deadline.
The fixed 30-minute Preflight token begins after successful validation.

Authenticated GET `/preflights/:id` returns actor-owned status/result; GET
`/preflights` supports recovery. Admin polls every five seconds, at most 180 times,
using ordinary 10-second HTTP requests. Disconnect/logout stops polling, not the
validation. Recover Preflight after refresh/relogin restores its exact filters,
services and capabilities, verifies preview revision/membership, and presents the
normal review/confirmed-Start boundary. Valid reauthentication as the SAME admin
actor is allowed; another actor or an unauthenticated session cannot claim it.
Both lifetimes are absolute and independent. Polling, recovery and relogin never
renew a Preflight token. Authenticated requests never renew the Admin session.
Existing sessions/tokens keep their stored expiry; new lifetimes apply at issuance.
Logout revokes the current session server-side; if the server is unreachable,
the browser clears its credential but cannot guarantee server revocation.
Reauthentication is required after session expiry. Multiple sessions remain
independently revocable; all resolve to the same user ID for the same account.

Equivalent actor/input requests reuse an in-flight or unexpired successful result.
Only one validation operation is admitted globally per Operations store; different
concurrent work receives PREFLIGHT_BUSY. Terminal records expire after 24 hours
and are capped at 32 (pruned on admission; expired records are hidden on reads).
Process interruption fails closed; an interrupted operation requires a fresh check,
not an assumed success. No automatic replay or research job is created. Tokens and
results live in the existing atomic Operations state on persistent storage.

Start still requires the existing actor-bound token, confirmed:true, expiry,
frozen selection/revision, storage/capability/conflict rechecks. Confirmed Start now
uses the durable worker path described below, without a trust cache or shortcut
around verification. Scheduling is unchanged.

## Confirmed Start (durable and recoverable)

Start previously called `Operations.start` → `plan` → `lifecyclePlan` → synchronous
native `--check`, inside the global control-store lock on the API thread. The same
full Genesis validation seen at Preflight therefore could take another ~336 seconds
(reference closure ~283 seconds) on the observed production instance. That timing
is an expectation from the same path, not a new production measurement. A timeout
could arrive after a job was committed. The existing manual token idempotency key
prevented duplicate committed jobs, but retries needlessly revalidated first and
there was no dedicated result-recovery route.

POST `/start` still accepts ONLY `{token, confirmed:true}` and requires authenticated
Run Control. It atomically reserves a START operation bound to the actor/token,
returns promptly, and uses the SAME bounded validation worker. GET `/starts/:id`
and `/starts` are authenticated, actor-isolated recovery routes. Admin polls with
short requests and exposes Recover Start after refresh/relogin. A lost response
means outcome unknown, never an assertion that no job exists. Recover Start does
not submit another confirmation or enqueue anything.

Every new enqueue still performs full native authentication/closure validation;
there is no trust cache and no skipped Genesis work. The immutable Preflight token
record supplies the frozen selection/capabilities, but its existence does not prove
current readiness. The worker revalidates the plan and catalog hash outside the
publication lock, then rechecks token expiry and exact record integrity under the
lock. Existing storage, live-readiness, and conflict checks apply at enqueue. Token
expiry is checked both before validation and immediately before publication.

Committed jobs are authoritative receipts. A retry with the same actor/token returns
that job before doing new validation, including after token expiry; this is receipt
retrieval, never a new Start authorization. New work still requires an unexpired
Preflight. Job identity is deterministically bound to actor + manual token, protecting
against a crash after artifact writes but before atomic state publication. The poller
only executes jobs present in the authoritative state. Retries cannot allocate a second
job directory for that confirmation; conflicting/non-initial on-disk job records fail
closed. Existing random-ID jobs remain recoverable by their idempotency key.

If worker completion reporting is lost after enqueue, status resolves from jobs rather
than reporting failure. Active confirmation retries reuse the operation. Distinct
Preflight/Start validation operations cannot overlap within the store. Interrupted
validation creates no automatic retry; explicit retry must pass current authorization
and expiry again. The shared 32-record/24-hour operation retention applies, while the
existing durable job history remains the receipt after operation retention expires.
Neither these HTTP handlers nor the validation worker executes research: only the
existing poller can execute a deliberately queued job. Scheduling remains unchanged.

## Live admitted-job monitoring

After confirmed Start returns a job, Admin monitors that exact ID through the
actor-owned read-only `GET /v1/admin/v2-operations/jobs/:id` endpoint. The source
is Operations `state.json`, not the original Start receipt or cached run index.
The monitor survives Operations tab navigation; logout/disposal cancels it.
Requests run sequentially every 10 seconds, stop on terminal status, and are
bounded to 360 attempts or five consecutive failures. Failures preserve the last
known status. Recover Start can reconnect monitoring without submitting Start.
No targeting reload, token renewal, state mutation or acquisition occurs on reads.

The view shows recorded services, status, timestamps and request ceiling; it does
not estimate usage or percentages. Detailed existing run views remain available
for evidence/usage. `execution-phase.json` is a best-effort diagnostic observation,
not admission or lease state. A matching preparation record with a live reporting
PID owning the control lock can label QUEUED as “Validating execution”. It never changes QUEUED to RUNNING.
Preparation completion/failure clears that label. Diagnostics do not authorize work.

`V2_JOB_EXECUTION` records preparation started/completed/failed, child spawned,
RUNNING published and mature execution outcomes, with job ID and timestamp.
Native check logs carry PREFLIGHT/START operation IDs or WORKER_PREPARE job IDs;
execution lifecycle stage logs carry EXECUTION/job ID in the existing worker log.
No tokens, environment values or evidence bodies are included in these fields.
Raw worker.log is deliberately not exposed: its existing free-form errors/output
are not a sanitized public artifact contract. Only sanitized status is added here.

Deploy backend/runtime code through the established API deployment and publish
`apps/web/admin/v2-operations.js` to the existing Webhuset Admin static deployment.
Deploy the backend endpoint first. No Genesis migration or state repair is required.

Live polling mutates existing status/timestamp text nodes only. Opening an owned
run Inspect shares the same exact-job monitor; it does not start another loop for
an already tracked job. The former 15-second Inspect timer that rebuilt the whole
Operations view is removed. Polls never call the Operations renderer, summary,
targeting, service explorer or artifact endpoints. Scroll, focused inputs, open
Inspect panels and builder selections therefore remain undisturbed. Run evidence,
counters and artifact tables are explicitly labeled inspection snapshots; updating
those requires the operator's Refresh operations action. Switching tabs is still
an explicit navigation, and monitoring continues independently until terminal
status, logout/disposal or the existing bounded retry limits.

This incremental-rendering refinement changes only the Admin module. Upload the
committed `apps/web/admin/v2-operations.js` as `v2-operations.js` in the existing
Webhuset Admin directory. It requires the actor-owned job-status endpoint from
56016d3 on Render; no additional API deployment, migration or Genesis change is
needed if that runtime is already deployed. A Render deploy alone does not update
Webhuset static files.
