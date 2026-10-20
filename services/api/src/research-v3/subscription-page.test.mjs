import test from 'node:test';
import assert from 'node:assert/strict';
import {interpretSubscriptionPage} from './subscription-page.mjs';
import {discoverSubscriptionServices} from './subscription-service-discovery.mjs';
import {providerOrBrandResearchTarget} from './research-target.mjs';
import {reviewProviderSeedAuthority} from './provider-authority-review.mjs';
import {context,digest} from './model.mjs';
import {projectObservation} from './projection.mjs';
import {admittedProjectionCandidates} from './native-structured.mjs';
import {projectV3SuggestedCandidates} from './suggested-projection.mjs';
import {authorityBinding} from './discovery-authority.mjs';
import {evaluate} from './truth.mjs';

const host='northstar.example',url=`https://${host}/orbit/plans`,market='DE';
const target=providerOrBrandResearchTarget({seedName:'Northstar',targetMarket:market});
const authorityBody=`<script type="application/ld+json">${JSON.stringify({'@context':'https://schema.org','@type':'Organization',name:'Northstar Digital',url:`https://${host}/`,brand:{'@type':'Brand',name:'Northstar'}})}</script>`;
const authorityObservation={id:'authority',kind:'CANDIDATE',authority:'UNREVIEWED_CANDIDATE',url:`https://${host}/about`,context:context('DIRECT','UNBOUND','CANDIDATE_PAGE'),outcome:'OK',truncated:false,completeness:'COMPLETE',format:'WEB',contentType:'text/html',httpStatus:200,access:[{decision:'ALLOWED'}],body:authorityBody,sha256:digest(authorityBody)};
const binding=reviewProviderSeedAuthority(authorityObservation,target,{candidateHosts:[host]});
const articles=`<section class="plans"><h2>Find the right plan</h2><article><h3>Free</h3><p>€0 / month, billed monthly</p></article><article><h3>Standard</h3><p>€5 / month, billed monthly</p><p>€50 / year, billed yearly</p></article><article><h3>Premium</h3><p>€15 / month, billed monthly</p><p>€150 / year, billed yearly</p></article></section>`;
const ordinaryPage=`<!doctype html><html><head><title>Orbit Subscription Plans</title><meta property="og:title" content="Orbit Subscription Plans"></head><body><nav><a>Premium</a><article><h3>Account</h3><p>€7 / month</p></article></nav><main><h1>Orbit</h1>${articles}<section><h2>Frequently Asked Questions</h2><p>Free, Standard and Premium are described here.</p></section><section><h2>Training Resources</h2><p>Everything You Need</p></section></main></body></html>`;

const page=body=>interpretSubscriptionPage({body,url});
const providerObservation=(body,{country=null,id='provider'}={})=>({id,kind:'PROVIDER',authority:'REVIEWED_PROVIDER',url,context:country?context('DECODO',country):context('DIRECT'),outcome:'OK',truncated:false,completeness:'COMPLETE',format:'WEB',contentType:'text/html',httpStatus:200,access:[{decision:'ALLOWED'}],body,sha256:digest(body),...(country?{transport:{verification:'BRACKET_VERIFIED',requestedCountry:country,verifiedCountry:country}}:{})});
const discovery=body=>discoverSubscriptionServices({researchTarget:target,providerAuthorityBinding:binding,observations:[providerObservation(body)]});
const truth=(body,country=null)=>{const objective={kind:'PRICE',serviceId:'orbit',serviceName:'Orbit',providerHosts:[host],markets:[market],seeds:[url]},observation=providerObservation(body,{country});const projection=projectObservation(observation,objective);observation.nativeStructured=projection.nativeStructured;observation.candidates=admittedProjectionCandidates(projection);return {projection,truth:evaluate({objective,observations:[observation],attempts:[],policyBlocks:[],stop:null})};};

test('fictional end to end: one Service owns three plan identities and no section heading becomes a Service',()=>{
 const interpreted=page(ordinaryPage),found=discovery(ordinaryPage),direct=truth(ordinaryPage),country=truth(ordinaryPage,market);
 assert.deepEqual(interpreted.services.map(row=>row.name),['Orbit']);assert.deepEqual(interpreted.offerings.map(row=>row.name),['Free','Standard','Premium']);assert.deepEqual(found.services.map(row=>row.serviceName),['Orbit']);
 assert.equal(['Find the right plan','Frequently Asked Questions','Training Resources','Everything You Need'].some(name=>found.services.some(row=>row.serviceName===name)),false);
 assert.deepEqual([...new Set(Object.values(country.projection.bindings).map(row=>row?.offer).filter(Boolean))],['Free','Standard','Premium']);
 assert.equal(direct.truth.established,false);assert.equal(direct.truth.prices.DE.propositions.TARGET_MARKET.state,'UNRESOLVED');
 const established=country.truth.offers.filter(row=>row.propositions.PRICE_AMOUNT.state==='ESTABLISHED');assert.deepEqual(established.map(row=>row.propositions.PRICE_AMOUNT.value).sort((a,b)=>a-b),[5,15]);assert.ok(established.every(row=>row.propositions.TARGET_MARKET.value===market));
});

test('adversarial 1: a heading near a price without page product identity is not a Service',()=>{const body='<main><h2>Get Started</h2><p>Membership from €5 / month.</p></main>';assert.deepEqual(page(body).services,[]);assert.deepEqual(discovery(body).services,[]);});
test('adversarial 2: FAQ prose naming several plans creates neither Service nor offering cards',()=>{const body='<title>Northstar Help</title><main><h1>Frequently Asked Questions</h1><p>Basic, Plus and Pro cost different amounts.</p></main>';assert.deepEqual(page(body),{services:[],offerings:[],limited:false});});
test('adversarial 3: a feature comparison table is not itself a plan relationship',()=>{const body='<title>Orbit Subscription Plans</title><meta property="og:title" content="Orbit Subscription Plans"><h1>Orbit</h1><table><tr><th>Compare Plans</th><th>€5 / month</th></tr></table>';assert.deepEqual(page(body).services,[]);assert.deepEqual(page(body).offerings,[]);});
test('adversarial 4: multiple structured Services on one provider stay distinct',()=>{const body=JSON.stringify({'@graph':[{'@type':'SoftwareApplication',name:'Orbit',description:'Consumer subscription service',offers:{'@type':'OfferCatalog',itemListElement:[{'@type':'Offer',name:'Standard',priceSpecification:{billingDuration:'P1M'}}]}},{'@type':'Service',name:'Pulse',description:'Consumer membership service',offers:{'@type':'OfferCatalog',itemListElement:[{'@type':'Offer',name:'Standard',priceSpecification:{billingDuration:'P1M'}}]}}]});const o={...providerObservation(body),format:'JSON',contentType:'application/json',sha256:digest(body)};const r=discoverSubscriptionServices({researchTarget:target,providerAuthorityBinding:binding,observations:[o]});assert.deepEqual(r.services.map(row=>row.serviceName),['Orbit','Pulse']);});
test('adversarial 5: several sibling plan cards remain under one Service',()=>{assert.deepEqual(page(ordinaryPage).offerings.map(row=>row.name),['Free','Standard','Premium']);});
test('adversarial 6: the same plan name under distinct structured Services does not merge the Services',()=>{const names=discovery(JSON.stringify({'@graph':[]}));assert.deepEqual(names.services,[]);const body=JSON.stringify({'@graph':['Orbit','Pulse'].map(name=>({'@type':'Service',name,description:'Consumer subscription service',offers:{'@type':'OfferCatalog',itemListElement:[{'@type':'Offer',name:'Standard',priceSpecification:{billingDuration:'P1M'}}]}}))}),o={...providerObservation(body),format:'JSON',contentType:'application/json',sha256:digest(body)},r=discoverSubscriptionServices({researchTarget:target,providerAuthorityBinding:binding,observations:[o]});assert.deepEqual(r.services.map(row=>row.serviceName),['Orbit','Pulse']);});
test('adversarial 7: a free tier and paid tiers remain three plan identities',()=>{const rows=page(ordinaryPage).offerings;assert.deepEqual(rows.map(row=>row.name),['Free','Standard','Premium']);assert.equal(rows[0].charges[0].amount,0);assert.deepEqual(rows.slice(1).map(row=>row.charges[0].amount),[5,15]);});
test('adversarial 8: monthly and annual charges remain separate source propositions',()=>{const standard=page(ordinaryPage).offerings.find(row=>row.name==='Standard');assert.deepEqual(standard.charges.map(row=>[row.amount,row.cadence,row.billingCadence]),[[5,'MONTHLY','MONTHLY'],[50,'YEARLY','YEARLY']]);});
test('adversarial 9: an annual effective monthly display is not monthly billing',()=>{const body=ordinaryPage.replace('€5 / month, billed monthly','€4.17 / month, billed yearly');const charge=page(body).offerings.find(row=>row.name==='Standard').charges[0];assert.deepEqual([charge.cadence,charge.billingCadence,charge.amountDerivation],['MONTHLY','YEARLY','ARITHMETIC']);const r=truth(body,market).truth.offers.find(row=>row.id.includes?.('never'));assert.equal(r,undefined);assert.equal(truth(body,market).truth.offers.some(row=>row.propositions.PRICE_AMOUNT.value===4.17&&row.propositions.PRICE_AMOUNT.state==='ESTABLISHED'),false);});
test('adversarial 10: trial and ordinary recurring amounts retain distinct roles',()=>{const body=ordinaryPage.replace('€5 / month, billed monthly','€1 / month introductory first month.</p><p>Then €5 / month, billed monthly');const charges=page(body).offerings.find(row=>row.name==='Standard').charges;assert.ok(charges.some(row=>row.amount===1&&row.role==='TRIAL'));assert.ok(charges.some(row=>row.amount===5&&row.role==='ORDINARY'&&row.billingCadence==='MONTHLY'));});
test('adversarial 11: unrelated savings money is not promoted to a charge',()=>{const body=ordinaryPage.replace('€5 / month, billed monthly','€5 / month, billed monthly. Save €20 / year');const charges=page(body).offerings.find(row=>row.name==='Standard').charges;assert.equal(charges.some(row=>row.amount===20),false);});
test('a bundle card does not become a standalone service offering',()=>{const body=ordinaryPage.replace('</section><section><h2>Frequently Asked Questions','<article><h3>Orbit + Pulse bundle</h3><p>€20 / month, billed monthly</p></article></section><section><h2>Frequently Asked Questions');const established=truth(body,market).truth.offers.filter(row=>row.propositions.PRICE_AMOUNT.state==='ESTABLISHED');assert.deepEqual(established.map(row=>row.propositions.PRICE_AMOUNT.value).sort((a,b)=>a-b),[5,15]);});
test('adversarial 12: navigation labels and navigation-contained cards are excluded',()=>{const interpreted=page(ordinaryPage);assert.equal(interpreted.offerings.some(row=>row.name==='Account'),false);});
test('adversarial 13: support and resource headings cannot become Services without identity relationships',()=>{const body='<main><section><h2>Training Resources</h2><p>Subscription support €5 / month</p></section><section><h2>Everything You Need</h2></section></main>';assert.deepEqual(discovery(body).services,[]);});
test('adversarial 14: malformed structured data does not create a Service',()=>{const body='<script type="application/ld+json">{"@type":"Service",bad}</script><main><h2>Compare Plans</h2><p>€5 / month</p></main>';assert.deepEqual(discovery(body).services,[]);});
test('adversarial 15: conflicting page product identities fail closed',()=>{const body=ordinaryPage.replace('content="Orbit Subscription Plans"','content="Pulse Subscription Plans"');assert.deepEqual(page(body).services,[]);assert.deepEqual(discovery(body).services,[]);});

const retainedHelpTable=(market,rows)=>`<html><head><title>Disney+ plans and prices | Disney+ Help Centre | ${market}</title><meta name="description" content="Prices for a Disney+ subscription can vary depending on the plan you sign up for."></head><body><h1>Disney+ plans and prices</h1><h2>Disney+ standalone plans</h2><table><tr><th>Disney+ plan</th><th>Features</th><th>Price</th></tr>${rows.join('')}</table><p>Repeated informational text: Disney+ Premium costs more, but this paragraph is not a plan choice.</p></body></html>`;
const helpRow=(name,price)=>`<tr><td>${name}</td><td>Ad-free movies and series</td><td>${price}</td></tr>`;
const brHelpTable=rows=>`<html><head><title>Planos e preços do Disney+ | Disney+ Central de Ajuda | BR</title><meta name="description" content="O preço da assinatura do Disney+ pode variar dependendo do plano que você escolher."></head><body><h1>Planos e preços do Disney+</h1><h2>Planos do Disney+</h2><table><tr><th>Plano do Disney+</th><th>Recursos</th><th>Preço</th></tr>${rows.join('')}</table><p>R$ 999,00 em texto informativo não é um plano.</p></body></html>`;
const brRows=[
 helpRow('Disney+ Padrão com anúncios','<strong>Mensal:</strong><p>R$ 29,90 (incluindo impostos)</p>'),
 helpRow('Disney+ Padrão','<strong>Mensal:</strong><p>R$ 49,90</p><strong>Anual:</strong><p>R$ 34 por mês**</p>'),
 helpRow('Disney+ Premium','<strong>Mensal:</strong><p>R$ 69,90</p><strong>Anual:</strong><p>R$ 49 por mês**</p>')];
const myRows=[
 helpRow('Disney+ Standard','<strong>Monthly:</strong><p>RM29.90</p><a>Select plan</a><strong>Annual:</strong><p>RM214.90</p><a>Select plan</a>'),
 helpRow('Disney+ Premium','<strong>Monthly:</strong><p>RM49.90</p><a>Select plan</a><strong>Annual:</strong><p>RM289.90</p><a>Select plan</a>')];

test('Portuguese buttonless pricing table retains only three explicit BRL monthly subscriptions',()=>{
 const body=brHelpTable([...brRows,
  helpRow('Membro Extra','<strong>Mensal:</strong><p>R$ 20,90</p>'),
  helpRow('Disney+ + Esportes bundle','<strong>Mensal:</strong><p>R$ 89,90</p>'),
  helpRow('Disney+ Padrão promoção','<strong>Mensal:</strong><p>R$ 19,90</p>')]);
 const result=interpretSubscriptionPage({body,url:'https://help.example.com/pt-BR/article/price',providerName:'Disney+'});
 assert.deepEqual(result.services.map(row=>row.name),['Disney+']);
 assert.deepEqual(result.offerings.map(row=>[row.name,row.charges[0].amount,row.charges[0].currency,row.charges[0].billingCadence]),[
  ['Disney+ Padrão com anúncios',29.9,'BRL','MONTHLY'],['Disney+ Padrão',49.9,'BRL','MONTHLY'],['Disney+ Premium',69.9,'BRL','MONTHLY']]);
 assert.ok(result.offerings.every(row=>row.charges.length===1&&row.charges[0].amountDerivation==='EXPLICIT'));
});

test('buttonless table rows fail closed without explicit cadence, currency, coherent identity or pricing-page relationship',()=>{
 const good=brRows[0];
 for(const altered of [
  good.replace('Mensal:','Preço:'),
  good.replace('R$ 29,90','29,90'),
  good.replace('Disney+ Padrão com anúncios','Mensal'),
  good.replace('R$ 29,90','R$ 29,90 promocional'),
  good.replace('R$ 29,90','R$ 29,90 equivalente anual')]){
  const body=brHelpTable([altered,brRows[1]]);
  assert.deepEqual(interpretSubscriptionPage({body,url:'https://help.example.com/pt-BR/article/price',providerName:'Disney+'}).offerings,[]);
 }
 const unbound=brHelpTable(brRows).replace('O preço da assinatura do Disney+','Tabela informativa do Disney+');
 assert.deepEqual(interpretSubscriptionPage({body:unbound,url:'https://help.example.com/pt-BR/article/price',providerName:'Disney+'}).offerings,[]);
});

test('RM maps to MYR only as a bounded currency token in monthly pricing rows',()=>{
 const body=retainedHelpTable('MY',[...myRows,
  helpRow('Extra Member','<strong>Monthly:</strong><p>RM9.90</p><a>Select plan</a>'),
  helpRow('Disney+ + Sports bundle','<strong>Monthly:</strong><p>RM59.90</p><a>Select plan</a>')]);
 const result=interpretSubscriptionPage({body,url:'https://help.example.com/article/price',providerName:'Disney+'});
 assert.deepEqual(result.offerings.map(row=>[row.name,row.charges[0].amount,row.charges[0].currency]),[
  ['Disney+ Standard',29.9,'MYR'],['Disney+ Premium',49.9,'MYR']]);
 for(const text of ['FORM29.90','RMY29.90','RM29.90text']){
  const altered=retainedHelpTable('MY',myRows.map(row=>row.replace('RM29.90',text).replace('RM49.90',text)));
  assert.deepEqual(interpretSubscriptionPage({body:altered,url:'https://help.example.com/article/price',providerName:'Disney+'}).offerings,[],text);
 }
});

test('captured PL help-table structure keeps two standalone monthly zł charges and excludes annual and Extra Member',()=>{
 const body=retainedHelpTable('PL',[
  helpRow('Disney+ Standard','<strong>Monthly:</strong><p>34.99 zł</p><a>Select plan</a><strong>Annual:</strong><p>349.90 zł</p><a>Select plan</a>'),
  helpRow('Disney+ Premium','<strong>Monthly:</strong><p>59.99 zł</p><a>Select plan</a><strong>Annual:</strong><p>599.90 zł</p><a>Select plan</a>'),
  helpRow('Extra Member','<strong>Monthly:</strong><p>20.99 zł</p><a>Select plan</a>')]);
 const result=interpretSubscriptionPage({body,url:'https://help.example.com/article/price',providerName:'Disney+'});
 assert.deepEqual(result.services.map(row=>row.name),['Disney+']);
 assert.deepEqual(result.offerings.map(row=>[row.name,...row.charges.map(c=>[c.amount,c.currency,c.cadence,c.billingCadence])]),[
  ['Disney+ Standard',[34.99,'PLN','MONTHLY','MONTHLY']],['Disney+ Premium',[59.99,'PLN','MONTHLY','MONTHLY']]]);
});

test('captured SG help-table structure keeps only distinct monthly S$ choices',()=>{
 const body=retainedHelpTable('SG',[
  helpRow('Disney+ Standard','<p><span>S$18.98/month</span></p><a>Select plan</a><p><span>S$159.98/year</span></p><a>Select plan</a>'),
  helpRow('Disney+ Premium','<p><span>S$22.98/month</span></p><a>Select plan</a><p><span>S$189.98/year</span></p><a>Select plan</a>'),
  helpRow('Extra Member','<p><span>S$7.98/month</span></p><a>Select plan</a>'),
  helpRow('Six-month Saver','<p><span>S$12.98/month billed every 6 months</span></p><a>Select plan</a>'),
  helpRow('Disney+ + Sports bundle','<p><span>S$29.98/month</span></p><a>Select plan</a>')]);
 const result=interpretSubscriptionPage({body,url:'https://help.example.com/article/price',providerName:'Disney+',currencyHint:'SGD'});
 assert.deepEqual(result.services.map(row=>row.name),['Disney+']);
 assert.deepEqual(result.offerings.map(row=>[row.name,...row.charges.map(c=>[c.amount,c.currency,c.cadence,c.billingCadence])]),[
  ['Disney+ Standard',[18.98,'SGD','MONTHLY','MONTHLY']],['Disney+ Premium',[22.98,'SGD','MONTHLY','MONTHLY']]]);
});

function selectedHelpTruth(market,body,{receipt=true,changedHash=false}={}){
 const sourceUrl='https://help.example.com/en-GB/article/price?redirect=true',id='selected-'+market;
 const selected=body.replace('<body>',`<body><button aria-haspopup="listbox" aria-label="Change country or language. Current country ${market}">Country</button>`),sha=digest(selected);
 const selectedOptions={BR:'Brazil (Português)',MY:'Malaysia (English)',PL:'Poland (English)',SG:'Singapore (English)',DK:'Denmark (English)',TW:'Taiwan (English)',AE:'United Arab Emirates (English)',PH:'Philippines (English)',SA:'Saudi Arabia (English)',MX:'Mexico (Español)',ID:'Indonesia (English)',ZA:'South Africa (English)',IL:'Israel (English)',QA:'Qatar (English)',EG:'Egypt (English)',RO:'Romania (English)',CL:'Chile (Español)',CO:'Colombia (Español)',TR:'Turkey (English)'};
 const marketSelection={kind:'PROVIDER_SELECTED_MARKET',selectionMode:'SELECTED_OPTION',observationId:id,targetMarket:market,transport:'DIRECT_BROWSER',initialUrl:sourceUrl,finalUrl:sourceUrl,providerHost:'help.example.com',preSourceSha256:digest('initial shell'),finalSourceSha256:changedHash?'0'.repeat(64):sha,preSelectedCode:'US',selectedCode:market,selectedOption:selectedOptions[market],selectorLabel:`Change country or language. Current country ${market}`};
 const observation={id,kind:'PROVIDER',authority:'REVIEWED_PROVIDER',url:sourceUrl,context:context('DIRECT'),outcome:'OK',truncated:false,completeness:'COMPLETE',format:'WEB',contentType:'text/html',httpStatus:200,access:[{decision:'ALLOWED'}],body:selected,sha256:sha,...(receipt?{marketSelection}:{})};
 const objective={kind:'PRICE',serviceId:'disney-plus',serviceName:'Disney+',providerHosts:['help.example.com'],markets:[market],seeds:[sourceUrl]};
 const projection=projectObservation(observation,objective);observation.nativeStructured=projection.nativeStructured;observation.candidates=admittedProjectionCandidates(projection);
 return {projection,truth:evaluate({objective,observations:[observation],attempts:[],policyBlocks:[],stop:null}),observation,objective};
}

for(const [market,expected,rows] of [
 ['PL',[[34.99,'PLN'],[59.99,'PLN']],[helpRow('Disney+ Standard','<strong>Monthly:</strong><p>34.99 zł</p><a>Select plan</a><strong>Annual:</strong><p>349.90 zł</p><a>Select plan</a>'),helpRow('Disney+ Premium','<strong>Monthly:</strong><p>59.99 zł</p><a>Select plan</a><strong>Annual:</strong><p>599.90 zł</p><a>Select plan</a>')]],
 ['SG',[[18.98,'SGD'],[22.98,'SGD']],[helpRow('Disney+ Standard','<p><span>S$18.98/month</span></p><a>Select plan</a><p><span>S$159.98/year</span></p><a>Select plan</a>'),helpRow('Disney+ Premium','<p><span>S$22.98/month</span></p><a>Select plan</a><p><span>S$189.98/year</span></p><a>Select plan</a>')]],
])test(`${market} captured table reaches V3 only with an intact selected-market receipt`,()=>{
 const body=retainedHelpTable(market,rows),accepted=selectedHelpTruth(market,body);
 assert.deepEqual(accepted.projection.source.offers.map(row=>[row.amount,row.currency]),expected);
 assert.equal(accepted.truth.established,true);
 assert.deepEqual(accepted.truth.offers.map(row=>[row.propositions.PRICE_AMOUNT.value,row.propositions.CURRENCY.value,row.propositions.TARGET_MARKET.value]),expected.map(([amount,currency])=>[amount,currency,market]));
 for(const options of [{receipt:false},{changedHash:true}]){
  const blocked=selectedHelpTruth(market,body,options);
  assert.equal(blocked.truth.established,false);
  assert.equal(blocked.truth.offers.some(row=>row.propositions.TARGET_MARKET?.state==='ESTABLISHED'),false);
 }
});

test('ambiguous kr requires independent market proof and preserves monthly billing',()=>{
 const rows=[
  helpRow('Disney+ Standard with Ads','<strong>Monthly:</strong><p>79.00 kr</p><strong>Annual:</strong><p>790.00 kr</p>'),
  helpRow('Disney+ Standard','<strong>Monthly:</strong><p>119.00 kr</p><strong>Annual:</strong><p>1190.00 kr</p>'),
  helpRow('Disney+ Premium','<strong>Monthly:</strong><p>169.00 kr</p><strong>Annual:</strong><p>1690.00 kr</p>'),
  helpRow('Disney+ + Sports bundle','<strong>Monthly:</strong><p>199.00 kr</p>'),
  helpRow('Disney+ Premium promotion','<strong>Monthly:</strong><p>49.00 kr first month</p>')];
 const body=retainedHelpTable('DK',rows),url='https://help.example.com/article/price';
 assert.deepEqual(interpretSubscriptionPage({body,url,providerName:'Disney+'}).offerings,[]);
 for(const code of ['DKK','NOK','SEK']){
  const parsed=interpretSubscriptionPage({body,url,providerName:'Disney+',marketCurrencyHint:code});
  assert.deepEqual(parsed.offerings.map(row=>[row.charges[0].amount,row.charges[0].currency,row.charges[0].billingCadence]),[[79,code,'MONTHLY'],[119,code,'MONTHLY'],[169,code,'MONTHLY']]);
 }
 const accepted=selectedHelpTruth('DK',body);
 assert.equal(accepted.truth.established,true);
 assert.deepEqual(accepted.truth.offers.map(row=>[row.propositions.PRICE_AMOUNT.value,row.propositions.CURRENCY.value]),[[79,'DKK'],[119,'DKK'],[169,'DKK']]);
 for(const options of [{receipt:false},{changedHash:true}])assert.equal(selectedHelpTruth('DK',body,options).truth.established,false);
 const conflicting=body.replace('79.00 kr','79.00 kr (SEK)');
 assert.equal(interpretSubscriptionPage({body:conflicting,url,providerName:'Disney+',marketCurrencyHint:'DKK'}).offerings.length,2);
 assert.deepEqual(selectedHelpTruth('DK',conflicting).truth.offers.map(row=>row.propositions.PRICE_AMOUNT.value),[119,169]);
});

for(const [market,body,expected] of [
 ['BR',brHelpTable(brRows),[[29.9,'BRL'],[49.9,'BRL'],[69.9,'BRL']]],
 ['MY',retainedHelpTable('MY',myRows),[[29.9,'MYR'],[49.9,'MYR']]],
])test(`${market} parser output reaches V3 truth only through intact source hash and market receipt`,()=>{
 const accepted=selectedHelpTruth(market,body);
 assert.deepEqual(accepted.projection.source.offers.map(row=>[row.amount,row.currency]),expected);
 assert.equal(accepted.truth.established,true);
 assert.deepEqual(accepted.truth.offers.map(row=>[row.propositions.PRICE_AMOUNT.value,row.propositions.CURRENCY.value,row.propositions.TARGET_MARKET.value]),expected.map(([amount,currency])=>[amount,currency,market]));
 for(const options of [{receipt:false},{changedHash:true}]){
  const blocked=selectedHelpTruth(market,body,options);
  assert.equal(blocked.truth.established,false);
  assert.equal(blocked.truth.offers.some(row=>row.propositions.TARGET_MARKET?.state==='ESTABLISHED'),false);
 }
});

const monthlyRow=(name,price,{label='Monthly',action='Select plan',annual=null}={})=>helpRow(name,`<strong>${label}:</strong><p>${price}</p><a>${action}</a>${annual?`<strong>Annual:</strong><p>${annual}</p><a>${action}</a>`:''}`);
const spanishHelpTable=(market,rows)=>`<html><head><title>Planes y precios de Disney+ | ${market}</title><meta name="description" content="Los precios de la suscripción de Disney+ dependen del plan."></head><body><h1>Planes y precios de Disney+</h1><h2>Planes de Disney+</h2><table><tr><th>Plan</th><th>Precio</th></tr>${rows.join('')}</table></body></html>`;
for(const [market,body,expected] of [
 ['TW',retainedHelpTable('TW',[monthlyRow('Disney+ Standard','NTD 285'),monthlyRow('Disney+ Premium','NTD 335')]),[[285,'TWD'],[335,'TWD']]],
 ['AE',retainedHelpTable('AE',[monthlyRow('Disney+ Premium','AED 49.99')]),[[49.99,'AED']]],
 ['PH',retainedHelpTable('PH',[monthlyRow('Disney+ Standard','₱289'),monthlyRow('Disney+ Premium','₱599')]),[[289,'PHP'],[599,'PHP']]],
 ['SA',retainedHelpTable('SA',[monthlyRow('Disney+ Premium','SAR 49.99')]),[[49.99,'SAR']]],
 ['MX',spanishHelpTable('MX',[monthlyRow('Disney+ Estándar con anuncios','MXN 159',{label:'Mensual',action:'Seleccionar plan'}),monthlyRow('Disney+ Estándar','MXN 259',{label:'Mensual',action:'Seleccionar plan'}),monthlyRow('Disney+ Premium','MXN 339',{label:'Mensual',action:'Seleccionar plan'})]),[[159,'MXN'],[259,'MXN'],[339,'MXN']]],
 ['ID',retainedHelpTable('ID',[monthlyRow('Disney+ Standard','Rp 65,000'),monthlyRow('Disney+ Premium','Rp 119,000')]),[[65000,'IDR'],[119000,'IDR']]],
 ['ZA',retainedHelpTable('ZA',[monthlyRow('Disney+ Premium','R179'),helpRow('Disney+ Basic','<strong>Monthly:</strong><p>R49</p><p>No longer available to purchase</p>')]),[[179,'ZAR']]],
 ['IL',retainedHelpTable('IL',[monthlyRow('Disney+ Premium','NIS 49.90',{label:'Monthly payment plan',action:'Select payment plan'})]),[[49.9,'ILS']]],
 ['QA',retainedHelpTable('QA',[monthlyRow('Disney+ Premium','QAR 49.99')]),[[49.99,'QAR']]],
 ['EG',retainedHelpTable('EG',[monthlyRow('Disney+ Premium','EGP 170')]),[[170,'EGP']]],
 ['RO',retainedHelpTable('RO',[monthlyRow('Disney+ Standard','34.99 Lei'),monthlyRow('Disney+ Premium','59.99 Lei'),monthlyRow('Extra Member','20.99 Lei')]),[[34.99,'RON'],[59.99,'RON']]],
 ['CL',spanishHelpTable('CL',[monthlyRow('Disney+ Estándar con anuncios','CLP 8,490',{label:'Mensual',action:'Seleccionar plan'}),monthlyRow('Disney+ Estándar','CLP 10,990',{label:'Mensual',action:'Seleccionar plan'}),monthlyRow('Disney+ Premium','CLP 15,990',{label:'Mensual',action:'Seleccionar plan'})]),[[8490,'CLP'],[10990,'CLP'],[15990,'CLP']]],
 ['CO',spanishHelpTable('CO',[monthlyRow('Disney+ Estándar con anuncios','COP 25,900',{label:'Mensual',action:'Seleccionar plan'}),monthlyRow('Disney+ Estándar','COP 36,900',{label:'Mensual',action:'Seleccionar plan'}),monthlyRow('Disney+ Premium','COP 54,900',{label:'Mensual',action:'Seleccionar plan'})]),[[25900,'COP'],[36900,'COP'],[54900,'COP']]],
])test(`${market} localized monthly plans establish source-bound V3 truth`,()=>{
 const accepted=selectedHelpTruth(market,body);
 assert.deepEqual(accepted.projection.source.offers.map(row=>[row.amount,row.currency]),expected);
 assert.equal(accepted.truth.established,true);
 assert.deepEqual(accepted.truth.offers.filter(row=>row.propositions.PRICE_AMOUNT.state==='ESTABLISHED').map(row=>[row.propositions.PRICE_AMOUNT.value,row.propositions.CURRENCY.value]),expected);
 for(const options of [{receipt:false},{changedHash:true}])assert.equal(selectedHelpTruth(market,body,options).truth.established,false);
});

test('ambiguous R and Lei markers need a validated market receipt',()=>{
 for(const [market,amount,mark] of [['ZA',179,'R'],['RO',34.99,'Lei']]){
  const body=retainedHelpTable(market,[monthlyRow('Disney+ Standard',mark==='R'?`${mark}${amount}`:`${amount} ${mark}`)]);
  assert.deepEqual(interpretSubscriptionPage({body,url:'https://help.example.com/article/price',providerName:'Disney+'}).offerings,[]);
  assert.equal(selectedHelpTruth(market,body).truth.established,true);
 }
});

test('TR selected-market source binds explicit TL monthly prices to two standalone TRY offerings',()=>{
 const body=retainedHelpTable('TR',[
  monthlyRow('Disney+ with Ads','249.90 TL',{annual:'2,499.00 TL'}),
  monthlyRow('Disney+ without Ads','449.90 TL',{annual:'4,499.00 TL'}),
  monthlyRow('Extra Member','99.90 TL'),
 ]),url='https://help.example.com/en-GB/article/price?redirect=true';
 const unbound=interpretSubscriptionPage({body,url,providerName:'Disney+'});assert.deepEqual(unbound.offerings,[]);
 const unrelated=interpretSubscriptionPage({body,url,providerName:'Disney+',marketCurrencyHint:'EUR'});assert.deepEqual(unrelated.offerings,[]);
 const parsed=interpretSubscriptionPage({body,url,providerName:'Disney+',marketCurrencyHint:'TRY'});
 assert.deepEqual(parsed.offerings.map(row=>[row.name,...row.charges.map(charge=>[charge.amount,charge.currency,charge.cadence,charge.billingCadence])]),[
  ['Disney+ with Ads',[249.9,'TRY','MONTHLY','MONTHLY']],
  ['Disney+ without Ads',[449.9,'TRY','MONTHLY','MONTHLY']],
 ]);
 const accepted=selectedHelpTruth('TR',body);assert.equal(accepted.truth.established,true);
 assert.deepEqual(accepted.projection.source.offers.map(row=>[row.amount,row.currency,row.cadence]),[[249.9,'TRY','MONTHLY'],[449.9,'TRY','MONTHLY']]);
 assert.deepEqual(accepted.truth.offers.map(row=>[row.propositions.PRICE_AMOUNT.value,row.propositions.CURRENCY.value,row.propositions.TARGET_MARKET.value]),[[249.9,'TRY','TR'],[449.9,'TRY','TR']]);
 const suggested=projectV3SuggestedCandidates({observation:accepted.observation,objective:accepted.objective,targetMarket:'TR',providerAuthority:{status:'AUTHORITATIVE_PROVIDER',binding:authorityBinding(accepted.objective,accepted.observation.url)},truth:accepted.truth});
 assert.deepEqual(suggested.map(row=>[row.plan,row.amount,row.currency,row.provenance,row.sourceHash]),[['Disney+ with Ads',249.9,'TRY','V3_SOURCE_RESEARCH',accepted.observation.sha256],['Disney+ without Ads',449.9,'TRY','V3_SOURCE_RESEARCH',accepted.observation.sha256]]);
 for(const options of [{receipt:false},{changedHash:true}]){const blocked=selectedHelpTruth('TR',body,options);assert.equal(blocked.truth.established,false);assert.equal(blocked.truth.offers.some(row=>row.propositions.TARGET_MARKET?.state==='ESTABLISHED'),false);}
});

test('TL letters alone and monthly-looking TL outside a proved TRY context never establish money',()=>{
 const body=retainedHelpTable('TR',[monthlyRow('Disney+ with Ads','249.90 TL'),monthlyRow('Disney+ without Ads','449.90 TL')]);
 for(const hint of [null,'EUR','USD'])assert.deepEqual(interpretSubscriptionPage({body,url:'https://help.example.com/tr/article/price',providerName:'Disney+',marketCurrencyHint:hint}).offerings,[]);
 assert.equal(selectedHelpTruth('RO',body).truth.established,false);
 const letters=retainedHelpTable('TR',[monthlyRow('Disney+ with Ads','Top Level access'),monthlyRow('Disney+ without Ads','Total Limit access')]);
 assert.deepEqual(interpretSubscriptionPage({body:letters,url:'https://help.example.com/article/price',providerName:'Disney+',marketCurrencyHint:'TRY'}).offerings,[]);
});

const presented=({name='Aurora',title=`${name} | Personal finance app subscription`,description=`${name} provides consumers access to its budgeting application.`,body='' }={})=>`<html><head><title>${title}</title><meta property="og:title" content="${title}"><meta name="description" content="${description}"><meta property="og:description" content="${description}"></head><body>${body}</body></html>`;

test('ordinary source-bound product presentation yields app membership sibling and distinct multi-Service candidates',()=>{
 const app=discovery(presented()),membership=discovery(presented({name:'Northstar Club',title:'Northstar Club | Consumer membership service',description:'Northstar Club offers members access to its digital membership product.'})),sibling=discovery('<html><head><title>Cloudbox | Personal storage app</title><meta property="og:title" content="Cloudbox | Personal storage app"></head><body><main><h1>Cloudbox</h1><section><p>Cloudbox is a consumer subscription software application for personal files.</p></section></main></body></html>'),multiple=discovery('<main><section><h2>Orbit</h2><p>Northstar Digital offers Orbit, a consumer subscription app for personal reading.</p></section><section><h2>Pulse</h2><p>Northstar Digital provides Pulse, a consumer membership service for audio.</p></section></main>');
 assert.deepEqual(app.services.map(row=>[row.serviceName,row.identityType,row.provenance.relationship]),[['Aurora','SoftwareApplication','EXPLICIT_SUBSCRIPTION']]);
 assert.deepEqual(membership.services.map(row=>[row.serviceName,row.provenance.relationship]),[['Northstar Club','EXPLICIT_MEMBERSHIP']]);
 assert.deepEqual(sibling.services.map(row=>[row.serviceName,row.identityType]),[['Cloudbox','SoftwareApplication']]);
 assert.deepEqual(multiple.services.map(row=>row.serviceName),['Orbit','Pulse']);assert.equal(new Set(multiple.services.map(row=>row.serviceId)).size,2);
 for(const result of [app,membership,sibling,multiple])for(const service of result.services){assert.equal(service.provenance.extractionMechanism,'NATIVE_HTML');assert.equal(service.provenance.sourceUrl,url);assert.equal(service.provenance.providerObservation,'provider');assert.equal(service.providerBinding.host,host);}
});

test('authoritative native plan state reaches semantic admission without duplicate Open Graph title',()=>{
 const name=binding.providerIdentity.presentationName,plans={props:{pageProps:{subscriptionPlans:[{display_name:'Monthly',price:'9.99',renewal_period:'month'},{display_name:'Annual',price:'99.99',renewal_period:'year'}]}}},body=`<html><head><title>Choose your subscription plan</title><meta name="description" content="Choose the ${name} subscription plan that is right for you."></head><body><script type="application/json">${JSON.stringify(plans)}</script></body></html>`,interpreted=interpretSubscriptionPage({body,url,providerName:name}),found=discovery(body);
 assert.deepEqual(interpreted.services.map(row=>[row.name,row.support]),[[name,['PAGE_TITLE','PRODUCT_DESCRIPTION','NATIVE_SUBSCRIPTION_PLAN_SET']]]);assert.deepEqual(found.services.map(row=>row.serviceName),[name]);
});

test('native plan state does not admit weak or ambiguous provider presentation',()=>{
 const name=binding.providerIdentity.presentationName,plans=`<script type="application/json">${JSON.stringify({subscriptionPlans:[{price:'9.99',renewal_period:'month'}]})}</script>`,cases=[
  `<title>Choose your subscription plan</title><meta name="description" content="Choose a subscription plan that is right for you.">${plans}`,
  `<title>Choose your subscription plan</title><meta name="description" content="Choose the ${name} subscription plan."><meta property="og:description" content="A different ${name} membership service.">${plans}`,
  `<title>Choose your subscription plan</title><meta property="og:title" content="A different product"><meta name="description" content="Choose the ${name} subscription plan.">${plans}`,
  `<title>Choose your subscription plan</title><meta name="description" content="Choose the ${name} subscription plan.">`
 ];
 for(const body of cases){assert.deepEqual(interpretSubscriptionPage({body,url,providerName:name}).services,[]);assert.deepEqual(discovery(body).services,[]);}
});

test('ordinary presentation fails closed across weak conflicting third-party and ambiguous shapes',()=>{
 const cases=[
  ['generic subscribe CTA','<main><a href="/join">Subscribe now</a></main>'],
  ['newsletter subscription',presented({name:'Daily Brief',title:'Daily Brief | Newsletter subscription',description:'Daily Brief delivers a daily newsletter.'})],
  ['magazine title',presented({name:'Science Weekly',title:'Science Weekly | Magazine subscription',description:'Science Weekly publishes articles every week.'})],
  ['FAQ heading','<main><h2>Subscription FAQ</h2><p>How subscriptions work.</p></main>'],
  ['navigation heading','<nav><h2>Membership</h2><a href="/join">Join</a></nav>'],
  ['plan name alone','<article><h2>Premium</h2><p>Premium is a consumer subscription plan.</p></article>'],
  ['provider merchandise','<section><h2>Aurora Shirt</h2><p>Aurora Shirt is a merchandise product available for purchase.</p></section>'],
  ['retailer',presented({name:'Shopzone',title:'Shopzone | Acme app subscription',description:'Shopzone sells Acme subscriptions as a retailer.'})],
  ['third-party mention',presented({name:'ReviewHub',title:'ReviewHub | Acme app subscription',description:'ReviewHub reviews the Acme application.'})],
  ['generic account CTA','<main><h1>Account</h1><a href="/login">Log in to manage subscription</a></main>'],
  ['price card without Service','<article><h2>Gold</h2><p>EUR 9.99 per month.</p></article>'],
  ['conflicting product identities',presented().replace('content="Aurora | Personal finance app subscription"','content="Pulse | Personal finance app subscription"')],
  ['ambiguous multi-product','<section><h2>Orbit</h2><h2>Pulse</h2><p>One of these products is a consumer subscription app.</p></section>'],
  ['external link only','<main><a href="https://external.example/plans">Subscription plans</a></main>'],
  ['marketing heading','<main><h1>Unlimited Possibilities</h1><p>Everything you love in one place.</p></main>'],
  ['trial wording','<main><h2>Start today</h2><p>Try free for 30 days, then renew.</p></main>'],
  ['structured vocabulary noise','<script type="application/ld+json">{"@type":"Organization","description":"subscription app membership service"}</script><main>Welcome</main>'],
  ['unbound third-party component','<section><h2>Acme</h2><p>Acme is a consumer subscription app for personal reading.</p></section>'],
 ];
 assert.equal(cases.length,18);for(const [label,body]of cases){assert.deepEqual(page(body).services,[],label);assert.deepEqual(discovery(body).services,[],label);}
});
