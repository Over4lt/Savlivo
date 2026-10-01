# Bounded source-local Research V3 understanding

Provider observation → structural presentation routing → native extraction →
optional source-bound translation → bounded semantic representation → binding
reconstruction → deterministic truth. The model never decides authority,
admission, verification, sufficiency, market truth or objective completion.

## Why the old request was broad

At c09ba6e, `prepareLive` constructed `createLiveSemanticInterpreter`; `accept`
reserved a call and `evidenceRequest` serialized all `semanticMaterial` segments
and presentation boundaries. The retained controlled run contains 155 segments
and 198 presentation boundaries: 25,008 JSON bytes of material, not the entire
165,349-byte HTML body. That material, instructions and the strict schema were
sent in one request. The recorded rejection was HTTP 413 / rate_limit_exceeded.
The retained diagnostics do not establish the exact token/rate constraint.

## Selection and bounds

`semantic-units.mjs` routes using unresolved proposition names, Unicode monetary
symbols/ISO-like monetary tokens, numeric population candidates and original
links/forms. These signals rank candidate context; they do not establish facts.
A small complete presentation may be one unit. Larger pages use the largest
fitting ancestor of a relevant source segment, retaining all its visible segments
and descendant presentation boundaries, plus separately bound service identity.
Units are source ordered, identical units deduplicated and contained units omitted.
No text segment or presentation is clipped to fit. A unit may retain linked local
presentations, but independent fragments cannot invent a relationship. Pricing units carry the
atomic price-component dependency family because selecting a different offer
can change which component is unresolved; evaluation still stops as soon as the
objective is established.

Fixed ceilings, in addition to the existing run budgets:

| Resource | Maximum |
|---|---:|
| Units / observation and model attempts / acquisition action | 4 |
| Presentation boundaries / unit | 16 |
| Original segments / unit | 64 |
| Original text / unit | 4,096 UTF-8 bytes and 4,096 UTF-16 code units |
| Supplied destinations / unit | 16 |
| Serialized semantic request JSON | 8,192 bytes |
| Entire Groq request including strict schema/messages | 24,576 bytes |
| Output JSON | 32,768 bytes |
| Offers / fragment | 8 |
| Charges or temporal edges / offer | 8 |
| Account nodes / edges | 16 / 16 |
| Source supports / element | 64 |

Existing model-call run bounds, 30-second maximum timeout, configured output-token
maximum ≤8,192 and zero SDK retries remain authoritative. Input token count is not
known locally; byte/character ceilings are not represented as exact token counts.
Extraction or unit capacity is traceable and leaves unsupported needs unresolved.
These ceilings deliberately do not guarantee coverage of every possible page.

## Representation and reconstruction

`V3_EVIDENCE_V2` / strict `v3_source_bound_evidence_v2` represents service, offers,
atomic charges, qualifiers, ambiguity, temporal relationships and accountGraph.
All object keys are validated; truth/admission/confidence verdict fields fail
closed. An envelope is associated with the exact host-selected unit, observation
ID and body hash. Projection reconstructs the original material for those unit
boundaries and requires exact original spans/quotations supplied to that unit.
It cannot borrow another visible segment elsewhere on the observation. Offer
support must cover its complete supplied presentation. Amount/currency/cadence
bindings and intro/subsequent transition protections are unchanged.

Fragments retain unit identities and are individually projected, normalized and
exactly deduplicated. Truth groups compatible facts by the existing scoped offer
identity plus original URL/presentation identity for local fragments; incompatible
authoritative facts on that same scoped presentation remain contradictions.
This prevents unrelated partial fragments sharing a model-supplied offer name
from pooling an amount and cadence into a fabricated complete price. There is no
cross-fragment endpoint lookup or value-based relationship construction.

Translation remains a separate optional artifact. Understanding can consume
original multilingual material directly. When a validated translation is present,
only mapped segments in the unit are supplied, with original translation indexes;
evidence still maps through the artifact to original observation spans. Uncertain
or forged translation mappings cannot become supported facts.

## Account roles and relationships

Destinations come from original authoritative links/form actions, never model URLs.
Nodes distinguish LOGIN, ACCOUNT, MANAGE, CANCEL, external AUTH and UNKNOWN.
Authority of a destination is computed from reviewed provider hosts. Third-party
AUTH can represent login only with an explicit, source-local AUTHENTICATES_TO edge
to a provider-controlled ACCOUNT. MANAGEMENT requires a provider-controlled MANAGE
node and an ACCOUNT → MANAGES_SUBSCRIPTION → MANAGE edge. Cancellation is a separate
explicit CANCEL destination; management alone never supplies it. Supported edges
require compatible roles, original support beyond endpoint labels and a common
supplied presentation. This validates provenance and conservative relationship
requirements, not the infallibility of a model's language understanding.

The existing login/management service predicates consume these revalidated facts.
Additional `accountAccess` results expose LOGIN/ACCOUNT/MANAGE/CANCEL separately;
they do not add cancellation to service admission or pricing requirements. Account
access can be service-wide. It does not establish country availability.

## Dispatch, stopping and diagnostics

Each unit reservation is counted, recorded and checkpointed before dispatch.
Native facts and successful fragments survive another unit's failure. Attempts
have no retry path; subsequent distinct units may run within global bounds.
Deterministic evaluation runs between units and stops remaining interpretation
when the objective is established. Normal planner transport policy is unchanged.
Pending acquisition recovery remains fail-closed without automatic replay.

API failures retain safe status/code/type, sanitized request ID when available,
request byte count, input character count, configured output maximum, schema and
unit identity. Raw provider messages and sensitive headers are not persisted;
there is no wording-specific inference of the rejection's cause. Successful
strict output or remote model availability has not been demonstrated by offline
mocks. Request-level acquisition failure diagnostics remain a separate limitation.

No pricing, proof-count, ordinary-recurring or country-context predicate changed.
One sufficient provider presentation can establish truth. Introductory, credit,
benefit, installment and annual-equivalent evidence does not become an ordinary
monthly price. Language/currency/path do not establish a country. The retained
pricing oracle is an offline fixture, never a production branch or injected truth.


## Current provider wire

The internal `V3_EVIDENCE_V2` envelope is now reconstructed locally from compact
unit-local semantic records. The current LIVE schema is `v3_semantic_unit_v1`,
not the previous rich envelope schema. See [compact semantic wire](research-v3-semantic-wire.md).
Original source/unit ceilings and deterministic truth predicates are unchanged.
