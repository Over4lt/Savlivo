# V3 semantic wire reference contract

The host generates selectable IDs from the final bounded unit. Request serialization and reconstruction both use `wireInput` and the same typed registry. No page-wide ID is accepted where a unit-local ID is required. The model describes semantics; it cannot create provenance or truth.

| Wire field | Namespace / targets | Owner; supplied in request | Reconstruction / failure |
|---|---|---|---|
| serviceSources; all sources arrays | segment: sN | host; yes | original segment span/quotation; WIRE_REFERENCE_INVALID |
| offers.presentation | presentation: pN | host; yes | original presentation; WIRE_REFERENCE_INVALID |
| offers.serviceRef (nullable) | observation_service | host; knownObservationService.reference | original verified service reference; WIRE_SERVICE_REFERENCE_INVALID |
| charges.offer | offer | model; returned offers.id | owner; WIRE_REFERENCE_INVALID |
| charges.amountRef (nullable); populations.countRef | number: n-* | host; numbers | exact numeric occurrence; WIRE_NUMBER_REFERENCE_INVALID |
| charges.currencyRef (nullable) | currency: u-* | host; currencies | exact currency occurrence; WIRE_CURRENCY_UNSUPPORTED |
| accounts.destination | destination: dN | host; destinations | original acquired destination; WIRE_REFERENCE_INVALID |
| FOLLOWED_BY from/to | charge | model; returned charges.id | same-offer transition; WIRE_RELATION_INVALID |
| account relation from/to | account | model; returned accounts.id | account graph; WIRE_RELATION_INVALID |
| UNKNOWN from/to | charge when from is a charge; otherwise account | model | conservative unknown relationship; WIRE_RELATION_INVALID |
| marketStatements.sources | segment | host; yes | explicit provider statement only, not acquisition market |

Returned offer/charge/account IDs must be globally distinct (existing internal graph contract). They are not source IDs. Country strings are semantic values, not reference IDs. Original observation ID/hash, presentation ancestry/container IDs, quotation/span objects and translation artifact/index mappings are host-owned and never selectable wire fields. Translation mappings are reconstructed by exact original segment spans, independently validated against the original observation. A known service reference cannot be used as a segment reference.

Every supplied ID resolves in its compatible namespace. Resolution alone does not prove semantics: amount/value agreement, currency candidate agreement, source membership, same-offer relationships, service ancestry/authority and deterministic truth predicates remain independently enforced. A syntactically valid reference to unrelated evidence can still fail these semantic rules. Empty support does not create support. Null optional references do not enter lookup.

Repeated valid segment support IDs are deduplicated in original encounter order. Repetition adds no evidence and is no longer misclassified as an unknown reference. No unknown reference is repaired or admitted.

Every lookup failure records unit, observation, semantic object, exact field path, bounded supplied ID, expected namespace, available IDs/count, whether supplied anywhere in the host input, actual competing namespaces, presentation IDs and UNKNOWN_REFERENCE/WRONG_NAMESPACE. Safe normalized wire summaries include all reference-bearing fields (including service, populations, account statements and account graph), while omitting arbitrary names/qualifiers/generations. IDs outside the bounded identifier syntax are not copied as free text.

The prior live trace did not preserve every returned reference. Its exact offending historical field is unrecoverable; this change makes future failures reconstructable without guessing or another probe. Offline tests enumerate every exposed namespace/compatible field, wrong namespaces, repeated supports, serialization stability, mocked SDK diagnostics/checkpoint restoration and the faithful recurring/introductory fixture. No provider/language/market-specific reference rule is introduced.
