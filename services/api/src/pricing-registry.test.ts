import assert from "node:assert/strict";
import test from "node:test";

import {
  verifiedProviderRegistry
} from "./pricing-adapters.js";

const expectedCurrencyByCountry: Record<string, string> = {
  IN: "INR", SG: "SGD", HK: "HKD", TW: "TWD", AE: "AED", TH: "THB", PH: "PHP",
  MY: "MYR",
  CH: "CHF", PL: "PLN", BR: "BRL", CZ: "CZK",
  GB: "GBP",
  AU: "AUD",
  NZ: "NZD",
  US: "USD",
  NO: "NOK",
  SE: "SEK",
  DK: "DKK",
  DE: "EUR",
  ES: "EUR",
  FR: "EUR",
  IT: "EUR",
  PT: "EUR",
  NL: "EUR",
  BE: "EUR",
  AT: "EUR",
  IE: "EUR",
  FI: "EUR"
};

test(
  "registry only contains supported countries",
  () => {
    for (const countryCode of Object.keys(
      verifiedProviderRegistry
    )) {
      assert.ok(
        expectedCurrencyByCountry[countryCode],
        `Unsupported country in registry: ${countryCode}`
      );
    }
  }
);

test(
  "registry currency matches country",
  () => {
    for (const [countryCode, rows] of Object.entries(
      verifiedProviderRegistry
    )) {
      const expectedCurrency =
        expectedCurrencyByCountry[countryCode];

      assert.ok(
        expectedCurrency,
        `No currency mapping for ${countryCode}`
      );

      for (const row of rows) {
        assert.equal(
          row.currency,
          expectedCurrency,
          `${countryCode} ${row.serviceSlug} ${row.planName} has wrong currency`
        );
      }
    }
  }
);

test(
  "registry prices are positive integers",
  () => {
    for (const [countryCode, rows] of Object.entries(
      verifiedProviderRegistry
    )) {
      for (const row of rows) {
        assert.ok(
          Number.isInteger(row.monthlyPriceMinor),
          `${countryCode} ${row.serviceSlug} ${row.planName} price is not an integer`
        );

        assert.ok(
          row.monthlyPriceMinor > 0,
          `${countryCode} ${row.serviceSlug} ${row.planName} price must be > 0`
        );
      }
    }
  }
);

test(
  "registry source URLs are clean HTTPS URLs",
  () => {
    const markdownLinkPattern =
      /^\[https?:\/\/.+\]\(https?:\/\/.+\)$/;

    for (const [countryCode, rows] of Object.entries(
      verifiedProviderRegistry
    )) {
      for (const row of rows) {
        assert.ok(
          row.sourceUrl.startsWith("https://"),
          `${countryCode} ${row.serviceSlug} ${row.planName} sourceUrl must use https`
        );

        assert.equal(
          markdownLinkPattern.test(row.sourceUrl),
          false,
          `${countryCode} ${row.serviceSlug} ${row.planName} has Markdown-wrapped sourceUrl`
        );
      }
    }
  }
);

test(
  "registry has no duplicate service-plan rows per country",
  () => {
    for (const [countryCode, rows] of Object.entries(
      verifiedProviderRegistry
    )) {
      const seen = new Set<string>();

      for (const row of rows) {
        const key =
          `${row.serviceSlug}|${row.planName}`;

        assert.equal(
          seen.has(key),
          false,
          `Duplicate registry row: ${countryCode} ${key}`
        );

        seen.add(key);
      }
    }
  }
);

test(
  "registry rows have required identifiers",
  () => {
    for (const [countryCode, rows] of Object.entries(
      verifiedProviderRegistry
    )) {
      for (const row of rows) {
        assert.ok(
          row.serviceSlug.trim().length > 0,
          `${countryCode} row missing serviceSlug`
        );

        assert.ok(
          row.planName.trim().length > 0,
          `${countryCode} ${row.serviceSlug} missing planName`
        );
      }
    }
  }
);

test(
  "registry preserves explicitly verified billing route",
  () => {
    const usPrimeVideo = verifiedProviderRegistry.US.find(
      (row) =>
        row.serviceSlug === "prime-video" &&
        row.planName === "Prime Video"
    );

    assert.ok(usPrimeVideo);
    assert.equal(
      usPrimeVideo.billingProviderSlug,
      "amazon"
    );
  }
);

test("Viaplay Norway snapshot matches independent product country currency interval and direct route proof",async()=>{
  const {readFileSync}=await import("node:fs");
  const evidence=JSON.parse(readFileSync(new URL("./fixtures/viaplay-no.json",import.meta.url),"utf8"));
  const row=verifiedProviderRegistry.NO.find(p=>p.serviceSlug==="viaplay")!;
  assert.equal(evidence.product.region.regionCode,"no");
  assert.equal(evidence.product.shortProductId,"1234");
  assert.equal(evidence.product.requiredContractDuration,0);
  assert.equal(evidence.product.priceDisplayTitle,"{pricePerMonth} kr/mnd");
  assert.match(evidence.ordinaryPriceExcerpt,/169 NOK\/måned/);
  assert.equal(row.planName,evidence.product.title);
  assert.equal(row.monthlyPriceMinor,evidence.product.price*100);
  assert.equal(row.currency,"NOK");assert.equal(row.billingProviderSlug,"direct");
});
