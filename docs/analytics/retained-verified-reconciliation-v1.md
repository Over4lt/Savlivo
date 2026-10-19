# Retained Verified reconciliation V1: proposed policy and read-only preflight

This is a proposed admission policy, not an enabled production operation. The
implementation exposes only an explicit read-only CLI preflight. **No source
freshness limit has been approved.** The earlier 24-hour limit was a proposal,
not a permanent product policy. `approvedMaxSourceAgeMs` is `null`, the
preflight always reports `admissionEligible: false`, and both the former
approval rehearsal and `commitRetainedVerifiedV1` always reject. No environment
setting can enable admission. A separate reviewed release and operator approval
are required before any production admission.

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
- The preflight reports whether the complete service-market pair has **zero
  current Verified rows and zero Verified observation rows**, as an evidence
  readiness check. It never treats this as admission approval. Suggested and
  User Override rows are never promoted.
- A repeatable-read, read-only database transaction reads both Verified tables
  and its snapshot identity. Preflight returns original acquisition time,
  snapshot time, age, three diagnostic freshness scenarios, exact V3 offerings,
  code-version hash and a canonical digest. The digest binds the job, attempt,
  original journal record, URL, body, parser/Truth code, V3 result, age and
  database snapshot. It is not an approval token while policy is unapproved.
  Repeating a preflight against the **same frozen database snapshot** produces
  the same digest. A new live snapshot has a different time and may have a
  different transaction identity, so its digest is expected to change.

Use `node --import tsx services/api/scripts/preflight-retained-verified-v1.mjs
--read-only-preflight JOB_ID SERVICE MARKET SOURCE_SHA256` with the existing
V2 Operations state root and database connection. This performs no acquisition
and writes no files or rows.

## Freshness policy decision still required

The preflight compares the original acquisition time with the database snapshot
at 24 hours, 72 hours and 7 days. These horizons are diagnostic configuration
in code, not active gates; none authorizes Verified admission or triggers a new
acquisition. A later approved policy can select a bounded maximum age in a
separate release. Approval must also specify how to respond to stale evidence;
this V1 does not order paid reacquisition.

| Candidate maximum age | Price staleness exposure | Likely acquisition cost | Historical traceability |
| --- | --- | --- | --- |
| 24 hours | Lowest of these options; still not proof a price is current at admission | Highest if expired sources require fresh acquisition | Most closely ties admission to a recent observation; preserve both actual source time and admission time |
| 72 hours | Allows up to three days of unobserved provider changes | Lower than 24 hours for retained evidence | Original acquisition and later admission remain distinguishable |
| 7 days | Highest risk of admitting a price that changed after acquisition | Lowest potential reacquisition demand | A week-old source is only evidence of its acquisition-time price, never a provider-effective date at admission |

**Recommendation for review:** consider 72 hours as a bounded compromise only
after measuring actual provider price volatility and reacquisition cost. No
threshold is approved or active. The safest current behavior is read-only
analysis with no admission and no automatic paid acquisition.

This V1 loader specifically requires an original Decodo G1 receipt tied to the
same source body and journal record. A valid Browser market-selection receipt
is a different evidence path; Disney+ Browser sources must not be mislabeled
as lacking market proof because this narrow loader does not handle them.

## Separate future commit contract

A future write release must first define and obtain approval for a source-age
policy. It must then accept an explicit operator identity, the full dry-run
document and approval of its exact digest. Under one database transaction it
must re-read the same original artifacts, re-run current V3, reject changed
code/evidence/result/database state, and recheck the approved age limit at the
**actual commit instant**. The currently disabled approval rehearsal cannot
authorize an admission.

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
