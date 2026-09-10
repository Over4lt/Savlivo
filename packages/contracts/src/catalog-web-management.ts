// Provider evidence for NEW catalog discovery only. Never filter saved subscriptions or prices.
// Explicit country scope is frozen at review; no wildcard for future markets.
export type WebFlow = {status:"VERIFIED"|"NOT_WEB"|"REVIEW_REQUIRED";url?:string;path?:string;evidenceUrl?:string};
export type CatalogWebEvidence = {serviceSlug:string;markets:readonly string[];verifiedAt:string;scope:string;startWeb:WebFlow;manageWeb:WebFlow;cancelWeb:WebFlow;notes:string};
export const catalogWebEvidence: readonly CatalogWebEvidence[] = [
  {
    "serviceSlug": "netflix",
    "markets": [
      "US",
      "NO",
      "SE",
      "DK",
      "DE",
      "ES",
      "FR",
      "IT",
      "PT",
      "NL",
      "BE",
      "AT",
      "IE",
      "FI",
      "GB",
      "AU",
      "NZ",
      "CH",
      "PL",
      "BR",
      "CZ",
      "MY",
      "IN",
      "SG",
      "HK",
      "TW",
      "AE",
      "TH",
      "PH",
      "JP",
      "CA",
      "SA",
      "KR",
      "MX",
      "ID",
      "TR",
      "ZA",
      "IL",
      "QA",
      "EG",
      "VN",
      "RO",
      "GR",
      "CL",
      "CO"
    ],
    "verifiedAt": "2026-09-10",
    "scope": "Provider web-billed recurring subscription only; third-party channel billing excluded",
    "startWeb": {
      "status": "VERIFIED",
      "url": "https://www.netflix.com/signup",
      "evidenceUrl": "https://help.netflix.com/en/node/112419"
    },
    "manageWeb": {
      "status": "VERIFIED",
      "url": "https://www.netflix.com/cancelplan",
      "path": "Membership → Cancel → Finish cancellation",
      "evidenceUrl": "https://help.netflix.com/en/node/112419"
    },
    "cancelWeb": {
      "status": "VERIFIED",
      "url": "https://www.netflix.com/cancelplan",
      "path": "Membership → Cancel → Finish cancellation",
      "evidenceUrl": "https://help.netflix.com/en/node/112419"
    },
    "notes": ""
  },
  {
    "serviceSlug": "spotify",
    "markets": [
      "US",
      "NO",
      "SE",
      "DK",
      "DE",
      "ES",
      "FR",
      "IT",
      "PT",
      "NL",
      "BE",
      "AT",
      "IE",
      "FI",
      "GB",
      "AU",
      "NZ",
      "CH",
      "PL",
      "BR",
      "CZ",
      "MY",
      "IN",
      "SG",
      "HK",
      "TW",
      "AE",
      "TH",
      "PH",
      "JP",
      "CA",
      "SA",
      "KR",
      "MX",
      "ID",
      "TR",
      "ZA",
      "IL",
      "QA",
      "EG",
      "VN",
      "RO",
      "GR",
      "CL",
      "CO"
    ],
    "verifiedAt": "2026-09-10",
    "scope": "Provider web-billed recurring subscription only; third-party channel billing excluded",
    "startWeb": {
      "status": "VERIFIED",
      "url": "https://www.spotify.com/premium/",
      "evidenceUrl": "https://support.spotify.com/us/article/cancel-premium/"
    },
    "manageWeb": {
      "status": "VERIFIED",
      "url": "https://www.spotify.com/account/overview/",
      "path": "Account → Manage your plan → Cancel subscription",
      "evidenceUrl": "https://support.spotify.com/us/article/cancel-premium/"
    },
    "cancelWeb": {
      "status": "VERIFIED",
      "url": "https://www.spotify.com/account/overview/",
      "path": "Account → Manage your plan → Cancel subscription",
      "evidenceUrl": "https://support.spotify.com/us/article/cancel-premium/"
    },
    "notes": ""
  },
  {
    "serviceSlug": "youtube-premium",
    "markets": [
      "US",
      "NO",
      "SE",
      "DK",
      "DE",
      "ES",
      "FR",
      "IT",
      "PT",
      "NL",
      "BE",
      "AT",
      "IE",
      "FI",
      "JP",
      "CA",
      "SA",
      "KR",
      "MX",
      "ID",
      "TR",
      "ZA",
      "IL",
      "QA",
      "EG",
      "VN",
      "RO",
      "GR",
      "CL",
      "CO"
    ],
    "verifiedAt": "2026-09-10",
    "scope": "Provider web-billed recurring subscription only; third-party channel billing excluded",
    "startWeb": {
      "status": "VERIFIED",
      "url": "https://www.youtube.com/premium",
      "evidenceUrl": "https://support.google.com/youtube/answer/6308278?hl=en"
    },
    "manageWeb": {
      "status": "VERIFIED",
      "url": "https://www.youtube.com/paid_memberships",
      "path": "Manage membership → Deactivate → Continue to cancel → Confirm",
      "evidenceUrl": "https://support.google.com/youtube/answer/6308278?hl=en"
    },
    "cancelWeb": {
      "status": "VERIFIED",
      "url": "https://www.youtube.com/paid_memberships",
      "path": "Manage membership → Deactivate → Continue to cancel → Confirm",
      "evidenceUrl": "https://support.google.com/youtube/answer/6308278?hl=en"
    },
    "notes": ""
  },
  {
    "serviceSlug": "google-one",
    "markets": [
      "US",
      "NO",
      "SE",
      "DK",
      "DE",
      "ES",
      "FR",
      "IT",
      "PT",
      "NL",
      "BE",
      "AT",
      "IE",
      "FI",
      "GB",
      "AU",
      "NZ",
      "IN",
      "SG",
      "HK",
      "TW",
      "AE",
      "TH",
      "PH",
      "JP",
      "CA",
      "SA",
      "KR",
      "MX",
      "ID",
      "TR",
      "ZA",
      "IL",
      "QA",
      "EG",
      "VN",
      "RO",
      "GR",
      "CL",
      "CO"
    ],
    "verifiedAt": "2026-09-10",
    "scope": "Provider web-billed recurring subscription only; third-party channel billing excluded",
    "startWeb": {
      "status": "VERIFIED",
      "url": "https://one.google.com/about/plans",
      "evidenceUrl": "https://support.google.com/googleone/answer/9056360?hl=en"
    },
    "manageWeb": {
      "status": "VERIFIED",
      "url": "https://one.google.com/settings",
      "path": "Settings → Cancel membership → Confirm",
      "evidenceUrl": "https://support.google.com/googleone/answer/9056360?hl=en"
    },
    "cancelWeb": {
      "status": "VERIFIED",
      "url": "https://one.google.com/settings",
      "path": "Settings → Cancel membership → Confirm",
      "evidenceUrl": "https://support.google.com/googleone/answer/9056360?hl=en"
    },
    "notes": ""
  },
  {
    "serviceSlug": "chatgpt",
    "markets": [
      "US",
      "NO",
      "SE",
      "DK",
      "DE",
      "ES",
      "FR",
      "IT",
      "PT",
      "NL",
      "BE",
      "AT",
      "IE",
      "FI",
      "JP",
      "CA",
      "SA",
      "KR",
      "MX",
      "ID",
      "TR",
      "ZA",
      "IL",
      "QA",
      "EG",
      "VN",
      "RO",
      "GR",
      "CL",
      "CO"
    ],
    "verifiedAt": "2026-09-10",
    "scope": "Provider web-billed recurring subscription only; third-party channel billing excluded",
    "startWeb": {
      "status": "VERIFIED",
      "url": "https://chatgpt.com/pricing",
      "evidenceUrl": "https://help.openai.com/en/articles/7232927-how-do-i-cancel"
    },
    "manageWeb": {
      "status": "VERIFIED",
      "url": "https://help.openai.com/en/articles/7232927-how-do-i-cancel",
      "path": "Sign in → Settings → Billing → Cancel plan",
      "evidenceUrl": "https://help.openai.com/en/articles/7232927-how-do-i-cancel"
    },
    "cancelWeb": {
      "status": "VERIFIED",
      "url": "https://help.openai.com/en/articles/7232927-how-do-i-cancel",
      "path": "Sign in → Settings → Billing → Cancel plan",
      "evidenceUrl": "https://help.openai.com/en/articles/7232927-how-do-i-cancel"
    },
    "notes": "Web personal plans only; App Store/Google cancellation remains channel-specific."
  },
  {
    "serviceSlug": "disney-plus",
    "markets": [
      "US",
      "NO",
      "SE",
      "DK",
      "DE",
      "ES",
      "FR",
      "IT",
      "PT",
      "NL",
      "BE",
      "AT",
      "IE",
      "FI",
      "JP",
      "CA",
      "KR",
      "MX",
      "RO",
      "GR"
    ],
    "verifiedAt": "2026-09-10",
    "scope": "Provider web-billed recurring subscription only; third-party channel billing excluded",
    "startWeb": {
      "status": "VERIFIED",
      "url": "https://www.disneyplus.com/",
      "evidenceUrl": "https://help.disneyplus.com/en-GB/article/disneyplus-en-pt-cancel"
    },
    "manageWeb": {
      "status": "VERIFIED",
      "url": "https://www.disneyplus.com/account",
      "path": "Profile → Account → Subscription → Cancel subscription",
      "evidenceUrl": "https://help.disneyplus.com/en-GB/article/disneyplus-en-pt-cancel"
    },
    "cancelWeb": {
      "status": "VERIFIED",
      "url": "https://www.disneyplus.com/account",
      "path": "Profile → Account → Subscription → Cancel subscription",
      "evidenceUrl": "https://help.disneyplus.com/en-GB/article/disneyplus-en-pt-cancel"
    },
    "notes": "Direct web signup documented at https://www.disneyplus.com/en-gb/explore/how-to-join ; local pricing URLs retained in earlier evidence. Not third-party bundles."
  },
  {
    "serviceSlug": "max",
    "markets": [
      "US",
      "NO",
      "SE",
      "DK",
      "DE",
      "ES",
      "FR",
      "IT",
      "PT",
      "NL",
      "BE",
      "AT",
      "IE",
      "FI",
      "MX",
      "ID",
      "TR",
      "VN",
      "RO",
      "GR",
      "CL",
      "CO"
    ],
    "verifiedAt": "2026-09-10",
    "scope": "Provider web-billed recurring subscription only; third-party channel billing excluded",
    "startWeb": {
      "status": "VERIFIED",
      "url": "https://www.hbomax.com/",
      "evidenceUrl": "https://help.hbomax.com/ws-en/Answer/Detail/000002526"
    },
    "manageWeb": {
      "status": "VERIFIED",
      "url": "https://help.hbomax.com/ws-en/Answer/Detail/000002526",
      "path": "Profile → Subscription → Cancel subscription",
      "evidenceUrl": "https://help.hbomax.com/ws-en/Answer/Detail/000002526"
    },
    "cancelWeb": {
      "status": "VERIFIED",
      "url": "https://help.hbomax.com/ws-en/Answer/Detail/000002526",
      "path": "Profile → Subscription → Cancel subscription",
      "evidenceUrl": "https://help.hbomax.com/ws-en/Answer/Detail/000002526"
    },
    "notes": "Choose billed directly by HBO Max branch; operator/store plans are separate."
  },
  {
    "serviceSlug": "prime-video",
    "markets": [
      "US",
      "NO",
      "SE",
      "DK",
      "DE",
      "ES",
      "FR",
      "IT",
      "PT",
      "NL",
      "BE",
      "AT",
      "IE",
      "FI"
    ],
    "verifiedAt": "2026-09-10",
    "scope": "Provider web-billed recurring subscription only; third-party channel billing excluded",
    "startWeb": {
      "status": "VERIFIED",
      "url": "https://www.primevideo.com/",
      "evidenceUrl": "https://www.primevideo.com/help/?language=en-US&nodeId=GWGDSNXVPJ93UW5V"
    },
    "manageWeb": {
      "status": "VERIFIED",
      "url": "https://www.primevideo.com/settings",
      "path": "Account & Settings → Your Account → End subscription",
      "evidenceUrl": "https://www.primevideo.com/help/?language=en-US&nodeId=GWGDSNXVPJ93UW5V"
    },
    "cancelWeb": {
      "status": "VERIFIED",
      "url": "https://www.primevideo.com/settings",
      "path": "Account & Settings → Your Account → End subscription",
      "evidenceUrl": "https://www.primevideo.com/help/?language=en-US&nodeId=GWGDSNXVPJ93UW5V"
    },
    "notes": "Standalone Prime Video only; included Amazon Prime membership follows its Amazon account flow."
  },
  {
    "serviceSlug": "storytel",
    "markets": [
      "NO"
    ],
    "verifiedAt": "2026-09-10",
    "scope": "Provider web-billed recurring subscription only; third-party channel billing excluded",
    "startWeb": {
      "status": "VERIFIED",
      "url": "https://www.storytel.com/no/subscriptions",
      "evidenceUrl": "https://support.storytel.com/hc/en-001/articles/360010486719-Cancel-your-subscription"
    },
    "manageWeb": {
      "status": "VERIFIED",
      "url": "https://support.storytel.com/hc/en-001/articles/360010486719-Cancel-your-subscription",
      "path": "Log in on Storytel website → Account → Subscription → Cancel",
      "evidenceUrl": "https://support.storytel.com/hc/en-001/articles/360010486719-Cancel-your-subscription"
    },
    "cancelWeb": {
      "status": "VERIFIED",
      "url": "https://support.storytel.com/hc/en-001/articles/360010486719-Cancel-your-subscription",
      "path": "Log in on Storytel website → Account → Subscription → Cancel",
      "evidenceUrl": "https://support.storytel.com/hc/en-001/articles/360010486719-Cancel-your-subscription"
    },
    "notes": "Reading/listening in the app does not prevent website billing and cancellation."
  },
  {
    "serviceSlug": "viaplay",
    "markets": [
      "NO"
    ],
    "verifiedAt": "2026-09-10",
    "scope": "Provider web-billed recurring subscription only; third-party channel billing excluded",
    "startWeb": {
      "status": "VERIFIED",
      "url": "https://viaplay.no/",
      "evidenceUrl": "https://help.viaplay.com/nb/avslutte-abonnement-viaplay-kunde/"
    },
    "manageWeb": {
      "status": "VERIFIED",
      "url": "https://help.viaplay.com/nb/avslutte-abonnement-viaplay-kunde/",
      "path": "Log in at viaplay.no → My account → Cancel package",
      "evidenceUrl": "https://help.viaplay.com/nb/avslutte-abonnement-viaplay-kunde/"
    },
    "cancelWeb": {
      "status": "VERIFIED",
      "url": "https://help.viaplay.com/nb/avslutte-abonnement-viaplay-kunde/",
      "path": "Log in at viaplay.no → My account → Cancel package",
      "evidenceUrl": "https://help.viaplay.com/nb/avslutte-abonnement-viaplay-kunde/"
    },
    "notes": "NO direct plan; existing management destination is preserved."
  },
  {
    "serviceSlug": "rtl-plus",
    "markets": [
      "DE"
    ],
    "verifiedAt": "2026-09-10",
    "scope": "Provider web-billed recurring subscription only; third-party channel billing excluded",
    "startWeb": {
      "status": "VERIFIED",
      "url": "https://plus.rtl.de/",
      "evidenceUrl": "https://plus.rtl.de/agb"
    },
    "manageWeb": {
      "status": "VERIFIED",
      "url": "https://plus.rtl.de/agb",
      "path": "Account profile → Subscription → Cancel",
      "evidenceUrl": "https://plus.rtl.de/agb"
    },
    "cancelWeb": {
      "status": "VERIFIED",
      "url": "https://plus.rtl.de/agb",
      "path": "Account profile → Subscription → Cancel",
      "evidenceUrl": "https://plus.rtl.de/agb"
    },
    "notes": "Provider terms explicitly describe Buy button contract formation and cancellation in account profile."
  },
  {
    "serviceSlug": "videoland",
    "markets": [
      "NL"
    ],
    "verifiedAt": "2026-09-10",
    "scope": "Provider web-billed recurring subscription only; third-party channel billing excluded",
    "startWeb": {
      "status": "VERIFIED",
      "url": "https://www.videoland.com/nl/",
      "evidenceUrl": "https://v2.videoland.com/algemene-voorwaarden"
    },
    "manageWeb": {
      "status": "VERIFIED",
      "url": "https://v2.videoland.com/algemene-voorwaarden",
      "path": "Account settings → Abonnement → Opzeggen",
      "evidenceUrl": "https://v2.videoland.com/algemene-voorwaarden"
    },
    "cancelWeb": {
      "status": "VERIFIED",
      "url": "https://v2.videoland.com/algemene-voorwaarden",
      "path": "Account settings → Abonnement → Opzeggen",
      "evidenceUrl": "https://v2.videoland.com/algemene-voorwaarden"
    },
    "notes": "Terms 3.11 explicitly permit online cancellation; third-party distributor contracts excluded."
  },
  {
    "serviceSlug": "u-next",
    "markets": [
      "JP"
    ],
    "verifiedAt": "2026-09-10",
    "scope": "Provider web-billed recurring subscription only; third-party channel billing excluded",
    "startWeb": {
      "status": "VERIFIED",
      "url": "https://www.unext.jp/",
      "evidenceUrl": "https://help.unext.jp/guide/detail/how-to-cancel-the-contract"
    },
    "manageWeb": {
      "status": "VERIFIED",
      "url": "https://help.unext.jp/guide/detail/how-to-cancel-the-contract",
      "path": "Web browser → Account/contract → Contract details/cancellation → Cancel",
      "evidenceUrl": "https://help.unext.jp/guide/detail/how-to-cancel-the-contract"
    },
    "cancelWeb": {
      "status": "VERIFIED",
      "url": "https://help.unext.jp/guide/detail/how-to-cancel-the-contract",
      "path": "Web browser → Account/contract → Contract details/cancellation → Cancel",
      "evidenceUrl": "https://help.unext.jp/guide/detail/how-to-cancel-the-contract"
    },
    "notes": "Select credit-card/web contract instructions, not Apple or Amazon billing. Standard open monthly plan only."
  },
  {
    "serviceSlug": "hulu-japan",
    "markets": [
      "JP"
    ],
    "verifiedAt": "2026-09-10",
    "scope": "Provider web-billed recurring subscription only; third-party channel billing excluded",
    "startWeb": {
      "status": "VERIFIED",
      "url": "https://www.hulu.jp/",
      "evidenceUrl": "https://help.hulu.jp/hc/ja/articles/360044685633-Huluを解約する"
    },
    "manageWeb": {
      "status": "VERIFIED",
      "url": "https://id.hulu.jp/account",
      "path": "Account → Service → Cancel contract",
      "evidenceUrl": "https://help.hulu.jp/hc/ja/articles/360044685633-Huluを解約する"
    },
    "cancelWeb": {
      "status": "VERIFIED",
      "url": "https://id.hulu.jp/account",
      "path": "Account → Service → Cancel contract",
      "evidenceUrl": "https://help.hulu.jp/hc/ja/articles/360044685633-Huluを解約する"
    },
    "notes": "HJ Holdings Japan identity; separate from US Hulu."
  },
  {
    "serviceSlug": "dmm-tv",
    "markets": [
      "JP"
    ],
    "verifiedAt": "2026-09-10",
    "scope": "Provider web-billed recurring subscription only; third-party channel billing excluded",
    "startWeb": {
      "status": "VERIFIED",
      "url": "https://premium.dmm.com/welcome/b/",
      "evidenceUrl": "https://support.dmm.com/premium/article/47504"
    },
    "manageWeb": {
      "status": "VERIFIED",
      "url": "https://support.dmm.com/premium/article/47504",
      "path": "Browser → DMM Premium usage status → Cancel plan",
      "evidenceUrl": "https://support.dmm.com/premium/article/47504"
    },
    "cancelWeb": {
      "status": "VERIFIED",
      "url": "https://support.dmm.com/premium/article/47504",
      "path": "Browser → DMM Premium usage status → Cancel plan",
      "evidenceUrl": "https://support.dmm.com/premium/article/47504"
    },
    "notes": "Direct website plan: cancellation becomes available after two days at 05:00. Store/bundle contracts have separate branches."
  },
  {
    "serviceSlug": "osn-plus",
    "markets": [
      "AE",
      "SA",
      "QA",
      "EG"
    ],
    "verifiedAt": "2026-09-10",
    "scope": "Provider web-billed recurring subscription only; third-party channel billing excluded",
    "startWeb": {
      "status": "VERIFIED",
      "url": "https://www.osnplus.com/",
      "evidenceUrl": "https://support.osnplus.com/hc/en-us/articles/6927724590490-How-to-Cancel-Your-OSN-Subscription"
    },
    "manageWeb": {
      "status": "VERIFIED",
      "url": "https://osnplus.com/manage-subscriptions",
      "path": "Manage subscriptions → Cancel → Confirm",
      "evidenceUrl": "https://support.osnplus.com/hc/en-us/articles/6927724590490-How-to-Cancel-Your-OSN-Subscription"
    },
    "cancelWeb": {
      "status": "VERIFIED",
      "url": "https://osnplus.com/manage-subscriptions",
      "path": "Manage subscriptions → Cancel → Confirm",
      "evidenceUrl": "https://support.osnplus.com/hc/en-us/articles/6927724590490-How-to-Cancel-Your-OSN-Subscription"
    },
    "notes": "Card/Apple Pay on provider website; Apple Pay is not App Store IAP. Operator exceptions do not establish direct billing."
  },
  {
    "serviceSlug": "claude",
    "markets": [
      "US",
      "NO",
      "SE",
      "DK",
      "DE",
      "ES",
      "FR",
      "IT",
      "PT",
      "NL",
      "BE",
      "AT",
      "IE",
      "FI"
    ],
    "verifiedAt": "2026-09-10",
    "scope": "Provider web-billed recurring subscription only; third-party channel billing excluded",
    "startWeb": {
      "status": "VERIFIED",
      "url": "https://claude.ai/upgrade",
      "evidenceUrl": "https://support.claude.com/en/articles/8325617-cancel-your-pro-or-max-subscription"
    },
    "manageWeb": {
      "status": "VERIFIED",
      "url": "https://support.claude.com/en/articles/8325617-cancel-your-pro-or-max-subscription",
      "path": "Web Settings → Billing → Cancel",
      "evidenceUrl": "https://support.claude.com/en/articles/8325617-cancel-your-pro-or-max-subscription"
    },
    "cancelWeb": {
      "status": "VERIFIED",
      "url": "https://support.claude.com/en/articles/8325617-cancel-your-pro-or-max-subscription",
      "path": "Web Settings → Billing → Cancel",
      "evidenceUrl": "https://support.claude.com/en/articles/8325617-cancel-your-pro-or-max-subscription"
    },
    "notes": "Personal Pro/Max website subscriptions, not organizational contracts."
  },
  {
    "serviceSlug": "adobe-creative-cloud",
    "markets": [
      "US",
      "NO",
      "SE",
      "DK",
      "DE",
      "ES",
      "FR",
      "IT",
      "PT",
      "NL",
      "BE",
      "AT",
      "IE",
      "FI"
    ],
    "verifiedAt": "2026-09-10",
    "scope": "Provider web-billed recurring subscription only; third-party channel billing excluded",
    "startWeb": {
      "status": "VERIFIED",
      "url": "https://www.adobe.com/creativecloud/plans.html",
      "evidenceUrl": "https://helpx.adobe.com/account/individual/subscriptions-and-plans/renewals-and-cancellations/cancel-adobe-subscription.html"
    },
    "manageWeb": {
      "status": "VERIFIED",
      "url": "https://account.adobe.com/plans",
      "path": "Plans and payment → Manage plan → Cancel plan → Confirm",
      "evidenceUrl": "https://helpx.adobe.com/account/individual/subscriptions-and-plans/renewals-and-cancellations/cancel-adobe-subscription.html"
    },
    "cancelWeb": {
      "status": "VERIFIED",
      "url": "https://account.adobe.com/plans",
      "path": "Plans and payment → Manage plan → Cancel plan → Confirm",
      "evidenceUrl": "https://helpx.adobe.com/account/individual/subscriptions-and-plans/renewals-and-cancellations/cancel-adobe-subscription.html"
    },
    "notes": "Annual commitments/early cancellation charges may apply. Web cancellation does not mean free cancellation; payment processing can temporarily defer access."
  },
  {
    "serviceSlug": "tidal",
    "markets": [
      "US",
      "NO",
      "SE",
      "DK",
      "DE",
      "ES",
      "FR",
      "IT",
      "PT",
      "NL",
      "BE",
      "AT",
      "IE",
      "FI"
    ],
    "verifiedAt": "2026-09-10",
    "scope": "Provider web-billed recurring subscription only; third-party channel billing excluded",
    "startWeb": {
      "status": "VERIFIED",
      "url": "https://tidal.com/pricing",
      "evidenceUrl": "https://support.tidal.com/hc/en-us/articles/201314601-Cancel-Tidal-Subscription-or-Trial"
    },
    "manageWeb": {
      "status": "VERIFIED",
      "url": "https://account.tidal.com/",
      "path": "Subscription → Cancel → Confirm",
      "evidenceUrl": "https://support.tidal.com/hc/en-us/articles/201314601-Cancel-Tidal-Subscription-or-Trial"
    },
    "cancelWeb": {
      "status": "VERIFIED",
      "url": "https://account.tidal.com/",
      "path": "Subscription → Cancel → Confirm",
      "evidenceUrl": "https://support.tidal.com/hc/en-us/articles/201314601-Cancel-Tidal-Subscription-or-Trial"
    },
    "notes": ""
  },
  {
    "serviceSlug": "strava",
    "markets": [
      "US",
      "NO",
      "SE",
      "DK",
      "DE",
      "ES",
      "FR",
      "IT",
      "PT",
      "NL",
      "BE",
      "AT",
      "IE",
      "FI"
    ],
    "verifiedAt": "2026-09-10",
    "scope": "Provider web-billed recurring subscription only; third-party channel billing excluded",
    "startWeb": {
      "status": "VERIFIED",
      "url": "https://www.strava.com/subscribe",
      "evidenceUrl": "https://support.strava.com/en-us/articles/15401936-how-do-i-cancel-my-subscription"
    },
    "manageWeb": {
      "status": "VERIFIED",
      "url": "https://support.strava.com/en-us/articles/15401936-how-do-i-cancel-my-subscription",
      "path": "Website profile → Settings → My Account → Cancel subscription",
      "evidenceUrl": "https://support.strava.com/en-us/articles/15401936-how-do-i-cancel-my-subscription"
    },
    "cancelWeb": {
      "status": "VERIFIED",
      "url": "https://support.strava.com/en-us/articles/15401936-how-do-i-cancel-my-subscription",
      "path": "Website profile → Settings → My Account → Cancel subscription",
      "evidenceUrl": "https://support.strava.com/en-us/articles/15401936-how-do-i-cancel-my-subscription"
    },
    "notes": ""
  },
  {
    "serviceSlug": "calm",
    "markets": [
      "US",
      "NO",
      "SE",
      "DK",
      "DE",
      "ES",
      "FR",
      "IT",
      "PT",
      "NL",
      "BE",
      "AT",
      "IE",
      "FI"
    ],
    "verifiedAt": "2026-09-10",
    "scope": "Provider web-billed recurring subscription only; third-party channel billing excluded",
    "startWeb": {
      "status": "VERIFIED",
      "url": "https://www.calm.com/",
      "evidenceUrl": "https://support.calm.com/hc/en-us/articles/115002473607-How-to-Cancel-Your-Subscription-or-Free-Trial"
    },
    "manageWeb": {
      "status": "VERIFIED",
      "url": "https://www.calm.com/profile",
      "path": "Profile → Settings → Manage subscription → Cancel",
      "evidenceUrl": "https://support.calm.com/hc/en-us/articles/115002473607-How-to-Cancel-Your-Subscription-or-Free-Trial"
    },
    "cancelWeb": {
      "status": "VERIFIED",
      "url": "https://www.calm.com/profile",
      "path": "Profile → Settings → Manage subscription → Cancel",
      "evidenceUrl": "https://support.calm.com/hc/en-us/articles/115002473607-How-to-Cancel-Your-Subscription-or-Free-Trial"
    },
    "notes": "Recurring web Premium only; lifetime purchases are not subscriptions."
  },
  {
    "serviceSlug": "headspace",
    "markets": [
      "US",
      "NO",
      "SE",
      "DK",
      "DE",
      "ES",
      "FR",
      "IT",
      "PT",
      "NL",
      "BE",
      "AT",
      "IE",
      "FI"
    ],
    "verifiedAt": "2026-09-10",
    "scope": "Provider web-billed recurring subscription only; third-party channel billing excluded",
    "startWeb": {
      "status": "VERIFIED",
      "url": "https://www.headspace.com/subscriptions",
      "evidenceUrl": "https://help.headspace.com/hc/en-us/articles/115008364988-How-do-I-cancel-my-subscription"
    },
    "manageWeb": {
      "status": "VERIFIED",
      "url": "https://www.headspace.com/subscription/manage",
      "path": "Cancel membership → Confirm",
      "evidenceUrl": "https://help.headspace.com/hc/en-us/articles/115008364988-How-do-I-cancel-my-subscription"
    },
    "cancelWeb": {
      "status": "VERIFIED",
      "url": "https://www.headspace.com/subscription/manage",
      "path": "Cancel membership → Confirm",
      "evidenceUrl": "https://help.headspace.com/hc/en-us/articles/115008364988-How-do-I-cancel-my-subscription"
    },
    "notes": ""
  },
  {
    "serviceSlug": "watch-it",
    "markets": [
      "EG"
    ],
    "verifiedAt": "2026-09-10",
    "scope": "Provider web-billed recurring subscription only; third-party channel billing excluded",
    "startWeb": {
      "status": "VERIFIED",
      "url": "https://www.watchit.com/",
      "evidenceUrl": "https://support.watchit.com/hc/en-us/articles/5212817769757-How-to-cancel-your-subscription-Request-Refund"
    },
    "manageWeb": {
      "status": "VERIFIED",
      "url": "https://support.watchit.com/hc/en-us/articles/5212817769757-How-to-cancel-your-subscription-Request-Refund",
      "path": "Website profile → Settings → Subscription & Payment → Stop subscription",
      "evidenceUrl": "https://support.watchit.com/hc/en-us/articles/5212817769757-How-to-cancel-your-subscription-Request-Refund"
    },
    "cancelWeb": {
      "status": "VERIFIED",
      "url": "https://support.watchit.com/hc/en-us/articles/5212817769757-How-to-cancel-your-subscription-Request-Refund",
      "path": "Website profile → Settings → Subscription & Payment → Stop subscription",
      "evidenceUrl": "https://support.watchit.com/hc/en-us/articles/5212817769757-How-to-cancel-your-subscription-Request-Refund"
    },
    "notes": "Egypt direct credit-card branch only; WE/operator contract is not direct provider billing."
  },
  {
    "serviceSlug": "vix",
    "markets": [
      "MX"
    ],
    "verifiedAt": "2026-09-10",
    "scope": "Provider web-billed recurring subscription only; third-party channel billing excluded",
    "startWeb": {
      "status": "VERIFIED",
      "url": "https://vix.com/",
      "evidenceUrl": "https://ayuda.vix.com/hc/en-us/articles/18400612454413-How-do-I-cancel-my-subscription-if-I-bought-it-through-the-ViX-website"
    },
    "manageWeb": {
      "status": "VERIFIED",
      "url": "https://ayuda.vix.com/hc/en-us/articles/18400612454413-How-do-I-cancel-my-subscription-if-I-bought-it-through-the-ViX-website",
      "path": "Website sign in → My account → Cancel my subscription",
      "evidenceUrl": "https://ayuda.vix.com/hc/en-us/articles/18400612454413-How-do-I-cancel-my-subscription-if-I-bought-it-through-the-ViX-website"
    },
    "cancelWeb": {
      "status": "VERIFIED",
      "url": "https://ayuda.vix.com/hc/en-us/articles/18400612454413-How-do-I-cancel-my-subscription-if-I-bought-it-through-the-ViX-website",
      "path": "Website sign in → My account → Cancel my subscription",
      "evidenceUrl": "https://ayuda.vix.com/hc/en-us/articles/18400612454413-How-do-I-cancel-my-subscription-if-I-bought-it-through-the-ViX-website"
    },
    "notes": "MX direct web subscription only; Mercado Libre/store paths separate."
  },
  {
    "serviceSlug": "anghami",
    "markets": [
      "AE",
      "SA",
      "QA",
      "EG"
    ],
    "verifiedAt": "2026-09-10",
    "scope": "Provider web-billed recurring subscription only; third-party channel billing excluded",
    "startWeb": {
      "status": "VERIFIED",
      "url": "https://www.anghami.com/plus",
      "evidenceUrl": "https://support.anghami.com/hc/en-us/articles/224891887-How-to-Cancel-Your-Anghami-Plus-Subscription"
    },
    "manageWeb": {
      "status": "VERIFIED",
      "url": "https://www.anghami.com/manage-account",
      "path": "Manage account → Cancel subscription",
      "evidenceUrl": "https://support.anghami.com/hc/en-us/articles/224891887-How-to-Cancel-Your-Anghami-Plus-Subscription"
    },
    "cancelWeb": {
      "status": "VERIFIED",
      "url": "https://www.anghami.com/manage-account",
      "path": "Manage account → Cancel subscription",
      "evidenceUrl": "https://support.anghami.com/hc/en-us/articles/224891887-How-to-Cancel-Your-Anghami-Plus-Subscription"
    },
    "notes": "Bank card provider web billing can be denominated in USD in Egypt; no FX price inferred."
  },
  {
    "serviceSlug": "tod",
    "markets": [
      "QA"
    ],
    "verifiedAt": "2026-09-10",
    "scope": "Provider web-billed recurring subscription only; third-party channel billing excluded",
    "startWeb": {
      "status": "REVIEW_REQUIRED",
      "evidenceUrl": "https://support.tod.tv/hc/en-us/articles/10483708686236-How-do-I-subscribe-to-TOD"
    },
    "manageWeb": {
      "status": "VERIFIED",
      "url": "https://support.tod.tv/hc/en-us/articles/12238758251164-How-do-I-cancel-my-subscription",
      "path": "Website → Account settings → Subscription → Cancel",
      "evidenceUrl": "https://support.tod.tv/hc/en-us/articles/12238758251164-How-do-I-cancel-my-subscription"
    },
    "cancelWeb": {
      "status": "VERIFIED",
      "url": "https://support.tod.tv/hc/en-us/articles/12238758251164-How-do-I-cancel-my-subscription",
      "path": "Website → Account settings → Subscription → Cancel",
      "evidenceUrl": "https://support.tod.tv/hc/en-us/articles/12238758251164-How-do-I-cancel-my-subscription"
    },
    "notes": "Qatar direct web signup remains unverified. Official general signup instructions describe website Plans and monthly/yearly checkout, but do not establish the Qatar direct flow; https://www.tod.tv/en/plans rejected access on 2026-09-10. Ooredoo Qatar availability and generic web cancellation instructions are not direct signup evidence. Preserve cancellation metadata and saved subscriptions; exclude new discovery pending Qatar direct signup verification."
  },
  {
    "serviceSlug": "shahid",
    "markets": [
      "AE",
      "SA",
      "QA",
      "EG"
    ],
    "verifiedAt": "2026-09-10",
    "scope": "Provider web-billed recurring subscription only; third-party channel billing excluded",
    "startWeb": {
      "status": "VERIFIED",
      "url": "https://shahid.mbc.net/en/hub/web-promo",
      "evidenceUrl": "https://shahid.mbc.net/en/hub/web-promo"
    },
    "manageWeb": {
      "status": "VERIFIED",
      "url": "https://shahid.mbc.net/en/hub/web-promo",
      "path": "Adult profile → Account settings → Subscription management → Cancel",
      "evidenceUrl": "https://shahid.mbc.net/en/hub/web-promo"
    },
    "cancelWeb": {
      "status": "VERIFIED",
      "url": "https://shahid.mbc.net/en/hub/web-promo",
      "path": "Adult profile → Account settings → Subscription management → Cancel",
      "evidenceUrl": "https://shahid.mbc.net/en/hub/web-promo"
    },
    "notes": "Website FAQ documents signup and cancellation; direct credit card only, not phone/operator/store billing."
  },
  {
    "serviceSlug": "voyo-ro",
    "markets": [
      "RO"
    ],
    "verifiedAt": "2026-09-10",
    "scope": "Provider web-billed recurring subscription only; third-party channel billing excluded",
    "startWeb": {
      "status": "VERIFIED",
      "url": "https://voyo.protv.ro/",
      "evidenceUrl": "https://voyo.protv.ro/faq/15-cum-anulez-abonamentul"
    },
    "manageWeb": {
      "status": "VERIFIED",
      "url": "https://voyo.protv.ro/faq/15-cum-anulez-abonamentul",
      "path": "Website profile → My subscriptions → Cancel subscription",
      "evidenceUrl": "https://voyo.protv.ro/faq/15-cum-anulez-abonamentul"
    },
    "cancelWeb": {
      "status": "VERIFIED",
      "url": "https://voyo.protv.ro/faq/15-cum-anulez-abonamentul",
      "path": "Website profile → My subscriptions → Cancel subscription",
      "evidenceUrl": "https://voyo.protv.ro/faq/15-cum-anulez-abonamentul"
    },
    "notes": "Romania recurring web plan; unrelated Czech Voyo/Oneplay not included."
  },
  {
    "serviceSlug": "antenaplay",
    "markets": [
      "RO"
    ],
    "verifiedAt": "2026-09-10",
    "scope": "Provider web-billed recurring subscription only; third-party channel billing excluded",
    "startWeb": {
      "status": "VERIFIED",
      "url": "https://antenaplay.ro/ajutor-clienti/cum-imi-fac-abonament",
      "evidenceUrl": "https://antenaplay.ro/ajutor-clienti/cum-renunt-la-abonament"
    },
    "manageWeb": {
      "status": "VERIFIED",
      "url": "https://antenaplay.ro/ajutor-clienti/cum-renunt-la-abonament",
      "path": "Browser account → Card subscription → Cancel",
      "evidenceUrl": "https://antenaplay.ro/ajutor-clienti/cum-renunt-la-abonament"
    },
    "cancelWeb": {
      "status": "VERIFIED",
      "url": "https://antenaplay.ro/ajutor-clienti/cum-renunt-la-abonament",
      "path": "Browser account → Card subscription → Cancel",
      "evidenceUrl": "https://antenaplay.ro/ajutor-clienti/cum-renunt-la-abonament"
    },
    "notes": "48-hour deadline; website browser required, not mobile app. No inferred RON price from EUR."
  },
  {
    "serviceSlug": "gain",
    "markets": [
      "TR"
    ],
    "verifiedAt": "2026-09-10",
    "scope": "Provider web-billed recurring subscription only; third-party channel billing excluded",
    "startWeb": {
      "status": "VERIFIED",
      "url": "https://www.gain.tv/",
      "evidenceUrl": "https://destek.gain.tv/abonelik-iptal.html"
    },
    "manageWeb": {
      "status": "VERIFIED",
      "url": "https://destek.gain.tv/abonelik-iptal.html",
      "path": "Website → My account → Cancel subscription → Continue cancellation",
      "evidenceUrl": "https://destek.gain.tv/abonelik-iptal.html"
    },
    "cancelWeb": {
      "status": "VERIFIED",
      "url": "https://destek.gain.tv/abonelik-iptal.html",
      "path": "Website → My account → Cancel subscription → Continue cancellation",
      "evidenceUrl": "https://destek.gain.tv/abonelik-iptal.html"
    },
    "notes": "Conflicting direct price pages remain unresolved/manual."
  },
  {
    "serviceSlug": "dstv-stream",
    "markets": [
      "ZA"
    ],
    "verifiedAt": "2026-09-10",
    "scope": "Provider web-billed recurring subscription only; third-party channel billing excluded",
    "startWeb": {
      "status": "VERIFIED",
      "url": "https://www.dstv.com/en-za/campaign/new-compact-season/",
      "evidenceUrl": "https://www.dstv.com/en-za/help/faqs/viewing/my-dstv-viewing/how-can-i-cancel-my-dstv-packageservice/"
    },
    "manageWeb": {
      "status": "VERIFIED",
      "url": "https://www.dstv.com/en-za/help/faqs/viewing/my-dstv-viewing/how-can-i-cancel-my-dstv-packageservice/",
      "path": "Website → My products → Select package → Cancel",
      "evidenceUrl": "https://www.dstv.com/en-za/help/faqs/viewing/my-dstv-viewing/how-can-i-cancel-my-dstv-packageservice/"
    },
    "cancelWeb": {
      "status": "VERIFIED",
      "url": "https://www.dstv.com/en-za/help/faqs/viewing/my-dstv-viewing/how-can-i-cancel-my-dstv-packageservice/",
      "path": "Website My Products → select package → Disconnect → schedule disconnection for next payment date",
      "evidenceUrl": "https://www.dstv.com/en-za/help/faqs/viewing/my-dstv-viewing/how-can-i-cancel-my-dstv-packageservice/"
    },
    "notes": "Streaming month-to-month product, not satellite/internet commitment or operator bundles; September 17 package changes require recheck."
  },
  {
    "serviceSlug": "cinobo",
    "markets": [
      "GR"
    ],
    "verifiedAt": "2026-09-10",
    "scope": "Provider web-billed recurring subscription only; third-party channel billing excluded",
    "startWeb": {
      "status": "VERIFIED",
      "url": "https://cinobo.com/en",
      "evidenceUrl": "https://cinobo.com/en/help/subscription-and-payment/how-do-i-cancel-my-subscription"
    },
    "manageWeb": {
      "status": "VERIFIED",
      "url": "https://cinobo.com/en/help/subscription-and-payment/how-do-i-cancel-my-subscription",
      "path": "Web account → Subscription → Cancel",
      "evidenceUrl": "https://cinobo.com/en/help/subscription-and-payment/how-do-i-cancel-my-subscription"
    },
    "cancelWeb": {
      "status": "VERIFIED",
      "url": "https://cinobo.com/en/help/subscription-and-payment/how-do-i-cancel-my-subscription",
      "path": "Web account → Subscription → Cancel",
      "evidenceUrl": "https://cinobo.com/en/help/subscription-and-payment/how-do-i-cancel-my-subscription"
    },
    "notes": ""
  },
  {
    "serviceSlug": "zapping",
    "markets": [
      "CL"
    ],
    "verifiedAt": "2026-09-10",
    "scope": "Provider web-billed recurring subscription only; third-party channel billing excluded",
    "startWeb": {
      "status": "VERIFIED",
      "url": "https://app.zapping.com/register",
      "evidenceUrl": "https://www.zapping.com/opiniones-y-reclamos"
    },
    "manageWeb": {
      "status": "VERIFIED",
      "url": "https://www.zapping.com/opiniones-y-reclamos",
      "path": "User panel → Plan details → Finalizar Suscripción",
      "evidenceUrl": "https://www.zapping.com/opiniones-y-reclamos"
    },
    "cancelWeb": {
      "status": "VERIFIED",
      "url": "https://www.zapping.com/opiniones-y-reclamos",
      "path": "User panel → Plan details → Finalizar Suscripción",
      "evidenceUrl": "https://www.zapping.com/opiniones-y-reclamos"
    },
    "notes": "Monthly web plan only. Annual cancellation requires support email and is not certified by this self-service evidence."
  },
  {
    "serviceSlug": "sportsnet-plus",
    "markets": [
      "CA"
    ],
    "verifiedAt": "2026-09-10",
    "scope": "Provider web-billed recurring subscription only; third-party channel billing excluded",
    "startWeb": {
      "status": "VERIFIED",
      "url": "https://www.sportsnetplus.ca/",
      "evidenceUrl": "https://support.sportsnetplus.ca/hc/en-gb/articles/47542170434964-How-do-I-cancel-my-subscription"
    },
    "manageWeb": {
      "status": "REVIEW_REQUIRED",
      "url": "https://support.sportsnetplus.ca/hc/en-gb/articles/47542170434964-How-do-I-cancel-my-subscription",
      "path": "Website account → Subscription → Cancel",
      "evidenceUrl": "https://support.sportsnetplus.ca/hc/en-gb/articles/47542170434964-How-do-I-cancel-my-subscription"
    },
    "cancelWeb": {
      "status": "REVIEW_REQUIRED",
      "url": "https://support.sportsnetplus.ca/hc/en-gb/articles/47542170434964-How-do-I-cancel-my-subscription",
      "path": "Website account → Subscription → Cancel",
      "evidenceUrl": "https://support.sportsnetplus.ca/hc/en-gb/articles/47542170434964-How-do-I-cancel-my-subscription"
    },
    "notes": "Official help search result located, but full current web cancellation instructions could not be inspected. Do not infer eligibility from a snippet."
  },
  {
    "serviceSlug": "microsoft-365",
    "markets": [
      "US",
      "NO",
      "SE",
      "DK",
      "DE",
      "ES",
      "FR",
      "IT",
      "PT",
      "NL",
      "BE",
      "AT",
      "IE",
      "FI",
      "CN"
    ],
    "verifiedAt": "2026-09-10",
    "scope": "Provider web-billed recurring subscription only; third-party channel billing excluded",
    "startWeb": {
      "status": "VERIFIED",
      "url": "https://www.microsoft.com/microsoft-365/buy/compare-all-microsoft-365-products",
      "evidenceUrl": "https://support.microsoft.com/en-us/accounts-billing/subscriptions/cancel-your-microsoft-subscription"
    },
    "manageWeb": {
      "status": "VERIFIED",
      "url": "https://account.microsoft.com/services",
      "path": "Services → Manage subscription → Cancel",
      "evidenceUrl": "https://support.microsoft.com/en-us/accounts-billing/subscriptions/cancel-your-microsoft-subscription"
    },
    "cancelWeb": {
      "status": "VERIFIED",
      "url": "https://account.microsoft.com/services",
      "path": "Services → Manage subscription → Cancel",
      "evidenceUrl": "https://support.microsoft.com/en-us/accounts-billing/subscriptions/cancel-your-microsoft-subscription"
    },
    "notes": "Consumer direct Microsoft subscription, not reseller/enterprise."
  },
  {
    "serviceSlug": "ubisoft-plus",
    "markets": [
      "US",
      "NO",
      "SE",
      "DK",
      "DE",
      "ES",
      "FR",
      "IT",
      "PT",
      "NL",
      "BE",
      "AT",
      "IE",
      "FI"
    ],
    "verifiedAt": "2026-09-10",
    "scope": "Provider web-billed recurring subscription only; third-party channel billing excluded",
    "startWeb": {
      "status": "VERIFIED",
      "url": "https://store.ubisoft.com/ubisoftplus",
      "evidenceUrl": "https://www.ubisoft.com/legal/export/documents/en-GB-ubisoftplusterms-2.0.pdf"
    },
    "manageWeb": {
      "status": "VERIFIED",
      "url": "https://www.ubisoft.com/legal/export/documents/en-GB-ubisoftplusterms-2.0.pdf",
      "path": "My account → Cancel subscription",
      "evidenceUrl": "https://www.ubisoft.com/legal/export/documents/en-GB-ubisoftplusterms-2.0.pdf"
    },
    "cancelWeb": {
      "status": "VERIFIED",
      "url": "https://www.ubisoft.com/legal/export/documents/en-GB-ubisoftplusterms-2.0.pdf",
      "path": "My account → Cancel subscription",
      "evidenceUrl": "https://www.ubisoft.com/legal/export/documents/en-GB-ubisoftplusterms-2.0.pdf"
    },
    "notes": "Provider recurring web plan; console distributor purchases excluded."
  },
  {
    "serviceSlug": "crunchyroll",
    "markets": [
      "US",
      "NO",
      "SE",
      "DK",
      "DE",
      "ES",
      "FR",
      "IT",
      "PT",
      "NL",
      "BE",
      "AT",
      "IE",
      "FI"
    ],
    "verifiedAt": "2026-09-10",
    "scope": "Provider web-billed recurring subscription only; third-party channel billing excluded",
    "startWeb": {
      "status": "VERIFIED",
      "url": "https://www.crunchyroll.com/premium",
      "evidenceUrl": "https://help.crunchyroll.com/hc/en-us/articles/17931128982164-How-do-I-cancel-my-membership"
    },
    "manageWeb": {
      "status": "REVIEW_REQUIRED",
      "url": "https://help.crunchyroll.com/hc/en-us/articles/17931128982164-How-do-I-cancel-my-membership",
      "path": "Website account → Membership info → Cancel membership",
      "evidenceUrl": "https://help.crunchyroll.com/hc/en-us/articles/17931128982164-How-do-I-cancel-my-membership"
    },
    "cancelWeb": {
      "status": "REVIEW_REQUIRED",
      "url": "https://help.crunchyroll.com/hc/en-us/articles/17931128982164-How-do-I-cancel-my-membership",
      "path": "Website account → Membership info → Cancel membership",
      "evidenceUrl": "https://help.crunchyroll.com/hc/en-us/articles/17931128982164-How-do-I-cancel-my-membership"
    },
    "notes": "Official help search result located, but full current web cancellation instructions could not be inspected. Do not infer eligibility from a snippet."
  },
  {
    "serviceSlug": "siriusxm-canada",
    "markets": [
      "CA"
    ],
    "verifiedAt": "2026-09-10",
    "scope": "Direct web-billed recurring subscription",
    "startWeb": {
      "status": "VERIFIED",
      "url": "https://www.siriusxm.ca/",
      "evidenceUrl": "https://www.siriusxm.ca/help/manage-or-cancel-service/"
    },
    "manageWeb": {
      "status": "VERIFIED",
      "url": "https://www.siriusxm.ca/help/manage-or-cancel-service/",
      "evidenceUrl": "https://www.siriusxm.ca/help/manage-or-cancel-service/"
    },
    "cancelWeb": {
      "status": "REVIEW_REQUIRED",
      "evidenceUrl": "https://listenercare.siriusxm.ca/prweb/PRRestService/seoCa/km/help/SupportCenterExCA/KC-3916"
    },
    "notes": "Provider says subscription may or may not be cancelled online. General account access does not establish a reliable web cancellation route; excluded pending plan-specific evidence."
  },
  {
    "serviceSlug": "vidio",
    "markets": [
      "ID"
    ],
    "verifiedAt": "2026-09-10",
    "scope": "Direct recurring website purchase",
    "startWeb": {
      "status": "VERIFIED",
      "url": "https://www.vidio.com/",
      "evidenceUrl": "https://support.vidio.com/support/solutions/articles/43000507012-berhenti-berlangganan-vidio"
    },
    "manageWeb": {
      "status": "REVIEW_REQUIRED"
    },
    "cancelWeb": {
      "status": "REVIEW_REQUIRED",
      "evidenceUrl": "https://support.vidio.com/support/solutions/articles/43000507012-berhenti-berlangganan-vidio"
    },
    "notes": "June 2026 help documents direct web purchases but cancellation instructions emphasize the app/email; another page describes My Account without clearly establishing browser. Web completion remains unproven, not asserted impossible."
  },
  {
    "serviceSlug": "apple-music",
    "markets": [
      "US",
      "NO",
      "SE",
      "DK",
      "DE",
      "ES",
      "FR",
      "IT",
      "PT",
      "NL",
      "BE",
      "AT",
      "IE",
      "FI",
      "CN",
      "GB",
      "AU",
      "NZ",
      "CH",
      "PL",
      "BR",
      "CZ",
      "MY",
      "IN",
      "SG",
      "HK",
      "TW",
      "AE",
      "TH",
      "PH",
      "JP",
      "CA",
      "SA",
      "KR",
      "MX",
      "ID",
      "TR",
      "ZA",
      "IL",
      "QA",
      "EG",
      "VN",
      "RO",
      "GR",
      "CL",
      "CO"
    ],
    "verifiedAt": "2026-09-10",
    "scope": "Provider-owned direct web subscription; excludes Google Play, operator and third-party bundles",
    "startWeb": {
      "status": "VERIFIED",
      "url": "https://music.apple.com",
      "evidenceUrl": "https://support.apple.com/guide/music-web/subscribe-apdm8de77edb/web"
    },
    "manageWeb": {
      "status": "VERIFIED",
      "url": "https://music.apple.com",
      "path": "Account → Settings → Subscriptions → Manage → Cancel",
      "evidenceUrl": "https://support.apple.com/en-ca/118399"
    },
    "cancelWeb": {
      "status": "VERIFIED",
      "url": "https://music.apple.com",
      "path": "Account → Settings → Subscriptions → Manage → Cancel",
      "evidenceUrl": "https://support.apple.com/en-ca/118399"
    },
    "notes": "Apple is the provider here; web purchase is distinct from third-party IAP. Local immediate-refund rules may differ from ending renewal."
  },
  {
    "serviceSlug": "apple-tv-plus",
    "markets": [
      "US",
      "NO",
      "SE",
      "DK",
      "DE",
      "ES",
      "FR",
      "IT",
      "PT",
      "NL",
      "BE",
      "AT",
      "IE",
      "FI",
      "GB",
      "AU",
      "NZ",
      "CH",
      "PL",
      "BR",
      "CZ",
      "MY",
      "IN",
      "SG",
      "HK",
      "TW",
      "AE",
      "TH",
      "PH",
      "JP",
      "CA",
      "SA",
      "KR",
      "MX",
      "ID",
      "ZA",
      "IL",
      "QA",
      "EG",
      "VN",
      "GR",
      "CL",
      "CO"
    ],
    "verifiedAt": "2026-09-10",
    "scope": "Provider-owned direct web subscription; excludes Google Play, operator and third-party bundles",
    "startWeb": {
      "status": "VERIFIED",
      "url": "https://tv.apple.com",
      "evidenceUrl": "https://support.apple.com/guide/tvplus/watch-in-a-web-browser-apdc0cb7ad64/web"
    },
    "manageWeb": {
      "status": "VERIFIED",
      "url": "https://tv.apple.com",
      "path": "Account → Settings → Subscriptions → Manage → Cancel",
      "evidenceUrl": "https://support.apple.com/en-us/118398"
    },
    "cancelWeb": {
      "status": "VERIFIED",
      "url": "https://tv.apple.com",
      "path": "Account → Settings → Subscriptions → Manage → Cancel",
      "evidenceUrl": "https://support.apple.com/en-us/118398"
    },
    "notes": "Google Play and Amazon billing excluded. Local immediate-refund rules may differ from ending renewal."
  },
  {
    "serviceSlug": "nintendo-switch-online",
    "markets": [
      "US",
      "BR",
      "JP",
      "CA",
      "MX",
      "CL",
      "CO"
    ],
    "verifiedAt": "2026-09-10",
    "scope": "Provider-owned direct web subscription; excludes Google Play, operator and third-party bundles",
    "startWeb": {
      "status": "VERIFIED",
      "url": "https://en-americas-support.nintendo.com/app/answers/detail/a_id/41195",
      "evidenceUrl": "https://en-americas-support.nintendo.com/app/answers/detail/a_id/41195"
    },
    "manageWeb": {
      "status": "VERIFIED",
      "url": "https://accounts.nintendo.com/portal",
      "path": "Nintendo Switch Online → membership status → turn off automatic renewal",
      "evidenceUrl": "https://en-americas-support.nintendo.com/app/answers/detail/a_id/41196"
    },
    "cancelWeb": {
      "status": "VERIFIED",
      "url": "https://accounts.nintendo.com/portal",
      "path": "Nintendo Switch Online → membership status → turn off automatic renewal",
      "evidenceUrl": "https://en-americas-support.nintendo.com/app/answers/detail/a_id/41196"
    },
    "notes": "Cancel at least 48 hours before renewal; Quebec recurring-renewal restriction remains. Japan browser instructions: https://support-jp.nintendo.com/app/answers/detail/a_id/35585. No prepaid product represented as recurring."
  },
  {
    "serviceSlug": "dropbox",
    "markets": [
      "US",
      "NO",
      "SE",
      "DK",
      "DE",
      "ES",
      "FR",
      "IT",
      "PT",
      "NL",
      "BE",
      "AT",
      "IE",
      "FI"
    ],
    "verifiedAt": "2026-09-10",
    "scope": "Provider-owned direct web subscription; excludes Google Play, operator and third-party bundles",
    "startWeb": {
      "status": "VERIFIED",
      "url": "https://www.dropbox.com/plans",
      "evidenceUrl": "https://help.dropbox.com/plans/dropbox-plus"
    },
    "manageWeb": {
      "status": "VERIFIED",
      "url": "https://www.dropbox.com/manage",
      "path": "Manage account → Cancel plan → confirm",
      "evidenceUrl": "https://help.dropbox.com/plans/downgrade-dropbox-individual-plans"
    },
    "cancelWeb": {
      "status": "VERIFIED",
      "url": "https://www.dropbox.com/manage",
      "path": "Manage account → Cancel plan → confirm",
      "evidenceUrl": "https://help.dropbox.com/plans/downgrade-dropbox-individual-plans"
    },
    "notes": "Direct personal Plus/Professional/Essentials scope. Team/invoiced and app-store plans are separate. The optional postal alternative does not make online cancellation ineligible."
  },
  {
    "serviceSlug": "playstation-plus",
    "markets": [
      "US",
      "NO",
      "SE",
      "DK",
      "DE",
      "ES",
      "FR",
      "IT",
      "PT",
      "NL",
      "BE",
      "AT",
      "IE",
      "FI",
      "CA"
    ],
    "verifiedAt": "2026-09-10",
    "scope": "Provider-owned direct web subscription; excludes Google Play, operator and third-party bundles",
    "startWeb": {
      "status": "VERIFIED",
      "url": "https://www.playstation.com/en-us/ps-plus",
      "evidenceUrl": "https://www.playstation.com/en-us/ps-plus"
    },
    "manageWeb": {
      "status": "VERIFIED",
      "url": "https://www.playstation.com/en-gb/support/subscriptions/cancel-playstation-plus/",
      "path": "Browser Account Management → Subscription → Cancel",
      "evidenceUrl": "https://www.playstation.com/en-gb/support/subscriptions/cancel-playstation-plus/"
    },
    "cancelWeb": {
      "status": "VERIFIED",
      "url": "https://www.playstation.com/en-gb/support/subscriptions/cancel-playstation-plus/",
      "path": "Browser Account Management → Subscription → Cancel",
      "evidenceUrl": "https://www.playstation.com/en-gb/support/subscriptions/cancel-playstation-plus/"
    },
    "notes": "Provider account country controls offered membership; no EA/Ubisoft third-party channel equivalence inferred. German subscription ending/refund options may differ."
  }
];

export function webEvidenceFor(serviceSlug:string,countryCode:string){
  return catalogWebEvidence.find(row=>row.serviceSlug===serviceSlug&&row.markets.includes(countryCode));
}
