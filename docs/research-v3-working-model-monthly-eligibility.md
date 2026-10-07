# Research working model and monthly-subscription eligibility

This milestone starts at `a198a152e92bf121d3d69572f117a8ec618acf05` (875 tests). It implements the operator's explicit product-scope decision after the Campaign III specification-gap audit. **This is an intentional truth/eligibility change, not a truth-invariant acquisition-only milestone.** No live research, browser execution or Operations integration is part of this change.

## Product contract

Current-market eligibility has three deterministic outcomes:

| Proposition state | Eligibility | Research consequence |
|---|---|---|
| MONTHLY_SUBSCRIPTION_ESTABLISHED | ELIGIBLE | Establish the ordinary charge of that monthly-payment offer |
| MONTHLY_SUBSCRIPTION_NOT_OFFERED | INELIGIBLE | Stop the current monthly-price objective |
| MONTHLY_SUBSCRIPTION_UNRESOLVED | UNRESOLVED | Continue useful permitted bounded research; do not admit as market-eligible |

A monthly price display is not proof of monthly payment. Display cadence, payment cadence and commitment are independent source meanings. A one-year commitment does not imply annual payment. A one-year commitment with authoritative monthly payment can qualify. An annual total paid in monthly installments does not supply a monthly charge through division by twelve. Introductory, discounted and ordinary charges retain their separate roles.

`truth.eligibility[market]` is the product-scope answer. `MONTHLY_SUBSCRIPTION` is an explicit price-objective proposition. Existing `MONTHLY_CADENCE` represents the amount's display interval. The amount of a monthly-payment offer must be its actual ordinary monthly charge, not an annual display/equivalent. Canonical offer grouping includes payment cadence and commitment, preventing cross-state combination.

Positive availability is supported by a source-bound ordinary consumer subscription offer with monthly payment in the objective market, or by an explicitly represented monthly-payment choice. A temporary introductory/discount monthly charge alone cannot prove an ordinary monthly subscription. Choice evidence can establish eligibility before its charge amount is known, but cannot transfer an annual state's amount into that monthly option. Negative availability requires a source-bound SERVICE-scoped statement explicitly excluding monthly payment, or an explicitly complete known payment-choice set without monthly payment. PLAN scope, a partial catalog, one annual card, empty choices, ambiguous choices, failed requests, exhausted research and model UNKNOWN cannot establish exclusion. Conflicting positive and explicit negative evidence remains unresolved, with its conflict retained. Market-specific historical service admission is also gated by current-market eligibility; global service qualification is a separate legacy objective and is not a substitute for market eligibility.

Public price completion and eligibility do not require account/login, management or cancellation. Their existing independent proposition rules remain intact.

## Source representation and admission (historical V5 milestone)

Wire V5 adds source-reference-bound `temporal` facets to each charge:

* `billingCadence`, with independent `billingSources`;
* exact `commitmentText`, with independent `commitmentSources`;
* `priceKind`: CHARGE, EQUIVALENT or UNKNOWN.

The existing charge cadence is display cadence. Introductory `durationText` remains separate. Canonical projection preserves commitment, including literal legacy duration rather than silently dropping it. Neither commitment text nor display cadence is converted to payment cadence.

Offers may propose availability scope and choice-set semantics, with their own support references. These are source interpretations, not sufficiency or completion decisions. Host code validates references and source scope, constructs canonical evidence, and deterministically evaluates eligibility.

Legacy/partial wire responses default missing payment and availability facets to UNKNOWN. They do not acquire new certainty by migration. Unknown payment may be recovered from a genuinely source-bound selected payment control already understood by native extraction. A conflicting source payment control defeats an unsupported model payment claim. A standalone native price/display fragment or commitment-only quotation cannot provide payment support. This limited display guard is not a billing-phrase translation engine; heterogeneous interpretation remains semantic and source-bound.

Typed references reject forged, cross-unit, cross-observation and wrong-namespace IDs. Admission retains charge-local or structurally associated payment/commitment support and filters unrelated items. One non-applicable redundant item cannot erase sufficient applicable support. Exact source text, occurrence identity and source completeness remain mandatory. Numeric reconstruction shares one Unicode decimal normalization/candidate function between wire occurrences and admission. Original characters, UTF-16 intervals and occurrence IDs remain unchanged; normalization supplies candidates, not price truth. Malformed grouping is rejected consistently.

No universal same-sentence/card/segment requirement was added. Native selected control context can qualify a source-local charge through the existing structural relationships. Native facts need not be redundantly repeated by the model. Material context is retained even when it is outside the smallest monetary fragment.

## Research working model

**Working-model beliefs guide research but have zero truth authority.** Truth, projection and evidence admission do not import the working-model module.

The working model contains:

* objective uncertainty from deterministic truth, including monthly eligibility;
* resource destination, reviewed navigation boundary, source provenance and role hypotheses;
* provider state relationships and meaningful query variants;
* candidate families, attempted members, unexplored alternatives and observation history;
* hypothesis lifecycle (untested, failed attempt, information gained, uncertainty remaining);
* bounded decision/history records and remaining budgets.

A failed attempt is not a contradiction and a resource classification is not evidence. Provenance stores observation/action IDs, hashes and source intervals rather than copying arbitrary snippets into every decision. The model refreshes after observations and before stopping/checkpointing.

Action selection considers unresolved propositions, observed information, novelty, family saturation, uncertain resource role, source-exposed alternate states, geography value, failure history and cost. It considers COUNTRY and DIRECT separately. A target-market-only gap gives verified COUNTRY research additional expected value; URL locale, language and currency do not provide geography truth.

Semantic resource/state advice is invoked only when unresolved authoritative pages expose an ambiguous larger frontier or multiple source-visible provider states. It receives a diverse, bounded set of already discovered candidate IDs/labels/destinations and unresolved propositions. It can classify a resource or suggest a monthly-payment state; it cannot create destinations, prices, truth claims or ownership. Unreviewed cross-domain authority remains unreviewed.

The shared model-call budget is reserved and checkpointed before advisory dispatch. Advisory output is projected to supplied IDs and fixed role/state-intent enums. Confidence and purported verified prices are discarded. HTTP/schema/deadline failures leave the native frontier usable; they do not contradict an objective. Rate-limit suppression remains bounded, with at most the existing one cooldown-qualified attempt on genuinely new material. No uncontrolled retries or new models are introduced.

Search and sitemap results remain discovery-only. Provider-exposed links, safe GET controls and meaningful query variants go through normal acquisition and geography/integrity checks. State advice does not turn a query parameter into payment truth. POST, secrets and JavaScript-only controls do not become fabricated GET destinations.

## Finite capacity

| Resource | Previous | This milestone | Rationale |
|---|---:|---:|---|
| Objective actions / acquisitions / COUNTRY acquisitions | 20 / 12 / 8 | unchanged | Spend capacity better rather than widen crawling |
| Searches / navigation depth / sitemap acquisitions | 4 / 4 / 4 | unchanged | Existing bounded discovery headroom |
| Destinations / source provenance per destination | 128 / 8 | unchanged | Retained frontier is independently finite |
| Network requests per objective | 96 | unchanged | No acquisition envelope regression |
| Provider encoded / decoded bytes | 8 / 16 MiB | unchanged | Acquisition and semantic capacities remain separate |
| Objective encoded / decoded bytes | 64 / 128 MiB | unchanged | Explicit total resource ceiling |
| Total model calls | 12 | unchanged | Understanding and automatic research advice share it |
| Working resources / families | none | 128 / 128 | Matches finite retained frontier |
| Hypotheses / state variants | none | 256 / 256 | Explicit bounded research uncertainty |
| Working updates / decision records | none | 64 / 128 | Restore without model reclassification; bounded history |
| Resource provenance entries | none | 8 compact references | Avoid repeated source/snippet amplification |
| Advisory candidate input / output | optional 64-input hook | 64 input / 24 output | Diverse input; 2,048-token advisory result budget |
| Automatic advisory calls | none | at most 4 within total 12 | Leaves substantial understanding capacity |
| Advisory candidate serialized input | none | 12 KiB | Separate from complete source and semantic input |
| Advisory request / response | none | 24 KiB / 16 KiB | Hard rejection before excessive payload/retention |
| Automatic advisory deadline | none | at most 15 seconds | Finite operation with SDK cancellation |
| Evidence semantic source / unit count | 4 KiB / 4 | unchanged | Large observations do not imply large model context |
| Evidence complete model payload / output | 24 KiB / 32 KiB | unchanged | Added temporal fields fit independently bounded requests |

Resource limits are operational bounds, never truth requirements. Above a hard bound, diagnostics identify capacity and research remains unresolved. No new browser or full-body model submission is introduced.

## Campaign III forensic findings

The original pre-edit audit is `/private/tmp/v3-working-model-forensic-a198a15/AUDIT.md`; its specification-gap proof remains historical. All twelve frozen checkpoints were inspected before implementation. The original campaign was not rerun or retroactively corrected.

| Case | First divergence | Generalized response / remaining limit |
|---|---|---|
| Dropbox / US | Independent GEO_PRE country mismatch on useful acquisition | Failed country observation still withheld; another distinct grounded context/action may proceed within original budgets. No geography inference or retry of consumed identity. |
| Todoist / DE | Business/help/locale family starvation | Working family/history and semantic resource roles prioritize new objective-relevant information. |
| Adobe / IN | Campaign/student/team candidates before consumer plan surface | Same information-value architecture; source roles are advisory, not admission rules. Model 400/network limitations remain external. |
| Evernote / JP | Retained material lacked sufficient consumer price | Correct unresolved for that material; no claim that all possible provider content lacks a price. |
| Notion / KR | Unreviewed cross-registrable redirect | Authority deliberately unchanged. A research ownership hypothesis cannot authorize another official-looking domain. |
| Proton / CH | Display/recurrence compressed into monthly-billing interpretation; duration dropped from canonical offer | Operator-approved temporal representation and eligibility predicate repair the demonstrated specification gap. |
| TIDAL / NO | Provider 403 after allowed robots | External delivery limitation. Successful policy source is now retained even when provider acquisition subsequently fails. |
| Babbel / ES | Repeated low-information group/support/locale exploration | Working families, role advice, novelty and unresolved needs guide alternatives. |
| Strava / BR | OTHER_SERVICE proposal, absent valid known-service association for qualified target name | Grounding/association safeguards retained. Semantic target aliases remain a limitation; no arbitrary alias/ownership relaxation. Numeric references use exact Unicode occurrence identity. |
| MUBI / TR | Leading wildcard robots path rejected at line 8 | Exact retained policy replay now parses; target is allowed and explicit deny rules still apply. |
| ExpressVPN / GB | Cancellation/locales consumed capacity | Research roles and family saturation distinguish pricing-state uncertainty from generic navigation. |
| Malwarebytes / CA | Leading wildcard robots path rejected at line 52 | Exact retained policy replay now parses; target is allowed; wildcard/end-anchor semantics preserved. |

The robots fix accepts standards-compatible leading wildcards; it does not bypass explicit denial, pacing review, malformed applicable policy or secret-response rejection. The existing matcher already supports wildcard and percent-encoded octet behavior. Both actual retained policies are integrity-bound in `campaign-iii-policy.test-fixtures.json`. Historical failure lines and hashes are retained; synthetic conformance cases are reported separately. Successful and locally failed decoded policy bodies are retained safely, bounded and deduplicated by URL/context/hash, with attempt provenance.

### Proton exact first divergence

The retained official observation is `c7e912cfbe1827766f0b555f849202ab3f92e26286fc57790642f3a30e14a892`, body SHA-256 `bf62c92b7797ae7c8f04b1bf22b9d5d0d9bf943e115f328fcde87f002a402b69`. `9.99€ per month` is source interval [260804,260819); its one-year subscription condition is [260828,260935), in the same paragraph. Observation, presentation and bounded model input preserved the condition. The response retained it in duration, but the canonical offer dropped duration. Even restoring its exact qualifier did not repair the old evaluation: the old evaluator treated monthly display cadence as the requested monthly-subscription proposition.

Therefore this was a **representational limitation plus a demonstrated truth-specification gap**, not source corruption, lost model input or numeric-reference mismatch. The old evaluator followed its then-specified predicates. The operator has now supplied the missing payment-based eligibility specification. The condition alone supplies commitment, not annual payment. Replaying the unchanged legacy response under this specification gives UNKNOWN payment and UNRESOLVED eligibility, not INELIGIBLE. A source-exact paragraph excerpt is an additional portable regression; it is explicitly labeled an excerpt wrapped in synthetic markup, not a complete historical observation.

An untouched archive of the starting commit reproduces all twelve historical final truth states. The new evaluator restores all twelve checkpoints and reproduces their current evaluation deterministically. Historical bodies remain unchanged. Replay output is `/private/tmp/v3-monthly-forensic-results.json`; no campaign checkpoint is edited.

## Acceptance coverage and boundaries

Generalized tests cover the operator's A–J family, exact occurrence identities, forged temporal references, wrong-offer payment/commitment support, independent source control recovery, conflicts, annual-only completeness, partial annual observation, model uncertainty, and research confidence firewalls.

Multi-resource synthetic sites start at generic provider roots, include crowded support/account navigation, pricing surfaces, monthly/annual GET variants and client shells. Six-market/script variants and additional non-English ambiguous frontiers use mocked SDK semantic interpretation through normal planner/acquisition/semantic/wire/evidence/truth paths. Tests do not give the runtime an answer URL or price. Mock responses are explicitly annotated source interpretations; expected outcomes are never production ranking inputs. Introductory charges remain separate. Annual-only ecosystems stop without chasing an imagined monthly charge.

Protected-baseline evaluator tests now audit the approved eligibility delta rather than falsely asserting byte identity. Identical evidence retains unrelated currency, market, identity, population and account predicates. Working-model mutations, probabilities, snippets, URLs and arbitrary navigation advice leave deterministic truth unchanged. All original test cases remain, with obsolete display-only monthly-verification assertions changed to the approved unresolved result.

The offline Spotify/Japan semantic oracle still establishes 1080 JPY/MONTHLY/JP with introductory zero excluded and one sufficient observation. Account, acquisition headroom, native binding, checkpoint and contradiction regressions remain required.

Remaining limitations: semantic interpretation can still fail or misunderstand an unfamiliar source; partial/legacy responses intentionally leave payment UNKNOWN when native structure cannot recover it. Exhausted research does not prove absence. Cross-domain provider authority needs explicit reviewed ownership. JavaScript-only pricing states cannot be invented from non-actionable controls. No browser or live provider validation was performed. A future frozen campaign should test payment/commitment distinctions, complete availability statements, unfamiliar scripts, state navigation, resource-role advice, dependency reliability and continued false-positive resistance.

Pre-commit validation: **993/993**, compared with the starting **875/875**. The net 118 additional cases are offline. Preservation passes 725 historical status entries and 745 protected file hashes with explicit authorized task-file exclusions before staging.


## Campaign IV remediation: V6 payment and monetary firewall

This section supersedes V5 admission and request preparation above. The starting implementation is `cb2560111dbeccd492c1d43fd3fb1ada7da86d98` (993 tests). The approved product contract is unchanged. This milestone repairs implementation paths that did not obey actual monthly-payment eligibility; it adds no new source, account, corroboration, same-card or model-confirmation requirement.

### Canonical proposition and every producer

`payment-semantics.mjs` separates actual payment from a quantity's display period. WEB evidence admission uses `admitPayment` for both offer charges and positive availability. It requires an exact, valid source-bound payment relationship, or an applicable native actual-payment predicate. Bare display/commitment support and source-bound noncharge quantities cannot become payment support. A typed semantic proposal is not a confidence threshold. Linguistic interpretation remains fallible; grounding and types are safeguards, not a proof of arbitrary natural-language meaning.

| Eligibility producer | Previous weakness | Current requirement |
|---|---|---|
| WEB positive availability | Monthly display could become availability independently of charge validation | Same `admitPayment` validator as charges; explicit ACTUAL_PAYMENT relationship or native payment support |
| WEB ordinary offer | Temporal guard independent of availability | Canonical payment admission plus source-supported subscription-charge role |
| Structured authoritative choice | `monthlyOffered` asserts payment availability | Explicit structured actual-payment assertion; typed payment, when present, must agree; live HTML cannot enter this path |
| Market offer eligibility | Ordinary consumer + monthly billing | Shared `monthlyPayment`, including actual charge type |
| Global monthly service proposition | Separate inline offer predicate | Shared `monthlyPayment` plus existing explicit derivation |
| Monthly price proposition | Separate inline offer predicate | Shared `monthlyPayment`; amount additionally requires ordinary explicit charge |
| Annual-only exclusion | Complete/excluding service choice | Unchanged: source-supported complete choices or explicit exclusion, never one annual card or absent evidence |

Wire V6 adds `payment` (ACTUAL_PAYMENT, DISPLAY, BENEFIT, UNKNOWN, exact predicate text and sources) and `monetary` (kind, sources, related charge and relationship). Missing older fields default UNKNOWN. No URL, query, title, snippet, research state or confidence becomes a payment proposition. Structured observations are a typed authoritative adapter contract, not permission to trust discovered arbitrary JSON.

Monetary kinds distinguish SUBSCRIPTION_CHARGE, INTRODUCTORY_SUBSCRIPTION_CHARGE, TRIAL_CHARGE, BENEFIT, CREDIT, ALLOWANCE, SAVINGS, DISCOUNT, EFFECTIVE_COST, NORMALIZED_COST, REFERENCE_PRICE, TAX, INSTALLMENT and UNKNOWN_MONETARY_ROLE. EQUIVALENT_OF/BENEFIT_OF/DISCOUNT_OF/REFERENCE_FOR preserve quantity relationships and prevent an equivalent/benefit from being relabeled as an ordinary charge. Monetary support must cover its own amount; unknown amounts may preserve meaning without establishing price. Exact occurrence namespaces and references remain validated. Unrelated credits do not veto a legitimate charge in the same sentence.

Display cadence, payment cadence and commitment remain independent. Native selected-state recovery requires a payment predicate linked to its cadence, not an unrelated billed word somewhere on a page. Commitment never determines billing. Simple ordinary monthly charges remain sufficient without an additional selector, checkout or second source.

### Material context and source roles

Source-local selected-control context travels with relevant units, and admission scopes it to the charge's actual source interval. Bounded ancestor presentations may supply distributed heading, plan and billing relationships without serializing every descendant presentation. Original qualified headings can establish structural primary identity without requiring a particular `main` tag. Exact provider/service identity can compose from original title/headings and a matching offer heading; a different plan card cannot borrow that identity.

Inert source-visible schema records can become bounded semantic material, including escaped JSON records in transport scripts. Original escaped bytes remain citations. No script is executed and metadata keys do not become native truth. Bounded parent records preserve related quantities; visible contextual units precede metadata. Optional metadata exhaustion does not erase the complete visible source. Non-actionable JavaScript controls still cannot invent HTTP destinations.

### Deterministic research without advice

Action value uses objective deficits, source-visible state relationships, information already gained, acquisition-context novelty and learned family yield. Repeated completed attempts with no objective progress reduce equivalent family value, while productive families remain usable. A payment deficit gives explicit source state transitions and related observed pricing material higher information value. Help/legal families are never globally banned. COUNTRY/DIRECT attempts remain distinct; a failed Direct request cannot eliminate Country novelty or establish market.

Advisory 400 or malformed output disables optional advice for that objective; other unavailable advice receives a bounded research-only cooldown. An advisory 429 without Retry-After no longer suppresses evidence understanding. Explicit bounded provider Retry-After still applies across calls. Advisory enum schemas now include explicit string types. Historical 400 cause is not conclusively retained; no live claim of remote acceptance is made. Safe diagnostics retain category, permitted API type and sanitized request ID, never raw provider errors or credentials. All deterministic fallback tests run with advice unavailable or failing.

### Request preparation and capacities

Semantic preparation tests candidate units locally before reserving calls. It can skip an oversized unit and choose another bounded source unit. The SDK preparation function is shared with dispatch, so the exact final payload limit is checked before spending a model call. Fixed instructions are excluded from the inner material budget and included once in the final SDK budget.

| Bound | Before | Now | Protected resource / behavior |
|---|---:|---:|---|
| Prepared semantic candidate units per observation | 4 | 16 | Local bounded alternatives; still at most 4 dispatchable units |
| Dispatched units / source text / segments / presentations | 4 / 4 KiB / 64 / 16 | unchanged | No whole-page model request; ancestors may represent bounded distributed context |
| Inner semantic request | 8 KiB including duplicated instructions/host metadata | 8 KiB material envelope | Preparation skips above-bound units; no call reservation |
| Complete SDK request / output | 24 KiB / 32 KiB | unchanged | Finite final model resources |
| Eligible inert scripts / bytes per script | not exposed | 32 / 256 KiB | Ignore excess optional metadata, retain visible source |
| Metadata records / bytes per record / scanner tokens | not exposed | 256 / 4 KiB / 131,072 | Finite source-local extraction, no execution |
| Working resources/families; hypotheses/variants; history; decisions; provenance | 128; 256; 64; 128; 8 | unchanged | Finite checkpoint-safe research |
| Provider encoded/decoded; objective encoded/decoded | 8/16 MiB; 64/128 MiB | unchanged | Acquisition headroom preserved |
| Actions/searches/acquisitions/country/network/model calls | 20/4/12/8/96/12 | unchanged | Better selection and preparation, not larger external budgets |

### Forensic outcomes and acceptance

All fourteen retained Campaign IV checkpoints were audited before source edits. Exact original bodies and original campaign results remain untouched. Re-evaluation changes Proton display-only availability, Google One credit-as-price and Calm normalized-cost-as-payment from unsound eligibility to UNRESOLVED. It does not establish annual-only. Other eleven remain unresolved. These are corrected offline evaluations, not new autonomous provider runs.

The two exact Campaign IV robots denial bodies remain denials. No robots permission policy changed. Retained integrity checks cover 192 bodies, 124 quotations and 19,131 source-span hashes. Full semantic provider replays are not claimed: the portable semantic fixtures are source-exact slices wrapped in synthetic markup; original whole checkpoints are independently restored and re-evaluated.

New ecosystems exercise roots, provider surfaces, GET states, crowded alternative families, multiple scripts, actual monthly charges, annual-only choices, annual commitment with monthly payment, credit/effective amounts, introductory charges, client shells and permanent advisory failure. Twenty-four identical correct evidence graphs compare against the protected approved evaluator; defective evidence paths intentionally change. All 993 baseline tests remain, with V6 mock annotations/protocol assertions updated, and the complete suite is 1,088/1,088. Spotify/Japan remains 1080 JPY/MONTHLY/JP, introductory zero excluded. Account, acquisition, geography, robots and checkpoint regressions pass.

Limits remain: semantic interpretation can misclassify unfamiliar meaning despite exact citations; remote model contracts/availability need future frozen validation; JavaScript-only states lack a browser; unreviewed ownership stays rejected; incomplete research never proves no monthly offer. No live provider, network or model validation, browser capability, production wiring, push or deployment is part of this milestone.
