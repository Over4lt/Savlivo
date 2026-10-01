# Research V3 observation service and one-way currency context

## Service identity and association

The previous validator required every evidence fragment's selected service support to repeat the complete objective service name. In the retained acquisition live trace the hero pricing response had valid amounts, JPY currency references and a temporal relationship, but its `serviceSources` omitted the supplied title. The validator returned `SERVICE_ASSOCIATION_UNSUPPORTED` before considering offers. The later card response selected the title but left currency unknown.

An authoritative intact provider observation may independently establish its service identity through the native, source-bound title/primary heading path. V3 exposes an opaque observation-owned service reference plus eligible local presentation IDs. This reference is scoped to observation ID, body hash, service and identity span. The model can represent a local `PRIMARY_SERVICE` relationship; it does not establish identity or sufficiency. A null model reference can be reconstructed from the known object when that relationship is expressed; unknown/invented non-null references fail closed.

Inheritance requires independently supported identity, the same observation reference, a reconstructable local presentation, primary `main`/`role=main` ancestry or matching Schema.org Service/Product/SoftwareApplication identity, no peripheral navigation/header/footer/aside ancestry, no competing structured service identity, and an explicit primary semantic relationship. Matching structured Offer plan names are not competing Service identities. Peripheral content, explicit different identities, comparison/partner/component/add-on structure or semantic relationships, and ambiguous relationships fail closed. Typed local service scope can distinguish a matching service from unrelated siblings. The entire page is never sufficient association by itself.

HTML ancestry is reconstructed from original source tags and bounded spans; it is not supplied by the model. Existing explicit fragment service support remains supported. Newly inherited identity does not automatically authorize population/account statements: those retain their existing explicit support path. Failure of one offer association rejects that offer rather than discarding unrelated valid offers or observation identity.

Limit: arbitrary unmarked prose is not a deterministic catalog of all service names. Understanding still supplies fallible semantic relationships. Unknown relationships remain unresolved; markup cannot prove an absent conflict. No language-specific conflict parser is introduced.

## Currency directionality

Currency occurrences remain deterministic original-source tokens, with stable occurrence IDs, raw tokens, spans and generic ICU candidates. Explicit source ISO/context and compatible model source selection retain precedence. Verified geography never rewrites an explicit CNY/USD charge into another currency.

When source candidates remain genuinely ambiguous, reconstruction may intersect them with compatible currencies for an independently accepted COUNTRY/BRACKET_VERIFIED provider context. The intersection must contain exactly one candidate. Requested-only, pending, Direct/UNBOUND, unknown-region metadata, non-unique/empty intersections, and explicit incompatible/ambiguous/excluded offer-market material do not authorize narrowing. Conflicting shared explicit source currency context cannot be replaced by geography.

The market receipt is validated before semantic understanding. Currency narrowing consumes that context; it cannot create or mutate geography. Truth evaluates market through its existing independent explicit-provider/verified-country rule. Currency, language and URL path remain incapable of establishing market.

`market-currencies.mjs` is an explicit, reviewable compatibility table using ISO 3166-1 territory and ISO 4217 currency codes, grouped by currency rather than country-specific executable branches. Reference standards: [ISO currency maintenance / SIX](https://www.six-group.com/en/products-services/financial-information/data-standards.html) and [Unicode CLDR currency data](https://github.com/unicode-org/cldr/blob/main/common/supplemental/supplementalData.xml). These were not downloaded during this milestone. The table is a maintained project snapshot, not a runtime fetch or a claim to exhaust every payment instrument. Recognized multi-currency/co-circulation contexts are conservative sets (for example Liberia LRD/USD and the southern African shared currency contexts). Unknown/omitted territories disable narrowing. Currency transitions require maintenance; explicit source currency always takes precedence. The table never establishes a source amount, money role or market.

## Validation and diagnostics

The wire remains strict `v3_semantic_unit_v3`, with nullable `serviceRef` and a local semantic `association` enum added to offers. Old retained/fixture responses missing these additive fields normalize to null/UNKNOWN, retaining the explicit-support path. Truth/admission/verdict fields remain forbidden.

V3 reconstructs a charge's currency source reference and records the model selection separately from the resolved code. Evidence projection regenerates original currency occurrences, checks exact source support/presentation ownership, and independently repeats resolution. Forged resolved codes or references fail closed. Checkpoint restoration repeats this validation.

Service diagnostics retain observation/reference, identity span/hash, local reference, presentation/ancestry, competing structured identities, predicates and rejection reason. Currency diagnostics retain charge/occurrence, raw token/span, initial candidates, semantic selection, source constraints, independent market/verification, intersection, result and reason. No arbitrary model generation, credentials or sensitive headers are retained.

All regression tests are offline. The faithful retained pricing presentation exercises the mocked SDK/wire boundary with omitted local full service identity and null semantic currency selections, followed by local inheritance and verified-market narrowing. Positive and negative controls use the same production path for varied services, languages and markets.
