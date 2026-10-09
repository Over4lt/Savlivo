import test from 'node:test';
import assert from 'node:assert/strict';
import {adaptV2CurrentSource,v2CurrentSourceBoundary} from './v2-current-source-adapter.mjs';
import {context,digest} from './model.mjs';
import {projectObservation} from './projection.mjs';
import {admittedProjectionCandidates} from './native-structured.mjs';
import {evaluate,interpretStructured} from './truth.mjs';
import {refreshCatalog} from './subscription-catalog.mjs';

const baseUrl='https://provider.example/pricing';
const objective={kind:'PRICE',serviceId:'fixture',serviceName:'Example service',providerHosts:['provider.example'],markets:['NO'],seeds:[baseUrl]};
const binding={host:'provider.example',kind:'REVIEWED_HOST'};
const direct={route:'DIRECT'};
const decodo={route:'DECODO',countryReceipt:{contractVersion:1,kind:'V3_VERIFIED_COUNTRY_RECEIPT',transport:'DECODO',verification:'BRACKET_VERIFIED',requestedCountry:'NO',verifiedCountry:'NO'}};
const offer=(id='monthly',extra={})=>({id,amount:79.99,currency:'NOK',cadence:'MONTHLY',billingCadence:'MONTHLY',consumer:true,relationship:'SUBSCRIPTION',role:'ORDINARY',monetaryKind:'SUBSCRIPTION_CHARGE',amountDerivation:'EXPLICIT',market:'NO',...extra});
const source=offers=>({serviceId:'fixture',offers});

function boundaryInput(body,{acquisition=direct,contentType='application/json',url=baseUrl,id='v2-page'}={}){
 const sha256=digest(body);
 return {contractVersion:1,observationId:id,target:{service:'fixture',serviceName:'Example service',market:'NO'},page:{url,requestedUrl:url,outcome:'OK',httpStatus:200,contentType,bodyHash:sha256,sourceIntegrity:{sha256},rawSource:{text:body},accessDecisions:[{decision:'ALLOWED'}]},providerAuthority:{status:'AUTHORITATIVE_PROVIDER',binding},acquisition:structuredClone(acquisition)};
}
function nativeObservation(input){
 const body=input.page.rawSource.text,web=input.page.contentType!=='application/json',acquisition=input.acquisition;
 const acquired=acquisition.route==='DIRECT'?{context:context('DIRECT')}:{context:context('DECODO',acquisition.countryReceipt.verifiedCountry),transport:{verification:'BRACKET_VERIFIED',requestedCountry:acquisition.countryReceipt.requestedCountry,verifiedCountry:acquisition.countryReceipt.verifiedCountry}};
 const o={id:input.observationId,kind:'PROVIDER',url:input.page.url,context:acquired.context,outcome:'OK',truncated:false,body,sha256:digest(body),candidates:[],httpStatus:200,
  ...(acquired.transport?{transport:acquired.transport}:{}),
  ...(web?{format:'WEB',contentType:input.page.contentType,requestedUrl:input.page.requestedUrl,completeness:'COMPLETE',access:structuredClone(input.page.accessDecisions)}:{})};
 if(web){const projection=projectObservation(o,objective);o.nativeStructured=projection.nativeStructured;o.candidates=admittedProjectionCandidates(projection);}
 else o.candidates=interpretStructured(o,objective);
 return o;
}
function result(o){
 const k={objective,observations:[o],attempts:[],policyBlocks:[],stop:null};
 const truth=evaluate(k),catalog=structuredClone(refreshCatalog(k,truth));
 return {candidates:structuredClone(o.candidates),projection:o.format==='WEB'?projectObservation(o,objective):null,truth,catalog};
}
function equivalent(input){
 const native=nativeObservation(input),adapted=adaptV2CurrentSource(input,objective);
 assert.deepEqual(adapted,native);
 const a=result(native),b=result(adapted);assert.deepEqual(b,a);
 return b;
}

function product(id='alpha',extra={}){const {product:productExtra,...rest}=extra;return {product:{id,name:id,productType:'SUBSCRIPTION',consumer:true,subscription:{length:1,unit:'months'},...productExtra},totalAmountWithTaxes:{amount:'7999',currencyCode:'NOK'},...rest};}
function page(items,metadata={currenciesSubunit:{NOK:2}}){return `<html><head><title>Example service</title></head><body><script>const data = ${JSON.stringify({offeredProducts:{months:items},...metadata})};</script></body></html>`;}

test('contract is frozen at the minimal phase-one versions',()=>{
 assert.equal(Object.isFrozen(v2CurrentSourceBoundary),true);
 assert.deepEqual(v2CurrentSourceBoundary,{contractVersion:1,providerAuthority:'EXISTING_V3_AUTHORITY_BINDING',acquisitionObservation:'EXISTING_V3_PROVIDER_OBSERVATION',directCountryContext:'UNBOUND',verifiedCountryReceipt:'V3_VERIFIED_COUNTRY_RECEIPT_V1'});
});

test('1 valid ordinary monthly provider price has identical native projection and Truth',()=>{
 const r=equivalent(boundaryInput(page([product()]),{contentType:'text/html',acquisition:decodo}));
 assert.equal(r.truth.established,true);assert.equal(r.truth.prices.NO.propositions.PRICE_AMOUNT.value,79.99);
 assert.ok(r.projection.bindings['/offers/0'].nativeStructured);
});

test('2 amount alone remains unresolved',()=>{
 const r=equivalent(boundaryInput(JSON.stringify(source([offer('amount-only',{billingCadence:'UNKNOWN'})]))));
 assert.equal(r.truth.prices.NO.propositions.PRICE_AMOUNT.state,'UNRESOLVED');assert.equal(r.truth.established,false);
});

test('3 /month display alone does not establish monthly billing',()=>{
 const r=equivalent(boundaryInput(JSON.stringify(source([offer('display-only',{billingCadence:'UNKNOWN',cadence:'MONTHLY',conditions:'/month'})]))));
 assert.equal(r.truth.prices.NO.propositions.MONTHLY_SUBSCRIPTION.state,'UNRESOLVED');assert.equal(r.truth.established,false);
});

test('4 annual payment with monthly-equivalent display remains non-monthly',()=>{
 const r=equivalent(boundaryInput(JSON.stringify(source([offer('annual',{billingCadence:'YEARLY',cadence:'MONTHLY',amountDerivation:'ARITHMETIC'})]))));
 assert.equal(r.truth.prices.NO.propositions.MONTHLY_SUBSCRIPTION.state,'UNRESOLVED');assert.equal(r.truth.prices.NO.propositions.PRICE_AMOUNT.state,'UNRESOLVED');
});

test('5 currency does not establish market',()=>{
 const r=equivalent(boundaryInput(JSON.stringify(source([offer('currency',{market:null})]))));
 assert.equal(r.truth.prices.NO.propositions.CURRENCY.value,'NOK');assert.equal(r.truth.prices.NO.propositions.TARGET_MARKET.state,'UNRESOLVED');
});

test('6 language metadata does not establish market',()=>{
 const body=JSON.stringify({...source([offer('language',{market:null})]),language:'nb-NO'}),r=equivalent(boundaryInput(body));
 assert.equal(r.truth.prices.NO.propositions.TARGET_MARKET.state,'UNRESOLVED');
});

test('7 URL path and hostname do not establish market',()=>{
 const r=equivalent(boundaryInput(JSON.stringify(source([offer('path',{market:null})])),{url:'https://provider.example/no-nb/pricing'}));
 assert.equal(r.truth.prices.NO.propositions.TARGET_MARKET.state,'UNRESOLVED');
});

test('8 direct acquisition remains explicitly unbound',()=>{
 const input=boundaryInput(JSON.stringify(source([offer('direct',{market:null})]))),o=adaptV2CurrentSource(input,objective),r=equivalent(input);
 assert.deepEqual(o.context,{transport:'DIRECT',networkGeography:'UNBOUND',representation:'PROVIDER_PAGE'});
 assert.equal(o.transport,undefined);assert.equal(r.truth.prices.NO.propositions.TARGET_MARKET.state,'UNRESOLVED');
});

test('9 a valid V3 country receipt behaves exactly like native V3',()=>{
 const r=equivalent(boundaryInput(JSON.stringify(source([offer('country',{market:null})])),{acquisition:decodo}));
 assert.equal(r.truth.prices.NO.propositions.TARGET_MARKET.value,'NO');assert.equal(r.truth.established,true);
});

test('10 omissions stay unresolved rather than contradictory',()=>{
 const r=equivalent(boundaryInput(JSON.stringify(source([offer('unknown',{amount:null,currency:null,billingCadence:'UNKNOWN',cadence:'UNKNOWN'})]))));
 for(const p of Object.values(r.truth.prices.NO.propositions))assert.notEqual(p.state,'CONTRADICTED');
 assert.equal(r.truth.established,false);
});

test('11 candidate routing cannot cross as authoritative provider evidence',()=>{
 const candidateObjective={...objective,providerHosts:[],candidateHosts:['provider.example']},input=boundaryInput(JSON.stringify(source([offer()])));
 assert.throws(()=>adaptV2CurrentSource(input,candidateObjective),/V2_V3_AUTHORITY_INVALID/);
});

test('12 amount and cadence from different offerings are never mixed',()=>{
 const r=equivalent(boundaryInput(JSON.stringify(source([offer('amount',{billingCadence:'UNKNOWN'}),offer('cadence',{amount:null})]))));
 assert.equal(r.truth.established,false);assert.equal(r.truth.offers.length,2);assert.ok(r.truth.offers.every(row=>row.propositions.PRICE_AMOUNT.state==='UNRESOLVED'));
});

test('13 same-offering incompatible payment facts retain contradiction semantics',()=>{
 const r=equivalent(boundaryInput(JSON.stringify(source([offer('same'),offer('same',{billingCadence:'YEARLY',cadence:'YEARLY'})]))));
 assert.equal(r.truth.prices.NO.propositions.MONTHLY_SUBSCRIPTION.state,'CONTRADICTED');assert.equal(r.truth.established,false);
});

test('14 trial and discount money do not become ordinary recurring price',()=>{
 for(const row of [offer('trial',{role:'TRIAL',monetaryKind:'TRIAL_CHARGE'}),offer('discount',{role:'INTRODUCTORY',monetaryKind:'INTRODUCTORY_SUBSCRIPTION_CHARGE'})]){
  const r=equivalent(boundaryInput(JSON.stringify(source([row]))));assert.equal(r.truth.prices.NO.propositions.PRICE_AMOUNT.state,'UNRESOLVED');assert.equal(r.truth.established,false);
 }
});

test('15 model-like candidates without source binding cannot create Truth',()=>{
 const input=boundaryInput(JSON.stringify(source([])));input.semanticCandidates=[{kind:'OFFER',pointer:'/offers/0'}];
 assert.throws(()=>adaptV2CurrentSource(input,objective),/V2_V3_BOUNDARY_INVALID/);
 const clean=boundaryInput(JSON.stringify(source([]))),o=adaptV2CurrentSource(clean,objective),semantic={...o,id:'model-opinion',semantic:true,body:JSON.stringify(source([offer('invented')])),sha256:digest(JSON.stringify(source([offer('invented')]))),candidates:[{kind:'SERVICE',pointer:''},{kind:'OFFER',pointer:'/offers/0'}]};
 assert.equal(evaluate({objective,observations:[semantic]}).established,false);
});

test('intact source hash, exact V3 binding and canonical receipt fail closed',()=>{
 const changed=boundaryInput(JSON.stringify(source([offer()])));changed.page.rawSource.text+=' ';
 assert.throws(()=>adaptV2CurrentSource(changed,objective),/V2_V3_SOURCE_INTEGRITY_INVALID/);
 const wrong=boundaryInput(JSON.stringify(source([offer()])));wrong.providerAuthority.binding={host:'other.example',kind:'REVIEWED_HOST'};
 assert.throws(()=>adaptV2CurrentSource(wrong,objective),/V2_V3_AUTHORITY_INVALID/);
 const country=boundaryInput(JSON.stringify(source([offer()])),{acquisition:decodo});country.acquisition.countryReceipt.verifiedCountry='SE';
 assert.throws(()=>adaptV2CurrentSource(country,objective),/V2_V3_COUNTRY_RECEIPT_INVALID/);
});

test('old V2 answer fields are outside the contract and cannot influence Truth',()=>{
 for(const field of ['verified','finalStatus','confidence']){const input=boundaryInput(JSON.stringify(source([offer()])));input[field]=field==='confidence'?1:true;assert.throws(()=>adaptV2CurrentSource(input,objective),/V2_V3_BOUNDARY_INVALID/);}
});

test('same explicit catalog evidence produces identical catalog result',()=>{
 const offers=[offer('basic')],body=JSON.stringify({...source(offers),catalog:{scope:'SERVICE_MARKET',coverage:'COMPLETE',market:'NO',offerIds:['basic']}}),r=equivalent(boundaryInput(body));
 assert.equal(r.catalog.state,'CATALOG_EXHAUSTED');assert.equal(r.catalog.scope,'CATALOG_SCOPE_ESTABLISHED');
});
