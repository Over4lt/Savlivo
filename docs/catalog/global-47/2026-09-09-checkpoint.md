# Global catalog audit and conservative expansion

Starting revision: **918838d058837ec252b8b89e4384196d44f450ad**, branch `build10-final`, 9 September 2026. Starting tracked tree was clean; unrelated `.htaccess` and `bilder/` were present and untouched. Header/plan-card work from that revision is preserved. No staging, commit, push, deployment or activation belongs to this work.

## What this audit does and does not establish

All **47 target markets** have a configuration, existing-coverage and candidate-gap review in [the scorecard](country-coverage.md) and [machine-readable markets](markets.json). [Candidates](candidates.json) lists country/service investigations; [evidence](evidence.json) distinguishes subscriber, usage, distribution and provider facts. Historical catalog documents are unchanged.

**The deep country-level significance/availability census remains incomplete.** The candidate scope is not a verified relevance count. Many local services still need current paid-product, ownership, plan, route and price evidence. Unverified fields are null, not invented values. Tier counts are conservative, evidence-backed editorial lower bounds, not a complete list of essentials. In particular, zero identified Tier 1 does not establish that a country has no large local services. Group subscribers, free viewers, targets, forecasts and platform distribution are not country paid-subscriber counts. No market is certified READY under the new standard.

- 30 existing selectable markets: **NEEDS_WORK**, retained without removal.
- 16 proposed markets: **RESEARCH_BLOCKED**, not activated.
- Kuwait: **DO_NOT_ACTIVATE** pending money precision and market evidence.
- No new country/currency configuration. All 47 requested mappings are recorded, including the five missing runtime definitions QA/EG/KW/CL/CO, without pretending mappings confer readiness.

A four-service launch catalog can have 100% priced coverage and still miss its country's essential video, sports, publishing and audio services. The scorecard's price denominator is the current offered catalog, not an imaginary complete universe. The baseline has 364 registry results and 393 single-source results. Single-source output is preserved but is not promoted to verified provider pricing. No exhaustive live refresh of historical prices was performed.

## Implemented: Storytel Norway

One canonical addition, `storytel`, Books & Audiobooks, explicit **NO-only** new-addition availability. No availability inherited elsewhere. Alias `story tel`; existing catalog, manual search and deterministic AI resolution consume the same identity.

[Provider group Q2 2026 reporting](https://www.storytelgroup.com/en/?p=5089) establishes meaningful subscription scale: 2.75 million group paying subscribers, including other group brands. This is not a Norway subscriber count. The localized recurring product supplies country relevance; this audit assigns Tier 2, not unsupported Norwegian market leadership.

[Official Norwegian subscriptions page](https://www.storytel.com/no/subscriptions) supplies matched product SKU, brand, `areaServed: NO`, `priceCurrency: NOK`, recurring base-billing currency, ordinary price and plan semantics. A minimal factual snapshot with source hash and observed date is [stored here](storytel-no-evidence.json). This is not a claim of independent source agreement: JSON-LD and base-cart data come from the same provider page.

|Plan|Ordinary NOK amount|Internal hundredths|Scope|
|---|---:|---:|---|
|Basic|149|14900|20 hours, one account|
|Premium|189|18900|50 hours, one account|
|Unlimited|219|21900|Unlimited, one account|
|Family Unlimited (2 kontoer)|289|28900|Unlimited, two accounts|
|Family Unlimited (3 kontoer)|349|34900|Unlimited, three accounts|

Only direct recurring snapshots are added. The provider describes one-month pricing and 30-day charges: Savlivo's existing monthly normalization does not introduce an automatic calendar-month renewal calculation. The user still supplies the actual renewal date. No annual amount, student discount, trial, sale price, Apple, Google or carrier amount is inferred. The page's expired September 7 campaign is deliberately excluded; campaign-free base prices agree with ordinary price specifications. Future refresh must recheck regular prices rather than using the page's headline offer.

Swedish, Finnish and Dutch structured pages were also inspected and expose explicit SEK/EUR base billing, but their different hour/family plan catalogs are **not implemented** in this batch. Do not infer identical Premium/Family semantics from equal product labels. The wider Storytel rollout remains ADD LATER until each market's full identity, offer and billing evidence is retained and tested.

The pricing-adapters.ts diff is five data rows and one registry resolver entry, following the existing Viaplay pattern. No network parser or protected resolver change. The registry-only raw fallback omitted explicit verification metadata; routing the new service through the existing resolver preserves `verification: registry`. This is not a new authoritative live source and cannot replace another service's output.

Management uses the [official cancellation instruction page](https://support.storytel.com/hc/en-001/articles/360010486719-Cancel-your-subscription), not a guessed account URL. It distinguishes website and app-store billing. Only direct is selectable in this initial catalog addition. Store availability/prices were not independently established for Norway. No pause claim, credentials, automation or browser-close status inference. Existing capability-based iOS browser routing is untouched.

## Identity and freshness findings

- **Showmax:** official 2026 discontinuation announcement; reject new standalone addition pending a verified current replacement product. Do not infer DStv package price.
- **BluTV → Max → HBO Max:** BluTV transition in April 2025, HBO Max branding in July 2025. No duplicate slug added. Existing `max` plus `hbo max` alias retained; coordinated database/display-name refresh is deferred, not silently treated as current branding.
- **K+ Vietnam:** provider cessation/refund notice after December 2025; reject standalone new addition.
- **Viaplay:** current official core offering is Nordics and Netherlands; Poland exit completed June 2025. Partner-carried Viaplay Select is not standalone country availability. Norway remains the only implemented launch market; do not extend old country lists.
- **Sky X:** announced WOW transition on 30 September 2026 is still future at audit date; do not create two subscriptions from one identity.
- **iWantTFC → iWant:** June 2025 rebrand; separate free and paid tiers before adding.
- **Voyo Czechia → Oneplay:** do not apply the Czech transition to Romanian VOYO.
- **Optus Sport:** assets/rights moved to Stan Sport; no legacy standalone addition. **Hubbl** hardware/platform branding alone does not establish a recurring subscription.
- **Readmoo:** ebook purchases do not establish recurring plan semantics; deferred/not suitable for automatic subscription catalog without such proof.
- **ViX:** current help distinguishes legacy renewals and closed-to-new-subscriber tiers. Historical offers cannot be reused as current normal plans.

Sources and evidence limitations are recorded per finding in evidence.json. Rejected means rejected for this canonical batch; historical user-entered records are not deleted or hidden.

Required global gaps investigated: Nintendo Switch Online, Apple Arcade, Deezer, Storytel, Kindle Unlimited, Discord Nitro and Duolingo Super/Max. Only Storytel NO passed the entire retained evidence/implementation chain here. Nintendo membership evidence is older (2024); local recurring plan and billing proof remains necessary. Deezer has strong French subscriber evidence but country offer/route snapshots remain to be validated. Apple Arcade has localized recurring offers but no newly imported price. Nitro/Kindle/Duolingo global product existence is not universal country availability. No filler added.

## Billing, availability and currency limitations

[Vidio's August 2026 support table](https://support.vidio.com/support/solutions/articles/43000789870-berapa-harga-paket-di-vidio-untuk-saat-ini-) separates web/Google prices excluding VAT from Apple prices including VAT. Platinum's 30-day amounts differ (Rp49,000 versus Rp55,000). No amount is imported: taxes, recurring renewal, country/ISO currency identity and plan/device distinctions need validation. Singtel/Swisscom/COSMOTE and other operator offers likewise must not inherit standalone prices. Included/unknown-effective-price bundles remain a model limitation; no fabricated zero or ordinary direct price is substituted.

Historical broad-default catalog availability is a **selection policy**, not evidence that every service is currently sold in every existing country. It remains unchanged for all old service/market pairs. New-addition eligibility now fails closed for unknown services and non-selectable countries. Storytel has an explicit country allowlist. A future activation still requires an explicit service allowlist and evidence, not simply adding an ISO definition. Saved subscriptions are filtered by subscription country, never by catalog new-addition eligibility.

Money remains stored in hundredths, independent of ISO display conventions. JPY/KRW/VND/CLP fractional stored values are preserved; COP stays in hundredths. KWD can display stored hundredths with three-digit formatting but cannot store genuine 0.001 units. No precision migration or 100x reinterpretation. Integer range, grouped input such as `59.000`, and localized provider parsing remain new-market blockers. No FX, prices or country definitions added merely to bypass these blockers. Arabic/RTL is a separate unimplemented localization decision, not implied by candidate markets.

## Focused compatibility improvements

- Search ranks normalized name exact, prefix, token prefix, substring, then aliases; no aggressive fuzzy matching. Foreign explicit searches remain discoverable with the existing unverified-availability warning.
- Picker retains search, manual addition, service logo/name/chevron, all available services and static category headings. Removed horizontal interactive category chips as requested. Header/status/plan card remains unchanged.
- A verified remote AI scoping defect was fixed: missing/malformed selected-country context previously sent all owned subscriptions. It now sends an empty portfolio, preserving general assistant response behavior and correctly scoped requests. No model/provider change; no raw conversation logging.
- Existing account, subscription transport, Build 12 manual compatibility, billing, IAP, language preferences, reminders, savings and PDF behavior unchanged. PDF still explicitly derives `reportItems` from `subscriptionsForMarket(items, selectedCountryCode)`; shared EUR is never a country identity.

## Database prerequisite — not executed in production

New **016_add_storytel.sql** inserts only the Storytel service identity, transactionally and idempotently. It requires the existing `services` table and unique slug constraint; no old migration altered. Existing rows and user data remain unchanged. The normal migration list includes 016 for coherent fresh/local setup, but **do not use the full production migration runner to rerun already-applied migrations**.

After separate approval, an operator must review/apply **016 only** before deploying clients that create canonical Storytel records. Until then local catalog UI is not proof production DB can accept the service. Normal DML/index-key locking applies; no scan or rewrite of subscriptions. No down migration is invented: a service with referenced subscriptions must not be deleted. Code rollback may leave an unused harmless seed; existing Storytel records require a client capable of displaying their identity. Local disposable PostgreSQL tests prove rerun safety, old rows preserved, and create/edit/delete round trip. No production connection or production migration occurred.

## Next evidence work

Complete the local Tier 1/2 census and price route snapshots country by country, prioritizing the missing essentials in the scorecard. Preserve source date, regular-vs-promotion distinction, country/currency identity, product identity and taxes. Do not mark READY until that work demonstrates breadth and >=80% verified local price coverage against a defensible relevant-service universe. Add explicit availability and additive service seeds in reviewable batches. The current 47-market triage is a research backlog with one verified addition, not a claim that the complete deep research mission has been exhausted.
