# International expansion after f2340dc

Research and local verification: 2026-09-08. No push or deployment.

## Result and threshold

Seven markets activated: IN/INR, SG/SGD, HK/HKD, TW/TWD, AE/AED, TH/THB, PH/PHP. Selectable markets grow **23 → 30**. Every prior market remains in its original order. Russia is excluded.

Threshold unchanged: >=4 established services, >=10 verified monthly plans, >=2 provider organizations, music/video/cloud, explicit country/currency/product identity, correct billing route, registry fallback and app compatibility. Each new market has **4 services / 11 plans / Apple + Google**. These are deliberately bounded launch catalogs.

Per market: Apple Music Individual/Family/Student, standalone Apple TV, iCloud+ 50 GB/200 GB/2 TB/6 TB/12 TB (9 Apple-billed prices); Google One Storage 100 GB/200 GB (2 direct-billed prices). No price is copied to another billing route. No Spotify, Apple One, Google AI, 2048 or 5120 feed-key mapping is added.

**77 registry fallback records added; 28 newly enabled live Apple Music/TV prices.** The other 49 prices use already-working iCloud/Google adapters, now backed by registry snapshots and exposed in supported catalogs. All 19 candidates had zero baseline registry rows; API recognition alone was not treated as readiness.

## Official evidence

- [Apple iCloud pricing](https://support.apple.com/en-us/108047): country-named sections, explicit ISO currencies, exact storage tiers, monthly billing.
- Local Apple Music/TV pages listed below: exact canonical URL and og:locale, explicit currency tokens, stable Music gallery plan IDs, standalone TV monthly cards. Hong Kong uses Apple's English storefront because its Chinese Student card omitted explicit recurring wording.
- Existing provider-owned Google feed under `https://one.google.com/intl/ALL_{country}/about/feeds/pricing_2026_07_28.json`: COUNTRY_CODE and CURRENCY_CODE match independently; only existing proven 100/200 GB mappings used. Parser, discovery, pinned fallback and Norway paths remain unchanged.
- Original Apple HTML card/identity extracts, seven original Google JSON feeds and iCloud sections are in `services/api/src/fixtures/international-*`. Tests do not access the network. Full downloaded pages were separately used in scratch proof and actual live adapter verification.

| Market | Apple Music official page | Apple TV official page | Locale | Currency token |
|---|---|---|---|---|
| IN | https://www.apple.com/in/apple-music/ | https://www.apple.com/in/apple-tv/ | en_IN | ₹ |
| SG | https://www.apple.com/sg/apple-music/ | https://www.apple.com/sg/apple-tv/ | en_SG | S$ |
| HK | https://www.apple.com/hk/en/apple-music/ | https://www.apple.com/hk/en/apple-tv/ | en_HK | HK$ |
| TW | https://www.apple.com/tw/apple-music/ | https://www.apple.com/tw/apple-tv/ | zh-TW | NT$ |
| AE | https://www.apple.com/ae/apple-music/ | https://www.apple.com/ae/apple-tv/ | en_AE | AED |
| TH | https://www.apple.com/th/apple-music/ | https://www.apple.com/th/apple-tv/ | th_TH | ฿ |
| PH | https://www.apple.com/ph/apple-music/ | https://www.apple.com/ph/apple-tv/ | en_PH | ₱ |

Prices are provider-presented recurring monthly amounts, not introductory offers or annual totals. No FX or tax adjustment is applied; Apple prices are not copied to direct-provider or third-party store routes.

## Candidate decisions, in requested priority order

Every candidate's official Google feed, Apple Music and Apple TV destinations were fetched. Spotify recurring NEXT_DATA records were additionally inspected for IN/JP/KR/MX/SG/AR/AE/ZA/VN/NG/EG/MA/QA/KW. A failed marketing URL is an evidence gap, not a claim the service is unavailable.

- **IN India — READY:** 4 services, 11 monthly plans, 2 organizations, music/video/cloud, strict country/currency/plan identity, route-specific fallback, compatible two-decimal formatting. All 11 actual adapter rows live-verified.
- **JP Japan — DEFERRED:** Official Apple ja_JP Music/TV recurring cards and Google JP/JPY feed exist. JPY has zero-decimal formatting; iCloud parser does not support JP. Currency/storage/PDF review and localized parser proof are required before launch.
- **KR South Korea — DEFERRED:** Official Apple ko_KR Music/TV and Google KR/KRW exist. Music has Individual/Family but no Student gallery; do not invent Student. KRW is zero-decimal; iCloud parser lacks KR. Spotify has Individual/Basic/Student/Duo, requiring separate identity/locale proof.
- **MX Mexico — DEFERRED:** Google MX/MXN and iCloud Mexico (MXN) are explicit. Local Apple Music/TV and Spotify MX records still use bare $. Music/video currency proof remains insufficient.
- **SG Singapore — READY:** 4 services, 11 monthly plans, 2 organizations, music/video/cloud, strict country/currency/plan identity, route-specific fallback, compatible two-decimal formatting. All 11 actual adapter rows live-verified.
- **HK Hong Kong — READY:** 4 services, 11 monthly plans, 2 organizations, music/video/cloud, strict country/currency/plan identity, route-specific fallback, compatible two-decimal formatting. All 11 actual adapter rows live-verified.
- **TW Taiwan — READY:** 4 services, 11 monthly plans, 2 organizations, music/video/cloud, strict country/currency/plan identity, route-specific fallback, compatible two-decimal formatting. All 11 actual adapter rows live-verified.
- **AR Argentina — DEFERRED:** Google AR feed prices in USD, not ARS. Apple /ar/apple-music/ and /ar/apple-tv/ return 404. Spotify AR recurring records use bare $ and tax footnotes. No currency or tax inference; insufficient service breadth.
- **AE United Arab Emirates — READY:** 4 services, 11 monthly plans, 2 organizations, music/video/cloud, strict country/currency/plan identity, route-specific fallback, compatible two-decimal formatting. All 11 actual adapter rows live-verified.
- **ZA South Africa — DEFERRED:** Google ZA/ZAR and iCloud ZAR exist. Apple /za/apple-tv/ returns 404; Spotify ZA uses STANDARD/PLATINUM/STANDARD_STUDENT, not mapped Individual/Student. Local video and product identity gaps remain.
- **VN Vietnam — DEFERRED:** Official localized Apple Music/TV and Google VN/VND exist. VND zero-decimal formatting and dot-grouped provider amounts require coordinated amount/formatting review; iCloud parser does not support VN.
- **ID Indonesia — DEFERRED:** Official localized Apple Music/TV, iCloud IDR and Google ID/IDR exist. Scratch proof correctly parsed Rp 59.000 as 59000, but the actual runtime formats IDR with zero decimals. Removed the attempted activation and scoped IDR parser changes; unchanged fraction-preservation regression must pass before launch.
- **TH Thailand — READY:** 4 services, 11 monthly plans, 2 organizations, music/video/cloud, strict country/currency/plan identity, route-specific fallback, compatible two-decimal formatting. All 11 actual adapter rows live-verified.
- **PH Philippines — READY:** 4 services, 11 monthly plans, 2 organizations, music/video/cloud, strict country/currency/plan identity, route-specific fallback, compatible two-decimal formatting. All 11 actual adapter rows live-verified.
- **NG Nigeria — DEFERRED:** Google NG/NGN and Spotify NG recurring Individual/Student/Duo/Family with ₦ are promising. Apple Music response lacks the expected localized gallery/canonical evidence; Apple TV /ng/ returns 404. No verified video plus four-service launch catalog. NG/NGN is not yet in shared API mapping.
- **EG Egypt — DEFERRED:** Google EG/EGP and Spotify EG recurring records with Arabic EGP amounts exist. Apple product URLs redirect to service pages with en_GB metadata, not the verified localized marketing-card structure. Missing proven multi-service/video launch evidence; no Arabic digit parser added. EG/EGP not in shared API mapping.
- **MA Morocco — DEFERRED:** Google MA/MAD and Spotify MA recurring records with explicit MAD exist. Apple Music lacks localized gallery evidence; Apple TV /ma/ returns 404. Missing video/fourth service; MA/MAD not in shared API mapping.
- **QA Qatar — DEFERRED:** Google QA/QAR and Spotify QA recurring records with explicit QAR exist. Apple product URLs lead to service pages with en_GB metadata, not validated local marketing cards. Missing independent Apple Music/TV evidence and four-service catalog; QA/QAR not in API mapping.
- **KW Kuwait — DEFERRED:** Google KW and Spotify KW explicitly bill USD, not KWD. Apple Music leads to an en_GB service page; Apple TV /kw/ returns 404. KWD has three decimal minor units, incompatible with unreviewed hundredths storage. No inferred KWD prices or launch mapping.

Singapore's bare-dollar Spotify and India/UAE's Standard/Platinum plan gaps remain unresolved; these markets qualify through independently proven Google storage, without changing Spotify mappings. Canada, Romania and Hungary were not re-certified during this task. See the prior audit for their blockers.

## Preservation and compatibility

Only new Apple currency/storefront parsing, route-specific registry rows and shared selector/catalog entries change production behavior. Existing resolver, persisted price merging, store paths, GeoFetch, Norway, Google One, provider-management browser/routing, entitlement logic and AI/PDF implementations are unchanged.

SHA-256 snapshots and row counts cover every one of the **286 pre-existing registry records across 22 countries** (China retains its separate existing store-derived coverage). Tests preserve exact plan names, amounts, routes and source URLs. Existing 23-market outage tests still check every market and offline pricing identity.

All seven new currencies preserve hundredths under the actual Intl runtime, including TWD. IDR unexpectedly formats with zero decimals in this runtime and was deliberately removed from activation rather than changing a test. JP/KRW/VND and KWD also require a coordinated amount/storage/input/formatting/PDF review. New currencies never infer a country for legacy subscriptions.

Shared selection drives onboarding and settings; catalogs are bounded by the existing expansion allowlist. Existing subscription country preservation and active-market filtering are reused. Regression tests cover create/edit isolation via actual repository functions with mocked SQL, repeated switching without mutations, selected-market savings/AI inputs and report-scoping helper, stale/wrong-currency responses, and local 09:00 reminders including India's half-hour timezone. AI/PDF consumers still use the existing selected-market scope. No account or subscription migration occurs.

## Verification

- API suite: 300 passed, 0 failed/skipped. Includes 56 new country/source failure subtests, live-source fixture assertions, and all baseline Norway/resolver/persistence tests.
- Mobile library suite: 84 passed, 0 failed/skipped, including all 11 generalized browser tests.
- API/mobile typechecks, API build and production iOS Hermes export passed.
- Actual live adapter output: each new market 11/11 authoritative-provider, **77/77 total**, exact registry amount/route/country/currency match. Native Node network access required the approved read-only probe; sandbox failure returned registry fallbacks as designed.
- Provider failure tests include network/timeout/HTTP/empty/wrong country/wrong currency/missing identity/annual evidence. Parser tests reject missing/duplicate plan identities, duplicate/conflicting cards, bare symbols and malformed fractional TWD values. Google discovery failure retains the pinned feed; total failure retains registry rows.

The first attempted eight-market test correctly failed IDR precision; ID was removed with its parser changes. A new test initially lacked a database mock and attempted a local persisted-price read; authentication failed, no database writes succeeded. The test was corrected to remain fully offline. Final runs are green.

## Limits and next work

No physical-device market acceptance, native build/upload, real database round-trip or visual PDF verification was performed. Before release, check representative new-market selection, adding/editing and switching back to Norway on iPhone; inspect a generated report. Provider pages can change; verified snapshots remain available but can become stale. An API-unreachable first install is not an offline catalog mode.

Best next work: coordinated zero-decimal currency handling (Japan, Korea, Vietnam, Indonesia); Mexico explicit MXN music/video evidence; Nigeria/Morocco/Qatar a verified video provider and fourth service. Apple service-page bootstrap sources might help Egypt/Qatar but were not mapped from en_GB metadata. Geographic fetching is not proven to resolve these blockers: paid scraping would not establish missing currency/product identity or fix formatting.

All exact launch prices, source URLs and per-candidate feed observations are in [readiness-international.json](readiness-international.json). Historical matrices remain unchanged.
