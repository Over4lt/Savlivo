# Live Operations presentation

This is an Admin-only read projection. No execution, capability, pricing or Human
Review rules change. The existing bounded `monitorJob` remains the status clock.

The card is mounted above navigation/history and keeps stable nodes. Only changed
text/classes are updated. The polite announcement contains state/activity transitions,
not every counter refresh. Polls never invoke render(), reload targeting or replace
workspace controls. Navigation and explicit Refresh remain deliberate full-view actions.

## Existing authorities

- `/jobs/:id`: actor-owned status, terminal flag, validated worker phase, services,
  start/update/finish times and request ceiling. QUEUED preparation can report
  “Validating execution”; RUNNING may report “Lifecycle execution”. No offer-level
  activity is inferred.
- `/runs`: bounded initial active discovery and jobId-to-run identity resolution.
- `/runs/:id`: measured request/capability accounting, lifecycle completion/review
  counts and the existing bounded service page. Identity must match the tracked job.
  Result reads are independent of job polling failure and discard stale responses.
- Counters use `requests`, `bounds.totalRequests`, `capabilityUsage.directRequests`,
  `tavilyRequests`, `decodoRequests`, `browserExecutions`, `groqCalls`. Where the
  capability ledger is absent, Direct/Tavily/Decodo may use acquisitionMetrics
  page+robots, searches and Decodo requests. No Browser zero is inferred from routes.
- Pricing/markets use the returned service page; partial pages are labelled. Pricing
  ESTABLISHED is not relabelled V2_VERIFIED. No verified-offer total is invented.

Queued / Running / Execution complete display only recorded state/timestamp support.
Validation is activity, not a fabricated completed pipeline step. Elapsed duration
uses persisted timestamps and says “as of status update” while unfinished.
COMPLETE means execution terminated, never research completion. A delayed final run
snapshot is explicitly marked pending. The result stays visible with View results.

Run details use Summary, Research, Pricing, Evidence, Gaps, Human Review and collapsed
Technical sections. Details are explicitly snapshots; the live card updates without
collapsing an open artifact or replacing draft controls. Run projections and raw
technical IDs remain available. Historical/external runs remain accessible and read-only;
automatic job monitoring is only for owned Operations jobs with an actual job ID.

Unknown counters/market/pricing/review fields remain unreported. “Fresh evidence”,
verified-price counts and offer-level activity are omitted because the existing live
contract does not establish them. Permission, readiness and measured usage remain
separate. This view creates no research lead and changes no Human Review snapshots.

Colors have text markers/labels. Only transitions use polite announcements. Reduced
motion disables the active pulse; narrow layouts stack lifecycle items.
