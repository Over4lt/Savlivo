# Price evidence needs — routing projection v1

This is a pure projection of existing provider-price adjudication, not evidence,
a verifier, an admission credential, a new target factory, or a budget owner.
It applies only to an existing `SERVICE_COVERAGE` target with the exact ID
`<service>-price-<market>`. Source localization never creates a target.

## Flow

The offline interpreter projects its current `priceIntelligence` observations
into `provider-price-intelligence.json.priceEvidenceNeedsByTarget`. The targeted
verification worker exports that map beside its unchanged compatibility fields.
Direct and conditional-acquisition results carry the selected target projection;
live target updates and retained replay merge it into `target.priceEvidenceNeeds`.
`researchKnowledge()` retains it beside the old coarse blockers. Adaptive
assessment includes its evidence digest in the existing state signature.

Existing retained HIGH/MEDIUM sufficiency and adaptive service sufficiency still
win. Diagnostic gaps on other offers do not require exhaustive SKU coverage.
Existing retained reuse precedes gap-directed acquisition. The ordinary lifecycle
replay can produce the current interpretation from admitted retained bodies,
without changing those bodies or historical artifacts. Already-completed replay
checkpoints and REUSE_RETAINED are deliberately **not** silently re-extracted:
old checkpoints without the projection retain their previous behavior. A fresh
normal lifecycle replay is required for current interpretation in that case.

## Schema and identity

- `version: 1`, `derivationVersion: PRICE_EVIDENCE_NEEDS_V1`, `targetId`
- `sources[]`: URL, a deduplicated `references[]` table, per-source claims
- `claims[]`: aggregated claim identities, established assertions, missing needs
- `evidenceDigest`: SHA-256 of canonical versioned content
- `meaning: ROUTING_ONLY_NOT_VERIFICATION_OR_SCOPE_ADMISSION`

A claim contains `claimKey`, observed `identity` (product/SKU when available,
plan, exact cadence, grounded scope/commitment), `established[]`, and `missing[]`.
Each missing need contains `gapKey`, `assertion`, `disposition`, original reason
codes, and evidence-reference IDs. References retain source URL/hash/`domLocator` (a source coordinate, not a filesystem reference),
offer-object ID, verifier status and presentation rule/occurrence/surface locator
when present. Full receipts remain in the original interpretation artifacts.
Assertions from different source occurrences keep their own evidence references;
the aggregate does not combine them into a newly verified price.

Claim identity hashes the target ID and semantic identity. Gap identity also
includes the assertion. Neither includes timestamps, evidence hashes, ordering,
or attempt numbers. Unknown identity produces a target-level need, not an
invented plan. NO and SE are distinct targets and therefore distinct identities.
The evidence digest includes source hashes/locators and interpretation version,
but not incidental timestamps. Canonical ordering and duplicate observations do
not trigger reassessment. New evidence can change the digest without granting a
new request identity or budget.

Merging replaces the same URL's current projection within the admitted target;
other source observations remain. Historical artifacts are never rewritten.
Unknown/corrupt versioned projections fail closed. Absence in legacy checkpoints
is supported; there is no implicit migration that resets attempts or usage.

## Dispositions and action selection

Disposition is code-owned, not selected by a string supplied in page state.

- Service/ownership authority failure: HUMAN_REVIEW; integrity failure: POLICY.
- Exact adjudicator conflict reasons: CONFLICT, never a convenient winner.
- RESEARCHABLE is deliberately narrow: an intact reviewed first-party source,
  established positive amount/currency, a concrete observed named offer and
  interval, and no demonstrated runtime/configurator requirement. Only missing
  offer presentation/ownership, market, plan or interval can use this route.
  The grounded commercial observation supplies a specific bounded offer/terms
  discovery opportunity; it does not establish any missing fact.
- Other ambiguity, missing grounding, unsupported interpretation and unmapped
  reasons remain INTERPRETATION. Trial, credit, tax and other explicitly excluded
  observations do not become required work.
- TERMINAL is not fabricated from verifier output. Existing history/policy/
  capability/budget action-space stops remain planner decisions. In particular,
  provider-access and exhausted-discovery causes remain visible.

For researchable needs only, known reviewed commercial destinations receive a
small ordinal relevance bonus for purchase/selection, market terms or billing
interval vocabulary; bounded discovery uses the corresponding query intent.
Vocabulary guides acquisition and never proves an assertion. The old flattened
ownership/structure heuristic cannot override a concrete researchable need.
Interpretation/policy/conflict-only projections stop instead of repeatedly
searching. They do not grant reviewed authority.

No new read/search/acquisition category or allowance exists. Direct keeps its
resource identity, history and refresh policy. Tavily keeps its two-search
bounded action space; snippets remain discovery-only. Browser is not required.
Market gaps never authorize Decodo; existing documented access/geo fallback and
capability permission remain mandatory. Groq has no new role.

## Bounds and validation

Projection caps: 2,048 input observations, 256 semantic claims, 128 source URLs,
2 MiB canonical content. Reference tables avoid repeating long source locators
for every field. Exceeding a bound fails closed. No new parsing, JavaScript
execution, transport or filesystem access occurs in the helper.

Focused tests cover scope, deterministic identity/digests, field separation,
sufficiency, capabilities, history, stop reasons, current budget accounting,
reserved-action recovery, current offline replay and actual verifier output.
Real retained replay tests use synthetic bodies and the normal isolated offline
interpreter/verification subprocesses. No source is acquired during these tests.

## Bounded historical diagnostic

The inspected sealed local snapshot has 161 targets (104 catalog, 57 pricing).
113 readable historical price-intelligence files contain 1,309 observations.
Projecting those existing adjudications (not re-extracting all bodies) yields
28 pricing targets with needs, 213 semantic claims, and disposition entries:
4 RESEARCHABLE, 725 INTERPRETATION, 117 POLICY, 1,088 CONFLICT, 0 HUMAN_REVIEW,
0 TERMINAL. Entries retain source/reason distinctions; these are not service
counts. Three targets remain sufficient despite diagnostic gaps.

18 of 57 pricing assessments differ: 12 previously executable assessments now
stop for precise non-researchable needs; six already-stopped assessments have
more precise stop diagnostics. 39 are unchanged. The two targets with researchable
needs do not override existing sufficiency/history. This is a historical local
sample, not an estimate for all 188 production services. Chess.com remains
`chess-com-catalog`, market null, projection null. An explicitly admitted synthetic
NO pricing target exercises bounded missing-presentation discovery separately.
