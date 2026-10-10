import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {digest} from '../../research-v3/model.mjs';
import {evaluateCountryProviderTruth,evaluateProviderSourceTruth,evaluateVerifiedCountryRun} from './provider-source-v3.mjs';
import {runOpenWebResearch} from './open-web-discovery.mjs';

const service='aurora',serviceName='Aurora',market='NO',host='provider.example',url=`https://${host}/membership`;
const authority={hostname:host,provider:serviceName,sourceType:'OFFICIAL_PROVIDER',sourceUrl:url,checkedAt:'2026-10-10T00:00:00.000Z'};
const target=(extra={})=>({id:'aurora-no',service,serviceName,market,researchObjective:'SERVICE_COVERAGE',smartResearch:{version:2},urls:[url],authorities:[authority],gaps:['market'],reads:[{requestedUrl:url,url,outcome:'OK',accessDecisions:[{decision:'ALLOWED'}]}],queries:[],decisions:[],capabilities:{direct:true,tavily:false,decodo:true,browser:false,groq:false},marketProof:{version:1,objectives:[{key:'basic',status:'MARKET_NOT_VERIFIED',identity:{plan:'Gold'}}]},...extra});
const product=(id='gold',extra={})=>({product:{id,name:'Gold',productType:'PRODUCT_TYPE_MEMBERSHIP',consumer:true,subscription:{length:1,unit:'months'}},totalAmount:{amount:'6399',currencyCode:'NOK'},taxAmount:{amount:'1600',currencyCode:'NOK'},totalAmountWithTaxes:{amount:'7999',currencyCode:'NOK'},incentive:{name:'BAU Trial',freeTime:{length:7,unit:'days'}},...extra});
const html=(products=[product()],serviceTitle=serviceName)=>`<html lang="nb-NO"><head><title>${serviceTitle}</title></head><body><script>window.catalog=${JSON.stringify({currenciesSubunit:{NOK:2,EUR:2,USD:2},offeredProducts:{months:products}})};</script></body></html>`;

function countryFixture(body=html(),{targetValue=target(),pageUrl=url}={}){
 const hash=digest(body),attemptId='geo-fixture-country',continuityRef='session-fixture',beforeHash='1'.repeat(64),afterHash='2'.repeat(64);
 const receipt=(receiptUrl,bodySha256)=>({url:receiptUrl,bodySha256,bindingRef:attemptId,bindingChanged:false,destinationMode:'PINNED_CONNECT',continuityRef});
 const attempt={id:attemptId,providerId:'decodo',method:'APPROVED_PROXY',mode:'SESSION',targetCountry:targetValue.market,bindingRef:attemptId,sessionRef:attemptId+'-session',requestedUrl:pageUrl,finalUrl:pageUrl,outcome:'OBSERVED',cleanup:'RELEASED',receipts:[receipt('https://exit.example/before',beforeHash),receipt(pageUrl,hash),receipt('https://exit.example/after',afterHash)],transportVerification:{version:2,level:'BRACKET_VERIFIED',providerId:'decodo',bindingRef:attemptId,targetCountry:targetValue.market,before:{status:'MATCH',country:targetValue.market},after:{status:'MATCH',country:targetValue.market},target:{finalUrl:pageUrl,outcome:'OK'},equality:true,continuity:'NO_OBSERVED_CHANGE',conflicts:[]},page:{url:pageUrl,requestedUrl:null,outcome:'OK',httpStatus:200,contentType:'text/html',targetCountry:targetValue.market,sourceIntegrity:{sha256:hash},rawSource:{text:body},accessDecisions:[{decision:'ALLOWED',reason:'NO_APPLICABLE_RESTRICTION',boundary:'SAFE_TO_EVALUATE',httpStatus:200,rule:null}],authority:{status:'CONFIGURED_REVIEWED',hostname:new URL(pageUrl).hostname,provider:targetValue.serviceName,sourceType:'OFFICIAL_PROVIDER',sourceUrl:pageUrl,checkedAt:'2026-10-10T00:00:00.000Z'}}};
 const sourceCheck={hash,status:'HASH_VERIFIED',receipt:{intact:true,bodyHash:hash,service:targetValue.service,serviceEstablished:true,bindingEstablished:true,sourceUrl:pageUrl,geo:{classification:'G1',reasons:[],targetCountry:targetValue.market,geoCountry:targetValue.market,bodyHash:hash,sourceUrl:pageUrl,attemptId,transport:{providerId:'decodo',method:'APPROVED_PROXY',mode:'SESSION',bindingRef:attemptId},receiptIndexes:{before:0,response:1,after:2},geoProofHashes:{before:beforeHash,after:afterHash}}}};
 return {target:targetValue,sourceCheck,attempt};
}
const evaluateCountry=(body=html(),options)=>{const fixture=countryFixture(body,options);return {...fixture,result:evaluateCountryProviderTruth(fixture)};};

test('country authoritative source reaches the shared V3 adapter and unchanged evaluate',()=>{
 const {result}=evaluateCountry();assert.equal(result.v3Observation.kind,'PROVIDER');assert.equal(result.v3Observation.context.transport,'DECODO');assert(result.v3Observation.candidateCount>0);assert.equal(result.v3Truth.prices.NO.propositions.PRICE_AMOUNT.value,79.99);
});

test('canonical country context lets existing Truth establish target market',()=>{
 const price=evaluateCountry().result.v3Truth.prices.NO;assert.equal(price.propositions.TARGET_MARKET.value,'NO');assert.equal(price.propositions.TARGET_MARKET.state,'ESTABLISHED');
});

test('complete consumer monthly offering becomes established through unchanged Truth',()=>{
 const {result}=evaluateCountry(),price=result.v3Truth.prices.NO;assert.equal(price.propositions.MONTHLY_SUBSCRIPTION.value,true);assert.equal(price.propositions.CONSUMER_SUBSCRIPTION.value,true);assert.equal(price.established,true);assert.equal(result.v3Truth.established,true);
});

test('fresh country source uses its own amount and currency instead of stale Direct facts',()=>{
 const oldBody=html([product('gold',{totalAmount:{amount:'799',currencyCode:'USD'},taxAmount:{amount:'200',currencyCode:'USD'},totalAmountWithTaxes:{amount:'999',currencyCode:'USD'}})]),oldHash=digest(oldBody),t=target();
 const direct=evaluateProviderSourceTruth({target:t,retained:{url,requestedUrl:url,httpStatus:200,contentType:'text/html',bodyHash:oldHash,sourceIntegrity:{sha256:oldHash},rawSource:{text:oldBody},accessDecisions:[{decision:'ALLOWED'}]},acquisition:{route:'DIRECT'},observationId:'old-direct'});
 const fresh=evaluateCountry(html([product('gold',{totalAmount:{amount:'559',currencyCode:'EUR'},taxAmount:{amount:'140',currencyCode:'EUR'},totalAmountWithTaxes:{amount:'699',currencyCode:'EUR'}})])).result;
 assert.equal(direct.v3Truth.prices.NO.propositions.PRICE_AMOUNT.value,9.99);assert.equal(direct.v3Truth.prices.NO.propositions.CURRENCY.value,'USD');assert.equal(fresh.v3Truth.prices.NO.propositions.PRICE_AMOUNT.value,6.99);assert.equal(fresh.v3Truth.prices.NO.propositions.CURRENCY.value,'EUR');assert.equal(JSON.stringify(fresh).includes('9.99'),false);
});

test('country source preserves monetary roles and chooses the ordinary gross payable amount',()=>{
 const price=evaluateCountry().result.v3Truth.prices.NO;assert.equal(price.propositions.PRICE_AMOUNT.value,79.99);assert.equal(price.propositions.PRICE_AMOUNT.contradictions.length,0);
});

test('trial metadata remains separate from the ordinary recurring country price',()=>{
 const price=evaluateCountry().result.v3Truth.prices.NO;assert.equal(price.propositions.PRICE_AMOUNT.value,79.99);assert.equal(price.propositions.PRICE_AMOUNT.evidence.some(row=>JSON.stringify(row).includes('BAU Trial')),false);
});

test('invalid or missing canonical receipt fails closed',()=>{
 for(const mutate of [f=>{f.sourceCheck.status='UNVERIFIED';},f=>{f.sourceCheck.receipt.intact=false;},f=>{delete f.sourceCheck.receipt.geo;}]){const fixture=countryFixture();mutate(fixture);assert.throws(()=>evaluateCountryProviderTruth(fixture),/COUNTRY_PROVIDER_RECEIPT_INVALID/);}
});

test('requested and verified country mismatch fails closed',()=>{
 const fixture=countryFixture();fixture.sourceCheck.receipt.geo.geoCountry='DE';assert.throws(()=>evaluateCountryProviderTruth(fixture),/COUNTRY_PROVIDER_RECEIPT_INVALID/);
});

test('country source hash mismatch fails closed',()=>{
 const fixture=countryFixture();fixture.sourceCheck.receipt.bodyHash='0'.repeat(64);assert.throws(()=>evaluateCountryProviderTruth(fixture),/COUNTRY_PROVIDER_HASH_MISMATCH/);
});

test('wrong exact host cannot create provider Truth',()=>{
 const pageUrl='https://other.example/membership',fixture=countryFixture(html(),{pageUrl});assert.throws(()=>evaluateCountryProviderTruth(fixture),/COUNTRY_PROVIDER_AUTHORITY_REQUIRED/);
});

test('Direct source remains country-unbound despite locale, currency and path',()=>{
 const body=html(),hash=digest(body),result=evaluateProviderSourceTruth({target:target(),retained:{url:'https://provider.example/no-NO/membership',requestedUrl:'https://provider.example/no-NO/membership',httpStatus:200,contentType:'text/html',bodyHash:hash,sourceIntegrity:{sha256:hash},rawSource:{text:body},accessDecisions:[{decision:'ALLOWED'}]},acquisition:{route:'DIRECT'},observationId:'direct-unbound'});
 assert.equal(result.v3Truth.prices.NO.propositions.TARGET_MARKET.state,'UNRESOLVED');
});

test('legacy zero rows and commercial insufficiency cannot veto country V3 evaluation',async t=>{
 const fixture=countryFixture(),records=[{type:'V2_ACQUISITION_RESULT',payload:{target:fixture.target,result:{attempts:[fixture.attempt]}}}],v3=evaluateVerifiedCountryRun({target:fixture.target,verification:{sourceChecks:[fixture.sourceCheck],verified:[],usable:true,classification:'COMMERCIAL_FIELDS_INSUFFICIENT',blockers:['CONFLICTING_MONTHLY_AMOUNTS']},records});
 assert.equal(v3.countryV3Evaluation.status,'EVALUATED');assert.equal(v3.v3Truth.established,true);
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'country-v3-controller-'));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
 const body=html(),hash=digest(body),direct=evaluateProviderSourceTruth({target:fixture.target,retained:{url,requestedUrl:url,httpStatus:200,contentType:'text/html',bodyHash:hash,sourceIntegrity:{sha256:hash},rawSource:{text:body},accessDecisions:[{decision:'ALLOWED'}]},acquisition:{route:'DIRECT'},observationId:'controller-direct'}),args={directory,targets:[fixture.target],search:async()=>assert.fail('search'),read:async()=>({url,requestedUrl:url,outcome:'OK',httpStatus:200,contentType:'text/html',rawSource:{text:body},sourceIntegrity:{sha256:hash},accessDecisions:[{decision:'ALLOWED'}],authority:{status:'CONFIGURED_REVIEWED',...authority}}),classify:async()=>({eligible:true,url,authority:{validated:true,hostname:host}}),consumeProvider:async()=>({...direct,classification:'COMMERCIAL_FIELDS_INSUFFICIENT',verified:[],blockers:['CONFLICTING_MONTHLY_AMOUNTS']}),acquire:async()=>({...v3,classification:'COMMERCIAL_FIELDS_INSUFFICIENT',verified:[],blockers:['CONFLICTING_MONTHLY_AMOUNTS']})};
 await runOpenWebResearch({...args,maxActions:1});const state=await runOpenWebResearch({...args,maxActions:1});
 const current=state.targets[0],country=current.providerInterpretations.at(-1);assert.equal(current.verified.length,0);assert.equal(current.v3Truth.established,true);assert.equal(current.marketProof,undefined);assert.equal(country.classification,'COMMERCIAL_FIELDS_INSUFFICIENT');assert.equal(country.v3Truth.established,true);assert.equal(country.countryV3Evaluation.status,'EVALUATED');
});

test('real unresolved propositions remain in existing Truth needs',()=>{
 const body=html([{product:{id:'unknown',name:'Unknown',productType:'PRODUCT_TYPE_MEMBERSHIP',consumer:true,subscription:{length:1,unit:'months'}}}]),truth=evaluateCountry(body).result.v3Truth;
 assert.equal(truth.established,false);assert(truth.needs.some(row=>row.proposition==='PRICE_AMOUNT'));
});

test('valid country receipt without sufficient provider offering evidence cannot establish price',()=>{
 const truth=evaluateCountry('<html><head><title>Aurora</title></head><body>Membership information</body></html>').result.v3Truth;
 assert.equal(truth.established,false);assert.equal(truth.prices.NO.propositions.PRICE_AMOUNT.state,'UNRESOLVED');
});
