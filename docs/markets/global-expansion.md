# Global market readiness audit

Baseline: `766d75d`, 2026-09-08. Counts describe repository behavior, not production database contents.

## Findings

- Mobile: 15 selectable markets, 6 currencies (USD, NOK, SEK, DKK, EUR, CNY). Both onboarding and Settings use the same local array.
- API: 61 recognized country/currency mappings. The database stores country as CHAR(2), currency as CHAR(3), without an activated-market enum. CL and CO are absent from the API mapping.
- Catalog: 42 service identities, mirrored in database migrations. No country-specific plan table: plan options come from matching regional pricing rows. The picker requires a regional price before exposing a service.
- Verified registry: 14 countries (all existing mobile countries except China). Store-estimated and live sources add coverage separately. Do not interpret API recognition or a generic service identity as launch readiness.
- Existing availability rules are broad outside China: China allowlist, China-only exclusions, US-only Hulu/Peacock, and a Paramount+ allowlist. New markets must have their own evidence-based service allowlist.
- Subscription creation already sends explicit selected country/currency. Repository reads and writes retain country; account identity is independent of market. PATCH does not move subscriptions between countries.
- Mobile totals, savings, local AI reasoning and renewal views are scoped through marketItems. Legacy country inference is limited to USD/US, NOK/NO, SEK/SE, DKK/DK, CNY/CN. EUR must never imply a country.
- Remote AI bug: the API sends all account subscriptions despite selected-country context, and drops per-subscription country identity. Fix before expansion.
- Reports use explicit country filtering, unlike the main view legacy fallback. Use the same tested scope so existing legacy Norway bills remain visible in reports.
- Notifications use the user timezone, independent of selected market. A country switch must not change reminder timezone or stop reminders for another country.
- Formatting consistently uses stored minor/100 and Intl currency formatting. The three priority currencies have two decimal minor units. Static FX helpers are present but unused; do not reuse them for verified prices or savings.
- Market definitions are duplicated between the mobile selector and API currency map. Introduce a small shared definition, preserving every API mapping and every existing selector entry.
- Mobile pricing fetch has a race: a response for the previous market can replace the current snapshot. Country filters prevent wrong-price authority, but can leave the current catalog empty; guard response identity and current selection.
- Baseline API tests: 180 pass. Mobile typecheck passes. Mobile tests have one pre-existing stale expectation: country-change help expects topic region although implemented help correctly returns market. Strengthen that test around multi-country preservation.

## Activation threshold

For a new market require: at least four established services, ten verified monthly plans, two provider organizations, and coverage across video, music and cloud; official country/currency/plan/route evidence; verified registry fallback for every advertised launch plan; correct two-decimal formatting; scoped subscriptions, AI and reports; selector/onboarding support; regression tests. This is a deliberately bounded launch catalog, not a claim of comprehensive country coverage. Existing markets are preserved rather than removed for failing a new threshold.

## Prioritization

GB first (five services / 15 plans), then AU and NZ (four services / 11 plans each). All have recently verified official sources and compatible English UI. Their blocker is lack of fallback and mobile activation, not new provider parsing. CA is next but lacks enough explicit-currency multi-service proof. Other iCloud-covered markets remain near-ready on pricing breadth only; they need more providers/services, localization review where appropriate, and fallbacks. No population-only ranking.

## Matrix

Full per-service/plan/route fallback records and evidence counts: [readiness-before.json](readiness-before.json). Live figures are documented source evidence, not a claim that every configured adapter currently succeeds.

| Country | Currency | Mobile | Registry plans | Offline services/plans | Documented live services/plans | Before |
|---|---|---|---:|---|---|---|
| US United States | USD | yes | 10 | 25/52 | 0/0 | READY_EXISTING |
| CA Canada | CAD | no | 0 | 0/0 | 1/5 | NEAR_READY |
| MX Mexico | MXN | no | 0 | 0/0 | 1/5 | NEAR_READY |
| BR Brazil | BRL | no | 0 | 0/0 | 1/5 | NEAR_READY |
| AR Argentina | ARS | no | 0 | 0/0 | 0/0 | INSUFFICIENT_EVIDENCE |
| GB United Kingdom | GBP | no | 0 | 0/0 | 5/15 | NEAR_READY |
| NO Norway | NOK | yes | 35 | 20/55 | 0/0 | READY_EXISTING |
| SE Sweden | SEK | yes | 11 | 15/34 | 0/0 | READY_EXISTING |
| DK Denmark | DKK | yes | 11 | 15/34 | 0/0 | READY_EXISTING |
| IS Iceland | ISK | no | 0 | 0/0 | 0/0 | INSUFFICIENT_EVIDENCE |
| CH Switzerland | CHF | no | 0 | 0/0 | 1/5 | NEAR_READY |
| PL Poland | PLN | no | 0 | 0/0 | 1/5 | NEAR_READY |
| CZ Czechia | CZK | no | 0 | 0/0 | 1/5 | NEAR_READY |
| HU Hungary | HUF | no | 0 | 0/0 | 1/5 | NEAR_READY |
| RO Romania | RON | no | 0 | 0/0 | 1/5 | NEAR_READY |
| DE Germany | EUR | yes | 11 | 19/44 | 0/0 | READY_EXISTING |
| FR France | EUR | yes | 11 | 18/41 | 0/0 | READY_EXISTING |
| ES Spain | EUR | yes | 11 | 17/36 | 0/0 | READY_EXISTING |
| IT Italy | EUR | yes | 11 | 18/40 | 0/0 | READY_EXISTING |
| PT Portugal | EUR | yes | 10 | 15/35 | 0/0 | READY_EXISTING |
| NL Netherlands | EUR | yes | 11 | 16/35 | 0/0 | READY_EXISTING |
| BE Belgium | EUR | yes | 20 | 18/42 | 0/0 | READY_EXISTING |
| AT Austria | EUR | yes | 10 | 17/39 | 0/0 | READY_EXISTING |
| IE Ireland | EUR | yes | 11 | 16/36 | 0/0 | READY_EXISTING |
| FI Finland | EUR | yes | 11 | 16/36 | 0/0 | READY_EXISTING |
| GR Greece | EUR | no | 0 | 0/0 | 0/0 | INSUFFICIENT_EVIDENCE |
| SK Slovakia | EUR | no | 0 | 0/0 | 0/0 | INSUFFICIENT_EVIDENCE |
| SI Slovenia | EUR | no | 0 | 0/0 | 0/0 | INSUFFICIENT_EVIDENCE |
| EE Estonia | EUR | no | 0 | 0/0 | 0/0 | INSUFFICIENT_EVIDENCE |
| LV Latvia | EUR | no | 0 | 0/0 | 0/0 | INSUFFICIENT_EVIDENCE |
| LT Lithuania | EUR | no | 0 | 0/0 | 0/0 | INSUFFICIENT_EVIDENCE |
| LU Luxembourg | EUR | no | 0 | 0/0 | 0/0 | INSUFFICIENT_EVIDENCE |
| CY Cyprus | EUR | no | 0 | 0/0 | 0/0 | INSUFFICIENT_EVIDENCE |
| MT Malta | EUR | no | 0 | 0/0 | 0/0 | INSUFFICIENT_EVIDENCE |
| HR Croatia | EUR | no | 0 | 0/0 | 0/0 | INSUFFICIENT_EVIDENCE |
| BG Bulgaria | EUR | no | 0 | 0/0 | 0/0 | INSUFFICIENT_EVIDENCE |
| AU Australia | AUD | no | 0 | 0/0 | 4/11 | NEAR_READY |
| NZ New Zealand | NZD | no | 0 | 0/0 | 4/11 | NEAR_READY |
| JP Japan | JPY | no | 0 | 0/0 | 0/0 | INSUFFICIENT_EVIDENCE |
| KR South Korea | KRW | no | 0 | 0/0 | 0/0 | INSUFFICIENT_EVIDENCE |
| CN China | CNY | yes | 0 | 9/18 | 0/0 | READY_EXISTING |
| HK Hong Kong SAR China | HKD | no | 0 | 0/0 | 1/5 | NEAR_READY |
| TW Taiwan | TWD | no | 0 | 0/0 | 1/5 | NEAR_READY |
| SG Singapore | SGD | no | 0 | 0/0 | 1/5 | NEAR_READY |
| IN India | INR | no | 0 | 0/0 | 1/5 | NEAR_READY |
| ID Indonesia | IDR | no | 0 | 0/0 | 1/5 | NEAR_READY |
| MY Malaysia | MYR | no | 0 | 0/0 | 1/5 | NEAR_READY |
| TH Thailand | THB | no | 0 | 0/0 | 1/5 | NEAR_READY |
| PH Philippines | PHP | no | 0 | 0/0 | 1/5 | NEAR_READY |
| VN Vietnam | VND | no | 0 | 0/0 | 0/0 | INSUFFICIENT_EVIDENCE |
| AE United Arab Emirates | AED | no | 0 | 0/0 | 1/5 | NEAR_READY |
| SA Saudi Arabia | SAR | no | 0 | 0/0 | 1/5 | NEAR_READY |
| IL Israel | ILS | no | 0 | 0/0 | 1/5 | NEAR_READY |
| TR Türkiye | TRY | no | 0 | 0/0 | 1/5 | NEAR_READY |
| UA Ukraine | UAH | no | 0 | 0/0 | 0/0 | INSUFFICIENT_EVIDENCE |
| RS Serbia | RSD | no | 0 | 0/0 | 0/0 | INSUFFICIENT_EVIDENCE |
| BA Bosnia & Herzegovina | BAM | no | 0 | 0/0 | 0/0 | INSUFFICIENT_EVIDENCE |
| AL Albania | ALL | no | 0 | 0/0 | 0/0 | INSUFFICIENT_EVIDENCE |
| MK North Macedonia | MKD | no | 0 | 0/0 | 0/0 | INSUFFICIENT_EVIDENCE |
| MD Moldova | MDL | no | 0 | 0/0 | 0/0 | INSUFFICIENT_EVIDENCE |
| ZA South Africa | ZAR | no | 0 | 0/0 | 1/5 | NEAR_READY |
| CL Chile | CLP | no | 0 | 0/0 | 0/0 | INSUFFICIENT_EVIDENCE |
| CO Colombia | COP | no | 0 | 0/0 | 0/0 | INSUFFICIENT_EVIDENCE |

## Evidence and deferred work

- Official iCloud table: https://support.apple.com/en-us/108047. Extracted country/currency fixtures and prior live adapter checks cover 24 markets.
- Official Apple Music and Apple TV country pages: /uk/, /au/, /nz/ on https://www.apple.com/. Canonical URL, og:locale, explicit £/A$/NZ$ and named plans are verified by existing tests and prior live probes.
- Google One pinned feed on one.google.com/intl/ALL_{gb,au,nz}/about/feeds/pricing_2026_07_28.json was re-probed: GB/GBP 1.59,2.49; AU/AUD 2.99,4.49; NZ/NZD 3.49,4.99. No Google parser/discovery changes needed.
- Spotify /gb/premium/ has explicit GB country, GBP symbols, recurring PREMIUM_* IDs: Individual 12.99, Student 5.99, Duo 17.99, Family 21.99. Do not map Indian Standard/Platinum to these plans.
- Previous batch found Microsoft blocked pages, Netflix German context mixed with NOK prices, Disney no usable recurring rows, Spotify AU/CA bare-dollar ambiguity. No weakening of validation to activate these markets.
- JP/KR/VND and other zero-decimal markets need explicit minor-unit and formatting review; not activated. CL/CO need API currencies plus multi-service evidence. No new currency mappings are justified just by ISO validity.
- Backend database integration and simulator/device UI verification are separate from offline logic checks; report their actual verification status rather than claiming production readiness from parser tests.
