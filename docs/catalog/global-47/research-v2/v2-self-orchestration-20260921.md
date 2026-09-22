# Mature Research V2 self-orchestration

Implemented and validated offline. No online research executed. Current V15 can enter the improved lifecycle directly: frozen188, reviewed104, unreviewed84, baseline275 excluded. `liveReady: true` means the bounded lifecycle can start; it does not grant the unreviewed84 authority or promise successful research.

## Root cause

The mature adaptive planner already replanned within a research objective. The expansion adapter supplied static reviewed targets, pointed replay at the original failed-run directory, separated catalog/pricing phases, and required manually authored certificates whenever a spent continuation changed. Consequently new candidate acquisitions were not automatically inventoried for later reviewed admission; phase evidence and immutable ancestry had to be assembled outside the runner. Scheduler COMPLETE was also insufficient as a final research disposition.

The reviewed-authority model itself is intentionally explicit. A successful homepage response, matching name, workbook QA tag or search result cannot satisfy ownership review. Automating that inference would weaken the reference implementation. The lifecycle reuses an existing validated exact-service/exact-host review deterministically and creates mature-schema review drafts for genuinely unreviewed ownership. It never invents a REVIEWED stamp.

## Changes to the existing path

1. Generic frozen-input adapter: consumes the existing universe, cohort, reviewed-binding document, provider worklist and research scopes. Validates frozen hashes, IDs, aliases and baseline exclusion; calls the same `reviewedTargets` → `prepareAuthorityUniverse` handoff. No V15-specific trust rule.
2. Automatic immutable continuation inventory: accounts completed same-cohort parent ledgers, verifies retained bodies/checkpoints, derives hash-bound routing memory and replay inputs, and stores a sealed snapshot. A matching invocation resumes the same snapshot/output; changed reviews/configuration derive a new child automatically. No operator-created replay certificate is required. Active/uncertain parent state fails closed.
3. Existing executor: candidate acquisitions remain untrusted. Retained successful or failed candidate attempts enter the existing explicit-review queue with source references rather than being blindly retried. Fresh candidate acquisitions use the existing public reader. Approved sources flow through `admitRetained`, `officialCandidate`, the provider registry, native body/policy validation, retained replay and the normal verifiers/interpreter. Price replay uses current safety code before accepting historical sufficiency; raw prior results remain auditable.
4. Bounded phase feedback: existing catalog adaptive research executes first; native claim verification checks identity, availability and cancellation/billing routes. Accepted availability can extend research-market scopes without fabricating availability. Catalog acquisitions are replayed into scoped pricing during the same execution. Pricing acquisitions also feed login/manage proofs and navigation back to the same catalog checkpoint. `runAdaptiveCampaign` replans after every action; feedback does not reset action counters or grant another budget. No repeated empty waves.
5. Failure isolation: uncertain service actions retain their native artifacts and stop that service for review while others continue. Ledger ceilings terminate as BUDGET_LIMITED. Hash/policy/authority failures are not converted into trusted facts.
6. Final projections: `final-dispositions.json` and `.md` distinguish scheduler execution from evidence results. JSON includes authority, identity, subscription qualification, researched/verified markets, LOGIN, management, cancellation, per-market pricing, source-bound proof references, confidence, stop reasons, human-review requirements and new request usage. No catalog promotion occurs. Missing fields remain unresolved; price absence never removes a service. NOT_APPLICABLE is not inferred from absence.

## Existing components retained

`prepareAuthorityUniverse`, `loadProviderSourceRegistry`, `officialCandidate`, `admitRetained`, native authority/body validation, `inspectLoginManage`, `mergeTargetCapabilities`, `extractClaimProposals`/`verifyClaim`, `planResearch`, `runAdaptiveCampaign`, `runOpenWebResearch`, provider navigation, public/robots reader, Tavily search/discovery, Decodo fallback, direct-provider journals/interpreter/verifier, research memory, atomic checkpoints, request charging and code/input fingerprints.

`lifecycle-continuation.mjs` inventories immutable inputs and projects reports/drafts. It does not contain a transport, alternate verifier, ownership inference engine or second scheduler. The generic CLI delegates to the existing mature executor.

## Pricing repairs

- Numeric normalization now validates one decimal separator and consistent three-digit grouping before removing separators. Adjacent decimals cannot concatenate into a manufactured price. Legitimate grouped formats remain supported; uncertain forms remain unresolved.
- Monetary-clause guards reject credit/voucher/cashback/benefit amounts as subscription charges. The guard is attached to the matching amount, so a separate legitimate subscription price is not contaminated by another card's included benefit.
- Both original retained unsafe cases reproduce the correction: no fabricated 5798.33 amount; the partner monthly credit remains retained but cannot be strong recurring subscription evidence. Provider names and price constants occur only in historical regression tests, not production predicates.
- Existing exact quarantine decisions remain active. Original evidence, prior machine outputs and interpreter receipts are preserved. Machine-strong results never become catalog defaults through this lifecycle.

## Current compatibility and preservation

The historical ledgers remain separate: **3,838**, **721**, and the completed104-provider continuation's **404** requests; total inherited **4,963**. The derived23-source reconciliation also remains untouched. All104 bindings—including Coursera and the corrected provider identities—remain unchanged.

A stale `catalog/adaptive.lock` exists in the completed104 parent. Its owner PID is absent and its completed checkpoint has no pending action; the inventory records/hashes it without deleting or rewriting it. Live owners or uncertain pending checkpoints remain blocking conditions.

207,291 existing run/binding file hashes checked: zero changes. Frozen cohort and baseline hashes continue to be enforced. Old code-bound launch fingerprints are not bypassed; the new command derives its own fingerprint and acknowledges immutable completed parents. Existing old commands/certificates retain their guards.

## Budgets and stop rules

Current hard new request ceiling: **4,072** =104 reviewed services ×36 +82 selected unreviewed homepage candidates ×4 +2 identities without a target ×0. Retained evidence can reduce actual traffic to far below this ceiling. Prior requests are never refunded or added to the new ledger as fresh calls.

Native per-objective limits remain four reads, two searches, two gated acquisitions and bounded retained reviews/turns; price market targets share the service objective budget. Direct/read/search/Decodo attempts all pass through the existing fsynced request ledger. Budget exhaustion, sufficient evidence, absent useful routes, provider policy, identity review or uncertain dispatch all stop deterministically. There is no command-triggered unbounded retry or automatic new allocation when the same completed run is invoked again.

Tavily remains discovery, not evidence. Decodo remains the existing gated alternate transport; robots denial, semantic price gaps and generic unresolved results do not authorize proxy use. Existing transient/access policy restrictions remain unchanged.

## Human-review boundary

84 current services do not have reviewed bindings. Their candidate evidence may be acquired/reused and presented, but it is not automatically provider evidence. Output `provider-review-queue.json`, `provider-binding-drafts.json` and `PROVIDER-REVIEW.md` use the existing mature review schema and per-source references. Titles/identity snippets are explicitly review leads, not ownership proof.

Where ownership, product/regional scope or identity needs judgment, a reviewer still supplies a supported reviewed entry in the configured binding document. Do this at a terminal review boundary, not during an active frozen run. Reuse the same operator command afterward; the workflow constructs the next immutable handoff itself. No new blanket approval is requested for the104.

Services without a safe provider target or defensible market scope remain explicitly unresolved/review-required. Existing market hints are investigation scopes only. Subscription qualification is established only where normal accepted evidence supports it; identity or acquisition success alone does not qualify a paid subscription. The workflow makes no promise that all dimensions will resolve.

## Validation

- Full offline suite: **2,817 passed, 0 failed, 0 skipped**.
- Focused coverage: exact reviewed candidate handoff; untrusted candidate rejection; retained-source admission into the native LOGIN verifier; cross-phase replanning without budget reset; individual failure isolation; request-ceiling termination; resume; Tavily discovery routing; normal transient Decodo eligibility; robots/non-evidence proxy rejection; immutable snapshot tampering; baseline exclusion; numeric grouping; benefit credits; both retained bad interpretations.
- Fresh baseline witness replay: **431/431**, unchanged commercial facts (430 normal indexed sources plus the existing RTL historical receipt path).
- Existing437-target routing simulation: **437/437**, zero network, immediate resume adds0 adapter calls. It reuses historical answers; it is not new online verification or a forecast.
- Offline lifecycle preflight: passed, `onlineStarted:false`, network0.
- `git diff --check`: passed.
- Frozen dependency expectations were updated only for the two deliberately changed pricing files and are backed by the new431 witness replay. Previous preservation certificates were not overwritten.

Validation artifacts: `.savlivo/research-v2/universe-expansion/mature-lifecycle-validation-20260921/`. Full-suite log: `/tmp/lifecycle-release-tests.log`.

## Operator commands

Check (offline):

```sh
cd /Users/Thomas/Desktop/savlivo-build10
node --import tsx docs/catalog/global-47/research-v2/run-mature-v2.mjs --input docs/catalog/global-47/research-v2/v15-mature-handoff-20260921/lifecycle-input.json --check
```

Start/resume manually:

```sh
cd /Users/Thomas/Desktop/savlivo-build10
node --import tsx docs/catalog/global-47/research-v2/run-mature-v2.mjs --input docs/catalog/global-47/research-v2/v15-mature-handoff-20260921/lifecycle-input.json --live
```

Output for current inputs/code: `.savlivo/research-v2/universe-expansion/runs/mature-lifecycle-63cb22a7ceb0cfbb/`.

Use existing Tavily and Decodo environment/Keychain credentials. They are checked only at live startup; none were queried or tested online here. SIGINT/SIGTERM stops after the current mature action; the same command resumes. Uncertain dispatches remain audit/review stops rather than being automatically repeated. No deployment, production mutation or push is part of this command.

Future frozen cohorts use the same input adapter/schema and mature executor, with their own manifest/universe/review/worklist/scope paths. The current188 does not need another Codex-created continuation or provider-review preparation before starting.

## Files changed

- `services/api/src/research-v2/inventory/lifecycle-continuation.mjs`
- `services/api/src/research-v2/inventory/reviewed-cohort-handoff.mjs`
- `services/api/src/research-v2/inventory/reviewed-cohort-execution.mjs`
- `services/api/src/research-v2/inventory/adaptive-campaign.mjs`
- `services/api/src/research-v2/offline-recovery/extract.mjs`
- `services/api/src/research-v2/offline-recovery/price-context-guards.mjs`
- `docs/catalog/global-47/research-v2/run-v15-mature-v2.mjs`
- `docs/catalog/global-47/research-v2/run-mature-v2.mjs`
- `docs/catalog/global-47/research-v2/mature-lifecycle.test.mjs`
- `docs/catalog/global-47/research-v2/price-safety-lifecycle.test.mjs`
- `docs/catalog/global-47/research-v2/acquisition-routing.test.mjs`
- `docs/catalog/global-47/research-v2/v15-reviewed-continuation.test.mjs`
- `docs/catalog/global-47/research-v2/v15-mature-handoff-20260921/lifecycle-input.json`

Additional outputs: this MD/JSON report, sealed lifecycle snapshots under `.savlivo/research-v2/universe-expansion/runs/lifecycle-control-*`, and the offline validation artifacts above.
