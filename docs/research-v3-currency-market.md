# Currency source identity and market ownership

The provider wire is `v3_semantic_unit_v3` (`V3_SEMANTIC_WIRE_V3`). Numeric
occurrence identity and all existing model/acquisition budgets are unchanged.

## Currency

Original bounded segments are scanned for ISO currency codes and symbols from
ICU/Intl currency metadata. Each occurrence retains an observation/unit-specific
ID, original segment, exact original token/span and candidate ISO codes. Unicode
normalization uses a normalized-to-original offset map. At most 64 occurrences
are permitted per unit. This is currency-token extraction, not arbitrary prose
understanding: unsupported written-out currency names remain unresolved.

Charges reference `currencyRef` and optionally select `currency` from its
candidates. The host reconstructs original currency text. A singleton source
candidate can supply its ISO code without requiring the model to repeat it.
Ambiguous symbols remain multi-candidate; an unselected ambiguity stays
unresolved. Explicit ISO evidence within the owning presentation can narrow a
symbol. No country, language, URL or target market is used as a currency decoder.

Currency references must belong to the owning presentation. Shared currency
context within that presentation is supported and its original segment is added
to charge support. Explicit currency tokens attached to the amount must agree
with the chosen currency; unrelated prices cannot lend their currency merely
because they share a broad presentation. All reconstructed fields still pass
existing hash/span/quotation and pricing validation. The model remains fallible;
provenance validation is not proof of semantic correctness.

## Market

Offers no longer return a generic `market` field. They can return only explicit
provider `marketStatements` with country, INCLUDED/EXCLUDED polarity, source
segment references and ambiguity. Empty statements do not require a model to
restate acquisition context. The existing truth evaluator attaches its verified
COUNTRY/BRACKET_VERIFIED observation receipt to validated relevant offers.
DIRECT/UNBOUND remains unbound. Language, currency and URL path are not geography.

Legacy decorative `market`/`marketSources` fields are ignored with a diagnostic,
not accepted as provider assertions. Malformed/unsupported statements are scoped
and diagnosed. A malformed country actually present in supported provider text
leaves market understanding unresolved rather than failing the whole envelope.
An unsupported redundant model value does not invalidate the geography receipt.
Valid explicit provider inclusions keep the existing precedence over acquisition
country. Multiple/ambiguous supported inclusions prevent automatic country use.

One minimal truth extension represents explicit provider exclusions. Before this
change a verified COUNTRY observation with an understood offer could establish
market applicability even if that same presentation explicitly excluded that
country, because there was no negative market representation. The reproducible
case is a valid country-bound recurring offer whose provider states “This offer
is not available in [that country].” Source binding proves where that statement
came from but cannot give the previous positive-only market field negative
polarity. Validated exclusion support now causes TARGET_MARKET to be CONTRADICTED
for the excluded country. No pricing/admission predicate, proof count or transport
rule changes. Absence, malformed or failed understanding is not contradiction.

## Diagnostics and offline controls

Currency rejection retains charge, reference, requested ISO/non-ISO category,
exact original token/span, candidates and deterministic reason. Structural wire
summaries distinguish null from NON_ISO output. Market diagnostics identify
provider assertions versus ignored decorative model fields, supported bounded
country text/codes, source references and rejection category. Requested/verified
country and verification state remain separate system-owned diagnostic metadata.
Raw model generations and credentials are never persisted.

Tests use source-bound mocked SDK responses, varied currency formats, ambiguous
symbols, shared context, repeated occurrences, multiple presentations, forged
references, explicit exclusions/inclusions and Direct/COUNTRY controls. Existing
numeric and account tests remain required. No fixture/provider-specific production
branches or live probes are introduced.
