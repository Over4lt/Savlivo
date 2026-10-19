# Retained Verified reconciliation V1: proposed policy and read-only preflight

This is a proposed admission policy, not an enabled production operation. The
implementation exposes an explicit read-only CLI preflight and an approval
rehearsal. `commitRetainedVerifiedV1` always rejects. No environment setting
can enable it. A separate reviewed release and operator approval are required
before any production admission.

## Candidate contract

- The selector names an exact closed canonical price-research job, completed
  service-market child, and source SHA-256. It never interprets a missing
  service as every service.
- The loader checks the job target snapshot, child completion journal, retained
  body, source classification, original acquisition journal hash chain,
  acquisition attempt, and the G1 receipt's reference to that exact journal
  record and page pointer. Ambiguous or missing bindings fail closed.
- The source time is the original page acquisition time in the authenticated
  journal (`page.checkedAt` and/or `page.sourceIntegrity.checkedAt`). If both
  exist, they must describe the same instant. Unknown, malformed, conflicting,
  or future times fail closed. File mtimes and replay times are never substitutes.
- Current parser and unchanged V3 Truth re-evaluate the exact body using the
  original source check and attempt. Each established monthly offering must
  retain the selected service, market, URL and body hash. Duplicate exact or
  semantic plan labels fail closed; ambiguous plans are not merged.
- The only proposed candidates are those no older than 24 hours at the
  database snapshot and with **zero current Verified rows and zero Verified
  observation rows for the complete service-market pair**. Suggested and
  User Override rows are never promoted.
- A repeatable-read, read-only database transaction reads both Verified tables
  and its snapshot identity. Preflight returns original acquisition time,
  snapshot time, age, exact V3 offerings, code-version hash and a canonical
  digest. The digest binds the job, attempt, original journal record, URL, body,
  parser/Truth code, V3 result, age and database snapshot.

Use `node --import tsx services/api/scripts/preflight-retained-verified-v1.mjs
--read-only-preflight JOB_ID SERVICE MARKET SOURCE_SHA256` with the existing
V2 Operations state root and database connection. This performs no acquisition
and writes no files or rows.

## Separate future commit contract

A future write release must accept an explicit operator identity, the full
dry-run document and approval of its exact digest. Under one database
transaction it must re-read the same original artifacts, re-run current V3,
reject changed code/evidence/result/database state, and recheck the 24-hour
age at the **actual commit instant**. The read-only approval rehearsal already
tests these comparisons. It is not permission to write.

The existing `persistVerifiedLivePrices` writer currently commits each plan
in its own transaction. A multi-plan V1 admission therefore still needs a
reviewed way to run that **same writer's** identity and history logic in one
locked service-market transaction, with a zero-current/zero-history guard
inside that transaction. Do not call the existing per-plan writer directly
from a reconciliation command: partial admission and races would violate V1.
The future audit record must keep `source_acquired_at` from the original
journal and the actual `admitted_at` separate. Repeated approval must resolve
to the same admission, not create another baseline or observation.

No production commit endpoint, writer call, schema mutation, bootstrap,
promotion, paid acquisition or batch resume is provided by this V1
preflight release.
