# Mature V2 Operations targeting

The manual run builder presents a read-only projection of the configured mature
lifecycle. It never expands eligibility beyond the frozen manifest. Existing
catalog services remain searchable in Services, but are not run-builder choices.

## Operator workflow

Open Overview → New research run → choose All eligible, Unresolved, Needs human
review, Reviewed providers or Retained work → optionally narrow markets and
categories → browse/search names and inspect the matching service list → choose
capabilities → Preflight → review the exact list, bounds, readiness and conflicts
→ explicitly confirm Start. Preflight does not run research. Scheduling is not
changed or enabled by this workflow.

All markets and All categories mean no filter, inside the eligible cohort.
Multiple values within a facet use OR; facets and lifecycle criteria use AND.
All matching is dynamic. Changing a filter (including search or preset) resets
manual selection to All matching and updates counts/list; the UI says so.
Individual checkboxes switch to manual selection. Clear selection disables
Preflight. Clear filters restores the broad eligible view. Pending or failed
preview requests disable Preflight; outdated replies cannot replace a newer view.
Any targeting/capability change removes the previous Start action.

Markets are the existing `researchScopes.researchMarkets`, falling back to the
candidate's project market hints exactly as the mature lifecycle does. They are
investigation scopes, not availability, origin or headquarters. Selected markets
narrow market-specific research via the existing derived researchScopes input;
provider authority and login/manage work remain service-wide. Services without
a recorded scope appear under All markets, but not a country filter. No scopes
are fabricated. Country labels come from Intl region names for actual scope codes.

Categories are recorded on frozen universe candidates, joined by cohort identity.
Labels come from the existing catalogCategories literal in the authenticated
contracts source. Missing classifications are not guessed or borrowed from a
similar baseline service. Unknown category IDs remain visible as their recorded
IDs. Current data is coarse: many candidates are recorded as Other.

Counts distinguish unique services, distinct selected service/market pairs and
retained engine targets. A service with two markets counts once as a service,
twice as market targets. Retained targets can contain catalog and price targets;
they are not a count of retained unique services or successful research outcomes.
Unresolved includes services without an explicit researchComplete=true result.
Reviewed means the existing reviewed provider handoff succeeded. Needs review
includes missing reviewed authority and explicit final human-review requirements;
selecting that preset never approves authority.

## Server contract and execution

Authenticated GET /v1/admin/v2-operations/targeting returns initial eligible rows,
facets, preset counts and a revision. POST to the same endpoint filters this model
read-only; it does not enqueue or persist jobs. The projection validates Genesis
seals and hashes of every consumed input plus the existing handoff (the native
Preflight still validates the entire protected closure), and reads subsequent dispositions
only from the configured execution namespace. It never loads the excluded
unsealed historical control snapshot. The projection is cached for 30 seconds;
Preflight independently refreshes it before checking revision and exact service
selection. It returns no raw bodies, secrets or private account information.

Preflight accepts targeting + targetingRevision + exact preview services, rejects
stale/mismatched/baseline selections, then freezes explicit service IDs and market
filters in the ordinary Operations config. Presets/search are recorded in the
Preflight audit; queued execution does not re-evaluate a dynamic query. Normal
cohort enforcement, storage checks, capability readiness, conflicts, checkpoints,
request limits and token + confirmed:true Start remain authoritative. Existing
schedule controls and LOGIN_MANAGE remain on their established contract.

An existing production blocker was exposed during integration: the mature CLI
rejected every Operations-derived Genesis selection with ACTIVE_INPUT_MISMATCH.
The CLI now explicitly permits validated content-addressed execution selections.
Only capabilities, executionServices and a narrowed researchScopes file may
vary from the sealed production input. New fields, widened cohorts/scopes,
changed lineage/source inputs and non-content-addressed selections fail closed.
The original Genesis and all protected hashes still validate. Startup and
ordinary genesis-deployment-check continue requiring the original active input.
No legacy controller fallback or new research engine is introduced.

Direct and Tavily are the manual-builder defaults. Decodo, Browser and Groq are
off. Availability is displayed separately from permission. Enabled capabilities
are eligible, never forced. Existing transport/authority policies remain intact.
No new frontend module/deployment allowlist change is required.

## Validation

Synthetic tests cover facets/presets, OR/AND combinations, counts, unknowns,
selection, stale previews, permission defaults, explicit confirmation, baseline
injection and frozen execution scopes. Storage tests cover derived Genesis input
validation and rejection of source/cohort/scope tampering. Real offline validation
uses a separate restored certified export with network and original research
source access denied; it never starts a run or changes the production Genesis.

Validated against the initial certified production fixture: 188 eligible, 275
baseline excluded, 104 reviewed, 84 needing review, 161 retained targets across
104 services. Its 25 recorded markets cover 106 service/market pairs; 94 services
have no recorded scope. Denmark is not currently a recorded scope; 165 candidates
are recorded as Other. These are fixture observations, never runtime constants.
Norway + Sweden + Other + Reviewed selected Actic, Klarna Memberships and Life360
(three services/four pairs); native offline Preflight and full-cohort Preflight
passed with zero research requests/jobs. All 32,991 protected files in the isolated
restore still matched their hashes. Regression suite: 299 passed; API suite: 407
passed; build and typecheck passed. Tests used a network-denying OS sandbox. The
API suite used `node --import tsx --test` with the package script's exact test list
because the tsx CLI's IPC socket is disallowed by that sandbox.

To repeat the real read-only fixture test, set SAVLIVO_TARGETING_FIXTURE_ROOT to
an isolated certified restore and SAVLIVO_TARGETING_FIXTURE_INPUT to its relative
Genesis input, then run the targeting tests. Without those variables only this
optional real-fixture test is skipped; synthetic tests remain self-contained.

The Admin transport allows 150 seconds for Preflight/confirmed Start (the existing
native check itself is bounded at 120 seconds), 30 seconds for authenticated
initial targeting, and keeps other requests at 10 seconds. Confirmed Start uses
its freshly validated plan once, then rechecks storage/conflicts at enqueue; it
does not run the same expensive native validation twice. Recognized stale-preview
errors give an actionable refresh message without exposing raw server errors.

### Per-run research tools

Each manual mature run exposes editable Direct, Tavily, Decodo, Browser/Web and
Groq permissions, with explicit Allowed ON/OFF text. Server availability is
separate: selecting an unavailable tool does not configure it or substitute
another tool. Preflight applies the existing conditional readiness checks and
shows Disabled or Enabled with readiness/reason. Decodo remains policy-gated;
Browser remains bounded resource discovery; Groq remains grounded interpretation.
Actual usage is measured in run details, never inferred from permission.

Changing any permission removes the old confirmation and invalidates pending
Preflight responses. The UI also rejects a Preflight response whose permissions
differ from the submitted five booleans. Start sends only the confirmed token;
the server owns the frozen configuration. Scheduling settings are unchanged.
