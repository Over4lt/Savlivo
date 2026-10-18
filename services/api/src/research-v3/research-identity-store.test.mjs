import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {digest} from './model.mjs';
import {discoverSubscriptionServices} from './subscription-service-discovery.mjs';
import {providerOrBrandResearchTarget} from './research-target.mjs';
import {admitDurableResearchIdentity,listResearchServiceIdentities,rehydrateResearchIdentity,resolvePriceResearchIdentity} from './research-identity-store.mjs';
import {projectResearchServices} from './research-service-projection.mjs';
import {priceResearchPlan} from '../v2-operations/price-research.mjs';

const caps={direct:false,tavily:false,decodo:false,browser:false,groq:false};
class MemoryDb{
 constructor(rows=[]){this.rows=structuredClone(rows);this.queries=[];}
 async connect(){return this;}release(){}
 async query(sql,p=[]){
  this.queries.push(sql);
  if(/^(BEGIN|COMMIT|ROLLBACK)/.test(sql)||sql.includes('pg_advisory_xact_lock'))return {rows:[]};
  if(sql.includes('ORDER BY canonical_slug, research_service_id'))return {rows:this.rows};
  if(sql.includes('FROM price_research_market_exclusions'))return {rows:[]};
  if(sql.includes('WHERE research_service_id=$1'))return {rows:this.rows.filter(row=>row.research_service_id===p[0])};
  if(sql.includes('WHERE canonical_slug=$1'))return {rows:this.rows.filter(row=>row.canonical_slug===p[0]||(row.aliases??[]).includes(p[1]))};
  if(sql.includes('INSERT INTO research_service_identities')){const now='2026-10-14T00:00:00.000Z',row={research_service_id:p[0],canonical_slug:p[1],canonical_name:p[2],normalized_name:p[3],identity_type:p[4],status:'RESEARCHABLE',provider_host:p[5],provider_binding_digest:p[6],provider_binding:JSON.parse(p[7]),provider_observation:p[8],source_url:p[9],source_body_sha256:p[10],source_body:p[11],identity_locator:JSON.parse(p[12]),subscription_locator:JSON.parse(p[13]),relationship:p[14],extraction_mechanism:p[15],admission_version:1,aliases:JSON.parse(p[16]),created_at:now,updated_at:now};this.rows.push(row);return {rows:[row]};}
  throw Error('UNEXPECTED_SQL');
 }
}
function admitted(name='Northstar Plus'){
 const host='northstar.example',url='https://northstar.example/plans',target=providerOrBrandResearchTarget({seedName:'Northstar',targetMarket:'DE'}),body=`<script type="application/ld+json">${JSON.stringify({'@context':'https://schema.org','@graph':[{'@type':'Organization',name:'Northstar',url},{'@type':'SoftwareApplication',name,description:'Consumer subscription service',offers:{'@type':'OfferCatalog',name:'Membership plans',itemListElement:[{'@type':'Offer',name:'Monthly membership',priceSpecification:{'@type':'UnitPriceSpecification',price:9.99,priceCurrency:'EUR',billingDuration:'P1M'}}]}}],subscriptionServiceCatalog:{scope:'PROVIDER_SUBSCRIPTION_SERVICES',coverage:'COMPLETE',serviceIds:[name.toLowerCase().replace(/[^a-z0-9]+/g,'-')]}})}</script>`,observation={id:'provider-source',kind:'PROVIDER',url,body,sha256:digest(body),outcome:'OK',truncated:false,completeness:'COMPLETE'},binding={contractVersion:1,researchTarget:target,host,providerIdentity:{presentationName:'Northstar'},proof:{observation:'authority-source',bodySha256:digest('authority'),url,host,scope:'EXACT_HOST_PROVIDER_SOURCING',reason:'STRUCTURED_EXACT_ORIGIN_IDENTITY'}};
 const discovery=discoverSubscriptionServices({researchTarget:target,providerAuthorityBinding:binding,observations:[observation],profile:'STRESS'});assert.equal(discovery.services.length,1);return {service:discovery.services[0],sourceBody:body,observation,researchTarget:target,providerAuthorityBinding:binding};
}

test('A/B/C: product reuse, deterministic creation and source-bound rehydration',async()=>{
 const productDb=new MemoryDb(),product=await admitDurableResearchIdentity(admitted('Strava'),{client:productDb});assert.equal(product.identity.serviceId,'strava');assert.equal(product.created,false);assert.equal(productDb.rows.length,0);
 const db=new MemoryDb(),input=admitted(),first=await admitDurableResearchIdentity(input,{client:db}),second=await admitDurableResearchIdentity(input,{client:db});assert.equal(first.created,true);assert.equal(second.created,false);assert.equal(second.identity.serviceId,first.identity.serviceId);assert.equal(db.rows.length,1);
 const restored=await rehydrateResearchIdentity(first.identity.serviceId,{client:db,researchTarget:input.researchTarget,providerAuthorityBinding:input.providerAuthorityBinding});assert.equal(restored.status,'RESEARCHABLE');assert.equal(restored.admission.status,'ADMITTED');
});

test('D/E: ambiguous exact identities and incompatible binding collisions fail closed',async()=>{
 const input=admitted(),base=await admitDurableResearchIdentity(input,{client:new MemoryDb()}),row={research_service_id:base.identity.serviceId,canonical_slug:'northstar-plus',canonical_name:'Northstar Plus',normalized_name:'northstar plus',identity_type:'SoftwareApplication',status:'RESEARCHABLE',provider_host:'northstar.example',provider_binding_digest:input.service.providerBinding.digest,provider_binding:input.service.providerBinding,provider_observation:input.service.provenance.providerObservation,source_url:input.service.provenance.sourceUrl,source_body_sha256:input.service.provenance.bodySha256,source_body:input.sourceBody,identity_locator:input.service.provenance.identity,subscription_locator:input.service.provenance.subscription,relationship:input.service.provenance.relationship,extraction_mechanism:input.service.provenance.extractionMechanism,admission_version:1,aliases:[],created_at:'2026-10-14',updated_at:'2026-10-14'};
 const ambiguous=await admitDurableResearchIdentity(input,{client:new MemoryDb([row,{...row,research_service_id:'research-other'}])});assert.equal(ambiguous.status,'AMBIGUOUS');
 const changed=structuredClone(input);changed.service.providerBinding.digest='f'.repeat(64);const collision=await admitDurableResearchIdentity(changed,{client:new MemoryDb([row])});assert.equal(collision.status,'UNRESOLVED');
 const incompatible=structuredClone(row);incompatible.provider_binding_digest='e'.repeat(64);const exactCollision=await admitDurableResearchIdentity(input,{client:new MemoryDb([incompatible])});assert.equal(exactCollision.status,'COLLISION');
});

test('F/G/H/I: seed text and missing authority grant no identity, price, market or Truth',async()=>{
 const input=admitted(),forged={...input,service:{serviceId:'seed-text',serviceName:'Arbitrary Seed'}};assert.equal((await admitDurableResearchIdentity(forged,{client:new MemoryDb()})).status,'UNRESOLVED');
 assert.throws(()=>discoverSubscriptionServices({researchTarget:input.researchTarget,providerAuthorityBinding:null,observations:[input.observation]}));
 const admittedIdentity=await admitDurableResearchIdentity(input,{client:new MemoryDb()});assert.equal(admittedIdentity.identity.status,'RESEARCHABLE');for(const field of ['price','market','verified','suggested','productionEligible'])assert.equal(Object.hasOwn(admittedIdentity.identity,field),false);
});

test('J/K/L/M: frozen 188 is unchanged and PRICE_RESEARCH admits only known or durable identity',async()=>{
 const manifest=JSON.parse(fs.readFileSync(new URL('../../../../docs/catalog/global-47/research-v2/v15-discovery-20260921/manifest.json',import.meta.url)));assert.equal(manifest.serviceIds.length,188);
 const known=await priceResearchPlan({objective:'PRICE_RESEARCH',targetKind:'KNOWN_SERVICE',serviceId:'strava',market:'DE',capabilities:caps},{repo:process.cwd(),root:'/tmp',client:new MemoryDb()});assert.equal(known.config.serviceId,'strava');
 const db=new MemoryDb(),created=await admitDurableResearchIdentity(admitted(),{client:db}),research=await priceResearchPlan({objective:'PRICE_RESEARCH',targetKind:'KNOWN_SERVICE',serviceId:created.identity.serviceId,market:'DE',capabilities:caps},{repo:process.cwd(),root:'/tmp',client:db});assert.equal(research.config.serviceId,created.identity.serviceId);
 await assert.rejects(priceResearchPlan({objective:'PRICE_RESEARCH',targetKind:'KNOWN_SERVICE',serviceId:'unknown',market:'DE',capabilities:caps},{repo:process.cwd(),root:'/tmp',client:db}),/UNKNOWN_PRICE_RESEARCH_IDENTITY/);
 const seed=await priceResearchPlan({objective:'PRICE_RESEARCH',targetKind:'PROVIDER_OR_BRAND_SEED',seedName:'Untrusted Brand',market:'DE',identityDiscoveryConsent:true,capabilities:caps},{repo:process.cwd(),root:'/tmp',client:db});assert.equal(seed.manifest.targets.length,0);assert.equal(seed.manifest.priceResearch.identity,null);
 assert.equal((await resolvePriceResearchIdentity('unknown',{client:db})).status,'UNRESOLVED');
});

test('safe research identity listing selects and returns reconciliation metadata without retained source bodies',async()=>{
 const input=admitted(),db=new MemoryDb(),created=await admitDurableResearchIdentity(input,{client:db});assert.equal(created.created,true);
 const rows=await listResearchServiceIdentities({client:db});assert.equal(rows.length,1);
 const query=db.queries.at(-1);assert.match(query,/SELECT\s+research_service_id,/);assert.doesNotMatch(query,/SELECT\s+\*/);assert.doesNotMatch(query,/\bsource_body\b/);assert.doesNotMatch(query,/\bprovider_binding\b/);assert.doesNotMatch(query,/\bidentity_locator\b|\bsubscription_locator\b/);
 assert.equal(rows[0].research_service_id,created.identity.serviceId);assert.equal(rows[0].source_body_sha256,input.service.provenance.bodySha256);
 for(const forbidden of ['source_body','provider_binding','identity_locator','subscription_locator'])assert.equal(Object.hasOwn(rows[0],forbidden),false);
});

test('canonical PRICE_RESEARCH resolution covers baseline, frozen and a unique reviewed alias without fuzzy matching',async()=>{
 const db=new MemoryDb();
 const baseline=await resolvePriceResearchIdentity('1password',{client:db});assert.equal(baseline.status,'RESEARCHABLE');assert.equal(baseline.identity.serviceId,'1password');
 const frozen=await resolvePriceResearchIdentity('chess-com',{client:db});assert.equal(frozen.status,'RESEARCHABLE');assert.equal(frozen.identity.serviceId,'chess-com');
 const alias=await resolvePriceResearchIdentity('disney plus',{client:db});assert.equal(alias.status,'RESEARCHABLE');assert.equal(alias.identity.serviceId,'disney-plus');
 const fuzzy=await resolvePriceResearchIdentity('1Password subscription',{client:db});assert.equal(fuzzy.status,'UNRESOLVED');
 const flo=await resolvePriceResearchIdentity('flo',{client:db});assert.equal(flo.status,'UNRESOLVED');
});

test('source-bound admission reuses baseline and frozen stable IDs before the database path',async()=>{
 for(const [name,serviceId] of [['1Password','1password'],['Chess.com','chess-com']]){
  const db=new MemoryDb(),result=await admitDurableResearchIdentity(admitted(name),{client:db});assert.equal(result.status,'RESEARCHABLE');assert.equal(result.created,false);assert.equal(result.identity.serviceId,serviceId);assert.equal(db.rows.length,0);
 }
});

test('new source-bound identities remain deterministic and DB status gates resolution and rehydration',async()=>{
 const input=admitted('Unseen Meridian'),db=new MemoryDb(),created=await admitDurableResearchIdentity(input,{client:db});assert.equal(created.created,true);assert.match(created.identity.serviceId,/^research-unseen-meridian-[a-f0-9]{12}$/);
 const repeated=await admitDurableResearchIdentity(input,{client:db});assert.equal(repeated.created,false);assert.equal(repeated.identity.serviceId,created.identity.serviceId);
 assert.equal((await resolvePriceResearchIdentity(created.identity.serviceId,{client:db})).status,'RESEARCHABLE');
 for(const status of ['AMBIGUOUS','DEACTIVATED']){
  const blocked=new MemoryDb([{...db.rows[0],status}]);assert.equal((await resolvePriceResearchIdentity(created.identity.serviceId,{client:blocked})).status,'UNRESOLVED');assert.equal((await rehydrateResearchIdentity(created.identity.serviceId,{client:blocked,researchTarget:input.researchTarget,providerAuthorityBinding:input.providerAuthorityBinding})).status,'UNRESOLVED');
  const admission=await admitDurableResearchIdentity(input,{client:blocked});assert.equal(admission.status,'UNRESOLVED');assert.equal(blocked.rows.length,1);
 }
});

test('multiple reviewed aliases fail closed and provider host or normalized name never merges identities',async()=>{
 const projection=projectResearchServices({baseline:[{service:'alpha-service',name:'Alpha',aliases:['Shared Alias']},{service:'beta-service',name:'Beta',aliases:['Shared Alias']}],frozen:[],manifestServiceIds:[],productCatalogRows:[]});
 const ambiguous=await resolvePriceResearchIdentity('Shared Alias',{client:new MemoryDb(),projection});assert.equal(ambiguous.status,'AMBIGUOUS');assert.deepEqual(ambiguous.matches,['alpha-service','beta-service']);
 const admissionDb=new MemoryDb(),admission=await admitDurableResearchIdentity(admitted('Shared Alias'),{client:admissionDb,projection});assert.equal(admission.status,'AMBIGUOUS');assert.equal(admissionDb.rows.length,0);
 const hostDb=new MemoryDb(),first=await admitDurableResearchIdentity(admitted('Host One'),{client:hostDb}),second=await admitDurableResearchIdentity(admitted('Host Two'),{client:hostDb});assert.equal(first.created,true);assert.equal(second.created,true);assert.notEqual(first.identity.serviceId,second.identity.serviceId);
 const floDb=new MemoryDb(),flo=await admitDurableResearchIdentity(admitted('FLO'),{client:floDb});assert.equal(flo.created,true);assert.match(flo.identity.serviceId,/^research-flo-/);assert.equal(floDb.rows.length,1);
});
