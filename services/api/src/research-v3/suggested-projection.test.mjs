import test from 'node:test';
import assert from 'node:assert/strict';
import {authorityBinding} from './discovery-authority.mjs';
import {digest} from './model.mjs';
import {projectV3SuggestedCandidates,suggestedProjectionLimits} from './suggested-projection.mjs';

const url='https://provider.example/subscribe',objective={kind:'PRICE',serviceId:'orbit',serviceName:'Orbit',providerHosts:['provider.example'],markets:['DE'],seeds:[url]};
const html=data=>'<html><title>Orbit subscriptions</title><body><script id="__NEXT_DATA__" type="application/json">'+JSON.stringify(data)+'</script></body></html>';
function fixture(data,context={transport:'DECODO',networkGeography:'DE',representation:'PROVIDER_PAGE'}){
 const body=html(data),sha256=digest(body),observation={id:'source-'+sha256.slice(0,16),kind:'PROVIDER',url,context,outcome:'OK',truncated:false,completeness:'COMPLETE',format:'WEB',contentType:'text/html',httpStatus:200,access:[{decision:'ALLOWED'}],body,sha256};
 const reference={observation:observation.id,sha256,pointer:'/serviceId',source:{start:13,end:32,sha256:digest('Orbit subscriptions')}};
 const truth={established:false,service:{SERVICE_IDENTITY:{state:'ESTABLISHED',value:true,evidence:[{value:true,reference}],contradictions:[]}},offers:[]};
 return {observation,truth,providerAuthority:{status:'AUTHORITATIVE_PROVIDER',binding:authorityBinding(objective,url)}};
}

test('explicit inert monthly field projects a source-bound Suggested candidate without changing Truth',()=>{
 const data={options:[{currency:'EUR'}],planTypes:[{type:'Individual',yearly:{pricePerMonth:6.25,pricePerYear:74.99},monthly:{pricePerMonth:10.99,pricePerYear:131.88}}]},f=fixture(data),before=structuredClone(f.truth);
 const rows=projectV3SuggestedCandidates({...f,objective,targetMarket:'DE',acquiredAt:'2026-10-13T00:00:00.000Z'});
 assert.equal(rows.length,1);assert.equal(rows[0].amount,10.99);assert.equal(rows[0].currency,'EUR');assert.equal(rows[0].plan,'Individual');assert.equal(rows[0].provenance,'V3_SOURCE_RESEARCH');
 assert.equal(rows[0].researchEvidence.cadence,'MONTHLY_RECURRING');assert.equal(rows[0].researchEvidence.priceRole,'ORDINARY_RECURRING');assert.equal(rows[0].researchEvidence.marketAlignment,'EXACT');assert.equal(rows[0].billingRoute,null);
 assert.deepEqual(f.truth,before);assert.equal(rows.some(row=>row.amount===6.25||row.amount===74.99),false,'annual values never project as monthly recurring');
});

test('projection requires the existing exact authority binding and source-bound service identity',()=>{
 const f=fixture({options:[{currency:'EUR'}],planTypes:[{type:'Individual',monthly:{pricePerMonth:10.99}}]});
 assert.deepEqual(projectV3SuggestedCandidates({...f,providerAuthority:null,objective,targetMarket:'DE'}),[]);
 const body=f.observation.body.replace('Orbit subscriptions','Unrelated Company'),sha256=digest(body),withoutIdentity={...f.observation,id:'source-'+sha256.slice(0,16),body,sha256};
 assert.deepEqual(projectV3SuggestedCandidates({observation:withoutIdentity,truth:null,providerAuthority:f.providerAuthority,objective,targetMarket:'DE'}),[]);
 const other={...f.providerAuthority,binding:{kind:'REVIEWED_HOST',host:'other.example'}};
 assert.deepEqual(projectV3SuggestedCandidates({...f,providerAuthority:other,objective,targetMarket:'DE'}),[]);
});

test('foreign country observation remains a mismatch instead of becoming target-market evidence',()=>{
 const f=fixture({currency:'EUR',plans:[{name:'Individual',monthly:{pricePerMonth:9.99}}]},{transport:'DECODO',networkGeography:'NO',representation:'PROVIDER_PAGE'});
 const [row]=projectV3SuggestedCandidates({...f,objective,targetMarket:'DE'});
 assert.equal(row.market,'NO');assert.equal(row.researchEvidence.marketAlignment,'MISMATCH');assert(row.warnings.includes('MARKET_MISMATCH'));
});

test('ambiguous currency, annual-only, discounted/trial and unsafe monthly records do not emit',()=>{
 for(const data of [
  {options:[{currency:'EUR'},{currency:'USD'}],plans:[{name:'Individual',monthly:{pricePerMonth:9.99}}]},
  {currency:'EUR',plans:[{name:'Individual',yearly:{pricePerMonth:9.99}}]},
  {currency:'EUR',plans:[{name:'Trial',monthly:{pricePerMonth:1}}]},
  {currency:'EUR',plans:[{name:'Individual',monthly:{pricePerMonth:9.99,billedYearly:true}}]}
 ]){const f=fixture(data);assert.deepEqual(projectV3SuggestedCandidates({...f,objective,targetMarket:'DE'}),[]);}
});

test('inert JSON scan is explicitly bounded',()=>{
 assert.deepEqual(suggestedProjectionLimits,{scripts:32,scriptBytes:1_000_000,nodes:20_000,depth:32,candidates:64});
});

test('exact research lineage attaches an origin without changing Truth or accepting a wrong locator',()=>{
 const data={options:[{currency:'EUR'}],planTypes:[{type:'Individual',monthly:{pricePerMonth:10.99}}]},f=fixture(data),before=structuredClone(f.truth),[baseline]=projectV3SuggestedCandidates({...f,objective,targetMarket:'DE'}),binding={originSuggestedId:'v4:individual',observationId:f.observation.id,sourceHash:f.observation.sha256,sourceLocator:baseline.sourceLocator,basis:'EXACT_SOURCE_HASH_AND_LOCATOR_OVERLAP'};
 const [linked]=projectV3SuggestedCandidates({...f,objective,targetMarket:'DE',researchLineage:[binding]});
 assert.equal(linked.originSuggestedId,'v4:individual');assert.equal(linked.researchEvidence.lineage.truthAuthority,'NONE');assert.deepEqual(f.truth,before);
 const [unlinked]=projectV3SuggestedCandidates({...f,objective,targetMarket:'DE',researchLineage:[{...binding,sourceLocator:{kind:'OTHER'}}]});
 assert.equal(unlinked.originSuggestedId,undefined);
});
