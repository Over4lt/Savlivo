import {randomUUID} from 'node:crypto';
import {countryCurrencies} from '../../../../packages/contracts/src/markets.ts';
import {normalizePublicUrl} from '../research-v1/public-network.mjs';
import {pool} from '../db.ts';
import {marketPriceStatusSql} from './market-price-status.mjs';

const kinds=new Set(['DIRECT_SOURCE','INTERACTIVE_ROUTE']);
const scopes=new Set(['GLOBAL','MARKET_SPECIFIC']);
const results=new Set(['VERIFIED','PROVIDER_SOURCE_NO_VERIFIED','UNKNOWN_SOURCE','THIRD_PARTY_SOURCE','ACQUISITION_FAILED','DECODO_UNAVAILABLE','BROWSER_CONTINUATION_REQUIRED','BROWSER_FAILED','ACCESS_BLOCKED']);
const fail=(code,status=400)=>{throw Object.assign(Error(code),{status});};
const timestamp=value=>value?new Date(value).toISOString():null;
const view=row=>({id:row.id,serviceId:row.service_id,url:row.url,kind:row.kind,marketScope:row.market_scope,marketCode:row.market_code,enabled:row.enabled===true,createdAt:timestamp(row.created_at),updatedAt:timestamp(row.updated_at),lastUsedAt:timestamp(row.last_used_at),lastResult:row.last_result??null});
const select=`SELECT id,service_id,url,kind,market_scope,market_code,enabled,created_at,updated_at,last_used_at,last_result FROM price_research_links`;

export function validateResearchLink(input){
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(key=>!['url','kind','marketScope','marketCode','enabled'].includes(key)))fail('INVALID_RESEARCH_LINK');
 if(typeof input.url!=='string'||input.url.length>2048||!kinds.has(input.kind)||!scopes.has(input.marketScope)||typeof input.enabled!=='boolean')fail('INVALID_RESEARCH_LINK');
 if(input.marketScope==='MARKET_SPECIFIC'?!countryCurrencies[input.marketCode]:input.marketCode!==null&&input.marketCode!==undefined)fail('INVALID_RESEARCH_LINK_MARKET');
 let url;try{url=normalizePublicUrl(input.url);}catch{fail('UNSAFE_RESEARCH_LINK_URL');}
 if(url.protocol!=='https:')fail('UNSAFE_RESEARCH_LINK_URL');
 return {url:url.href,kind:input.kind,marketScope:input.marketScope,marketCode:input.marketScope==='GLOBAL'?null:input.marketCode,enabled:input.enabled};
}

async function requireService(ops,serviceId){
 if(typeof serviceId!=='string'||!/^[a-z0-9][a-z0-9-]{0,159}$/.test(serviceId))fail('INVALID_RESEARCH_LINK_SERVICE');
 const targeting=await ops.priceResearchTargeting({}),service=targeting.services.find(row=>row.serviceId===serviceId&&row.selectable);
 if(!service)fail('UNKNOWN_PRICE_RESEARCH_SERVICE',404);return service;
}

export async function researchLinksRequest({method,serviceId,linkId=null,body,ops,actor,client=ops.config.client??pool}){
 if(!actor)fail('UNAUTHORIZED',401);
 if(method==='GET'&&!linkId){await requireService(ops,serviceId);const rows=await client.query(`${select} WHERE service_id=$1 ORDER BY created_at,id LIMIT 20`,[serviceId]);return {version:'PRICE_RESEARCH_LINKS_V1',serviceId,rows:rows.rows.map(view)};}
 if(!ops.config.control)fail('RUN_CONTROL_DISABLED',403);
 if(method==='POST'&&!linkId){await requireService(ops,serviceId);const link=validateResearchLink(body);const count=await client.query('SELECT count(*)::int AS count FROM price_research_links WHERE service_id=$1',[serviceId]);if(Number(count.rows[0]?.count)>=20)fail('RESEARCH_LINK_LIMIT',409);
  try{const row=await client.query('INSERT INTO price_research_links(id,service_id,url,kind,market_scope,market_code,enabled) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id,service_id,url,kind,market_scope,market_code,enabled,created_at,updated_at,last_used_at,last_result',[randomUUID(),serviceId,link.url,link.kind,link.marketScope,link.marketCode,link.enabled]);return {version:'PRICE_RESEARCH_LINKS_V1',row:view(row.rows[0])};}catch(error){if(error?.code==='23505')fail('RESEARCH_LINK_DUPLICATE',409);throw error;}
 }
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(linkId??''))fail('INVALID_RESEARCH_LINK_ID');
 const existing=await client.query(`${select} WHERE id=$1`,[linkId]);if(!existing.rows.length)fail('RESEARCH_LINK_NOT_FOUND',404);const prior=existing.rows[0];await requireService(ops,prior.service_id);
 if(method==='DELETE'){await client.query('DELETE FROM price_research_links WHERE id=$1',[linkId]);return {deleted:true,id:linkId};}
 if(method==='PATCH'){const link=validateResearchLink(body);try{const updated=await client.query(`UPDATE price_research_links SET url=$2,kind=$3,market_scope=$4,market_code=$5,enabled=$6,updated_at=now() WHERE id=$1 RETURNING id,service_id,url,kind,market_scope,market_code,enabled,created_at,updated_at,last_used_at,last_result`,[linkId,link.url,link.kind,link.marketScope,link.marketCode,link.enabled]);return {version:'PRICE_RESEARCH_LINKS_V1',row:view(updated.rows[0])};}catch(error){if(error?.code==='23505')fail('RESEARCH_LINK_DUPLICATE',409);throw error;}}
 fail('NOT_FOUND',404);
}

export async function loadApplicableResearchLinks({serviceId,canonicalSlug,market,client=pool}){
 const [links,status]=await Promise.all([
  client.query(`${select} WHERE service_id=$1 AND enabled=true AND (market_scope='GLOBAL' OR market_scope='MARKET_SPECIFIC' AND market_code=$2) ORDER BY CASE WHEN market_scope='MARKET_SPECIFIC' THEN 0 ELSE 1 END,CASE WHEN last_result IN ('VERIFIED','PROVIDER_SOURCE_NO_VERIFIED') THEN 0 ELSE 1 END,created_at,id LIMIT 20`,[serviceId,market]),
  client.query(marketPriceStatusSql,[[canonicalSlug]])
 ]);
 const persistedVerifiedCount=Number(status.rows.find(row=>row.service_slug===canonicalSlug&&row.country_code===market)?.verified_count??0);
 return {persistedVerifiedCount,links:persistedVerifiedCount>0?[]:links.rows.flatMap(row=>{try{const link=validateResearchLink({url:row.url,kind:row.kind,marketScope:row.market_scope,marketCode:row.market_code,enabled:true});return [{id:row.id,...link,serviceId,truthAuthority:'NONE',lastResult:row.last_result??null}];}catch{return [];}})};
}

export async function recordResearchLinkResult({id,attemptedAt,result,client=pool}){
 if(!results.has(result)||!Number.isFinite(Date.parse(attemptedAt)))return;
 await client.query('UPDATE price_research_links SET last_used_at=$2,last_result=$3 WHERE id=$1 AND (last_used_at IS NULL OR last_used_at<=$2)',[id,attemptedAt,result]);
}
