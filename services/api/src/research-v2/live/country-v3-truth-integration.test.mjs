import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {digest} from '../../research-v3/model.mjs';
import {evaluateCountryProviderTruth,evaluateProviderSourceTruth,evaluateVerifiedCountryRun} from './provider-source-v3.mjs';
import {projectEstablishedV3Offerings} from '../inventory/v3-result-projection.mjs';
import {runOpenWebResearch} from './open-web-discovery.mjs';

const service='aurora',serviceName='Aurora',market='NO',host='provider.example',url=`https://${host}/membership`;
const authority={hostname:host,provider:serviceName,sourceType:'OFFICIAL_PROVIDER',sourceUrl:url,checkedAt:'2026-10-10T00:00:00.000Z'};
const target=(extra={})=>({id:'aurora-no',service,serviceName,market,researchObjective:'SERVICE_COVERAGE',smartResearch:{version:2},urls:[url],authorities:[authority],gaps:['market'],reads:[{requestedUrl:url,url,outcome:'OK',accessDecisions:[{decision:'ALLOWED'}]}],queries:[],decisions:[],capabilities:{direct:true,tavily:false,decodo:true,browser:false,groq:false},marketProof:{version:1,objectives:[{key:'basic',status:'MARKET_NOT_VERIFIED',identity:{plan:'Gold'}}]},...extra});
const product=(id='gold',extra={})=>({product:{id,name:'Gold',productType:'PRODUCT_TYPE_MEMBERSHIP',consumer:true,subscription:{length:1,unit:'months'}},totalAmount:{amount:'6399',currencyCode:'NOK'},taxAmount:{amount:'1600',currencyCode:'NOK'},totalAmountWithTaxes:{amount:'7999',currencyCode:'NOK'},incentive:{name:'BAU Trial',freeTime:{length:7,unit:'days'}},...extra});
const html=(products=[product()],serviceTitle=serviceName)=>`<html lang="nb-NO"><head><title>${serviceTitle}</title></head><body><script>window.catalog=${JSON.stringify({currenciesSubunit:{NOK:2,EUR:2,USD:2},offeredProducts:{months:products}})};</script></body></html>`;
const listedPricing=(rows='Basic: NOK 119 / month|Standard: NOK 149 / month|Premium: NOK 219 / month')=>`<html><head><title>Plans and Pricing | Aurora Help Center</title><meta name="description" content="Discover the different streaming plans Aurora offers and how much Aurora costs."></head><body><main><h1>Plans and Pricing</h1><p>Aurora plans are billed monthly on the signup date. We do not offer annual membership plans.</p><h3>Pricing (Norwegian Krone)</h3><ul>${rows.split('|').map(row=>`<li><p><span>${row}</span></p>${row.startsWith('Standard')?'<ul><li>Add an extra member for NOK 49 / month</li></ul>':''}</li>`).join('')}</ul></main></body></html>`;

function countryFixture(body=html(),{targetValue=target(),pageUrl=url}={}){
 const hash=digest(body),attemptId='geo-fixture-country',continuityRef='session-fixture',beforeHash='1'.repeat(64),afterHash='2'.repeat(64);
 const receipt=(receiptUrl,bodySha256)=>({url:receiptUrl,bodySha256,bindingRef:attemptId,bindingChanged:false,destinationMode:'PINNED_CONNECT',continuityRef});
 const attempt={id:attemptId,providerId:'decodo',method:'APPROVED_PROXY',mode:'SESSION',targetCountry:targetValue.market,bindingRef:attemptId,sessionRef:attemptId+'-session',requestedUrl:pageUrl,finalUrl:pageUrl,outcome:'OBSERVED',cleanup:'RELEASED',receipts:[receipt('https://exit.example/before',beforeHash),receipt(pageUrl,hash),receipt('https://exit.example/after',afterHash)],transportVerification:{version:2,level:'BRACKET_VERIFIED',providerId:'decodo',bindingRef:attemptId,targetCountry:targetValue.market,before:{status:'MATCH',country:targetValue.market},after:{status:'MATCH',country:targetValue.market},target:{finalUrl:pageUrl,outcome:'OK'},equality:true,continuity:'NO_OBSERVED_CHANGE',conflicts:[]},page:{url:pageUrl,requestedUrl:null,outcome:'OK',httpStatus:200,contentType:'text/html',targetCountry:targetValue.market,sourceIntegrity:{sha256:hash},rawSource:{text:body},accessDecisions:[{decision:'ALLOWED',reason:'NO_APPLICABLE_RESTRICTION',boundary:'SAFE_TO_EVALUATE',httpStatus:200,rule:null}],authority:{status:'CONFIGURED_REVIEWED',hostname:new URL(pageUrl).hostname,provider:targetValue.serviceName,sourceType:'OFFICIAL_PROVIDER',sourceUrl:pageUrl,checkedAt:'2026-10-10T00:00:00.000Z'}}};
 const sourceCheck={hash,status:'HASH_VERIFIED',receipt:{intact:true,bodyHash:hash,service:targetValue.service,serviceEstablished:true,bindingEstablished:true,sourceUrl:pageUrl,geo:{classification:'G1',reasons:[],targetCountry:targetValue.market,geoCountry:targetValue.market,bodyHash:hash,sourceUrl:pageUrl,attemptId,transport:{providerId:'decodo',method:'APPROVED_PROXY',mode:'SESSION',bindingRef:attemptId},receiptIndexes:{before:0,response:1,after:2},geoProofHashes:{before:beforeHash,after:afterHash}}}};
 return {target:targetValue,sourceCheck,attempt};
}
const evaluateCountry=(body=html(),options)=>{const fixture=countryFixture(body,options);return {...fixture,result:evaluateCountryProviderTruth(fixture)};};

test('country authoritative source reaches the shared V3 adapter and unchanged evaluate',()=>{
 const {result}=evaluateCountry();assert.equal(result.v3Observation.kind,'PROVIDER');assert.equal(result.v3Observation.context.transport,'DECODO');assert(result.v3Observation.candidateCount>0);assert.equal(result.v3Truth.prices.NO.propositions.PRICE_AMOUNT.value,79.99);assert.equal(result.v3Catalog.offeringState,'OFFERING_FOUND');assert.equal(result.v3Catalog.state,'CATALOG_UNRESOLVED');assert.equal(result.v3Catalog.scope,'UNRESOLVED');
 assert.equal(result.v3SuggestedCandidates[0]?.researchEvidence.exactOfferId,'gold');
});

test('canonical country context lets existing Truth establish target market',()=>{
 const price=evaluateCountry().result.v3Truth.prices.NO;assert.equal(price.propositions.TARGET_MARKET.value,'NO');assert.equal(price.propositions.TARGET_MARKET.state,'ESTABLISHED');
});

test('complete consumer monthly offering becomes established through unchanged Truth',()=>{
 const {result}=evaluateCountry(),price=result.v3Truth.prices.NO;assert.equal(price.propositions.MONTHLY_SUBSCRIPTION.value,true);assert.equal(price.propositions.CONSUMER_SUBSCRIPTION.value,true);assert.equal(price.established,true);assert.equal(result.v3Truth.established,true);
});

test('family-classified final provider source can reach unchanged V3 truth with a canonical country receipt',()=>{
 const pageUrl='https://help.example.com/membership',targetValue=target({providerSourceIdentityHosts:['example.com'],authorities:[]}),body=html().replace('<title>Aurora</title>','<title>Help and pricing</title><h1>Aurora monthly membership</h1>'),fixture=countryFixture(body,{targetValue,pageUrl}),result=evaluateCountryProviderTruth(fixture);
 assert.equal(result.v3Truth.established,true);assert.equal(result.v3Truth.prices.NO.propositions.PRICE_AMOUNT.value,79.99);
 assert.equal(result.v3Truth.prices.NO.propositions.CURRENCY.value,'NOK');assert.equal(result.v3Truth.prices.NO.propositions.TARGET_MARKET.state,'ESTABLISHED');
});

test('country-bound provider help price list establishes separate monthly plans without add-ons',()=>{
 const pageUrl='https://help.example.com/en/plans',targetValue=target({providerSourceIdentityHosts:['example.com'],authorities:[]}),fixture=countryFixture(listedPricing(),{targetValue,pageUrl}),result=evaluateCountryProviderTruth(fixture),established=projectEstablishedV3Offerings({...targetValue,...result});
 assert.deepEqual(established.map(row=>[row.name,row.ordinaryRecurringPrice.amount,row.ordinaryRecurringPrice.currency]),[['Basic',119,'NOK'],['Standard',149,'NOK'],['Premium',219,'NOK']]);
 assert.deepEqual(new Set(result.v3SuggestedCandidates.map(row=>row.researchEvidence.exactOfferId)),new Set(established.map(row=>row.id)));
 assert(established.every(row=>row.propositionStates.TARGET_MARKET==='ESTABLISHED'&&row.propositionStates.MONTHLY_SUBSCRIPTION==='ESTABLISHED'&&row.propositionStates.MONTHLY_CADENCE==='ESTABLISHED'));
});

test('country-bound Euro price list with symbol suffix establishes its own plans',()=>{
 const pageUrl='https://help.example.com/en/plans',targetValue=target({market:'DE',providerSourceIdentityHosts:['example.com'],authorities:[]}),body=listedPricing('Standard with ads: 6.99€ / month|Standard: 15.99€ / month|Premium: 21.99€ / month').replace('Pricing (Norwegian Krone)','Pricing (Euro)'),result=evaluateCountryProviderTruth(countryFixture(body,{targetValue,pageUrl}));
 assert.deepEqual(projectEstablishedV3Offerings({...targetValue,...result}).map(row=>[row.name,row.ordinaryRecurringPrice.amount,row.ordinaryRecurringPrice.currency]),[['Standard with ads',6.99,'EUR'],['Standard',15.99,'EUR'],['Premium',21.99,'EUR']]);
});

test('country-bound dollar and Euro price lists with the same provider page shape establish three plans',()=>{
 const pageUrl='https://help.example.com/en/plans';
 for(const [market,heading,prices,currency] of [['US','US Dollar',['$8.99','$19.99','$26.99'],'USD'],['ES','Euro',['8.99€','14.99€','21.99€'],'EUR']]){
  const targetValue=target({market,providerSourceIdentityHosts:['example.com'],authorities:[]}),body=listedPricing(`Standard with ads: ${prices[0]} / month|Standard: ${prices[1]} / month|Premium: ${prices[2]} / month`).replace('Pricing (Norwegian Krone)',`Pricing (${heading})`),result=evaluateCountryProviderTruth(countryFixture(body,{targetValue,pageUrl})),established=projectEstablishedV3Offerings({...targetValue,...result});
  assert.deepEqual(established.map(row=>[row.name,row.ordinaryRecurringPrice.currency]),[['Standard with ads',currency],['Standard',currency],['Premium',currency]]);assert.equal(result.v3Truth.established,true);
 }
});

test('ambiguous dollar sign without an explicit currency heading cannot become a price',()=>{
 const pageUrl='https://help.example.com/en/plans',targetValue=target({market:'US',providerSourceIdentityHosts:['example.com'],authorities:[]}),body=listedPricing('Standard with ads: $8.99 / month|Standard: $19.99 / month|Premium: $26.99 / month').replace('Pricing (Norwegian Krone)','Pricing'),result=evaluateCountryProviderTruth(countryFixture(body,{targetValue,pageUrl}));
 assert.equal(projectEstablishedV3Offerings({...targetValue,...result}).length,0);
});

test('provider URL locale never establishes target market for an unbound Direct price list',()=>{
 const body=listedPricing(),hash=digest(body);
 for(const locale of ['en','nl','no']){
  const sourceUrl=`https://help.example.com/${locale}/plans`,result=evaluateProviderSourceTruth({target:target({providerSourceIdentityHosts:['example.com'],authorities:[]}),retained:{url:sourceUrl,requestedUrl:sourceUrl,httpStatus:200,contentType:'text/html',bodyHash:hash,sourceIntegrity:{sha256:hash},rawSource:{text:body},accessDecisions:[{decision:'ALLOWED'}]},acquisition:{route:'DIRECT'},observationId:'direct-'+locale});
  assert.equal(projectEstablishedV3Offerings({...target(),...result}).length,0,locale);
  assert.equal(result.v3Truth.prices.NO.propositions.TARGET_MARKET.state,'UNRESOLVED',locale);
 }
});

test('a monthly display billed yearly and a country mismatch cannot become country Verified',()=>{
 const annual=listedPricing().replace('Aurora plans are billed monthly','Aurora plans are billed yearly'),annualResult=evaluateCountry(annual).result;
 assert.equal(projectEstablishedV3Offerings({...target(),...annualResult}).length,0);
 const usOnly=listedPricing().replace('Pricing (Norwegian Krone)','Pricing for customers in the United States').replaceAll('NOK','USD'),other=evaluateCountry(usOnly).result;
 assert.equal(projectEstablishedV3Offerings({...target(),...other}).length,0);
});

test('annual prepaid country acquisition does not become monthly recurring',()=>{
 const annual=product('annual',{product:{id:'annual',name:'Annual',productType:'PRODUCT_TYPE_MEMBERSHIP',consumer:true,subscription:{length:1,unit:'years'}},totalAmountWithTaxes:{amount:'95988',currencyCode:'NOK'},monthlyEquivalent:{amount:'7999',currencyCode:'NOK'}});
 const price=evaluateCountry(html([annual])).result.v3Truth.prices.NO;
 assert.notEqual(price.propositions.MONTHLY_SUBSCRIPTION.state,'ESTABLISHED');
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

test('a timed-out country acquisition without a retained page cannot create V3 prices',()=>{
 const fixture=countryFixture();fixture.attempt.outcome='TIMEOUT';fixture.attempt.page=null;
 const result=evaluateVerifiedCountryRun({target:fixture.target,verification:{sourceChecks:[]},records:[{type:'V2_ACQUISITION_RESULT',payload:{target:fixture.target,result:{attempts:[fixture.attempt]}}}]});
 assert.equal(result.countryV3Evaluation.status,'UNRESOLVED');assert.equal(result.v3Truth,undefined);assert.equal(result.v3SuggestedCandidates,undefined);
});

test('wrong exact host cannot create provider Truth',()=>{
 const pageUrl='https://other.example/membership',fixture=countryFixture(html(),{pageUrl});assert.throws(()=>evaluateCountryProviderTruth(fixture),/COUNTRY_PROVIDER_AUTHORITY_REQUIRED/);
});

test('Direct source remains country-unbound despite locale, currency and path',()=>{
 const body=html(),hash=digest(body),result=evaluateProviderSourceTruth({target:target(),retained:{url:'https://provider.example/no-NO/membership',requestedUrl:'https://provider.example/no-NO/membership',httpStatus:200,contentType:'text/html',bodyHash:hash,sourceIntegrity:{sha256:hash},rawSource:{text:body},accessDecisions:[{decision:'ALLOWED'}]},acquisition:{route:'DIRECT'},observationId:'direct-unbound'});
 assert.equal(result.v3Truth.prices.NO.propositions.TARGET_MARKET.state,'UNRESOLVED');
});

test('family source path and language do not establish a target market without country proof',()=>{
 const url='https://help.example.com/nl/pricing',value=html(),hash=digest(value),result=evaluateProviderSourceTruth({target:target({providerSourceIdentityHosts:['example.com'],authorities:[]}),retained:{url,requestedUrl:url,httpStatus:200,contentType:'text/html',bodyHash:hash,sourceIntegrity:{sha256:hash},rawSource:{text:value},accessDecisions:[{decision:'ALLOWED'}]},acquisition:{route:'DIRECT'},observationId:'family-locale-unbound'});
 assert.equal(result.v3Truth.prices.NO.propositions.TARGET_MARKET.state,'UNRESOLVED');
});

test('legacy zero rows and commercial insufficiency cannot veto country V3 evaluation',async t=>{
 const fixture=countryFixture(),records=[{type:'V2_ACQUISITION_RESULT',payload:{target:fixture.target,result:{attempts:[fixture.attempt]}}}],v3=evaluateVerifiedCountryRun({target:fixture.target,verification:{sourceChecks:[fixture.sourceCheck],verified:[],usable:true,classification:'COMMERCIAL_FIELDS_INSUFFICIENT',blockers:['CONFLICTING_MONTHLY_AMOUNTS']},records});
 assert.equal(v3.countryV3Evaluation.status,'EVALUATED');assert.equal(v3.v3Truth.established,true);
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'country-v3-controller-'));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
 const body=html(),hash=digest(body),direct=evaluateProviderSourceTruth({target:fixture.target,retained:{url,requestedUrl:url,httpStatus:200,contentType:'text/html',bodyHash:hash,sourceIntegrity:{sha256:hash},rawSource:{text:body},accessDecisions:[{decision:'ALLOWED'}]},acquisition:{route:'DIRECT'},observationId:'controller-direct'}),args={directory,targets:[fixture.target],search:async()=>assert.fail('search'),read:async()=>({url,requestedUrl:url,outcome:'OK',httpStatus:200,contentType:'text/html',rawSource:{text:body},sourceIntegrity:{sha256:hash},accessDecisions:[{decision:'ALLOWED'}],authority:{status:'CONFIGURED_REVIEWED',...authority}}),classify:async()=>({eligible:true,url,authority:{validated:true,hostname:host}}),consumeProvider:async()=>({...direct,classification:'COMMERCIAL_FIELDS_INSUFFICIENT',verified:[],blockers:['CONFLICTING_MONTHLY_AMOUNTS']}),acquire:async()=>({...v3,classification:'COMMERCIAL_FIELDS_INSUFFICIENT',verified:[],blockers:['CONFLICTING_MONTHLY_AMOUNTS']})};
 await runOpenWebResearch({...args,maxActions:1});const state=await runOpenWebResearch({...args,maxActions:1});
 const current=state.targets[0],country=current.providerInterpretations.at(-1);assert.equal(current.verified.length,0);assert.equal(current.v3Truth.established,true);assert.equal(current.v3Catalog.state,'CATALOG_UNRESOLVED');assert.equal(current.marketProof,undefined);assert.equal(country.classification,'COMMERCIAL_FIELDS_INSUFFICIENT');assert.equal(country.v3Truth.established,true);assert.equal(country.v3Catalog.state,'CATALOG_UNRESOLVED');assert.equal(country.countryV3Evaluation.status,'EVALUATED');
});

test('real unresolved propositions remain in existing Truth needs',()=>{
 const body=html([{product:{id:'unknown',name:'Unknown',productType:'PRODUCT_TYPE_MEMBERSHIP',consumer:true,subscription:{length:1,unit:'months'}}}]),truth=evaluateCountry(body).result.v3Truth;
 assert.equal(truth.established,false);assert(truth.needs.some(row=>row.proposition==='PRICE_AMOUNT'));
});

test('valid country receipt without sufficient provider offering evidence cannot establish price',()=>{
 const truth=evaluateCountry('<html><head><title>Aurora</title></head><body>Membership information</body></html>').result.v3Truth;
 assert.equal(truth.established,false);assert.equal(truth.prices.NO.propositions.PRICE_AMOUNT.state,'UNRESOLVED');
});
