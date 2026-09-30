# Research V3 bounded live semantic preparation

This milestone prepares one separately authorized single-target run. No live
provider, Tavily, Decodo or model request was made during implementation.

## Interface and configuration

V3 uses the installed `groq-sdk` Chat Completions API at
`https://api.groq.com/openai/v1/chat/completions`, with
`response_format: {type: "json_schema", json_schema: {strict: true, ...}}`.
This is the same provider, SDK, environment credential mechanism and structured
output interface used by `services/api/src/assistant.ts`. V3 has its own source
bound contract and imports no V2 model policy, verifier or truth machinery.

The operator supplies `SAVLIVO_V3_SEMANTIC_MODEL` explicitly: a Groq-hosted model
with multilingual understanding and strict JSON-schema support. There is no
silent default, model substitution, JSON-mode downgrade or legacy fallback.
Model availability/schema support cannot be verified without a model request;
configuration preflight checks local configuration only. An unsupported model
or schema fails the interpretation safely. This preparation does not claim
measured real-model accuracy for any language.

Credentials remain process environment inputs supplied by the approved runtime:
`GROQ_API_KEY`, `TAVILY_API_KEY`, `DECODO_USERNAME`, `DECODO_PASSWORD`.
V3 does not load `.env` automatically, create a keychain mechanism, expose key
values, inspect private credential files, or persist keys. Enabled transports
are checked for required configuration before dispatch. The Decodo username is
the base username; the existing country/session construction remains intact.

## Contract, source binding and bounds

The model receives the objective, acquired observation identity/body hash,
transport/geography, and bounded original-language segments/presentations.
It returns only candidate fields, explicit/ambiguous status and source support;
not truth verdicts, hidden reasoning, provider observations or destinations.
Language is descriptive metadata and provides no geographic evidence.

Strict remote schema is followed by local envelope/shape checks, full-segment
quotation validation and existing `projectSemantic` body/hash/offset/presentation
validation. OFFER support must cover every supplied segment inside its selected
presentation. Partial/clipped quotes and omitted segments fail safely. Existing
projection and deterministic evaluation still control truth. No truth/admission
predicate changed. Supporting quotes alone cannot prove a model's semantic
interpretation is correct; review the first live trace against original material.

`bounds.modelCalls` defaults to 12 and may be lowered to zero. Every semantic
call, including failed calls, is reserved before dispatch, attributed to its
observation and adapter, and checkpointed. The actual SDK performs no retries,
so each reservation permits at most one model HTTP request. A run stops with
capacity exhaustion at its call bound, independently of semantic exhaustion.
The timeout is configurable between 1 and 30,000 ms; cancellation is propagated
to the SDK. Maximum completion tokens are configurable up to 8,192; semantic
JSON is capped at 65,536 bytes and the streamed SDK HTTP response at 131,072 bytes.
Research transport byte/request bounds remain separate from these model bounds.

Failure, timeout, truncated/refused completion, malformed or incorrectly bound
output leaves the observation without accepted candidates and stops with an
explicit failure. No static interpretation is used. Existing established facts
remain intact. Resume preserves call counters and accepted source bindings,
rejects adapter-mode/model changes and refuses automatic replay of an unknown
in-flight research/model call (`RECOVERY_REQUIRED`). A stopped checkpoint remains
stopped; a new run is a separate authorization, not an automatic retry.

## Generic future invocation — do not execute without authorization

Supply a reviewed input file outside the worktree, substituting real identities,
provider hosts, a single target country and an operator-grounded HTTPS seed.
No first provider is hard-coded. This example uses the existing PRICE objective;
service-admission facts remain independently evaluated in the result.

```json
{
  "objective": {
    "kind": "PRICE",
    "serviceId": "<service-id>",
    "serviceName": "<exact-service-name>",
    "providerHosts": ["<provider-domain>"],
    "markets": ["<ISO-country>"],
    "seeds": ["https://<provider-domain>/<grounded-path>"]
  },
  "provider": {
    "reviewed": true,
    "serviceId": "<service-id>",
    "hosts": ["<provider-domain>"]
  },
  "permissions": {"DIRECT": true, "TAVILY": true, "DECODO": true},
  "planning": {"initialPerspective": "AUTO"},
  "semantic": {"mode": "LIVE", "timeoutMs": 30000, "maxOutputTokens": 8192},
  "bounds": {
    "actions": 6, "searches": 1, "acquisitions": 4,
    "countryAcquisitions": 2, "modelCalls": 4,
    "plannerCalls": 8, "networkRequests": 32, "bytes": 262144,
    "navigationDepth": 2, "candidateDestinations": 12,
    "observationsPerContext": 1, "observationsPerDestination": 3
  }
}
```

From `/Users/Thomas/Projects/savlivo-build10`, with required environment variables
already provided by the approved runtime:

```sh
node services/api/src/research-v3/runner.mjs --preflight /absolute/path/target.json
# Only after explicit human authorization of ONE target:
node services/api/src/research-v3/runner.mjs --live /absolute/path/target.json \
  --allow-network --allow-model --output-dir /absolute/path/new-v3-experiment
```

Preflight constructs dependencies without making requests or writing run files.
Live execution requires both explicit IO flags and an output directory. It writes
`checkpoint.json` atomically at reservation/commit boundaries and `result.json`
with final truth, decisions, trace, counters and stop reason. `.savlivo` is not an
allowed output directory. An optional `--resume /absolute/path/checkpoint.json`
uses the same configuration/adapter and retained bounds; unknown dispatches are
not repeated. Offline CLI rejects LIVE semantic configuration.

Direct remains ordinary unbound provider acquisition. Tavily remains discovery
only; snippets never enter model input or provider truth. Decodo remains a
first-class target-country acquisition. AUTO may choose Decodo first; COUNTRY
requests that perspective and UNBOUND may choose Direct first without making it
a prerequisite. Direct success with unresolved market leaves same-URL Decodo
useful. DIRECT/UNBOUND, DECODO/JP and DECODO/AU remain distinct observations.
No routing criterion uses monetary cost.

## First-result limitations and prerequisites

Human review and authorization of ONE service/market, reviewed domain/seed,
explicit bounds, provisioned credentials, an explicitly selected compatible
multilingual Groq model and a fresh output location remain required. No live
configuration/credential availability, model accuracy or provider accessibility
was tested. The existing single-target CLI requires exactly one PRICE market;
the separate SERVICE_QUALIFICATION objective retains its existing no-market
contract in the engine. No browser, PDF or rendered-page support was added.
The acquired HTTP text/HTML material can be incomplete for JavaScript-driven
providers, long pages, entity-heavy text or offers whose support exceeds the
segment/claim limits. Rejections and capacity flags must qualify interpretation
of the first result. The planner and link classification retain existing V3
behavior; this milestone replaces semantic observation interpretation only.

## Preservation checkpoint

The new V3 post-move baseline is a newly authorized preservation checkpoint and
is not claimed to reproduce the deleted historical `/private/tmp` baseline.

Durable files outside the worktree:

- `/Users/Thomas/.savlivo-preservation/v3-post-move-417e94b/baseline.json`
- `/Users/Thomas/.savlivo-preservation/v3-post-move-417e94b/verify.py`

Format `savlivo-preservation`, version 1; exact base64-encoded porcelain status,
repository-relative SHA-256 mappings, timestamp, branch and provenance HEAD.
The baseline captures 725 entries and 745 protected files. The verifier checks
exact historical status bytes, recursive file selection and every protected
hash. HEAD advancement is reported rather than rejected.

Before and after a milestone, run:

```sh
python3 /Users/Thomas/.savlivo-preservation/v3-post-move-417e94b/verify.py
```

While a reviewed milestone has uncommitted task changes, enumerate each exact
milestone path with `--task-file path`. This filters only those task status
entries, then compares the remaining bytes exactly to the checkpoint. An
exemption intersecting a baseline status path/directory or protected file is
rejected. Unlisted status changes still fail, as do missing/changed files or
changed recursive selection. This makes the precommit check possible while
protecting every historical dirty/untracked entry; after commit use no exemptions.

For this milestone's precommit check only:

```sh
python3 /Users/Thomas/.savlivo-preservation/v3-post-move-417e94b/verify.py \
  --task-file services/api/src/research-v3/live-semantic.mjs \
  --task-file services/api/src/research-v3/live-semantic.test.mjs \
  --task-file services/api/src/research-v3/semantic.mjs \
  --task-file services/api/src/research-v3/engine.mjs \
  --task-file services/api/src/research-v3/model.mjs \
  --task-file services/api/src/research-v3/runner.mjs \
  --task-file docs/research-v3-live-semantic.md
```
