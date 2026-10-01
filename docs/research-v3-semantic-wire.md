# Compact semantic wire and local provenance reconstruction

The LIVE adapter uses `V3_SEMANTIC_WIRE_V1` and strict JSON schema
`v3_semantic_unit_v1`. It does not ask the model to serialize the internal evidence
contract. Selection, transport, country context and pricing truth predicates remain
unchanged from 8c0ea28.

## Input and output

The host converts each already bounded unit into:

- service name (identity context, never an expected price);
- `s0…` original text segments, with optional mapped normalized text;
- `p0…` presentations listing their constituent segment IDs;
- `d0…` original candidate destinations with label, URL and segment IDs.

Observation IDs, hashes, raw offsets, exact duplicated quotations, unit metadata,
network geography and desired market/amount are not sent to the model. Instructions
are sent once as the system message. Text remains untrusted source data.

The fixed schema uses only objects, arrays, strings, nullable strings, integers,
booleans and fixed semantic enums. It has no dynamic enums, union objects, nested
provenance structures or provider-specific fields. All object fields are required;
unknown fields fail locally. Empty arrays represent absent facts.

Flat output tables represent offers, charges, relationships, account destinations,
populations and account statements. Records use local IDs and source references.
Charges contain exact original `amountText`, currency/cadence/duration expressions,
semantic role, derivation, qualifiers and ambiguity. No truth/admission/verification/
sufficiency/objective-completion/confidence fields exist. `FOLLOWED_BY` is a source
relationship, not a truth verdict.

## Reconstruction and validation

`semantic-wire.mjs` validates shape, bounds, enums, IDs and references locally. It
reconstructs the existing `V3_EVIDENCE_V2` envelope using the immutable host request:

local presentation → original presentation boundary → complete original support;
local segment → original offset/quotation → observation ID/body hash;
local destination → actual original link/form;
normalized segment → validated translation artifact and original segment index.

Exact numeric tokens are located only in the referenced original segments. Partial
numbers, absent numbers, incompatible IDs, cross-offer temporal links and invented
destinations fail closed. Numeric normalization supports ordinary integer/grouped
and decimal notation; ambiguous or unsupported notation remains unresolved. An
ambiguous three-digit decimal/grouping notation is not silently resolved when the
currency permits three minor digits (using generic Intl currency metadata).

Introductory/subsequent relationships reconstruct into the existing internal
transition contract. A charge targeted by `FOLLOWED_BY` is evaluated as SUBSEQUENT,
so an ambiguous or unsupported link cannot bypass transition validation by also
claiming ORDINARY_RECURRING. Independently explicit ordinary charges still require
no redundant introduction proof. Each reconstructed fragment must then pass the
existing source-binding projection and deterministic evaluator. Host reconstruction
does not bypass authority, original hash integrity, offer context, cadence/currency,
consumer relationship, recurring role or country applicability checks.

The model is still fallible about source meaning. Provenance is deterministic;
semantic accuracy is not guaranteed by schema conformance. Derived records are not
independent evidence. No expected oracle answer enters production input.

## Live adapter and failures

The actual Groq SDK path serializes the compact input, uses zero retries and retains
existing timeout, run/model reservations and input/output bounds. Model/schema/API
availability is not asserted by offline mocks. The old retained run reports
json_validate_failed, but its failed generation was not retained; no specific
schema keyword is claimed to be the proven cause.

If a future API error includes a bounded failed generation, the adapter records only
whether it parsed as JSON and a safe local wire-validation category. It does not
persist the raw generation, provider message or possible reasoning. Safe existing
status/code/type/request-ID/unit/request-size diagnostics remain available. Unit
failures preserve native facts and previously accepted fragments.

## Offline evidence

Tests drive compact model responses through the actual SDK with mocked transport,
then reconstruction, source validation and truth. Heterogeneous controls cover
seven languages, trial/subsequent, annual arithmetic, credits, installments,
ambiguity, wrong market, account relationships, translated source mappings and
malformed/unsupported model responses. Faithful retained presentation fixtures
establish the ordinary recurring oracle price through this path while retaining
introductory zero and original eligibility qualifiers. They do not prove future
live model fidelity or eliminate remote rate limits. No live request was used to
implement or validate this milestone.

## Numeric-reference revision

The current provider contract is `v3_semantic_unit_v2`. Charges use `amountRef`
and a checked numeric value instead of reproduced `amountText`; populations use
`countRef`. See [numeric occurrence identity](research-v3-numeric-occurrences.md)
for exact source identity, normalization and safe diagnostic behavior. The
sections above describe the preceding wire revision.
