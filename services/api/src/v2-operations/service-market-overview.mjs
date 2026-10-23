// Conservative first-party availability leads for the canonical service universe.
// These are display and discovery hints. Only a fresh, hash-bound provider page
// accepted by market-availability.mjs may remove a research target.
import {countryCurrencyData} from '../../../../packages/contracts/src/markets.ts';
import {nextHundredEntries} from './service-market-overview-next-hundred.mjs';
import {thirdHundredEntries} from './service-market-overview-third-hundred.mjs';
import {remainingServiceMarketEntries} from './service-market-overview-remaining.mjs';

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
 ['tencent-video','https://www.tencent.com/products/tencent-video/','CN_FOCUSED','CN', ''],
 ['iqiyi','https://www.iq.com/aboutus','REGIONAL_OVERVIEW','', ''],
 ['mango-tv','https://www.mgtv.com/','NO_COUNTRY_LIST','', ''],
 ['youku','https://www.youku.tv/appdownload','REGIONAL_OVERVIEW','', ''],
 ['bilibili','https://www.bilibili.com/','NO_COUNTRY_LIST','', ''],
 ['qq-music','https://y.qq.com/','NO_COUNTRY_LIST','', ''],
 ['netease-cloud-music','https://music.163.com/','NO_COUNTRY_LIST','', ''],
 ['kugou-music','https://www.kugou.com/','NO_COUNTRY_LIST','', ''],
 ['baidu-netdisk','https://pan.baidu.com/','NO_COUNTRY_LIST','', ''],
 ['wps','https://www.wps.com/buy/','NO_COUNTRY_LIST','', ''],
 ['strava','https://support.strava.com/','RESTRICTIONS_NOT_EXHAUSTIVE','', ''],
 ['calm','https://support.calm.com/hc/en-us/articles/360008240934-How-to-Check-Calm-Premium-Subscription-Pricing','NO_COUNTRY_LIST','', ''],
 ['headspace','https://help.headspace.com/hc/en-us/articles/360008780334-How-do-I-receive-the-Student-rate','PLAN_SPECIFIC_LIST','US AU CA FR DE GB', ''],
 ['viaplay','https://help.viaplay.com/nl/package-info/','PLAN_SPECIFIC_LIST','NL', ''],
 ['storytel','https://support.storytel.com/hc/en-sg/articles/4864347023132-What-is-Storytel','REGIONAL_OVERVIEW','', ''],
 ['rtl-plus','https://plus.rtl.de/agb','PLAN_SPECIFIC_LIST','DE', ''],
 ['videoland','https://v2.videoland.com/algemene-voorwaarden','NL_FOCUSED','NL', ''],
 ['nintendo-switch-online','https://en-americas-support.nintendo.com/app/answers/detail/a_id/41953/','REGIONAL_LIST','US CA BR CL CO MX', ''],
 ['osn-plus','https://support.osnplus.com/hc/en-us/articles/6869696148634-Where-is-OSN-available','REGIONAL_OVERVIEW','AE SA QA EG', ''],
 ['apple-arcade','https://support.apple.com/en-us/118205','PER_SERVICE_COUNTRY_PAGE','', ''],
 ['u-next','https://help.unext.jp/guide/detail/not-use-overseas','JP_ONLY','JP',allMarkets.filter(code=>code!=='JP').join(' ')],
 ['hulu-japan','https://help.hulu.jp/hc/en-us/articles/360044168254-Can-I-access-Hulu-Japan-from-outside-of-Japan','JP_ONLY','JP',allMarkets.filter(code=>code!=='JP').join(' ')],
 ['dmm-tv','https://support.dmm.com/dmm-tv/article/47591','JP_ONLY','JP',allMarkets.filter(code=>code!=='JP').join(' ')],
 ['tving','https://www.tving.com/live/C52299','KR_ONLY','KR',allMarkets.filter(code=>code!=='KR').join(' ')],
 ['melon','https://info.melon.com/terms/web/terms1_2_9.html','RESTRICTIONS_NOT_EXHAUSTIVE','', ''],
 ['crave','https://plus.crave.ca/en/faq/troubleshooting/can-i-use-crave-when-travelling-in-canada-and-the-us/','CA_ONLY','CA',allMarkets.filter(code=>code!=='CA').join(' ')],
 ['tsn','https://www.tsn.ca/tsn-front-row/tsn-announces-subscription-options-for-tsn-delivering-marquee-live-sports-1.1994040','CA_FOCUSED','CA', ''],
 ['sportsnet-plus','https://support.sportsnetplus.ca/hc/en-gb/articles/46382041630228-Can-I-access-Sportsnet-internationally','CA_ONLY','CA',allMarkets.filter(code=>code!=='CA').join(' ')],
 ['siriusxm-canada','https://www.siriusxm.ca/terms-and-conditions/','CA_ONLY','CA',allMarkets.filter(code=>code!=='CA').join(' ')],
 ['shahid','https://shahid.mbc.net/en/hub/promo/SHAHID_VIP','REGIONAL_OVERVIEW','', ''],
 ['anghami','https://support.anghami.com/hc/en-us/articles/9175760067098-Subscribe-to-Anghami-Using-Your-Card','REGIONAL_OVERVIEW','', ''],
 ['stc-tv','https://dcb.stctv.com/stctv/','LOCAL_OFFER','SA',''],
 ['tod','https://support.tod.tv/hc/en-us/articles/10483880092060-Which-countries-is-TOD-available-in','REGIONAL_OVERVIEW','QA',''],
 ['vix','https://ayuda.vix.com/hc/en-us/articles/4863337920141-In-which-countries-is-ViX-available','COMPLETE_SERVICE_LIST','MX US CL CO',allMarkets.filter(code=>!['MX','US','CL','CO'].includes(code)).join(' ')],
 ['vidio','https://support.vidio.com/support/solutions/articles/43000722311-can-i-use-my-indonesia-s-vidio-subscription-in-malaysia-or-other-countries-','REGIONAL_OVERVIEW','ID MY',''],
 ['vision-plus','https://packages.visionplus.id/premium?subscribe=monthly','LOCAL_OFFER','ID',''],
 ['gain','https://destek.gain.tv/guncel-ucretler.html','LOCAL_OFFER','TR',''],
 ['exxen','https://plan.exxen.com/tr/','LOCAL_OFFER','TR',''],
 ['dstv-stream','https://www.dstv.com/en-za/','LOCAL_OFFER','ZA',''],
 ['sting-plus','https://www.stingtv.co.il/choose-package/','LOCAL_OFFER','IL',''],
 ['yes-plus','https://www.yes.co.il/general/terms-application-yes/','LOCAL_OFFER','IL',''],
 ['watch-it','https://support.watchit.com/hc/en-us/articles/5118489729437-How-to-subscribe-to-WATCH-IT-using-your-Credit-Debit-Cards','REGIONAL_OVERVIEW','EG',''],
 ['fpt-play','https://fptplay.vn/','LOCAL_OFFER','VN',''],
 ['voyo-ro','https://voyo.protv.ro/faq/8-cum-sa-incepi-cu-voyo/11-pot-folosi-voyo-din-strainatate-activare-portabilitate','LOCAL_OFFER','RO',''],
 ['antenaplay','https://antenaplay.ro/ajutor-clienti/clienti-din-afara-romaniei','REGIONAL_OVERVIEW','RO',''],
 ['magenta-tv-gr','https://www.magentatv.gr/','LOCAL_OFFER','GR',''],
 ['cinobo','https://cinobo.com/en/help/about-cinobo/can-i-watch-cinobo-if-i-m-not-in-greece','LOCAL_OFFER','GR',''],
 ['zapping','https://brand.zapping.com/','COMPLETE_SERVICE_LIST','CL BR',allMarkets.filter(code=>!['CL','BR'].includes(code)).join(' ')],
 ['win-play','https://www.winplay.co/','LOCAL_OFFER','CO',''],
 ['aftenposten','https://www.aftenposten.no/','LOCAL_OFFER','NO',''],
 ['berlingske','https://www.berlingske.dk/','LOCAL_OFFER','DK',''],
 ['bookbeat','https://www.bookbeat.com/market','MARKET_SELECTOR_LIST','BE CZ DK DE ES FR IE IT NL NO PL PT RO CH FI SE GB AT GR',''],
 ['bugs','https://music.bugs.co.kr/','LOCAL_OFFER','KR',''],
 ['caixin','https://corp.caixin.com/m/caixinhelp/','REGIONAL_OVERVIEW','CN',''],
 ['dn-norway','https://www.dn.no/','LOCAL_OFFER','NO',''],
 ['dagens-nyheter','https://www.dn.se/','LOCAL_OFFER','SE',''],
 ['empik-go','https://www.empik.com/go','LOCAL_OFFER','PL',''],
 ['flo-music-kr','https://www.music-flo.com/','LOCAL_OFFER','KR',''],
 ['fabel','https://fabel.no/','LOCAL_OFFER','NO',''],
 ['genie-music','https://www.genie.co.kr/','LOCAL_OFFER','KR',''],
 ['helsingin-sanomat','https://www.hs.fi/','LOCAL_OFFER','FI',''],
 ['kkbox','https://www.kkbox.com/tw/tc/','LOCAL_OFFER','TW',''],
 ['kindle-unlimited','https://digprjsurvey.amazon.com/csad/help/node/TryGuDEBL4T8YoFxJ1?theme=light','COMPLETE_SERVICE_LIST','US CL HK IL PH ZA KR TW AU NZ CA JP BR MX GB IE DE AT CH ES FR BE IN IT',allMarkets.filter(code=>!['US','CL','HK','IL','PH','ZA','KR','TW','AU','NZ','CA','JP','BR','MX','GB','IE','DE','AT','CH','ES','FR','BE','IN','IT'].includes(code)).join(' ')],
 ['kobo-plus','https://help.kobo.com/hc/en-us/articles/360018976153-Kobo-Plus-Common-questions','COMPLETE_SERVICE_LIST','CA AU BE DK FI FR IT IN IE MY NL NZ NO PT ZA SG ES SE CH TW HK US GB MX CL CO PL CZ RO GR PH',allMarkets.filter(code=>!['CA','AU','BE','DK','FI','FR','IT','IN','IE','MY','NL','NZ','NO','PT','ZA','SG','ES','SE','CH','TW','HK','US','GB','MX','CL','CO','PL','CZ','RO','GR','PH'].includes(code)).join(' ')],
 ['legimi','https://www.legimi.pl/relacje-inwestorskie/nasze-serwisy/','REGIONAL_OVERVIEW','PL DE',''],
 ['mofibo','https://mofibo.com/dk/subscriptions','LOCAL_OFFER','DK',''],
 ['nextory','https://nextory.com/','MARKET_SELECTOR_LIST','FR BE NL DE SE NO DK CH FI AT ES',''],
 ['podimo','https://support.podimo.com/hc/da-dk/articles/34999188304145-Hvad-er-Podimo-og-i-hvilke-lande-er-det-tilg%C3%A6ngeligt','COMPLETE_SERVICE_LIST','DK DE NL NO FI ES MX',allMarkets.filter(code=>!['DK','DE','NL','NO','FI','ES','MX'].includes(code)).join(' ')],
 ['podme','https://podme.com/no/abonnementer/','LOCAL_OFFER','NO SE',''],
 ['politiken','https://politiken.dk/','LOCAL_OFFER','DK',''],
 ['pressreader','https://www.pressreader.com/','NO_COUNTRY_LIST','','']
];

const ids=new Set(),known=new Set(allMarkets);
export const firstHundredServiceMarketOverview=Object.freeze(entries.map(([serviceId,sourceUrl,sourceScope,available,unavailable],index)=>{
 if(ids.has(serviceId))throw Error('DUPLICATE_SERVICE_MARKET_OVERVIEW');ids.add(serviceId);
 const availableMarkets=codes(available),reportedUnavailableMarkets=codes(unavailable);
 if([...availableMarkets,...reportedUnavailableMarkets].some(code=>!known.has(code))||
    availableMarkets.some(code=>reportedUnavailableMarkets.includes(code)))throw Error('INVALID_SERVICE_MARKET_OVERVIEW');
 return Object.freeze({order:index+1,serviceId,sourceUrl,sourceScope,reviewedAt:'2026-10-23',availableMarkets:Object.freeze(availableMarkets),
  reportedUnavailableMarkets:Object.freeze(reportedUnavailableMarkets),unknownMarkets:Object.freeze(allMarkets.filter(code=>!availableMarkets.includes(code)&&!reportedUnavailableMarkets.includes(code)))});
}));
export const firstSixtyServiceMarketOverview=Object.freeze(firstHundredServiceMarketOverview.slice(0,60));
export const firstThirtyServiceMarketOverview=Object.freeze(firstHundredServiceMarketOverview.slice(0,30));
const nextIds=new Set(ids);
const validHttpsUrl=value=>{
 if(typeof value!=='string')return false;
 try{return new URL(value).protocol==='https:';}catch{return false;}
};
export const nextHundredServiceMarketOverview=Object.freeze(nextHundredEntries.map(([serviceId,sourceUrl,sourceScope,available,unavailable],index)=>{
 if(nextIds.has(serviceId))throw Error('DUPLICATE_SERVICE_MARKET_OVERVIEW');nextIds.add(serviceId);
 const availableMarkets=codes(available),reportedUnavailableMarkets=unavailable==='ALL_EXCEPT_US'?allMarkets.filter(code=>code!=='US'):codes(unavailable);
 if((sourceUrl!==null&&!validHttpsUrl(sourceUrl))||
    (!sourceUrl&&(sourceScope!=='UNREVIEWED'||availableMarkets.length))||
    [...availableMarkets,...reportedUnavailableMarkets].some(code=>!known.has(code))||
    availableMarkets.some(code=>reportedUnavailableMarkets.includes(code)))throw Error('INVALID_SERVICE_MARKET_OVERVIEW');
 return Object.freeze({order:index+101,serviceId,sourceUrl,sourceScope,reviewedAt:'2026-10-23',availableMarkets:Object.freeze(availableMarkets),
  reportedUnavailableMarkets:Object.freeze(reportedUnavailableMarkets),unknownMarkets:Object.freeze(allMarkets.filter(code=>!availableMarkets.includes(code)&&!reportedUnavailableMarkets.includes(code)))});
}));
export const firstTwoHundredServiceMarketOverview=Object.freeze([...firstHundredServiceMarketOverview,...nextHundredServiceMarketOverview]);
const thirdIds=new Set(nextIds);
export const thirdHundredServiceMarketOverview=Object.freeze(thirdHundredEntries.map(([serviceId,sourceUrl,sourceScope,available,unavailable],index)=>{
 if(thirdIds.has(serviceId))throw Error('DUPLICATE_SERVICE_MARKET_OVERVIEW');thirdIds.add(serviceId);
 const availableMarkets=codes(available),reportedUnavailableMarkets=codes(unavailable);
 if((sourceUrl!==null&&!validHttpsUrl(sourceUrl))||
    (!sourceUrl&&(sourceScope!=='UNREVIEWED'||availableMarkets.length))||
    [...availableMarkets,...reportedUnavailableMarkets].some(code=>!known.has(code))||
    availableMarkets.some(code=>reportedUnavailableMarkets.includes(code)))throw Error('INVALID_SERVICE_MARKET_OVERVIEW');
 return Object.freeze({order:index+201,serviceId,sourceUrl,sourceScope,reviewedAt:'2026-10-23',availableMarkets:Object.freeze(availableMarkets),
  reportedUnavailableMarkets:Object.freeze(reportedUnavailableMarkets),unknownMarkets:Object.freeze(allMarkets.filter(code=>!availableMarkets.includes(code)&&!reportedUnavailableMarkets.includes(code)))});
}));
export const firstThreeHundredServiceMarketOverview=Object.freeze([...firstTwoHundredServiceMarketOverview,...thirdHundredServiceMarketOverview]);
const remainingIds=new Set(thirdIds);
export const remainingServiceMarketOverview=Object.freeze(remainingServiceMarketEntries.map(([serviceId,sourceUrl,sourceScope,available,unavailable],index)=>{
 if(remainingIds.has(serviceId))throw Error('DUPLICATE_SERVICE_MARKET_OVERVIEW');remainingIds.add(serviceId);
 const availableMarkets=codes(available),reportedUnavailableMarkets=codes(unavailable);
 if((sourceUrl!==null&&!validHttpsUrl(sourceUrl))||
    (!sourceUrl&&(sourceScope!=='UNREVIEWED'||availableMarkets.length))||
    [...availableMarkets,...reportedUnavailableMarkets].some(code=>!known.has(code))||
    availableMarkets.some(code=>reportedUnavailableMarkets.includes(code)))throw Error('INVALID_SERVICE_MARKET_OVERVIEW');
 return Object.freeze({order:index+301,serviceId,sourceUrl,sourceScope,reviewedAt:'2026-10-23',availableMarkets:Object.freeze(availableMarkets),
  reportedUnavailableMarkets:Object.freeze(reportedUnavailableMarkets),unknownMarkets:Object.freeze(allMarkets.filter(code=>!availableMarkets.includes(code)&&!reportedUnavailableMarkets.includes(code)))});
}));
export const canonicalServiceMarketOverview=Object.freeze([...firstThreeHundredServiceMarketOverview,...remainingServiceMarketOverview]);
const byId=new Map(canonicalServiceMarketOverview.map(row=>[row.serviceId,row]));
export const serviceMarketOverviewFor=serviceId=>byId.get(serviceId)??null;
