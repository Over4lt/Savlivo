# Durable Admin Preflight

The previous HTTP handler called `Operations.preflight` → `lifecyclePlan` →
`spawnSync(--check)`. A 336-second check blocked the API event loop for that entire
period, including passkey/auth requests (normally a 10-second client deadline).
The Preflight client deadline was 630 seconds, not the limiting auth deadline.
Admin sessions independently expire after 15 minutes, with a browser expiry timer.
An abort/502 does not revoke a session; a current-token 401 or that timer clears it.
Production diagnostics prove native completion, not the exact logout timing or
any Render proxy limit. No production traffic is needed to identify the synchronous
HTTP-thread defect. Inability to log in after the check would need separate evidence.

POST `/v1/admin/v2-operations/preflight` now atomically reserves an opaque operation
and promptly returns RUNNING. A bounded worker-thread isolate invokes the SAME
Operations.preflight, retaining all native Genesis/selection/revision/capability/
storage checks. It does not enqueue research. The native check remains bounded at
600 seconds; the isolate has a 256 MiB heap limit and a 15-minute outer deadline.
The normal 15-minute token begins at successful validation, unchanged.

Authenticated GET `/preflights/:id` returns actor-owned status/result; GET
`/preflights` supports recovery. Admin polls every five seconds, at most 180 times,
using ordinary 10-second HTTP requests. Disconnect/logout stops polling, not the
validation. Recover Preflight after refresh/relogin restores its exact filters,
services and capabilities, verifies preview revision/membership, and presents the
normal review/confirmed-Start boundary. Valid reauthentication as the SAME admin
actor is allowed; another actor or an unauthenticated session cannot claim it.
No session duration or authorization policy changed.

Equivalent actor/input requests reuse an in-flight or unexpired successful result.
Only one validation operation is admitted globally per Operations store; different
concurrent work receives PREFLIGHT_BUSY. Terminal records expire after 24 hours
and are capped at 32 (pruned on admission; expired records are hidden on reads).
Process interruption fails closed; an interrupted operation requires a fresh check,
not an assumed success. No automatic replay or research job is created. Tokens and
results live in the existing atomic Operations state on persistent storage.

Start still requires the existing actor-bound token, confirmed:true, expiry,
frozen selection/revision, storage/capability/conflict rechecks. Its existing
synchronous revalidation is unchanged; this change addresses Preflight transport,
not a trust cache or a shortcut around Start verification. Scheduling is unchanged.
