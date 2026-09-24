# Independent provider-price proof requirements

## Audit and decision

The existing canonical decision is `verification/gate.mjs`: source re-derivation,
`fieldsFor`, `verifyCandidate`, then `verifyIdentity`. Keep it, rather than add a
second admission engine. Qualified/non-monthly exposure uses
`intelligence/provider-price-adjudication.mjs` and `offer-intelligence.mjs`; it
intentionally does not require a full monthly canonical identity. Retained
summaries apply current quarantine, invalidation, positive amount and freshness
checks (`recurring-price-eligibility.mjs`, `live/retained-pricing.mjs`). Adaptive
sufficiency and lifecycle disposition consume those eligible results, not raw
interpretations. Service admission and user-price strategy are separate.

Minimum independent facts: authenticated provider/service provenance; exact offer
identity/ownership; actual positive recurring commercial charge; amount/currency/
interval; and applicable market **for market-targeted exposure**. Contradictory
facts remain blocking. Scope/qualifications must be carried into exposure.
Unlocalized qualified observations remain possible under existing policy.

Visible presentation is one way to establish an offer assertion and ownership,
not a universal extra fact. An explicit bounded contractual renewal assertion
can establish them directly. A raw numeric catalog field cannot: it may be an
inactive variant, credit, stale configuration or internal value. This change
therefore applies only to existing source-bound named textual relationships;
all inert numeric/variant/purchase binding guards remain.

## Rule inventory

Concrete pipeline: `extract.mjs:extract/applyProse/grade` →
`attribution.mjs:attribute/combinedAttribute` and
`qualifiers.mjs:preserveQualifiers/qualifierSafety` →
`commercial.mjs:classifyCommercial/selectMonthlyPlans` (including
`price-context-guards.mjs:priceContextGuards`) →
`verification/gate.mjs:deriveEvidence/fieldsFor/verifyCandidate/verifyIdentity` →
`provider-price-adjudication.mjs:adjudicateProviderPrice/reconcilePriceObservations`
and `offer-intelligence.mjs:reconstructOfferIntelligence` →
`recurring-price-eligibility.mjs:retainedPricingSummary` →
`adaptive-campaign.mjs:assessAdaptiveService` →
`lifecycle-continuation.mjs:writeLifecycleDisposition`.

| Emitter / stage | Rule | Independent property / clearing evidence | Classification |
|---|---|---|---|
| live-source / verifier | hash, journal, source/target binding | Exact retained bytes + reviewed provider/service binding | INDEPENDENT_REQUIREMENT |
| extraction / grade | product unresolved, structural ownership weak | Source-owned plan/amount relationship | INDEPENDENT_REQUIREMENT except embedding-only flags |
| applyProse | embedded => ownership/qualifier ambiguity | Previously demanded visible activation despite exact textual assertion | LEGACY/ACCIDENTAL_COUPLING |
| attribution | MARKET_APPLICABILITY_UNRESOLVED | Valid offer-applicable provider declaration or permitted observed-market proof | DERIVED_SIGNAL of market requirement |
| grade | MARKET_ATTRIBUTION_UNRESOLVED | Same established attribution result | REDUNDANT_REQUIREMENT if treated as another fact |
| attribution | MARKET_SCOPE_UNRESOLVED | Explicit applicability of embedded/global offer, not merely page geo | DERIVED_SIGNAL explaining insufficient market binding |
| grade / qualifiers | promotion or qualifier ambiguity | Correct phase, preserved material conditions and amount attachment | INDEPENDENT_REQUIREMENT except embedding-only flags |
| presentation / inert-state bindings | active selected variant / purchase binding | Active ownership for machine amounts whose meaning is otherwise unknown | INDEPENDENT_REQUIREMENT on those paths, not universal |
| commercial / context guards | zero, credit, savings, tax/fee, prepaid, reference, equivalent, intro, cadence exclusions | Positive recurring subscription charge distinct from other monetary roles | INDEPENDENT_REQUIREMENT |
| commercial / monthly | verificationLevel and strongRecurringMonthly | Derived from established fields/semantics; no independent proof in a level number | DERIVED_SIGNAL |
| gate | missing-market diagnostics counted as conflicts | Missing applicability is not contradictory evidence | LEGACY/ACCIDENTAL_COUPLING |
| gate / monthly / reconciliation | incompatible same-identity prices, currency/market mismatch, different owners | Resolve actual contradictions or preserve distinct grounded scopes | INDEPENDENT_REQUIREMENT |
| report | union of candidate blockers | Explanation only, never a global veto over unrelated valid identity | DIAGNOSTIC_ONLY |
| adjudication / confidence | HIGH/MEDIUM, qualified/nonmonthly policies | Existing complete/qualified recurring facts and required scope | DERIVED_SIGNAL |
| retained summary / quarantine | invalidated, stale, rejected source/identity | Current eligible state and existing age/source rules | INDEPENDENT_REQUIREMENT |
| lifecycle / final projection | eligible verified or retained summary | Existing sufficiency/final policy; pricing optional for service | DERIVED_SIGNAL |

The market codes stay for compatibility and explanation. They represent one
market condition; do not fabricate country from language, currency, URL or task.
Embedded text retains structured-market restrictions: a page country/geo cannot
silently localize an independent embedded offer. An explicit country/eligibleRegion
co-owned by the offer can suffice under existing attribution. Mismatched market,
conflicting currency, provider/body binding mismatch and origin checks remain vetoes.

## General case matrix (assuming current source and required independent bindings)

| Case | Expected exposure |
|---|---|
| Visible provider pricing card | HIGH when owned recurring charge and market established |
| Contractual renewal sentence | HIGH under the same fact requirements |
| Bounded content-model/legal text | HIGH with explicit applicable market; otherwise qualified unlocalized or unresolved market claim |
| Intro then renewal | Intro retained/non-recurring; renewal HIGH if sufficient |
| Free trial then paid renewal | Zero ineligible; independently established paid renewal eligible |
| Included-benefit zero | Ineligible as recurring price, retained context |
| Discount amount | Ineligible as subscription charge |
| Benefit credit | Ineligible as subscription charge |
| Tax amount | Ineligible as base subscription charge; preserve tax qualification |
| Annual total | Eligible qualified non-monthly when explicitly annual recurring |
| Monthly equivalent | Not canonical monthly charge; retain unresolved/qualified context |
| Multiple named plans | Separate eligible identities, not cheapest/first wins |
| Separate membership | Separate identity; no cross-product borrowing |
| Unowned amount | Retained unresolved identity |
| Raw structured number | Retained unresolved; no new textual proof |
| Wrong market | Target-market ineligible; existing unlocalized/scoped policy unchanged |
| Unresolved market | Market-specific claim unresolved; existing unlocalized qualified path preserved |
| Repeated identical text | Same facts, no false conflict |
| Conflicting same-offer visible/structured amounts | Unresolved under existing conflict rules |
| Stale/ineligible retained result | Not sufficient; existing age/invalidation/quarantine unchanged |
| Member-only/qualified price | HIGH/MEDIUM where existing scope policy permits; qualification retained |
| FROM price | Not a definitive recurring price under existing rules |
| Non-monthly subscription | Existing qualified HIGH/MEDIUM interval path preserved |
| Positive + included zero | Positive may qualify; zero cannot qualify or contaminate ownership |

## Compatibility and limits

New derivations use new offer-eligibility and verifier identities. Historical
completed runs are not rewritten, migrated or upgraded. Existing historical
safe retained policies are unchanged; old verification decisions cannot be
substituted for new-version identity verification. No recovery is introduced.

The identities are `SOURCE_BOUND_OFFER_ELIGIBILITY_V3` and
`V2_FIELD_VERIFICATION_V4`. The verifier's `proof` field groups its existing
mandatory fields for diagnostics; it does not replace those fields or grant
eligibility. Missing-field diagnostics no longer masquerade as contradictory
evidence in the consistency field. Actual mismatches and commercial ambiguity
still block independently.

The case matrix exposed a previously masked monetary-role hole: an amount
followed by `/month credit`, `/month discount` or `/month tax` could look like a
charge once the blanket embedded veto was removed. The existing source-local
context guard now recognizes those component forms. A price *including tax*
remains a charge; no page-wide credit/discount veto was introduced.

Tests must reopen synthetic retained journals through the actual interpreter and
verification worker, test explicit same-offer country rather than URL inference,
and exercise both no-market and valid-market content-only cases. The production
body is unavailable locally; no claim is made that its market evidence suffices.

The persisted contractual fixture contains no visible offer rendering. Its
explicit co-owned country plus reviewed source produces separate verified
11.99 and 21.99 monthly renewal identities and a separate 39 membership. Intro
totals and included zero stay ineligible. The actual retained summary, adaptive
assessment and final disposition produce `HIGH_SUFFICIENT` and `ESTABLISHED`;
suggestions remain optional and editable. Without applicable market evidence,
the two paid candidate decisions fail only `MARKET_NOT_INDEPENDENTLY_VERIFIED`.
The existing qualified unlocalized policy remains distinct from a DE claim.
