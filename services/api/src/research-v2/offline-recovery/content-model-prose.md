# Content-model prose: evidence boundary and offline proof

The September 24 production inspection located paid renewal prose in a valid
`__NEXT_DATA__` application/json payload at a `fields/legalText/0/fields/variations/0/fields/text`
leaf. It was 865 characters, not serialized JSON, and neither size nor traversal
budget was exhausted. No local reference/body for the reported SHA-256 was found
in the searched retained artifacts; tests use synthetic data, not production bodies.

## Audit before editing

`live/interpret.mjs` validates the journal body and passes it whole to `extract`.
`walkJSON` visited the leaf but its textual-field allowlist excluded `text`.
A supported-field substitution reproduced candidates without changing the parser.
The requested English fixture also exposed a separate narrow vocabulary omission:
`the membership renews monthly at` required the word `automatically`, losing the
first named amount. German automatic-renewal wording already worked.

The real persisted interpreter/worker test then exposed a third deterministic
blocker: discovery deduplicated `EUR` and `€` witnesses into one candidate, while
verification reopened every locator with the representative candidate's raw token.
The other spelling could not match. Discovery now includes `currencyRaw` in its
candidate key; normalized facts/monthly identities still combine the equivalent
values. Exact verifier matching is unchanged. No further deterministic defect was
found in the tested relationship. This is not a claim about every production candidate.

| Stage | Required source fields / independent evidence | Remaining boundary |
|---|---|---|
| Extraction | literal amount, EUR, monthly wording, unambiguous named plan; body hash, exact JSON path and normalized text spans | Bounded discovery only |
| Commercial classification | source-reparsed relationship and phase/transition; intro duration distinct from cadence | Intro and included benefit do not become regular charges |
| Monthly normalization | service, market, plan, amount/currency, compatible terms and strong witness | Task market is not market proof; a weak JSON representation alone cannot be strong |
| Grading | source ownership/qualifiers, authority, independent applicable market | Embedded activation and structured market scope remain unresolved without supporting evidence |
| Targeted verification | reopened hash-verified journal, reviewed provider identity, candidate bindings, freshly derived source fields | No authority from script ID, textual leaf or task URL |
| Identity/final eligibility | strong monthly identity, verified witness, no contradictory same-identity evidence, positive recurring amount | Verification remains evidence eligibility, not service admission; downstream quarantine/policy still apply |

## Existing blockers (unchanged)

- `CURRENCY_UNRESOLVED`: absent on literal EUR relationships; remains on raw
  amount-only candidates. It is candidate-local.
- `PRODUCT_UNRESOLVED`: resolved by the bounded plan/amount relationship. A name
  does not automatically satisfy active structural ownership.
- `STRUCTURAL_OWNERSHIP_WEAK` and `EMBEDDED_OFFER_ACTIVATION_UNRESOLVED`: deliberately
  remain on content-only JSON. Provider-authored text is not proof that an offer
  is actively presented. Visible source-bound evidence is a distinct witness.
- `MARKET_APPLICABILITY_UNRESOLVED`, `MARKET_ATTRIBUTION_UNRESOLVED`,
  `MARKET_SCOPE_UNRESOLVED`: remain without independent applicable evidence;
  embedded structured state cannot simply borrow page geo or the requested DE.
- `STRUCTURED_VISIBLE_CURRENCY_CONTEXT_CONFLICT`: the existing JSON/visible
  currency consistency check remains. EUR witnesses do not inherit a currency-less
  unrelated raw candidate's blockers in the fixture. Actual multi-currency
  production content was not available for independent adjudication.
- `REPEATED_TEXT_DIFFERENT_OWNERS`: repeated identical plan-owned text does not
  trigger it in the fixture. Different asserted owners must not be silently merged.
- `CROSS_CARD_CONFLICT`: distinct plans and the included-benefit role do not
  contaminate each other in the fixture; genuine ambiguous ownership remains blocked.
- `QUALIFIER_EVIDENCE_BOUND`: qualifier limits remain enforced. The bounded fixture
  does not trigger this; absence of the complete production body prevents declaring
  that every production occurrence satisfies this limit.

Aggregate report blockers are diagnostic unions. `verifyIdentity` uses linked
candidate decisions, accepts a valid witness despite missing evidence in weak
duplicates, but retains positive conflict/mismatch findings. The tests exercise
this distinction through persisted monthly artifacts and targeted verification.

## Implemented boundary

Only typed `__NEXT_DATA__` content-model `text` fields under legal/offer semantic
containers (`legalText`, legal/official disclaimer, `offerText`, `terms`,
`description`), with bounded `fields` / indexed `variations` or `content` wrappers,
enter the existing prose recognizer. This is a syntax/discovery rule, not provider
trust. `officialDisclaimer` also joins the existing explicit disclaimer fields.
Arbitrary text/value leaves, translation dictionaries, string arrays and nested
serialized JSON are not mined. Existing 2,000-character, 64-field, 64,000-character,
16-price and source/node bounds remain; content-model paths additionally have
length/depth bounds. No verifier, attribution, promotion or eligibility rule changes.

## Local end-to-end proof and limitation

Synthetic retained acquisition journals run through the actual offline interpreter
and targeted-verification worker, both with network disabled. Two recurring prices
11.99 EUR/month (Plan Basic) and 21.99 EUR/month (Plan Plus) coexist with intro
5/8 totals, included zero, a separate 39 membership, repeated prose, raw amount-only
fields and ambiguous prose. Source hashes and journal bindings are checked.

Content-only: relationships survive discovery/monthly processing but no strong or
verified identities. With matching visible presentation but missing market or
authority: still no verified identity. With visible presentation plus independently
provider-declared market and reviewed source authority: all three separate positive
identities verify; zero and intro totals do not. This does not turn embedded JSON
into a visible witness or infer that the production page supplies one.

The production inspection proves the text/hash/currency/cadence/names, not active
presentation or identity-specific market applicability. Those require inspection
of existing evidence or other evidence if absent. This patch alone therefore does
not promise a verified production price. It establishes discovery and proves the
remaining deterministic route when independent requirements are actually met.
