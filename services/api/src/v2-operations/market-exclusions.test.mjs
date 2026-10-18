import test from 'node:test';
import assert from 'node:assert/strict';
import {operationsRequest} from './http.mjs';
import {excludedServiceIdsForMarket} from './market-exclusions.mjs';

class ExclusionDb {
 constructor(){this.exclusions=new Map();this.queries=[];this.prices={suggested:3,verified:3,history:6};}
 async query(sql,args=[]){
  this.queries.push({sql,args});
  if(sql.includes('INSERT INTO price_research_market_exclusions')){this.exclusions.set(args[0]+'\u0000'+args[1],{service_id:args[0],market_code:args[1],reason:args[2]});return {rows:[]};}
  if(sql.includes('DELETE FROM price_research_market_exclusions')){this.exclusions.delete(args[0]+'\u0000'+args[1]);return {rows:[]};}
  if(sql.includes('FROM price_research_market_exclusions'))return {rows:[...this.exclusions.values()].filter(row=>sql.includes('WHERE market_code=')?row.market_code===args[0]:args[0].includes(row.service_id))};
  throw Error('UNEXPECTED_SQL');
 }
}

test('admin exclusion persists per service, is reversible, and never changes price history',async()=>{
 const db=new ExclusionDb(),ops={config:{read:true,control:true,client:db},priceResearchTargeting:async()=>({services:[{serviceId:'disney-plus',selectable:true},{serviceId:'chess-com',selectable:true}]})};
 const request=(method,serviceId,body,actor='admin')=>operationsRequest({method,url:new URL('https://offline.invalid/v1/admin/v2-operations/price-research/market-exclusions?serviceId='+serviceId),body,actor},ops);
 const initial=await request('GET','disney-plus');assert.equal(initial.counts.included,46);assert.equal(initial.counts.excluded,0);
 const changed=await request('POST','disney-plus',{serviceId:'disney-plus',market:'IN',excluded:true,reason:'SERVICE_NOT_AVAILABLE'});
 assert.equal(changed.counts.excluded,1);assert.equal(changed.rows.find(row=>row.id==='IN').reason,'SERVICE_NOT_AVAILABLE');
 assert.equal((await request('GET','chess-com')).counts.excluded,0);
 assert.equal((await request('GET','disney-plus')).rows.find(row=>row.id==='IN').excluded,true);
 assert.deepEqual([...await excludedServiceIdsForMarket('IN',{client:db})],['disney-plus']);
 assert.deepEqual(db.prices,{suggested:3,verified:3,history:6});
 assert(db.queries.every(row=>!/\b(?:suggested_provider_prices|verified_provider_prices|verified_price_observations)\b/.test(row.sql)));
 await request('POST','disney-plus',{serviceId:'disney-plus',market:'IN',excluded:false});
 assert.equal((await request('GET','disney-plus')).counts.excluded,0);
});

test('market exclusion mutation requires authenticated Operations control and canonical IDs',async()=>{
 const db=new ExclusionDb(),ops={config:{read:true,control:true,client:db},priceResearchTargeting:async()=>({services:[{serviceId:'disney-plus',selectable:true}]})};
 const call=(actor,body)=>operationsRequest({method:'POST',url:new URL('https://offline.invalid/v1/admin/v2-operations/price-research/market-exclusions'),body,actor},ops);
 const body={serviceId:'disney-plus',market:'IN',excluded:true};
 await assert.rejects(call(null,body),/UNAUTHORIZED/);
 ops.config.control=false;await assert.rejects(call('admin',body),/RUN_CONTROL_DISABLED/);
 ops.config.control=true;await assert.rejects(call('admin',{...body,market:'XX'}),/INVALID_MARKET_EXCLUSION/);
 await assert.rejects(call('admin',{...body,serviceId:'unknown'}),/UNKNOWN_PRICE_RESEARCH_SERVICE/);
 assert.equal(db.exclusions.size,0);
});
