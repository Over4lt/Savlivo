# Explicit pricing maintenance

API startup and process timers do not refresh live pricing. No replacement scheduler is installed.
The existing `/v1/pricing` on-demand path (including its explicit refresh option) and the
`refreshVerifiedPricingCountries()` function remain available. Cache misses can still acquire
provider prices. These are separate from Research V2 and its capabilities/budgets.

Explicit country batches allow two active markets per API process. Provider adapter executions
share four slots across countries and overlapping requests. Adapter asset discovery is sequential;
a slot stays occupied until the adapter completes, including response parsing. These conservative
limits replace country/adapter fan-out. They are per process, not distributed fleet limits.

Batch metrics `marketsAttempted`, `marketsCompleted`, and `failed` describe execution outcomes.
`acquisition`, `verification`, and `persistence` are null (unknown), not invented success counts.
Legacy `checked`/`refreshed` aliases remain for callers, but mean attempted/completed markets only.
Adapter fallback and caught persistence failures can yield a completed market. No startup success
log calls that verification. A future intentionally scheduled operation needs explicit admission,
provider-level accounting and persistence reporting; none is enabled by this change.
