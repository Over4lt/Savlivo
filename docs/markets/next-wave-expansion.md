# Next-wave market expansion

Baseline: `a4a0e6b`, 18 mobile markets. Research date: 2026-09-08.

## Readiness and first activation

The prior threshold is unchanged: four established services, ten monthly plans, two provider organizations, music/video/cloud coverage, explicit country/currency/product/billing identity, registry fallback for every launch plan, compatible app behavior.

CH/CHF, PL/PLN, BR/BRL and CZ/CZK each qualify with 4 services and 13 monthly plans: iCloud+ (5 storage tiers), Apple Music (Individual/Family/Student), Apple TV (standalone monthly), Spotify (Individual/Student/Duo/Family). Apple services use Apple billing, Spotify direct. No Google One changes. These are bounded launch catalogs, not comprehensive service availability claims.

## Official evidence

- https://support.apple.com/en-us/108047: country-named sections with explicit ISO currency and five monthly storage tiers. Existing parser independently rechecked against freshly downloaded page.
- Apple Music and Apple TV pages under https://www.apple.com/chde/, https://www.apple.com/pl/, https://www.apple.com/br/ and https://www.apple.com/cz/: unique canonical URL plus og:locale de_CH/pl_PL/pt_BR/cs_CZ. CHF, zł, R$ and Kč recurring monthly wording. Stable Music gallery IDs identify plans independently of translated names. TV parsing remains bounded to standalone subscription context, excluding Apple One/student offers.
- https://www.spotify.com/ch-de/premium/, https://www.spotify.com/pl/premium/, https://www.spotify.com/br/premium/, https://www.spotify.com/cz/premium/: provider-owned NEXT_DATA country, recurring PREMIUM_INDIVIDUAL/STUDENT/DUO/FAMILY records, explicit currency tokens. Existing Spotify parser unchanged.
- Extracted original Apple price-card HTML and Spotify record fields are retained in services/api/src/fixtures/next-wave-pricing.json. Fixture extraction omits unrelated page assets, benefits and tracking data; it does not synthesize prices. Full pages were also used in scratch parser proof and actual live adapter probes.

All 52 launch rows were returned by actual adapters as authoritative-provider, matching all registry minor amounts and billing routes. Network sandbox initially returned fallback rows; approved external-network probe succeeded 52/52. No gateway metadata is used as authority.

## Compatibility and preservation

All four currencies use two decimal minor units; Intl formatting, decimal-comma parsing, integer storage and selected-market sums are tested. No FX conversion or tax normalization is applied. Prices are the provider-presented recurring monthly amounts, not trial prices or annual totals.

New markets reuse existing shared selectors, country-preserving repository operations, selected-market subscription/AI/PDF scope, pricing-response identity guards and timezone reminders. Existing account subscriptions are not migrated or deleted. Existing 18 markets and their fallback rows are regression-tested against both prior audit snapshots. Resolver, persistence, Norway and Google One implementations are unchanged.

Tests cover all 52 authoritative prices, total provider outage, timeout/HTTP/parser/country/currency/identity failures, missing and conflicting plan evidence, annual rejection, currency formatting and repeated market scoping. iCloud's shared cache is explicitly expired between failure cases. API: 228 passed; mobile library: 71 passed; API and mobile typechecks passed at first activation.

## Deferred investigation

Canada was inspected first: /ca/apple-music/, /ca/apple-tv/ and /ca-en/premium/ still lack an explicit CAD price identity (bare $). Five iCloud CAD prices are independently valid but insufficient service breadth. No currency inference was added.

Singapore: Apple Music/TV S$ evidence and iCloud SGD are useful, but Spotify is bare-dollar; a fourth independently verified service is still missing. UAE: Apple AED evidence is strong, but Spotify publishes PREMIUM_STANDARD/PLATINUM/PREMIUM_STANDARD_STUDENT, not the existing Individual/Student/Duo/Family identities. Do not rename or map these implicitly. Romania's /ro/apple-tv/ returned en_US identity; no local video evidence. Mexico Apple Music/Spotify did not close explicit MXN proof. Hungary is being assessed separately.

No paid scraper, geographic gateway, credentials or new dependency is needed for the successful markets. Geographic fetching has not been proven to solve bare currency symbols or changed product semantics; those require provider evidence. Prior Netflix/Disney/Microsoft blockers may warrant separate geographic probes, but do not justify adding ZenRows here.

## Limits

Tests use mocked database connections, not a production database. No native-device UI acceptance or visual PDF inspection is claimed. English app UI remains unchanged. Provider pages may change and fallback snapshots may become stale; fallback availability is protected. Zero-decimal JPY/KRW/VND markets remain outside this activation.
