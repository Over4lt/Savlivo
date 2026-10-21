import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {projectEstablishedV3Offerings,projectTargetV3Result,projectV3VerificationEvidence} from './v3-result-projection.mjs';
import {writeLifecycleDisposition} from './lifecycle-continuation.mjs';
import {acceptV3TruthNeeds} from '../live/market-proof-continuation.mjs';
import {digest} from '../../research-v3/model.mjs';
import {v3ResultFromTarget} from '../../google-ai/admin-live-pipeline.mjs';

const hash='a'.repeat(64),url='https://provider.example/membership',observationId='provider-observation';
const reference=(pointer,transport='DECODO')=>({observation:observationId,sha256:hash,pointer,source:{start:10,end:20,sha256:'b'.repeat(64),structuralPath:'/catalog/months/'+pointer.split('/').at(-1),parentPath:'/catalog/months',observation:observationId,sourceHash:hash,nativeStructured:true,admitted:true},...(transport==='DECODO'?{marketContext:{basis:'VERIFIED_COUNTRY_OBSERVATION',country:'NO',verification:'BRACKET_VERIFIED'}}:{})});
const proposition=(state,value,pointer,transport)=>({state,value,evidence:state==='ESTABLISHED'?[{value,reference:reference(pointer,transport)}]:[],contradictions:state==='CONTRADICTED'?[{value,reference:reference(pointer,transport)}]:[]});
function offer(id,amount,{transport='DECODO',currency='NOK',currencyState='ESTABLISHED',amountState='ESTABLISHED'}={}){
 const pointer='/offers/'+({gold:0,platinum:1,diamond:2}[id]??0);
 return {id,market:'NO',conditions:null,propositions:{
  SERVICE_IDENTITY:proposition('ESTABLISHED',true,'/serviceId',transport),PRICE_AMOUNT:proposition(amountState,amount,pointer,transport),CURRENCY:proposition(currencyState,currency,pointer,transport),MONTHLY_CADENCE:proposition('UNRESOLVED',null,pointer,transport),MONTHLY_SUBSCRIPTION:proposition('ESTABLISHED',true,pointer,transport),CONSUMER_SUBSCRIPTION:proposition('ESTABLISHED',true,pointer,transport),TARGET_MARKET:proposition('ESTABLISHED','NO',pointer,transport)
 }};
}
function withExactOfferIdentity(row,name,{disagreeingProposition=null}={}){
 for(const [propositionName,propositionValue]of Object.entries(row.propositions))for(const evidence of propositionValue.evidence??[]){if(propositionName==='SERVICE_IDENTITY')continue;const current=propositionName===disagreeingProposition?'Different Plan':name;evidence.reference.source={...evidence.reference.source,start:0,end:100,sha256:digest('test'),nativePageStructure:true,offer:current,offerIdentity:{kind:'SPAN',start:30,end:30+current.length,quote:current,sha256:digest(current)}};}
 return row;
}
function truth(offers=[offer('gold',79.99),offer('platinum',129.99),offer('diamond',199.99)]){
 return {eligibility:{NO:{state:'MONTHLY_SUBSCRIPTION_ESTABLISHED',result:'ELIGIBLE',evidence:[{value:true,reference:reference('/offers/0')}],conflicting:false}},ineligibleMarkets:[],resolved:true,service:{SERVICE_IDENTITY:{state:'ESTABLISHED'},SERVICE_SIZE_100K_PLUS:{state:'UNRESOLVED'},CONSUMER_MONTHLY_SUBSCRIPTION_EXISTS:{state:'ESTABLISHED'},ACCOUNT_LOGIN_EXISTS:{state:'UNRESOLVED'},MEMBERSHIP_MANAGEMENT_EXISTS:{state:'UNRESOLVED'}},accountAccess:{},offers,prices:{NO:{...offers[0],established:true}},needs:[],established:true,admitted:false};
}
const catalog={objective:'DISCOVER_COMPLETE_RELEVANT_SUBSCRIPTION_CATALOG',state:'CATALOG_UNRESOLVED',offeringState:'OFFERING_FOUND',scope:'UNRESOLVED',scopeEvidence:[],offerings:[{id:'gold'}],pending:false,limited:false};
function target(extra={}){return {id:'fixture-price-NO',service:'fixture',serviceName:'Fixture',market:'NO',researchObjective:'SERVICE_COVERAGE',verified:[],researchDiagnosis:'CURRENCY_UNRESOLVED',productionEligible:false,pricingExposure:'RESEARCH_HYPOTHESIS_ONLY',v3Truth:truth(),v3Catalog:structuredClone(catalog),v3Observation:{id:observationId,kind:'PROVIDER',url,sha256:hash,context:{transport:'DECODO',networkGeography:'NO',representation:'PROVIDER_PAGE'}},providerInterpretations:[{v3Observation:{id:'direct-observation',context:{transport:'DIRECT'}}}],...extra};}

test('pure projection preserves every independently established offer and source provenance',()=>{
 const current=target(),before=structuredClone(current),rows=projectEstablishedV3Offerings(current);
 assert.deepEqual(rows.map(row=>row.id),['gold','platinum','diamond']);assert(rows.every(row=>row.established&&row.eligibility.result==='ELIGIBLE'));assert.deepEqual(rows.map(row=>row.ordinaryRecurringPrice.amount),[79.99,129.99,199.99]);
 assert(rows.every(row=>row.source.observationId===observationId&&row.source.bodyHash===hash&&row.source.url===url));assert(rows.every(row=>row.sourceReferences.length>0&&row.sourceReferences.every(ref=>ref.sha256===hash)));assert(rows.every(row=>row.countryContext.country==='NO'&&row.source.context.transport==='DECODO'));assert.deepEqual(current,before,'projection must be pure');
});

test('exact source-bound offer identity survives established V3 projection',()=>{
 const rows=projectEstablishedV3Offerings(target({v3Truth:truth([withExactOfferIdentity(offer('core',4.99),'Core'),withExactOfferIdentity(offer('pro',17.99),'Pro')])}));
 assert.deepEqual(rows.map(row=>[row.name,row.offerIdentity.name,row.offerIdentity.locator.quote]),[['Core','Core','Core'],['Pro','Pro','Pro']]);
});

test('source-bound offer name wins over internal hash and hash never becomes display fallback',()=>{
 const internal='f'.repeat(64),bound=withExactOfferIdentity({...offer(internal,89),name:internal},'Basis med reklame');
 const current=target({v3Truth:truth([bound])});
 assert.equal(projectEstablishedV3Offerings(current)[0].name,'Basis med reklame');
 assert.deepEqual(projectV3VerificationEvidence(current).map(row=>[row.plan,row.exactOfferId,row.offerIdentityName]),
  [['Basis med reklame',internal,'Basis med reklame']]);
 const unbound=target({v3Truth:truth([offer(internal,89)])});
 assert.equal(projectV3VerificationEvidence(unbound)[0].plan,null);
 assert.deepEqual(v3ResultFromTarget(current).verified.map(row=>row.plan),['Basis med reklame']);
 assert.equal(v3ResultFromTarget(unbound).verified.length,0);
 assert.equal(v3ResultFromTarget({...current,market:'SE'}).verified.length,0);
});

test('JSON-quoted source name decodes only with matching nested source bytes and hash',()=>{
 const name='Basis med reklame',raw=JSON.stringify(name),body='x'.repeat(30)+raw+'x'.repeat(20);
 const row=withExactOfferIdentity(offer('f'.repeat(64),89),name);
 for(const value of Object.values(row.propositions))for(const evidence of value.evidence??[]){
  evidence.reference.sha256=digest(body);
  if(!evidence.reference.source?.offerIdentity)continue;
  evidence.reference.source.start=0;evidence.reference.source.end=body.length;
  evidence.reference.source.sha256=digest(body);
  evidence.reference.source.offerIdentity={kind:'SPAN',start:30,end:30+raw.length,quote:raw,sha256:digest(raw)};
 }
 const current=target({v3Truth:truth([row]),v3Observation:{...target().v3Observation,sha256:digest(body),body}});
 assert.equal(projectV3VerificationEvidence(current)[0].offerIdentityName,name);
 assert.equal(v3ResultFromTarget(current).verified[0].plan,name);
 current.v3Observation.body=body.replace('Basis','basIs');
 assert.equal(projectV3VerificationEvidence(current)[0].offerIdentityName,null);
 assert.equal(v3ResultFromTarget(current).verified.length,0);
});

test('absent or disagreeing exact offer identity remains unlinked',()=>{
 const absent=projectEstablishedV3Offerings(target({v3Truth:truth([offer('core',4.99)])}))[0],disagreeing=projectEstablishedV3Offerings(target({v3Truth:truth([withExactOfferIdentity(offer('pro',17.99),'Pro',{disagreeingProposition:'CURRENCY'})])}))[0];
 assert.equal(absent.name,null);assert.equal(absent.offerIdentity,undefined);assert.equal(disagreeing.name,null);assert.equal(disagreeing.offerIdentity,undefined);
});

test('offering projection is independent of catalog, admission, exposure, admitted and budget termination',()=>{
 const current=target({termination:{kind:'BUDGET_LIMITED',reason:'BUDGET_EXHAUSTED'}}),projection=projectTargetV3Result(current);
 assert.equal(projection.offerings.length,3);assert.equal(projection.catalog.state,'CATALOG_UNRESOLVED');assert.equal(projection.catalog.scope,'UNRESOLVED');assert.equal(current.productionEligible,false);assert.equal(current.pricingExposure,'RESEARCH_HYPOTHESIS_ONLY');assert.equal(current.v3Truth.admitted,false);assert.deepEqual(current.termination,{kind:'BUDGET_LIMITED',reason:'BUDGET_EXHAUSTED'});
});

test('legacy currency diagnosis remains visible but cannot govern established V3 currency',()=>{
 const projection=projectTargetV3Result(target());assert.equal(projection.offerings[0].ordinaryRecurringPrice.currency,'NOK');assert.deepEqual(projection.legacyDiagnostics,[{kind:'RESEARCH_DIAGNOSIS',value:'CURRENCY_UNRESOLVED',source:'LEGACY_V2',phase:'DIRECT',sourceObservationId:'direct-observation',governsV3Offerings:false}]);
});

test('unresolved or contradicted required propositions never project as established',()=>{
 assert.equal(projectEstablishedV3Offerings(target({v3Truth:truth([offer('partial',9,{currencyState:'UNRESOLVED'})])})).length,0);assert.equal(projectEstablishedV3Offerings(target({v3Truth:truth([offer('conflict',9,{amountState:'CONTRADICTED'})])})).length,0);assert.equal(projectEstablishedV3Offerings({}).length,0);
});

test('Direct and country Truth use the same offering projector while retaining transport provenance',()=>{
 const country=projectEstablishedV3Offerings(target())[0],directTarget=target({v3Truth:truth([offer('gold',79.99,{transport:'DIRECT'})]),v3Observation:{id:observationId,kind:'PROVIDER',url,sha256:hash,context:{transport:'DIRECT',networkGeography:'UNBOUND',representation:'PROVIDER_PAGE'}}}),direct=projectEstablishedV3Offerings(directTarget)[0];
 assert.deepEqual(direct.ordinaryRecurringPrice,country.ordinaryRecurringPrice);assert.deepEqual(direct.propositionStates,country.propositionStates);assert.equal(direct.source.context.transport,'DIRECT');assert.equal(direct.countryContext,null);assert.equal(country.source.context.transport,'DECODO');
});

test('verification evidence preserves persisted URL, source context, Truth market and proposition states without locale inference',()=>{
 const current=target({serviceName:'Chess.com'});current.market='SE';current.v3Observation={...current.v3Observation,url:'https://www.chess.com/fr/membership',authority:'REVIEWED_PROVIDER',acquiredAt:'2026-10-15T12:00:00.000Z',context:{transport:'DECODO',networkGeography:'SE',representation:'PROVIDER_PAGE'}};current.v3Truth.eligibility.SE=current.v3Truth.eligibility.NO;delete current.v3Truth.eligibility.NO;
 for(const row of current.v3Truth.offers){row.market='SE';row.propositions.TARGET_MARKET.value='SE';for(const proposition of Object.values(row.propositions))for(const evidence of proposition.evidence??[]){if(evidence.reference.marketContext)evidence.reference.marketContext.country='SE';}}
 const evidence=projectV3VerificationEvidence(current)[0];assert.equal(evidence.provider,'Chess.com');assert.equal(evidence.targetMarket,'SE');assert.equal(evidence.sourceUrl,'https://www.chess.com/fr/membership');assert.equal(evidence.transport,'DECODO');assert.equal(evidence.networkGeography,'SE');assert.equal(evidence.truthMarket,'SE');assert.equal(evidence.eligibility,'ELIGIBLE');assert.equal(evidence.sourceAuthority,'REVIEWED_PROVIDER');assert.equal(evidence.observationId,observationId);assert.equal(evidence.bodySha256,hash);assert.equal(evidence.verifiedAt,'2026-10-15T12:00:00.000Z');assert.equal(evidence.verifiedByAgreement,false);assert.deepEqual(evidence.propositionStates,{SERVICE_IDENTITY:'ESTABLISHED',PRICE_AMOUNT:'ESTABLISHED',CURRENCY:'ESTABLISHED',MONTHLY_SUBSCRIPTION:'ESTABLISHED',CONSUMER_SUBSCRIPTION:'ESTABLISHED',TARGET_MARKET:'ESTABLISHED',MONTHLY_CADENCE:'UNRESOLVED'});
});

test('verification evidence degrades safely when optional observation context is missing',()=>{
 const current=target();delete current.v3Observation.context;delete current.v3Observation.authority;const evidence=projectV3VerificationEvidence(current)[0];assert.equal(evidence.transport,null);assert.equal(evidence.networkGeography,null);assert.equal(evidence.sourceAuthority,null);assert.equal(evidence.truthMarket,'NO');
});

test('acceptance persists existing catalog beside Truth without changing needs',()=>{
 const current={market:'NO'},value=truth(),outcome={v3Truth:value,v3Observation:target().v3Observation,v3Catalog:catalog};assert.equal(acceptV3TruthNeeds(current,outcome),true);assert.deepEqual(current.v3Truth.needs,[]);assert.deepEqual(current.v3Catalog,catalog);assert.notEqual(current.v3Catalog,catalog);
});

test('mature lifecycle exposes V3 offerings while preserving legacy, admission, catalog and termination dimensions',t=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'v3-lifecycle-projection-'));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));const current=target(),stop={kind:'BUDGET_LIMITED',reason:'BUDGET_EXHAUSTED'};
 const row=writeLifecycleDisposition({directory,handoff:{cohort:{manifest:{serviceIds:['fixture']}},targets:[current]},phases:{pricing:{targets:{[current.id]:current},services:{fixture:{stop}}}},events:[],bootstrap:[],researchMarkets:{fixture:['NO']},executionComplete:true})[0];
 assert.deepEqual(row.v3Offerings.map(offering=>offering.id),['gold','platinum','diamond']);assert(row.v3Offerings.every(offering=>offering.established));assert.equal(row.v3Catalogs[0].catalog.state,'CATALOG_UNRESOLVED');assert.equal(row.v3Catalogs[0].catalog.scope,'UNRESOLVED');assert.deepEqual(row.termination,stop);assert.equal(row.productionEligible,false);assert.equal(row.pricing[0].exposure,'RESEARCH_HYPOTHESIS_ONLY');assert.equal(row.pricing[0].status,'UNRESOLVED','legacy V2 pricing stays available and unchanged');assert.equal(row.legacyDiagnostics[0].value,'CURRENCY_UNRESOLVED');assert.equal(row.legacyDiagnostics[0].governsV3Offerings,false);assert.equal(row.providerAuthority.status,'HUMAN_REVIEW_REQUIRED');assert.equal(row.finalStatus,'HUMAN_REVIEW_REQUIRED');
});

test('legacy-only lifecycle remains unresolved and does not manufacture provider authority',t=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'legacy-lifecycle-projection-'));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));const current={id:'fixture-price-NO',service:'fixture',market:'NO',researchObjective:'SERVICE_COVERAGE',verified:[]};
 const row=writeLifecycleDisposition({directory,handoff:{cohort:{manifest:{serviceIds:['fixture']}},targets:[current]},phases:{pricing:{targets:{[current.id]:current},services:{}}},events:[],bootstrap:[],researchMarkets:{fixture:['NO']},executionComplete:true})[0];
 assert.equal(row.pricing[0].status,'UNRESOLVED');assert.equal(row.providerAuthority.status,'HUMAN_REVIEW_REQUIRED');assert.equal(row.servicePresence.status,'INCLUDED_IN_HANDOFF');assert.equal(row.finalStatus,'HUMAN_REVIEW_REQUIRED');for(const field of ['v3Offerings','v3Catalogs','legacyDiagnostics','termination'])assert.equal(Object.hasOwn(row,field),false);
});
