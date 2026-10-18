import {countryCurrencyData} from '../../../../packages/contracts/src/markets.ts';
import {pool} from '../db.ts';

const markets=countryCurrencyData.map(([id,name])=>({id,name}));
const marketIds=new Set(markets.map(row=>row.id));
const reasons=new Set(['SERVICE_NOT_AVAILABLE','TEMPORARILY_EXCLUDED','OTHER']);
const fail=(code,status=400)=>{throw Object.assign(Error(code),{status});};

export async function listMarketExclusions(serviceIds,{client=pool}={}){
 if(!serviceIds.length)return [];
 const result=await client.query(`SELECT service_id,market_code,reason FROM price_research_market_exclusions
  WHERE service_id=ANY($1::text[]) ORDER BY service_id,market_code`,[serviceIds]);
 return result.rows.filter(row=>marketIds.has(row.market_code));
}

export async function excludedServiceIdsForMarket(market,{client=pool}={}){
 const result=await client.query('SELECT service_id FROM price_research_market_exclusions WHERE market_code=$1',[market]);
 return new Set(result.rows.map(row=>row.service_id));
}

export async function marketExclusionsRequest({method,serviceId,body,ops,actor,client=ops.config.client??pool}){
 if(!actor)fail('UNAUTHORIZED',401);
 if(typeof serviceId!=='string'||!/^[a-z0-9][a-z0-9-]{0,159}$/.test(serviceId))fail('INVALID_PRICE_RESEARCH_SERVICE');
 const targeting=await ops.priceResearchTargeting({});
 if(!targeting.services.some(row=>row.serviceId===serviceId&&row.selectable))fail('UNKNOWN_PRICE_RESEARCH_SERVICE',404);
 if(method==='POST'){
  if(!ops.config.control)fail('RUN_CONTROL_DISABLED',403);
  if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(key=>!['serviceId','market','excluded','reason'].includes(key))||body.serviceId!==serviceId||!marketIds.has(body.market)||typeof body.excluded!=='boolean')fail('INVALID_MARKET_EXCLUSION');
  if(body.excluded){if(body.reason!==undefined&&body.reason!==null&&!reasons.has(body.reason))fail('INVALID_MARKET_EXCLUSION_REASON');
   await client.query(`INSERT INTO price_research_market_exclusions(service_id,market_code,reason,updated_by)
    VALUES($1,$2,$3,$4) ON CONFLICT(service_id,market_code) DO UPDATE
    SET reason=EXCLUDED.reason,updated_at=now(),updated_by=EXCLUDED.updated_by`,[serviceId,body.market,body.reason??null,actor]);
  }else{if(body.reason!==undefined&&body.reason!==null)fail('INVALID_MARKET_EXCLUSION_REASON');
   await client.query('DELETE FROM price_research_market_exclusions WHERE service_id=$1 AND market_code=$2',[serviceId,body.market]);
  }
 }else if(method!=='GET')fail('NOT_FOUND',404);
 const excluded=await listMarketExclusions([serviceId],{client}),byMarket=new Map(excluded.map(row=>[row.market_code,row.reason]));
 const rows=markets.map(row=>({...row,excluded:byMarket.has(row.id),reason:byMarket.get(row.id)??null}));
 return {version:'PRICE_RESEARCH_MARKET_EXCLUSIONS_V1',serviceId,rows,counts:{included:rows.length-excluded.length,excluded:excluded.length}};
}
