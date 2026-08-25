import assert from "node:assert/strict";
import test from "node:test";

import {
  resolvePriceCandidates
} from "./pricing-adapters.js";

const ctx = {
  countryCode: "NO",
  currency: "NOK"
};

function item(
  price: number,
  overrides: Record<string, unknown> = {}
) {
  return {
    serviceSlug: "test-service",
    planSlug: "individual",
    planName: "Individual",
    billingProviderSlug: "direct",
    countryCode: "NO",
    currency: "NOK",
    monthlyPriceMinor: price,
    updatedAt: new Date().toISOString(),
    source: "test",
    sourceUrl: "https://example.com",
    confidence: "test",
    priceType: "exact",
    ...overrides
  };
}

function candidate(
  price: number,
  sourceKind:
    | "verified-registry"
    | "official-provider-page"
    | "official-help-page"
    | "official-api"
    | "official-store-page",
  priority: number,
  overrides: Record<string, unknown> = {}
) {
  return {
    item: item(price, overrides),
    sourceKind,
    priority
  };
}

test(
  "rejects candidates from the wrong country",
  () => {
    const result = resolvePriceCandidates(
      ctx,
      [
        candidate(
          16900,
          "official-provider-page",
          70,
          { countryCode: "SE" }
        )
      ] as any
    );

    assert.equal(result.length, 0);
  }
);

test(
  "rejects candidates using the wrong currency",
  () => {
    const result = resolvePriceCandidates(
      ctx,
      [
        candidate(
          16900,
          "official-provider-page",
          70,
          { currency: "SEK" }
        )
      ] as any
    );

    assert.equal(result.length, 0);
  }
);

test(
  "rejects zero prices and non-exact prices",
  () => {
    const result = resolvePriceCandidates(
      ctx,
      [
        candidate(
          0,
          "official-provider-page",
          70
        ),
        candidate(
          16900,
          "official-provider-page",
          70,
          { priceType: "range" }
        )
      ] as any
    );

    assert.equal(result.length, 0);
  }
);

test(
  "verified registry beats a weaker conflicting source",
  () => {
    const result = resolvePriceCandidates(
      ctx,
      [
        candidate(
          16900,
          "verified-registry",
          100
        ),
        candidate(
          17900,
          "official-provider-page",
          70
        )
      ] as any
    );

    assert.equal(result.length, 1);
    assert.equal(
      result[0]?.monthlyPriceMinor,
      16900
    );
    assert.equal(
      result[0]?.verification,
      "registry"
    );
  }
);

test(
  "equal-strength conflicting prices are rejected",
  () => {
    const result = resolvePriceCandidates(
      ctx,
      [
        candidate(
          16900,
          "official-provider-page",
          70
        ),
        candidate(
          17900,
          "official-provider-page",
          70
        )
      ] as any
    );

    assert.equal(result.length, 0);
  }
);

test(
  "two independent official source kinds can verify agreement",
  () => {
    const result = resolvePriceCandidates(
      ctx,
      [
        candidate(
          16900,
          "official-provider-page",
          70
        ),
        candidate(
          16900,
          "official-store-page",
          75
        )
      ] as any
    );

    assert.equal(result.length, 1);

    assert.equal(
      result[0]?.monthlyPriceMinor,
      16900
    );

    assert.equal(
      result[0]?.verification,
      "multi-source"
    );

    assert.equal(
      result[0]?.sourceCount,
      2
    );

    assert.equal(
      result[0]?.verifiedByAgreement,
      true
    );
  }
);

test(
  "duplicate evidence from one source kind is not multi-source",
  () => {
    const result = resolvePriceCandidates(
      ctx,
      [
        candidate(
          16900,
          "official-provider-page",
          70
        ),
        candidate(
          16900,
          "official-provider-page",
          70
        )
      ] as any
    );

    assert.equal(result.length, 1);

    assert.equal(
      result[0]?.verification,
      "single-source"
    );

    assert.equal(
      result[0]?.sourceCount,
      1
    );

    assert.equal(
      result[0]?.verifiedByAgreement,
      false
    );
  }
);

test(
  "same plan on different billing routes resolves independently",
  () => {
    const direct = candidate(
      16900,
      "official-provider-page",
      70,
      {
        billingProviderSlug: "direct"
      }
    );

    const apple = candidate(
      18900,
      "official-store-page",
      75,
      {
        billingProviderSlug: "apple"
      }
    );

    const result = resolvePriceCandidates(
      ctx,
      [direct, apple] as any
    );

    assert.equal(result.length, 2);

    const byRoute = new Map(
      result.map((row) => [
        row.billingProviderSlug,
        row.monthlyPriceMinor
      ])
    );

    assert.equal(
      byRoute.get("direct"),
      16900
    );

    assert.equal(
      byRoute.get("apple"),
      18900
    );
  }
);

test(
  "billing-route conflicts do not conflict across routes",
  () => {
    const result = resolvePriceCandidates(
      ctx,
      [
        candidate(
          16900,
          "official-provider-page",
          70,
          {
            billingProviderSlug: "direct"
          }
        ),
        candidate(
          19900,
          "official-provider-page",
          70,
          {
            billingProviderSlug: "apple"
          }
        )
      ] as any
    );

    assert.equal(result.length, 2);
  }
);

test(
  "single live source cannot replace verified registry price",
  () => {
    const result = resolvePriceCandidates(
      ctx,
      [
        candidate(
          16900,
          "verified-registry",
          100
        ),
        candidate(
          17900,
          "official-provider-page",
          70
        )
      ] as any
    );

    assert.equal(result.length, 1);
    assert.equal(
      result[0]?.monthlyPriceMinor,
      16900
    );
    assert.equal(
      result[0]?.verification,
      "registry"
    );
  }
);

test(
  "two independent live official sources can replace stale registry price",
  () => {
    const result = resolvePriceCandidates(
      ctx,
      [
        candidate(
          16900,
          "verified-registry",
          100
        ),
        candidate(
          17900,
          "official-provider-page",
          70
        ),
        candidate(
          17900,
          "official-help-page",
          80
        )
      ] as any
    );

    assert.equal(result.length, 1);

    assert.equal(
      result[0]?.monthlyPriceMinor,
      17900
    );

    assert.equal(
      result[0]?.verification,
      "multi-source"
    );

    assert.equal(
      result[0]?.sourceCount,
      2
    );

    assert.equal(
      result[0]?.verifiedByAgreement,
      true
    );
  }
);
