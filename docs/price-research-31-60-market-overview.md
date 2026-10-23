# Country coverage overview, canonical services 31–60

Reviewed 2026-10-23. The machine-readable rows, exact country codes and official source URL for each service are in `services/api/src/v2-operations/service-market-overview.mjs`. The numbering follows the canonical V2 Operations API order. Counts use Savlivo's 46 research markets.

`Listed` means that a provider page supports at least the named market, sometimes only for a particular plan, sales channel or region. An absent country is **unknown** unless a provider explicitly limits the whole service. The stored list changes research priority, not eligibility. An automatically skipped target still requires fresh, complete, robots-cleared provider bytes, a matching source hash and a validated service-wide availability statement.

| # | Service | Listed markets | Reported unavailable | Unknown | Evidence scope |
|---:|---|---|---:|---:|---|
| 31 | iQIYI | — | 0 | 46 | International coverage count; no complete country list |
| 32 | Mango TV | — | 0 | 46 | No complete country list |
| 33 | Youku | — | 0 | 46 | Global app; no complete country list |
| 34 | Bilibili | — | 0 | 46 | No complete country list |
| 35 | QQ Music | — | 0 | 46 | No complete country list |
| 36 | NetEase Cloud Music | — | 0 | 46 | No complete country list |
| 37 | Kugou Music | — | 0 | 46 | No complete country list |
| 38 | Baidu Netdisk | — | 0 | 46 | No complete country list |
| 39 | WPS | — | 0 | 46 | Buying page; no complete country list |
| 40 | Strava | — | 0 | 46 | Restrictions can be partial; no safe service-wide exclusion |
| 41 | Calm | — | 0 | 46 | Country-dependent pricing; no complete country list |
| 42 | Headspace | US AU CA FR DE GB | 0 | 40 | Student plan only |
| 43 | Viaplay | NL | 0 | 45 | Netherlands subscription page; other countries unreviewed |
| 44 | Storytel | — | 0 | 46 | 25+ countries, not enumerated on the cited page |
| 45 | RTL+ | DE | 0 | 45 | Plan and residency restrictions vary |
| 46 | Videoland | NL | 0 | 45 | Netherlands-focused terms and pricing |
| 47 | Nintendo Switch Online | US CA BR CL CO MX | 0 | 40 | Americas regional list only; other regions not inferred |
| 48 | OSN+ | AE SA QA EG | 0 | 42 | Examples from a non-exhaustive regional list |
| 49 | Apple Arcade | — | 0 | 46 | Per-country Apple media-service page needs service-specific reconciliation |
| 50 | U-NEXT | JP | 45 | 0 | Japanese provider restriction |
| 51 | Hulu Japan | JP | 45 | 0 | Explicit Japan-only statement; separate from US Hulu |
| 52 | DMM TV | JP | 45 | 0 | Japanese provider restriction |
| 53 | TVING | KR | 45 | 0 | Explicit South Korea-only statement |
| 54 | Melon | — | 0 | 46 | Territorial restrictions may vary by product |
| 55 | Crave | CA | 45 | 0 | Explicit Canada-only statement |
| 56 | TSN | CA | 0 | 45 | Canadian offer; no verified complete country list |
| 57 | Sportsnet+ | CA | 45 | 0 | Explicit Canada-only statement |
| 58 | SiriusXM Canada | CA | 45 | 0 | Canadian subscription entity; distinct from SiriusXM US |
| 59 | Shahid | — | 0 | 46 | MENA/worldwide marketing; no exhaustive country list |
| 60 | Anghami | — | 0 | 46 | Broad card acceptance is not proof of service availability |

For the six Japan/Canada-only rows and TVING, these `reported unavailable` codes are **not automatic exclusions**. The existing discovery path is extended only for their exact reviewed first-party pages and strict service-wide wording. U-NEXT and DMM TV use narrow Japanese-language assertions on their own help pages. A failed read, changed wording, blocked robots check or ambiguous title leaves all countries eligible. No pricing, G1 receipt or V3 Truth is inferred from any coverage statement.

The first 30 rows and their interpretation are documented in `docs/price-research-first-30-market-overview.md`.
