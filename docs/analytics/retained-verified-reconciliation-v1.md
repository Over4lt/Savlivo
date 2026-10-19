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

When supplying an in-memory diagnostic script through a shell heredoc, put the
terminator on its **own line after a newline** and check the process status.
A terminator appended to the JavaScript line becomes JavaScript text. The
five-source Render diagnostic was rerun with this correction: PL 3, BR 3,
MY 2, HK 2, TW 2 source-bound monthly offerings; each had a matching original
journal and G1 receipt, zero current and historical Verified rows, identical
digests for two evaluations against the same frozen database snapshot, and
`admissionEligible: false`. It ended with `PREFLIGHT_EXIT=0`. The in-memory
diagnostic transferred code only; it did not write a remote file or database
row. A separately timed live snapshot is expected to produce a new digest.

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

## Frozen-source regression gate for this design revision

The reconciliation design changes no parser, routing, receipt validator or V3
Truth code. The parser file at baseline `292bccc` and after this revision had
the same SHA-256 (`8917a08a76059c586a9fa1cf0a1ff733f59784fbbfbeb4e28a74f7eda757dcf9`).
Two independent in-memory module instances parsed each exact retained body;
source hashes and all parser offering fields matched before and after. The
stored production V3 Verified counts are shown as controls, not as a new
admission. The in-memory run ended with `REGRESSION_EXIT=0`.

| Service | Frozen job | Markets and stored Verified counts | Source kind |
| --- | --- | --- | --- |
| Netflix | `a0a41cfd-7bd6-61c0-1c22-073473d7a688`, `c34a29bf-cd07-d6b8-175d-cad5538251fc`, `75d6a34b-8b6b-8911-a41d-57b53cd3a41c` | US 3, ES 3, NO 3 | Complete retained provider bodies |
| Disney+ | `6ba03947-5551-3206-ddcd-dc0dd41cd1a9` | TW 2, AE 1, PH 2, SA 1, MX 3, ID 2, ZA 1, IL 1, QA 1, EG 1, RO 2, CL 3, CO 3 | Complete retained Browser market pages |
| Disney+ | `7f748f75-dd7f-8deb-94ab-6555e2565114` | TR 2 | Complete retained Browser market page |

This comparison did not replay the full Browser market-selection or G1
validation pipeline; their code was byte-for-byte unchanged, and the original
stored V3 results were inspected. Browser evidence was never treated as a
Decodo G1 receipt. A future change to parser, routing, receipts or Truth needs
its own full source-bound before/after replay gate.

## Separate future commit contract

A future write release must first define and obtain approval for a source-age
policy. It must then accept an explicit operator identity, the full dry-run
document and approval of its exact digest. Under one database transaction it
must re-read the same original artifacts, re-run current V3, reject changed
code/evidence/result/database state, and recheck the approved age limit at the
**actual commit instant**. The currently disabled approval rehearsal cannot
authorize an admission.

The approval must name the exact dry-run digest, target, source hash and
approved policy revision. Authentication and Admin authorization must occur
before any transaction. A caller cannot choose a policy by sending a duration
in the request. Commit first verifies the digest's canonical structure and
the operator's explicit approval, then checks a unique admission key for the
original job, target, attempt and source hash. An identical prior successful
admission returns its original receipt without writing; a conflicting one
fails closed.

Inside one transaction, acquire a **service-market lock shared by every
ordinary Verified writer**, before any plan-level lock. Re-read current and
history rows and a durable service-market mutation revision under that lock.
Reject any difference from the approved dry-run's relevant database state,
including an intervening insert followed by deletion. The dry-run's
transaction timestamp or `txid_current_snapshot()` cannot be required to
match a later transaction: compare the durable revision and relevant row
fingerprint instead. Re-read the original closed job, journal chain, body,
SHA-256, receipt and source classification. Re-evaluate through the current,
unchanged parser and V3 Truth; require identical service, market, source,
semantic identities, currency, amount and monthly cadence. A changed code
version or result invalidates approval. Check the approved maximum source age
at the actual commit instant. Any failure rolls back the entire transaction.

Pass the established offerings through the **same V3-to-AdapterPrice mapping
and ordinary Verified writer** used by live research. The writer must accept
the already-open transaction and persist all plans atomically; it must not
start or commit a separate transaction per plan in this path. Recheck zero
current Verified and zero Verified history for the whole service-market pair
under the shared lock. Preserve the writer's existing identity, alias and
history checks. Never construct an alternative INSERT from preflight's display
rows. Use the original acquisition time for `updatedAt` / provider-verified
time; never use replay time as source observation time. Record actual admission
time separately in the transaction's immutable audit receipt (and existing
history `observed_at`), with the original journal acquisition time alongside
it. Insert the unique audit receipt only after all ordinary writer calls
succeed, then commit the entire batch once. A retry must create neither a
second current row nor an extra baseline or price-change observation.

**Implementation blockers before any write release:**

1. `persistVerifiedLivePrices` currently opens and commits one transaction per
   plan and only takes a billing-provider/market/currency advisory lock. It
   needs a transaction-aware internal path plus the shared service-market lock
   used by every normal Verified write. Lock order must be uniform.
2. No durable service-market mutation revision or unique admission audit
   record currently binds approval, original source time and actual admission
   time. Add these as an additive, reviewed schema change; a count of zero
   cannot detect an intervening insert-and-delete cycle.
3. The current V3-to-writer mapping lives inside the live research pipeline.
   Reuse that exact mapping under a tested API instead of translating the
   diagnostic preflight rows independently.
4. A freshness threshold and its treatment of expired evidence still require
   explicit product approval. No approval or production entry point exists.

### Proposed database and writer contract for that later release

This is a design, **not a migration in V1**:

- Add one revision row per `(service_slug, country_code)`. Database triggers on
  both Verified current and observation tables increment it for every INSERT,
  UPDATE or DELETE, including maintenance writes. This detects an intervening
  insert-and-delete that row counts or a row fingerprint would miss. A dry-run
  reads the revision in its read-only snapshot; commit locks and compares it.
- Add an immutable admission receipt with a unique key on
  `(job_id, target_id, attempt_id, body_sha256)`. Store the exact approved
  digest, operator, policy revision, parser/Truth version, original journal
  reference, source acquisition time, admission event time, prior revision,
  resulting offering identities and result digest. A conflicting retry fails;
  an identical retry returns the existing receipt.
- Move the existing Verified writer's **current identity/alias/history
  implementation**, unchanged in meaning, behind a transaction-aware internal
  function. The normal public writer keeps its existing behavior but acquires
  the same service-market advisory lock *before* its existing narrower lock.
  Reconciliation acquires that service-market lock once, locks the revision
  row, revalidates, and invokes the internal function for all offerings in one
  transaction. The revision triggers also cover writes that bypass the
  advisory lock. A failure leaves neither a partial plan set nor a receipt.
- Take the admission event time from the database clock in that transaction.
  It is distinct from the authenticated source acquisition time and is not
  presented as a provider-effective date. Historical `provider_verified_at`
  remains the original source observation time; replay must not refresh it.

The transaction order is: authorize exact approval; begin; acquire the shared
service-market lock; lock and compare revision; read and lock current/history
state; reload and re-evaluate exact evidence with current code; check the
approved age at transaction time; call the ordinary writer's internal path for
all plans; insert the unique receipt; commit. Concurrent conflict, changed
revision, changed evidence, changed V3 result or any writer error means a full
rollback. This protocol and its migration/writer tests must be reviewed
separately before a production entry point is introduced.

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

### Local atomic admission proof (not a production feature)

The subsequent V1 proof uses `services/api/test-support/retained-verified-reconciliation-v1.sql`
only in a disposable PostgreSQL database. The file is deliberately absent from
`production-migrations.ts`; startup cannot apply it. Its triggers increment a
durable revision on every current Verified or observation INSERT, UPDATE, or
DELETE, including a transient insert followed by deletion. A separate unique
receipt records the signed exact dry-run digest, original source acquisition
time, later admission time, journal identity, operator, policy fixture, parser
version, and resulting plans. The receipt and all plan/history writes commit in
one transaction or all roll back.

The ordinary writer now has a transaction-aware internal path using the same
identity, alias, and history logic. Its public live-research path still opens
and commits per plan. Both paths acquire a service-market advisory lock before
the prior narrow lock. The disposable admission proof takes that shared lock,
compares the revision and zero current/history counts, reloads and replays the
original source, validates the signed approval and synthetic age fixture, then
passes the established offerings through the same live V3-to-AdapterPrice map
and writer. An unchanged retry returns the original receipt; a conflicting
approval is rejected. An injected failure on plan two rolls back plan one and
the history and receipt. No evidence timestamp is replaced by replay time.

This is still **not deployable admission**. The public `commitRetainedVerifiedV1`
function remains hard-disabled; the only executable admission core is confined
to `test-support` and checks the exact disposable localhost database. The
production preflight continues to report `admissionEligible: false`. No
freshness duration is approved, and no production approval-signing key,
administrator entry point, migration registration, or operator workflow exists.
Those require separate policy and release review before any production use.
