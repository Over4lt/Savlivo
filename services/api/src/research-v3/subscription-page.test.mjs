import test from 'node:test';
import assert from 'node:assert/strict';
import {interpretSubscriptionPage} from './subscription-page.mjs';
import {discoverSubscriptionServices} from './subscription-service-discovery.mjs';
import {providerOrBrandResearchTarget} from './research-target.mjs';
import {reviewProviderSeedAuthority} from './provider-authority-review.mjs';
import {context,digest} from './model.mjs';
import {projectObservation} from './projection.mjs';
import {admittedProjectionCandidates} from './native-structured.mjs';
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
