# V3 multilingual semantic interpretation

This milestone removes the English-parser prerequisite **for the injected semantic
interpretation path**. It does not add a live model integration or claim measured
model accuracy. The existing English deterministic interpreter remains the CLI's
backward-compatible default. A multilingual host supplies the async interpreter:

```js
const interpret = createSemanticInterpreter({complete, model: 'host-model-version'});
const run = await runTarget({input, capabilities, interpret});
```

`complete(request, {signal})` is supplied by the host. Here it is always an offline
annotated completion. There are no SDKs, credentials or network calls in the new
module. A later real completion adapter must honor the abort signal and bound its
received response, without giving the model independent tools or network access.

## Data flow and contract

Acquisition retains the immutable original body, URL, digest, timestamp and
transport/geography. Language-neutral structural extraction exposes original text
segments (including raw HTML entities), UTF-16 offsets and enclosing presentation
IDs. It excludes markup, comments, scripts, styles, templates and explicitly hidden
content. It is not a browser, CSS renderer, PDF reader, OCR or translator.

The request carries the objective, observation identity/context, source material,
field/enumeration contract and limits. The completion returns:

```json
{
  "schema": "V3_SEMANTIC_V1",
  "observationId": "the supplied observation ID",
  "observationSha256": "the supplied original-body digest",
  "language": "optional description, never market evidence",
  "claims": [{
    "scope": "OFFER",
    "presentation": "presentation-1",
    "field": "cadence",
    "value": "MONTHLY",
    "status": "EXPLICIT",
    "support": [{"start": 50, "end": 54, "quote": "毎月更新"}]
  }]
}
```

Offsets above are illustrative: real offsets must exactly match the acquired body.
Each field has its own source support. SERVICE fields are `serviceId`, `population`
(scope, measure, kind, count), `login`, `management`. OFFER fields are `id`, `amount`,
`currency`, `cadence`, `consumer`, `relationship`, `role`, `amountDerivation`,
`market`, `conditions`. The same contract applies to every language. An ambiguous
field is marked AMBIGUOUS, not forced to an explicit answer. The instructions ask
for all limiting qualifiers and forbid treating source text as model instructions.

The validated semantic projection feeds the existing source-shaped input to
`evaluate()`. The semantic path does not reparse candidate facts with English
regexes. Existing independent proposition rules remain unchanged. The interpreter
cannot submit ESTABLISHED, admission, stop decisions or proposition mutations.
Provider authority, observed outcome and truncation checks still precede evaluation.

Language, currency, country URL and acquisition geography alone are not market
proof. Market must be interpreted from actual source material. Transport context
remains separate; Direct and country-bound Decodo retain their existing identities,
permissions and information-value ranking, with no cost preference.

## New admission checks and their concrete purpose

| Check | Incorrect result prevented |
|---|---|
| Versioned, bounded schema; typed fields; no truth-state fields | A malformed/model-authored verdict becoming a proposition directly |
| Observation ID + body digest, rechecked on evaluation/resume | Claims rebound to a different or changed source |
| Exact nonempty original quotes and offsets within exposed text | Fabricated references, markup/script/hidden text passed as visible provider support |
| Offer fields bound to one supplied enclosing presentation | Combining source spans outside the identified presentation into an offer |
| Ambiguous, conflicting or unsupported fields remain null; ambiguous/unsupported derivation becomes UNKNOWN | Last-write-wins certainty or lost arithmetic qualifiers defaulting to explicit price |
| Malformed claim schema rejects the envelope | An invalid qualifier silently disappearing while other fields establish a price |
| Only short model/language metadata retained; unsupported schema fields rejected | Reasoning transcripts or arbitrary model payloads entering evidence records |

These are interpretation/provenance admission checks, not additional admission
propositions, proof counts or price-truth gates. No service-specific or language-
specific rules were added. Existing price protections still reject annual arithmetic,
credits/benefits, installments, trial-as-ordinary, zero prices, ambiguous cadence,
wrong markets, unrelated services and discovery snippets.

**Source binding is not proof of semantic entailment.** A model could cite a real
quotation and misunderstand it. Structural validation cannot independently solve
multilingual meaning. The interpreter remains responsible for accurate candidate
extraction, just as the deterministic parser was. Deterministic truth evaluation
applies the existing semantic rules to these candidates; it cannot detect every
misinterpretation of an otherwise valid quote. Offline annotated completions prove
contract behavior, not live model factual reliability. Source-audited model evaluation
is necessary before relying on a live experiment's conclusions.

## Bounds, trace and persistence

The existing acquisition byte/action limits are unchanged. Material extraction is
bounded to 20,000 structural tokens, depth 128, 2,048 text segments and 256
presentations. A completion is bounded to 64 KiB, 128 claims, eight supporting spans
per field and 4,096 characters per quotation. A call has a configurable timeout up
to 30 seconds, with cancellation signaled to the host. Limits on extracted material
are recorded as interpretation capacity, not semantic exhaustion. Each acquisition
causes at most one interpretation call; no retry/query loop was added.

Knowledge stores the raw observation, semantic envelope and candidate pointers.
`SEMANTIC_INTERPRETATION` links the body digest to accepted/rejected claim indices
and source bindings. The existing `OBSERVATION` event records deterministic
proposition changes and remaining needs. References preserve original-language
quotations. Checkpoints retain this information and revalidate source bindings on
evaluation. Model reasoning transcripts are neither requested nor stored. Provider
exceptions are reduced to fixed error codes.

## Offline validation and remaining live work

Fixtures cover English, Norwegian, German, French, Portuguese, Japanese and Korean,
with different sentence structures and realistic provider prose. Positive tests
establish a price from one presentation; a Norwegian fixture establishes all five
service propositions. Negative cases cover annual/12, credit/value, installment,
trial, zero, ambiguous cadence, wrong market and unrelated identity. German,
Portuguese and Japanese language-only material remains market-unresolved even
through matching country acquisition. Tests also cover support forgery/mismatch,
hidden text, cross-presentation support, conflicting candidates, bounded failures,
search-snippet isolation and checkpoint re-evaluation.

The same pipeline demonstrates Japanese Direct 200 → amount/currency/cadence known,
market unknown → same URL Decodo JP → explicit Japanese-market material → established.
Decodo-first remains possible, and a sufficient Direct result needs no second proof.

Before a live multilingual experiment: provide a bounded model completion adapter,
pin its model/prompt/contract versions, check its source-grounded extraction on held-out
multilingual material, then explicitly authorize one reviewed objective with normal
capability credentials and bounds. No live/model accuracy or production-yield result
is claimed here. The existing navigation classifier still defaults to English cues;
the existing injected navigation interface can classify observed anchors, but was not
extended in this interpretation milestone. Dynamic rendering/PDF/OCR remain separate.
V2, Operations, transports, planner policy, budgets and truth propositions are unchanged.
