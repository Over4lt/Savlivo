# Retained replay diagnostics V1

`replay/<target>/evidence/replay-progress.json` is a bounded diagnostic snapshot,
not an evidence receipt, finalized target, recovery authorization, or cross-run
learning system. It contains no raw body or complete target/projection.

The artifact records version, target, selected-source count, current stage and
source ordinal/hash/sanitized URL, replay-record basename, acquisition ID,
record-persisted/integration-complete flags, and the last successfully integrated
source. RUNNING, FAILED and COMPLETE describe replay progress only. COMPLETE is
written after `retained-replay.json` publication; it grants no research admission.

Stages follow the actual operations: input load, source preparation, account-access
inspection, navigation extraction, record lookup, reservation, source validation,
acquisition-journal creation, interpretation, targeted verification, optional
source enrichment, record persistence, reservation removal, verified-result
integration, needs merge, quarantine/review, research memory, leads, pages-index
publication, cancellation review and result publication. Exact identifiers are
exported as `replayStages`.

Failure emits `V2_RETAINED_REPLAY_FAILED` and attaches the same safe diagnostic to
the original exception. The existing outer fallback keeps
`RETAINED_INTERPRETATION_REVIEW_REQUIRED` and adds `retainedFailure.diagnostic`.
The existing HASH/AUTHORITY/POLICY rethrow predicate is unchanged. Machine error
messages are preserved exactly; filesystem error codes are preserved. Arbitrary
exception text is omitted to avoid leaking bodies, credentials or query strings.
URLs contain origin/path only. Diagnostic persistence failures cannot replace the
original research exception; the failure event includes the persistence error.

Needs-merge failures additionally report prior/incoming source and claim counts,
serialized byte sizes and the unchanged configured aggregate limit. Measurement
streams JSON without retaining a second serialized projection, stops above 4 MiB,
and reports an incomplete measurement rather than failing research. It does not
attempt to construct an oversized merged projection for diagnostics.

Existing completed replay files still return unchanged. Old source records are
read as before; no version migration, retry, new freshness rule or state repair is
introduced. Pending reservations remain pending. Progress is never consumed as
execution input. Object-shaped historical target metadata and pages arrays are
not reinterpreted. A progress-write failure can leave an older progress artifact;
`retained-replay.json` remains the existing authoritative replay completion marker.

Overflow handling and validated recovery are intentionally deferred to Commit 2.

Commit 1b isolates every progress callback and the complete failure-reporting call,
including metric calculation. Diagnostic construction, attachment, logging and
filesystem errors cannot replace the original research exception. Short writes
are completed using byte offsets; zero progress aborts publication. Only fully
written/fsynced pending data is renamed, followed by best-effort directory fsync
using the storage/core pattern. Owned pending files are removed best-effort after
failure. Missing/stale diagnostics remain possible and confer no recovery authority.

The 4 MiB measurement stop bounds emitted measurement work, not peak allocation:
an individual string can be serialized before the sink checks its byte count.
No full projection payload is retained in diagnostics.
