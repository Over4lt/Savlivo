# Source-local numeric identity

The semantic boundary uses `v3_semantic_unit_v2` / `V3_SEMANTIC_WIRE_V2`.
The original provider observation and existing V3 truth rules remain authoritative.

Before understanding, bounded original segments produce deterministic numeric
occurrences. Each has a unit/observation-specific ID, segment ID, original token,
possible numeric interpretations, and exact original UTF-16 source offsets.
Only the local ID, segment, token and value alternatives are sent to the model.
Offsets and observation hashes remain host-owned. At most 128 occurrences are
allowed per unit; existing request, response, semantic-unit and model budgets
remain unchanged.

A charge returns `amountRef` and `amount`. A population returns `countRef` and
`count`. The model classifies an occurrence's semantics; occurrence extraction
does not make a token money. Reconstruction requires that the reference exists
in the current unit, its segment belongs to the supplied support, the occurrence
is inside the owning offer presentation, and the value belongs to that exact
occurrence's deterministic alternatives. Null amount/reference pairs represent
missing evidence. References from other observations/units, partial matches,
borrowed plan amounts and mismatching values fail closed. Repeated equal amounts
retain independent IDs and exact spans. No first-value-match search remains.

Normalization supports ASCII/full-width digits, grouped comma/period/space/NBSP/
narrow-NBSP notation, decimal comma/period and common combined grouped/decimal
notation. A single separator followed by three digits can have two interpretations;
the semantic representation must select a value supported by the source token.
Currency precision no longer silently chooses notation. Unsupported notation
has no value alternatives and remains unresolved. This is a bounded numeric
syntax capability, not an arbitrary writing-system or locale parser. Negative
source signs are preserved and cannot produce a positive amount.

Currency still needs original source support. ISO codes must agree; symbols
must be compatible with the represented currency according to generic ICU/Intl
currency metadata. A shared symbol remains semantically ambiguous between
currencies; this check does not infer a country or market. Existing evidence
validation additionally rechecks currency/cadence/duration/qualifier support.
Temporal relationships and pricing admission are unchanged: intro is not ordinary,
and subsequent recurring charges require supported introductory transitions.

Parsed-wire failures retain safe bounded diagnostics: unit, object, field,
reference, candidate occurrences with values and original spans, and a structural
wire summary. Arbitrary generations, reasoning and free-form error messages are
not persisted. Successful fragments retain the same bounded structural summary
alongside the reconstructed evidence envelope. It is diagnostic data, not an
independent evidence source. Checkpoint restoration still revalidates original
observation/hash/span bindings through the existing evaluator.

The old `WIRE_NUMBER_AMBIGUOUS` was raised by the raw-text parser's unsupported
syntax, invalid currency configuration, or three-minor-digit currency precision
guard. It did not prove that the page contained too many numbers. Old source
matching simply selected the first full-token text match, losing repeated-token
identity. The previous live responses were discarded, so their exact offending
field cannot be retrospectively identified.

The subsequent `v3_semantic_unit_v3` revision preserves this numeric identity
contract and adds source-owned currency references; see
[currency/market ownership](research-v3-currency-market.md).
