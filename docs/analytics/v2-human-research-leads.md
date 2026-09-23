# Human research leads: operational inputs, not Genesis authority

A submission is an unverified hint for a future mature lifecycle run. It cannot
establish ownership, availability, prices or account capabilities. The existing
reviewed provider binding, robots/SSRF, acquisition, capability, budget and
verifier gates remain authoritative. Different-host hints may remain unusable
until the normal independent provider review establishes that relationship.
No live acquisition happens on submission, inspection, Preflight or recovery.

## Storage and lifecycle

The existing locked Operations `state.json` stores `humanLeads` lazily. No database
migration is needed. Each record has a server-generated UUID, service, type,
normalized public HTTP(S) URL, investigation market scope, note, authenticated
creator and timestamps. Submission fields are immutable. Creators may deactivate
(the original fields remain), then submit a replacement with a new ID. Events
record submission and deactivation. Other authenticated Admins may inspect shared
research hints; creator IDs are presented as “You” or “Admin operator”. Only the
creator can deactivate. Baseline services may have hints for future use, but
cannot enter the frozen cohort. Twenty active hints per service and 10,000 total
records bound the store. Notes must not contain credentials or secrets.

Submission states are UNVERIFIED and DEACTIVATED. There is deliberately no manual
“verify” action. USED/VERIFIED are not interchangeable global states: separate
run observations record attempted acquisition, results and actual verifier
outcomes. A timeout does not reject or verify a submission. No outcome means
unknown, not that a request was definitely never dispatched.

## Frozen input contract

Preflight resolves services and scopes, then freezes applicable active leads in
`V2_HUMAN_LEADS_V1`. Object keys, service IDs, markets and lead-ID ordering are
canonical; exact canonical UTF-8 bytes are SHA-256 addressed at
`.savlivo/v2-operations-inputs/human-leads/<sha256>.json`. Atomic no-replace
publication uses existing storage primitives. The snapshot includes its exact
cohort identity, selected services, investigation scopes and immutable submission
provenance. It contains no evidence or authority assertions.

The binding `{path, sha256}` is included in the derived execution input,
Preflight configuration, job manifest and lifecycle lineage. Genesis execution
selection explicitly validates this new contract before permitting the field:
fixed namespace, no symlinks/escape, exact bytes/hash/canonical shape, service and
scope equality. Genesis remains sealed separately and unchanged. Native input
inspection repeats validation and includes the snapshot in inputHashes, so
continuation and output identity bind it too. Reference closure recognizes the
schema, treating operator notes as text rather than filesystem dependencies.

Start uses the reviewed snapshot even if submissions later change. It does not
consult latest leads. Worker preparation and execution/resume use the same
configuration and fail closed on missing/corrupt snapshots. New submissions enter
only a new Preflight. Async Preflight deduplication incorporates relevant active
submissions so an explicit new Preflight after a change cannot return an old
successful review. Recovery does not replace or renew the existing snapshot or
token. Browser requests cannot supply their own snapshot binding.

## Candidate handoff and outcomes

The executor adds matching hints to existing candidate leads after retained
replay, before native adaptive execution. Type limits catalog versus pricing use;
market scopes filter hints without asserting availability. Service-wide account
targets keep their existing null market; a scoped hint is eligible there only when
it intersects the frozen run's investigation markets. No new market assertion or
account verification scope is created. Existing information
value still decides eligibility; rank gives a tie preference, never authority.
Prior-run human hints are replaced by the newly frozen selection; resumed runs
reuse the identical snapshot. There are no changes to the adaptive planner or its
stop reasons, including the separate zero-request chess-com investigation.

Normal Direct reads account through existing charge callbacks. Decodo is still
eligible only after the existing access/geo escalation proof and an enabled
capability. Human pricing URLs never trigger per-country proxy fan-out. Browser
and Groq remain governed by their existing controls.

`human-lead-outcomes.jsonl` is append-only per lifecycle run. Records bind run,
service, market, lead ID, snapshot hash, timestamp and their own exact-payload
hash. Direct/Decodo dispatch and normal verifier observations are recorded without
storing prompts or credentials. Captured body references and verification hashes
(and interpretation directories where returned) link back to the normal evidence
pipeline. Catalog verification is observed after its normal proof is persisted;
price outcomes are observed after quarantine filtering. The frozen snapshot is
never rewritten. Finalization protects the outcome ledger and its references.
Admin shows a bounded recent view from at most 100 jobs / 256 KiB per ledger;
absence of older output is explicitly not a verification conclusion.

## Admin behavior

Services use responsive cards: service/state, coverage, requests/evidence,
attention and Inspect. Human-readable reason summaries replace raw JSON in the
primary list. Inspect presents summary, authority, identity/markets, account
access, pricing, evidence, gaps, human leads and expandable complete technical
record. Evidence remains distinct from submitted URLs. Saving/deactivating
refreshes only the lead list. Service pagination refreshes only that result area.
Existing 10-second exact-job monitoring and stable text updates remain unchanged.

## Deployment and rollback

1. Deploy the committed backend/runtime to Render through the normal process.
   Do not change Genesis, capability gates or scheduling. No SQL migration or
   manual storage initialization is needed; existing stores accept the optional
   `humanLeads` collection. Preserve/back up Operations state and immutable
   snapshots with their jobs, run ledgers and evidence.
2. Upload committed `apps/web/admin/v2-operations.js` and `admin.css` separately
   to `/subdomener/admin/` on Webhuset. No new public script/allowlist is needed.
   Render does not publish these static files.
3. Reload Admin. Submission and Preflight are not research execution; confirmed
   Start remains a separate deliberate action.

Frontend-only rollback is safe; existing jobs retain frozen inputs. Do not roll
back runtime to a version that does not understand admitted humanLeadSnapshot
inputs while those jobs are queued/resumable. Older validation must fail closed,
not drop the binding. Preserve data and forward-fix compatible validation; do not
rewrite manifests, delete hints or reseal Genesis as a rollback technique.
