// Internal provenance only: a geographic diagnostic never asserts a price.
import assert from 'node:assert/strict';
import {validLocalizedPriceAccess,localizedAccessVersion} from './price-localized-access.mjs';
import {createHash} from 'node:crypto';
import {validatePriceScope,priceScopeKey} from './price-scope.mjs';
export const priceGeoVersion='SCOPED_PRICE_GEO_V1';
export const bodyHash=text=>createHash('sha256').update(text).digest('hex');
export function validPriceGeo(gap,source,scope){
 if(gap.priceGeography?.version===localizedAccessVersion)return validLocalizedPriceAccess(gap,source,scope);
 try{
  const d=gap.priceGeography;validatePriceScope(scope);
  assert(gap.fact==='prices'&&gap.requiresTargetGeo===true&&d.version===priceGeoVersion);
  assert(priceScopeKey(d.scope)===priceScopeKey(scope));
  assert(d.requestedMarket===scope.countryCode&&/^[A-Z]{2}$/.test(d.observedMarket)&&d.observedMarket!==d.requestedMarket);
  assert(d.category==='OFFICIAL_PRICE_MARKET_MISMATCH'&&d.parserVersion==='GOOGLE_ONE_FEED_V1');
  assert(d.sourceUrl===source.url&&d.acquisitionId&&source.priceAcquisition?.id===d.acquisitionId);
  assert(source.priceAcquisition.complete===true&&source.priceAcquisition.stage==='LOCALIZED_URL');
  assert(priceScopeKey(source.priceAcquisition.scope)===priceScopeKey(scope));
  assert(source.rawSource?.text&&bodyHash(source.rawSource.text)===d.bodySha256);
  assert(d.fragment===source.rawSource.text&&d.fragment.length<=1000000);
  const data=JSON.parse(d.fragment),u=new URL(source.url);
  assert(data.COUNTRY_CODE===d.observedMarket&&data.CURRENCY_CODE===scope.currency);
  assert(scope.serviceSlug==='google-one'&&scope.cadence==='MONTH'&&scope.billingRoute==='direct'&&scope.offerType==='ORDINARY_RECURRING'&&scope.taxTreatment==='UNKNOWN');
  assert(u.origin==='https://one.google.com'&&!u.search&&u.pathname.startsWith('/intl/ALL_'+scope.countryCode.toLowerCase()+'/about/feeds/'));
  assert(d.acquisitionId===bodyHash(JSON.stringify([scope,source.url,source.checkedAt])));
  assert(source.outcome==='OK'&&source.httpStatus===200&&source.redirects.length===0);
  assert(source.authority?.hostname==='one.google.com'&&source.authority.provider==='Google One');
  assert(source.sourceType==='OFFICIAL_PROVIDER'&&source.accessDecisions?.some(x=>x.targetUrl===source.url&&['ALLOWED','NO_ROBOTS_POLICY'].includes(x.decision)));
  assert(!source.accessDecisions.some(x=>!['ALLOWED','NO_ROBOTS_POLICY'].includes(x.decision)));
  return true;
 }catch{return false;}
}
