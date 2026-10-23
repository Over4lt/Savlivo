// Reviewed first-party availability leads for the first 30 canonical services.
// These are display and discovery hints. Only a fresh, hash-bound provider page
// accepted by market-availability.mjs may remove a research target.
import {countryCurrencyData} from '../../../../packages/contracts/src/markets.ts';

const allMarkets=countryCurrencyData.map(([code])=>code);
const codes=value=>value?value.split(' '):[];
const entries=[
 ['netflix','https://help.netflix.com/en/node/14164','EXPLICIT_NEGATIVE',allMarkets.filter(code=>code!=='CN').join(' '), 'CN'],
 ['disney-plus','https://help.disneyplus.com/article/disneyplus-location-availability','REGIONAL_OVERVIEW','', ''],
 ['max','https://help.max.com/sr-en/Answer/Detail/000002518','HISTORICAL_PARTIAL','US NO SE DK ES FR PT NL BE FI CZ PL RO TR AU MY SG HK TW TH PH BR MX CL CO ID', ''],
 ['prime-video','https://www.primevideo.com/help?nodeId=GD5REBNJD74BURF6','REGIONAL_OVERVIEW','', ''],
 ['amazon-prime','https://www.amazon.com/amazonprime','NO_COUNTRY_LIST','', ''],
 ['apple-tv-plus','https://support.apple.com/en-us/118205','PER_SERVICE_COUNTRY_PAGE','', ''],
 ['youtube-premium','https://support.google.com/youtube/answer/6307365?hl=en','COMPLETE_SERVICE_LIST',allMarkets.filter(code=>code!=='CN').join(' '), 'CN'],
 ['hulu','https://www.hulu.com/subscriber_agreement','US_ONLY','US',allMarkets.filter(code=>code!=='US').join(' ')],
 ['paramount-plus','https://support.paramountplus.com/s/article/PI-Can-you-tell-me-more-about-the-Paramount-subscription-plan','PLAN_SPECIFIC_LIST','AU CA DE CH AT GB IE FR IT BR CL CO MX', ''],
 ['peacock','https://www.peacocktv.com/terms','US_ONLY','US',allMarkets.filter(code=>code!=='US').join(' ')],
 ['crunchyroll','https://help.crunchyroll.com/article/why-can-t-i-watch-certain-shows-in-my-region','NO_COUNTRY_LIST','', ''],
 ['spotify','https://support.spotify.com/cg-en/article/where-spotify-is-available/','COMPLETE_SERVICE_LIST',allMarkets.filter(code=>code!=='CN').join(' '), 'CN'],
 ['apple-music','https://support.apple.com/en-us/118205','PER_SERVICE_COUNTRY_PAGE','', ''],
 ['amazon-music-unlimited','https://digprjsurvey.amazon.com/csad/help/node/201380010','NO_COUNTRY_LIST','', ''],
 ['tidal','https://support.tidal.com/hc/en-us/articles/202453191-Where-Tidal-is-Available','COMPLETE_SERVICE_LIST','US NO SE DK DE ES FR IT PT NL BE AT IE FI GB AU NZ CH PL BR CZ MY SG HK AE TH CA MX IL ZA GR RO CL CO', 'CN IN TW PH JP SA KR ID TR QA EG VN'],
 ['audible','https://help.audible.com/s/article/change-your-marketplace','MARKETPLACE_LIST','US MX CA GB TR ZA AU NZ SG FR CH IE DE AT NL BE PL SE JP IT IN ES BR', ''],
 ['xbox-game-pass','https://www.xbox.com/regions','PLAN_SPECIFIC_LIST','', ''],
 ['playstation-plus','https://www.playstation.com/country-selector/index.html','PLATFORM_LIST','', ''],
 ['ea-play','https://help.ea.com/en/articles/ea-account/join-ea-play-on-playstation/','PLATFORM_LIST','US NO SE DK DE ES FR IT PT NL BE AT IE FI GB AU NZ CH PL BR CZ MY IN SG HK TW AE TH JP CA SA KR MX ID TR ZA IL QA RO GR CL CO', ''],
 ['ubisoft-plus','https://www.ubisoft.com/en-gb/help/article/information-about-ubisoft/000061168','NO_COUNTRY_LIST','', ''],
 ['geforce-now','https://www.nvidia.com/en-us/geforce-now/faq/','REGIONAL_OVERVIEW','', ''],
 ['chatgpt','https://help.openai.com/en/articles/7947663-chatgpt-supported-countries','COMPLETE_SERVICE_LIST',allMarkets.filter(code=>!['CN','HK'].includes(code)).join(' '), 'CN HK'],
 ['claude','https://support.claude.com/en/articles/8461763-where-can-i-access-claude','COMPLETE_SERVICE_LIST',allMarkets.filter(code=>!['CN','HK'].includes(code)).join(' '), 'CN HK'],
 ['microsoft-365','https://www.microsoft.com/en-us/microsoft-365/choose-valid-billing-market','BILLING_CHANNEL_LIST','', ''],
 ['adobe-creative-cloud','https://helpx.adobe.com/creative-cloud/apps/get-started/faq.html','PLAN_SPECIFIC_LIST','', ''],
 ['canva','https://www.canva.com/help/payment-options/','PAYMENT_METHOD_LIST','', ''],
 ['dropbox','https://help.dropbox.com/security/restricted-access-region-country','EXPLICIT_NEGATIVE','', ''],
 ['google-one','https://support.google.com/googleone/answer/9080668?hl=en','COMPLETE_SERVICE_LIST',allMarkets.filter(code=>code!=='CN').join(' '), 'CN'],
 ['icloud-plus','https://support.apple.com/en-us/108047','PER_SERVICE_COUNTRY_PAGE','', ''],
 ['tencent-video','https://v.qq.com/','NO_COUNTRY_LIST','', '']
];

const ids=new Set(),known=new Set(allMarkets);
export const firstThirtyServiceMarketOverview=Object.freeze(entries.map(([serviceId,sourceUrl,sourceScope,available,unavailable],index)=>{
 if(ids.has(serviceId))throw Error('DUPLICATE_SERVICE_MARKET_OVERVIEW');ids.add(serviceId);
 const availableMarkets=codes(available),reportedUnavailableMarkets=codes(unavailable);
 if([...availableMarkets,...reportedUnavailableMarkets].some(code=>!known.has(code))||
    availableMarkets.some(code=>reportedUnavailableMarkets.includes(code)))throw Error('INVALID_SERVICE_MARKET_OVERVIEW');
 return Object.freeze({order:index+1,serviceId,sourceUrl,sourceScope,reviewedAt:'2026-10-23',availableMarkets:Object.freeze(availableMarkets),
  reportedUnavailableMarkets:Object.freeze(reportedUnavailableMarkets),unknownMarkets:Object.freeze(allMarkets.filter(code=>!availableMarkets.includes(code)&&!reportedUnavailableMarkets.includes(code)))});
}));
const byId=new Map(firstThirtyServiceMarketOverview.map(row=>[row.serviceId,row]));
export const serviceMarketOverviewFor=serviceId=>byId.get(serviceId)??null;
