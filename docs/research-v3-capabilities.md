# V3 milestone 2: bounded single-target pipeline

V3 now connects a reviewed service/market objective to discovery, provider
acquisition, raw-source interpretation, independent proposition evaluation and
further observations. This is a separate runner, not an Operations integration.
All validation in this milestone is offline; live endpoints/credentials have not
been exercised.

## Flow and foundation extension

Objective → unresolved propositions → admissible action → permitted capability
→ retained raw material/context → source-bound candidates → independent truth
evaluation → updated needs/navigation → next observation or explicit stop.

The foundation's structured-JSON-only observation contract was the concrete
boundary requiring extension. `WEB` observations retain HTML/text. `source.mjs`
projects candidate fields with raw substring bindings. `truth.mjs` independently
recomputes that projection rather than trusting interpreter-provided fact values.
Structured milestone-1 observations and their tests remain supported. Service
admission, pricing conjunctions and one-source sufficiency are unchanged.

## Capability boundaries

`createCapabilities()` takes explicit objective, permissions, credentials and
trusted IO dependencies. Import/construction causes no dispatch. There are no
keychain, environment or production-state reads in the factory.

- **Direct:** public DNS/address validation, pinned acquisition, bounded bodies,
  timeout and redirects. Reviewed provider hosts and robots policy are checked
  before provider requests, including redirects. Observation metadata includes
  requested/final URL, HTTP status, content type, body, truncation, timestamp,
  Direct/UNBOUND context and access decisions.
- **Tavily:** bounded streamed discovery response and provider-domain filtering.
  Only candidate URLs are retained. Snippets/answers never become evidence.
  Discovery failure is explicit, not an empty successful research result.
- **Decodo:** common gateway with explicit country and a fresh sticky session.
  One binding performs exit verification, robots retrieval, provider acquisition
  and a second exit verification. Country and exit IP must agree before content
  is admitted. Metadata retains requested/verified country, gateway, verification
  method and non-secret binding/exit digests. Failure withholds provider content;
  there is no unbound fallback.

Unchanged technical infrastructure reused:

- `services/api/src/research-v1/public-network.mjs`: reader/address validation.
- `services/api/src/research-v1/robots-access.mjs`: robots parser/evaluator.
- `docs/catalog/global-47/research-v1/proxy-connect.mjs`: pinned CONNECT hop.
- `docs/catalog/global-47/research-v1/independent-exit-verifier.mjs`: endpoint/parser.

No V2 planner, verifier, lifecycle, cost selector or fallback policy is imported.
Optional legacy provider-specific extraction switches are not enabled. Robots
enforcement is access safety, not a research truth gate.

## Accounting, safety and failures

The additional `networkRequests` bound defaults to 96. Each HTTP dispatch is
charged before execution: discovery, provider, robots, redirects and geo probes.
This is separate from semantic action/acquisition counts and survives checkpoints.
Transport capacity stops are `CAPACITY_BOUND_REACHED`, not semantic exhaustion.

Response-body bytes include ancillary requests and failed responses; headers/TLS
bytes are excluded. Decoded representation expansion cannot bypass the bound.
A stream can deliver its rejecting chunk before cancellation; actual observed bytes
are recorded, and no oversized body is admitted as evidence. Unknown interrupted
dispatches retain the foundation's reconciliation requirement, never auto-resend.

Credentials stay in closures. Diagnostics use bounded fixed codes. Reflected proxy
credentials are rejected. Research traces do not contain request credentials.
Explicit robots denial and provider 401/403 are access-policy stops; Decodo cannot
bypass them. Unavailable/ambiguous robots policy prevents provider acquisition.

## Real-source interpretation

The deterministic interpreter handles static HTML/XHTML/plain text and explicit
English prose. It recognizes reviewed service names, service-total population
statements, login/management assertions, consumer subscription presentations,
ISO-currency amounts, supported numeric formats, cadence and market availability.

Candidates retain `[start,end)` JavaScript string offsets and a digest of that
exact raw substring, plus observation digest and conceptual field pointer.
Ambiguous amounts/cadence remain unresolved and inspectable. Material is never
executed. Explicit hidden/script/template content and navigation labels do not
establish pricing/account facts.

This is not a general multilingual or rendered-browser interpreter. Arbitrary
JSON-LD, JavaScript applications, images/PDFs, implicit consumer context and
ambiguous currency symbols are not currently interpreted. Cross-observation
pricing fragments still require compatible offer identity. Unsupported wording
can remain unresolved. These are interpretation coverage limits, not requirements
that providers must satisfy to be factually correct.

## Reasoner and grounded navigation

The deterministic reasoner receives objective, facts/contradictions/needs,
destinations, observation metadata, attempts, permissions, bounds and usage.
It ranks admissible actions by expected information value. There is no monetary
cost criterion. `AUTO` can choose Decodo first. An optional initial `UNBOUND`
perspective is not a prerequisite for country acquisition. Successful Direct with
remaining target facts increases the value of a distinct country observation.
Once the objective establishes, no ceremonial extra acquisition occurs.

A future LLM returns proposals through the same deterministic admission boundary,
without network or truth authority. No LLM provider coupling was added here.

Bounded observed anchors are retained. Built-in English cues classify useful
pricing/account/locale navigation. An optional `navigate(anchors, needs)` classifier
can classify other observed anchors by existing index, assigning only current
needs. It cannot invent an href. A test uses “Explore your possibilities” to prove
the mechanism is not restricted to built-in words. Provider, depth, destination,
request and duplicate bounds remain authoritative.

Normalized URL + transport + geography + representation remains observation
identity. Direct/UNBOUND and Decodo/JP are distinct. Equivalent completed contexts
remain consumed on resume. Invented planner URLs are rejected even on allowed hosts.
Semantic exhaustion remains explicitly scoped to current grounded knowledge,
permissions and implemented interpretation/action capabilities, not the internet.

## New rule inventory and justification

| Rule | Incorrect conclusion/behavior prevented |
| --- | --- |
| Reviewed service/host correspondence and one market at the runner boundary | An unintended provider or cohort becoming this single-target experiment |
| Independently rederive web fields from raw source with span references | Interpreter assertions becoming unsupported facts |
| Exact reviewed name in provider title/heading/prose | A permitted host's unrelated product becoming the requested service |
| Keep price fields in one smallest applicable presentation block | Pooling unrelated amounts and terms across the page |
| Multiple different monetary values stay ambiguous | Arbitrarily choosing among ordinary, promotional or other prices |
| Parse complete numeric notation and explicit supported currency | Reading `14,99` as 14 or assigning ambiguous currency |
| Preserve consumer/cadence and annual/arithmetic/qualifier cues | Annual equivalence, installment, trial or benefit becoming ordinary monthly price |
| Negated, illustrative and starting-price language stays unresolved | A denial, example or lower-bound advertisement becoming a definitive price |
| Explicit provider market-availability text | Inferring market truth from network geography, currency, language or URL |
| Population statement names service and unit | Another entity's users or geographic breadth becoming service size |
| Explicit independent login/management prose | Navigation labels or login alone proving subscription management |
| Exclude scripts/templates and explicitly hidden material | Non-observed alternatives or executable text becoming provider facts |
| Classify existing anchors against current needs only | Invented/irrelevant navigation expanding research |

Infrastructure validation additionally enforces HTTPS/provider/DNS boundaries,
robots/access policy, content/encoding, deadlines, country receipts, secret safety,
request/body limits and deterministic proposal validation. These do not introduce
proof counts or change admission requirements.

## Single-target host

`runTarget({input, capabilities, reasoner?, navigate?, save?, snapshot?})` returns
knowledge and a report containing objective, final truth, stop, usage, trace and
decision ledger. Resume preserves facts, contexts and counters and rejects a
different objective. Persistence is injected; the CLI writes only its report to
stdout and never writes Operations/lifecycle state.

Input shape:

```json
{
  "objective": {"kind":"PRICE","serviceId":"example","serviceName":"Example Club","providerHosts":["provider.example"],"markets":["JP"],"seeds":["https://provider.example/plans"]},
  "provider": {"reviewed":true,"serviceId":"example","hosts":["provider.example"]},
  "permissions": {"DIRECT":true,"TAVILY":true,"DECODO":true},
  "bounds": {"actions":12,"networkRequests":64,"bytes":1048576},
  "planning": {"initialPerspective":"AUTO"},
  "fixtures": [],
  "discoveries": []
}
```

Offline fixtures specify URL, transport, country for Decodo, status, content type
and raw body, including robots responses. Missing fixtures fail rather than use
live traffic. Exit responses are deterministic offline fixtures; mismatch and
changed-exit rejection are separately tested.

```sh
node services/api/src/research-v3/runner.mjs --offline /path/to/input.json
node --test services/api/src/research-v3/foundation.test.mjs services/api/src/research-v3/pipeline.test.mjs
```

The CLI also supports a separately authorized `--live input.json --allow-network`
invocation. Without that explicit flag, live mode exits before loading input or
dispatching. Credentials come from `TAVILY_API_KEY`, `DECODO_USERNAME` and
`DECODO_PASSWORD`; there is no automatic keychain/production credential access.
No authorized live invocation was performed in this milestone.

## Validation and next boundary

Tests exercise the same adapter/reader path through acquisition and truth:
Direct sufficient; Direct 200→Decodo JP; Decodo first; discovery→acquisition;
navigation; partial facts; negative price controls; wrong/absent market; raw-source
bindings; policy/authority; geo failure; resume accounting; capacity versus
exhaustion; and standalone CLI output. The original foundation tests also remain.

Before one authorized live experiment: review one service/provider/market and
public seeds; confirm relevant language/material is interpretable; set explicit
bounds and credentials; approve the exit-verification endpoint/network execution;
record revision, input, trace and final facts. No deployment or Operations change
is needed. Real credential/endpoint behavior remains unvalidated here.

Before 20 services: audit that one-target trace against its sources; extend/test
concrete language/rendering gaps; provide durable atomic checkpoint hosting and
reconciliation if interruption recovery is required; define reviewed benchmark
inputs/limits and independently assess facts, acquisitions, stops, duplicates and
accounting. No provider-specific patches or production-yield claims are implied.
