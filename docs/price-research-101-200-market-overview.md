# Country coverage overview, canonical services 101–200

Reviewed 2026-10-23. The machine-readable rows are in `services/api/src/v2-operations/service-market-overview-next-hundred.mjs`. The order follows the canonical V2 Operations API universe. Each row partitions Savlivo’s 46 research markets into listed, reported unavailable and unknown.

**Listed is a research-priority lead, never Verified price or current country-proof.** `RETAINED_MARKET_LEAD` values come from earlier source-scoped catalog evidence; local offers and provider selectors are also positive leads only. A generic homepage proves neither a subscription nor a complete country list. Missing markets remain selectable. Only fresh, hash-checked, first-party bytes accepted by `market-availability.mjs` may exclude targets. No previous price, G1 receipt or market proof is reused.

`UNREVIEWED` marks a service without a reliable first-party lead yet. Walmart+ is the only complete negative in this batch: its own country-setting help says the membership is unavailable outside the US. That static report does not itself skip targets; a fresh accepted proof is still required. VIBE has announced that new membership signup stops in November and the service ends in December 2026; its Korean lead must be revisited before future research. Fitness Hut appears to have been rebranded as VivaGym, so its canonical identity needs a separate review. MEGA lacks a currently reviewable first-party subscription page in this pass.

| # | Service | Listed markets | Reported unavailable | Unknown | Evidence scope | First-party lead |
|---:|---|---|---:|---:|---|---|
| 101 | Rakuten Magazine | JP | 0 | 45 | LOCAL_OFFER | https://magazine.rakuten.co.jp/ |
| 102 | Readly | GB US | 0 | 44 | COUNTRY_SELECTOR_LEAD | https://global.readly.com/ |
| 103 | Svenska Dagbladet | SE | 0 | 45 | LOCAL_OFFER | https://www.svd.se/special/om-svd/fragor-svar |
| 104 | VG+ | NO | 0 | 45 | LOCAL_OFFER | https://www.vg.no/pluss |
| 105 | VIBE | KR | 0 | 45 | ANNOUNCED_SUNSET_LOCAL_OFFER | https://help.naver.com/service/20370/contents/25497?osType=COMMONOS |
| 106 | Ximalaya | CN | 0 | 45 | LOCAL_OFFER | https://www.ximalaya.com/gatekeeper/member-agreement-html/ts-1626084264680 |
| 107 | audiobook.jp | JP | 0 | 45 | LOCAL_OFFER | https://audiobook.jp/ |
| 108 | d Magazine | JP | 0 | 45 | LOCAL_OFFER | https://dmagazine.docomo.ne.jp/ |
| 109 | 88VIP | CN | 0 | 45 | CORPORATE_SERVICE_LEAD | https://www.alibabagroup.com/en-US/document-1491587545585156096 |
| 110 | DashPass | US CA AU NZ | 0 | 42 | REGIONAL_LIST | https://about.doordash.com/en-ca/products/dashpass |
| 111 | Deliveroo Plus | GB | 0 | 45 | LOCAL_OFFER | https://deliveroo.co.uk/plus |
| 112 | HelloFresh | US | 0 | 45 | RETAINED_MARKET_LEAD | https://www.hellofresh.com/eat/cooking-subscription-box |
| 113 | JD Plus | CN | 0 | 45 | LOCAL_OFFER | https://wqs.jd.com/my/vipplus_introduce.shtml |
| 114 | Meli+ | BR MX | 0 | 44 | REGIONAL_OVERVIEW | https://news.mercadolibre.com/en/node/262 |
| 115 | Uber One | AE AU CA GB JP KR QA US | 0 | 38 | RETAINED_MARKET_LEAD | https://help.uber.com/riders/article/how-can-i-use-my-uber-one-membership-in-a-new-country?nodeId=949c41bf-4494-4061-b501-c00d7c8ca787 |
| 116 | Walmart+ | US | 45 | 0 | US_ONLY | https://www.walmart.com/help/article/changes-to-the-country-region-setting-in-your-account/b9927010de444cacbab10c708d9e8941 |
| 117 | Wolt+ | DE | 0 | 45 | LOCAL_OFFER | https://explore.wolt.com/de/deu/wolt-plus |
| 118 | Alterlife | GR | 0 | 45 | LOCAL_OFFER | https://alterlife.gr/en/clubs/ |
| 119 | Anytime Fitness | AU IN JP PH SG | 0 | 41 | RETAINED_MARKET_LEAD | https://www.anytimefitness.com/membership |
| 120 | Basic-Fit | BE ES FR NL | 0 | 42 | RETAINED_MARKET_LEAD | https://www.basic-fit.com/en-fr/prices/price |
| 121 | Bodytech | CO | 0 | 45 | LOCAL_OFFER | https://bodytech.co/ |
| 122 | California Fitness & Yoga | VN | 0 | 45 | LOCAL_OFFER | https://fit.cali.vn/ |
| 123 | Celebrity Fitness | MY | 0 | 45 | LOCAL_OFFER | https://www.celebrityfitness.com/my/en/membership |
| 124 | CityFitness | NZ | 0 | 45 | LOCAL_OFFER | https://www.cityfitness.co.nz/memberships-select |
| 125 | Clever Fit | CH | 0 | 45 | LOCAL_OFFER | https://shop.clever-fit.ch/membership/ |
| 126 | Cult.fit | IN | 0 | 45 | LOCAL_OFFER | https://www.cult.fit/ |
| 127 | David Lloyd | GB IE | 0 | 44 | RETAINED_MARKET_LEAD | https://www.davidlloyd.co.uk/memberships/ |
| 128 | EVO | NO | 0 | 45 | LOCAL_OFFER | https://evofitness.no/velg-medlemskap/ |
| 129 | FITPASS | IN | 0 | 45 | LOCAL_OFFER | https://fitpass.co.in/membership |
| 130 | FLYEfit | IE | 0 | 45 | LOCAL_OFFER | https://www.flyefit.ie/help-centre/ |
| 131 | FitActive | IT | 0 | 45 | LOCAL_OFFER | https://fitactive.it/Home/Iscriviti |
| 132 | FitX | DE | 0 | 45 | LOCAL_OFFER | https://www.fitx.de/mitgliedschaft |
| 133 | Fitinn | AT | 0 | 45 | LOCAL_OFFER | https://fitinn.at/mitgliedschaft/ |
| 134 | Fitness First | AU | 0 | 45 | RETAINED_MARKET_LEAD | https://www.fitnessfirst.com/ |
| 135 | Fitness Hut | — | 0 | 46 | UNREVIEWED | unresolved |
| 136 | Fitness Park | FR | 0 | 45 | LOCAL_OFFER | https://www.fitnesspark.fr/nos-offres/ |
| 137 | Fitness Time | SA | 0 | 45 | LOCAL_OFFER | https://www.fitnesstime.com.sa/en |
| 138 | Fitness24Seven | SE FI | 0 | 44 | RETAINED_MARKET_LEAD | https://se.fitness24seven.com/ |
| 139 | FitnessX | DK | 0 | 45 | LOCAL_OFFER | https://fitnessx.dk/ |
| 140 | Fresh Fitness | NO | 0 | 45 | LOCAL_OFFER | https://www.freshfitness.no/medlemskap-og-priser/ |
| 141 | GoodLife Fitness | CA | 0 | 45 | LOCAL_OFFER | https://www.goodlifefitness.com/membership.html |
| 142 | GymNation | AE SA | 0 | 44 | RETAINED_MARKET_LEAD | https://gymnation.com/en-ae/gymsnearme/gymmembership/ |
| 143 | Holmes Place | — | 0 | 46 | PROVIDER_HOME_LEAD | https://www.holmesplace.com/ |
| 144 | JIMS | BE | 0 | 45 | LOCAL_OFFER | https://www.jims.be/nl/tarieven |
| 145 | Jetts | TH | 0 | 45 | LOCAL_OFFER | https://www.jetts.co.th/en/club-en/ |
| 146 | McFIT | AT DE | 0 | 44 | RETAINED_MARKET_LEAD | https://www.mcfit.com/de/mitgliedschaft |
| 147 | Neoness | FR | 0 | 45 | LOCAL_OFFER | https://www.neoness.fr/abonnements |
| 148 | Nordic Wellness | SE | 0 | 45 | LOCAL_OFFER | https://nordicwellness.se/priser/medlemskap |
| 149 | Nuffield Health | GB | 0 | 45 | LOCAL_OFFER | https://www.nuffieldhealth.com/gyms/membership |
| 150 | PURE Fitness | HK | 0 | 45 | LOCAL_OFFER | https://www.pure-360.com.hk/en/clubs/ |
| 151 | Planet Fitness | MX US | 0 | 44 | RETAINED_MARKET_LEAD | https://www.planetfitness.com/ |
| 152 | PureGym | DK GB | 0 | 44 | RETAINED_MARKET_LEAD | https://www.puregym.dk/priser |
| 153 | SATS | SE DK FI NO | 0 | 42 | RETAINED_MARKET_LEAD | https://www.sats.no/ |
| 154 | Smart Fit | CL CO MX BR | 0 | 42 | RETAINED_MARKET_LEAD | https://www.smartfit.com.br/planos |
| 155 | Solinca | PT | 0 | 45 | PROVIDER_HOME_LEAD | https://www.solinca.pt/ |
| 156 | SpoAny | KR | 0 | 45 | LOCAL_OFFER | https://www.spoany.co.kr/ |
| 157 | SportCity | NL | 0 | 45 | LOCAL_OFFER | https://www.sportcity.nl/ |
| 158 | The Gym Group | GB | 0 | 45 | LOCAL_OFFER | https://www.thegymgroup.com/gym-memberships/saver-memberships |
| 159 | TrainMore | NL | 0 | 45 | LOCAL_OFFER | https://trainmore.com/nl-NL/memberships/ |
| 160 | Urban Sports Club | DE | 0 | 45 | LOCAL_OFFER | https://urbansportsclub.com/en/prices |
| 161 | Virgin Active | IT | 0 | 45 | LOCAL_OFFER | https://helpcenter.virginactive.it/hc/en-150/articles/12832890229905-Can-I-join-a-Virgin-Active-Club-abroad-with-my-subscription |
| 162 | World Class Romania | RO | 0 | 45 | LOCAL_OFFER | https://www.worldclass.ro/abonamente/ |
| 163 | chocoZAP | JP | 0 | 45 | LOCAL_OFFER | https://chocozap.jp/ |
| 164 | Babbel | DE ES GB IT US FR | 0 | 40 | RETAINED_MARKET_LEAD | https://www.babbel.com/ |
| 165 | Blinkist | GB US DE | 0 | 43 | RETAINED_MARKET_LEAD | https://www.blinkist.com/en/pricing |
| 166 | Bumble | AU CA DE FR GB IN IT NO BR DK ES SE US | 0 | 33 | RETAINED_MARKET_LEAD | https://bumble.com/ |
| 167 | Busuu | US GB DE ES FR | 0 | 41 | RETAINED_MARKET_LEAD | https://www.busuu.com/en/premium-plans |
| 168 | Duolingo | — | 0 | 46 | PROVIDER_HOME_LEAD | https://www.duolingo.com/ |
| 169 | Flo | BR GB NO US AU CA DE ES FR SE | 0 | 36 | RETAINED_MARKET_LEAD | https://flo.health/flo-premium |
| 170 | Freeletics | DE FR GB US | 0 | 42 | RETAINED_MARKET_LEAD | https://help.freeletics.com/hc/en-us/articles/360020109819-Purchase-a-Coach-subscription |
| 171 | Grindr | AU BR CA ES US DE FR GB | 0 | 38 | RETAINED_MARKET_LEAD | https://www.grindr.com/ |
| 172 | Hinge | AU IT SE CA DE DK ES FR GB NO US | 0 | 35 | RETAINED_MARKET_LEAD | https://hinge.co/terms |
| 173 | Komoot | AT CH DE FR GB | 0 | 41 | RETAINED_MARKET_LEAD | https://www.komoot.com/ |
| 174 | Lifesum | SE DE | 0 | 44 | RETAINED_MARKET_LEAD | https://help.lifesum.com/en/article/lifesum-premium-subscription-renewal-details-1fmofst/ |
| 175 | MasterClass | AU US CA | 0 | 43 | RETAINED_MARKET_LEAD | https://www.masterclass.com/ |
| 176 | MyFitnessPal | — | 0 | 46 | PROVIDER_HOME_LEAD | https://support.myfitnesspal.com/hc/en-us/articles/360032625771-How-to-upgrade-to-MyFitnessPal-Premium |
| 177 | Omiai | JP | 0 | 45 | LOCAL_OFFER | https://www.omiai-iideai.com/ |
| 178 | Pairs | JP | 0 | 45 | LOCAL_OFFER | https://pairs.lv/ |
| 179 | Rosetta Stone | DE FR GB US | 0 | 42 | RETAINED_MARKET_LEAD | https://www.rosettastone.com/buy |
| 180 | Runna | AU CA GB US | 0 | 42 | RETAINED_MARKET_LEAD | https://www.runna.com/en-gb |
| 181 | Skillshare | AU CA GB US | 0 | 42 | RETAINED_MARKET_LEAD | https://www.skillshare.com/en/pricing |
| 182 | Speak | KR US JP | 0 | 43 | RETAINED_MARKET_LEAD | https://usespeak.com/tos |
| 183 | SpeakBUDDY | JP | 0 | 45 | LOCAL_OFFER | https://app.speakbuddy.me/ |
| 184 | Tapple | JP | 0 | 45 | LOCAL_OFFER | https://tapple.me/about/pricing |
| 185 | Tinder | AU BR CA DE DK ES FR GB IN IT JP KR MX NO SE US | 0 | 30 | RETAINED_MARKET_LEAD | https://tinder.com/feature/subscription-tiers |
| 186 | Yazio | DE ES FR IT | 0 | 42 | RETAINED_MARKET_LEAD | https://help.yazio.com/hc/en-us/articles/208127729-How-can-I-purchase-Yazio-Pro |
| 187 | abceed | JP | 0 | 45 | LOCAL_OFFER | https://www.abceed.com/ |
| 188 | with | JP | 0 | 45 | LOCAL_OFFER | https://with.is/welcome |
| 189 | 1Password | AU CA DE FR GB JP NO US | 0 | 38 | RETAINED_MARKET_LEAD | https://1password.com/pricing/personal |
| 190 | Backblaze Personal Backup | AU CA US GB | 0 | 42 | RETAINED_MARKET_LEAD | https://www.backblaze.com/cloud-backup/pricing |
| 191 | CyberGhost | US DE FR GB RO | 0 | 41 | RETAINED_MARKET_LEAD | https://www.cyberghostvpn.com/ |
| 192 | Evernote | AU CA DE FR GB JP US | 0 | 39 | RETAINED_MARKET_LEAD | https://evernote.com/compare-plans |
| 193 | ExpressVPN | AU DE FR GB JP SG US CA | 0 | 38 | RETAINED_MARKET_LEAD | https://www.expressvpn.com/ |
| 194 | Keeper | — | 0 | 46 | PROVIDER_HOME_LEAD | https://www.keepersecurity.com/pricing/personal-and-family.html |
| 195 | MEGA | — | 0 | 46 | UNREVIEWED | unresolved |
| 196 | Mullvad | DE GB SE US | 0 | 42 | RETAINED_MARKET_LEAD | https://mullvad.net/en/pricing |
| 197 | NordPass | DE GB NO US | 0 | 42 | RETAINED_MARKET_LEAD | https://nordpass.com/plans/ |
| 198 | NordVPN | CA AU SE SG DE FR | 0 | 40 | RETAINED_MARKET_LEAD | https://nordvpn.com/da/pricing/ |
| 199 | Norton VPN | AU CA GB US | 0 | 42 | RETAINED_MARKET_LEAD | https://us.norton.com/products/norton-vpn |
| 200 | Notion | AU CA DE FR GB JP KR US | 0 | 38 | RETAINED_MARKET_LEAD | https://www.notion.com/pricing |

The `sourceUrl` column is a review or discovery lead. It does not grant V3 provider authority. Club access in another country, delivery coverage, travel benefits, App Store visibility and a localized webpage are not automatically equivalent to a locally purchasable subscription. Historical Verified and Suggested prices are unchanged.
