import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {projectResearchServices} from './research-service-projection.mjs';

const repository=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../../..');
const read=relative=>JSON.parse(fs.readFileSync(path.join(repository,relative),'utf8'));
const database=(id,slug=id,status='RESEARCHABLE',extra={})=>({research_service_id:id,canonical_slug:slug,canonical_name:slug,normalized_name:slug,identity_type:'Service',status,aliases:[],provider_host:'provider.example',provider_binding_digest:'a'.repeat(64),provider_observation:'observation',source_url:'https://provider.example',source_body_sha256:'b'.repeat(64),relationship:'PROVIDER_PRESENTS_SERVICE',extraction_mechanism:'STRUCTURED_DATA',admission_version:1,created_at:'2026-10-14T00:00:00.000Z',updated_at:'2026-10-14T00:00:00.000Z',...extra});

test('production static universe projects 275 baseline plus 188 frozen identities without duplicating 78 products',()=>{
 const input=read('docs/catalog/global-47/research-v2/v15-mature-handoff-20260921/lifecycle-input.json');
 const universe=read(input.universe),manifest=read(input.cohortManifest),scopes=read(input.researchScopes).researchMarkets;
 const result=projectResearchServices({baseline:universe.existing,frozen:[...universe.new_include,...universe.research],manifestServiceIds:manifest.serviceIds,researchScopes:scopes});
 assert.equal(result.counts.baseline,275);assert.equal(result.counts.frozen,188);assert.equal(result.counts.productCatalog,78);assert.equal(result.counts.databaseNew,0);assert.equal(result.counts.canonical,463);assert.equal(result.counts.researchable,463);assert.equal(result.rows.length,463);
 assert.equal(new Set(result.rows.map(row=>row.serviceId)).size,463);
 const product=result.rows.find(row=>row.serviceId==='netflix');assert.equal(product.productCatalogMember,true);assert.equal(product.sources.baseline.serviceId,'netflix');assert.equal(product.sources.productCatalog.serviceId,'netflix');assert.equal(product.reconciliation.precedence,'PRODUCT_ID_WITH_BASELINE_STABLE_ID');
 const frozen=result.rows.find(row=>row.serviceId==='aaa');assert.equal(frozen.frozenLifecycleMember,true);assert.equal(frozen.sources.frozen.serviceId,'aaa');assert.equal(frozen.reconciliation.precedence,'FROZEN_STABLE_ID');
 assert(result.rows.some(row=>row.researchScopeHints.length));assert(result.rows.every(row=>row.researchScopeHints.every(hint=>Object.keys(hint).sort().join()==='basis,market')));
 const flo=result.rows.filter(row=>['flo-health','flo-music-kr'].includes(row.serviceId));assert.equal(flo.length,2);assert.equal(new Set(flo.map(row=>row.serviceId)).size,2);
});

test('database status semantics include only a unique RESEARCHABLE identity as selectable',()=>{
 const baseline=[{service:'baseline-service',name:'Baseline Service'}],frozen=[{slug:'frozen-service',name:'Frozen Service',aliases:[]}],manifestServiceIds=['frozen-service'];
 const result=projectResearchServices({baseline,frozen,manifestServiceIds,productCatalogRows:[],databaseIdentities:[database('research-new-1','new-service'),database('research-review-1','review-service','AMBIGUOUS'),database('research-off-1','off-service','DEACTIVATED'),database('research-unknown-1','unknown-service','OTHER')]});
 assert.equal(result.rows.length,6);assert.equal(result.counts.databaseNew,4);
 assert.equal(result.rows.find(row=>row.serviceId==='research-new-1').researchable,true);
 assert.equal(result.rows.find(row=>row.serviceId==='research-review-1').researchable,false);
 assert.equal(result.rows.find(row=>row.serviceId==='research-off-1').researchable,false);
 const unknown=result.rows.find(row=>row.serviceId==='research-unknown-1');assert.equal(unknown.researchable,false);assert.equal(unknown.status,'AMBIGUOUS');assert.equal(unknown.reconciliation.outcome,'UNKNOWN_DATABASE_STATUS');
});

test('stable ID, canonical slug and unique reviewed alias reconcile in precedence order without changing static identity',()=>{
 const baseline=[{service:'product-one',name:'Product One',aliases:['Reviewed One']}],frozen=[{slug:'frozen-one',name:'Frozen One',aliases:['Reviewed Frozen']}];
 const result=projectResearchServices({baseline,frozen,manifestServiceIds:['frozen-one'],productCatalogRows:[{slug:'product-one',name:'Product One Canonical',aliases:['Reviewed One'],categories:['other']}],databaseIdentities:[database('product-one','unrelated'),database('research-old-frozen','frozen-one'),database('research-old-alias','reviewed-one')]});
 assert.equal(result.rows.length,2);
 const product=result.rows.find(row=>row.serviceId==='product-one');assert.equal(product.name,'Product One Canonical');assert.equal(product.sources.database.serviceId,'research-old-alias');assert.equal(product.researchable,true);
 const frozenRow=result.rows.find(row=>row.serviceId==='frozen-one');assert.equal(frozenRow.sources.database.serviceId,'research-old-frozen');assert.equal(frozenRow.researchable,true);
});

test('database status cannot deactivate or rename an exact static identity',()=>{
 const result=projectResearchServices({baseline:[{service:'baseline-service',name:'Baseline Name'}],frozen:[],manifestServiceIds:[],productCatalogRows:[],databaseIdentities:[database('research-old-static','baseline-service','DEACTIVATED',{canonical_name:'Database Rename Attempt'})]});
 assert.equal(result.rows.length,1);const row=result.rows[0];assert.equal(row.serviceId,'baseline-service');assert.equal(row.name,'Baseline Name');assert.equal(row.status,'RESEARCHABLE');assert.equal(row.researchable,true);assert.equal(row.sources.database.status,'DEACTIVATED');assert.equal(row.reconciliation.database.outcome,'RECONCILED_TO_STATIC');
});

test('colliding reviewed aliases fail closed while names, fuzzy similarity and provider hosts never merge',()=>{
 const baseline=[{service:'alpha-service',name:'Acme Plus',aliases:['Shared Alias']},{service:'beta-service',name:'Acme Premium',aliases:['Shared Alias']}];
 const databases=[database('research-alias-1','shared-alias'),database('research-name-1','acme-plus-official','RESEARCHABLE',{normalized_name:'acme plus'}),database('research-host-1','host-one'),database('research-host-2','host-two')];
 const result=projectResearchServices({baseline,frozen:[],manifestServiceIds:[],productCatalogRows:[],databaseIdentities:databases});
 assert.deepEqual(result.collisions,[{kind:'EXPLICIT_ALIAS_COLLISION',key:'shared alias',serviceIds:['alpha-service','beta-service']}]);
 const alias=result.rows.find(row=>row.serviceId==='research-alias-1');assert.equal(alias.status,'AMBIGUOUS');assert.equal(alias.researchable,false);assert.deepEqual(alias.reconciliation.matches,['alpha-service','beta-service']);
 assert.equal(result.rows.find(row=>row.serviceId==='research-name-1').reconciliation.outcome,'CANONICAL_DATABASE_IDENTITY');
 assert.equal(result.rows.filter(row=>['research-host-1','research-host-2'].includes(row.serviceId)).length,2);
});
