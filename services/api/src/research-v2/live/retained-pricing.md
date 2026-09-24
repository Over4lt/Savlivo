# Retained recurring provider-price eligibility

Savlivo accepts only positive provider-derived recurring subscription amounts.
`positiveProviderAmount` is shared by source commercial guards, qualified confidence
and retained/final projection checks. Extraction and stored observations are not
filtered. User-entered actual prices and service/catalog admission are outside this
predicate. Existing runtime price knowledge and persisted suggestion storage also
already require positive amounts.

`retainedPricingSummary` applies current target quarantine and source invalidation
before preserving the existing singular HIGH/MEDIUM sufficiency summary. HIGH or
MEDIUM adjudication remains sufficient; full monthly V2_VERIFIED is not required.
Quarantine matching uses source hashes, amount/currency and applicable service,
market, plan/cadence/scope identity. A missing identity cannot justify resurrection;
known different plans/scopes remain independent. The underlying observations remain.

Producers audited: open-web `retainedPriceReview`, `retainedSuccesses` /
`consumeRetainedSuccess`, and expansion-campaign carry-forward. Fresh replay and
live Direct use the first helper; local reuse uses the second. Live result
integration preserves returned quarantine records so subsequent local reuse cannot
forget a rejection. Quarantine matching/adjudication policy itself is unchanged.

Consumers audited: information routing, the legacy research planner, adaptive
sufficiency, expansion result/carry-forward, lifecycle final disposition, Operations
projection and refresh. Cached review is checked against current negative state
when consumed. Final verified-price exposure uses the same predicate without
deleting historical target observations. Operations only projects lifecycle output.
Refresh already rejects non-positive seeded facts and uses current interpretation
for changed responses.

New summaries include amount, currency, plan, cadence, scope, source hash/URL and
available capture time. Legacy amount-less summaries may use their existing local
artifact to establish a positive eligible observation; missing evidence cannot be
assumed positive. Historical artifacts are never rewritten. Existing age and
invalidation rules remain; this adds no new global TTL. These summaries and their
policy version are not authentication or recovery authority.

Compatibility: source-bound eligibility V2 and field verification V3 supersede the
3A zero-eligible semantics. Old derived/verification versions cannot be relabeled
as current results. The retained policy marker is
NONZERO_RECURRING_PROVIDER_PRICE_V1; it is not a verifier receipt.

No replay reconstruction, broad artifact pinning, scheduling, new budget, transport,
provider rules, extraction architecture, or service-admission policy is introduced.
