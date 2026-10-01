# Research V3 source-bound evidence and deterministic truth contract

## Minimal truth contract (defined before evidence understanding)

Authoritative provider observations are the source of truth. Translation and
understanding are derived artifacts, not additional evidence or truth authorities.
`truth-contract.mjs` specifies:

- ESTABLISHED: one source-bound authoritative observation may explicitly present
  a sufficient fact, with the required offer relationships/context.
- UNRESOLVED: missing, ambiguous, unsupported or failed understanding supplies no
  sufficient support or contradiction. Failure and absence are not falsehood.
- CONTRADICTED: incompatible authoritative facts for the same proposition and
  offer/context, or an explicit incompatible fact (e.g. annual cadence for a
  monthly proposition). Different plans/markets do not contradict one another.

No agreement, repeated observation, transport, language, universal proof count or
particular page structure is required. Missing later evidence does not retract
facts retained in earlier authoritative observations.

## Price and market requirements

An ordinary consumer recurring price needs service/offer identity, positive
ordinary amount, currency belonging to that amount, cadence belonging to that
charge, consumer subscription/membership relationship, and applicable market.
Introductory charges and their duration remain separate from subsequent recurring
charges. An explicit transition may attach ordinary recurrence after introduction.
Annual arithmetic, installment arithmetic, credits/benefits, trial-only/zero prices
and unknown cadence cannot establish the ordinary monthly price objective.

Market may be explicitly represented by provider evidence. Alternatively, a
successful provider presentation in verified COUNTRY context contributes that
country when no conflicting/ambiguous provider market evidence exists. The
capability receipt must be BRACKET_VERIFIED, requested and verified country must
match the observation context, and provider HTTP status must be 200. Direct is
always excluded from this inference. The rule does not inspect the proxy vendor,
language, currency or URL path. Explicit other-market evidence takes precedence.

This rule prevents the incorrect unresolved outcome where a sufficient provider
offer is actually observed through verified target-country acquisition but does
not redundantly print that country's name. It does not make a Direct 200 geographic
proof. The existing source-binding checks cannot provide missing network context;
therefore deterministic market evaluation must consume the capability receipt.

## Evidence understanding

The implementation/coverage, strict evidence contract and offline validation are
described below as the milestone is completed. LLM output must never contain truth
states, verification, admission or sufficiency verdicts. Every evidence element
and relationship remains bound to original visible provider spans and presentation
context. Provenance validation does not independently prove semantic accuracy.

## Implemented architecture and representation

Original authoritative observation → bounded visible segments/presentation boundaries
→ optional translation → native extraction or bounded multilingual understanding
→ `V3_EVIDENCE_V2` structure → binding/projection validation → deterministic truth.

The default live Groq path understands original material in ONE call when native
extraction cannot handle it. It receives a service name for relevance, original
segments and presentation IDs, and optionally a validated translation. It does not
receive desired price/currency/market or proposition states. The retained translation
contract is independent, and already usable translation can bypass understanding.

The minimal evidence structure contains:

- Service identity, scoped population observations and account operations/polarity.
  These describe service facts, not admission. Population thresholds and post-login
  management admission remain the existing deterministic rules.
- Offer reference/name, service association, audience, relationship, exact limiting
  qualifiers, presentation membership and ambiguity.
- Atomic charges with amount/notation/exact numeric span, currency/notation, cadence
  expression, introductory/ordinary/subsequent/benefit/credit/other role, derivation,
  introductory duration and qualifiers.
- Explicit recurring-after-introduction links between charge IDs. SUBSEQUENT needs
  a supported link; independently stated ORDINARY recurrence does not. There is no
  universal transition or proof-count requirement.
- Explicit provider market context or UNKNOWN. Execution geography is NOT supplied
  to the model as a market answer.

Every element is supported by full original visible segments. Offers additionally
retain all visible segments within their supplied presentation, so a qualifier
cannot silently vanish from provenance. Money uses a precise original numeric span
and local numeric normalization, preventing prefixes/suffixes or invented amounts.
All translated support additionally identifies the exact validated artifact/segment.
The original body/hash remains authoritative and unchanged. Artifacts are not
independent provider observations. Forbidden state/admission/sufficiency fields,
unsupported structures, wrong hashes, absent/altered quotes, omitted presentation
support and unbound qualifiers are rejected locally, even if remote schema output
claims success. Hidden/scripts/snippets are not evidence support.

## Deterministic evaluation and general invariants

`projectEvidence` reconstructs normalized source evidence on every evaluation; it
never mutates propositions. `truth.mjs` applies service, positive ordinary amount,
recognized currency, genuine cadence/consumer relationship, and market predicates.
UNKNOWN/ambiguous/unbound elements do not become established or false. A subsequent
amount is not ordinary until its temporal link is represented and bound; that rule
prevents attaching an introductory duration or an unrelated later amount to a
recurring price. Independent ordinary recurrence needs no redundant link.

Charge-local IDs are link references, not truth identity. Grouping uses normalized
service/offer name, semantic phase and original charge order, plus existing market/
qualifier/role/derivation context. Introductory and recurring charges, different
plans, conditions and markets do not pool fields. Real incompatible observations
of the same scoped charge retain contradictions even if a model changes its local ID.

Validated explicit evidence replaces an overlapping *partial native offer projection*,
so an anonymous duplicate cannot hide that offer's contradiction. Original material,
service/account/population facts, unrelated native offers and all native facts on
failed/ambiguous understanding remain available. Explicit native market material
cannot silently disappear: it is retained or disagreement becomes ambiguity. This
prevents a model's UNKNOWN market from erasing an observed wrong-market qualifier
and admitting the network country instead.

The native parser now leaves competing cadence expressions unresolved for semantic
understanding, rather than classifying an ambiguous monthly/annual expression as
an authoritative annual contradiction. It adds no new phrase vocabulary. Numeric token normalization reads space-grouped
amounts completely and rejects unresolved prefixes/suffixes, preventing 1 or 080
from becoming a price merely because the source printed 1 080. These are generic
numeric boundaries, not service/language/currency rules.

## Bounded failures, trace and resume

Model reservations are counted/persisted before dispatch; uncertain interrupted calls
remain spent. Counts are conservative reservations, not proof that remote completion
occurred. Provider-network requests/bytes remain transport accounting; model requests
are separately bounded by modelCalls, timeout, reply bytes and output tokens. SDK
retries are zero, redirects are forbidden and only the fixed Groq chat endpoint is
allowed. No monetary routing preferences are used.

A failed/unsupported/uncertain understanding attempt retains the provider observation,
records a safe typed error and permits remaining grounded actions. Zero/exhausted
model budget does not block usable native evidence. Pending acquisitions are not
replayed on resume. Checkpoint integrity, adapter revision/role, model accounting,
original/translated/evidence hashes and all bindings are revalidated. Old flat
candidate envelopes cannot be silently resumed or admitted. Trace includes candidate
evidence structures, accepted/rejected bindings, deterministic evaluations/changes,
usage/bounds, unresolved needs and stop reason; no hidden chain-of-thought is requested.

Error output retains only whitelisted internal categories, HTTP status and selected
safe API codes (including model-not-found/schema-validation failures). Raw API/provider
error messages, SDK logs, credentials and reasoning transcripts are not persisted.
Grounded-action exhaustion and capacity exhaustion remain distinct.

## Offline evidence and limitations

Heterogeneous English, Norwegian, German, French, Portuguese, Japanese and Korean
fixtures share the same understanding/projection/truth path. Controls include free/
discounted introduction, annual equivalence, installments, credits, multiple plans,
unrelated amounts, wrong market, unknown cadence, contradictory and missing evidence.
The Spotify regression uses compact faithful provider presentation material from the
retained observation (not an injected checkpoint or a replay of all original HTML).
Its zero introduction and subsequent 1080 JPY monthly charge establish ordinary
pricing through verified JP context via the same production path as other fixtures.

Binding is not independent semantic entailment verification. An LLM can still
misread a genuine quote; the evaluator can reject unsupported/ambiguous/incoherent
structures but cannot prove every natural-language interpretation correct. Offline
annotated responses test contract/evaluation, not model accuracy or live strict-schema
compatibility. Currency-symbol semantics are understanding candidates, not market
inferences. Printed numeric notation supported by local normalization is accepted;
unhandled number-word/notation forms stay unresolved. Static parsing is intentionally
limited. Presentation/response bounds can stop understanding of oversized/complex
material; browser/PDF/rendered content is outside this milestone. No provider/language/
country/currency exceptions, new evidence-count gates or V2 predicates were added.

## Concrete admission correction documented before implementation

The previous `CONSUMER_MONTHLY_SUBSCRIPTION_EXISTS` predicate accepted any
consumer subscription offer with MONTHLY cadence, explicit derivation and a role
other than TRIAL. Minimal counterexample: an annual consumer subscription includes
a credit worth USD 10 each month. Its correctly bound CREDIT element has monthly
cadence but is NOT monthly subscription billing. The old predicate incorrectly
established a genuine monthly subscription from that credit.

Source binding cannot prevent this: both the monthly cadence and CREDIT role are
accurate source semantics. The smallest correction requires ORDINARY recurring
role for this monthly-subscription predicate. It does not require a known amount,
known currency, extra sources or a proof count. Pricing remains independent of
service admission. Benefit/credit cadence cannot establish subscription recurrence.


## Bounded understanding

The LIVE runner now uses local semantic units rather than the whole visible page.
See [bounded semantic units](research-v3-semantic-units.md). Original material is
still authoritative; each fragment is reconstructed against its supplied unit.
Strict accountGraph nodes/edges extend source representation without coupling
service-wide account access to market-scoped pricing.
