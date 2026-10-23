# Country coverage overview for the first 30 canonical services

This is a reviewed routing overview for the first 30 services in the canonical V2 Operations API order, dated 2026-10-23. The machine-readable source is `services/api/src/v2-operations/service-market-overview.mjs`. All counts refer only to Savlivo's 46 research markets.

`Listed` means an official page names a market for the service or a narrower offering/platform described by `sourceScope`. It does **not** establish a current price or V3 verification. `Reported unavailable` is an official page's coverage claim, but the stored overview is never sufficient to omit a research target. `Unknown` remains eligible. Some official pages give regional summaries, supported payment methods, store localizations, or plan-specific coverage rather than a complete service list. Those pages are deliberately not used to infer that an absent market is unavailable.

| # | Service | Listed | Reported unavailable | Unknown | Source scope |
|---:|---|---:|---:|---:|---|
| 1 | Netflix | 45 | 1 | 0 | Explicit negative |
| 2 | Disney+ | 0 | 0 | 46 | Regional overview |
| 3 | Max | 26 | 0 | 20 | Historical partial list |
| 4 | Prime Video | 0 | 0 | 46 | Regional overview |
| 5 | Amazon Prime | 0 | 0 | 46 | No country list |
| 6 | Apple TV+ | 0 | 0 | 46 | Per-service country page |
| 7 | YouTube Premium | 45 | 1 | 0 | Complete service list |
| 8 | Hulu | 1 | 45 | 0 | US only |
| 9 | Paramount+ | 13 | 0 | 33 | Plan-specific list |
| 10 | Peacock | 1 | 45 | 0 | US only |
| 11 | Crunchyroll | 0 | 0 | 46 | No country list |
| 12 | Spotify | 45 | 1 | 0 | Complete service list |
| 13 | Apple Music | 0 | 0 | 46 | Per-service country page |
| 14 | Amazon Music Unlimited | 0 | 0 | 46 | No country list |
| 15 | TIDAL | 34 | 12 | 0 | Complete service list |
| 16 | Audible | 23 | 0 | 23 | Marketplace list |
| 17 | Xbox Game Pass | 0 | 0 | 46 | Plan-specific list |
| 18 | PlayStation Plus | 0 | 0 | 46 | Platform list |
| 19 | EA Play | 42 | 0 | 4 | Platform list |
| 20 | Ubisoft+ | 0 | 0 | 46 | No country list |
| 21 | GeForce NOW | 0 | 0 | 46 | Regional overview |
| 22 | ChatGPT | 44 | 2 | 0 | Complete service list |
| 23 | Claude | 44 | 2 | 0 | Complete service list |
| 24 | Microsoft 365 | 0 | 0 | 46 | Billing-channel list |
| 25 | Adobe Creative Cloud | 0 | 0 | 46 | Plan-specific list |
| 26 | Canva | 0 | 0 | 46 | Payment-method list |
| 27 | Dropbox | 0 | 0 | 46 | Explicit negatives exist, not yet reconciled |
| 28 | Google One | 45 | 1 | 0 | Complete service list |
| 29 | iCloud+ | 0 | 0 | 46 | Per-service country page |
| 30 | Tencent Video | 0 | 0 | 46 | No country list |

Every row's official URL and exact market codes are in the machine-readable overview and are visible in the Admin service selector. The Max list is historical and only influences ordering. The Paramount+ list describes a particular plan; EA Play's list describes PlayStation availability. Neither is a complete service availability claim.

## Research behavior

- Existing service-market exclusions still apply first.
- Listed markets are prioritized for all-market research, after existing scope hints. Explicit market selections retain their requested order. Unknown markets remain in the target set.
- For Hulu and Peacock, preflight attempts the precise, provider-owned terms page before free search. Only a fresh, complete, robots-cleared response with the expected service-wide US restriction, an accepted source host, and a matching SHA-256 can omit non-US targets. A failed or changed page leaves the markets eligible.
- For all other services, the existing official availability discovery still controls automatic omission. The overview cannot qualify a price, market receipt, G1 evidence, or V3 Truth result. No Gemini request is added by the overview.

This is a safe first pass, not a complete availability certification for all 30 services. A country list based on a platform, plan, payment method, or old support article needs a separate current provider proof before it can be used as an exclusion rule.
