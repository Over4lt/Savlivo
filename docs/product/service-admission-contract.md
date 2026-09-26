# Service admission V1

`service-universe-manifest.json` is normative. `SERVICE_ADMISSION_V1` evaluates
four independent dimensions: `serviceSize`, `monthlyRecurring`, `accountLogin`
and `membershipManagement`. Each is `ESTABLISHED`, `UNRESOLVED` or
`DISQUALIFIED`. All four must be established for admission. A proven mandatory
failure disqualifies; missing or conflicting proof remains unresolved.

Research candidacy, `NEW_INCLUDE`, catalog login/manage capability, completed
execution, generic subscription qualification and verified pricing are not
admission. Existing research schedules and budgets are unchanged. Pricing
hypotheses remain researchable; `pricingExposure`/`exposure` explicitly distinguish
`RESEARCH_HYPOTHESIS_ONLY` from `ADMITTED_SERVICE_PRICING`. Final pricing
`publicationEligible` requires admission **and** established pricing. Admission
itself requires neither a verified price, cancellation nor geographic breadth.
No publication or catalog promotion is performed by the research executor.

## Evidence

`SOURCE_BOUND_SERVICE_QUALIFICATION_V1` records the exact service, reviewed
provider authority, source URL/hash, immutable-body reference, capture time,
quoted proposition, original locator and typed dimension facts. Its digest is
bound to the normative manifest hash. New evidence must pass byte/hash, authority,
freshness and semantic checks. The retained-source ceiling is 30 days for **new
establishment**, not an expiry of previously established propositions.

`CORROBORATED_PROPOSITION_PERSISTENCE_V1` is shared across the four dimensions.
An explicitly sufficient direct provider proof may establish by itself. Three
strong semantically valid, genuinely independent observations of the same
proposition also suffice. Different dimensions cannot compensate for each other.

Default dependencies group assertions by their provider origin, body hash and
normalized statement. Repeated extraction, mirrors and reused statements cannot
increase independence. Corroborating observations can carry a frozen
`QUALIFICATION_INDEPENDENCE_REVIEW_V1` through
`authority.qualificationEvidenceReview: {path, sha256}`. The reviewed document
must bind the exact service/URL/hash, reviewer and reason, declare
`proofKind: CORROBORATING_OBSERVATION`, and list the underlying `rootIds`.
Different URLs do not supply that review. Intersecting dependency roots are
merged transitively. Unreviewed/mismatched reviews cannot grant independence.
A normal direct declaration on a reviewed provider FAQ needs no such review.

An establishment receipt records the exact proposition, validated observations,
semantic version, dependency groups and sufficiency rule, with an integrity
digest. Valid typed receipts persist without re-fetching the source: missing
bytes/metadata, acquisition failure, stale captures, changed page structure or
no new evidence are **not** counterfacts. New source-bound, sufficiently proven
negative evidence for the same proposition triggers review; positive/negative
conflicts remain unresolved and their evidence persists across subsequent
reloads. A single annual offer is not a service-wide contradiction. Legacy
qualification booleans and typed-looking states without valid establishment
receipts cannot be grandfathered. No network request is made by evaluation.

The bounded deterministic reader currently handles explicit visible paragraph
billing/renewal assertions and exact-service audience statements, and reuses the
existing provider account capability interpreter. Unsupported forms/languages
remain unresolved; they are not assumed false. JSON dictionaries, scripts,
headers, footers and navigation cannot qualify monthly billing or audience.

Monthly proof needs a source-bound consumer subscription/membership proposition
with an explicit monthly billing/charge/renewal predicate. Price amounts and
normalized price cadence are not inputs. Annual, equivalent, benefit,
installment, usage and hypothetical/negative statements cannot establish it.
An annual offer alone does not prove the service has no monthly alternative.
Separate genuine monthly and annual offers can therefore coexist.

Audience proof needs an exact-service subject and an accepted user/member/
customer/subscriber metric. A documented lower bound of at least 100,000
qualifies; an exact count of 99,999 does not. A lower bound below the threshold
or an approximate count is unresolved. Downloads, traffic, followers,
parent/group totals and unrelated services cannot qualify. Conflicting counts
are retained for review rather than silently combined.

Login and account subscription management remain independent facts. A generic
management link without account-management semantics does not establish the
management admission dimension. None of these capability facts establishes
monthly billing or audience size.

## Persistence and compatibility

Targets persist `serviceAdmissionEvidence`, derived `serviceAdmission`,
`productionEligible` and `pricingExposure`. Native source observation and
retained replay collect proofs. Target construction, adaptive/native reload and
lifecycle seeding re-evaluate them without refunding requests or resetting
research memory. Final dispositions aggregate source-bound proofs across catalog
and pricing research and expose all four dimensions, provenance, rejection and
unresolved reasons. Legacy subscription booleans are never imported as monthly
proof. The existing `catalogEligibility` capability model remains separate.

Provider-price eligibility, market proof, zero-price rejection, user-price
precedence and annual/contextual price evidence are unchanged.
