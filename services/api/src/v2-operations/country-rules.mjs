import {countryCurrencyData} from '../../../../packages/contracts/src/markets.ts';
import {pool} from '../db.ts';

const marketOrder=countryCurrencyData.map(([code])=>code);
const marketIds=new Set(marketOrder);
const fail=(code,status=400)=>{throw Object.assign(Error(code),{status});};

// These are operator-selected research scopes, never provider availability evidence.
export async function countryRulesRequest({method,serviceId,body,ops,actor,client=ops.config.client??pool}){
 if(!actor)fail('UNAUTHORIZED',401);
 if(typeof serviceId!=='string'||!/^[a-z0-9][a-z0-9-]{0,159}$/.test(serviceId))fail('INVALID_PRICE_RESEARCH_SERVICE');
 if(method!=='GET'&&!ops.config.control)fail('RUN_CONTROL_DISABLED',403);
 const targeting=await ops.priceResearchTargeting({});
 if(!targeting.services.some(row=>row.serviceId===serviceId&&row.selectable))fail('UNKNOWN_PRICE_RESEARCH_SERVICE',404);
 if(method==='POST'){
  const codes=body?.countries;
  if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(key=>!['serviceId','mode','countries'].includes(key))||body.serviceId!==serviceId||!['OFFERED','NOT_OFFERED'].includes(body.mode)||!Array.isArray(codes)||!codes.length||codes.length>marketOrder.length||codes.some(code=>!marketIds.has(code))||new Set(codes).size!==codes.length)fail('INVALID_COUNTRY_RULE');
  const sorted=marketOrder.filter(code=>codes.includes(code));
  await client.query(`INSERT INTO price_research_country_rules(service_id,mode,market_codes,updated_by)
   VALUES($1,$2,$3,$4) ON CONFLICT(service_id) DO UPDATE
   SET mode=EXCLUDED.mode,market_codes=EXCLUDED.market_codes,updated_at=now(),updated_by=EXCLUDED.updated_by`,[serviceId,body.mode,sorted,actor]);
 }else if(method==='DELETE'){
  await client.query('DELETE FROM price_research_country_rules WHERE service_id=$1',[serviceId]);
 }else if(method!=='GET')fail('NOT_FOUND',404);
 const result=await client.query('SELECT service_id,mode,market_codes,updated_at FROM price_research_country_rules WHERE service_id=$1',[serviceId]);
 const row=result.rows[0];
 if(row&&(!['OFFERED','NOT_OFFERED'].includes(row.mode)||!Array.isArray(row.market_codes)||!row.market_codes.length||row.market_codes.some(code=>!marketIds.has(code))||new Set(row.market_codes).size!==row.market_codes.length))fail('INVALID_SAVED_COUNTRY_RULE',500);
 return {version:'PRICE_RESEARCH_COUNTRY_RULE_V1',serviceId,rule:row?{mode:row.mode,countries:row.market_codes,updatedAt:row.updated_at}:null};
}
