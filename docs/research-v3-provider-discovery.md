# Research V3 provider discovery and navigation

This milestone improves where research looks. It does not change the price/truth specification, semantic wire, evidence admission, geography verification or objective-completion predicates. The [V2 audit](research-v3-discovery-audit.md) records adoption and rejection decisions.

## Flow and authority

Reviewed target → seeds (or bounded search / reviewed homepage bootstrap) → complete normal V3 acquisition → native evidence and bounded semantic understanding → deterministic truth. Only if unresolved: extract source-owned candidates, merge/rank the bounded frontier, select another normal acquisition or finite search family. Objective establishment stops before navigation advice, additional searches or acquisitions.

Existing exact `objective.providerHosts` remain reviewed authorities. Unrelated official domains must be explicitly included in that reviewed set; neither a link, canonical tag, redirect, search result nor model opinion establishes ownership. There is no public-suffix guess, provider list or hostname-name heuristic.

An operator can additionally attest an owned DNS namespace:

```json
{"providerNamespaces":[{"domain":"provider.example","reviewed":true,"scope":"OWNED_DNS_NAMESPACE","reference":"operator-authority-review"}]}
```

This is research permission supplied with the reviewed objective, never model output. It must be anchored by an existing reviewed host and expressly cover ownership of the namespace (do not use a shared hosting/public suffix namespace). Candidates or safe acquired redirects under that namespace materialize an exact host binding with the review reference in checkpointed state. Acquisition still performs ordinary URL, DNS/public-address, robots, redirect, TLS and geography checks. Evidence still passes the unchanged exact-host authority predicate. Review permission adds possible authoritative observations, not a lower proof standard. Removing/changing namespace review invalidates incompatible resumes.

## Candidate sources and provenance

`discovery.mjs` extracts bounded ordinary anchors, header/nav/footer context, visible or ARIA/image labels, canonical/alternate links, explicit hreflang, locale options, GET form actions and inert declared `SiteNavigationElement` or explicit navigation/menu/link-collection JSON. Comments, executable scripts, styles, templates, POST controls, arbitrary API/config JSON endpoints and unsafe URLs are not navigation candidates. Structured JSON is parsed, never evaluated.

A candidate has a stable source-owned ID, normalized URL, resource class PAGE/SITEMAP, source kind, bounded label/locale/context, unresolved needs, authority permission, advisory score and observation/body hash plus exact UTF-16 span/hash (JSON pointer when applicable). Request serialization and checkpoint restoration preserve identity. A label or score is never a proposition.

Duplicate URLs merge needs and up to eight distinct provenance references. The first source-owned HTML base href participates in relative resolution, with a retained base span/hash; a foreign base does not confer authority. Quoted tag attributes are preserved. Meaningful plan/product/localization query parameters and repeated-key ordering survive normalization; fragments and `utm_*` tracking do not. Sensitive credential query keys and explicit redirect-shaped queries to unreviewed destinations are excluded. Asset URLs are excluded. Acquisition still reviews actual redirects independently.

The retained frontier preserves operator seeds and attempted sources. Under capacity pressure, a higher-value candidate may replace only an unattempted lower-value discovery candidate. Replacement is traced. Discovery does not deduplicate observations across transport/country: DIRECT/UNBOUND, DECODO/COUNTRY and different countries remain distinct identities. A final effective URL/context is consumed, preventing redirect-alias reacquisition.

## Ranking and multilingual behavior

Native ranking uses structure, source kind, a small optional set of commercial/account hints and explicit locale-region hints. No multilingual word tables or provider route guesses are imported. Opaque/non-Latin labels remain candidates; header/nav and declared navigation context give them useful priority. Foreign-language/foreign-locale hints lower priority slightly, never decide applicability or eliminate a legitimate source. Search-result URLs remain candidates without retaining commercial snippets.

An optional caller-supplied advisory navigation hook receives copies of at most 64 source-owned candidate IDs/indices and current needs. It can promote supplied IDs only; invented hrefs, claims and truth fields have no authority. It has a one-second host wait bound; exceptions/timeout preserve the native frontier. Late results cannot mutate state. This milestone adds **no built-in discovery model, no new model schema or live model dependency**. Default operation is native. A caller hook is a pure research advisory interface, not an external-model capability; external model invocation remains subject to the existing explicit capability machinery. Distinguishing dozens of equally opaque navigation items is a future validation question.

## Search and seeds

Three finite query families per market use the service, target market, reviewed provider search scope and objective: subscription pricing/plans; billing/renewal terms; official availability. Service-qualification families include account/support research. No expected amount/currency is supplied. Families have stable identities independent of paraphrases or shrinking need lists and are validated against the generated contract. Consumed families cannot be replenished by rewording. Legacy free-form reasoner proposals retain their single semantic-intent identity and cannot create an infinite paraphrase loop.

Tavily stays Basic, at most eight results, provider scope only, no answer/raw content/images. Its snippets never enter truth. Explicit reviewed namespace roots can broaden discovery scope, while result destinations still require ownership and normal acquisition. Existing query/result/request/byte budgets apply.

When no seed and no search permission exists, the normal reviewed runner can bootstrap reviewed host homepages. `discovery.bootstrapRoots: true` also permits that start with search enabled; `false` disables it. It never fabricates `/pricing` routes. Ordinary supplied seeds and existing search-first unseeded flows retain their behavior.

## Sitemaps and robots

Complete acquired robots documents may expose up to sixteen source-bound sitemap declarations. Robots interpretation/denial remains unchanged. Only reviewed provider destinations become candidates. Original robots bodies/hashes/spans are retained as **navigation resources**, separately from truth observations; retained/decoded bytes are accounted.

Explicit HTML sitemap links and robots declarations enter the normal acquisition planner. A sitemap/index acquisition uses the same transport, DNS, robots, redirect, deadlines, request ledger, body-integrity and COUNTRY verification machinery as a page. Sitemap/index XML is then parsed as navigation, never evidence. An index may supply another bounded sitemap; a URL set supplies ordinary provider-page candidates. DTD/entity input, incomplete/unsupported documents and unreviewed destinations fail closed. Entries, depth, frontier, sitemap acquisitions and global acquisition/network/byte budgets all apply. Sitemap prose cannot establish price even if it contains an apparently complete offer.

This supports ordinary XML and HTTP content-encoded compressed XML through the existing acquisition decoder. Downloadable gzip files served as `application/gzip`, rendered browser navigation, JavaScript click flows and arbitrary endpoint exploration are not added.

## Planner, recovery and stopping

AUTO retains COUNTRY as a first-class expected-information choice. A Direct observation missing only market may prioritize the same URL under COUNTRY. Otherwise newly grounded relevant navigation competes with another perspective of an empty seed. Candidate relevance adds priority; it does not establish any proposition. Account navigation is useful for account objectives and does not become a public-price prerequisite.

A typed acquisition/discovery or unsupported sitemap failure retains its accounting and diagnostics. Per-resource body/header/decompression/redirect ceilings may leave other candidates available; global objective byte/request/time ceilings remain terminal. Failed bytes are never refunded and rejected partial bodies never become observations. A different grounded candidate or distinct observation context may proceed within existing budgets. The consumed action identity is never retried. Geography-integrity failures retain the existing terminal behavior. Arbitrary interpretation/contract exceptions do not trigger recovery and their unrestricted messages are not persisted. Search failure does not automatically repeat the dependency with another query family. Reservations remain checkpointed before dispatch; unknown pending dispatch still requires recovery rather than redispatch.

The existing terminal reasons remain: OBJECTIVE_ESTABLISHED, SEMANTIC_EXHAUSTION over current grounded knowledge/permissions, CAPACITY_BOUND_REACHED, and explicit capability/interpreter failure. Decision audits distinguish consumed candidates/contexts/query families, policy denial, permissions and capacity. Failure-recovery, frontier replacement, exposed/promoted advisory IDs and source-resource admission are traced. No corroboration action is generated once truth completes.

## Capacity model

All bounds are resource/research ceilings, not verification requirements.

| Bound | Before | After | Scope and rationale |
|---|---:|---:|---|
| Retained candidate destinations | 24 | 128 | Broad useful frontier across product/localization/navigation; preserve seeds and replace low-value unattempted candidates |
| Navigation depth | 3 | 4 | Homepage → index/category → locale/product → plan/terms; no unrestricted crawling |
| Sitemap acquisitions | none | 4 | Index plus child maps, nested under global acquisition/country/request/byte budgets |
| Distinct provenance references/destination | 1 | 8 | Preserve independent navigation paths without unlimited histories |
| Extracted candidates/observation | 512 anchors | 2,048 structural candidates | Broad structure with finite source/label capacity |
| Navigation scan tokens | source parser bound | 131,072 per extraction/base pass | Finite processing of complete acquisition; extraction limitation is explicit |
| Source label / local label scan | source-bound | 240 chars / 4,096 chars | Avoid duplicating giant anchors into advisory context |
| Inert JSON script / nodes / depth / scripts | no navigation JSON | 256 KiB / 4,096 / 32 / 32 (pointer ≤2,048 chars) | Bounded metadata parsing; repeated source-span hashes cached |
| Sitemap entries inspected/document | none | 4,096 | Large maps cannot turn into unbounded crawling; frontier remains 128 |
| Robots sitemap declarations/document | none | 16 | Bound auxiliary navigation; unchanged 512 KiB robots acquisition |
| Advisory candidates / host wait | legacy synchronous callback | 64 / 1 second | Source-ID advice only, deterministic fallback on failure |
| Finite query families/market | one need-set query | 3 | Alternative useful research intents without arbitrary paraphrases |
| Actions / searches / acquisitions / COUNTRY acquisitions | 20 / 4 / 12 / 8 | unchanged | Exploration competes within existing objective budgets |
| Planner / network / model calls | 24 / 96 / 12 | unchanged | Redirect/robots/geography requests retain exact global accounting |
| Provider encoded / decoded observation capacity | 8 / 16 MiB | unchanged | Acquisition remains independent of semantic/navigation context |
| Objective encoded / decoded capacity | 64 / 128 MiB | unchanged | All acquired provider and auxiliary resource bytes remain bounded |
| Acquisition / aggregate acquisition time | 240 / 900 seconds | unchanged | Existing phase and objective acquisition deadlines |
| Semantic units / source / request / output bounds | existing baseline | unchanged | No model capacity increase or page-wide semantic request |

At a frontier/depth/extraction/sitemap/global bound, diagnostics retain the affected ceiling; partial navigation representations never claim source completeness was lost. Complete original observations remain independently retained. Navigation is intentionally a bounded representation of complete source, not silent transport truncation. Broad frontiers do not imply all candidates will be acquired: twelve acquisitions and other objective budgets remain the outer envelope.

## Validation and truth audit

Synthetic provider ecosystems exercise direct sufficient seed, internal link, six unseen-language/script labels, locale metadata, identical URLs under distinct countries, search-required and misleading snippets, multiple destinations, duplication, redirects, multi-megabyte late pricing, sitemap indexes/robots, client shells, sufficient-objective stop, failures and checkpoint restore. Negative tests cover source integrity, unsafe/external destinations, forged advisory IDs/claims, namespace review, sensitive query keys, sitemap entity injection and discovery metadata pretending to be evidence.

Tests compare identical observations/admissible evidence before and after injecting discovery/ranking/provenance artifacts. A separate read-only audit also executes the protected baseline truth evaluator against fifteen heterogeneous reconstructed fixture states and compares it with the current evaluator, with and without misleading discovery metadata. All results are identical. Established truth/evidence/projection/source/semantic modules have no source delta.

`TRUTH-RULE DELTA: NONE`

`NEW MANDATORY PRICE VERIFICATION REQUIREMENTS: NONE`

`REMOVED PRICE VERIFICATION REQUIREMENTS: NONE`

`PRICE/TRUTH SEMANTICS CHANGED: NO`

`PROVIDER-SPECIFIC DISCOVERY LOGIC ADDED: NO`

`V2 TRUTH SEMANTICS IMPORTED INTO V3: NONE`

`V2-DERIVED DISCOVERY SIGNALS GIVEN TRUTH AUTHORITY: NONE`

## Milestone verification

Starting branch/HEAD: `build10-final` / `f2764652d96d25c158a3ccdc1ed004aa18e8af12`; baseline offline suite 625/625. The completed offline suite is 724/724 (99 new tests). The existing acquisition-headroom, pricing, source reconstruction, COUNTRY/DIRECT, account and checkpoint regressions all pass. Preservation passes before work, at implementation checkpoints and before commit: 725 historical status entries and 745 protected file hashes unchanged, with only the thirteen explicit milestone paths accounted for before commit. No live network/model/provider validation, V2 implementation changes, push or deployment occurs in this phase.

Remaining questions for the separately authorized frozen live campaign: quality of opaque multilingual-link ranking on dense real menus; provider-specific search coverage and regional delivery; usefulness/availability of provider sitemaps; reviewed namespace configuration for related surfaces; client-shell acquisition with no public source pricing; external dependency/geography failures and the unchanged semantic model budget. No correction against a live provider is attempted here.
