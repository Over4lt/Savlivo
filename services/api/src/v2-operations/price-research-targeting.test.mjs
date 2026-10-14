import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {projectResearchServices} from '../research-v3/research-service-projection.mjs';
import {loadPriceResearchTargeting,projectPriceResearchTargeting} from './price-research-targeting.mjs';
import {Operations} from './control.mjs';
import {operationsRequest} from './http.mjs';

const lifecycleInput='docs/catalog/global-47/research-v2/v15-mature-handoff-20260921/lifecycle-input.json';
class ReadOnlyDb{
 constructor(rows=[]){this.rows=rows;this.queries=[];}
 async query(sql){this.queries.push(sql);if(!sql.includes('ORDER BY canonical_slug, research_service_id'))throw Error('UNEXPECTED_SQL');return {rows:this.rows};}
}
const database=(id,status)=>({research_service_id:id,canonical_slug:id.replace(/^research-/,''),canonical_name:id,normalized_name:id,identity_type:'Service',status,aliases:[],provider_host:'provider.example',provider_binding_digest:'a'.repeat(64),provider_observation:'observation',source_url:'https://provider.example',source_body_sha256:'b'.repeat(64),relationship:'PROVIDER_PRESENTS_SERVICE',extraction_mechanism:'STRUCTURED_DATA',admission_version:1,created_at:'2026-10-14T00:00:00.000Z',updated_at:'2026-10-14T00:00:00.000Z'});

test('empty production database exposes 463 selectable services, 46 markets and 21,298 logical combinations without implicit selection',async()=>{
 const db=new ReadOnlyDb(),model=await loadPriceResearchTargeting({}, {repo:process.cwd(),lifecycleInput,client:db});
 assert.deepEqual({canonical:model.counts.canonicalServices,selectable:model.counts.selectableServices,markets:model.counts.markets,logical:model.counts.logicalServiceMarketCombinations},{canonical:463,selectable:463,markets:46,logical:21298});
 assert.equal(model.services.length,463);assert.equal(model.markets.length,46);assert.equal(model.selectedServices,0);assert.equal(model.serviceMarketTargets,0);assert.equal(model.targets.length,0);assert.equal(model.selection.explicitServiceSelection,false);assert.equal(model.selection.implicitAllServices,false);assert.equal(model.selection.canStart,false);
 assert.equal(db.queries.length,1);assert.match(db.queries[0],/^SELECT\s+research_service_id,/);assert.doesNotMatch(db.queries[0],/\bsource_body\b/);
});

test('empty market selection gives chess-com, 1password and an unscoped service all 46 investigation markets',async()=>{
 for(const serviceId of ['chess-com','1password']){
  const model=await loadPriceResearchTargeting({services:[serviceId]}, {repo:process.cwd(),lifecycleInput,databaseIdentities:[]});
  assert.equal(model.selectedServices,1);assert.equal(model.selectedMarkets,46);assert.equal(model.serviceMarketTargets,46);assert.equal(new Set(model.targets.map(row=>row.targetMarket)).size,46);assert(model.targets.every(row=>row.serviceId===serviceId&&row.marketApplicabilityEstablished===false));
  for(const target of model.targets)for(const forbidden of ['availability','price','suggested','verified','truth'])assert.equal(Object.hasOwn(target,forbidden),false);
 }
 const projection=projectResearchServices({baseline:[{service:'unscoped',name:'Unscoped'}],frozen:[],manifestServiceIds:[],productCatalogRows:[]}),model=projectPriceResearchTargeting(projection,{services:['unscoped']});
 assert.equal(model.services[0].researchScopeHints.length,0);assert.equal(model.targets.length,46);
});

test('selected services and markets form only their cartesian product in deterministic canonical service order',async()=>{
 const model=await loadPriceResearchTargeting({services:['chess-com','1password'],markets:['DE','NO']}, {repo:process.cwd(),lifecycleInput,databaseIdentities:[]});
 assert.equal(model.selectedServices,2);assert.equal(model.selectedMarkets,2);assert.equal(model.serviceMarketTargets,4);assert.deepEqual(model.targets.map(row=>[row.serviceId,row.targetMarket]),[['1password','DE'],['1password','NO'],['chess-com','DE'],['chess-com','NO']]);
 assert.equal(new Set(model.targets.map(row=>row.id)).size,4);
});

test('scope hints affect all-market ordering but never membership',()=>{
 const projection=projectResearchServices({baseline:[{service:'hinted',name:'Hinted',launchMarkets:['DE']}],frozen:[],manifestServiceIds:[],productCatalogRows:[],researchScopes:{hinted:['NO']}}),all=projectPriceResearchTargeting(projection,{services:['hinted']});
 assert.deepEqual(all.targets.slice(0,2).map(row=>row.targetMarket),['DE','NO']);assert.equal(all.targets.length,46);assert.deepEqual(new Set(all.targets.map(row=>row.targetMarket)),new Set(all.markets.map(row=>row.id)));
 const explicit=projectPriceResearchTargeting(projection,{services:['hinted'],markets:['FR','DE']});assert.deepEqual(explicit.targets.map(row=>row.targetMarket),['FR','DE']);
});

test('full explicit service universe can be previewed as exactly 21,298 read-only targets',async()=>{
 const universe=await loadPriceResearchTargeting({}, {repo:process.cwd(),lifecycleInput,databaseIdentities:[]}),full=await loadPriceResearchTargeting({services:universe.services.map(row=>row.serviceId)}, {repo:process.cwd(),lifecycleInput,databaseIdentities:[]});
 assert.equal(full.targets.length,21298);assert.equal(full.serviceMarketTargets,21298);assert.equal(full.selection.canStart,false);assert(full.targets.every(row=>row.marketApplicabilityEstablished===false));
});

test('unknown markets and unknown, ambiguous or deactivated services fail closed',()=>{
 const projection=projectResearchServices({baseline:[{service:'known',name:'Known'}],frozen:[],manifestServiceIds:[],productCatalogRows:[],databaseIdentities:[database('research-review','AMBIGUOUS'),database('research-off','DEACTIVATED')]});
 for(const input of [{services:['known'],markets:['XX']},{services:['missing']},{services:['research-review']},{services:['research-off']},{services:['known','known']},{services:['known'],markets:['DE','DE']}])assert.throws(()=>projectPriceResearchTargeting(projection,input));
 const view=projectPriceResearchTargeting(projection);assert.equal(view.services.find(row=>row.serviceId==='research-review').selectable,false);assert.equal(view.services.find(row=>row.serviceId==='research-off').selectable,false);
});

test('authenticated GET/POST endpoint is read-only and does not reuse mature targeting or create Operations state',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'price-targeting-'));fs.rmSync(root,{recursive:true,force:true});t.after(()=>fs.rmSync(root,{recursive:true,force:true}));const db=new ReadOnlyDb(),ops=new Operations({repo:process.cwd(),root,lifecycleInput,read:true,control:false,scheduling:false,client:db});
 ops.targeting=()=>{throw Error('MATURE_TARGETING_MUST_NOT_RUN');};
 const request=(method,body,actor='admin')=>operationsRequest({method,body,actor,url:new URL('https://offline.invalid/v1/admin/v2-operations/price-research/targeting')},ops);
 const universe=await request('GET');assert.equal(universe.counts.selectableServices,463);assert.equal(universe.targets.length,0);
 const selected=await request('POST',{services:['chess-com'],markets:[]});assert.equal(selected.targets.length,46);assert(!fs.existsSync(root));assert.equal(db.queries.length,2);assert(db.queries.every(sql=>/^SELECT\s+research_service_id,/.test(sql)));
 await assert.rejects(request('GET',undefined,null),/UNAUTHORIZED/);await assert.rejects(request('PUT'),/NOT_FOUND/);
});
