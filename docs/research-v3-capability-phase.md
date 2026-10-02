# Research V3: source-faithful provider research capability

This offline milestone starts at `98119e8821122fe613b64371be8401fc802c135a` on `build10-final` (724 passing tests). Campaign II is diagnostic evidence, not a price answer key. No live provider, search, proxy, browser or model call was used in development.

## Forensic audit and historical evidence boundary

The audit inspected all ten targets and checkpoint payloads, attempt/request ledgers, final frontiers, source/provenance, observations, semantic attempt records, typed errors and the campaign report. Corpus: `/private/tmp/v3-frozen-98119-campaign/`. Read-only forensic notes: `/private/tmp/v3-capability-forensic-audit.md`; recursive retention inventory: `/private/tmp/v3-capability-robots-retention-audit.json`.

| Case | First demonstrated divergence | Qualification |
|---|---|---|
| Deezer / FR | Completed robots response → INVALID_AGENT, line 6 | No provider observation; exact policy unknown |
| Todoist / DE | Consumer candidates remained while Business/help/locale siblings consumed acquisitions | Business old/new table was not sufficient consumer evidence; later 429 suppressed semantics |
| Dropbox / US | Active yearly billing condition disappeared from bounded semantic material | False monthly establishment; complete source retained the checked control and `Billed yearly` |
| Netflix / KR | Completed robots response → INVALID_AGENT, line 175 | No provider observation; exact policy unknown |
| Audible / GB | Completed robots response → INVALID_PATH, line 140 | No provider observation; exact policy unknown |
| Canva / AU | Completed robots response → INVALID_PATH, line 24 | No provider observation; exact policy unknown |
| iCloud+ / JP | Completed robots response → INVALID_AGENT, line 22 | No provider observation; initial bundle relevance is a secondary question |
| Crunchyroll / BR | Completed robots response → INVALID_PATH, line 5 | Later proxy denial is separate; exact policy unknown |
| NYT / CA | Completed robots response → INVALID_AGENT, line 284 | No provider observation; exact policy unknown |
| Adobe / IN | Target-service candidates remained while another product's pages/fragments consumed acquisitions | Number-reference failure paired a source benefit number with null amount; rejection was correct. Later 400 generation failure is separate |

The original campaign integrity audit reported 25 admitted bodies, 46 quotations and 1,500 source-span hashes passing; all ten checkpoints restored final truth. These findings do not establish that the failed acquisitions' policies would permit access.

### Historical robots corpus

There are **two retained policies**, belonging to the successful acquisition cases, and **seven missing failure-case policies**. The revised prompt's “five missing” count does not match the actual retained artifacts. No missing source was guessed, reconstructed or refetched.

| Historical failure | Exact replay |
|---|---|
| Deezer | HISTORICAL ROBOTS BODY NOT RETAINED — EXACT POLICY REPLAY IMPOSSIBLE |
| Netflix | HISTORICAL ROBOTS BODY NOT RETAINED — EXACT POLICY REPLAY IMPOSSIBLE |
| Audible | HISTORICAL ROBOTS BODY NOT RETAINED — EXACT POLICY REPLAY IMPOSSIBLE |
| Canva | HISTORICAL ROBOTS BODY NOT RETAINED — EXACT POLICY REPLAY IMPOSSIBLE |
| iCloud+ | HISTORICAL ROBOTS BODY NOT RETAINED — EXACT POLICY REPLAY IMPOSSIBLE |
| Crunchyroll | HISTORICAL ROBOTS BODY NOT RETAINED — EXACT POLICY REPLAY IMPOSSIBLE |
| NYT | HISTORICAL ROBOTS BODY NOT RETAINED — EXACT POLICY REPLAY IMPOSSIBLE |

The committed offline corpus copies the two actual decoded bodies exactly:

| Policy | SHA-256 | Previous / current applicable result |
|---|---|---|
| Todoist | `19b9b0e78dd437d85ea1b32f0144da4f5cfc31dc1f3c137b033589b8fa26af67` | Previously parsed successfully; no historical first rejection. Exact replay ALLOWED for its historical attempted destination |
| Adobe | `41081faa0fd323774e225ab51e8a73262055b24ecc7732557229fb93938f9d84` | Previously parsed successfully; no historical first rejection. Exact replay ALLOWED for its historical attempted destination |

These two successful replays are not substitutes for seven failed-policy replays. Synthetic conformance results are reported separately.

## Robots processing and replay

The old parser rejected an entire policy immediately upon a malformed record in any group. Processing preceded source retention; only successful sitemap-bearing policies were saved. Thus an intact decoded policy could disappear on a local parse error.

The V3 parser now records group-local malformed restrictions, determines applicable groups, and preserves failure/review for malformed **applicable** restrictions. Invalid new user-agent groups cannot leak Allow rules into a preceding wildcard group. Invalid agent records do not erase valid consecutive agents. A wholly unusable group containing restrictions fails closed. Longest applicable agent selection, merged applicable groups, bounded octet/wildcard matching, Allow tie-breaking and pacing review retain their existing semantics.

Typed distinctions remain visible:

| Outcome | Representation |
|---|---|
| Applicable valid policy | ALLOWED or DISALLOWED with selected group/rule |
| Unsupported/unknown extension | bounded IGNORED_EXTENSION diagnostic |
| Safely ignorable non-policy record | IGNORED_NON_POLICY_LINE / IGNORED_INVALID_AGENT_RECORD |
| Malformed record in unrelated group | MALFORMED_RULE diagnostic; applicable valid policy evaluated normally |
| Malformed applicable policy | ROBOTS_PARSE_FAILED with reason/line; custom-token evaluation returns REVIEW_REQUIRED |
| HTML/control-byte/unusable policy | typed local parse failure |
| Explicit valid denial | ROBOTS_DISALLOWED; never bypassed |
| Unsupported applicable pacing | ROBOTS_REVIEW_REQUIRED |
| Missing policy / HTTP / transport / decode failure | existing distinct acquisition classifications unchanged |

Decoded HTTP 200 policies are integrity-bound **before** parsing. Artifacts retain body/hash, final URL, HTTP status, request sequence, encoded/decoded counts, safe content metadata, parse status, typed diagnostics and policy decision. They remain outside provider pricing observations. Failed or non-sitemap policy artifacts are checkpointed in `policyArtifacts`; sitemap-bearing successful policy sources retain the existing `navigationResources` path. Retained bytes are accounted in both acquisition totals and request ledger. At most nine provider-origin policies can occur in an eight-redirect acquisition; each is limited to 512 KiB, with existing objective byte/request bounds. Known proxy credentials are rejected before a body is retained. Incomplete/undecodable transport is not represented as a complete decoded policy.

### Generalized conformance corpus

Provider-independent tests cover multiple agents/groups, wildcard and unfamiliar agents, mixed case, inline comments, whitespace, LF/CRLF/CR, BOM, empty and repeated rules, Sitemap/extensions, malformed irrelevant records, unusable applicable records, Unicode/percent/query paths, wildcard/end anchors, long bounded paths, Allow/Disallow conflicts and group leakage. Existing acquisition tests additionally cover missing policies, MIME variations, compressed responses, redirects, decode/read/deadline/cancellation failures and finite capacities. Explicit denial remains enforced.

## Provider-exposed state architecture

`provider-states.mjs` reads authoritative source-visible HTML structure, without executing scripts or controls. It recognizes named radio/checkbox groups, options/selects, named GET submit controls, accessible tab/radio/checkbox/pressed/current controls and link destinations. Visible labels, label-for relationships and accessibility labels retain original spans. Selected state retains its original control-tag hash. Hidden ancestor containers are excluded. Disabled controls can represent displayed state but cannot generate GET submissions.

State/group/variant IDs are deterministic hashes of observation identity, body hash and source position. Related controls share a source structural group; pricing scope is the nearest enclosing content container containing those controls and monetary material. Header/navigation/footer or page-wide coincidence cannot supply a pricing scope. Names and values come from the source, not a dictionary of route/parameter names.

Research candidates come only from actual links, URL-valued options or bounded safe GET form submissions. Other successful hidden/selected form fields are retained; checkbox off variants omit their field instead of inventing a false value. POST, disabled submissions and credential-bearing forms do not generate destinations. Source-visible tabs without a URL/GET action remain contextual structure; no executable behavior or fabricated route is inferred.

Normalized full query destinations remain distinct. State provenance is preserved even when a lower-scored provider candidate merges with a higher-scored search result. Multiple source state relationships remain bounded by existing provenance capacity. Destination identity and acquisition context remain separate: COUNTRY and DIRECT, or different countries, do not become equivalent observations.

The operator's post-campaign monthly/yearly destination observation motivated this general capability. It was not injected into the historical run, replay or implementation as a route, parameter name, price or special case. The retained historical observation exposes controls; the replay does not invent URLs absent from that source.

## Context-faithful presentations and semantic units

A complete response remains separate from its bounded semantic representation. A large pricing widget may now yield a source-bound **sparse unit** containing the local price material, associated plan heading, observation identity and selected control labels. Source segment spans participate in the unit hash. Every span is resolved against the original material; number/currency/segment/presentation namespaces continue to reconstruct from the same request.

The model receives selected-context relationships and their supplied segment/presentation IDs. It does not receive price answers, source offsets/hashes, truth or sufficiency verdicts. Limits remain 4 units, 16 presentations, 64 segments, 4 KiB source and 8 KiB rich request, with the existing 24 KiB complete SDK payload ceiling. Source-visible controls do not authorize larger model input.

Deterministic source preparation/interpretation cannot discard an explicit selected annual condition merely because a model omits its qualifier. Existing native semantics distinguish recognized billing labels from benefits. An associated condition not understood natively remains for source-faithful semantic interpretation rather than disappearing into an otherwise complete native price. This does not require controls where none exist, and understood monthly/feature context preserves the native establishment path. Native cadence semantics interpret associated source billing labels; a displayed per-month amount under recognized selected annual context is represented as annual-equivalent arithmetic. The unchanged truth evaluator already excludes arithmetic amounts from ordinary monthly price establishment. Associated context remains in source bindings and diagnostics even when outside the model-selected price presentation. It does not impose a same-segment or same-card support requirement. Simple monthly prices with no controls retain their former establishment path. Selected monthly context also retains that path.

The actual retained annual observation now supplies title, `Billed yearly`, plan heading and the source amount in bounded material. Returning the unsafe original monthly/EXPLICIT interpretation no longer establishes monthly price. Tests cover both enclosing and price-only model presentation choices. Straightforward monthly/no-selector and selected-monthly cases establish in one acquisition and stop.

This is source-meaning recovery, not a new requirement to prove billing selectors or commitment for every price. Non-English labels are retained faithfully, without new translation dictionaries; semantic interpretation remains responsible where existing native understanding is insufficient. A context too large for bounded representation is diagnosed as capacity, not silently removed and treated as absent.

## Information value, frontier and planning

Candidate scores now combine existing structural/commercial hints with target-service lexical relevance across Unicode scripts. Search result **destinations/titles** receive the same research-only scoring; snippets still never enter evidence. Source-visible state alternatives receive additional novelty value; currently selected states are less novel than an untried alternative. A family already explored in the same transport/geography context is deprioritized. Different COUNTRY/DIRECT contexts remain independently useful.

Frontier admission takes high-value representatives across source families before filling with siblings. This prevents global/help/locale navigation volume from consuming all retained slots. Source state families and provenance survive normalization, merging, checkpointing and ranking. Generic synthetic consumer-vs-business/help and target-suite-vs-other-product scenarios reproduce the Todoist/Adobe starvation shapes without historical hostname/path exceptions.

The planner still chooses among grounded bounded actions, uses authoritative acquisition for every truth-contributing page, and checks objective establishment before further action or semantic work. Search/sitemap remain discovery-only. Existing stopping, exhaustion, account separation and acquisition authority/geography contracts remain unchanged.

## Model dependency behavior and numeric audit

The actual Adobe number failure was not a demonstrated deterministic occurrence defect: a non-null source reference to a benefit number was paired with a null amount. This remains rejected. New tests audit occurrence identity, repeated values, localized/full-width digits, separators, percentages/benefits, annual/monthly mixtures and JSON stability. Existing forged/cross-unit/cross-observation and amount/reference-disagreement tests remain passing. No unsupported model value is silently repaired.

Structured-generation 400 errors remain typed failed understanding; another normal unit/observation may be understood within existing budgets. Missing/auth-invalid models remain unavailable. Rate limits suppress immediate further calls. A numeric Retry-After up to 300 seconds can permit **one** later attempt on a genuinely different body after cooldown; absent such metadata uses 30 seconds. This occurs only as part of ordinary subsequent acquisition, with no sleep/retry loop, no redispatch of the failed unit, and unchanged model/action budgets. SDK automatic retries remain zero. Dependency failure never manufactures contradiction; native evidence remains usable. Cooldown/recovery provenance is checkpointed and traced.

## Capacity and resource model

No existing acquisition, objective, semantic or model ceilings were raised.

| Bound | Scope / value | Behavior beyond bound |
|---|---|---|
| HTML state tokens / depth | 131,072 / 128 | state/context capacity flagged |
| State controls / groups | 512 / 128 per observation | bounded state extraction; no silently complete contextual interpretation |
| Variants | 64 per group | bounded extraction/capacity flag |
| Successful GET fields | 24 | no oversized submission destination |
| State label / selected context | 1,024 bytes per label / 16 context items | bounded representation; unsuitable source context cannot silently become absent |
| Policy body / origins | 512 KiB / at most 9 per acquisition | existing acquisition rejection/budgets |
| Frontier / provenance | existing 128 destinations / 8 provenance records | replacement/admission remains bounded |
| Actions / searches / acquisitions | existing 20 / 4 / 12 | existing exhaustion/capacity stop |
| COUNTRY / sitemap / network | existing 8 / 4 / 96 | existing bounds, geography contract unchanged |
| Semantic calls | existing 12 total / 4 per action | no extra dependency budget |
| Model recovery | 1 new-source recovery per objective | later suppression; never an uncontrolled retry |
| Provider encoded / decoded | existing 8 MiB / 16 MiB | existing explicit transport/representation rejection |
| Objective encoded / decoded | existing 64 MiB / 128 MiB | existing objective capacity stop |

State parsing caches compact source-owned results using a WeakMap; it does not retain a DOM or create repeated full-page copies. Control nesting and source tokens are bounded, labels/form fields are indexed, and active-field count does not mistakenly count every unselected radio alternative as a submitted field. Sparse units remain independently bounded. Policy retention increases explicitly counted retained bytes; it cannot bypass decoded/network/objective budgets.

## Validation and truth audit

The new offline test module includes exact retained policies and the full integrity-bound annual provider observation, synthetic conformance, source-visible form/link/control variants, multiple scripts, safety/capacity boundaries, model 429/400 behavior, target-service/frontier diversity, source reference stability, source context and checkpoint restoration. Baseline tests remain present; the foundation import allowlist now covers the new offline-only state module while continuing to reject network/filesystem/V2 dependencies in core modules.

Truth invariance compares the production evaluator against a byte-exact copy from the protected starting commit on identical admitted evidence, including all heterogeneous semantic fixtures, introductory/ordinary, arithmetic, discounts, ambiguity/UNKNOWN, market/currency, annual and contradictory observations. The actual production evaluator is also asserted byte-identical to that protected copy. Pricing predicates, geography contract, currency metadata/resolution and service association rules were not edited.

The faithful Spotify/Japan mocked-SDK path still establishes 1080 JPY / MONTHLY / JP, excludes introductory zero, completes and stops without confirmation acquisition. Existing account LOGIN/ACCOUNT/MANAGE/CANCEL/external AUTH, acquisition headroom, typed namespaces, source integrity and checkpoint suites remain passing.

Final offline validation: **875/875** at the final pre-commit checkpoint, including all original 724 tests and 151 added tests. The final report records the post-commit rerun and preservation receipt.

## Remaining limitations and frozen Campaign III questions

- Seven historical rejected policies are permanently unknown from this corpus. The milestone does not claim they would now allow access.
- Applicable malformed policy or unsupported pacing still requires review; this is deliberate fail-closed acquisition behavior.
- JavaScript-only routes/content and control effects without a source-visible URL/GET surface are not rendered or fabricated. Browser execution remains outside this architecture.
- Source-visible context is bounded and structurally associated; arbitrary distant prose/context relationships can still require semantic interpretation. Native annual recovery uses the existing native understanding, not a universal multilingual parser.
- Fully split numeric tokens across markup remain a possible source representation limitation; no value disagreement is accepted as a workaround.
- Ranking is advisory and fallible. Synthetic information-value results do not prove live provider coverage.
- Recovery needs elapsed cooldown and genuinely new material; rate limits may still leave understanding unresolved. No live dependency availability is claimed.

A separately approved frozen Campaign III should measure robots decisions with replayable sources; source-state discovery/navigation; relevant-service ranking and frontier novelty; preservation of active conditions across languages and widgets; legitimate simple-monthly verification; dependency efficiency/recovery; operational memory and stopping. No such campaign was run here.

TRUTH-RULE DELTA: NONE

NEW MANDATORY PRICE VERIFICATION REQUIREMENTS: NONE

REMOVED PRICE VERIFICATION REQUIREMENTS: NONE

PRICE/TRUTH SEMANTICS CHANGED: NO

PROVIDER-SPECIFIC RESEARCH LOGIC ADDED: NO

DROPBOX-SPECIFIC LOGIC ADDED: NO

CAMPAIGN-II EXPECTED PRICES HARDCODED: NO

DISCOVERY/NAVIGATION SIGNALS GIVEN TRUTH AUTHORITY: NONE

LIVE PROVIDER VALIDATION DURING DEVELOPMENT: NONE

PUSH: NONE

DEPLOYMENT: NONE

Source-local currency-symbol amounts also retain direct credit, introductory and discount role support. Exact occurrence/currency grounding remains required; an unrelated credit mention does not veto an ordinary charge. Negated billing labels are not converted into positive annual conditions.
