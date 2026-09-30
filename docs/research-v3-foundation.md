# Research Engine V3: first-principles offline foundation

This document records milestone 1. See [milestone 2](research-v3-capabilities.md)
for the added source interpreter, capability adapters and standalone runner.

## Objective and boundary

V3 researches independent factual propositions by choosing useful observations of
grounded provider resources. It is a new module in
`services/api/src/research-v3/`, with **no V2 imports, production entry point,
network implementation, filesystem writes or Operations integration**.

This milestone proves the research/truth boundary and deterministic orchestration
using structured offline provider documents. It does **not** claim to interpret
arbitrary HTML or to have improved production pricing yield. No V2 rule is an
implicit V3 specification. New policy must name the incorrect conclusion or
unsafe behavior it prevents.

## Minimal truth

Each proposition has `state`, `value`, source references and contradictions:

- `ESTABLISHED`: a sufficient source-backed observation supports the value.
- `UNRESOLVED`: no sufficient observation supports it yet.
- `CONTRADICTED`: explicit contrary evidence or incompatible supported values
  exist for this proposition/offer. It is not an automatic service-wide rejection.

One sufficient authoritative observation suffices. There is no proof-count gate.
Absent fields, failed requests and missing later evidence never retract a fact.
Actual incompatible observations remain inspectable; no automatic conflict
resolution or “latest source wins” rule is introduced.

Service admission is the conjunction of exactly five propositions:

1. `SERVICE_IDENTITY`
2. `SERVICE_SIZE_100K_PLUS`
3. `CONSUMER_MONTHLY_SUBSCRIPTION_EXISTS`
4. `ACCOUNT_LOGIN_EXISTS`
5. `MEMBERSHIP_MANAGEMENT_EXISTS`

The population is a documented service-total count of users, members, customers,
subscribers or active users. An exact count below 100,000 contradicts that
threshold; a lower bound below 100,000 proves neither side. Geographic breadth
and per-country counts do not substitute for service total. Missing admission
facts remain unresolved. Provider price and cancellation are not admission gates.

A monthly target-price objective uses six independent propositions per offer:
`SERVICE_IDENTITY`, `PRICE_AMOUNT`, `CURRENCY`, `MONTHLY_CADENCE`,
`CONSUMER_SUBSCRIPTION`, `TARGET_MARKET`. Establishment requires a coherent offer
with all six established for the requested market. An amount can be established
while cadence is unknown; the **complete price objective** remains unresolved.

### Complete initial truth-rule inventory

| Rule | Incorrect conclusion prevented |
| --- | --- |
| Evaluate only successful, untruncated provider observations with a matching content digest and permitted provider host | Failed, truncated, altered, unrelated or discovery content becoming provider truth |
| Source must explicitly identify the objective's service; candidates must point to actual source fields | A planner/interpreter assertion or similarly named service becoming evidence |
| Explicit service-total population, accepted population unit and exact/lower-bound semantics | Country coverage, unrelated totals or an insufficient lower bound establishing 100k |
| Explicit consumer subscription/membership with monthly cadence; no arithmetic-derived or trial-only monthly assertion | Annual/12, generic recurrence, installments or trial-only evidence admitting a service |
| Explicit login and membership-management booleans evaluated independently | Inferring management from login, or treating missing evidence as false |
| Positive finite monetary amount, ordinary price role, explicit amount derivation | Zero, benefit, credit, discount, trial or arithmetic value becoming an ordinary recurring price |
| Recognized explicit currency code | An ambiguous currency symbol becoming a specific currency |
| Explicit monthly cadence and consumer subscription/membership relationship | Annual, weekly, one-time, installment or ambiguous cadence becoming a monthly consumer offer |
| Explicit source market must equal the target | URL shape, transport country or a different market becoming target-market truth |
| Join only matching explicit offer identity, market, conditions, role and derivation; unlocalized material also keeps network perspective distinct | Building a synthetic price from unrelated plans, markets, qualifiers or geographic presentations |
| Without explicit offer identity, source observations stand separately | Guessing that fragments on different pages describe the same offer |
| Preserve explicit disagreement; absence does not erase evidence | Majority ceremony, failed rediscovery or repeated support silently removing contradiction |

These rules are implemented directly in `truth.mjs`, without importing a V2
verifier. Cross-market fragments are intentionally not joined. A later localized
presentation can independently establish the offer. Safe cross-source references,
temporal supersession and more expressive interpretation are not implemented yet.

## Knowledge, needs and actions

`model.mjs` defines objectives, proposition names, observation contexts, normalized
URLs, action identities, destination grounding, bounds and checkpoint envelopes.
`truth.mjs` derives facts and semantic needs from retained observations.
`engine.mjs` validates/ranks actions, calls injected capabilities, interprets their
results, reevaluates facts and repeats.

Knowledge contains objective, explicit permissions, bounds, grounded destinations,
observations (bounded source body, digest, context, source pointers), attempts,
policy blocks, counters, planner decisions and an event trace. There is no giant
trusted `VERIFIED` flag. A semantic need names the unresolved proposition, target
market, current state and relevant offer where available.

Executable actions are:

- `DISCOVER`: current need IDs, market, proposed query, usefulness reason/value.
- `ACQUIRE`: known provider URL, observation context, current need IDs and
  usefulness reason/value. Following navigation or another grounded resource is
  this same action with a different grounded destination.

Evaluation happens after each acquisition; stopping is a separate `StopDecision`.
The deterministic fallback proposes observations of known relevant destinations
and discovery addressing the **current** unknowns. It is not a fixed sequence of
query families. A reasoning adapter can propose/rank actions but cannot authorize
new URLs, change permissions/bounds, mutate knowledge or establish truth.

Destination trust starts with operator-supplied exact provider hosts and seeds.
Discovery and observed provider navigation may add URLs only inside those hosts.
Navigation carries explicit proposition relevance in this initial source format;
irrelevant links are rejected. The foundation does not guess URL paths, expand
provider authority, interpret arbitrary anchor text or discover authority itself.
HTTPS, public-host-shaped URLs without credentials/ports are required. This is
not a substitute for DNS/redirect/robots enforcement in a future live adapter.

## Geography and capability roles

An observation context is `{transport, networkGeography, representation}`.
Initially representation is `PROVIDER_PAGE`; Direct uses `UNBOUND`, Decodo an
explicit objective country. The capability must return the matching context.
This receipt represents the adapter contract, not independent proof of an exit
country; a live adapter will have to verify its actual network perspective.

- **Direct:** ordinary provider observation; not a required first step.
- **Tavily:** discovery of candidate destinations. Snippets never reach evaluation.
- **Decodo:** ordinary first-class country-bound observation, not an error fallback.

The deterministic fallback gives country-specific observations greater information
value for a market-price objective than unbound observations. A reasoner may
instead select Direct. There is **no monetary transport-cost objective**.
Permission means eligibility, never mandatory usage. Explicit provider access
blocks suppress every transport at the recorded URL/origin scope; Decodo does not
bypass them. A live adapter must enforce access policy on every acquisition.

### Generic walkthrough

1. Objective: monthly consumer price for a service in JP; all facts unknown.
2. Discovery locates an allowed provider pricing page. Its snippet is not evidence.
3. A scripted reasoner selects Direct/UNBOUND at that grounded URL.
4. HTTP 200 explicitly establishes service, amount, currency, monthly cadence and
   subscription relationship, but no market. Only `JP:TARGET_MARKET` remains.
5. Decodo/JP at the **same URL** remains admissible: its observation identity is
   different. It requires no transport failure and does not repeat discovery.
6. The localized provider presentation explicitly supports JP and the recurring
   offer. All price propositions establish; the run stops. If market remains
   absent, geography alone does not fill it: another useful grounded action or a
   justified stop follows.

## Planner / interpreter / evidence separation

An optional `reasoner` receives a copy of needs, facts, destination grounding,
observation metadata, attempts and admissible actions. It returns `actionId`,
reason and/or proposals. The engine revalidates everything. This is the future
bounded LLM research-intelligence boundary; this milestone makes no LLM calls.

The initial interpreter accepts **structured offline source material**, not a
model-generated conclusion. It returns source pointers, not truth states or fact
values. Evaluation rereads the retained material and checks the pointers. A
future unstructured interpreter will need verifiable source-span bindings and
tests before live use; simply trusting its normalized JSON would violate this
boundary.

Minimal provider fixture format:

```json
{
  "serviceId": "fixture",
  "population": {"scope":"SERVICE_TOTAL","measure":"MEMBERS","kind":"EXACT","count":100000},
  "account": {"login":true,"manageMembership":true},
  "offers": [{"id":"standard","amount":1400,"currency":"JPY","cadence":"MONTHLY","consumer":true,"relationship":"SUBSCRIPTION","role":"ORDINARY","market":"JP"}],
  "links": [{"url":"/plans","needs":["PRICE_AMOUNT","MONTHLY_CADENCE"]}]
}
```

Fields can be absent; absence yields unresolved facts. Optional `conditions` and
`amountDerivation` preserve qualifiers and explicit versus arithmetic amounts.
Capability responses carry `url`, `context`, `outcome`, `body`, optional `truncated`
and explicit policy-block scope. Search responses carry `results: [{url, snippet}]`.
Bodies in this format are synthetic observed documents, **not claims of web
extraction capability**.

## Bounds, deduplication and exhaustion

All bounds are configurable nonnegative integers:

| Bound | Default |
| --- | ---: |
| Total actions / planner calls | 20 / 24 |
| Discovery / provider acquisitions / country acquisitions | 4 / 12 / 8 |
| Navigation depth / candidate destinations | 3 / 24 |
| Acquired bytes (provider bodies plus discovery responses) | 262144 |
| Observations per equivalent context / per destination | 1 / 3 |

An injected adapter receives remaining `maxBytes` and bounded `maxResults` and
must enforce them while receiving material. An over-bound response is rejected
without interpretation. This engine cannot prevent a faulty injected adapter
from allocating memory or accessing a network; only deterministic fake adapters
are supplied here. Candidate/depth truncation is recorded as a capacity limit,
never silently counted as semantic exhaustion.

Acquisition identity is normalized URL + transport + geography + representation.
Fragments and tracking parameters do not create fresh actions. Unknown query
parameters remain because they may select different provider material. Direct,
JP and AU are different identities. Same-context attempts, including failed or
reserved attempts, remain consumed on resume. Reobservation under changed source
conditions is deliberately not implemented; equivalent-context limit cannot be
raised above one without defining that contract.

Discovery identity is market + sorted current need IDs, independent of query
wording. Paraphrases cannot create new actions. The proposition and market sets
are finite; counters also bound novel combinations proposed by a reasoner.

`OBJECTIVE_ESTABLISHED` means the objective's propositions are established.
`SEMANTIC_EXHAUSTION` is explicitly scoped to **current grounded knowledge and
permissions**, with the complete considered-action rejection ledger. It is not a
claim that no evidence exists anywhere on the internet. Useful remaining actions
blocked by counters, navigation depth or candidate capacity produce
`CAPACITY_BOUND_REACHED`. Adapter/interpreter failure, reasoner failure and unknown
dispatch recovery are separate stops, not exhaustion.

The current fallback is intentionally basic. It does not know every possible
useful query or unstructured navigation concept. A future reasoner can expand
grounded opportunities through the same contracts without getting truth authority.

## Trace and persistence

Every run returns initial truth, selected action/reason, considered/rejected
actions, source digest/context, proposition changes, remaining needs and final
stop explanation. Source bodies stay in bounded observations rather than being
duplicated into event entries. The deterministic harness is suitable for inspecting
individual runs without log timestamps or nondeterministic IDs.

Optional `save(snapshot)` receives a detached checkpoint before dispatch and after
observation. The engine reserves counters and action identity **before** calling
the capability. Restoring a committed observation preserves facts, attempts,
permissions and consumed budget. A pending dispatch with unknown outcome stops
`RECOVERY_REQUIRED`; it is never silently resent. Terminal checkpoints do not
restart themselves. Digest envelopes detect accidental corruption, **not malicious
tampering**. Durable atomic storage, trusted state ownership, concurrent writers
and interrupted-request reconciliation belong to a future host, not this module.

## Coexistence and validation

Infrastructure reference inspected: V2's offline network guard and storage core.
**No V2 component is imported or changed.** Only Node built-ins are reused. V3
deliberately does not inherit V2 verifier gates, query families, historical-count
stops, lifecycle eligibility, routing preferences, access-failure-only geo policy,
evidence trees, Genesis, Operations or request ledgers.

Run the complete offline harness:

```sh
node --test services/api/src/research-v3/foundation.test.mjs
```

Tests cover the requested A–K behaviors plus navigation, contradiction retention,
offer-fragment isolation, capability/access boundaries, semantic duplicates,
checkpoint resume, uncertain dispatch, every execution-bound category and the
absence of V2/network/filesystem imports in executable V3 modules. No fixtures
need production state or live providers.

Before a controlled 20-service live benchmark: implement bounded real capability
adapters with DNS/redirect/access-policy and geo-receipt enforcement; implement
source-bound unstructured interpretation and navigation relevance; connect bounded
research reasoning; supply reviewed objective/provider seeds; provide durable
checkpoint hosting and recovery; then test those boundaries offline and explicitly
authorize the separate live benchmark. V2 remains completely independent.
