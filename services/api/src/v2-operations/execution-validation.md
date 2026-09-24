# Operations execution validation boundary

## Contract

Preflight checks scope, existing reviewed-provider bindings, local capability readiness,
storage and budget limits. It freezes the derived input and Human Review snapshot.
It does **not** certify the entire Genesis closure, retained history, or execution.
`preflight.validation = DEFERRED_TO_EXECUTION` makes that distinction explicit.
A valid Genesis descriptor/deployment contract is checked cheaply; full protected
bytes and reference closure are deliberately deferred. No validation result is cached.

Start recomputes this small intent binding and compares it with the actor-owned,
unexpired Preflight token. It atomically queues exactly that intent. Its admission
hash covers input/dependency hashes, scope, services, capabilities, Human Review and
budget. Hashes detect substitution; they do not independently authenticate writable
control state. Existing authenticated admin/control-store and filesystem boundaries
remain required.

Worker preparation validates the recorded binding and storage, then claims the
existing leases and spawns the child. The execution child checks the binding again,
runs the existing full lifecycle validation, and rechecks admitted intent before
publishing its output location and entering research. Failure never authorizes a
provider request. The manifest is reread before publication to reject concurrent
substitution. The lifecycle's existing snapshot validation, locks, ledger accounting,
and source-at-use checks remain intact.

## One full validation, no receipt reuse

Before: Preflight 1 + Start 1 + worker preparation 1 + execution child 1 = **4**
full Genesis validations for a normal operation.
After: Preflight 0 + Start 0 + worker preparation 0 + execution child 1 = **1**.

`reference-closure`, `protected-file-hashes`, `genesis-validation`, engine-code
hashing and continuation snapshot construction remain in the execution child.
Snapshot/source integrity checks can still hash protected bytes again; this change
removes redundant full validation invocations, not every repeated file read.

History is not frozen/cached at Preflight. The existing authenticated continuation
snapshot/location algorithm runs at execution. Existing snapshot reconciliation and
request consumption rules are unchanged. An output location is deferred (`null`)
until validation succeeds; readers expose the owned job without invented results.
Once published, resume retains that exact output and fails on a changed location.
Every execution attempt, including resume after interruption/restart, validates
again. Legacy jobs retain their previously bound output; no old validation receipt
is used to skip execution validation. Rolling back requires old code to reject new
queued admissions; do not manually fabricate an output location.

No stronger arbitrary-concurrent-filesystem-writer threat model is claimed: as
before, source/snapshot validation and source-at-use checks enforce those boundaries.
A cryptographic digest alone does not make a receipt trustworthy.

## Diagnostics and UI

`PREFLIGHT_FAST`, `START_ADMITTED`, `PREPARATION_STARTED/COMPLETED`,
`AUTHORITATIVE_VALIDATION_STARTED/COMPLETED` and the existing named native stage
logs distinguish admission from full validation. Genesis child-stage timings are
nested within `genesis-validation`; do not sum both. Diagnostics contain no secrets.
Queued preparation is shown only with live persisted phase evidence. Running
integrity validation is distinguished from lifecycle execution. UI polling remains
field-based; no new client execution state machine is introduced.

Production timings are not predicted from synthetic tests. The remaining full
closure and immutable-source checks must not be removed merely because they are
expensive.
