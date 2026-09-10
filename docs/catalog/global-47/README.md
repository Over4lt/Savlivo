# Global 47-market implementation — 10 September 2026 continuation

> Current discovery policy: see [web-management eligibility](management-eligibility.md), [all service/market classifications](management-eligibility.json), and [validation](management-validation.md). START_WEB and CANCEL_WEB must both be verified for **new selection**. The earlier availability/price scorecards below remain historical measurements; their offered counts are not the current picker counts. Saved/manual records and all existing price data remain preserved.

Catalog work was originally validated from `918838d058837ec252b8b89e4384196d44f450ad`. The repository later received the separate Analytics v2 commit `df5f78f`; that does not change the catalog validation baseline. No production catalog migration, push or deployment was performed as part of this work.

**Actual implementation:** 30 → **46 selectable markets**, 48 → **78 canonical services**, 12 → **13 app languages**. Kuwait alone remains technically blocked: integer hundredths cannot represent all KWD thousandths without rounding. Its currency mapping is documented but it is not selectable. No other country is blocked on automatic price coverage or local-language availability.

16 newly selectable: JP, CA, SA, KR, MX, ID, TR, ZA, IL, QA, EG, VN, RO, GR, CL, CO. Explicit provider-backed country sets replace blanket global assumptions for these additions. Known available services can use manual prices. This is a useful launch catalog, **not complete Tier 1/Tier 2 coverage**: offered counts are below the desired mature-market breadth, and missing local/global services remain enumerated for further verification.

## Direct-first metrics

A verified ordinary recurring direct provider price proves both availability and that direct price. No extra availability proof is required. Apple/Google/operator evidence does not substitute for direct evidence.

[All 47 scorecards](country-coverage.md), [machine-readable classifications](markets.json), [candidate decisions](candidates.json), [provider availability evidence](market-expansion-evidence.json), [earlier research evidence](evidence.json), [every new price and source](direct-price-review.md), [language/RTL policy](language-readiness.md), [preservation](preservation.json), [validation](operation-validation.md).

Historical verified snapshots remain safe fallbacks, but are **not** relabeled freshly rechecked. Direct % uses offered services as denominator; JSON also reports the larger identified-candidate denominator. Unverified historical availability remains explicitly flagged, preserving existing working behavior rather than deleting saved records.

## Additive persistence

016 Storytel and 017 RTL+/Videoland/Nintendo Switch Online/OSN+ remain prepared. New 018 adds the 30 new canonical identities. All are INSERT-only, transactional, `ON CONFLICT (slug) DO NOTHING`; local disposable tests run them twice and verify existing rows unchanged. Deployment must apply any actually pending 016 → 017 → 018 before backend/new-client use of those canonical identities. **Do not rerun already-applied 011–015.** No production migration was executed. Rollback cannot safely discard subscriptions subsequently created against new service identities.

## Preserved boundaries

Existing registry rows and offline prices are exact-preservation checked against both the committed and continuation snapshots. Pricing-adapters changes only add verified rows/registry-backed adapters; resolver/source-agreement logic is unchanged. Unknown/manual identities never become Netflix. Build 12's legacy manual identity negotiation remains unchanged. Saved data, selected-market PDF/AI scoping, language/market independence, grouped picker/manual option, header/plan card and IAP are covered by regression tests.

No website/admin, analytics activation, dependencies, root app.json, protected .htaccess, bilder/, purchase logic or build number changes. See validation for remaining physical checks and exact commands.
