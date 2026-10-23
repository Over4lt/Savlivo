import test from 'node:test';
import assert from 'node:assert/strict';
import {operationsRequest} from './http.mjs';

class RuleDb {
 constructor(){this.rules=new Map();this.queries=[];}
 async query(sql,args=[]){
  this.queries.push(sql);
  if(sql.includes('INSERT INTO price_research_country_rules')){this.rules.set(args[0],{service_id:args[0],mode:args[1],market_codes:args[2],updated_at:'2026-10-24T00:00:00Z'});return {rows:[]};}
  if(sql.includes('DELETE FROM price_research_country_rules')){this.rules.delete(args[0]);return {rows:[]};}
  if(sql.includes('FROM price_research_country_rules'))return {rows:this.rules.has(args[0])?[this.rules.get(args[0])]:[]};
  throw Error('UNEXPECTED_SQL');
 }
}

test('country rules persist per canonical service and never touch prices',async()=>{
 const db=new RuleDb(),ops={config:{read:true,control:true,client:db},priceResearchTargeting:async()=>({services:[{serviceId:'max',selectable:true},{serviceId:'disney-plus',selectable:true}]})};
 const call=(method,serviceId,body)=>operationsRequest({method,url:new URL('https://offline.invalid/v1/admin/v2-operations/price-research/country-rule?serviceId='+serviceId),body,actor:'11111111-1111-1111-1111-111111111111'},ops);
 assert.equal((await call('GET','max')).rule,null);
 const saved=await call('POST','max',{serviceId:'max',mode:'NOT_OFFERED',countries:['DK','NO']});
 assert.deepEqual(saved.rule.countries,['NO','DK']);
 assert.equal((await call('GET','disney-plus')).rule,null);
 assert.deepEqual((await call('GET','max')).rule,saved.rule);
 await call('DELETE','max');assert.equal((await call('GET','max')).rule,null);
 assert(db.queries.every(sql=>!/(?:verified_provider_prices|suggested_provider_prices|price_history)/.test(sql)));
});

test('country rules reject unknown, duplicate or cross-service selections and require control',async()=>{
 const db=new RuleDb(),ops={config:{read:true,control:true,client:db},priceResearchTargeting:async()=>({services:[{serviceId:'max',selectable:true}]})};
 const call=(method,serviceId,body)=>operationsRequest({method,url:new URL('https://offline.invalid/v1/admin/v2-operations/price-research/country-rule?serviceId='+serviceId),body,actor:'11111111-1111-1111-1111-111111111111'},ops);
 await assert.rejects(call('POST','max',{serviceId:'max',mode:'OFFERED',countries:['NO','NO']}),/INVALID_COUNTRY_RULE/);
 await assert.rejects(call('POST','max',{serviceId:'max',mode:'OFFERED',countries:['XX']}),/INVALID_COUNTRY_RULE/);
 await assert.rejects(call('POST','max',{serviceId:'disney-plus',mode:'OFFERED',countries:['NO']}),/INVALID_COUNTRY_RULE/);
 await assert.rejects(call('POST','disney-plus',{serviceId:'disney-plus',mode:'OFFERED',countries:['NO']}),/UNKNOWN_PRICE_RESEARCH_SERVICE/);
 ops.config.control=false;await assert.rejects(call('POST','max',{serviceId:'max',mode:'OFFERED',countries:['NO']}),/RUN_CONTROL_DISABLED/);
 assert.equal(db.rules.size,0);
});
