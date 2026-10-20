import {pool} from '../db.ts';
import {OperationError} from './control.mjs';

// Mirrors the active Suggested and qualified Verified evidence used by the
// canonical product-pricing projection. Historical suggestions and user prices
// do not supply current Suggested or Verified counts.
export const marketPriceStatusSql=`WITH evidence AS (
  SELECT service_slug,country_code,plan_identity,billing_provider_slug,'suggested' AS kind
  FROM suggested_provider_prices
  WHERE active=true AND service_slug=ANY($1::text[])
  UNION ALL
  SELECT service_slug,country_code,plan_identity,billing_provider_slug,
    CASE WHEN verification IN ('registry','authoritative-provider')
      OR (verification='multi-source' AND verified_by_agreement=true AND source_count>=2)
      THEN CASE WHEN source LIKE 'official-provider-adapter:%' THEN 'old_verified' ELSE 'verified' END
      ELSE 'suggested' END AS kind
  FROM verified_provider_prices
  WHERE monthly_price_minor>0 AND service_slug=ANY($1::text[])
)
SELECT service_slug,country_code,
  count(DISTINCT (plan_identity,billing_provider_slug)) FILTER (WHERE kind='suggested')::int AS suggested_count,
  count(DISTINCT (plan_identity,billing_provider_slug)) FILTER (WHERE kind='verified')::int AS verified_count,
  count(DISTINCT (plan_identity,billing_provider_slug)) FILTER (WHERE kind='old_verified')::int AS old_verified_count
FROM evidence GROUP BY service_slug,country_code`;

export async function marketPriceStatus(input,ops,client=ops.config.client??pool){
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(key=>key!=='services')||!Array.isArray(input.services)||new Set(input.services).size!==input.services.length||input.services.some(id=>typeof id!=='string'||id.length<1||id.length>160))throw new OperationError('INVALID_MARKET_PRICE_STATUS');
 const universe=await ops.priceResearchTargeting({}),byId=new Map(universe.services.filter(row=>row.selectable).map(row=>[row.serviceId,row]));
 for(const id of input.services)if(!byId.has(id))throw new OperationError('UNKNOWN_PRICE_RESEARCH_SERVICE');
 if(!input.services.length)return {version:'MARKET_PRICE_STATUS_V1',rows:[]};
 const slugs=[...new Set(input.services.map(id=>byId.get(id).canonicalSlug))],marketIds=new Set(universe.markets.map(row=>row.id)),idsBySlug=new Map();
 for(const id of input.services){const slug=byId.get(id).canonicalSlug;idsBySlug.set(slug,[...(idsBySlug.get(slug)??[]),id]);}
 const result=await client.query(marketPriceStatusSql,[slugs]),rows=[];
 for(const row of result.rows){if(!marketIds.has(row.country_code))continue;for(const serviceId of idsBySlug.get(row.service_slug)??[])rows.push({serviceId,market:row.country_code,suggestedCount:Number(row.suggested_count),verifiedCount:Number(row.verified_count),oldVerifiedCount:Number(row.old_verified_count)});}
 return {version:'MARKET_PRICE_STATUS_V1',rows};
}
