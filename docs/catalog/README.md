# Global service discovery and catalog foundation

Baseline: 60362c6, 2026-09-08. This is a local, reviewable batch, not a release.

## Scope and evidence limits

The source-of-truth selectable configuration contains 30 markets, 42 service identities, 363 registry rows and 756 offline pricing results representing 106 distinct service/plan names. The baseline captures currencies, exact registry rows, offline plan/route results, billing selections and deduplicated management destination profiles. Baseline tests: API 300, mobile 84. The preceding 77/77 international live check is historical evidence, not a claim of fresh recertification of every provider in this task.

[Country coverage](country-coverage.md) audits every selectable market. [Machine-readable coverage](country-coverage.json) and [service audit](service-audit.json) distinguish production support from research candidates. Ninety-one official candidate endpoints were probed, in addition to inspection of all 42 existing identities. This is broad discovery triage, not exhaustive verification of 91 services' prices, ownership, country availability or management capabilities. Unknown fields remain unknown. Candidate-country associations are editorial investigation scope, not market-share rankings or verified availability. Multi-country providers need country-specific follow-up; one localized homepage is not evidence for every listed country.

All requested categories were considered: video/local OTT, sports, music/podcasts, books/audio, gaming, cloud, news/magazines, comics, telecom/bundles and other. Major omissions are local video/sports, news/publishing and carrier-effective pricing. Existing cloud/music coverage is substantially stronger. Japan/Korea/Mexico/Vietnam/Indonesia received discovery leads but remain non-selectable; Russia is excluded. Some candidate URLs failed or delivered only app shells. That does not establish service unavailability.

## Implemented service: Viaplay Norway

One deliberately conservative local addition:

- Canonical identity `viaplay`, display name Viaplay, video/sports metadata; Norway-only launch availability.
- Launch plan **Viaplay Film & Serier**, product **1234**, ordinary **169 NOK/month**, no minimum contract. This is the film/series plan, not a sports package or ad-supported variant.
- [Official Norwegian product page](https://viaplay.no/no-nb/) exposes NEXT_DATA product ID/name, numeric price, `regionCode: no`, `requiredContractDuration: 0`, recurring display wording and provider checkout identity.
- [Official matching offer](https://viaplay.no/no-nb/lyko) explicitly identifies the ordinary post-trial amount as 169 NOK/month. The trial is not recorded as the price. Product proof and this explicit ISO currency source jointly establish the snapshot; the price alone does not identify the plan.
- [Current official cancellation help](https://help.viaplay.com/nb/cancel-package/) documents account navigation, cancellation effective at the paid/committed term end, undoing scheduled cancellation and separate Apple/partner management. The older indexed help URL returned 404, so it is not used.
- Direct route: one verified registry snapshot, **16900 stored hundredths**. No new network parser or live authoritative adapter is introduced. The existing resolver labels this registry-only output correctly; provider outages cannot remove it.
- Apple and carrier selections have independent management evidence, but no verified Apple/carrier prices or claim that new Apple signup is currently available. No Google Play/Amazon route added for Viaplay.
- Direct management goes to the official **instruction page**, not a guessed account destination or cancellation API. It explains the next steps. Existing iOS URL capability rules apply automatically; Apple remains a store link, carrier remains provider-specific with no guessed URL. Pause is not advertised. Browser closure still only triggers Savlivo's existing user confirmation.
- `011_add_viaplay.sql` adds the DB service identity idempotently and is listed in the existing migration runner. **No migration was executed. Apply it as part of a future approved deployment before exposing this service to users.** Tests use mocked repository DB calls; no real service creation round-trip is claimed.

The only `pricing-adapters.ts` additions are this verified row and a registry-only entry using the existing resolver. The concrete blocker was the lack of any Viaplay price/service output and explicit verification metadata for the new catalog candidate. No old row, resolver, persistence, Google One, iCloud, provider parser or fallback algorithm is changed.

## Discovery findings and deferrals

Detailed recommendations and exact probe outcomes are in the service audit. Examples:

- Nordics: TV 2 NO/TV4/Ruutu pages need usable plan data; TV 2 DK and Podimo show recurring offers; DN and HS mix ordinary, promotional and bundled pricing. Storytel warrants a separate localized plan audit. Viaplay's sports commitments and ad-supported plan are not inferred from the chosen film plan.
- DACH: RTL+ has distinct ad-supported/ad-free/HBO bundles; WOW has term commitments; blue Sport has monthly and discounted annual offers. Sky X announces migration to WOW on 30 September, so avoid a duplicate identity without migration analysis.
- France/Italy/Iberia/Benelux: CANAL+/Filmin/El Pais/Publico requests were blocked; Le Monde, Molotov, NOW, Movistar, Streamz, Videoland and NLZIET require bounded plan/route proof. Broad availability is not inferred from the brand.
- Poland/Czechia: Player/Oneplay/Onet/Denik N are research candidates; the Go3 domain alone did not prove Polish subscription identity. Seznam Medium did not establish a recurring paid subscription.
- UK/Ireland: NOW offers contain commitments and add-on trials; the Irish Times response was for international subscribers and is not domestic Irish pricing authority. ITVX direct fetch failed.
- AU/NZ: Stan's official help provides plans and cancellation steps, but explicit AUD identity was not closed in this pass. Kayo/Binge/Neon/Sky Sport Now/TVNZ require further structured offer/interval evidence; event passes are not automatically recurring subscriptions.
- India/SEA: JioHotstar/Sony LIV/ZEE5 and local sports platforms need reliable public plan data. Singtel CAST explicitly distinguishes 30-day partner subscriptions; Astro shows contract bundles. These must not inherit direct-provider prices.
- HK/TW/TH/PH: myTV SUPER/Now TV/Hami/AIS/TrueID/iWant/Cignal are high-value gaps. KKBOX fetching failed. Readmoo ebook purchases and Bilibili Manga chapter/coin products were not established as recurring plans.
- UAE/Brazil: Shahid's selected endpoint failed; OSN+ documents card/operator routes without a verified local plan snapshot; Anghami failed. Globoplay/Premiere/UOL need structured recurring evidence.
- US/China: NYT/Sling/SiriusXM and WeRead/manga need plan/payment-model proof; existing China catalog and estimates remain intact. NRK viewing and other unproven free/purchase-only products are not added as paid subscriptions.

## Money model and separate fix

Despite the property name `monthlyPriceMinor`, the existing model consistently stores **hundredths of a displayed currency unit**, not ISO-specific minor units: mobile multiplies by 100, registry adapters multiply by 100, display divides by 100, JSON transmits numbers, PostgreSQL stores integer values, savings operate on those stored integers. This batch does not reinterpret existing amounts or migrate data.

`formatMarketMinor` now permits two fractional digits when Intl defaults to zero. Whole values still render without unnecessary decimals; stored fractions no longer disappear. Stored subscription display uses the same helper. PDF output already explicitly allowed two fractional digits and remains unchanged. All 30 existing currencies preserve their original output. Tests cover JPY/KRW/VND/IDR, whole amounts, one stored cent, fractions and large values.

Re-evaluation after the display fix:

| Market | Remaining activation blocker |
|---|---|
| JP/JPY | Local Apple/Google evidence exists, but localized product parsing and iCloud support-country validation remain unimplemented. No complete tested launch registry. |
| KR/KRW | Apple Music lacks the existing three-plan Student gallery; Spotify has different plan sets. No full verified route-specific launch catalog. |
| VN/VND | Dot-grouped provider amounts require scoped parser handling, and iCloud country support is missing. No full fallback/adapter proof. |
| ID/IDR | Display blocker resolved. Prior scratch evidence is promising, but grouped Rp amounts, localized adapters, input round-trip and a complete fallback batch still need focused implementation/tests. No IDR production parsing was added here. |
| KW/KWD | Genuine thousandths cannot survive `Math.round(amount * 100)`. API accepting a number does not repair input precision. Google/Spotify Kuwait examples used USD, not KWD. Requires an explicit storage/precision product decision; no activation. |

The integer DB model also has a finite maximum amount; no arbitrary large-price support is claimed. Grouping input such as `59.000` is not universally distinguished from decimal input. Do not activate markets on formatting alone.

## Canonical catalog and AI boundary

`packages/contracts/src/catalog.ts` is the shared identity, alias, category, selection-policy and billing-selection source. Existing mobile arrays/functions were extracted with their values and behavior preserved; baseline regression checks every old identity, category order, billing selection and all 30 countries. The existing picker imports this source. It still uses the current Build 12 UI; no giant-catalog search UI was rolled out.

1. **Identity:** canonical slug/name/aliases in shared contracts. Existing DB identities remain migration-managed; the new migration is an explicit deployment prerequisite, not a competing runtime search list.
2. **Availability:** one shared selection policy preserves legacy and verified expansion allowlists. Candidate relevance is not availability. Full explicit search can find unavailable-in-view catalog identities without claiming local plans exist.
3. **Categories:** conservative multi-category metadata. Legacy display groups are derived so current labels/order remain unchanged.
4. **Relevance:** selected-market eligibility is an initial ordering signal, followed by alphabetical order. No invented popularity/adoption ranking. Future curated suggestions must carry editorial provenance.
5. **Manual search:** `searchCatalog` normalizes case, whitespace, plus/slug spelling and known aliases. No aggressive typo-to-provider resolution. Exact matches outrank partial matches; unknowns return no result.
6. **Scale:** normalized keys are built once, queries scan metadata and return at most 50 items (default 20). Hundreds/thousands can remain in the index without rendering all rows. Profile before introducing a server index; larger catalogs should use server pagination/versioning and a virtualized result list.
7. **AI:** use the same search helper and `resolveCatalogCandidate`; do not create a model-only service table. Existing AI subscription-entity matching remains separate because it resolves already-saved account records, not a new catalog.
8. **Candidate:** exact service match plus country/currency context. Plan, billing and amount prefill only when explicitly requested and backed by matching strong pricing rows; weak/mismatched/conflicting evidence leaves fields empty. No second plan/price table exists in the catalog.
9. **UI handoff:** future handler opens existing Add Subscription form with the candidate service, resets stale fields, verifies current-market identity, then applies only safe prefill. Actual interactive AI navigation is not wired in this batch.
10. **User fields:** unknown/ambiguous plan, unproven billing route, actual amount, renewal date and any absent required information remain for user selection. The user reviews and confirms creation.
11. **Unknown service:** helper returns `unknown`, never Netflix or a fabricated identity. The old `beginAddService` fallback to the first catalog entry was removed. A reproducible stale-draft bug was also fixed: changing service or billing route now clears the previous plan/price before applying any independently available price for the new selection. Existing saved subscriptions are not changed. **True arbitrary manual-service creation does not currently exist**: API requires a seeded service FK. Current manual support means manual price/plan entry for known services. A proper unknown-service path is a next-task prerequisite, not something this report claims is present.
12. **Isolation:** pricing candidates require exact country, configured currency, service, plan and billing route. Existing selected-market subscription/AI/PDF scope is unchanged; no account splitting or subscription migration.
13. **Future services:** add metadata, independent evidence, registry/adapter coverage where justified and a DB migration. Search/categories/browser capability need no service-specific UI branch. Existing billing-route and market rules still gate selection.

The helper has no mutation callbacks and always requires confirmation. Existing assistant responses classify/interpret requests; subscription saves/status changes remain explicit UI actions. No new silent creation/deletion/cancellation path was introduced. This is a safe foundation, not a completed conversational Add Subscription experience.

## Bundles and existing limitations

Official Viaplay documentation separates direct subscribers from Apple and TV/carrier customers. Singtel CAST sells partner-specific 30-day subscriptions; Astro includes contract bundles; Telenor Streamix/T-We centralizes selected entertainment. Individual bundled services must not be assigned their ordinary standalone prices.

The DB can store carrier route and nullable/zero amount, but the current mobile form requires a positive price and treats missing/nonpositive prices as incomplete. There is no parent bundle, included-with-plan status, marginal cost, entitlement linkage, or explicit unknown-effective-price state. Therefore a true included/free component cannot be represented faithfully by the normal form. Proposed later addition: separate actual bill from included entitlements, with `priceBasis` (standalone/discounted/included/unknown) and optional parent subscription; exclude unknown and included components from fabricated savings. Do not implement by copying direct prices or setting arbitrary zero values.

## Regression and verification

Final checks: **302 API tests passed, 91 mobile tests passed, both TypeScript checks passed, API build passed, production iOS Hermes export passed (3.64 MB bundle)**. A separate routing review with Linking stubbed compared all **6,300 baseline country/service/billing cancellation destinations**, plus three Viaplay route cases; all matched. Actual Viaplay adapter output returned the exact 16900 NOK direct registry row. No new live authoritative parser is claimed. New tests cover canonical preservation, aliases, unknowns, country-aware search, strong plan evidence, conflict/weak-source rejection, route isolation, Viaplay provider proof and source outage, all 363 registry rows and 756 pre-existing offline price results, and zero-decimal display precision.

No full live refresh of every old provider, physical iPhone acceptance, real database migration/round-trip, or visual PDF acceptance was performed. Existing generalized browser tests remain; exact approved Norwegian instruction and browser-close confirmation behavior are unchanged. Remaining release acceptance: verify new catalog import/bundling, Viaplay instruction navigation and return, Apple/carrier behavior, adding/editing after the migration, selected-market switching and representative PDF formatting on iPhone.

## Next task: Scalable Subscription Catalog & Discovery UX + AI Integration

1. Define and implement a genuine unknown-service/manual record path with owner-approved display-name storage, duplicate rules, no fabricated provider capabilities and an idempotent API contract. Preserve known-service FKs and old records.
2. Add a versioned catalog API view from shared metadata plus the existing regional pricing resolver. Return evidence status, country/currency, route, billing interval and freshness; never merge routes or synthesize plans.
3. Add immediately available search to Add Subscription, bounded/virtualized results, category filters and explicitly editorial market suggestions. Keep full exact search available; explain unavailable local pricing and offer manual amounts for known services.
4. Introduce one tested `openAddSubscription(candidate)` handler. Validate active country/currency and catalog version, clear stale form state, keep unknown fields blank, handle duplicate service/route policy and preserve cancel/back context.
5. Have AI extract only a service query and optional user-stated plan/route; resolve through the same helper/API. Ambiguity presents choices. No direct API writes from model output. Never treat generic “Premium” as a verified plan ID.
6. Feed both paths into the same review/confirm/save UI. Persist only on explicit confirmation; add idempotency to prevent repeat saves. Unknown service goes to the real manual path from step 1.
7. Test stale async responses, switching market while AI/search is pending, wrong currency/route, ambiguous aliases, unavailable prices, duplicates, offline API, cancellation/back, zero/unknown bundle prices and user-confirmation enforcement.
8. Profile search against a synthetic thousand-entry catalog and use debouncing/virtualization; add server indexing only when measured. Do not preload every service logo or render every result.
9. Run full regressions/export and physical iPhone acceptance before any separately authorized Build 13/release work. No build bump, push, archive, upload or TestFlight action belongs to this batch.
