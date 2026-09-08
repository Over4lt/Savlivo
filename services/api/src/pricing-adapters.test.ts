import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  parseNetflixStructuredPrices,
  parseAppleTvPlusNorwayPrice,
  parseAppleTvPlusInternationalPrice,
  parsePrimeVideoNorwayPrice,
  parsePrimeVideoPrice,
  parseAmazonPrimeMonthlyPrice,
  crossCheckSpotifyStructuredPrices,
  findSpotifyRecurringPrices,
  parseSpotifyFaqPrices,
  parseSpotifyNextData,
  providerAdapters,
  parseGoogleOnePricingAssets,
  parseGoogleOnePricingFilename,
  discoverGoogleOnePricingFilename,
  parseGoogleOneMarket,
  parseGoogleOneStructuredPrices,
  parseGoogleOnePricingFeed,
  parseMaxStructuredPrices,
  parseICloudPlusPrices,
  parseICloudSupportPrices,
  verifiedProviderRegistry,
  parseMicrosoft365Prices,
  parseMicrosoft365BasicPrice,
  parseMicrosoft365ChinaPrices,
  parseMicrosoft365InternationalPrices,
  parseDisneyPlusCardRecurringPrices,
  parseDisneyPlusLocalizedCardPrices,
  parseDisneyPlusCurrentPriceFootnote,
  crossCheckDisneyPlusPrices,
  parseAppleMusicPrices,
  verifyAppleStorefrontIdentity,
  parseYoukuChinaPrices,
  parseYouTubePremiumPrices,
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
    | "official-provider-structured"
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


test(
  "Spotify parser ignores introductory prices",
  () => {
    const text = [
      "Premium Individual",
      "0 kr for 3 months, then 139 kr per month",
      "Premium Student",
      "0 kr for 1 month, then 75 kr per month"
    ].join(" ");

    const result =
      findSpotifyRecurringPrices(
        text,
        "NOK"
      );

    assert.deepEqual(
      result,
      [
        {
          planName: "Individual",
          amount: 139
        },
        {
          planName: "Student",
          amount: 75
        }
      ]
    );
  }
);

test(
  "Spotify parser extracts normal recurring prices",
  () => {
    const text = [
      "Premium Duo 189 kr per month",
      "Premium Family 219 kr per month"
    ].join(" ");

    const result =
      findSpotifyRecurringPrices(
        text,
        "NOK"
      );

    assert.deepEqual(
      result,
      [
        {
          planName: "Duo",
          amount: 189
        },
        {
          planName: "Family",
          amount: 219
        }
      ]
    );
  }
);


test(
  "authoritative structured provider price can supersede stale registry",
  () => {
    const result = resolvePriceCandidates(
      ctx,
      [
        candidate(
          13900,
          "verified-registry",
          100
        ),
        candidate(
          14900,
          "official-provider-structured",
          110
        )
      ] as any
    );

    assert.equal(result.length, 1);
    assert.equal(
      result[0]?.monthlyPriceMinor,
      14900
    );
  }
);


test(
  "Spotify structured parser handles localized object storefront",
  () => {
    const data = {
      props: {
        pageProps: {
          basePageProps: {
            country: "FR"
          },
          components: {
            storefront: {
              plans: [
                {
                  planId: "PREMIUM_INDIVIDUAL",
                  shortPlanName: "Personnel",
                  isRecurringProduct: true,
                  primaryPriceDescription:
                    "0 € pour 3 mois",
                  secondaryPriceDescription:
                    "12,14 €/mois ensuite"
                },
                {
                  planId: "PREMIUM_STUDENT",
                  shortPlanName: "Étudiants",
                  isRecurringProduct: true,
                  primaryPriceDescription:
                    "0 € pour 1 mois",
                  secondaryPriceDescription:
                    "7,07 €/mois ensuite"
                },
                {
                  planId: "PREMIUM_DUO",
                  shortPlanName: "Duo",
                  isRecurringProduct: true,
                  primaryPriceDescription:
                    "17,20 €/mois",
                  secondaryPriceDescription: null
                },
                {
                  planId: "PREMIUM_FAMILY",
                  shortPlanName: "Famille",
                  isRecurringProduct: true,
                  primaryPriceDescription:
                    "21,24 €/mois",
                  secondaryPriceDescription: null
                }
              ]
            }
          }
        }
      }
    };

    const html =
      '<script id="__NEXT_DATA__" type="application/json">' +
      JSON.stringify(data) +
      "</script>";

    assert.deepEqual(
      parseSpotifyNextData(
        html,
        "EUR",
        "FR"
      ),
      [
        {
          planName: "Individual",
          amount: 12.14
        },
        {
          planName: "Student",
          amount: 7.07
        },
        {
          planName: "Duo",
          amount: 17.2
        },
        {
          planName: "Family",
          amount: 21.24
        }
      ]
    );
  }
);

test(
  "Spotify structured parser handles array component layout",
  () => {
    const data = {
      props: {
        pageProps: {
          basePageProps: {
            country: "IE"
          },
          components: [
            {
              name: "ScrollingHero",
              attributes: {}
            },
            {
              name: "StorefrontFeatureGrid",
              attributes: {
                plans: [
                  {
                    planId:
                      "PREMIUM_INDIVIDUAL",
                    shortPlanName:
                      "Individual",
                    isRecurringProduct: true,
                    primaryPriceDescription:
                      "€0 for 3 months",
                    secondaryPriceDescription:
                      "€12.99/month after"
                  },
                  {
                    planId:
                      "PREMIUM_STUDENT",
                    shortPlanName:
                      "Student",
                    isRecurringProduct: true,
                    primaryPriceDescription:
                      "€0 for 1 month",
                    secondaryPriceDescription:
                      "€6.99/month after"
                  },
                  {
                    planId:
                      "PREMIUM_DUO",
                    shortPlanName:
                      "Duo",
                    isRecurringProduct: true,
                    primaryPriceDescription:
                      "€18.99 / month",
                    secondaryPriceDescription:
                      null
                  },
                  {
                    planId:
                      "PREMIUM_FAMILY",
                    shortPlanName:
                      "Family",
                    isRecurringProduct: true,
                    primaryPriceDescription:
                      "€22.99 / month",
                    secondaryPriceDescription:
                      null
                  }
                ]
              }
            }
          ]
        }
      }
    };

    const html =
      '<script id="__NEXT_DATA__" type="application/json">' +
      JSON.stringify(data) +
      "</script>";

    assert.deepEqual(
      parseSpotifyNextData(
        html,
        "EUR",
        "IE"
      ),
      [
        {
          planName: "Individual",
          amount: 12.99
        },
        {
          planName: "Student",
          amount: 6.99
        },
        {
          planName: "Duo",
          amount: 18.99
        },
        {
          planName: "Family",
          amount: 22.99
        }
      ]
    );
  }
);

test(
  "Spotify structured parser ignores punctuation before decimal-comma recurring price",
  () => {
    const nextData = {
      props: {
        pageProps: {
          basePageProps: {
            country: "ES"
          },
          components: {
            storefront: {
              plans: [
                {
                  planId:
                    "PREMIUM_INDIVIDUAL",
                  isRecurringProduct: true,
                  shortPlanName:
                    "Individual",
                  primaryPriceDescription:
                    "0 € durante 3 meses",
                  secondaryPriceDescription:
                    "Después, 11,99 €/mes",
                  subheaderPrice:
                    "GRATIS"
                },
                {
                  planId:
                    "PREMIUM_STUDENT",
                  isRecurringProduct: true,
                  shortPlanName:
                    "Estudiantes",
                  primaryPriceDescription:
                    "0 € durante 1 mes",
                  secondaryPriceDescription:
                    "Después, 6,49 €/mes",
                  subheaderPrice:
                    "GRATIS"
                }
              ]
            }
          }
        }
      }
    };

    const html =
      '<script id="__NEXT_DATA__" type="application/json">' +
      JSON.stringify(nextData) +
      "</script>";

    assert.deepEqual(
      parseSpotifyNextData(
        html,
        "EUR",
        "ES"
      ),
      [
        {
          planName: "Individual",
          amount: 11.99
        },
        {
          planName: "Student",
          amount: 6.49
        }
      ]
    );
  }
);


test(
  "Spotify structured parser rejects wrong embedded country",
  () => {
    const data = {
      props: {
        pageProps: {
          basePageProps: {
            country: "US"
          },
          components: {
            storefront: {
              plans: [
                {
                  planId:
                    "PREMIUM_INDIVIDUAL",
                  isRecurringProduct: true,
                  secondaryPriceDescription:
                    "$12.99 / month after"
                }
              ]
            }
          }
        }
      }
    };

    const html =
      '<script id="__NEXT_DATA__" type="application/json">' +
      JSON.stringify(data) +
      "</script>";

    assert.deepEqual(
      parseSpotifyNextData(
        html,
        "USD",
        "XX"
      ),
      []
    );
  }
);


test(
  "Spotify FAQ parser extracts recurring prices",
  () => {
    const data = {
      props: {
        pageProps: {
          components: {
            faq: {
              faqEntry: [
                {
                  question:
                    "How much is Spotify Premium in Norway?",
                  answer:
                    "The Spotify Premium Individual plan costs 139 kr per month, the Premium Duo plan costs 189 kr per month, the Premium Family plan costs 219 kr per month, the Premium Student plan costs 75 kr per month."
                }
              ]
            }
          }
        }
      }
    };

    const html =
      '<script id="__NEXT_DATA__" type="application/json">' +
      JSON.stringify(data) +
      "</script>";

    assert.deepEqual(
      parseSpotifyFaqPrices(
        html,
        "NOK"
      ),
      [
        {
          planName: "Individual",
          amount: 139
        },
        {
          planName: "Duo",
          amount: 189
        },
        {
          planName: "Family",
          amount: 219
        },
        {
          planName: "Student",
          amount: 75
        }
      ]
    );
  }
);

test(
  "Spotify structured cross-check keeps only agreeing prices",
  () => {
    const result =
      crossCheckSpotifyStructuredPrices(
        [
          {
            planName: "Individual",
            amount: 149
          },
          {
            planName: "Duo",
            amount: 189
          }
        ],
        [
          {
            planName: "Individual",
            amount: 139
          },
          {
            planName: "Duo",
            amount: 189
          }
        ]
      );

    assert.deepEqual(
      result,
      [
        {
          planName: "Duo",
          amount: 189
        }
      ]
    );
  }
);


test(
  "Google One market parser extracts provider-owned Norway market",
  () => {
    const html = `
<script>
AF_initDataCallback({key: 'ds:0', hash: '1', data:[[null,null,null,2,1,null,"NO",1,[1,3]]], sideChannel: {}});
</script>
`;

    assert.equal(
      parseGoogleOneMarket(html),
      "NO"
    );
  }
);

test(
  "Google One market parser extracts provider-owned US market",
  () => {
    const html = `
<script>
AF_initDataCallback({key: 'ds:0', hash: '1', data:[[null,null,null,2,1,null,"US",1,[1,3]]], sideChannel: {}});
</script>
`;

    assert.equal(
      parseGoogleOneMarket(html),
      "US"
    );
  }
);

test(
  "Google One market parser rejects missing ds:0 market identity",
  () => {
    const html = `
<script>
AF_initDataCallback({key: 'ds:2', hash: '2', data:[]});
</script>
`;

    assert.equal(
      parseGoogleOneMarket(html),
      null
    );
  }
);

test(
  "Google One structured parser extracts recurring monthly plans",
  () => {
    const html = `
<script>
AF_initDataCallback({key: 'ds:2', hash: '2', data:[
[[["107374182400","100 GB"],2,["24000000","24 kr","NOK"],["2000000","g1.100gb","pkg"],"100 GB","24 kr per måned",["Storage"],null,null,"Basic"]],
[[["2199023255552","2 TB"],2,["125000000","125 kr","NOK"],["10000000","g1.2tb","pkg"],"2 TB","125 kr per måned",["AI"],null,null,"Google AI Plus"]],
[[["5497558138880","5 TB"],2,["259000000","259 kr","NOK"],["20000000","g1.2tb.ai","pkg"],"5 TB","259 kr per måned",["AI"],null,null,"Google AI Pro"]]
]});
</script>
`;

    assert.deepEqual(
      parseGoogleOneStructuredPrices(
        html,
        "NOK"
      ),
      [
        {
          planName: "Storage 100 GB",
          amount: 24,
          productId: "g1.100gb",
          storageLabel: "100 GB"
        },
        {
          planName: "Google AI Plus — 2 TB",
          amount: 125,
          productId: "g1.2tb",
          storageLabel: "2 TB"
        },
        {
          planName: "Google AI Pro — 5 TB",
          amount: 259,
          productId: "g1.2tb.ai",
          storageLabel: "5 TB"
        }
      ]
    );
  }
);

test(
  "Google One structured parser rejects wrong currency",
  () => {
    const html = `
<script>
AF_initDataCallback({key: 'ds:2', hash: '2', data:[
[[["107374182400","100 GB"],2,["24000000","24 kr","SEK"],["2000000","g1.100gb","pkg"],"100 GB","24 kr per månad",null,null,null,"Basic"]]
]});
</script>
`;

    assert.deepEqual(
      parseGoogleOneStructuredPrices(
        html,
        "NOK"
      ),
      []
    );
  }
);

test(
  "Google One structured parser rejects annual products and savings text",
  () => {
    const html = `
<script>
AF_initDataCallback({key: 'ds:2', hash: '2', data:[
[[["107374182400","100 GB"],1,["239000000","239 kr","NOK"],["20000000","g1.100gb.annual","pkg"],"100 GB","239 kr per år",null,"Det er 19,92 kr per måned",null,"Basic"]]
]});
</script>
`;

    assert.deepEqual(
      parseGoogleOneStructuredPrices(
        html,
        "NOK"
      ),
      []
    );
  }
);

test(
  "Google One structured parser accepts English slash-month formatting",
  () => {
    const html = `
<script>
AF_initDataCallback({key: 'ds:2', hash: '2', data:[
[[["107374182400","100 GB"],2,["24000000","NOK 24","NOK"],["2000000","g1.100gb","pkg"],"100 GB","NOK 24 / month",null,null,null,"Basic"]]
]});
</script>
`;

    assert.deepEqual(
      parseGoogleOneStructuredPrices(
        html,
        "NOK"
      ),
      [
        {
          planName: "Storage 100 GB",
          amount: 24,
          productId: "g1.100gb",
          storageLabel: "100 GB"
        }
      ]
    );
  }
);

test(
  "Google One pricing feed parser extracts provider-owned monthly prices",
  () => {
    const json = JSON.stringify({
      COUNTRY_CODE: "SE",
      CURRENCY_CODE: "SEK",
      PRICE_100_MONTHLY: 19,
      PRICE_200_MONTHLY: 29,
      PRICE_GEN_AI_PLUS_MONTHLY: 55,
      PRICE_GEN_AI_PRO_MONTHLY: 255,
      PRICE_FREE: 0
    });

    assert.deepEqual(
      parseGoogleOnePricingFeed(
        json,
        "SE",
        "SEK"
      ),
      [
        { planName: "Storage 100 GB", amount: 19 },
        { planName: "Storage 200 GB", amount: 29 },
        { planName: "Google AI Plus", amount: 55 },
        { planName: "Google AI Pro", amount: 255 }
      ]
    );
  }
);

test(
  "Google One pricing feed parser rejects wrong country or currency",
  () => {
    const json = JSON.stringify({
      COUNTRY_CODE: "SE",
      CURRENCY_CODE: "SEK",
      PRICE_100_MONTHLY: 19
    });

    assert.deepEqual(
      parseGoogleOnePricingFeed(json, "NO", "SEK"),
      []
    );

    assert.deepEqual(
      parseGoogleOnePricingFeed(json, "SE", "NOK"),
      []
    );
  }
);

test(
  "Max structured parser extracts Norway monthly plans",
  () => {
    const html = `
{
  "productName":{
    "richTextHtml":"<p>Basis med reklame</p>",
    "plainText":"Basis med reklame"
  },
  "price":{
    "format":"{{amount}} {{currency}}/{{period}}",
    "currencyCode":"NOK",
    "amount":{
      "richTextHtml":"<p>89,00</p>",
      "plainText":"89,00"
    },
    "period":{
      "richTextHtml":"<p>måned</p>",
      "plainText":"måned"
    },
    "currency":{
      "richTextHtml":"<p>kr</p>",
      "plainText":"kr"
    }
  },
  "pricePlan":{"id":"24902"}
},
{
  "productName":{
    "richTextHtml":"<p>Standard</p>",
    "plainText":"Standard"
  },
  "price":{
    "format":"{{amount}} {{currency}}/{{period}}",
    "currencyCode":"NOK",
    "amount":{
      "richTextHtml":"<p>149,00</p>",
      "plainText":"149,00"
    },
    "period":{
      "richTextHtml":"<p>måned</p>",
      "plainText":"måned"
    },
    "currency":{
      "richTextHtml":"<p>kr</p>",
      "plainText":"kr"
    }
  },
  "pricePlan":{"id":"34704"}
},
{
  "productName":{
    "richTextHtml":"<p>Premium</p>",
    "plainText":"Premium"
  },
  "price":{
    "format":"{{amount}} {{currency}}/{{period}}",
    "currencyCode":"NOK",
    "amount":{
      "richTextHtml":"<p>189,00</p>",
      "plainText":"189,00"
    },
    "period":{
      "richTextHtml":"<p>måned</p>",
      "plainText":"måned"
    },
    "currency":{
      "richTextHtml":"<p>kr</p>",
      "plainText":"kr"
    }
  },
  "pricePlan":{"id":"34713"}
}
`;

    assert.deepEqual(
      parseMaxStructuredPrices(
        html,
        "NOK"
      ),
      [
        {
          planName:
            "Basic With Ads",
          amount: 89,
          pricePlanId: "24902"
        },
        {
          planName: "Standard",
          amount: 149,
          pricePlanId: "34704"
        },
        {
          planName: "Premium",
          amount: 189,
          pricePlanId: "34713"
        }
      ]
    );
  }
);

test(
  "Max structured parser supports verified localized monthly records",
  () => {
    const html = `
{
  "productName":{"plainText":"Basic avec pub"},
  "price":{
    "format":"x",
    "currencyCode":"EUR",
    "amount":{"plainText":"6,99"},
    "period":{"plainText":"mois"},
    "currency":{"plainText":"€"}
  },
  "pricePlan":{"id":"38611"}
}
{
  "productName":{"plainText":"Base con pubblicità"},
  "price":{
    "format":"x",
    "currencyCode":"EUR",
    "amount":{"plainText":"6,99"},
    "period":{"plainText":"mese"},
    "currency":{"plainText":"€"}
  },
  "pricePlan":{"id":"38950"}
}
{
  "productName":{"plainText":"Basic com anúncios"},
  "price":{
    "format":"x",
    "currencyCode":"EUR",
    "amount":{"plainText":"5,99"},
    "period":{"plainText":"mês"},
    "currency":{"plainText":"€"}
  },
  "pricePlan":{"id":"31016"}
}
{
  "productName":{"plainText":"Standaard"},
  "price":{
    "format":"x",
    "currencyCode":"EUR",
    "amount":{"plainText":"11,99"},
    "period":{"plainText":"maand"},
    "currency":{"plainText":"€"}
  },
  "pricePlan":{"id":"34700"}
}
{
  "productName":{"plainText":"Basic (mainoksilla)"},
  "price":{
    "format":"x",
    "currencyCode":"EUR",
    "amount":{"plainText":"6,99"},
    "period":{"plainText":"kuukausi"},
    "currency":{"plainText":"€"}
  },
  "pricePlan":{"id":"30918"}
}
`;

    assert.deepEqual(
      parseMaxStructuredPrices(
        html,
        "EUR"
      ),
      [
        {
          planName:
            "Basic With Ads",
          amount: 6.99,
          pricePlanId: "38611"
        },
        {
          planName:
            "Basic With Ads",
          amount: 6.99,
          pricePlanId: "38950"
        },
        {
          planName:
            "Basic With Ads",
          amount: 5.99,
          pricePlanId: "31016"
        },
        {
          planName: "Standard",
          amount: 11.99,
          pricePlanId: "34700"
        },
        {
          planName:
            "Basic With Ads",
          amount: 6.99,
          pricePlanId: "30918"
        }
      ]
    );
  }
);

test(
  "Max structured parser supports Swedish and Danish monthly records",
  () => {
    const html = `
{
  "productName":{"plainText":"Basic med reklam"},
  "price":{
    "format":"x",
    "currencyCode":"SEK",
    "amount":{"plainText":"89,00"},
    "period":{"plainText":"månad"},
    "currency":{"plainText":"kr"}
  },
  "pricePlan":{"id":"24905"}
}
{
  "productName":{"plainText":"Basis med reklamer"},
  "price":{
    "format":"x",
    "currencyCode":"DKK",
    "amount":{"plainText":"79,00"},
    "period":{"plainText":"måned"},
    "currency":{"plainText":"kr"}
  },
  "pricePlan":{"id":"24899"}
}
`;

    assert.deepEqual(
      parseMaxStructuredPrices(
        html,
        "SEK"
      ),
      [
        {
          planName:
            "Basic With Ads",
          amount: 89,
          pricePlanId: "24905"
        }
      ]
    );

    assert.deepEqual(
      parseMaxStructuredPrices(
        html,
        "DKK"
      ),
      [
        {
          planName:
            "Basic With Ads",
          amount: 79,
          pricePlanId: "24899"
        }
      ]
    );
  }
);

test(
  "Max structured parser rejects annual and wrong-currency records",
  () => {
    const html = `
{
  "productName":{
    "richTextHtml":"<p>Standard</p>",
    "plainText":"Standard"
  },
  "price":{
    "format":"{{amount}} {{currency}}/{{period}}",
    "currencyCode":"NOK",
    "amount":{
      "richTextHtml":"<p>1490,00</p>",
      "plainText":"1490,00"
    },
    "period":{
      "richTextHtml":"<p>år</p>",
      "plainText":"år"
    },
    "currency":{
      "richTextHtml":"<p>kr</p>",
      "plainText":"kr"
    }
  },
  "pricePlan":{"id":"annual"}
},
{
  "productName":{
    "richTextHtml":"<p>Standard</p>",
    "plainText":"Standard"
  },
  "price":{
    "format":"{{amount}} {{currency}}/{{period}}",
    "currencyCode":"SEK",
    "amount":{
      "richTextHtml":"<p>149,00</p>",
      "plainText":"149,00"
    },
    "period":{
      "richTextHtml":"<p>måned</p>",
      "plainText":"måned"
    },
    "currency":{
      "richTextHtml":"<p>kr</p>",
      "plainText":"kr"
    }
  },
  "pricePlan":{"id":"wrong-currency"}
}
`;

    assert.deepEqual(
      parseMaxStructuredPrices(
        html,
        "NOK"
      ),
      []
    );
  }
);
test(
  "iCloud+ parser extracts all Norway monthly paid tiers",
  () => {
    const html = `
<div class="plan-list-item plan-50gb">
  <p>
    kr 12
    <span>pr. md.</span>
    <span>per måned</span>
  </p>
</div>

<div class="plan-list-item plan-200gb">
  <p>
    kr 39
    <span>pr. md.</span>
    <span>per måned</span>
  </p>
</div>

<div class="plan-list-item plan-2tb">
  <p>
    kr 129
    <span>pr. md.</span>
    <span>per måned</span>
  </p>
</div>

<div class="plan-list-item plan-6tb">
  <p>
    kr 399
    <span>pr. md.</span>
    <span>per måned</span>
  </p>
</div>

<div class="plan-list-item plan-12tb">
  <p>
    kr 799
    <span>pr. md.</span>
    <span>per måned</span>
  </p>
</div>
`;

    assert.deepEqual(
      parseICloudPlusPrices(
        html,
        "NOK"
      ),
      [
        {
          planName: "50 GB",
          amount: 12
        },
        {
          planName: "200 GB",
          amount: 39
        },
        {
          planName: "2 TB",
          amount: 129
        },
        {
          planName: "6 TB",
          amount: 399
        },
        {
          planName: "12 TB",
          amount: 799
        }
      ]
    );
  }
);

test(
  "iCloud+ parser handles US, Swedish and Danish monthly formats",
  () => {
    const fixture = (
      prices: string[]
    ) => `
<div class="plan-list-item plan-50gb">
  ${prices[0]}
</div>
<div class="plan-list-item plan-200gb">
  ${prices[1]}
</div>
<div class="plan-list-item plan-2tb">
  ${prices[2]}
</div>
<div class="plan-list-item plan-6tb">
  ${prices[3]}
</div>
<div class="plan-list-item plan-12tb">
  ${prices[4]}
</div>
`;

    assert.deepEqual(
      parseICloudPlusPrices(
        fixture([
          "$0.99/month",
          "$2.99/month",
          "$9.99/month",
          "$29.99/month",
          "$59.99/month"
        ]),
        "USD"
      ),
      [
        { planName: "50 GB", amount: 0.99 },
        { planName: "200 GB", amount: 2.99 },
        { planName: "2 TB", amount: 9.99 },
        { planName: "6 TB", amount: 29.99 },
        { planName: "12 TB", amount: 59.99 }
      ]
    );

    assert.deepEqual(
      parseICloudPlusPrices(
        fixture([
          "12 kr/månad",
          "39 kr/månad",
          "129 kr/månad",
          "399 kr/månad",
          "799 kr/månad"
        ]),
        "SEK"
      ),
      [
        { planName: "50 GB", amount: 12 },
        { planName: "200 GB", amount: 39 },
        { planName: "2 TB", amount: 129 },
        { planName: "6 TB", amount: 399 },
        { planName: "12 TB", amount: 799 }
      ]
    );

    assert.deepEqual(
      parseICloudPlusPrices(
        fixture([
          "9 kr./måned",
          "25 kr./måned",
          "89 kr./måned",
          "269 kr./måned",
          "549 kr./måned"
        ]),
        "DKK"
      ),
      [
        { planName: "50 GB", amount: 9 },
        { planName: "200 GB", amount: 25 },
        { planName: "2 TB", amount: 89 },
        { planName: "6 TB", amount: 269 },
        { planName: "12 TB", amount: 549 }
      ]
    );
  }
);

test(
  "iCloud+ parser handles localized euro monthly formats",
  () => {
    const fixture = (
      suffix: string
    ) => `
<div class="plan-list-item plan-50gb">
  0,99 €/${suffix}
</div>
<div class="plan-list-item plan-200gb">
  2,99 €/${suffix}
</div>
<div class="plan-list-item plan-2tb">
  9,99 €/${suffix}
</div>
<div class="plan-list-item plan-6tb">
  29,99 €/${suffix}
</div>
<div class="plan-list-item plan-12tb">
  59,99 €/${suffix}
</div>
`;

    for (
      const suffix of [
        "Monat",
        "mois",
        "mese",
        "mes",
        "mês",
        "maand",
        "month",
        "kuukausi",
        "kk"
      ]
    ) {
      assert.deepEqual(
        parseICloudPlusPrices(
          fixture(suffix),
          "EUR"
        ),
        [
          { planName: "50 GB", amount: 0.99 },
          { planName: "200 GB", amount: 2.99 },
          { planName: "2 TB", amount: 9.99 },
          { planName: "6 TB", amount: 29.99 },
          { planName: "12 TB", amount: 59.99 }
        ]
      );
    }
  }
);

test(
  "iCloud+ parser extracts mainland China monthly paid tiers",
  () => {
    const html = `
<div class="plan-list-item small-centered plan-50gb">
  <span class="visuallyhidden">每月</span>
  <span>RMB 6<span>/月</span></span>
</div>
<div class="plan-list-item small-centered plan-200gb">
  <span class="visuallyhidden">每月</span>
  <span>RMB 21<span>/月</span></span>
</div>
<div class="plan-list-item small-centered plan-2tb">
  <span class="visuallyhidden">每月</span>
  <span>RMB 68<span>/月</span></span>
</div>
<div class="plan-list-item small-centered plan-6tb">
  <span class="visuallyhidden">每月</span>
  <span>RMB 198<span>/月</span></span>
</div>
<div class="plan-list-item small-centered plan-12tb">
  <span class="visuallyhidden">每月</span>
  <span>RMB 398<span>/月</span></span>
</div>
`;

    assert.deepEqual(
      parseICloudPlusPrices(
        html,
        "CNY"
      ),
      [
        { planName: "50 GB", amount: 6 },
        { planName: "200 GB", amount: 21 },
        { planName: "2 TB", amount: 68 },
        { planName: "6 TB", amount: 198 },
        { planName: "12 TB", amount: 398 }
      ]
    );
  }
);

test(
  "iCloud+ parser rejects partial, annual and wrong-currency data",
  () => {
    const partial = `
<div class="plan-list-item plan-50gb">
  $0.99/month
</div>
<div class="plan-list-item plan-200gb">
  $2.99/month
</div>
`;

    assert.deepEqual(
      parseICloudPlusPrices(
        partial,
        "USD"
      ),
      []
    );

    const annual = `
<div class="plan-list-item plan-50gb">
  9,99 € per year
</div>
<div class="plan-list-item plan-200gb">
  29,99 € per year
</div>
<div class="plan-list-item plan-2tb">
  99,99 € per year
</div>
<div class="plan-list-item plan-6tb">
  299,99 € per year
</div>
<div class="plan-list-item plan-12tb">
  599,99 € per year
</div>
`;

    assert.deepEqual(
      parseICloudPlusPrices(
        annual,
        "EUR"
      ),
      []
    );

    const usd = `
<div class="plan-list-item plan-50gb">$0.99/month</div>
<div class="plan-list-item plan-200gb">$2.99/month</div>
<div class="plan-list-item plan-2tb">$9.99/month</div>
<div class="plan-list-item plan-6tb">$29.99/month</div>
<div class="plan-list-item plan-12tb">$59.99/month</div>
`;

    assert.deepEqual(
      parseICloudPlusPrices(
        usd,
        "EUR"
      ),
      []
    );
  }
);

test(
  "Microsoft 365 Basic parser extracts only the monthly Norway SKU",
  () => {
    const html = `
      <div class="sku">
        <div class="sku__title">
          <h3 class="oc-product-title">
            Microsoft 365 Basic
          </h3>
        </div>
        <div class="sku__pricing">
          <span class="oc-displayListPrice">
            kr 199,00
          </span>
        </div>
        <div class="sku__detail-recurrence">
          <span class="oc-displayUnit">
            per år
          </span>
        </div>
      </div>

      <div class="sku">
        <div class="sku__title">
          <h3 class="oc-product-title">
            Microsoft 365 Basic
          </h3>
        </div>
        <div class="sku__pricing">
          <span class="oc-displayListPrice">
            kr 20,00
          </span>
        </div>
        <div class="sku__detail-recurrence">
          <span class="oc-displayUnit">
            per måned
          </span>
        </div>
      </div>
    `;

    assert.deepEqual(
      parseMicrosoft365BasicPrice(
        html,
        "NOK"
      ),
      {
        planName: "Basic",
        amount: 20
      }
    );
  }
);

test(
  "Microsoft 365 Basic parser rejects annual-only and wrong currency",
  () => {
    const annualOnly = `
      <div class="sku">
        <h3 class="oc-product-title">
          Microsoft 365 Basic
        </h3>
        <span class="oc-displayListPrice">
          kr 199,00
        </span>
        <span class="oc-displayUnit">
          per år
        </span>
      </div>
    `;

    assert.equal(
      parseMicrosoft365BasicPrice(
        annualOnly,
        "NOK"
      ),
      null
    );

    assert.equal(
      parseMicrosoft365BasicPrice(
        annualOnly,
        "USD"
      ),
      null
    );
  }
);

test(
  "Microsoft 365 parser extracts Norway monthly consumer plans",
  () => {
    const html = `
<div class="card">
  <h2 class="h4"> Microsoft 365 Personal </h2>
  <div class="buy-now-price sku1-price">
    <div class="h4 sku1price price-heading ">kr 121,00/måned</div>
  </div>
  <div class="buy-now-price sku2-price">
    <div class="h4 sku2price price-heading ">kr 1 189,00/år</div>
  </div>
</div>

<div class="card">
  <h2 class="h4"> Microsoft 365 Family </h2>
  <div class="buy-now-price sku1-price">
    <div class="h4 sku1price price-heading ">kr 155,00/måned</div>
  </div>
  <div class="buy-now-price sku2-price">
    <div class="h4 sku2price price-heading ">kr 1 559,00/år</div>
  </div>
</div>

<div class="card">
  <h2 class="h4"> Microsoft 365 Premium </h2>
  <div class="buy-now-price sku1-price">
    <div class="h4 sku1price price-heading ">kr 259,00/måned</div>
  </div>
  <div class="buy-now-price sku2-price">
    <div class="h4 sku2price price-heading ">kr 2 589,00/år</div>
  </div>
</div>
`;

    assert.deepEqual(
      parseMicrosoft365Prices(
        html,
        "NOK"
      ),
      [
        {
          planName: "Personal",
          amount: 121
        },
        {
          planName: "Family",
          amount: 155
        },
        {
          planName: "Premium",
          amount: 259
        }
      ]
    );
  }
);

test(
  "Microsoft 365 China parser extracts only explicit monthly Personal and Family prices",
  () => {
    const html = `
      <div class="card">
        <h2 class="h4"> Microsoft 365 家庭版 </h2>
        <div class="buy-now-price sku1-price">
          <div class="h4 sku1price price-heading ">¥50.00/月</div>
        </div>
        <div class="buy-now-price sku2-price">
          <div class="h4 sku2price price-heading ">¥498.00/年</div>
        </div>
      </div>

      <div class="card">
        <h2 class="h4"> Microsoft 365 个人版 </h2>
        <div class="buy-now-price sku1-price">
          <div class="h4 sku1price price-heading ">¥39.00/月</div>
        </div>
        <div class="buy-now-price sku2-price">
          <div class="h4 sku2price price-heading ">¥398.00/年</div>
        </div>
      </div>
    `;

    assert.deepEqual(
      parseMicrosoft365ChinaPrices(
        html,
        "CNY"
      ),
      [
        {
          planName: "Personal",
          amount: 39
        },
        {
          planName: "Family",
          amount: 50
        }
      ]
    );
  }
);

test(
  "Microsoft 365 China parser ignores navigation title duplicates before pricing cards",
  () => {
    const html = `
      <nav>
        <a>Microsoft 365 家庭版</a>
        <span data-name="Microsoft 365 家庭版">
          Microsoft 365 家庭版
        </span>
      </nav>

      <div class="card">
        <h2 class="h4">
          Microsoft 365 家庭版
        </h2>
        <div class="buy-now-price sku1-price">
          <div class="h4 sku1price price-heading ">¥50.00/月</div>
        </div>
        <div class="buy-now-price sku2-price">
          <div class="h4 sku2price price-heading ">¥498.00/年</div>
        </div>
      </div>

      <div class="card">
        <h2 class="h4"> Microsoft 365 个人版 </h2>
        <div class="buy-now-price sku1-price">
          <div class="h4 sku1price price-heading ">¥39.00/月</div>
        </div>
        <div class="buy-now-price sku2-price">
          <div class="h4 sku2price price-heading ">¥398.00/年</div>
        </div>
      </div>
    `;

    assert.deepEqual(
      parseMicrosoft365ChinaPrices(
        html,
        "CNY"
      ),
      [
        {
          planName: "Personal",
          amount: 39
        },
        {
          planName: "Family",
          amount: 50
        }
      ]
    );
  }
);

test(
  "Microsoft 365 China parser rejects partial, ambiguous, annual-only and wrong-currency data",
  () => {
    const complete = `
      <div class="card">
        <h2>Microsoft 365 个人版</h2>
        <div>¥39.00/月</div>
        <div>¥398.00/年</div>
      </div>
      <div class="card">
        <h2>Microsoft 365 家庭版</h2>
        <div>¥50.00/月</div>
        <div>¥498.00/年</div>
      </div>
    `;

    assert.deepEqual(
      parseMicrosoft365ChinaPrices(
        complete.replace(
          /<div class="card">\s*<h2>Microsoft 365 家庭版[\s\S]*$/,
          ""
        ),
        "CNY"
      ),
      []
    );

    assert.deepEqual(
      parseMicrosoft365ChinaPrices(
        complete.replace(
          /¥39\.00\/月/g,
          "¥398.00/年"
        ).replace(
          /¥50\.00\/月/g,
          "¥498.00/年"
        ),
        "CNY"
      ),
      []
    );

    assert.deepEqual(
      parseMicrosoft365ChinaPrices(
        complete.replace(
          "¥39.00/月",
          "¥39.00/月 ¥40.00/月"
        ),
        "CNY"
      ),
      []
    );

    assert.deepEqual(
      parseMicrosoft365ChinaPrices(
        complete,
        "USD"
      ),
      []
    );
  }
);

test(
  "Microsoft 365 international SKU parser binds monthly cards and canonicalizes localized titles",
  () => {
    const html = `
      <div class="sku">
        <h3 class="oc-product-title">Microsoft 365 Basic</h3>
        <span class="oc-displayListPrice">20,00 €</span>
        <span class="oc-displayUnit">/Jahr</span>
      </div>
      <div class="sku">
        <h3 class="oc-product-title">Microsoft 365 Single</h3>
        <span class="oc-displayListPrice">99,00 €</span>
        <span class="oc-displayUnit">/Jahr</span>
      </div>
      <div class="sku">
        <h3 class="oc-product-title">Microsoft 365 Family</h3>
        <span class="oc-displayListPrice">129,00 €</span>
        <span class="oc-displayUnit">/Jahr</span>
      </div>
      <div class="sku">
        <h3 class="oc-product-title">Microsoft 365 Premium</h3>
        <span class="oc-displayListPrice">219,00 €</span>
        <span class="oc-displayUnit">/Jahr</span>
      </div>

      <div class="sku">
        <h3 class="oc-product-title">Microsoft 365 Basic</h3>
        <span class="oc-displayListPrice">2,00 €</span>
        <span class="oc-displayUnit">/Monat</span>
      </div>
      <div class="sku">
        <h3 class="oc-product-title">Microsoft 365 Single</h3>
        <span class="oc-displayListPrice">10,00 €</span>
        <span class="oc-displayUnit">/Monat</span>
      </div>
      <div class="sku">
        <h3 class="oc-product-title">Microsoft 365 Family</h3>
        <span class="oc-displayListPrice">13,00 €</span>
        <span class="oc-displayUnit">/Monat</span>
      </div>
      <div class="sku">
        <h3 class="oc-product-title">Microsoft 365 Premium</h3>
        <span class="oc-displayListPrice">22,00 €</span>
        <span class="oc-displayUnit">/Monat</span>
      </div>
    `;

    assert.deepEqual(
      parseMicrosoft365InternationalPrices(
        html,
        "EUR"
      ),
      [
        {
          planName: "Basic",
          amount: 2
        },
        {
          planName: "Personal",
          amount: 10
        },
        {
          planName: "Family",
          amount: 13
        },
        {
          planName: "Premium",
          amount: 22
        }
      ]
    );
  }
);

test(
  "Microsoft 365 international SKU parser handles USD and rejects partial or annual-only sets",
  () => {
    const complete = `
      <div class="sku">
        <h3 class="oc-product-title">Microsoft 365 Basic</h3>
        <span class="oc-displayListPrice">$1.99</span>
        <span class="oc-displayUnit">/month</span>
      </div>
      <div class="sku">
        <h3 class="oc-product-title">Microsoft 365 Personal</h3>
        <span class="oc-displayListPrice">$9.99</span>
        <span class="oc-displayUnit">/month</span>
      </div>
      <div class="sku">
        <h3 class="oc-product-title">Microsoft 365 Family</h3>
        <span class="oc-displayListPrice">$12.99</span>
        <span class="oc-displayUnit">/month</span>
      </div>
      <div class="sku">
        <h3 class="oc-product-title">Microsoft 365 Premium</h3>
        <span class="oc-displayListPrice">$19.99</span>
        <span class="oc-displayUnit">/month</span>
      </div>
    `;

    assert.deepEqual(
      parseMicrosoft365InternationalPrices(
        complete,
        "USD"
      ),
      [
        {
          planName: "Basic",
          amount: 1.99
        },
        {
          planName: "Personal",
          amount: 9.99
        },
        {
          planName: "Family",
          amount: 12.99
        },
        {
          planName: "Premium",
          amount: 19.99
        }
      ]
    );

    assert.deepEqual(
      parseMicrosoft365InternationalPrices(
        complete.replace(
          /<div class="sku">[\s\S]*?Microsoft 365 Premium[\s\S]*?<\/div>/,
          ""
        ),
        "USD"
      ),
      []
    );

    assert.deepEqual(
      parseMicrosoft365InternationalPrices(
        complete.replace(
          /\/month/g,
          "/year"
        ),
        "USD"
      ),
      []
    );
  }
);

test(
  "Microsoft 365 international SKU parser handles Nordic and localized consumer titles",
  () => {
    const html = `
      <div class="sku">
        <h3 class="oc-product-title">Microsoft 365 Básico</h3>
        <span class="oc-displayListPrice">2,00 €</span>
        <span class="oc-displayUnit">al mes</span>
      </div>
      <div class="sku">
        <h3 class="oc-product-title">Microsoft 365 Personal</h3>
        <span class="oc-displayListPrice">10,00 €</span>
        <span class="oc-displayUnit">al mes</span>
      </div>
      <div class="sku">
        <h3 class="oc-product-title">Microsoft 365 Familia</h3>
        <span class="oc-displayListPrice">13,00 €</span>
        <span class="oc-displayUnit">al mes</span>
      </div>
      <div class="sku">
        <h3 class="oc-product-title">Microsoft 365 Premium</h3>
        <span class="oc-displayListPrice">22,00 €</span>
        <span class="oc-displayUnit">al mes</span>
      </div>
    `;

    assert.deepEqual(
      parseMicrosoft365InternationalPrices(
        html,
        "EUR"
      ),
      [
        {
          planName: "Basic",
          amount: 2
        },
        {
          planName: "Personal",
          amount: 10
        },
        {
          planName: "Family",
          amount: 13
        },
        {
          planName: "Premium",
          amount: 22
        }
      ]
    );
  }
);


test(
  "Microsoft 365 parser rejects Basic, annual-only and wrong currency",
  () => {
    const html = `
<div class="card">
  <h2 class="h4"> Microsoft 365 Basic </h2>
  <div class="h4 sku1price price-heading ">kr 20,00/måned</div>
</div>

<div class="card">
  <h2 class="h4"> Microsoft 365 Personal </h2>
  <div class="h4 sku2price price-heading ">kr 1 189,00/år</div>
</div>
`;

    assert.deepEqual(
      parseMicrosoft365Prices(
        html,
        "NOK"
      ),
      []
    );

    assert.deepEqual(
      parseMicrosoft365Prices(
        `
<div class="card">
  <h2 class="h4"> Microsoft 365 Personal </h2>
  <div class="h4 sku1price price-heading ">kr 121,00/måned</div>
</div>
`,
        "SEK"
      ),
      []
    );
  }
);
test(
  "Disney+ parsers cross-check normal recurring Norway prices",
  () => {
    const html = `
<a data-testid="l4l_premium">
  PREMIUM
</a>
<div>
  Fra 119 kr per måned
  Spar 25 % i 6 måneder,
  deretter betaler du 159 kr per måned
</div>

<a data-testid="l4l_standard">
  STANDARD
</a>
<div>
  Fra 89 kr per måned
  Spar 18 % i 6 måneder,
  deretter betaler du 109 kr per måned
</div>

<a data-testid="l4l_basic">
  STANDARD MED REKLAME
</a>
<div>
  Fra 59 kr per måned
  Spar 14 % i 6 måneder,
  deretter betaler du 69 kr per måned
</div>

<p>
  Etter tilbudsperioden betaler du gjeldende pris
  (for øyeblikket 159 kr per måned for Premium,
  109 kr per måned for Standard eller
  69 kr per måned for Standard med reklame).
</p>
`;

    const cards =
      parseDisneyPlusCardRecurringPrices(
        html,
        "NOK"
      );

    const footnote =
      parseDisneyPlusCurrentPriceFootnote(
        html,
        "NOK"
      );

    assert.deepEqual(
      crossCheckDisneyPlusPrices(
        cards,
        footnote
      ),
      [
        {
          planName: "Premium",
          amount: 159
        },
        {
          planName: "Standard",
          amount: 109
        },
        {
          planName: "Standard with Ads",
          amount: 69
        }
      ]
    );
  }
);

test(
  "Disney+ card parser ignores introductory prices",
  () => {
    const html = `
<a data-testid="l4l_premium">
  PREMIUM
</a>
<div>
  Fra 119 kr per måned
  deretter betaler du 159 kr per måned
</div>

<a data-testid="l4l_standard">
  STANDARD
</a>
<div>
  Fra 89 kr per måned
  deretter betaler du 109 kr per måned
</div>

<a data-testid="l4l_basic">
  STANDARD MED REKLAME
</a>
<div>
  Fra 59 kr per måned
  deretter betaler du 69 kr per måned
</div>
`;

    const result =
      parseDisneyPlusCardRecurringPrices(
        html,
        "NOK"
      );

    assert.deepEqual(
      result.map(
        (row) => row.amount
      ),
      [
        159,
        109,
        69
      ]
    );

    assert.equal(
      result.some(
        (row) =>
          [59, 89, 119].includes(
            row.amount
          )
      ),
      false
    );
  }
);

test(
  "Disney+ localized cards use structural plan identity",
  () => {
    const html = `
<a data-testid="l4l_basic">
  STANDARD MIT WERBUNG
</a>
<div>
  5,99 € pro Monat
</div>

<a data-testid="l4l_standard">
  STANDARD
</a>
<div>
  10,99 € pro Monat
</div>

<a data-testid="l4l_premium">
  PREMIUM
</a>
<div>
  15,99 € pro Monat
</div>
`;

    assert.deepEqual(
      parseDisneyPlusLocalizedCardPrices(
        html,
        "EUR"
      ),
      [
        {
          planName: "Standard with Ads",
          amount: 5.99
        },
        {
          planName: "Standard",
          amount: 10.99
        },
        {
          planName: "Premium",
          amount: 15.99
        }
      ]
    );
  }
);

test(
  "Disney+ localized cards support Nordic currency placement",
  () => {
    const html = `
<a data-testid="l4l_basic">
  STANDARD MED REKLAM
</a>
<div>
  59 kr per månad
</div>

<a data-testid="l4l_standard">
  STANDARD
</a>
<div>
  99 kr per månad
</div>

<a data-testid="l4l_premium">
  PREMIUM
</a>
<div>
  149 kr per månad
</div>
`;

    assert.deepEqual(
      parseDisneyPlusLocalizedCardPrices(
        html,
        "SEK"
      ),
      [
        {
          planName: "Standard with Ads",
          amount: 59
        },
        {
          planName: "Standard",
          amount: 99
        },
        {
          planName: "Premium",
          amount: 149
        }
      ]
    );
  }
);

test(
  "Disney+ localized cards choose post-promotion recurring price",
  () => {
    const html = `
<a data-testid="l4l_premium">
  PREMIUM
  Fra 109 kr./md
  Spar 26 % i 6 måneder,
  derefter 149 kr./md
</a>

<a data-testid="l4l_standard">
  STANDARD
  Vanaf € 8,99 per maand
  Bespaar 18% gedurende zes maanden,
  daarna betaal je € 10,99 per maand
</a>

<a data-testid="l4l_basic">
  STANDARD MAINOKSILLA
  Alkaen 5,99 € kuukaudessa
  Säästä 14 % kuuden kuukauden ajan,
  tämän jälkeen kuukausihinta on 6,99 €
</a>
`;

    assert.deepEqual(
      parseDisneyPlusLocalizedCardPrices(
        html,
        "DKK"
      ),
      [
        {
          planName: "Premium",
          amount: 149
        }
      ]
    );

    assert.deepEqual(
      parseDisneyPlusLocalizedCardPrices(
        html,
        "EUR"
      ),
      [
        {
          planName: "Standard",
          amount: 10.99
        },
        {
          planName: "Standard with Ads",
          amount: 6.99
        }
      ]
    );
  }
);

test(
  "Disney+ localized cards support Portuguese and Irish month suffixes",
  () => {
    const portuguese = `
<a data-testid="l4l_premium">
  PREMIUM
  Desde 11,99 €/mês
  Poupe 25% durante 6 meses,
  e depois pague 15,99 €/mês
</a>

<a data-testid="l4l_standard">
  STANDARD
  Desde 8,99 €/mês
  Poupe 18% durante 6 meses,
  e depois pague 10,99 €/mês
</a>

<a data-testid="l4l_basic">
  STANDARD COM ANÚNCIOS
  Desde 5,99 €/mês
  Poupe 14% durante 6 meses,
  e depois pague 6,99 €/mês
</a>
`;

    assert.deepEqual(
      parseDisneyPlusLocalizedCardPrices(
        portuguese,
        "EUR"
      ),
      [
        {
          planName: "Premium",
          amount: 15.99
        },
        {
          planName: "Standard",
          amount: 10.99
        },
        {
          planName: "Standard with Ads",
          amount: 6.99
        }
      ]
    );

    const ireland = `
<a data-testid="l4l_premium">
  PREMIUM
  From €11.99/mo
  Save 26% for 6 months,
  then €15.99/mo
</a>

<a data-testid="l4l_standard">
  STANDARD
  From €9.99/mo
  Save 20% for 6 months,
  then €11.99/mo
</a>

<a data-testid="l4l_basic">
  STANDARD WITH ADS
  From €7.99/mo
  Save 16% for 6 months,
  then €8.99/mo
</a>
`;

    assert.deepEqual(
      parseDisneyPlusLocalizedCardPrices(
        ireland,
        "EUR"
      ),
      [
        {
          planName: "Premium",
          amount: 15.99
        },
        {
          planName: "Standard",
          amount: 11.99
        },
        {
          planName: "Standard with Ads",
          amount: 8.99
        }
      ]
    );
  }
);

test(
  "Disney+ Finnish card chooses explicit post-promotion monthly price",
  () => {
    const html = `
<a data-testid="l4l_premium">
  PREMIUM
  Alkaen 11,99 € kuukaudessa
  Säästä 25 % kuuden kuukauden ajan,
  tämän jälkeen kuukausihinta on 15,99 €
</a>

<a data-testid="l4l_standard">
  STANDARD
  Alkaen 8,99 € kuukaudessa
  Säästä 18 % kuuden kuukauden ajan,
  tämän jälkeen kuukausihinta on 10,99 €
</a>

<a data-testid="l4l_basic">
  STANDARD MAINOKSILLA
  Alkaen 5,99 € kuukaudessa
  Säästä 14 % kuuden kuukauden ajan,
  tämän jälkeen kuukausihinta on 6,99 €
</a>
`;

    assert.deepEqual(
      parseDisneyPlusLocalizedCardPrices(
        html,
        "EUR"
      ),
      [
        {
          planName: "Premium",
          amount: 15.99
        },
        {
          planName: "Standard",
          amount: 10.99
        },
        {
          planName: "Standard with Ads",
          amount: 6.99
        }
      ]
    );
  }
);

test(
  "Disney+ localized parser rejects wrong currency and Norway",
  () => {
    const euroHtml = `
<a data-testid="l4l_premium">
  PREMIUM
</a>
<div>
  15,99 € per month
</div>
`;

    assert.deepEqual(
      parseDisneyPlusLocalizedCardPrices(
        euroHtml,
        "SEK"
      ),
      []
    );

    assert.deepEqual(
      parseDisneyPlusLocalizedCardPrices(
        `
<a data-testid="l4l_premium">
  PREMIUM
</a>
<div>
  159 kr per måned
</div>
`,
        "NOK"
      ),
      []
    );
  }
);

test(
  "Disney+ cross-check rejects disagreement and wrong currency",
  () => {
    const cards = [
      {
        planName: "Premium",
        amount: 159
      },
      {
        planName: "Standard",
        amount: 109
      },
      {
        planName: "Standard with Ads",
        amount: 69
      }
    ];

    const footnote = [
      {
        planName: "Premium",
        amount: 159
      },
      {
        planName: "Standard",
        amount: 999
      },
      {
        planName: "Standard with Ads",
        amount: 69
      }
    ];

    assert.deepEqual(
      crossCheckDisneyPlusPrices(
        cards,
        footnote
      ),
      [
        {
          planName: "Premium",
          amount: 159
        },
        {
          planName: "Standard with Ads",
          amount: 69
        }
      ]
    );

    assert.deepEqual(
      parseDisneyPlusCardRecurringPrices(
        `
<a data-testid="l4l_premium">
  PREMIUM
</a>
<div>
  deretter betaler du 159 kr per måned
</div>
`,
        "SEK"
      ),
      []
    );

    assert.deepEqual(
      parseDisneyPlusCurrentPriceFootnote(
        `
for øyeblikket 159 kr per måned for Premium,
109 kr per måned for Standard eller
69 kr per måned for Standard med reklame
`,
        "SEK"
      ),
      []
    );
  }
);


test(
  "Apple Music parser extracts the three Norway recurring monthly plans",
  () => {
    const html = `
      <li
        class="gallery-item"
        data-analytics-gallery-item-id="individual"
      >
        <h3>Individuelt abonnement</h3>
        <p>
          kr 139 per måned, og den første måneden
          er gratis for nye abonnenter.
        </p>
      </li>

      <li
        class="gallery-item"
        data-analytics-gallery-item-id="family"
      >
        <h3>Familieabonnement</h3>
        <p>
          kr 219 per måned, og én måned er gratis
          for nye abonnenter.
        </p>
      </li>

      <li
        class="gallery-item"
        data-analytics-gallery-item-id="student"
      >
        <h3>Studentabonnement</h3>
        <p>
          En ekstra snill pris til bare
          kr 75 per måned, og den første måneden
          er gratis for nye abonnenter.
        </p>
      </li>

      <li
        class="gallery-item"
        data-analytics-gallery-item-id="apple one"
      >
        Apple One koster fra kr 219 per måned.
      </li>
    `;

    assert.deepEqual(
      parseAppleMusicPrices(
        html,
        "NOK"
      ),
      [
        {
          planName: "Individual",
          amount: 139
        },
        {
          planName: "Family",
          amount: 219
        },
        {
          planName: "Student",
          amount: 75
        }
      ]
    );
  }
);

test(
  "Apple Music parser keeps each plan price inside its own card",
  () => {
    const html = `
      <li
        data-analytics-gallery-item-id="individual"
      >
        Individuelt abonnement
        kr 139 per måned
      </li>

      <li
        data-analytics-gallery-item-id="family"
      >
        Familieabonnement
        kr 219 per måned
      </li>

      <li
        data-analytics-gallery-item-id="student"
      >
        Studentabonnement
        kr 75 per måned
      </li>

      <li
        data-analytics-gallery-item-id="apple one"
      >
        kr 999 per måned
      </li>
    `;

    const prices =
      parseAppleMusicPrices(
        html,
        "NOK"
      );

    assert.deepEqual(
      prices.map(
        (item) => item.amount
      ),
      [
        139,
        219,
        75
      ]
    );
  }
);

test(
  "Apple Music parser rejects partial or wrong-currency pricing",
  () => {
    const partialHtml = `
      <li
        data-analytics-gallery-item-id="individual"
      >
        kr 139 per måned
      </li>

      <li
        data-analytics-gallery-item-id="family"
      >
        kr 219 per måned
      </li>
    `;

    assert.deepEqual(
      parseAppleMusicPrices(
        partialHtml,
        "NOK"
      ),
      []
    );

    assert.deepEqual(
      parseAppleMusicPrices(
        partialHtml,
        "USD"
      ),
      []
    );
  }
);



test(
  "Apple Music parser extracts mainland China CNY recurring plans",
  () => {
    const html = `
      <li data-analytics-gallery-item-id="individual">
        个人
        RMB 12/月，新订阅用户可免费试听一个月。
      </li>
      <li data-analytics-gallery-item-id="family">
        家庭
        RMB 20/月，新订阅用户可免费试听一个月。
      </li>
      <li data-analytics-gallery-item-id="student">
        学生
        每月仅需 RMB 7。
      </li>
    `;

    assert.deepEqual(
      parseAppleMusicPrices(
        html,
        "CNY"
      ),
      [
        {
          planName: "Individual",
          amount: 12
        },
        {
          planName: "Family",
          amount: 20
        },
        {
          planName: "Student",
          amount: 7
        }
      ]
    );
  }
);

test(
  "Apple Music CNY parser supports current mainland China gallery plus pricing FAQ shape",
  () => {
    const html = `
      <section id="plans">
        <li
          id="individual"
          data-analytics-gallery-item-id="individual"
        >
          <h3>个人</h3>
          <p>
            RMB 12/月，新订阅用户可免费试听一个月。
          </p>
        </li>

        <li
          id="family"
          data-analytics-gallery-item-id="family"
        >
          <h3>家庭</h3>
          <p>
            RMB 20/月，新订阅用户可免费试听一个月。
          </p>
        </li>
      </section>

      <div
        id="accordion-item-2-tray"
        data-accordion-tray="true"
      >
        <p>
          这取决于你选择的服务。
          学生可选择 Apple&nbsp;Music 学生方案，
          每月仅需 RMB&nbsp;7。
          免费试听期结束后，个人订阅每月仅需 RMB&nbsp;12。
          还有 Apple&nbsp;Music 家庭方案，每月仅需 RMB&nbsp;20。
        </p>
      </div>
    `;

    assert.deepEqual(
      parseAppleMusicPrices(
        html,
        "CNY"
      ),
      [
        {
          planName: "Individual",
          amount: 12
        },
        {
          planName: "Family",
          amount: 20
        },
        {
          planName: "Student",
          amount: 7
        }
      ]
    );
  }
);

test(
  "Apple Music CNY FAQ fallback rejects unanchored student promotion",
  () => {
    const html = `
      <li data-analytics-gallery-item-id="individual">
        RMB 12/月
      </li>

      <li data-analytics-gallery-item-id="family">
        RMB 20/月
      </li>

      <p>
        学生优惠 RMB 1，限时活动。
      </p>
    `;

    assert.deepEqual(
      parseAppleMusicPrices(
        html,
        "CNY"
      ),
      []
    );
  }
);

test(
  "Apple Music CNY parser rejects promotional-only prices",
  () => {
    const html = `
      <li data-analytics-gallery-item-id="individual">
        新用户优惠 RMB 2，连续三个月。
      </li>
      <li data-analytics-gallery-item-id="family">
        新用户优惠 RMB 5，连续三个月。
      </li>
      <li data-analytics-gallery-item-id="student">
        新用户优惠 RMB 1。
      </li>
    `;

    assert.deepEqual(
      parseAppleMusicPrices(
        html,
        "CNY"
      ),
      []
    );
  }
);

test(
  "Youku China parser extracts explicit steady-state SVIP monthly renewal price",
  () => {
    const html = `
      <script>
        window.__INITIAL_DATA__ = {
          "moduleList": [
            {
              "components": [
                {
                  "sellProductName": "SVIP会员",
                  "sellSkuName": "连续包月",
                  "sellGoodsName": "SVIP会员连续包月",
                  "sellGoodsSubtitle": "VIP会员+电视端可看+SVIP剧场",
                  "sellTopTips": "首3月特惠",
                  "sellPrice": "18",
                  "sellUnderlinePrice": "35",
                  "sellGoodsDesc": "购买即赠7天SVIP，享前3个月18元/月，第4个月起35元/月"
                }
              ]
            }
          ]
        };
      </script>
    `;

    assert.deepEqual(
      parseYoukuChinaPrices(
        html,
        "CNY"
      ),
      [
        {
          planName: "SVIP",
          amount: 35
        }
      ]
    );
  }
);

test(
  "Youku China parser rejects promotional-only, ambiguous and wrong-currency pricing",
  () => {
    const promotionalOnly = `
      {
        "sellProductName": "SVIP会员",
        "sellSkuName": "连续包月",
        "sellGoodsName": "SVIP会员连续包月",
        "sellPrice": "18",
        "sellUnderlinePrice": "35",
        "sellGoodsDesc": "首3个月18元/月"
      }
    `;

    assert.deepEqual(
      parseYoukuChinaPrices(
        promotionalOnly,
        "CNY"
      ),
      []
    );

    const ambiguous = `
      {
        "sellProductName": "SVIP会员",
        "sellSkuName": "连续包月",
        "sellGoodsName": "SVIP会员连续包月",
        "sellGoodsDesc": "第4个月起35元/月"
      }
      {
        "sellProductName": "SVIP会员",
        "sellSkuName": "连续包月",
        "sellGoodsName": "SVIP会员连续包月",
        "sellGoodsDesc": "第4个月起40元/月"
      }
    `;

    assert.deepEqual(
      parseYoukuChinaPrices(
        ambiguous,
        "CNY"
      ),
      []
    );

    const explicit = `
      {
        "sellProductName": "SVIP会员",
        "sellSkuName": "连续包月",
        "sellGoodsName": "SVIP会员连续包月",
        "sellGoodsDesc": "第4个月起35元/月"
      }
    `;

    assert.deepEqual(
      parseYoukuChinaPrices(
        explicit,
        "USD"
      ),
      []
    );
  }
);

test(
  "Apple Music parser extracts USD recurring monthly plans",
  () => {
    const html = `
      <li data-analytics-gallery-item-id="individual">
        Individual
        $10.99 per month
      </li>
      <li data-analytics-gallery-item-id="family">
        Family
        $16.99 per month
      </li>
      <li data-analytics-gallery-item-id="student">
        Student
        $5.99 per month
      </li>
      <li data-analytics-gallery-item-id="apple one">
        $99.99 per month
      </li>
    `;

    assert.deepEqual(
      parseAppleMusicPrices(
        html,
        "USD"
      ),
      [
        {
          planName: "Individual",
          amount: 10.99
        },
        {
          planName: "Family",
          amount: 16.99
        },
        {
          planName: "Student",
          amount: 5.99
        }
      ]
    );
  }
);

test(
  "Apple Music parser extracts localized EUR decimal-comma plans",
  () => {
    const html = `
      <li data-analytics-gallery-item-id="individual">
        Individual
        11,99 € per maand
      </li>
      <li data-analytics-gallery-item-id="family">
        Family
        19,99 € per maand
      </li>
      <li data-analytics-gallery-item-id="student">
        Student
        6,99 € per maand
      </li>
      <li data-analytics-gallery-item-id="apple one">
        99,99 € per maand
      </li>
    `;

    assert.deepEqual(
      parseAppleMusicPrices(
        html,
        "EUR"
      ),
      [
        {
          planName: "Individual",
          amount: 11.99
        },
        {
          planName: "Family",
          amount: 19.99
        },
        {
          planName: "Student",
          amount: 6.99
        }
      ]
    );
  }
);

test(
  "Apple Music parser extracts SEK and DKK recurring plans",
  () => {
    const sek = `
      <li data-analytics-gallery-item-id="individual">
        119 kr per månad
      </li>
      <li data-analytics-gallery-item-id="family">
        199 kr per månad
      </li>
      <li data-analytics-gallery-item-id="student">
        65 kr per månad
      </li>
    `;

    const dkk = `
      <li data-analytics-gallery-item-id="individual">
        109 kr pr. måned
      </li>
      <li data-analytics-gallery-item-id="family">
        179 kr pr. måned
      </li>
      <li data-analytics-gallery-item-id="student">
        59 kr pr. måned
      </li>
    `;

    assert.deepEqual(
      parseAppleMusicPrices(
        sek,
        "SEK"
      ).map((item) => item.amount),
      [
        119,
        199,
        65
      ]
    );

    assert.deepEqual(
      parseAppleMusicPrices(
        dkk,
        "DKK"
      ).map((item) => item.amount),
      [
        109,
        179,
        59
      ]
    );
  }
);

test(
  "Apple Music parser supports live Swedish Danish and Finnish slash-month formats",
  () => {
    const swedish = `
      <li data-analytics-gallery-item-id="individual">
        119 kr/månad, första månaden är gratis.
      </li>
      <li data-analytics-gallery-item-id="family">
        209 kr/månad, en månad gratis.
      </li>
      <li data-analytics-gallery-item-id="student">
        Bara 69 kr/månad, första månaden är gratis.
      </li>
    `;

    const danish = `
      <li data-analytics-gallery-item-id="individual">
        119 kr./måned, den første måned er gratis.
      </li>
      <li data-analytics-gallery-item-id="family">
        199 kr./måned. Én måned gratis.
      </li>
      <li data-analytics-gallery-item-id="student">
        Kun 65 kr./måned. Den første måned er gratis.
      </li>
    `;

    const finnish = `
      <li data-analytics-gallery-item-id="individual">
        11,99 €/kk, ensimmäinen kuukausi maksutta.
      </li>
      <li data-analytics-gallery-item-id="family">
        19,99 €/kk, yksi kuukausi maksutta.
      </li>
      <li data-analytics-gallery-item-id="student">
        Vain 6,99 €/kk, ensimmäinen kuukausi maksutta.
      </li>
    `;

    assert.deepEqual(
      parseAppleMusicPrices(
        swedish,
        "SEK"
      ),
      [
        {
          planName: "Individual",
          amount: 119
        },
        {
          planName: "Family",
          amount: 209
        },
        {
          planName: "Student",
          amount: 69
        }
      ]
    );

    assert.deepEqual(
      parseAppleMusicPrices(
        danish,
        "DKK"
      ),
      [
        {
          planName: "Individual",
          amount: 119
        },
        {
          planName: "Family",
          amount: 199
        },
        {
          planName: "Student",
          amount: 65
        }
      ]
    );

    assert.deepEqual(
      parseAppleMusicPrices(
        finnish,
        "EUR"
      ),
      [
        {
          planName: "Individual",
          amount: 11.99
        },
        {
          planName: "Family",
          amount: 19.99
        },
        {
          planName: "Student",
          amount: 6.99
        }
      ]
    );
  }
);

test(
  "Apple Music international parser rejects partial, ambiguous and wrong-currency cards",
  () => {
    const partial = `
      <li data-analytics-gallery-item-id="individual">
        €11.99 per month
      </li>
      <li data-analytics-gallery-item-id="family">
        €19.99 per month
      </li>
    `;

    const ambiguous = `
      <li data-analytics-gallery-item-id="individual">
        €11.99 per month
        €12.99 per month
      </li>
      <li data-analytics-gallery-item-id="family">
        €19.99 per month
      </li>
      <li data-analytics-gallery-item-id="student">
        €6.99 per month
      </li>
    `;

    const wrongCurrency = `
      <li data-analytics-gallery-item-id="individual">
        $11.99 per month
      </li>
      <li data-analytics-gallery-item-id="family">
        $19.99 per month
      </li>
      <li data-analytics-gallery-item-id="student">
        $6.99 per month
      </li>
    `;

    assert.deepEqual(
      parseAppleMusicPrices(
        partial,
        "EUR"
      ),
      []
    );

    assert.deepEqual(
      parseAppleMusicPrices(
        ambiguous,
        "EUR"
      ),
      []
    );

    assert.deepEqual(
      parseAppleMusicPrices(
        wrongCurrency,
        "EUR"
      ),
      []
    );
  }
);

test(
  "YouTube Premium parser extracts regular Premium recurring prices",
  () => {
    const html = `
      "optionSectionRenderer":{
        "title":{"runs":[{"text":"Premium Lite"}]},
        "optionItems":[{
          "optionItemRenderer":{
            "title":{"runs":[{"text":"Enkeltperson"}]},
            "subtitle":{"runs":[
              {"text":"1-måneds prøveperiode for 0 kr"},
              {"text":" • Deretter "},
              {"text":"99,00 kr⁠/⁠måned"}
            ]},
            "optionId":"unlimited-B-ruby.P.LITE",
            "nextStepId":"summary"
          }
        }]
      }

      "optionSectionRenderer":{
        "title":{"runs":[{"text":"Premium"}]},
        "optionItems":[
          {
            "optionItemRenderer":{
              "title":{"runs":[{"text":"Personlig"}]},
              "subtitle":{"runs":[
                {"text":"1-måneds prøveperiode for 0 kr"},
                {"text":" • Deretter "},
                {"text":"169,00 kr⁠/⁠måned"}
              ]},
              "optionId":"unlimited.P.INDIVIDUAL",
              "nextStepId":"summary"
            }
          },
          {
            "optionItemRenderer":{
              "title":{"runs":[{"text":"Familieabonnement"}]},
              "subtitle":{"runs":[
                {"text":"1-måneds prøveperiode for 0 kr"},
                {"text":" • Deretter "},
                {"text":"269,00 kr⁠/⁠måned"}
              ]},
              "optionId":"unlimited.P.FAMILY",
              "nextStepId":"summary"
            }
          },
          {
            "optionItemRenderer":{
              "title":{"runs":[{"text":"Student"}]},
              "subtitle":{"runs":[
                {"text":"1-måneds prøveperiode for 0 kr"},
                {"text":" • Deretter "},
                {"text":"99,00 kr⁠/⁠måned"}
              ]},
              "optionId":"unlimited.P.STUDENT",
              "nextStepId":"student_verification"
            }
          }
        ]
      }
    `;

    assert.deepEqual(
      parseYouTubePremiumPrices(
        html,
        "NOK"
      ),
      [
        {
          planName: "Individual",
          amount: 169
        },
        {
          planName: "Family",
          amount: 269
        },
        {
          planName: "Student",
          amount: 99
        }
      ]
    );
  }
);

test(
  "YouTube Premium parser excludes Premium Lite and ignores trial prices",
  () => {
    const html = `
      "optionItemRenderer":{
        "title":{"runs":[{"text":"Enkeltperson"}]},
        "subtitle":{"runs":[
          {"text":"0 kr"},
          {"text":" • Deretter "},
          {"text":"99,00 kr⁠/⁠måned"}
        ]},
        "optionId":"unlimited-B-ruby.P.LITE",
        "nextStepId":"summary"
      }

      "optionItemRenderer":{
        "title":{"runs":[{"text":"Personlig"}]},
        "subtitle":{"runs":[
          {"text":"0 kr"},
          {"text":" • Deretter "},
          {"text":"169,00 kr⁠/⁠måned"}
        ]},
        "optionId":"unlimited.P.INDIVIDUAL",
        "nextStepId":"summary"
      }

      "optionItemRenderer":{
        "title":{"runs":[{"text":"Familieabonnement"}]},
        "subtitle":{"runs":[
          {"text":"0 kr"},
          {"text":" • Deretter "},
          {"text":"269,00 kr⁠/⁠måned"}
        ]},
        "optionId":"unlimited.P.FAMILY",
        "nextStepId":"summary"
      }

      "optionItemRenderer":{
        "title":{"runs":[{"text":"Student"}]},
        "subtitle":{"runs":[
          {"text":"0 kr"},
          {"text":" • Deretter "},
          {"text":"99,00 kr⁠/⁠måned"}
        ]},
        "optionId":"unlimited.P.STUDENT",
        "nextStepId":"student_verification"
      }
    `;

    const result =
      parseYouTubePremiumPrices(
        html,
        "NOK"
      );

    assert.deepEqual(
      result.map(
        (item) => item.amount
      ),
      [
        169,
        269,
        99
      ]
    );
  }
);

test(
  "YouTube Premium parser rejects partial, conflicting, or wrong-currency pricing",
  () => {
    const partial = `
      "optionItemRenderer":{
        "title":{"runs":[{"text":"Personlig"}]},
        "subtitle":{"runs":[
          {"text":"Deretter "},
          {"text":"169,00 kr⁠/⁠måned"}
        ]},
        "optionId":"unlimited.P.INDIVIDUAL"
      }

      "optionItemRenderer":{
        "title":{"runs":[{"text":"Familieabonnement"}]},
        "subtitle":{"runs":[
          {"text":"Deretter "},
          {"text":"269,00 kr⁠/⁠måned"}
        ]},
        "optionId":"unlimited.P.FAMILY"
      }
    `;

    assert.deepEqual(
      parseYouTubePremiumPrices(
        partial,
        "NOK"
      ),
      []
    );

    assert.deepEqual(
      parseYouTubePremiumPrices(
        partial,
        "USD"
      ),
      []
    );

    const conflicting = `
      "optionItemRenderer":{
        "title":{"runs":[{"text":"Personlig"}]},
        "subtitle":{"runs":[
          {"text":"Deretter "},
          {"text":"169,00 kr⁠/⁠måned"}
        ]},
        "optionId":"unlimited.P.ONE"
      }

      "optionItemRenderer":{
        "title":{"runs":[{"text":"Personlig"}]},
        "subtitle":{"runs":[
          {"text":"Deretter "},
          {"text":"179,00 kr⁠/⁠måned"}
        ]},
        "optionId":"unlimited.P.TWO"
      }

      "optionItemRenderer":{
        "title":{"runs":[{"text":"Familieabonnement"}]},
        "subtitle":{"runs":[
          {"text":"Deretter "},
          {"text":"269,00 kr⁠/⁠måned"}
        ]},
        "optionId":"unlimited.P.FAMILY"
      }

      "optionItemRenderer":{
        "title":{"runs":[{"text":"Student"}]},
        "subtitle":{"runs":[
          {"text":"Deretter "},
          {"text":"99,00 kr⁠/⁠måned"}
        ]},
        "optionId":"unlimited.P.STUDENT"
      }
    `;

    assert.deepEqual(
      parseYouTubePremiumPrices(
        conflicting,
        "NOK"
      ),
      []
    );
  }
);


test("Netflix structured parser extracts Norwegian monthly plans", () => {
  const html = `
    "fields":{
      "planPriceCurrency":{"fieldType":"String","value":"NOK"},
      "planPriceAmount":{"fieldType":"String","value":"119.0"},
      "billingFrequency":{"fieldType":"String","value":"Monthly"},
      "planType":{"fieldType":"String","value":"BASIC"},
      "localizedPlanName":{"fieldType":"String","value":"Basis"}
    }

    "fields":{
      "planPriceCurrency":{"fieldType":"String","value":"NOK"},
      "planPriceAmount":{"fieldType":"String","value":"149.0"},
      "billingFrequency":{"fieldType":"String","value":"Monthly"},
      "planType":{"fieldType":"String","value":"STANDARD"},
      "localizedPlanName":{"fieldType":"String","value":"Standard"}
    }

    "fields":{
      "planPriceCurrency":{"fieldType":"String","value":"NOK"},
      "planPriceAmount":{"fieldType":"String","value":"219.0"},
      "billingFrequency":{"fieldType":"String","value":"Monthly"},
      "planType":{"fieldType":"String","value":"PREMIUM"},
      "localizedPlanName":{"fieldType":"String","value":"Premium"}
    }
  `;

  assert.deepEqual(
    parseNetflixStructuredPrices(
      html,
      "NOK"
    ),
    [
      {
        planName: "Basic",
        amount: 119
      },
      {
        planName: "Standard",
        amount: 149
      },
      {
        planName: "Premium",
        amount: 219
      }
    ]
  );
});

test("Netflix structured parser rejects wrong currency and partial data", () => {
  const html = `
    "fields":{
      "planPriceCurrency":{"fieldType":"String","value":"NOK"},
      "planPriceAmount":{"fieldType":"String","value":"119.0"},
      "billingFrequency":{"fieldType":"String","value":"Monthly"},
      "planType":{"fieldType":"String","value":"BASIC"}
    }

    "fields":{
      "planPriceCurrency":{"fieldType":"String","value":"USD"},
      "planPriceAmount":{"fieldType":"String","value":"149.0"},
      "billingFrequency":{"fieldType":"String","value":"Monthly"},
      "planType":{"fieldType":"String","value":"STANDARD"}
    }

    "fields":{
      "planPriceCurrency":{"fieldType":"String","value":"NOK"},
      "planPriceAmount":{"fieldType":"String","value":"219.0"},
      "billingFrequency":{"fieldType":"String","value":"Monthly"},
      "planType":{"fieldType":"String","value":"PREMIUM"}
    }
  `;

  assert.deepEqual(
    parseNetflixStructuredPrices(
      html,
      "NOK"
    ),
    []
  );

  assert.deepEqual(
    parseNetflixStructuredPrices(
      html,
      "USD"
    ),
    []
  );
});

test("Netflix structured parser rejects conflicting duplicate plan prices", () => {
  const plan = (
    type: string,
    amount: string
  ) => `
    "fields":{
      "planPriceCurrency":{"fieldType":"String","value":"NOK"},
      "planPriceAmount":{"fieldType":"String","value":"${amount}"},
      "billingFrequency":{"fieldType":"String","value":"Monthly"},
      "planType":{"fieldType":"String","value":"${type}"}
    }
  `;

  const html =
    plan("BASIC", "119.0") +
    plan("BASIC", "129.0") +
    plan("STANDARD", "149.0") +
    plan("PREMIUM", "219.0");

  assert.deepEqual(
    parseNetflixStructuredPrices(
      html,
      "NOK"
    ),
    []
  );
});


test("Apple TV+ Norway parser accepts anchored recurring monthly price", () => {
  const html = `
    <main>
      <h1>Apple TV</h1>
      <p>
        Få Apple TV for bare kr 119 per måned
        etter en prøveperiode på syv dager.
      </p>
      <p>
        Apple One koster kr 219 per måned.
      </p>
    </main>
  `;

  assert.equal(
    parseAppleTvPlusNorwayPrice(
      html,
      "NOK"
    ),
    119
  );

  assert.equal(
    parseAppleTvPlusNorwayPrice(
      html,
      "USD"
    ),
    null
  );
});


test("Apple TV+ Norway parser rejects unanchored or conflicting prices", () => {
  assert.equal(
    parseAppleTvPlusNorwayPrice(
      `
        <p>Apple One koster kr 219 per måned.</p>
        <p>Syv dager gratis.</p>
      `,
      "NOK"
    ),
    null
  );

  assert.equal(
    parseAppleTvPlusNorwayPrice(
      `
        <p>Apple TV koster kr 119 per måned.</p>
        <p>Apple TV koster kr 129 per måned.</p>
      `,
      "NOK"
    ),
    null
  );
});


test("Apple TV+ international parser extracts proven recurring monthly formats", () => {
  const cases = [
    [
      "USD",
      `
        <p>
          Get Apple TV for just $14.99 per month
          after a free 7-day trial.
        </p>
        <p>
          Apple One plans start at $21.95 per month.
        </p>
      `,
      14.99
    ],
    [
      "SEK",
      `
        <p>
          Få Apple TV för bara 119 kr per månad
          efter en kostnadsfri provperiod.
        </p>
        <p>
          Apple One kostar 215 kr per månad.
        </p>
      `,
      119
    ],
    [
      "DKK",
      `
        <p>
          Få Apple TV for kun 79 kr. pr. måned
          efter en gratis prøveperiode.
        </p>
        <p>
          Apple One koster 179 kr./måned.
        </p>
      `,
      79
    ],
    [
      "EUR",
      `
        <p>
          Hol dir Apple TV für nur 9,99 € pro Monat
          nach Ablauf des Probeabos.
        </p>
        <p>
          Apple One Abos gibt es ab 19,95 € pro Monat.
        </p>
      `,
      9.99
    ],
    [
      "EUR",
      `
        <p>
          Goditi Apple TV a soli € 9,99 al mese
          dopo la prova gratuita.
        </p>
        <p>
          Apple One parte da € 19,95 al mese.
        </p>
      `,
      9.99
    ],
    [
      "EUR",
      `
        <p>
          Hanki Apple TV vain 9,99 €/kk
          kokeilujakson jälkeen.
        </p>
        <p>
          Apple One maksaa 20,95 €/kk.
        </p>
      `,
      9.99
    ]
  ] as const;

  for (
    const [
      currency,
      html,
      expected
    ] of cases
  ) {
    assert.equal(
      parseAppleTvPlusInternationalPrice(
        html,
        currency
      ),
      expected
    );
  }
});


test("Apple TV+ international parser ignores Apple One and Student prices", () => {
  const html = `
    <main>
      <p>
        Get Apple TV for just $14.99 per month
        after a free 7-day trial.
      </p>

      <p>
        Apple One plans start at
        $21.95 per month.
      </p>

      <p>
        Apple Music and Apple TV.
        Student Plan renews at
        $6.99 per month.
      </p>
    </main>
  `;

  assert.equal(
    parseAppleTvPlusInternationalPrice(
      html,
      "USD"
    ),
    14.99
  );
});


test("Apple TV+ international parser rejects Norway wrong currency and ambiguity", () => {
  assert.equal(
    parseAppleTvPlusInternationalPrice(
      `
        <p>
          Få Apple TV for bare
          kr 119 per måned.
        </p>
      `,
      "NOK"
    ),
    null
  );

  assert.equal(
    parseAppleTvPlusInternationalPrice(
      `
        <p>
          Get Apple TV for just
          $14.99 per month.
        </p>
      `,
      "EUR"
    ),
    null
  );

  assert.equal(
    parseAppleTvPlusInternationalPrice(
      `
        <p>
          Get Apple TV for just
          $14.99 per month.
        </p>
        <p>
          Apple TV subscription costs
          $15.99 per month.
        </p>
      `,
      "USD"
    ),
    null
  );
});



test(
  "Amazon Prime parser extracts only the normal monthly plan",
  () => {
    const fixtures = [
      ["USD", "$14.99", "per month after trial", 14.99],
      ["SEK", "69 kr", "per månad efter provperiod", 69],
      ["EUR", "8,99 €", "pro Monat nach dem Gratiszeitraum", 8.99],
      ["EUR", "4,99 €", "al mes después del periodo de prueba", 4.99],
      ["EUR", "6,99 €", "par mois après l'essai", 6.99],
      ["EUR", "4,99 €", "por mês após o período de teste", 4.99],
      ["EUR", "€ 4,99", "per maand na de proefperiode", 4.99],
      ["EUR", "€6.99", "per month after trial", 6.99]
    ] as const;

    for (
      const [
        currency,
        price,
        recurrence,
        expected
      ] of fixtures
    ) {
      const html = `
        <html>
          <div
            data-a-input-name="ChoosePlanRadioButton"
            data-index="1"
            class="a-radio"
          >
            <label>
              <input
                type="radio"
                name="ChoosePlanRadioButton"
              />
              <span>
                <p>Prime Monthly</p>
                <p>${price}</p>
                <p>${recurrence}</p>
              </span>
            </label>
          </div>

          <div
            data-a-input-name="ChoosePlanRadioButton"
            data-index="2"
            class="a-radio"
          >
            <label>
              <span>
                <p>Prime Annual</p>
                <p>139 €</p>
                <p>per year</p>
              </span>
            </label>
          </div>

          <div
            data-a-input-name="ChoosePlanRadioButton"
            data-index="3"
            class="a-radio"
          >
            <label>
              <span>
                <p>Student</p>
                <p>2,49 €</p>
                <p>per month</p>
              </span>
            </label>
          </div>
        </html>
      `;

      assert.equal(
        parseAmazonPrimeMonthlyPrice(
          html,
          currency
        ),
        expected
      );
    }
  }
);

test(
  "Amazon Prime parser rejects wrong currency and unsafe cards",
  () => {
    const monthly = `
      <div
        data-a-input-name="ChoosePlanRadioButton"
        data-index="1"
      >
        <label>
          <p>Prime Monthly</p>
          <p>€ 4,99</p>
          <p>per month after trial</p>
        </label>
      </div>
    `;

    assert.equal(
      parseAmazonPrimeMonthlyPrice(
        monthly,
        "USD"
      ),
      null
    );

    const annualOnly = `
      <div
        data-a-input-name="ChoosePlanRadioButton"
        data-index="1"
      >
        <label>
          <p>Prime Annual</p>
          <p>€ 49,90</p>
          <p>per year after trial</p>
        </label>
      </div>
    `;

    assert.equal(
      parseAmazonPrimeMonthlyPrice(
        annualOnly,
        "EUR"
      ),
      null
    );

    const discountedOnly = `
      <div
        data-a-input-name="ChoosePlanRadioButton"
        data-index="3"
      >
        <label>
          <p>Prime for students</p>
          <p>€ 2,49</p>
          <p>per month</p>
        </label>
      </div>
    `;

    assert.equal(
      parseAmazonPrimeMonthlyPrice(
        discountedOnly,
        "EUR"
      ),
      null
    );

    const ambiguous = `
      <div
        data-a-input-name="ChoosePlanRadioButton"
        data-index="1"
      >
        <label>
          <p>Prime Monthly</p>
          <p>€ 4,99</p>
          <p>€ 6,99 per month</p>
        </label>
      </div>
    `;

    assert.equal(
      parseAmazonPrimeMonthlyPrice(
        ambiguous,
        "EUR"
      ),
      null
    );
  }
);


test("Prime Video Norway parser accepts live Norway storefront shape", () => {
  const html = `
    <html lang="nb-no">
      <script>
        {
          "osLocale":"nb-NO",
          "recordTerritory":"NO",
          "currentTerritory":"NO",
          "locale":"nb_NO"
        }
      </script>

      <script>
        {
          "body":"Boltre deg i eksklusivt Amazon Original-innhold og andre populære filmer og TV-serier for 79 kr\\u002Fmåned. Se nå, avslutt når som helst.",
          "footer":"Etter 7 dager fornyes Amazon Prime automatisk for 79 kr\\u002Fmåned.",
          "planLogoAltText":"Prime Video"
        }
      </script>
    </html>
  `;

  assert.equal(
    parsePrimeVideoNorwayPrice(
      html,
      "NOK"
    ),
    79
  );

  assert.equal(
    parsePrimeVideoNorwayPrice(
      html,
      "USD"
    ),
    null
  );
});


test("Prime Video Norway parser rejects wrong territory and ambiguous prices", () => {
  const wrongTerritory = `
    <html lang="sv-se">
      <script>
        {
          "osLocale":"sv-SE",
          "recordTerritory":"SE",
          "currentTerritory":"SE",
          "locale":"sv_SE"
        }
      </script>

      <script>
        {
          "body":"Prime Video koster 79 kr/måned.",
          "planLogoAltText":"Prime Video"
        }
      </script>
    </html>
  `;

  assert.equal(
    parsePrimeVideoNorwayPrice(
      wrongTerritory,
      "NOK"
    ),
    null
  );

  const ambiguous = `
    <html lang="nb-no">
      <script>
        {
          "osLocale":"nb-NO",
          "recordTerritory":"NO",
          "currentTerritory":"NO",
          "locale":"nb_NO"
        }
      </script>

      <script>
        {
          "body":"Prime Video koster 79 kr/måned. Et annet månedlig tilbud koster 72 kr/måned.",
          "planLogoAltText":"Prime Video"
        }
      </script>
    </html>
  `;

  assert.equal(
    parsePrimeVideoNorwayPrice(
      ambiguous,
      "NOK"
    ),
    null
  );
});


test(
  "GeoFetch configuration is disabled unless explicitly configured",
  async () => {
    const {
      geoFetchConfigFromEnv
    } =
      await import(
        "./pricing-adapters.js"
      );

    assert.equal(
      geoFetchConfigFromEnv(
        {}
      ),
      null
    );
  }
);


test(
  "GeoFetch configuration normalizes an explicit gateway without coupling to a provider",
  async () => {
    const {
      geoFetchConfigFromEnv
    } =
      await import(
        "./pricing-adapters.js"
      );

    const endpoint =
      "https" +
      "://" +
      "geo.example.test/fetch";

    assert.deepEqual(
      geoFetchConfigFromEnv({
        SAVLIVO_GEOFETCH_ENDPOINT:
          "  " +
          endpoint +
          "  ",
        SAVLIVO_GEOFETCH_TOKEN:
          "  secret-token  "
      }),
      {
        endpoint,
        token:
          "secret-token"
      }
    );

    assert.throws(
      () =>
        geoFetchConfigFromEnv({
          SAVLIVO_GEOFETCH_ENDPOINT:
            "file" +
            "://" +
            "/tmp/fetch"
        }),
      /INVALID_GEOFETCH_ENDPOINT/
    );
  }
);


test(
  "Prime Video international parser requires matching provider territory and locale",
  () => {
    const html = `
      <html lang="sv-se">
        <script>
          {
            "osLocale":"sv-SE",
            "recordTerritory":"SE",
            "currentTerritory":"SE",
            "locale":"sv_SE"
          }
        </script>
        <script>
          {
            "body":"Prime Video kostar 69 kr/månad.",
            "planLogoAltText":"Prime Video"
          }
        </script>
      </html>
    `;

    assert.equal(
      parsePrimeVideoPrice(
        html,
        "SE",
        "SEK"
      ),
      69
    );

    assert.equal(
      parsePrimeVideoPrice(
        html,
        "NO",
        "NOK"
      ),
      null
    );

    assert.equal(
      parsePrimeVideoPrice(
        html,
        "SE",
        "EUR"
      ),
      null
    );
  }
);


test(
  "Prime Video international parser handles USD DKK and localized EUR recurring prices",
  () => {
    const cases = [
      {
        countryCode: "US",
        currency: "USD",
        lang: "en-us",
        locale: "en-US",
        price:
          "$8.99/month",
        expected: 8.99
      },
      {
        countryCode: "DK",
        currency: "DKK",
        lang: "da-dk",
        locale: "da-DK",
        price:
          "59 kr./måned",
        expected: 59
      },
      {
        countryCode: "DE",
        currency: "EUR",
        lang: "de-de",
        locale: "de-DE",
        price:
          "8,99 € / Monat",
        expected: 8.99
      },
      {
        countryCode: "FR",
        currency: "EUR",
        lang: "fr-fr",
        locale: "fr-FR",
        price:
          "6,99 € / mois",
        expected: 6.99
      },
      {
        countryCode: "FI",
        currency: "EUR",
        lang: "fi-fi",
        locale: "fi-FI",
        price:
          "6,99 € / kuukausi",
        expected: 6.99
      }
    ];

    for (const item of cases) {
      const html = `
        <html lang="${item.lang}">
          <script>
            {
              "osLocale":"${item.locale}",
              "recordTerritory":"${item.countryCode}",
              "currentTerritory":"${item.countryCode}"
            }
          </script>
          <script>
            {
              "body":"Prime Video ${item.price}",
              "planLogoAltText":"Prime Video"
            }
          </script>
        </html>
      `;

      assert.equal(
        parsePrimeVideoPrice(
          html,
          item.countryCode,
          item.currency
        ),
        item.expected,
        item.countryCode
      );
    }
  }
);


test(
  "Prime Video international parser rejects ambiguous and mismatched storefronts",
  () => {
    const wrongTerritory = `
      <html lang="de-de">
        <script>
          {
            "osLocale":"de-DE",
            "recordTerritory":"AT",
            "currentTerritory":"AT"
          }
        </script>
        <script>
          {
            "body":"Prime Video 8,99 € / Monat",
            "planLogoAltText":"Prime Video"
          }
        </script>
      </html>
    `;

    assert.equal(
      parsePrimeVideoPrice(
        wrongTerritory,
        "DE",
        "EUR"
      ),
      null
    );

    const ambiguous = `
      <html lang="en-us">
        <script>
          {
            "osLocale":"en-US",
            "recordTerritory":"US",
            "currentTerritory":"US"
          }
        </script>
        <script>
          {
            "body":"Prime Video $8.99/month then $10.99/month",
            "planLogoAltText":"Prime Video"
          }
        </script>
      </html>
    `;

    assert.equal(
      parsePrimeVideoPrice(
        ambiguous,
        "US",
        "USD"
      ),
      null
    );
  }
);


test("Google One GB recovery preserves existing plans and validates provider identity", async (t) => {
  const feed = (overrides = {}) => JSON.stringify({
    COUNTRY_CODE: "GB", CURRENCY_CODE: "GBP",
    PRICE_100_MONTHLY: 1.59, PRICE_200_MONTHLY: 2.49,
    PRICE_2048_MONTHLY: 7.99, PRICE_GEN_AI_PLUS_MONTHLY: 3.99,
    ...overrides
  });
  const cases = [
    { name: "complete original", primary: feed(), recovery: feed(), expected: [159, 249], calls: 1 },
    { name: "network failure", primary: null, recovery: feed(), expected: [159, 249], calls: 2 },
    { name: "parser failure", primary: "{", recovery: feed(), expected: [159, 249], calls: 2 },
    { name: "partial original survives conflicting recovery", primary: feed({ PRICE_200_MONTHLY: null }), recovery: feed({ PRICE_100_MONTHLY: 9 }), expected: [159, 249], calls: 2 },
    { name: "wrong recovery country", primary: null, recovery: feed({ COUNTRY_CODE: "US" }), expected: [], calls: 2 },
    { name: "wrong recovery currency", primary: null, recovery: feed({ CURRENCY_CODE: "USD" }), expected: [], calls: 2 },
    { name: "both fail", primary: null, recovery: null, expected: [], calls: 2 },
    { name: "partial original survives recovery failure", primary: feed({ PRICE_200_MONTHLY: null }), recovery: null, expected: [159], calls: 2 }
  ];
  for (const scenario of cases) {
    await t.test(scenario.name, async (t) => {
      const urls: string[] = [];
      t.mock.method(globalThis, "fetch", async (input: string | URL | Request) => {
        const url = String(input);
        if (url.endsWith("/about/")) throw new Error("discovery unavailable");
        urls.push(url);
        const body = url.includes("ALL_gb/") ? scenario.primary : scenario.recovery;
        if (body === null) throw new Error("offline");
        return new Response(body);
      });
      const prices = await providerAdapters["google-one"]({ countryCode: "GB", currency: "GBP" });
      assert.deepEqual(prices.map(p => p.monthlyPriceMinor).sort((a,b) => a-b), [159, 249]);
      assert.equal(urls.length, scenario.calls);
      assert.ok(urls[0].includes("/ALL_gb/about/feeds/"));
      if (urls.length === 2) assert.ok(urls[1].includes("/ALL_uk/about/feeds/"));
      for (const price of prices) {
        assert.equal(price.verification, scenario.expected.some(amount => amount === price.monthlyPriceMinor) ? "authoritative-provider" : "registry");
        assert.equal(price.countryCode, "GB");
        assert.equal(price.currency, "GBP");
        assert.equal(price.billingProviderSlug, "direct");
        assert.ok(["Storage 100 GB", "Storage 200 GB"].includes(price.planName));
        if (scenario.primary === null && scenario.expected.length) assert.ok(price.sourceUrl.includes("ALL_uk/"));
      }
    });
  }
});

test("Google One foreign failures preserve store prices and Norway remains independent", async (t) => {
  const urls: string[] = [];
  t.mock.method(globalThis, "fetch", async (input: string | URL | Request) => {
    if (!String(input).endsWith("/about/")) urls.push(String(input));
    throw new Error("offline");
  });
  const se = await providerAdapters["google-one"]({ countryCode: "SE", currency: "SEK" });
  assert.deepEqual(se.map(p => p.monthlyPriceMinor).sort((a,b) => a-b), [1900, 2900, 9900]);
  assert.equal(urls.length, 1);
  const no = await providerAdapters["google-one"]({ countryCode: "NO", currency: "NOK" });
  assert.equal(no.length, 8);
  assert.ok(no.every(p => p.verification === "registry"));
  assert.equal(urls.length, 2);
  assert.ok(urls[1].startsWith("https://one.google.com/plans?"));
});

const discoveryPage = '<script type="module" src="/about/assets/d/pricing.min.js"></script>';
const discoveryAsset = (filename = "pricing_2026_09_01.json") =>
  'let n=c()||`' + filename + '`; let url=`/about/feeds/${n}`;' +
  'data.COUNTRY_CODE; data.CURRENCY_CODE; customElements.define(`g1-localized-price`,a);';

test("Google One discovery parsers restrict assets and reject ambiguous or invalid filenames", () => {
  assert.deepEqual(parseGoogleOnePricingAssets(discoveryPage + discoveryPage), ["/about/assets/d/pricing.min.js"]);
  for (const src of ["https://evil.test/a.js", "//one.google.com/a.js", "/about/assets/d/../a.min.js", "/about/assets/d/a.min.js?url=evil"]) {
    assert.deepEqual(parseGoogleOnePricingAssets(`<script src="${src}"></script>`), []);
  }
  assert.deepEqual(parseGoogleOnePricingAssets(Array.from({ length: 17 }, (_, i) => `<script src="/about/assets/d/a${i}.min.js"></script>`).join("")), []);
  assert.equal(parseGoogleOnePricingFilename(discoveryAsset()), "pricing_2026_09_01.json");
  for (const asset of [
    "pricing_2026_09_01.json",
    discoveryAsset("pricing_2026_02_30.json"),
    discoveryAsset("pricing_2026_13_01.json"),
    discoveryAsset("../../pricing_2026_09_01.json"),
    discoveryAsset().replace("COUNTRY_CODE", "country"),
    discoveryAsset().replace("CURRENCY_CODE", "currency"),
    discoveryAsset().replace("g1-localized-price", "other"),
    discoveryAsset().replace("/about/feeds/${", "/other/${"),
    discoveryAsset() + ' let preview="pricing_2026_10_01.json";',
    discoveryAsset() + ' let other=c()||`pricing_2026_09_01.json`;'
  ]) assert.equal(parseGoogleOnePricingFilename(asset), null);
});

test("Google One discovery fails closed on page and asset failures", async (t) => {
  for (const failure of ["none", "page network", "page HTTP", "empty page", "asset network", "asset HTTP", "asset parse", "conflict", "redirect"]) {
    await t.test(failure, async (t) => {
      t.mock.method(globalThis, "fetch", async (input: string | URL | Request, init?: RequestInit) => {
        assert.equal(init?.redirect, "error");
        assert.ok(String(input).startsWith("https://one.google.com/"));
        const page = String(input).endsWith("/about/");
        if (failure === "redirect" || failure === (page ? "page network" : "asset network")) throw new Error("unavailable");
        if (failure === (page ? "page HTTP" : "asset HTTP")) return new Response("", { status: 503 });
        if (page) return new Response(failure === "empty page" ? "" : discoveryPage + (failure === "conflict" ? '<script src="/about/assets/d/other.min.js"></script>' : ""));
        return new Response(failure === "asset parse" ? "broken" : discoveryAsset(String(input).includes("other") ? "pricing_2026_10_01.json" : "pricing_2026_09_01.json"));
      });
      assert.equal(await discoverGoogleOnePricingFilename(), failure === "none" ? "pricing_2026_09_01.json" : null);
    });
  }
});

test("Google One discovery aborts on its shared deadline", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  t.mock.method(globalThis, "fetch", (_input: unknown, init: RequestInit) => new Promise((_resolve, reject) => {
    init.signal!.addEventListener("abort", () => reject(new Error("timeout")));
  }));
  const result = discoverGoogleOnePricingFilename();
  t.mock.timers.tick(4000);
  assert.equal(await result, null);
});

test("Google One discovered feeds only recover missing validated storage prices", async (t) => {
  let now = Date.now() + 3600000;
  const feed = (overrides = {}) => JSON.stringify({
    COUNTRY_CODE: "SE", CURRENCY_CODE: "SEK",
    PRICE_100_MONTHLY: 21, PRICE_200_MONTHLY: 31,
    PRICE_2048_MONTHLY: 100, PRICE_5120_MONTHLY: 200,
    PRICE_GEN_AI_PLUS_MONTHLY: 55, PRICE_GEN_AI_PRO_MONTHLY: 255,
    ...overrides
  });
  const cases = [
    { name: "recover both", primary: null, newer: feed(), expected: [2100, 3100, 9900] },
    { name: "preserve primary", primary: feed({ PRICE_100_MONTHLY: 19, PRICE_200_MONTHLY: null }), newer: feed(), expected: [1900, 3100, 9900] },
    { name: "complete primary skips discovery", primary: feed(), newer: null, expected: [2100, 3100, 9900] },
    { name: "newer network", primary: null, newer: null, expected: [1900, 2900, 9900] },
    { name: "newer malformed", primary: null, newer: "{", expected: [1900, 2900, 9900] },
    { name: "newer country", primary: null, newer: feed({ COUNTRY_CODE: "US" }), expected: [1900, 2900, 9900] },
    { name: "newer currency", primary: null, newer: feed({ CURRENCY_CODE: "USD" }), expected: [1900, 2900, 9900] },
    { name: "newer partial", primary: null, newer: feed({ PRICE_200_MONTHLY: null }), expected: [2100, 2900, 9900] },
    { name: "partial survives discovery failure", primary: feed({ PRICE_200_MONTHLY: null }), newer: null, discoveryFails: true, expected: [2100, 2900, 9900] },
    { name: "same version", primary: null, newer: feed(), filename: "pricing_2026_07_28.json", expected: [1900, 2900, 9900] },
    { name: "older version", primary: null, newer: feed(), filename: "pricing_2026_07_01.json", expected: [1900, 2900, 9900] }
  ];
  for (const scenario of cases) {
    await t.test(scenario.name, async (t) => {
      now += 3600000;
      t.mock.method(Date, "now", () => now);
      const urls: string[] = [];
      t.mock.method(globalThis, "fetch", async (input: string | URL | Request) => {
        const url = String(input);
        urls.push(url);
        if (url.endsWith("/about/")) {
          if (scenario.discoveryFails) throw new Error("offline");
          return new Response(discoveryPage);
        }
        if (url.endsWith(".min.js")) return new Response(discoveryAsset(scenario.filename));
        const body = url.endsWith("pricing_2026_07_28.json") ? scenario.primary : scenario.newer;
        if (body === null) throw new Error("offline");
        return new Response(body);
      });
      const prices = await providerAdapters["google-one"]({ countryCode: "SE", currency: "SEK" });
      assert.deepEqual(prices.map(p => p.monthlyPriceMinor).sort((a,b) => a-b), scenario.expected);
      assert.ok(urls[0].endsWith("pricing_2026_07_28.json"));
      if (scenario.name === "complete primary skips discovery") assert.equal(urls.length, 1);
      if (scenario.filename) assert.equal(urls.filter(u => u.includes("/feeds/")).length, 1);
      for (const price of prices) {
        assert.ok(["Storage 100 GB", "Storage 200 GB", "Google AI Plus — 2 TB"].includes(price.planName));
        if (price.monthlyPriceMinor === 3100 || price.monthlyPriceMinor === 2100) {
          assert.equal(price.verification, "authoritative-provider");
        }
      }
      if (scenario.name === "recover both") assert.ok(prices.filter(p => p.planName.startsWith("Storage")).every(p => p.sourceUrl.endsWith("pricing_2026_09_01.json")));
    });
  }
});

test("Google One discovery shares attempts and caches failure until expiry", async (t) => {
  let now = Date.now() + 86400000;
  t.mock.method(Date, "now", () => now);
  let pages = 0;
  t.mock.method(globalThis, "fetch", async (input: string | URL | Request) => {
    if (String(input).endsWith("/about/")) pages++;
    throw new Error("offline");
  });
  const run = () => providerAdapters["google-one"]({ countryCode: "SE", currency: "SEK" });
  await Promise.all([run(), run()]);
  await run();
  assert.equal(pages, 1);
  now += 300001;
  await run();
  assert.equal(pages, 2);
});

test("Google One Norway never requests discovery even with a failed provider", async (t) => {
  const urls: string[] = [];
  t.mock.method(globalThis, "fetch", async (input: string | URL | Request) => {
    urls.push(String(input));
    throw new Error("offline");
  });
  const prices = await providerAdapters["google-one"]({ countryCode: "NO", currency: "NOK" });
  assert.equal(prices.length, 8);
  assert.equal(urls.length, 1);
  assert.ok(urls[0].startsWith("https://one.google.com/plans?"));
});

test("Google One discovered GB routes follow pinned UK recovery and reuse discovery", async (t) => {
  t.mock.method(Date, "now", () => 9000000000000);
  const urls: string[] = [];
  const pinned = "pricing_2026_07_28.json";
  const newer = "pricing_2026_09_01.json";
  t.mock.method(globalThis, "fetch", async (input: string | URL | Request) => {
    const url = String(input);
    urls.push(url);
    if (url.endsWith("/about/")) return new Response(discoveryPage);
    if (url.endsWith(".min.js")) return new Response(discoveryAsset());
    if (url.includes("ALL_gb")) return new Response("", { status: 404 });
    return new Response(JSON.stringify({
      COUNTRY_CODE: "GB", CURRENCY_CODE: "GBP",
      PRICE_100_MONTHLY: url.endsWith(pinned) ? 1.59 : 9,
      PRICE_200_MONTHLY: url.endsWith(pinned) ? null : 2.49
    }));
  });
  const run = () => providerAdapters["google-one"]({ countryCode: "GB", currency: "GBP" });
  const prices = await run();
  assert.deepEqual(prices.map(p => p.monthlyPriceMinor).sort((a,b) => a-b), [159, 249]);
  assert.deepEqual(urls.filter(u => u.includes("/feeds/")).map(u => new URL(u).pathname), [
    `/intl/ALL_gb/about/feeds/${pinned}`,
    `/intl/ALL_uk/about/feeds/${pinned}`,
    `/intl/ALL_gb/about/feeds/${newer}`,
    `/intl/ALL_uk/about/feeds/${newer}`
  ]);
  assert.ok(prices.find(p => p.monthlyPriceMinor === 159)!.sourceUrl.endsWith(pinned));
  assert.ok(prices.find(p => p.monthlyPriceMinor === 249)!.sourceUrl.endsWith(newer));
  await run();
  assert.equal(urls.filter(u => u.endsWith("/about/")).length, 1);
});


const iCloudSupportFixture = readFileSync(new URL("./fixtures/icloud-support-pricing.html", import.meta.url), "utf8");
const iCloudSupportExpected: Array<[string, string, number[]]> = [
  ["CA", "CAD", [1.29, 3.99, 12.99, 39.99, 79.99]],
  ["GB", "GBP", [0.99, 2.99, 8.99, 26.99, 54.99]],
  ["AU", "AUD", [1.49, 4.49, 14.99, 44.99, 89.99]],
  ["NZ", "NZD", [1.99, 5.99, 19.99, 59.99, 119.99]],
  ["BR", "BRL", [5.9, 19.9, 66.9, 199.9, 399.9]],
  ["MX", "MXN", [17, 49, 179, 499, 999]],
  ["CZ", "CZK", [25, 79, 249, 749, 1490]],
  ["HU", "HUF", [399, 1290, 4490, 12990, 26990]],
  ["IL", "ILS", [3.9, 11.9, 39.9, 119.9, 239.9]],
  ["PL", "PLN", [4.99, 14.99, 49.99, 149.99, 299.99]],
  ["RO", "RON", [4.99, 14.99, 49.99, 149.99, 299.99]],
  ["SA", "SAR", [3.99, 12.99, 44.99, 129.99, 269.99]],
  ["ZA", "ZAR", [14.99, 59.99, 199.99, 599.99, 1199.99]],
  ["CH", "CHF", [1, 3, 10, 30, 60]],
  ["TR", "TRY", [49.99, 169.99, 549.99, 1699.99, 3399.99]],
  ["AE", "AED", [3.99, 11.99, 39.99, 119.99, 239.99]],
  ["HK", "HKD", [8, 23, 78, 238, 468]],
  ["IN", "INR", [75, 219, 749, 2999, 5900]],
  ["ID", "IDR", [15000, 59000, 199000, 599000, 1199000]],
  ["MY", "MYR", [3.9, 11.9, 44.9, 129.9, 269.9]],
  ["PH", "PHP", [59, 199, 699, 1990, 3990]],
  ["SG", "SGD", [1.48, 3.98, 13.98, 42.98, 84.98]],
  ["TW", "TWD", [30, 90, 300, 900, 1790]],
  ["TH", "THB", [35, 99, 399, 1190, 2390]]
];

test("iCloud support table verifies five plans in 24 explicit country/currency sections", () => {
  for (const [country, currency, amounts] of iCloudSupportExpected) {
    assert.deepEqual(parseICloudSupportPrices(iCloudSupportFixture, country, currency),
      ["50 GB", "200 GB", "2 TB", "6 TB", "12 TB"].map((planName, i) => ({ planName, amount: amounts[i] })));
    assert.deepEqual(parseICloudSupportPrices(iCloudSupportFixture, country, "USD"), []);
  }
  for (const [country, currency] of [["AL", "ALL"], ["IS", "ISK"], ["DE", "EUR"], ["NO", "NOK"], ["JP", "JPY"]]) {
    assert.deepEqual(parseICloudSupportPrices(iCloudSupportFixture, country, currency), []);
  }
});

test("iCloud support table rejects missing identity, currency, cadence, partial and ambiguous sections", () => {
  const section = iCloudSupportFixture.match(/<h4[^>]*>Canada[\s\S]*?<\/ul>/)![0];
  for (const html of [
    "", iCloudSupportFixture.replace("Canada (CAD)", "Canada (USD)"),
    iCloudSupportFixture.replace("Canada (CAD)", "Other (CAD)"),
    iCloudSupportFixture.replace("monthly pricing", "annual pricing"),
    iCloudSupportFixture.replace("iCloud+ plans and pricing", "Other product"),
    iCloudSupportFixture + section,
    iCloudSupportFixture.replace("$1.29", "$0"),
    iCloudSupportFixture.replace("$1.29", "$1.29 or $2.29"),
    iCloudSupportFixture.replace("$1.29", "€1.29"),
    iCloudSupportFixture.replace("$1.29", "$1,29"),
    iCloudSupportFixture.replace(section, section.replace(/<li\b[^>]*>[\s\S]*?<\/li>/, "")),
    iCloudSupportFixture.replace(section, section.replace("200 GB", "50 GB"))
  ]) assert.deepEqual(parseICloudSupportPrices(html, "CA", "CAD"), []);
});

test("iCloud support adapter returns 120 authoritative Apple-route prices with one shared fetch", async (t) => {
  t.mock.method(Date, "now", () => 9100000000000);
  let calls = 0;
  t.mock.method(globalThis, "fetch", async (input: string | URL | Request) => {
    assert.equal(String(input), "https://support.apple.com/en-us/108047");
    calls++;
    return new Response(iCloudSupportFixture);
  });
  await Promise.all(iCloudSupportExpected.map(async ([countryCode, currency, amounts]) => {
    const prices = await providerAdapters["icloud-plus"]({ countryCode, currency });
    assert.equal(prices.length, 5);
    assert.deepEqual(prices.map(p => p.monthlyPriceMinor), amounts.map(a => Math.round(a * 100)));
    assert.ok(prices.every(p => p.countryCode === countryCode && p.currency === currency &&
      p.billingProviderSlug === "apple" && p.verification === "authoritative-provider"));
  }));
  assert.equal(calls, 1);
});

test("iCloud support failures preserve registry prices and never touch established Norway source", async (t) => {
  const original = verifiedProviderRegistry.CA;
  verifiedProviderRegistry.CA = [...(original ?? []), {
    serviceSlug: "icloud-plus", planName: "50 GB", currency: "CAD",
    monthlyPriceMinor: 129, sourceUrl: "https://support.apple.com/en-us/108047", billingProviderSlug: "apple"
  }];
  t.after(() => { if (original) verifiedProviderRegistry.CA = original; else delete verifiedProviderRegistry.CA; });
  let now = 9200000000000;
  for (const failure of ["network", "HTTP", "parser", "currency"]) {
    await t.test(failure, async (t) => {
      now += 3600000;
      t.mock.method(Date, "now", () => now);
      t.mock.method(globalThis, "fetch", async () => {
        if (failure === "network") throw new Error("offline");
        return new Response(failure === "currency" ? iCloudSupportFixture.replace("Canada (CAD)", "Canada (USD)") : "broken", { status: failure === "HTTP" ? 503 : 200 });
      });
      const prices = await providerAdapters["icloud-plus"]({ countryCode: "CA", currency: "CAD" });
      assert.equal(prices.length, 1);
      assert.equal(prices[0].monthlyPriceMinor, 129);
      assert.equal(prices[0].verification, "registry");
    });
  }
  const urls: string[] = [];
  t.mock.method(globalThis, "fetch", async (input: string | URL | Request) => { urls.push(String(input)); throw new Error("offline"); });
  const prices = await providerAdapters["icloud-plus"]({ countryCode: "NO", currency: "NOK" });
  assert.ok(prices.length > 0 && prices.every(p => p.verification === "registry"));
  assert.deepEqual(urls, ["https://www.apple.com/no/icloud/"]);
});


const addedMusicMarkets: Array<[string, string, string, number[]]> = [
  ["GB", "uk", "GBP", [11.99, 19.99, 5.99]],
  ["AU", "au", "AUD", [14.99, 23.99, 7.99]],
  ["NZ", "nz", "NZD", [18.49, 29.99, 10.49]]
];
const musicFixture = (path: string) => readFileSync(new URL(`./fixtures/apple-music-${path}.html`, import.meta.url), "utf8");

test("Apple storefront identity requires a unique matching canonical URL and provider locale", () => {
  const html = musicFixture("uk");
  const url = "https://www.apple.com/uk/apple-music/";
  assert.equal(verifyAppleStorefrontIdentity(html, url, "en_GB"), true);
  for (const value of [
    "", html.replace("en_GB", "en_US"), html.replace("/uk/", "/us/"),
    html.replace("www.apple.com", "evil.test"),
    html.replace(/<link[^>]*>/, ""), html.replace(/<meta[^>]*>/, ""),
    html + `<link rel="canonical" href="${url}">`,
    html + '<meta property="og:locale" content="en_US">'
  ]) assert.equal(verifyAppleStorefrontIdentity(value, url, "en_GB"), false);
});

test("Apple Music adds nine Apple-billed prices with matching country and currency", async (t) => {
  for (const [countryCode, path, currency, amounts] of addedMusicMarkets) {
    await t.test(countryCode, async (t) => {
      const html = musicFixture(path);
      assert.deepEqual(parseAppleMusicPrices(html, currency).map(p => p.amount), amounts);
      assert.deepEqual(parseAppleMusicPrices(html, "EUR"), []);
      t.mock.method(globalThis, "fetch", async (input: string | URL | Request) => {
        assert.equal(String(input), `https://www.apple.com/${path}/apple-music/`);
        return new Response(html);
      });
      const prices = await providerAdapters["apple-music"]({ countryCode, currency });
      assert.deepEqual(prices.map(p => p.monthlyPriceMinor), amounts.map(a => Math.round(a * 100)));
      assert.ok(prices.every(p => p.verification === "authoritative-provider" && p.billingProviderSlug === "apple"));
    });
  }
});

test("Apple Music new sources fail safely without removing registry fallback", async (t) => {
  const html = musicFixture("uk");
  for (const body of [null, "", html.replace("en_GB", "en_US"),
    html.replaceAll("£", "€"), html.replace('item-id="family"', 'item-id="other"'),
    html.replace("£11.99/month", "£11.99/month or £12.99/month"),
    html.replaceAll("/month", "/year")]) {
    await t.test(body === null ? "network" : "invalid provider evidence", async (t) => {
      t.mock.method(globalThis, "fetch", async () => { if (body === null) throw new Error("offline"); return new Response(body); });
      const prices = await providerAdapters["apple-music"]({ countryCode: "GB", currency: "GBP" });
      assert.deepEqual(prices.map(p => [p.planName, p.monthlyPriceMinor, p.verification]), [
        ["Individual", 1199, "registry"], ["Family", 1999, "registry"], ["Student", 599, "registry"]
      ]);
    });
  }
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => { calls++; throw new Error("offline"); });
  assert.deepEqual(await providerAdapters["apple-music"]({ countryCode: "GB", currency: "USD" }), []);
  assert.equal(calls, 0);
  const no = await providerAdapters["apple-music"]({ countryCode: "NO", currency: "NOK" });
  assert.ok(no.length > 0 && no.every(p => p.verification === "registry"));
});

const tvFixture = (path: string) => readFileSync(new URL(`./fixtures/apple-tv-${path}.html`, import.meta.url), "utf8");
const addedTvMarkets: Array<[string, string, string, number]> = [
  ["GB", "uk", "GBP", 9.99], ["AU", "au", "AUD", 15.99],
  ["NZ", "nz", "NZD", 17.99], ["BE", "befr", "EUR", 9.99]
];

test("Apple TV verifies four localized storefronts and the Apple billing route", async (t) => {
  for (const [countryCode, path, currency, amount] of addedTvMarkets) {
    await t.test(countryCode, async (t) => {
      const html = tvFixture(path);
      assert.equal(parseAppleTvPlusInternationalPrice(html, currency), amount);
      t.mock.method(globalThis, "fetch", async (input: string | URL | Request, init?: RequestInit) => {
        assert.equal(String(input), `https://www.apple.com/${path}/apple-tv/`);
        assert.ok(init?.signal);
        return new Response(html);
      });
      const prices = await providerAdapters["apple-tv-plus"]({ countryCode, currency });
      assert.equal(prices.length, 1);
      assert.equal(prices[0].monthlyPriceMinor, Math.round(amount * 100));
      assert.equal(prices[0].verification, "authoritative-provider");
      assert.equal(prices[0].billingProviderSlug, "apple");
    });
  }
});

test("Apple TV Belgian registry price survives every new-source failure", async (t) => {
  const html = tvFixture("befr");
  const bodies = [null, "", html.replace("fr_BE", "fr_FR"),
    html.replace("/befr/", "/fr/"), html.replaceAll("€", "$"),
    html + '<p>Apple TV 19,99 € par mois</p>', html.replaceAll("par mois", "par an")];
  for (const body of bodies) {
    await t.test(body === null ? "network" : "invalid evidence", async (t) => {
      t.mock.method(globalThis, "fetch", async () => { if (body === null) throw new Error("offline"); return new Response(body); });
      const prices = await providerAdapters["apple-tv-plus"]({ countryCode: "BE", currency: "EUR" });
      assert.equal(prices.length, 1);
      assert.equal(prices[0].monthlyPriceMinor, 999);
      assert.equal(prices[0].verification, "registry");
    });
  }
  await t.test("HTTP error", async (t) => {
    t.mock.method(globalThis, "fetch", async () => new Response(html, { status: 503 }));
    const prices = await providerAdapters["apple-tv-plus"]({ countryCode: "BE", currency: "EUR" });
    assert.equal(prices[0].verification, "registry");
  });
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => { calls++; throw new Error("offline"); });
  assert.deepEqual(await providerAdapters["apple-tv-plus"]({ countryCode: "BE", currency: "USD" }), []);
  assert.equal(calls, 0);
  const no = await providerAdapters["apple-tv-plus"]({ countryCode: "NO", currency: "NOK" });
  assert.ok(no.length > 0 && no.every(p => p.verification === "registry"));
});

// Extracted official page cards and recurring Spotify product records, fetched 2026-09-08.
const nextWaveFixtures: Record<string, {currency: string; storefront: string; locale: string; music: string; tv: string; spotify: any}> =
  JSON.parse(readFileSync(new URL("./fixtures/next-wave-pricing.json", import.meta.url), "utf8"));
const nextWaveServices = ["icloud-plus", "apple-music", "apple-tv-plus", "spotify"] as const;
function nextWavePage(cc: string, url: string) {
  const f = nextWaveFixtures[cc];
  if (url === "https://support.apple.com/en-us/108047") return iCloudSupportFixture;
  if (url === `https://www.apple.com/${f.storefront}/apple-music/`) return f.music;
  if (url === `https://www.apple.com/${f.storefront}/apple-tv/`) return f.tv;
  if (url.startsWith(`https://www.spotify.com/${cc.toLowerCase()}`)) return `<script id="__NEXT_DATA__">${JSON.stringify(f.spotify)}</script>`;
  throw new Error("Unverified fixture URL " + url);
}

test("next-wave adapters verify 52 monthly prices with exact country currency plan and billing route", async (t) => {
  for (const [cc, f] of Object.entries(nextWaveFixtures)) {
    t.mock.method(Date, "now", () => 9300000000000);
    t.mock.method(globalThis, "fetch", async (url: any) => new Response(nextWavePage(cc, String(url))));
    let count = 0;
    for (const service of nextWaveServices) {
      const prices = await providerAdapters[service]({countryCode: cc, currency: f.currency});
      const expected = verifiedProviderRegistry[cc].filter(p => p.serviceSlug === service);
      assert.equal(prices.length, expected.length, `${cc} ${service}`);
      for (const p of prices) {
        const row = expected.find(r => r.planName === p.planName)!;
        assert.ok(row, p.planName);
        assert.equal(p.monthlyPriceMinor, row.monthlyPriceMinor);
        assert.equal(p.verification, "authoritative-provider", `${cc} ${service}`);
        assert.equal(p.billingProviderSlug, row.billingProviderSlug);
        assert.equal(p.countryCode, cc);
        assert.equal(p.currency, f.currency);
      }
      count += prices.length;
    }
    assert.equal(count, 13);
    t.mock.restoreAll();
  }
});

test("next-wave registry prices survive all provider failures independently", async (t) => {
  let now = 9400000000000;
  for (const [cc, f] of Object.entries(nextWaveFixtures)) {
    for (const failure of ["network", "timeout", "http", "empty", "country", "currency", "identity", "annual"]) {
      await t.test(`${cc} ${failure}`, async (t) => {
        now += 3600000;
        t.mock.method(Date, "now", () => now);
        t.mock.method(globalThis, "fetch", async (url: any) => {
          if (failure === "network") throw new Error("offline");
          if (failure === "timeout") throw new DOMException("timeout", "TimeoutError");
          if (failure === "http") return new Response("Unavailable", {status:503});
          if (failure === "empty") return new Response("<html>Provider redesign</html>");
          let html = nextWavePage(cc, String(url));
          if (failure === "country") html = html.replaceAll(f.locale, "en_US").replaceAll(`"country":"${cc}"`, '"country":"US"').replaceAll(cc === "CH" ? "Switzerland" : cc === "PL" ? "Poland" : cc === "BR" ? "Brazil" : "Czechia", "Unproven country");
          if (failure === "currency") html = html.replace(/CHF|zł|PLN|R\$|BRL|Kč|CZK/gi, "USD");
          if (failure === "identity") html = html.replaceAll('rel="canonical"', 'rel="alternate"').replaceAll('data-analytics-gallery-item-id', 'unknown-id').replaceAll('PREMIUM_', 'UNKNOWN_').replaceAll("iCloud+ plans and pricing", "Unknown product");
          // Reject monthly markers rather than treating annual totals as monthly prices.
          if (failure === "annual") html = "<html>Annual plans only</html>";
          return new Response(html);
        });
        for (const service of nextWaveServices) {
          const prices = await providerAdapters[service]({countryCode:cc,currency:f.currency});
          const expected = verifiedProviderRegistry[cc].filter(p => p.serviceSlug === service);
          assert.equal(prices.length, expected.length, service);
          assert.ok(prices.every(p => p.verification === "registry"), service);
          for (const row of expected) assert.ok(prices.some(p => p.planName === row.planName && p.monthlyPriceMinor === row.monthlyPriceMinor && p.billingProviderSlug === row.billingProviderSlug), `${service} ${row.planName}`);
        }
      });
    }
  }
});

test("new Apple patterns reject wrong currency incomplete or conflicting plans and annual offers", () => {
  for (const f of Object.values(nextWaveFixtures)) {
    assert.deepEqual(parseAppleMusicPrices(f.music, "CAD"), []);
    assert.equal(parseAppleTvPlusInternationalPrice(f.tv, "CAD"), null);
    assert.deepEqual(parseAppleMusicPrices(f.music.replace('data-analytics-gallery-item-id="student"', 'data-analytics-gallery-item-id="unproven"'), f.currency), []);
    const extraPrice = f.music.match(/<p\b[^>]*>([\s\S]*?)<\/p>/)![1].replace(/[0-9]+(?:[.,][0-9]+)?/, "999");
    assert.deepEqual(parseAppleMusicPrices(f.music.replace("</p>", extraPrice + "</p>"), f.currency), []);
    const currencyToken = f.currency === "CHF" ? "CHF" : f.currency === "PLN" ? "zł" : f.currency === "BRL" ? "R$" : "Kč";
    const annualMusic = f.music.replace(/Monat|miesiąc|mês|měsíc/g, "year");
    assert.deepEqual(parseAppleMusicPrices(annualMusic, f.currency), []);
    const annualTv = f.tv.replace(/Monat|miesięcznie|miesiąc|mês|měsíčně|měsíc/g, "year");
    assert.equal(parseAppleTvPlusInternationalPrice(annualTv, f.currency), null);
    assert.ok(f.music.includes(currencyToken));
  }
});
