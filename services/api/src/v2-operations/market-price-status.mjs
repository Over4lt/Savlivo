import {pool} from '../db.ts';
import {OperationError} from './control.mjs';
import {currentProviderPriceClassSql} from '../../../../packages/contracts/src/verified-price-classification.ts';
import {activeCurrentPrices} from '../verified-price-reconciliation.mjs';

// Mirrors the active Suggested and qualified Verified evidence used by the
// canonical product-pricing projection. Historical suggestions and user prices
// do not supply current Suggested or Verified counts.
export const marketPriceStatusSql=`WITH evidence AS (
  SELECT service_slug,country_code,plan_identity,billing_provider_slug,
    NULL::text AS plan_slug,NULL::text AS plan_name,NULL::text AS currency,NULL::int AS monthly_price_minor,
    NULL::text AS source,NULL::text AS source_url,NULL::text AS verification,NULL::int AS source_count,
    NULL::boolean AS verified_by_agreement,'suggested' AS kind
  FROM suggested_provider_prices
  WHERE active=true AND service_slug=ANY($1::text[])
  UNION ALL
  SELECT service_slug,country_code,plan_identity,billing_provider_slug,
    plan_slug,plan_name,currency,monthly_price_minor,source,source_url,verification,source_count,verified_by_agreement,
    ${currentProviderPriceClassSql} AS kind
  FROM verified_provider_prices
  WHERE monthly_price_minor>0 AND service_slug=ANY($1::text[])
)
SELECT * FROM evidence ORDER BY service_slug,country_code,plan_identity`;

// Apply the same active-price projection as /v1/pricing and the mobile catalog.
// Retained adapter rows remain visible as audit data, never as active prices.
export function projectMarketPriceStatus(evidence,serviceNameFor){
 const groups=new Map();
 for(const row of evidence){const key=row.service_slug+'\u0000'+row.country_code,group=groups.get(key)??{serviceSlug:row.service_slug,market:row.country_code,suggested:[],prices:[]};
  if(row.kind==='suggested')group.suggested.push(row);else group.prices.push({...row,serviceSlug:row.service_slug,countryCode:row.country_code,planIdentity:row.plan_identity,billingProviderSlug:row.billing_provider_slug,planSlug:row.plan_slug,planName:row.plan_name,sourceUrl:row.source_url,monthlyPriceMinor:row.monthly_price_minor,sourceCount:row.source_count,verifiedByAgreement:row.verified_by_agreement});
  groups.set(key,group);
 }
 const count=rows=>new Set(rows.map(row=>JSON.stringify([row.planIdentity??row.plan_identity,row.billingProviderSlug??row.billing_provider_slug]))).size;
 return [...groups.values()].map(group=>{
  const active=new Set(activeCurrentPrices(group.prices,serviceNameFor));
  return {serviceSlug:group.serviceSlug,market:group.market,suggestedCount:count(group.suggested),
   verifiedCount:count(group.prices.filter(row=>active.has(row)&&row.kind==='verified')),
   oldVerifiedCount:count(group.prices.filter(row=>active.has(row)&&row.kind==='old_verified')),
   retainedOldVerifiedCount:count(group.prices.filter(row=>row.kind==='old_verified'))};
 });
}

export async function marketPriceStatus(input,ops,client=ops.config.client??pool){
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(key=>key!=='services')||!Array.isArray(input.services)||new Set(input.services).size!==input.services.length||input.services.some(id=>typeof id!=='string'||id.length<1||id.length>160))throw new OperationError('INVALID_MARKET_PRICE_STATUS');
 const universe=await ops.priceResearchTargeting({}),byId=new Map(universe.services.filter(row=>row.selectable).map(row=>[row.serviceId,row]));
 for(const id of input.services)if(!byId.has(id))throw new OperationError('UNKNOWN_PRICE_RESEARCH_SERVICE');
 if(!input.services.length)return {version:'MARKET_PRICE_STATUS_V1',rows:[]};
 const slugs=[...new Set(input.services.map(id=>byId.get(id).canonicalSlug))],marketIds=new Set(universe.markets.map(row=>row.id)),idsBySlug=new Map();
 for(const id of input.services){const slug=byId.get(id).canonicalSlug;idsBySlug.set(slug,[...(idsBySlug.get(slug)??[]),id]);}
 const serviceNames=new Map(input.services.map(id=>[byId.get(id).canonicalSlug,byId.get(id).name]));
 const result=await client.query(marketPriceStatusSql,[slugs]),rows=[];
 for(const row of projectMarketPriceStatus(result.rows,slug=>serviceNames.get(slug))){if(!marketIds.has(row.market))continue;for(const serviceId of idsBySlug.get(row.serviceSlug)??[])rows.push({serviceId,market:row.market,suggestedCount:row.suggestedCount,verifiedCount:row.verifiedCount,oldVerifiedCount:row.oldVerifiedCount,retainedOldVerifiedCount:row.retainedOldVerifiedCount});}
 return {version:'MARKET_PRICE_STATUS_V1',rows};
}
