# Implementation report — 10 September 2026

Starting and final HEAD: 918838d058837ec252b8b89e4384196d44f450ad, build10-final. No stage/commit.

30 → **46 selectable markets**; 48 → **78 canonical services**; 12 → **13 UI languages**. Registry 371 → **465**; offline prices 764 → **858**. All old rows retained exactly; committed baseline 364/757 also preserved. 92 new direct monthly plan/market rows, one Apple and one Google Play row. [Every price, channel, source and exclusion](direct-price-review.md).

This implements the 16 technically safe markets. It does **not** certify exhaustive Tier 1/Tier 2 breadth; many relevant candidate services remain unverified or missing. Country readiness, price readiness and language readiness are separate. Kuwait remains blocked only because three-decimal amounts cannot be represented exactly with integer hundredths. No country is blocked solely on automatic price coverage or local UI language.

## New canonical identities in this continuation

- Apple Arcade — `apple-arcade`
- U-NEXT — `u-next`
- Hulu Japan — `hulu-japan`
- DMM TV — `dmm-tv`
- TVING — `tving`
- Melon — `melon`
- Crave — `crave`
- TSN — `tsn`
- Sportsnet+ — `sportsnet-plus`
- SiriusXM Canada — `siriusxm-canada`
- Shahid — `shahid`
- Anghami — `anghami`
- stc tv — `stc-tv`
- TOD — `tod`
- ViX — `vix`
- Vidio — `vidio`
- VISION+ — `vision-plus`
- GAİN — `gain`
- Exxen — `exxen`
- DStv Stream — `dstv-stream`
- STING+ — `sting-plus`
- yes+ — `yes-plus`
- WATCH IT — `watch-it`
- FPT Play — `fpt-play`
- VOYO Romania — `voyo-ro`
- AntenaPLAY — `antenaplay`
- MagentaTV Greece — `magenta-tv-gr`
- Cinobo — `cinobo`
- Zapping — `zapping`
- Win Play — `win-play`

Prior Storytel, RTL+, Videoland, Nintendo Switch Online and OSN+ additions remain. Apple Arcade additionally has explicit provider-list availability in 28 existing markets; Hong Kong/Mainland China were not inferred. Netflix/Spotify restored availability remains. No new management destination is guessed.

## All 47 market metrics

Relevant = offered/candidate union, not a complete census. D% = direct-priced services / offered. Old verified snapshots remain in D but are not relabeled freshly rechecked; JSON separates fresh rechecks. U includes unresolved research candidates and historical offerings with insufficient current evidence. A = availability evidenced, direct price unknown. T1/T2 are editorial evidence-backed lower bounds.

|Market|Relevant / offered|T1 present / identified|T1 missing|T2 present / identified|D services|D%|A|U|Direct plans|Apple|Google|Other|Selectable|
|---|---|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
|US USD|37 / 34|2 / 2|None identified*|5 / 5|4|11.8|5|28|8|0|0|2|yes|
|NO NOK|36 / 32|2 / 3|TV 2 Play|5 / 5|10|31.3|3|23|33|8|0|0|yes|
|SE SEK|34 / 30|2 / 3|TV4 Play|4 / 5|4|13.3|5|25|10|0|0|1|yes|
|DK DKK|34 / 30|2 / 3|TV 2 Play Denmark|4 / 4|5|16.7|5|24|11|0|0|0|yes|
|DE EUR|36 / 32|3 / 3|None identified*|4 / 4|5|15.6|5|26|14|0|0|1|yes|
|ES EUR|35 / 30|2 / 3|Movistar Plus+|4 / 4|4|13.3|5|26|10|0|0|1|yes|
|FR EUR|35 / 31|2 / 4|CANAL+, Deezer|4 / 4|4|12.9|5|26|10|0|0|1|yes|
|IT EUR|34 / 31|2 / 2|None identified*|4 / 4|4|12.9|5|25|10|0|0|1|yes|
|PT EUR|34 / 30|2 / 2|None identified*|4 / 5|3|10|6|25|9|0|0|1|yes|
|NL EUR|35 / 31|3 / 3|None identified*|4 / 5|5|16.1|5|25|13|0|0|1|yes|
|BE EUR|33 / 30|2 / 2|None identified*|4 / 5|4|13.3|5|24|10|9|0|1|yes|
|AT EUR|35 / 31|2 / 2|None identified*|4 / 4|4|12.9|5|26|9|0|0|1|yes|
|IE EUR|34 / 31|2 / 2|None identified*|4 / 5|4|12.9|5|25|10|0|0|1|yes|
|FI EUR|35 / 30|2 / 2|None identified*|4 / 7|5|16.7|5|25|11|0|0|0|yes|
|CN CNY|18 / 13|3 / 3|None identified*|1 / 1|0|0|0|18|0|0|0|0|yes|
|GB GBP|13 / 7|2 / 3|NOW|3 / 4|2|28.6|3|8|6|9|0|0|yes|
|AU AUD|14 / 7|2 / 3|Stan|3 / 7|1|14.3|4|7|2|9|0|0|yes|
|NZ NZD|11 / 7|2 / 4|Neon, Sky Sport Now|3 / 4|1|14.3|4|6|2|9|0|0|yes|
|CH CHF|12 / 6|2 / 2|None identified*|2 / 6|1|16.7|3|8|4|9|0|0|yes|
|PL PLN|13 / 6|2 / 3|Canal+ Online|2 / 4|1|16.7|3|9|4|9|0|0|yes|
|BR BRL|14 / 7|2 / 3|Globoplay|3 / 5|1|14.3|3|10|4|9|0|0|yes|
|CZ CZK|11 / 6|2 / 2|None identified*|2 / 4|1|16.7|3|6|4|9|0|0|yes|
|MY MYR|14 / 6|2 / 2|None identified*|2 / 6|1|16.7|3|10|4|9|0|0|yes|
|IN INR|13 / 7|2 / 3|JioHotstar|3 / 4|1|14.3|4|8|2|9|0|0|yes|
|SG SGD|14 / 7|2 / 2|None identified*|3 / 5|1|14.3|4|9|2|9|0|0|yes|
|HK HKD|12 / 6|2 / 2|None identified*|2 / 5|1|16.7|3|8|2|9|0|0|yes|
|TW TWD|14 / 7|2 / 3|Hami Video|3 / 4|1|14.3|4|8|2|9|0|0|yes|
|AE AED|14 / 10|2 / 2|None identified*|6 / 7|2|20|5|7|4|9|0|0|yes|
|TH THB|14 / 7|2 / 2|None identified*|3 / 5|1|14.3|4|9|2|9|0|0|yes|
|PH PHP|12 / 7|2 / 2|None identified*|3 / 5|1|14.3|4|6|2|9|0|0|yes|
|JP JPY|18 / 13|3 / 3|None identified*|6 / 6|3|23.1|10|5|6|1|1|0|yes|
|CA CAD|17 / 17|3 / 3|None identified*|7 / 7|3|17.6|14|0|8|0|0|0|yes|
|SA SAR|14 / 12|2 / 2|None identified*|7 / 7|1|8.3|10|3|3|0|0|0|yes|
|KR KRW|16 / 11|2 / 2|None identified*|6 / 6|2|18.2|9|5|6|0|0|0|yes|
|MX MXN|14 / 12|2 / 2|None identified*|5 / 5|2|16.7|10|2|5|0|0|0|yes|
|ID IDR|15 / 11|3 / 3|None identified*|5 / 5|1|9.1|10|4|3|0|0|0|yes|
|TR TRY|15 / 10|2 / 2|None identified*|6 / 6|1|10|9|4|4|0|0|0|yes|
|ZA ZAR|10 / 9|2 / 2|None identified*|5 / 5|2|22.2|7|0|4|0|0|0|yes|
|IL ILS|14 / 10|2 / 2|None identified*|6 / 6|1|10|9|4|4|0|0|0|yes|
|QA QAR|14 / 12|2 / 2|None identified*|7 / 7|1|8.3|10|3|4|0|0|0|yes|
|EG EGP|14 / 12|2 / 2|None identified*|7 / 7|2|16.7|9|3|6|0|0|0|yes|
|KW KWD|10 / 0|0 / 2|Netflix, Spotify|0 / 3|0|—|0|10|0|0|0|0|NO — KWD precision|
|VN VND|14 / 10|2 / 2|None identified*|5 / 5|1|10|9|3|2|0|0|0|yes|
|RO RON|12 / 11|2 / 2|None identified*|6 / 6|2|18.2|9|1|6|0|0|0|yes|
|GR EUR|14 / 12|3 / 3|None identified*|5 / 5|2|16.7|10|2|6|0|0|0|yes|
|CL CLP|12 / 11|2 / 2|None identified*|5 / 5|2|18.2|9|1|10|0|0|0|yes|
|CO COP|14 / 11|2 / 2|None identified*|5 / 5|2|18.2|9|3|8|0|0|0|yes|

*Does not mean the census is complete. [Per-country decisions, missing Tier 2, sources](country-coverage.md); [all classifications and freshness fields](markets.json). All catalogs/pricing still have quality work.

## Deferred/rejected identities and direct prices

- AU: Hubbl — Hardware/platform brand is not independently verified recurring consumer subscription.
- AU: Optus Sport — Rights/assets moved to Stan Sport; do not add legacy standalone identity.
- CZ: Voyo Czechia — Replaced by Oneplay; Romanian VOYO is separate.
- TW: Readmoo — Recurring subscription not established; ebook purchases alone are unsuitable.
- PH: iWantTFC — Rebranded iWant; use current identity only after paid-tier validation.
- TR: BluTV — Replaced by Max; do not duplicate canonical identity.
- ZA: Showmax — Standalone discontinuation announced in 2026; no standalone addition.
- VN: K+ — Provider cessation notice after December 2025; no new standalone canonical service.

Other candidates remain research-deferred, not rejected as obscure without evidence. Deezer, Kindle Unlimited, Discord Nitro, Duolingo and unimplemented local candidates have incomplete country/plan verification; no unsupported availability or price was invented. BluTV is not added beside the existing Max identity; HBO Max aliases preserve continuity. Czech Voyo/Oneplay, iWant branding, Sky X/WOW and Viaplay footprint remain source-specific review items. COSMOTE TV provider now redirects to MagentaTV Greece, stored once with the old brand as alias. Win Sports streaming is represented as Win Play. DStv September 17 transition must be rechecked before a later release.

## Language and AI

Japanese adds all 309 keys plus existing closed navigation/status/settings maps. Existing 12 languages remain; no language follows country automatically. [Language/RTL assessment](language-readiness.md) lists missing translations. Arabic/Hebrew RTL is not implemented or advertised. These language gaps do not disable their countries.

Groq default remains openai/gpt-oss-20b. Evidence-based response allowlist: en, de, es, fr, it, pt, ja, zh-CN. no/sv/da/nl/fi and unsupported/malformed/missing tags fall back to English; unreviewed model overrides also fall back. This policy is based on documented multilingual benchmark coverage, not live per-language quality certification. Language fallback cannot modify preferences, market, or portfolio scope. Remote boundary tests require selected-market-only subscriptions and no portfolio for missing/malformed market.

## Safety and persistence

JPY/KRW/VND/CLP/COP retain hundredths; formatted fractional cases and all new-market DB round trips pass. No FX or annual/12 conversion. Unknown manual services retain their names and explicit confirmation, never Netflix. Existing Build 12 compatibility mapping is unchanged and used in new-market integration tests. PDF, shared-EUR country isolation, reminders, savings, management browser/return confirmation, grouped picker/search/manual option, header/status/plan card and IAP remain unchanged or regression-tested. Annual ID remains com.thomashodne.savlivo.premium.annual.

016 and 017 preserved; 018 adds 30 service identities. All three rerun safely in disposable PostgreSQL. No production migration run. Apply only actually pending migrations in order under separate approval before deploying code that creates those canonical services; never rerun already-applied 011–015 blindly.

## Tests

65 focused, 373 API, 133 mobile, one disposable integration scenario all pass. API/mobile TypeScript, API production build, iOS Hermes export and diff whitespace check pass. [Exact commands, initial failures/corrections, limitations and physical checklist](operation-validation.md). No physical iPhone test or live Groq quality evaluation was performed.

## Exact changed tracked files

- apps/mobile/app/index.tsx
- apps/mobile/lib/assistant-management.test.ts
- apps/mobile/lib/build13-polish.test.ts
- apps/mobile/lib/catalog.test.ts
- apps/mobile/lib/discovery.test.ts
- apps/mobile/lib/ui-localization.ts
- packages/contracts/src/catalog.ts
- packages/contracts/src/markets.ts
- services/api/src/assistant-actions.test.ts
- services/api/src/assistant.ts
- services/api/src/market-behavior.test.ts
- services/api/src/migrate-production.ts
- services/api/src/pricing-adapters.test.ts
- services/api/src/pricing-adapters.ts
- services/api/src/pricing-registry.test.ts
- services/api/src/server.ts

## Exact untracked task files (includes preserved earlier work)

- apps/mobile/lib/global-catalog-audit.test.ts
- db/migrations/016_add_storytel.sql
- db/migrations/017_add_available_catalog_services.sql
- db/migrations/018_add_market_catalog_services.sql
- docs/catalog/global-47/2026-09-09-checkpoint.md
- docs/catalog/global-47/README.md
- docs/catalog/global-47/baseline.json
- docs/catalog/global-47/build-scorecard.mjs
- docs/catalog/global-47/candidates.json
- docs/catalog/global-47/continuation-baseline.json
- docs/catalog/global-47/continuation-report.md
- docs/catalog/global-47/country-coverage.md
- docs/catalog/global-47/direct-price-review.md
- docs/catalog/global-47/evidence.json
- docs/catalog/global-47/language-readiness.md
- docs/catalog/global-47/market-expansion-evidence.json
- docs/catalog/global-47/markets.json
- docs/catalog/global-47/operation-validation.md
- docs/catalog/global-47/preservation.json
- docs/catalog/global-47/spotify-ae-evidence.json
- docs/catalog/global-47/storytel-no-evidence.json
- docs/catalog/global-47/validation.md
- services/api/src/assistant-language.ts
- services/api/src/storytel.integration.test.ts
- services/api/src/verified-expansion-prices.ts

## Git diff --stat

Tracked files only; git diff --stat excludes the new untracked files above.

```text
 apps/mobile/app/index.tsx                    |  31 ++-
 apps/mobile/lib/assistant-management.test.ts |   6 +
 apps/mobile/lib/build13-polish.test.ts       |   8 +-
 apps/mobile/lib/catalog.test.ts              |   7 +-
 apps/mobile/lib/discovery.test.ts            |   2 +-
 apps/mobile/lib/ui-localization.ts           | 317 ++++++++++++++++++++++++++-
 packages/contracts/src/catalog.ts            | 100 ++++++++-
 packages/contracts/src/markets.ts            |  37 +++-
 services/api/src/assistant-actions.test.ts   |  28 +++
 services/api/src/assistant.ts                |  25 ++-
 services/api/src/market-behavior.test.ts     | 100 ++++++++-
 services/api/src/migrate-production.ts       |   3 +
 services/api/src/pricing-adapters.test.ts    |   2 +-
 services/api/src/pricing-adapters.ts         |  26 +++
 services/api/src/pricing-registry.test.ts    |   5 +-
 services/api/src/server.ts                   |   2 +-
 16 files changed, 647 insertions(+), 52 deletions(-)
```

## Git status --short

```text
 M apps/mobile/app/index.tsx
 M apps/mobile/lib/assistant-management.test.ts
 M apps/mobile/lib/build13-polish.test.ts
 M apps/mobile/lib/catalog.test.ts
 M apps/mobile/lib/discovery.test.ts
 M apps/mobile/lib/ui-localization.ts
 M packages/contracts/src/catalog.ts
 M packages/contracts/src/markets.ts
 M services/api/src/assistant-actions.test.ts
 M services/api/src/assistant.ts
 M services/api/src/market-behavior.test.ts
 M services/api/src/migrate-production.ts
 M services/api/src/pricing-adapters.test.ts
 M services/api/src/pricing-adapters.ts
 M services/api/src/pricing-registry.test.ts
 M services/api/src/server.ts
?? apps/mobile/lib/global-catalog-audit.test.ts
?? apps/web/.well-known/.htaccess
?? bilder/
?? db/migrations/016_add_storytel.sql
?? db/migrations/017_add_available_catalog_services.sql
?? db/migrations/018_add_market_catalog_services.sql
?? docs/catalog/global-47/
?? services/api/src/assistant-language.ts
?? services/api/src/storytel.integration.test.ts
?? services/api/src/verified-expansion-prices.ts
```

The .htaccess and bilder/ entries are unrelated existing untracked files and were not touched. Index remains empty. Root app.json, website/admin, dependencies, analytics activation, IAP architecture and build number remain untouched. Nothing pushed, deployed, staged or committed. No production data accessed. Awaiting human diff review.
