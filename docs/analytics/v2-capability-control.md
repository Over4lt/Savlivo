# Mature V2 per-run capabilities

Operations manual and scheduled jobs freeze five explicit booleans in `config.capabilities`:

```json
{"direct":true,"tavily":true,"decodo":false,"browser":false,"groq":false}
```

CLI lifecycle inputs accept the same object. Existing inputs without it resolve to Direct/Tavily/Decodo allowed and Browser/Groq disabled. New Admin jobs persist the explicit resolved set. No wildcard is accepted. LOGIN_MANAGE permits only Direct and Tavily.

Permissions do not authorize authority, policy escalation or extra network budget. Disabled routes are blocked both in planning and at the dispatch boundary. The Decodo access-gap classifier is unchanged. A rendering gap or robots denial cannot authorize proxy use. Tavily-only runs may discover leads but cannot read them through disabled Direct. Decodo-only runs cannot manufacture a fresh permitted-access proof.

Preflight reports conditional availability without provider requests. Tavily requires `TAVILY_API_KEY`; Decodo requires `SAVLIVO_DECODO_USERNAME` and `SAVLIVO_DECODO_PASSWORD` and its existing runtime approval/configuration checks. Groq requires `GROQ_API_KEY` and `SAVLIVO_PRICE_SEMANTIC_MODEL`. Disabled capabilities require none of their credentials. Browser requires a local Docker daemon, the existing pinned image and Chromium sandbox; preflight checks daemon/image presence without launching Chromium. Native sandbox qualification occurs at actual use and fails closed. Render availability is not established by this implementation.

Browser reuses the bounded historical CDP/Docker machinery, isolated with no external networking. The reusable modules were adapted into the current capability directory; no historical autonomous controller is imported. It requires intact reviewed source material, a rendering gap and exhausted static resource discovery. Resource reads require exact reviewed host authority and the existing robots reader. Retained resources can execute with Direct disabled; missing resources cannot implicitly enable a transport. No consent actions, authentication, arbitrary browsing, OCR or rendered-DOM evidence. Screenshots are diagnostic only, capped at 16 million pixels and 6 MB decoded PNG bytes.

Groq is pricing-only. The bounded provider span, original source hash, container hash/offset, model and policy are recorded. Existing quote/amount/currency validation rejects unsupported output. An offline child reopens original journal receipts and applies the existing mature `deriveEvidence`/`verifyCandidate` gate to proposals. Model text never replaces provider text or authoritative fields. Proposals that the verifier cannot independently establish remain unresolved even when their quotations are valid; this is not a general translation-based verification override.

The durable `capability-ledger.jsonl` reserves attempts before dispatch. Initial ceilings: Browser 1/service and 20/run; Groq 2/service and 40/run. All external resource/API requests also consume the existing global/service network allowance. Groq retains 6 KB input, 24 KB parsed output, 32 KB HTTP response, 2,000 output tokens and 20-second timeout, with SDK retries disabled. Browser retains the historical execution/resource ceilings.

Ordinary resume preserves permissions and model/budget fingerprint, reuses completed capability outcomes, and never retries uncertain in-flight work automatically. Schedule edits affect future jobs only. Historical artifacts without explicit usage remain unknown rather than inferred. Run details expose allowed capabilities separately from request counts and safe capability event summaries; raw prompts and credentials are not exposed.

No provider research, corpus migration, baseline/cohort edits or historical-ledger mutation is needed to deploy this control. Keep production feature gates off until ordinary deployment checks pass.

## Research tools readiness

The summary and Preflight share `capabilityAvailability`. Its existing `available`
boolean remains the enablement prerequisite; additive `readiness` is AVAILABLE,
CONDITIONAL, UNAVAILABLE, or NOT_CHECKED (disabled Browser is not probed during
Preflight). This is not a credential-authentication test or actual usage.

Direct is supported locally. Tavily requires its API key. Decodo requires both
credentials and reports CONDITIONAL: runtime approval/configuration and documented
access/geo eligibility remain checked by the existing execution path. Missing
credentials now have a distinct unavailable reason rather than the misleading
“validated at use” message. Groq needs its key and an explicitly configured valid
model identifier; no model is selected by the UI. Browser reports CONDITIONAL
only after the existing local daemon/image probe succeeds; native sandbox checks
remain at use. No general interactive Browser support is implied.

Research tools displays permission ON/OFF alongside readiness even when healthy.
Unavailable OFF controls are disabled. A previously stored unavailable ON remains
visible as ineffective and can be explicitly switched OFF; rendering never mutates
that snapshot. Bulk enable selects only backend-available tools, including
conditional ones. New Direct/Tavily defaults are ON only when available. Preflight
still independently rechecks the selected permissions and blocks unavailable ON.
Run details continue to display the frozen permissions and measured usage separately.

Production Browser requires the existing local Docker binary/socket, pinned image
and sandbox support. Installing a new server runtime is outside this change.
Production Groq requires `GROQ_API_KEY` and `SAVLIVO_PRICE_SEMANTIC_MODEL` chosen by
the operator. Repository checks do not prove current Render environment state.
