# Price evidence needs V2

This is a routing/research-gap projection, never pricing evidence, eligibility,
quarantine, verification, sufficiency, or recovery authority. Existing HIGH/MEDIUM
sufficiency takes precedence unchanged. The known retained-review admission defect
is not repaired here.

## Consumers

`interpret.mjs` derives needs from adjudicated observations; the targeted worker,
Direct/fallback provider adapters, retained replay and live target updates carry
or merge them. `researchKnowledge` exposes them as decision state. Information
routing consumes assertion/disposition/identity for relevance, discovery query
intent and unresolved stop reasons. Adaptive assessment consumes the digest for
reassessment. No Operations/UI or final pricing admission reader consumes their
references as proof. Replay diagnostic metrics read only counts/bytes.

## Representation

Version 2 / PRICE_EVIDENCE_NEEDS_V2 stores source URLs and deduplicated evidence
references plus ONE aggregate semantic claim collection. Source contributions
are recovered by intersection with evidence IDs for the existing source replacement
merge policy. Source records no longer serialize duplicate claim collections.
References omit repeated source URLs. Locator/metadata strings above 256 characters
are represented by a canonical SHA-256 digest and an explicit locator-only marker;
they cannot be used as filesystem paths or evidence. Original artifacts remain
necessary to inspect the full locator and proof.

Claims preserve established and missing assertions separately, reasons,
dispositions, evidence IDs, observed identity, cadence, currency, monetary role,
and grounded scope/commitment. Unknown identity stays target-level. V2 adds
currency/role to semantic identity; no evidence assertion is strengthened.
Sources, claims, assertions, reasons and references are canonically ordered.

## Bounds and incompleteness

The 2,097,152-byte ceiling remains. Existing observation/source/claim bounds remain
2048/128/256. Source URLs are limited to 2048 characters and individual claim
contributions to 16 KiB. Oversized contributions/sources are omitted in canonical
source order; 32 KiB is reserved for coverage and digest metadata. Coverage records
completeness, omitted source/claim-contribution/need/observation counts, affected
dispositions, reason and canonical omitted-set digest. Counts for omitted claims
and needs are contributions, not necessarily distinct semantic identities.
Above the observation bound, no detailed projection is attempted: the whole set is
explicitly unresolved with its count and canonical set digest.

Incomplete needs produce PRICE_EVIDENCE_PROJECTION_INCOMPLETE, a stable unresolved
planning stop (not success or budget exhaustion). No gap-directed action is inferred
from omitted data. Existing sufficient retained evidence still stops under the
unchanged sufficiency policy. An incomplete accumulated projection remains sticky
through incremental merges; only an explicit full re-projection can replace it.
This prevents dropped contributions silently becoming resolved and unchanged-state
replanning loops. Verified collections and request histories are not modified.

## Legacy

Valid V1 objects are checked using their existing canonical build/digest contract,
then mapped in memory without reinterpreting claims or dispositions. The output
records originDerivations=PRICE_EVIDENCE_NEEDS_V1. Historical files are not rewritten.
Mixed merges retain both derivation origins. Unsupported versions, corrupt digests,
wrong target scope and oversized persisted objects remain fail-closed with existing
machine errors. Legacy identity is preserved, not silently upgraded to V2 identity.
Completed replay checkpoints are not reopened; there is no recovery or migration.

The exact production projection values are not test fixtures. Synthetic regression
fixtures reproduce equivalent V1 source/aggregate duplication and locator pressure.

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


## Historical V1 diagnostic (not rerun for V2)

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
