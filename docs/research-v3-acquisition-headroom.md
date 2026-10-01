# Research V3 acquisition headroom

This milestone changes acquisition resource capacity and diagnostics. It does not change price, evidence sufficiency, account, service-association, geography, contradiction or objective-completion rules. No provider or market exceptions, retries, browser rendering or live validation are introduced.

`NEW MANDATORY PRICE VERIFICATION REQUIREMENTS: NONE`

`PRICE/TRUTH SEMANTICS CHANGED: NO`

`PROVIDER-SPECIFIC ACQUISITION LOGIC ADDED: NO`

## Audit and evidence

The starting implementation was `5f956d4abe2b88b25931bf2e2d296b4d1404c3ba`, with 464 passing tests. The retained eight-case campaign is `/private/tmp/research-v3-generalization-9yhtoq1l`. Seven cases failed acquisition; the eighth acquired a client shell with genuinely insufficient pricing material. Four failures followed successful robots HTTP responses; one followed a provider 301; two hit response-size capacity, one while streaming and one before body reception. Missing historical details cannot be reconstructed: the old code did not retain the robots processing exception or redirect target. The headers-stage size rejection was a declared-body-size rejection, not proof of an HTTP header overflow.

The complete old route was planner → capability → reused V1 public reader → robots hook/parser → Direct or reused pinned CONNECT hop → provider → geography post-check → observation → presentation → semantic units → evidence/truth. The V1 reader normalized foreign hook/parser exceptions into `NETWORK_FAILED`. This hid errors after completed HTTP requests. The transport rejected compressed representations, conflated response and aggregate byte capacity, had 16 KiB headers and three redirects, and exposed incomplete failure metadata. A separate downstream ceiling of 256 presentations could prevent understanding a perfectly complete large observation. Node also had a silent header-pair truncation default underneath the explicit byte ceiling.

The retained campaign cannot prove which specific new behavior will resolve each historical provider. This is an offline acquisition engineering milestone, not a claim that those providers now verify.

## New route

Planner/transport selection remains unchanged. V3 owns the acquisition reader, response decoder, robots orchestration and both raw HTTP hops. It still reuses the public-address predicate, existing research user agent, independent exit verifier and the existing bounded robots path matcher without modifying V1/V2.

1. Validate the HTTPS destination against the exact reviewed provider-host set. Reject userinfo, unsafe hosts, nonstandard ports and known credential-bearing query keys.
2. Vet every resolved address; pin a public address. Proxy gateway DNS is vetted too.
3. For COUNTRY, create one invocation-local proxy session and independently verify the country/exit before provider acquisition.
4. Retrieve robots per origin, including bounded redirects. Decode complete bounded policy text and parse it independently of MIME spelling. Evaluate the existing path policy; denial and pacing/review conditions remain blocking.
5. Acquire each provider hop with independent connect/TLS, headers, body and whole-request deadlines, within the finite parent acquisition deadline. No retries.
6. Follow only validated, reviewed HTTPS destinations. Check the destination origin's robots policy. Keep GET semantics for 301/302/303/307/308. Relative and absolute locations are supported, with query preservation; loops, missing/malformed locations and unsafe targets are explicit failures.
7. Read a complete bounded encoded entity, decompress within a separate decoded limit, decode characters strictly, and retain the complete original decoded source. A non-200 provider response is HTTP-unavailable/access-controlled, not interpreted as pricing evidence.
8. For COUNTRY, verify the same exit/country afterward. Only then mark the observation BRACKET_VERIFIED. An unsuccessful post-check withholds the provider body.
9. Store original-source SHA-256, encoded-entity SHA-256 and safe content/byte/completeness/redirect metadata. Restore them through checkpoints.
10. Build bounded source presentations, select the existing bounded semantic units, and run the unchanged evidence/truth architecture.

## Capacity model

All byte units below are binary. Bounds accept equality and reject values above the bound; request/redirect counts accept exactly the configured count and reject dispatch/follow beyond it. Timers terminate pending operations at their deadlines; successful operations already settled are not retroactively aborted. Explicit smaller operator budgets remain effective. Older checkpoints preserve their original explicit byte budget; new fields use documented defaults on resume.

| Bound / scope | Previous | New | Protected resource / rationale | Above-bound behavior |
|---|---:|---:|---|---|
| Encoded provider entity per response | remaining aggregate, at most 256 KiB by default | 8 MiB, also limited by remaining objective bytes | 32× prior default; comfortable multi-megabyte modern HTML, independent of model context | `RESPONSE_TOO_LARGE`, no observation body |
| Decoded entity per response | implicitly coupled to aggregate; compression refused | 16 MiB | finite expansion ceiling, substantial room for compressed modern pages | `DECOMPRESSION_BOUND` or `DECODED_BYTE_BOUND` |
| UTF-8 authoritative source retained per observation | aggregate 256 KiB | 16 MiB | separate encoding-expansion/storage ceiling; complete source retained | `OBSERVATION_BYTE_BOUND` |
| Aggregate encoded entity bytes / objective | 256 KiB | 64 MiB | permits several large observations plus robots/geography, not one narrow page envelope | `WIRE_BYTE_BOUND` / engine transport-capacity stop |
| Aggregate decoded entity bytes / objective | not separately tracked | 128 MiB | prevents repeated expansion across observations | `DECODED_BYTE_BOUND` / engine transport-capacity stop |
| Robots encoded, decoded, UTF-8 policy bytes / response | shared remaining objective default ≤256 KiB | 512 KiB in each domain | at least 500 KiB policy capacity without allocating page-size buffers | typed response/decompression/decoded/source capacity failure |
| Robots line characters | parser-specific strict small-record assumptions | 16,384 | bounded parser work per directive; ordinary extensions/comments tolerated | `ROBOTS_PARSE_FAILED`, line/reason retained |
| Geography entity bytes | 10,000 / shared objective | 10,000 in each domain | small fixed independent-verifier JSON, unchanged purpose | typed size failure, no country admission |
| HTTP header bytes, proxy CONNECT and target | 16 KiB | 64 KiB | 4× margin for localization/CDN/cookie header sets | `HEADERS_TOO_LARGE` |
| Node header-pair retention | implicit 2,000 pairs (1,000 fields) | no independent silent truncation; constrained by 64 KiB parser bound | retain late important fields; finite byte ceiling bounds count/memory | byte-bound parser rejection, never silent field dropping |
| Provider redirects / reader | 3 | 8 | ordinary localization/account/CDN chains, finite and separately budgeted | `REDIRECT_LIMIT` |
| Robots redirects / retrieval | 3 | 5 | ordinary policy-host canonicalization, independently finite | `REDIRECT_LIMIT` |
| DNS operation | 15 s shared request setting | 10 s | DNS is an establishment phase, not a slow provider-body allowance | `{purpose}_DNS_TIMEOUT` |
| Direct connect/TLS; proxy CONNECT; target TLS phase | within 15 s request | 15 s each phase | separate establishment failures; no repeated reset | `{purpose}_{phase}_TIMEOUT` |
| Response-header phase | within 15 s request | 30 s | room for proxy/CDN/origin first-byte variability | `{purpose}_HEADERS_TIMEOUT` |
| Whole body-read phase | within 15 s request | 60 s | enough for a finite multi-megabyte response; chunks do not restart timer | `{purpose}_BODY_TIMEOUT` |
| Whole provider HTTP hop | 15 s | 90 s | bounds combined connect, headers and streaming, including slow phase combinations | current phase timeout classification |
| Whole robots HTTP hop | 15 s | 30 s | smaller response and separate purpose budget | current phase timeout classification |
| Whole geography HTTP hop | 15 s | 20 s | small response, independent allowance | current phase timeout classification |
| Local decoding/decompression operation | no explicit separate bound | 10 s | prevent local processing from inheriting only network semantics | `{purpose}_{processingPhase}_TIMEOUT` |
| Robots parse/evaluation operation | no explicit separate bound | 10 s checked elapsed | bounded policy parsing/matching; local cause remains visible | `ROBOTS_PROCESSING_TIMEOUT` |
| Parent acquisition, including DNS/robots/redirects/geo/processing | 90 s | 240 s | finite headroom for a multi-operation COUNTRY acquisition; not the sum of all maximal hop deadlines | `ACQUISITION_DEADLINE_EXCEEDED` |
| Sum of acquisition elapsed time / objective | no separately enforced sum | 900 s | finite total across up to twelve acquisitions; remaining time constrains next parent | acquisition/transport capacity stop |
| Network resource-hop attempts / objective | 96 | 96 | normal 1–2 redirect chains fit; every robots, provider and geo hop counts, including failures | `NETWORK_REQUEST_BOUND`, no further dispatch |
| Actions / acquisitions / COUNTRY acquisitions | 20 / 12 / 8 | unchanged | finite research planning, no acquisition-driven retry loop | existing capacity stop |
| HTML tokens / representation | 20,000 | 131,072 | full traversal of a substantially larger DOM; unrelated script/style/template payload skipped | explicit `limited` representation / material-capacity diagnostic |
| Visible source segments / representation | 2,048 | 32,768 | ordinary large-page structural headroom | explicit material capacity |
| Presentations / parsed document | semantic material 256 | 8,192 | large DOMs and late relevant cards, without unbounded node retention | explicit material capacity |
| HTML ancestry depth | 128 | unchanged | finite stack/ancestry memory | explicit material capacity |
| Sum of materialized visible node text / document | no independent limit | 32 MiB | limits nested-container text amplification separately from intact source | explicit material capacity |
| Semantic source / unit | 4,096 bytes / characters | unchanged | acquisition capacity does not increase model input | existing semantic unit bound |
| Presentations / segments / destinations per semantic unit | 16 / 64 / 16 | unchanged | finite source-local understanding | existing semantic unit bound |
| Units / action and model calls / action | 4 / 4 | unchanged | finite semantic work | existing unit/model capacity |
| Semantic logical request / serialized SDK request | 8,192 / 24,576 bytes | unchanged | separate structural/request serialization ceilings | existing request bound |
| Model output | configured token bound, default 8,192 | unchanged | finite generation | existing model/output validation |

These values are safety ceilings, not evidence requirements. The design comfortably supports 1–4 MiB ordinary large responses, encoded responses up to 8 MiB and decoded sources up to 16 MiB. It is not sized from the campaign maximum plus a small margin. A hostile/unusually large response still fails explicitly. A 16 MiB source is not promised to fit every possible DOM/ancestry structure or semantic unit.

The default acquisition cap is 240 s; trusted host overrides remain finite (request override ≤90 s, acquisition override ≤600 s). Explicit `timeoutMs` retains its uniform override behavior for existing offline harnesses and deliberate operator configuration. The normal default uses purpose/phase deadlines. Network operations are abortable; JavaScript synchronous decoding/parser slices cannot be preempted mid-instruction, so finite input/structural ceilings and elapsed checks additionally guard them. This is not a hard realtime CPU guarantee.

## Byte domains, accounting and completeness

`usage.bytes` means encoded HTTP entity bytes actually delivered to the client, including unsuccessful reads, robots and geography. It excludes TLS records, TCP framing, HTTP header bytes and redirect bodies deliberately not consumed. It must not be described as total wire traffic. Header-field byte counts are separately recorded where available. With gzip/Brotli/deflate, entity bytes are compressed bytes. Identity entity and decoded sizes are normally equal.

`usage.decodedBytes` counts emitted decompressed entity bytes, including the crossing output chunk on rejection. `usage.retainedBytes` counts complete provider-source UTF-8 bytes admitted after geography checks. Per-response metadata records all three quantities, charset, encoding, declared Content-Length, header-field size and encoded hash. The observation's existing `bytes`/`sha256` bind the complete decoded UTF-8 source. Charset conversion may change size; it is never charged as extra encoded traffic.

A crossing wire chunk is counted as received but never added to the retained chunk list. A crossing decoded chunk is counted as emitted but never added to the accepted decoded list. No partial body is returned as an intact observation. Known Content-Length is checked at headers and again against complete received entity length. Missing length is allowed; premature close/abort/read error is typed and rejected.

`completeness: COMPLETE` is assigned only to a successfully completed provider entity, after required geography checks. Rejected responses have empty bodies and `REJECTED`. A downstream representation may be bounded/limited while its original complete observation remains intact. It does not become a truncated observation. A faulty adapter advertising an incomplete OK response is rejected before admission. Existing truth already rejects truncated/bad-hash source; its predicates are unchanged.

`networkRequests` keeps the existing resource-hop budget convention. Each hop reserves one request, independent of transport. Proxy CONNECT is a transport handshake nested inside that hop, not a second provider resource acquisition. The ledger now exposes actual `CONNECT` and `GET` dispatches separately in `transportRequests`, and `externalHttpRequests` totals these when observable; injected legacy mocks with no transport events count as one opaque hop. Production Direct contributes one GET; production COUNTRY contributes at most one CONNECT plus one GET per hop (thus at most 192 HTTP dispatches under the unchanged 96-hop objective cap). No reconnect/retry loop exists. DNS/TLS operations are not HTTP request counters. Redirect hops and new-origin robots requests consume ordinary hop budget; geo brackets consume two hops. A worst-case chain may still exhaust a deliberately small objective budget, with exact diagnostics.

## Robots policy

Robots retrieval is not bypassed. 404/410 are absent policies as before; successful policy bodies must be bounded and parseable. Other HTTP statuses remain unavailable. Empty policy/comments work. Consecutive user agents, wildcard fallback, repeated specific groups and existing longest-path allow/disallow rules are preserved. Unfamiliar agent tokens, extensions and safely ignorable non-policy records no longer poison otherwise valid policy. Malformed known policy directives, HTML challenge bodies, control bytes and invalid paths fail closed. Pacing remains review-required. MIME variation is accepted only when the policy content itself passes parsing; unsupported decoding/encoding never implies permission.

## Redirect and credential safety

Reviewed host membership remains exact. A provider subdomain or alternate origin must already be in the reviewed host set; this milestone does not automatically confer authority on arbitrary subdomains or third parties. Each destination gets public DNS vetting, pinned addressing and robots evaluation. COUNTRY uses the same proxy credentials/session and pre/post exit verification throughout the chain. HTTPS downgrade, local/private destinations, userinfo, unsupported schemes and known credential query keys are rejected. Caller cookies, Authorization and proxy credentials are never forwarded in provider GET headers. Proxy authorization exists only on CONNECT.

Diagnostics retain origins and deterministic destination hashes, not raw Location/query strings, cookies or arbitrary headers. Bodies remain authoritative source artifacts. Known invocation credential reflection is checked before decoded provider/robots material can be retained; failures preserve only a typed code. No credential reads or live secrets are used in offline tests.

## Diagnostics and restoration

The acquisition ledger records action/attempt/sequence/order, origin/destination hash, transport/geography, redirect ancestry/decision, deadline limits, current transport/processing phase, elapsed time, status, declared bytes, encoded/decoded/retained counts, safe content metadata, completion and typed failure. CONNECT HTTP status is distinct from provider HTTP status. DNS operation records preserve phase, origin, elapsed/deadline and failure without inventing an HTTP request.

Completed HTTP status survives later processing failure. Error classes distinguish DNS/unsafe destination, connect, proxy, target TLS, header capacity/protocol, body read/incomplete, encoded-body capacity, decompression/expansion, charset decoding, robots parser/policy/HTTP, redirect validation/exhaustion, request capacity, phase/parent deadline, cancellation and local processing. Arbitrary exception strings/stacks are not retained. A small allowlist of transport error codes may be retained as cause. Parser diagnostics contain bounded line/reason metadata; matched policy paths are hashed. Ledger/capacity/operations and observation metadata survive the existing checkpoint integrity contract.

## Memory and downstream headroom

The implementation deliberately retains the full bounded original source rather than a blind prefix. Encoded buffers are at most 8 MiB; decoded buffers at most 16 MiB. Decompression emits 16 KiB chunks and stops before storing a crossing chunk. At concatenation, chunks and their combined buffer coexist briefly; a UTF-16 JS source string can use up to roughly 32 MiB at the 16 MiB source ceiling. Decoding therefore has a bounded transient footprint on the order of tens of MiB, plus runtime overhead, rather than unbounded expansion.

Parsed documents are cached by observation identity/body/content type in a WeakMap with weakly held parsed values, allowing large derived trees to be collected even while original observations remain retained and avoiding repeated full-page reconstruction for projection/unit validation. Unused duplicate inner HTML strings were removed. Ancestry records share immutable entries. Visible node text has a separate 32 MiB aggregate ceiling. Plain-text paragraphs preserve exact occurrence spans instead of using first-value `indexOf`, including repeated paragraphs. The native innermost priced-node selection uses ordered structural nesting rather than quadratic all-pairs comparison; its evidence semantics are unchanged.

Full observations are intentionally retained for reconstructable provenance. Checkpoint serialization/structured clones still transiently duplicate bounded source strings; this milestone is not a streaming storage rewrite. Across a default objective, retained source and structural caches can consume hundreds of MiB at capacity extremes. The 128 MiB decoded aggregate plus twelve acquisitions bounds that exposure, but high-concurrency hosts must provision memory accordingly. JavaScript execution, DOM traversal and serializer overhead are not constant-memory or hard realtime guarantees.

No source HTML is executed. Embedded scripts/structured data remain in the original body/hash; existing interpretation support is unchanged. JSON/XML may be acquired intact but are not newly promoted to pricing evidence by this milestone. A client-rendered shell remains genuinely unresolved. PDF/image/authenticated/cookie-dependent/browser-only material remains outside this HTTP evidence path.

## Offline validation and future live questions

Synthetic injected sockets test Direct and CONNECT/TLS lifecycle, 301/302/303/307/308, reviewed same/subdomain/cross-origin redirects, loops/limits/unsafe targets, robots policy/malformed/extension/MIME/compressed behavior, byte boundaries/chunk accumulation/declared length, 8 MiB encoded and 16 MiB decoded ceilings, decompression bombs, strict charset decoding and non-Latin text, header-byte configuration/overflow and credential isolation, phase/parent/processing cancellation, timers, geography continuity, checkpoint/body/hash/accounting and large-page evidence at beginning/middle/end. Header overflow is exercised through the Node transport error boundary with an injected parser error; tests do not claim live CDN/header-parser interoperability. All price/account/adversarial regressions run unchanged.

Future separately authorized frozen live validation must answer: do ordinary provider robots responses now parse; are reviewed redirect aliases complete; do real proxy CONNECT/TLS and compression combinations behave as mocked; is first-byte/body latency within the deliberately expanded envelope; what fraction of acquired complete pages contain usable source versus client shells; and is the resource envelope appropriate at deployment concurrency? No live provider/model/search/proxy probe is performed in this milestone.
