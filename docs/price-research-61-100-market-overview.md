# Country coverage overview, canonical services 61–100

Reviewed 2026-10-23. The machine-readable rows, exact country codes and one first-party source URL per service are in `services/api/src/v2-operations/service-market-overview.mjs`. The order is the canonical V2 Operations API order. Counts use Savlivo's 46 research markets.

`Listed` is a positive service-market lead, not current price or V3 evidence. `Reported unavailable` records an apparently complete provider statement. It is **not** an automatic research exclusion: target selection still needs fresh, complete, hash-checked, robots-cleared first-party bytes and a service-wide statement accepted by `market-availability.mjs`. Unknown markets remain research-eligible. For a local offer, absent countries are unknown, even if the service name contains a country.

| # | Service | Listed markets | Reported unavailable | Unknown | Evidence scope |
|---:|---|---|---:|---:|---|
| 61 | stc tv | SA | 0 | 45 | Saudi checkout; fees may vary by country |
| 62 | TOD | QA | 0 | 45 | Qatar service lead; MENA article does not enumerate every market |
| 63 | ViX | MX US CL CO | 42 | 0 | Explicit, complete provider country list |
| 64 | Vidio | ID MY | 0 | 44 | Provider confirms Malaysian and international packages; not Indonesia-only |
| 65 | Vision+ | ID | 0 | 45 | Indonesian offer |
| 66 | GAİN | TR | 0 | 45 | Turkish membership offer |
| 67 | Exxen | TR | 0 | 45 | Turkish membership offer |
| 68 | DStv Stream | ZA | 0 | 45 | South African offer; DStv's other African services are not equated |
| 69 | STING+ | IL | 0 | 45 | Israeli packages; bundles and add-ons require separate price filtering |
| 70 | yes+ | IL | 0 | 45 | Israeli provider terms; use restriction is not a full subscription-country list |
| 71 | WATCH IT | EG | 0 | 45 | Egyptian card help explicitly says prices can differ elsewhere |
| 72 | FPT Play | VN | 0 | 45 | Vietnamese provider page |
| 73 | VOYO Romania | RO | 0 | 45 | Romanian sign-up and portability terms |
| 74 | AntenaPLAY | RO | 0 | 45 | Provider accepts viewers abroad; not Romania-only |
| 75 | MagentaTV Greece | GR | 0 | 45 | Greek provider offer, distinct from other MagentaTV brands |
| 76 | Cinobo | GR | 0 | 45 | Greek account route; Cyprus also mentioned outside Savlivo's 46 markets |
| 77 | Zapping | CL BR | 44 | 0 | First-party brand hub names Chile, Ecuador and Brazil as its three markets |
| 78 | Win Play | CO | 0 | 45 | Colombian Win Sports service |
| 79 | Aftenposten | NO | 0 | 45 | Norwegian digital publication; access abroad is not excluded |
| 80 | Berlingske | DK | 0 | 45 | Danish digital publication |
| 81 | BookBeat | BE CZ DK DE ES FR IE IT NL NO PL PT RO CH FI SE GB AT GR | 0 | 27 | Current country selector; FAQ requires local residence/payment, but the selector is not ingested as exclusion proof |
| 82 | Bugs | KR | 0 | 45 | Korean music service |
| 83 | Caixin | CN | 0 | 45 | Overseas USD subscriptions exist; not China-only |
| 84 | Dagens Næringsliv | NO | 0 | 45 | Norwegian digital publication |
| 85 | Dagens Nyheter | SE | 0 | 45 | Swedish digital publication |
| 86 | Empik Go | PL | 0 | 45 | Polish offer |
| 87 | FLO Music | KR | 0 | 45 | Korean music service |
| 88 | Fabel | NO | 0 | 45 | Norwegian audiobook offer |
| 89 | Genie Music | KR | 0 | 45 | Korean music service |
| 90 | Helsingin Sanomat | FI | 0 | 45 | Finnish digital publication |
| 91 | KKBOX | TW | 0 | 45 | Taiwanese service page; other KKBOX markets unreviewed |
| 92 | Kindle Unlimited | 24 canonical markets | 22 | 0 | Amazon's eligible countries and territories, aggregated across Amazon stores |
| 93 | Kobo Plus | 31 canonical markets | 15 | 0 | Provider's Available Countries section |
| 94 | Legimi | PL DE | 0 | 44 | Provider investor page describes Polish and German services |
| 95 | Mofibo | DK | 0 | 45 | Danish subscription page; no assertion about Storytel or other countries |
| 96 | Nextory | FR BE NL DE SE NO DK CH FI AT ES | 0 | 35 | Current country selector; absent markets remain unknown for exclusion |
| 97 | Podimo | DK DE NL NO FI ES MX | 39 | 0 | Provider says currently available in seven countries; Spanish content access elsewhere is separate |
| 98 | Podme | NO SE | 0 | 44 | Separate Norwegian and Swedish subscription pages |
| 99 | Politiken | DK | 0 | 45 | Danish digital publication |
| 100 | PressReader | — | 0 | 46 | No reviewed exhaustive subscription-country list |

The five rows with a reported complete list are ViX, Zapping, Kindle Unlimited, Kobo Plus and Podimo. Fresh ViX and Kobo Plus pages can be checked automatically using their exact reviewed URL and strict list wording; the other three remain static leads until a source-specific, fail-closed reader is validated. BookBeat and Nextory are intentionally represented as positive market-selector leads rather than complete negative proof. Historical price rows and manual per-service exclusions remain independent of this overview. No list supplies a price, market receipt or V3 Truth result.

The earlier rows are documented in `docs/price-research-first-30-market-overview.md` and `docs/price-research-31-60-market-overview.md`.
