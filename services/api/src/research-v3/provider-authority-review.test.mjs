import test from 'node:test';
import assert from 'node:assert/strict';
import {reviewCandidateAuthority,reviewCandidateAuthorityWithDiagnostic,reviewDelegatedCandidateAuthority,reviewProviderSeedAuthority,structuredExactOriginBounds} from './provider-authority-review.mjs';
import {providerOrBrandResearchTarget,providerSeedCampaignState} from './research-target.mjs';
import {runTarget,offlineCapabilities} from './runner.mjs';
import {checkpoint,digest,providerBound} from './model.mjs';
import {evaluate} from './truth.mjs';
import {interpretBillingFixture} from './billing-fixtures.test-support.mjs';

const name='Aurora Club',host='aurora.example',url=`https://${host}/membership`;
const objective={kind:'PRICE',serviceId:'aurora-club',serviceName:name,providerHosts:[],candidateHosts:[host],markets:['US'],seeds:[url]};
const owned=`<html><main><h1>${name} membership</h1><p>We operate ${name} membership and provide our own classes.</p><p>Personal consumer subscription price USD 12 per month.</p></main><footer>© ${name} 2026. All rights reserved.</footer></html>`;
const product=`<html><main><h1>${name} product</h1><p>Our ${name} subscription provides classes and content to members.</p></main><footer>© ${name} 2026.</footer></html>`;
const jsonLd=value=>`<script type="application/ld+json">${JSON.stringify(value)}</script>`;
const structured=jsonLd({'@context':'https://schema.org','@type':'Organization','@id':'https://aurora.example/#organization',name,url:'https://aurora.example'});
const observation=(body=owned,extra={})=>({id:'candidate-1',kind:'CANDIDATE',authority:'UNREVIEWED_CANDIDATE',url,context:{transport:'DIRECT',networkGeography:'UNBOUND',representation:'CANDIDATE_PAGE'},outcome:'OK',truncated:false,completeness:'COMPLETE',format:'WEB',httpStatus:200,access:[{decision:'ALLOWED'}],body,sha256:digest(body),...extra});
const review=(body,extra={})=>reviewCandidateAuthority(observation(body,extra),objective);
const structuredReview=(value,{serviceName=name,candidateUrl=url}={})=>{const body=jsonLd(value),candidateHost=new URL(candidateUrl).hostname;return reviewCandidateAuthority(observation(body,{url:candidateUrl}),{...objective,serviceName,candidateHosts:[candidateHost],seeds:[candidateUrl]});};
const robots={url:`https://${host}/robots.txt`,transport:'DIRECT',status:404,contentType:'text/plain',body:''};
const fixture=(body=owned,bounds={actions:2,acquisitions:2,searches:0,modelCalls:0})=>({objective,permissions:{DIRECT:true},bounds,fixtures:[robots,{url,transport:'DIRECT',body}]});
const execute=(input,extra={})=>runTarget({input,capabilities:offlineCapabilities(input),interpret:interpretBillingFixture,...extra});
const providerSeed=(seedName,body,{candidateUrl=url,observationExtra={}}={})=>reviewProviderSeedAuthority(observation(body,{url:candidateUrl,...observationExtra}),providerOrBrandResearchTarget({seedName,targetMarket:'DE'}),{candidateHosts:[new URL(candidateUrl).hostname]});
const coherentProvider=(presentation,{legalName=null,providerUrl=url,canonical=providerUrl}={})=>`<link rel="canonical" href="${canonical}">${jsonLd({'@type':'Organization',name:presentation,...(legalName?{legalName}:{}),url:providerUrl})}${jsonLd({'@type':'WebSite',name:presentation,url:providerUrl})}`;
const presentationPage=({presentation='Acme',candidateUrl='https://acme.example/',title=`${presentation} | Unlimited reading`,openGraphTitle=title,description=`${presentation} gives members unlimited access to magazines and newspapers.`,canonical=candidateUrl,openGraphUrl=candidateUrl,siteIdentity=null,applicationName=null,type='website',extraHead='',body='<main>Member access</main>'}={})=>`<html><head>${title===null?'':`<title>${title}</title>`}${openGraphTitle===null?'':`<meta property="og:title" content="${openGraphTitle}">`}${canonical===null?'':`<link rel="canonical" href="${canonical}">`}${openGraphUrl===null?'':`<meta property="og:url" content="${openGraphUrl}">`}${description===null?'':`<meta name="description" content="${description}"><meta property="og:description" content="${description}">`}${siteIdentity===null?'':`<meta property="og:site_name" content="${siteIdentity}">`}${applicationName===null?'':`<meta name="application-name" content="${applicationName}">`}${type===null?'':`<meta property="og:type" content="${type}">`}${extraHead}</head><body>${body}</body></html>`;
const legalRelationshipPage=({seed='Lumen',candidateUrl='https://lumen.example/terms',operator='Lumen DE GmbH',contactHost=new URL(candidateUrl).hostname,heading=`${seed} TERMS & CONDITIONS`,relationship=`Welcome to ${seed}. We provide our subscribers with access to films. These Terms are subject to change at ${seed}'s sole discretion.`,extra='',link=''}={})=>`<html><head><link rel="canonical" href="${candidateUrl}"><title>${seed}</title></head><body><h1>${heading}</h1><section>${relationship}</section><section>Finally, deliver notices to ${seed}'s Designated Copyright Agent: legal [at] ${contactHost} ${operator}</section>${link}${extra}</body></html>`;

test('first-party homepage and product presentation admit only the exact candidate host with audited spans',()=>{
    for(const body of [owned,product]){
        const binding=review(body);
        assert.equal(binding?.host,host);
        assert.equal(binding.kind,'AUTONOMOUS_FIRST_PARTY_PRESENTATION');
        assert.equal(binding.reason,'FIRST_PARTY_PRESENTATION');
        assert.equal(binding.serviceId,objective.serviceId);
        assert.equal(binding.url,url);
        assert.equal(binding.bodySha256,digest(body));
        for(const locator of Object.values(binding.locators)){
            assert.equal(body.slice(locator.start,locator.end),locator.quote);
            assert.equal(digest(locator.quote),locator.sha256);
        }
    }
});

test('a differently named publisher can explicitly identify its own operated service',()=>{
    const body=`<main><p>Aurora Holdings operates ${name} and provides its membership service.</p></main><footer>© Aurora Holdings 2026.</footer>`;
    assert.equal(review(body)?.host,host);
    assert.equal(review(body.replace('operates','reviews')),null);
});

test('bounded exact target Organization URL establishes exact-host authority without a footer',()=>{
    const body=`<html><head><link rel="canonical" href="${url}">${structured}</head><main>${name} membership</main></html>`,binding=review(body);
    assert.equal(binding?.host,host);assert.equal(binding.reason,'STRUCTURED_EXACT_ORIGIN_IDENTITY');assert.equal(binding.scope,'EXACT_HOST_PROVIDER_SOURCING');
    for(const source of binding.locators.structuredSources)assert.equal(digest(body.slice(source.start,source.end)),source.sha256);assert.equal(binding.locators.representation.normalizedUrl,'https://aurora.example/');
});

test('bounded same-document @graph and @id resolution joins one Organization representation',()=>{
    const body=jsonLd({'@context':'https://schema.org','@graph':[{'@id':'#provider','@type':'https://schema.org/Corporation',name},{'@id':'#provider',url:'https://aurora.example/about'}]}),binding=review(body);
    assert.equal(binding?.reason,'STRUCTURED_EXACT_ORIGIN_IDENTITY');assert.equal(binding.host,host);assert.equal(binding.locators.representation.id,'#provider');
});

test('legacy exact-name and first-party proof objects remain byte-stable',()=>{
    assert.deepEqual(review(structured),{host:'aurora.example',kind:'AUTONOMOUS_FIRST_PARTY_PRESENTATION',reason:'STRUCTURED_EXACT_ORIGIN_IDENTITY',scope:'EXACT_HOST_PROVIDER_SOURCING',sourceRole:'CANDIDATE_PAGE',serviceId:'aurora-club',serviceName:'Aurora Club',url:'https://aurora.example/membership',observation:'candidate-1',bodySha256:'0c00d101cd9f07715c121b74b9e912d3d2b8a6d99664aa1ea7c365855c9341d9',locators:{structuredSources:[{start:35,end:188,sha256:'623247d9f10a23c2d085f91c58d3e8414f31bf32b92616bd0dda2b2289a31847'}],representation:{id:'https://aurora.example/#organization',jsonPointers:{types:['/@type'],names:['/name'],url:'/url'},normalizedUrl:'https://aurora.example/'}}});
    assert.deepEqual(review(owned),{host:'aurora.example',kind:'AUTONOMOUS_FIRST_PARTY_PRESENTATION',reason:'FIRST_PARTY_PRESENTATION',scope:'EXACT_HOST_PROVIDER_SOURCING',sourceRole:'CANDIDATE_PAGE',serviceId:'aurora-club',serviceName:'Aurora Club',url:'https://aurora.example/membership',observation:'candidate-1',bodySha256:'ea63702d914c1c33abc1682ccb30083e610f986b17360dbdf47f58e566bc08fb',locators:{publisher:{start:188,end:228,quote:'© Aurora Club 2026. All rights reserved.',sha256:'18eed49635f61a8897fb0b2795e435e9709aa075369465af829a6076c8178cfa'},relation:{start:46,end:108,quote:'We operate Aurora Club membership and provide our own classes.',sha256:'bd0bc478e79b3a62f9dffc0ab839a76927bbcb1b2c7380fe910181efcd78af69'}}});
});

test('exact-origin Organization alternateName and exact legalName add distinct source-bound proofs',()=>{
    const alternate=structuredReview({'@type':'Organization',name:'Aurora Holdings',alternateName:name,url:'https://aurora.example'});
    assert.equal(alternate?.reason,'STRUCTURED_EXACT_ORIGIN_ALTERNATE_IDENTITY');assert.equal(alternate.scope,'EXACT_HOST_PROVIDER_SOURCING');assert.deepEqual(alternate.locators.representation.requestedIdentity,{property:'alternateName',values:[name]});
    const legal=structuredReview({'@type':'Corporation',name:'Aurora Holdings',legalName:name,url:'https://aurora.example'});
    assert.equal(legal?.reason,'STRUCTURED_EXACT_ORIGIN_LEGAL_IDENTITY');assert.deepEqual(legal.locators.representation.requestedIdentity,{property:'legalName',values:[name]});
});

test('semantic and legal suffix shortening remain unresolved without explicit identity',()=>{
    for(const organizationName of ['Acme Fitness','Acme Fitness LLC'])assert.equal(structuredReview({'@type':'Organization',name:organizationName,legalName:organizationName,url:'https://aurora.example'},{serviceName:'Acme'}),null);
});

test('provider seed research preserves exact source identity and resolves one coherent presentation expansion',()=>{
    const exact=providerSeed('Acme',coherentProvider('Acme'));
    assert.equal(exact?.providerIdentity.presentationName,'Acme');
    const expanded=providerSeed('Acme',coherentProvider('Acme Digital',{legalName:'Acme Digital GmbH'}));
    assert.equal(expanded?.providerIdentity.presentationName,'Acme Digital');
    assert.equal(expanded.providerIdentity.legalName,'Acme Digital GmbH');
    assert.equal(expanded.researchTarget.seedName,'Acme');
    assert.deepEqual(expanded.resolution,{mechanism:'SOURCE_PRESENTATION_SINGLE_TOKEN_EXPANSION',originalSeed:'Acme',sourceProviderPresentation:'Acme Digital',legalIdentity:'Acme Digital GmbH',authoritativeHost:host});
    assert.equal(expanded.proof.reason,'STRUCTURED_EXACT_ORIGIN_PROVIDER_SEED_RESOLUTION');
});

test('provider seed accepts exact-host first-party document presentation without structured data',()=>{
    const exact=providerSeed('Acme',presentationPage(),{candidateUrl:'https://acme.example/'});
    assert.equal(exact?.providerIdentity.presentationName,'Acme');assert.equal(exact.proof.reason,'EXACT_HOST_FIRST_PARTY_DOCUMENT_PRESENTATION');assert.equal(exact.proof.scope,'EXACT_HOST_PROVIDER_SOURCING');assert.equal(exact.host,'acme.example');assert.equal(exact.resolution.mechanism,'NORMALIZED_SOURCE_IDENTITY');
    assert.equal(exact.providerIdentity.source.locators.documentPresentation.selfReferences[0].normalizedUrl,'https://acme.example/');

    const expandedBody=presentationPage({presentation:'Northstar Digital',candidateUrl:'https://northstar.example/',title:'Northstar Digital | Project workspace',description:'Northstar Digital provides members access to one productivity platform.',siteIdentity:'Northstar Digital'}),expanded=providerSeed('Northstar',expandedBody,{candidateUrl:'https://northstar.example/'});
    assert.equal(expanded?.providerIdentity.presentationName,'Northstar Digital');assert.equal(expanded.resolution.mechanism,'SOURCE_PRESENTATION_SINGLE_TOKEN_EXPANSION');assert.equal(expanded.proof.reason,'EXACT_HOST_FIRST_PARTY_DOCUMENT_PRESENTATION');

    const applicationBody=presentationPage({presentation:'Cloudbox',candidateUrl:'https://cloudbox.example/app',title:'Cloudbox — Personal cloud storage',description:'Cloudbox offers members secure storage and software access.',applicationName:'Cloudbox',body:'<section><h1>Store files on every device</h1></section>'}),application=providerSeed('Cloudbox',applicationBody,{candidateUrl:'https://cloudbox.example/app'});
    assert.equal(application?.providerIdentity.presentationName,'Cloudbox');assert.equal(application.host,'cloudbox.example');assert.equal(application.proof.reason,'EXACT_HOST_FIRST_PARTY_DOCUMENT_PRESENTATION');
});

test('exact-host first-party legal relationship reuses bounded presentation authority',()=>{
    const candidateUrl='https://lumen.example/terms',body=legalRelationshipPage({candidateUrl}),binding=providerSeed('Lumen',body,{candidateUrl});
    assert.equal(binding?.host,'lumen.example');assert.equal(binding.proof.kind,'AUTONOMOUS_FIRST_PARTY_PRESENTATION');assert.equal(binding.proof.reason,'FIRST_PARTY_PRESENTATION');assert.equal(binding.providerIdentity.presentationName,'Lumen');assert.equal(binding.providerIdentity.legalName,'Lumen DE GmbH');assert.equal(binding.proof.scope,'EXACT_HOST_PROVIDER_SOURCING');
    for(const locator of Object.values(binding.proof.locators)){assert.equal(body.slice(locator.start,locator.end),locator.quote);assert.equal(digest(locator.quote),locator.sha256);}
});

test('explicit legal relationship does not broaden exact-host authority and existing bounded delegation remains explicit',()=>{
    const sourceUrl='https://lumen.example/terms',destinationUrl='https://billing.lumen.example/plans',anchor=`<a href="${destinationUrl}">Membership plans</a>`,sourceBody=legalRelationshipPage({candidateUrl:sourceUrl,link:anchor}),sourceObservation=observation(sourceBody,{url:sourceUrl}),destinationBody=presentationPage({presentation:'Lumen',candidateUrl:destinationUrl}),candidateObservation=observation(destinationBody,{url:destinationUrl}),start=sourceBody.indexOf(anchor),designation={kind:'V3_SOURCE_BOUND_CONTINUATION',start,end:start+anchor.length,sha256:digest(anchor),url:destinationUrl,label:'Membership plans'},delegated=reviewDelegatedCandidateAuthority(candidateObservation,{...objective,serviceId:'lumen',serviceName:'Lumen',candidateHosts:['billing.lumen.example']},{authorityObservation:sourceObservation,designation});
    assert.equal(providerSeed('Lumen',sourceBody,{candidateUrl:sourceUrl}).host,'lumen.example');assert.equal(delegated?.host,'billing.lumen.example');assert.equal(reviewDelegatedCandidateAuthority(candidateObservation,{...objective,serviceId:'lumen',serviceName:'Lumen',candidateHosts:['billing.lumen.example']},{authorityObservation:sourceObservation}),null,'ordinary cross-domain link without explicit designation grants nothing');
});

test('first-party legal relationship fails closed for phishing same-brand reseller third-party and generic legal shapes',()=>{
    const candidateUrl='https://lumen.example/terms',rows=[
        ['phishing lookalike',`<html><head><link rel="canonical" href="${candidateUrl}"><title>Lumen</title></head><body><h1>Lumen</h1><img alt="Lumen logo"></body></html>`],
        ['unrelated same-brand operator',legalRelationshipPage({candidateUrl,operator:'Lumen Plumbing LLC'})],
        ['reseller',legalRelationshipPage({candidateUrl,operator:'Gear Shop LLC',relationship:'Welcome to Gear Shop. We sell Lumen subscriptions supplied by another provider.'})],
        ['social',`<html><head><link rel="canonical" href="${candidateUrl}"><title>Lumen</title></head><body>Lumen profile on Social Network</body></html>`],
        ['app store',`<html><head><link rel="canonical" href="${candidateUrl}"><title>Lumen</title></head><body>Download Lumen from App Store</body></html>`],
        ['encyclopedia',`<html><head><link rel="canonical" href="${candidateUrl}"><title>Lumen</title></head><body>Lumen is an encyclopedia article.</body></html>`],
        ['generic legal mention',`<html><head><link rel="canonical" href="${candidateUrl}"><title>Legal</title></head><body><h1>Terms</h1><p>Lumen is mentioned here.</p></body></html>`],
        ['cross-host canonical',legalRelationshipPage({candidateUrl:'https://other.example/terms',contactHost:'lumen.example'})],
    ];
    for(const [label,body]of rows)assert.equal(providerSeed('Lumen',body,{candidateUrl}),null,label);
});

test('first-party document presentation fails closed across twenty generalized adversarial shapes',()=>{
    const good=presentationPage(),thirdParty=(overrides={})=>presentationPage({title:'Acme Review | Independent Review',openGraphTitle:'Acme Review | Independent Review',description:'Acme review compares subscription services for readers.',siteIdentity:'Independent Review',...overrides}),rows=[
        ['search snippet','<main>Search result: Acme official subscription site</main>',{}],
        ['hostname resemblance',presentationPage({presentation:'Other Media',candidateUrl:'https://acme-news.example/',title:'Other Media | News',description:'Other Media provides members access to news.',siteIdentity:'Other Media'}),{candidateUrl:'https://acme-news.example/'}],
        ['title alone','<html><head><title>Acme</title></head><body></body></html>',{}],
        ['logo alone','<html><head><link rel="canonical" href="https://acme.example/"></head><body><img alt="Acme" src="logo.svg"></body></html>',{}],
        ['third-party review',thirdParty(),{}],
        ['retailer',presentationPage({title:'Acme Store | Retailer',openGraphTitle:'Acme Store | Retailer',description:'Acme Store sells subscription products as a retailer.',siteIdentity:'Acme Store'}),{}],
        ['article',presentationPage({type:'article'}),{}],
        ['social profile',presentationPage({type:'profile',title:'Acme | Social Network',openGraphTitle:'Acme | Social Network',description:'Acme is a profile on a social network.'}),{}],
        ['parked domain',presentationPage({description:'Acme is a parked domain available for sale.'}),{}],
        ['ambiguous landing',presentationPage({description:'Welcome to Acme.'}),{}],
        ['conflicting title and og',presentationPage({openGraphTitle:'Other Provider | Unlimited reading'}),{}],
        ['conflicting canonical pair',presentationPage({extraHead:'<link rel="canonical" href="https://other.example/">'}),{}],
        ['cross-host canonical',presentationPage({canonical:'https://other.example/'}),{}],
        ['malformed metadata','<html><head><title>Acme | Unlimited reading</title><meta property="og:title"><link rel="canonical" href="https://acme.example/"><meta name="description" content="Acme gives members unlimited access."></head></html>',{}],
        ['competing provider identities',presentationPage({siteIdentity:'Other Provider'}),{}],
        ['unrelated operator',presentationPage({title:'Daily Publisher | Acme report',openGraphTitle:'Daily Publisher | Acme report',description:'Daily Publisher publishes news about Acme.',siteIdentity:'Daily Publisher',type:'website'}),{}],
        ['ordinary link','<html><head><title>Directory</title></head><body><a href="https://acme.example/">Acme</a></body></html>',{}],
        ['redirect-only observation',good,{observationExtra:{outcome:'REDIRECTED'}}],
        ['partial observation',good,{observationExtra:{truncated:true,completeness:'INCOMPLETE'}}],
        ['stale cross-campaign shape',good,{observationExtra:{authority:'REVIEWED_PROVIDER',context:{transport:'DIRECT',networkGeography:'UNBOUND',representation:'PROVIDER_PAGE'}}}],
    ];
    assert.equal(rows.length,20);
    for(const [label,body,options]of rows)assert.equal(providerSeed('Acme',body,{candidateUrl:'https://acme.example/',...options}),null,label);
});

test('provider seed resolution creates only routing authority and invents no Service or verified fact',()=>{
    const binding=providerSeed('Acme',coherentProvider('Acme Digital',{legalName:'Acme Digital GmbH'})),state=providerSeedCampaignState(providerOrBrandResearchTarget({seedName:'Acme',targetMarket:'DE'}),{providerAuthorityBinding:binding});
    assert.deepEqual(state.services,[]);assert.equal(state.serviceDiscovery.status,'PROVIDER_ESTABLISHED_SERVICE_DISCOVERY_REQUIRED');
    for(const field of ['service','serviceId','serviceName','amount','currency','cadence','market','offering','catalog'])assert.equal(Object.hasOwn(binding,field),false,field);
});

test('provider seed expansion rejects lexical overlap without coherent source presentation corroboration',()=>{
    for(const [seed,presentation] of [['Apple','Apple Valley Dental'],['Prime','Prime Plumbing'],['Max','Maximum Security Services'],['Core','Core Fitness'],['Now','Nowhere Media']]){
        const body=jsonLd({'@type':'Organization',name:presentation,url});
        assert.equal(providerSeed(seed,body),null,`${seed} -> ${presentation}`);
    }
});

test('provider seed expansion rejects domain redirect snippet third-party ambiguity and canonical conflict',()=>{
    assert.equal(providerSeed('Acme','<main>Acme Digital</main>'),null,'domain resemblance or page text');
    assert.equal(providerSeed('Acme','<main>Redirected to Acme Digital official site</main>'),null,'redirect text');
    assert.equal(providerSeed('Acme','<main>Search result: Acme Digital official provider</main>'),null,'search snippet');
    assert.equal(providerSeed('Acme',`${jsonLd({'@type':'Product',name:'Listing',brand:{'@type':'Brand',name:'Acme Digital'}})}${jsonLd({'@type':'Article',publisher:{'@type':'Organization',name:'Retail Review',url}})}`),null,'retailer/review');
    assert.equal(providerSeed('Acme',`${coherentProvider('Acme Digital')}${jsonLd({'@type':'Organization',name:'Acme Labs',url})}`),null,'multiple provider identities');
    assert.equal(providerSeed('Acme',coherentProvider('Acme Digital',{canonical:'https://other.example/'})),null,'canonical conflict');
});

test('Organization brand relationship supports embedded and exact same-script @id Brand objects',()=>{
    const embedded=structuredReview({'@type':'Organization',name:'Aurora Holdings',url:'https://aurora.example',brand:{'@type':'Brand',name}});
    assert.equal(embedded?.reason,'STRUCTURED_EXACT_ORIGIN_RELATED_IDENTITY');assert.equal(embedded.locators.representation.relationship.predicate,'brand');
    const referenced=structuredReview({'@context':'https://schema.org','@graph':[{'@id':'#provider','@type':'Organization',name:'Aurora Holdings',url:'https://aurora.example',brand:{'@id':'#brand'}},{'@id':'#brand','@type':'Brand',name}]});
    assert.equal(referenced?.reason,'STRUCTURED_EXACT_ORIGIN_RELATED_IDENTITY');assert.equal(referenced.locators.representation.relationship.targetId,'#brand');assert.ok(referenced.locators.representation.relationship.referencePointer.endsWith('/@id'));
});

test('Service provider and publisher relationships bind only their exact-origin Organization',()=>{
    for(const predicate of ['provider','publisher']){
        const value={'@context':'https://schema.org','@graph':[{'@id':'#service','@type':'Service',name,[predicate]:{'@id':'#provider'}},{'@id':'#provider','@type':'Organization',name:'Aurora Holdings',url:'https://aurora.example'}]},binding=structuredReview(value);
        assert.equal(binding?.reason,'STRUCTURED_EXACT_ORIGIN_RELATED_IDENTITY',predicate);assert.equal(binding.locators.representation.requestedIdentity.type,'Service');assert.equal(binding.locators.representation.relationship.predicate,predicate);
    }
});

test('SoftwareApplication provider and publisher relationships are allowlisted',()=>{
    for(const predicate of ['provider','publisher']){
        const binding=structuredReview({'@type':'SoftwareApplication',name,[predicate]:{'@type':'Corporation',name:'Aurora Software',url:'https://aurora.example'}});
        assert.equal(binding?.reason,'STRUCTURED_EXACT_ORIGIN_RELATED_IDENTITY',predicate);assert.equal(binding.locators.representation.requestedIdentity.type,'SoftwareApplication');
    }
});

test('WebSite publisher and Product manufacturer relationships are allowlisted',()=>{
    const website=structuredReview({'@type':'WebSite',name,publisher:{'@type':'Organization',name:'Aurora Holdings',url:'https://aurora.example'}});
    assert.equal(website?.locators.representation.relationship.predicate,'publisher');
    const product=structuredReview({'@type':'Product',name,manufacturer:{'@type':'Organization',name:'Aurora Manufacturing',url:'https://aurora.example'}});
    assert.equal(product?.locators.representation.relationship.predicate,'manufacturer');
});

test('new relationship proof retains identity edge provider and source locators',()=>{
    const binding=structuredReview({'@context':'https://schema.org','@graph':[{'@id':'#service','@type':'Service',name,provider:{'@id':'#provider'}},{'@id':'#provider','@type':'Organization',name:'Aurora Holdings',url:'https://aurora.example'}]}),r=binding.locators.representation;
    assert.ok(binding.bodySha256);assert.ok(binding.observation);assert.ok(binding.locators.structuredSources.every(source=>source.start>=0&&source.end>source.start&&source.sha256));
    assert.deepEqual(r.requestedIdentity.jsonPointers.names,['/@graph/0/name']);assert.equal(r.relationship.jsonPointer,'/@graph/0/provider');assert.equal(r.relationship.referencePointer,'/@graph/0/provider/@id');assert.deepEqual(r.providerOrganization.jsonPointers.names,['/@graph/1/name']);assert.deepEqual(r.providerOrganization.jsonPointers.urls,['/@graph/1/url']);assert.deepEqual(r.providerOrganization.normalizedUrls,['https://aurora.example/']);
});

test('brand co-location Product provider Product brand and Article publisher stay unresolved',()=>{
    const provider={'@id':'#provider','@type':'Organization',name:'Aurora Marketplace',url:'https://aurora.example'},brand={'@id':'#brand','@type':'Brand',name};
    const cases=[
        {'@context':'https://schema.org','@graph':[brand,provider]},
        {'@context':'https://schema.org','@graph':[{'@type':'Product',name,provider:{'@id':'#provider'}},provider]},
        {'@context':'https://schema.org','@graph':[{'@type':'Product',name:'Listed item',brand:{'@id':'#brand'}},brand,provider]},
        {'@context':'https://schema.org','@graph':[{'@type':'Article',publisher:{'@id':'#provider'},about:{'@type':'Product',name,brand:{'@id':'#brand'}}},brand,provider]},
        {'@type':'SoftwareApplication',name,description:'Marketplace listing with no provider or publisher relationship'},
    ];
    for(const value of cases)assert.equal(structuredReview(value),null,JSON.stringify(value));
});

test('substring token body and third-party publication signals cannot establish identity',()=>{
    assert.equal(structuredReview({'@type':'Organization',name:'Aurora Club Fitness',url:'https://aurora.example'}),null);
    assert.equal(structuredReview({'@type':'Organization',name:'Other Aurora Publisher',url:'https://aurora.example'}),null);
    assert.equal(review(`<main>${name} is mentioned in this review.</main><footer>© Daily Review 2026.</footer>`),null);
    assert.equal(review(`${jsonLd({'@type':'Organization',name:'Daily Review',url:'https://aurora.example'})}<main>${name}</main>`),null);
});

test('relationship graph fails closed for wrong host dangling duplicate conflicting circular and cross-script references',()=>{
    const service=provider=>({'@id':'#service','@type':'Service',name,provider}),provider=(id='#provider',providerName='Aurora Holdings',providerUrl='https://aurora.example')=>({'@id':id,'@type':'Organization',name:providerName,url:providerUrl});
    const cases=[
        {'@context':'https://schema.org','@graph':[service({'@id':'#provider'}),provider('#provider','Aurora Holdings','https://other.example')]},
        {'@context':'https://schema.org','@graph':[service({'@id':'#missing'})]},
        {'@context':'https://schema.org','@graph':[service({'@id':'#provider'}),provider(),{'@id':'#provider',name:'Conflicting Holdings'}]},
        {'@context':'https://schema.org','@graph':[{'@type':'Service',name,provider:[{'@id':'#one'},{'@id':'#two'}]},provider('#one','One Holdings'),provider('#two','Two Holdings')]},
        {'@context':'https://schema.org','@graph':[{'@id':'#service','@type':'Service',name,provider:{'@id':'#service'}}]},
    ];
    for(const value of cases)assert.equal(structuredReview(value),null,JSON.stringify(value));
    const crossScript=`${jsonLd({'@type':'Service',name,provider:{'@id':'#provider'}})}${jsonLd(provider())}`;assert.equal(review(crossScript),null);
    const siblingUrl='https://shop.aurora.example/membership';assert.equal(structuredReview({'@type':'Service',name,provider:{'@type':'Organization',name:'Aurora Holdings',url:'https://aurora.example'}},{candidateUrl:siblingUrl}),null);
});

test('new relationship resolver remains bounded malformed-safe and non-recursive',()=>{
    const relation={'@context':'https://schema.org','@graph':[{'@type':'Service',name,provider:{'@id':'#provider'}},{'@id':'#provider','@type':'Organization',name:'Aurora Holdings',url:'https://aurora.example'}]};
    const excessive={'@context':'https://schema.org','@graph':[...relation['@graph'],...Array.from({length:structuredExactOriginBounds.nodes},()=>({}))]};
    assert.equal(structuredReview(excessive),null);
    assert.equal(review('<script type="application/ld+json">{"@type":"Service",</script>'),null);
});

test('minimized retained Chess-shaped presentations use the same exact-origin invariant',()=>{
    const chessName='Chess.com',chessHost='www.chess.com',org={'@context':'https://schema.org','@type':'Organization','@id':'https://www.chess.com/#organization',name:chessName,url:'https://www.chess.com'},rows=[
        ['root','https://www.chess.com/',`<title>Chess.com - Play Chess Online</title>${jsonLd(org)}<main>Play Chess Online</main><footer>Chess.com, LLC © 2026</footer>`],
        ['play','https://www.chess.com/play',`<title>Play Chess Online - Chess.com</title>${jsonLd(org)}<main>Play online</main>`],
        ['membership','https://www.chess.com/membership',`<title>Premium Membership - Chess.com</title>${jsonLd(org)}<main>Choose a Plan</main>`],
        ['family','https://www.chess.com/family',`${jsonLd(org)}${jsonLd({'@type':'Article',mainEntityOfPage:{'@id':'https://www.chess.com/family'},publisher:{'@type':'Organization',name:chessName}})}<main>Our Friends & Family Plan</main><footer>Copyright 2026 Chess.com, LLC.</footer>`],
    ];
    for(const [id,chessUrl,body]of rows){const o={...observation(body),id,url:chessUrl},binding=reviewCandidateAuthority(o,{...objective,serviceId:'chess-com',serviceName:chessName,candidateHosts:[chessHost],seeds:[chessUrl]});assert.equal(binding?.reason,'STRUCTURED_EXACT_ORIGIN_IDENTITY',id);assert.equal(binding.host,chessHost,id);}
});

test('reseller, editorial, non-affiliation, platform and ambiguous same-name pages remain candidates',()=>{
    const pages=[
        `<main>We sell ${name} memberships and ship the provider's products.</main><footer>© Gear Shop 2026</footer>`,
        `<main>Our review of ${name} subscription compares other services.</main><footer>© Daily Review 2026</footer>`,
        `<main>We operate ${name} membership. We are not affiliated with ${name}.</main><footer>© ${name} 2026</footer>`,
        `<main>Our listing of ${name} app is hosted here. Follow ${name}.</main><footer>© App Store 2026</footer>`,
        `<main>Our profile lists ${name} content.</main><footer>© Social Network 2026</footer>`,
        `<title>${name}</title><main>${name} subscriptions are available here.</main><footer>© ${name} 2026</footer>`,
        `<main>We sell ${name} membership and products.</main><footer>© ${name} 2026</footer>`,
    ];
    for(const body of pages)assert.equal(review(body),null,body);
});

test('structured identity path rejects incomplete unrelated copied and publisher-only representations',()=>{
    const cases=[
        jsonLd({'@type':'Organization',name,logo:'https://aurora.example/logo.png'}),
        `${jsonLd({'@type':'Organization',name:'Daily Review',url:'https://aurora.example'})}<main>${name} review and logo</main>`,
        jsonLd({'@type':'Article',publisher:{'@type':'Organization',name,url:'https://aurora.example'}}),
        jsonLd({'@type':'Organization',name,url:'https://real-provider.example'}),
        jsonLd({'@type':'Organization',name:'App Store',url:'https://aurora.example',sameAs:['https://real-provider.example']}),
        jsonLd({'@type':'Organization',name,logo:'x',sameAs:['https://aurora.example']}),
        `<link rel="canonical" href="${url}"><main>${name}</main>`,
        `<script>window.data=${JSON.stringify({'@type':'Organization',name,url:'https://aurora.example'})}</script>`,
        `<!-- ${jsonLd({'@type':'Organization',name,url:'https://aurora.example'})} -->`,
        `<template>${jsonLd({'@type':'Organization',name,url:'https://aurora.example'})}</template>`,
    ];
    for(const body of cases)assert.equal(review(body),null,body.slice(0,200));
});

test('third-party commercial and infrastructure Organization records cannot borrow target mentions',()=>{
    for(const operator of ['Daily Review','Gear Reseller','Payments Processor','App Store','Static CDN','Support SaaS','Authentication Provider','Multi Tenant Pages']){
        const body=`${jsonLd({'@type':'Organization',name:operator,url:'https://aurora.example'})}<main>${name} logo, membership and official-looking profile</main>`;
        assert.equal(review(body),null,operator);
    }
    const copied=jsonLd({'@type':'Organization',name,url:'https://aurora.example'}),lookalike={...objective,candidateHosts:['aurora-club.pages.example'],seeds:['https://aurora-club.pages.example/membership']},o={...observation(copied),url:'https://aurora-club.pages.example/membership'};
    assert.equal(reviewCandidateAuthority(o,lookalike),null,'multi-tenant hostname and copied real-provider URL cannot establish the tenant host');
});

test('structured conflicts canonical contradictions malformed data and non-affiliation fail closed',()=>{
    const exact={'@type':'Organization',name,url:'https://aurora.example'};
    for(const body of [
        `${jsonLd(exact)}${jsonLd({'@type':'Organization',name,url:'https://other.example'})}`,
        `<link rel="canonical" href="https://other.example/membership">${jsonLd(exact)}`,
        '<script type="application/ld+json">{"@type":"Organization",</script>',
        `${jsonLd(exact)}<main>We are not affiliated with ${name}.</main>`,
    ])assert.equal(review(body),null);
    assert.equal(review(`<link rel="canonical" href="${url}">${jsonLd(exact)}`)?.reason,'STRUCTURED_EXACT_ORIGIN_IDENTITY','same-host canonical is non-authoritative and non-contradictory');
});

test('structured JSON-LD byte depth and total-node bounds fail closed',()=>{
    const oversized=jsonLd({'@type':'Organization',name,url:'https://aurora.example',description:'x'.repeat(structuredExactOriginBounds.scriptBytes)});
    let nested={};for(let index=0;index<structuredExactOriginBounds.depth+2;index++)nested={next:nested};
    const deep=jsonLd({'@type':'Organization',name,url:'https://aurora.example',nested});
    const excessive=jsonLd({'@context':'https://schema.org','@graph':[{'@type':'Organization',name,url:'https://aurora.example'},...Array.from({length:structuredExactOriginBounds.nodes},()=>({}))]});
    for(const body of [oversized,deep,excessive])assert.equal(review(body),null);
});

test('diagnostic wrapper is semantically differential and bounded across the existing authority mechanisms',()=>{
    const direct=jsonLd({'@type':'Organization',name,url:'https://aurora.example'}),alternate=jsonLd({'@type':'Organization',name:'Aurora Holdings',alternateName:name,url:'https://aurora.example'}),legal=jsonLd({'@type':'Corporation',name:'Aurora Holdings',legalName:name,url:'https://aurora.example'}),related=jsonLd({'@type':'Service',name,provider:{'@type':'Organization',name:'Aurora Holdings',url:'https://aurora.example'}}),rows=[owned,direct,alternate,legal,related,'<main>Unrelated directory</main>'];
    for(const body of rows){
        const oldBinding=review(body),result=reviewCandidateAuthorityWithDiagnostic(observation(body),objective);
        assert.deepEqual(result.binding,oldBinding);assert.equal(result.diagnostic.version,1);assert(result.diagnostic.mechanisms.length<=5);assert(Buffer.byteLength(JSON.stringify(result.diagnostic))<1400);
        assert.equal(result.diagnostic.decision,oldBinding?'ACCEPTED':'UNRESOLVED');
    }
    assert.equal(reviewCandidateAuthorityWithDiagnostic(observation(direct),objective).diagnostic.mechanisms[0].reason,'STRUCTURED_EXACT_ORIGIN_IDENTITY');
    assert.equal(reviewCandidateAuthorityWithDiagnostic(observation(alternate),objective).diagnostic.mechanisms[0].reason,'STRUCTURED_EXACT_ORIGIN_ALTERNATE_IDENTITY');
    assert.equal(reviewCandidateAuthorityWithDiagnostic(observation(legal),objective).diagnostic.mechanisms[0].reason,'STRUCTURED_EXACT_ORIGIN_LEGAL_IDENTITY');
    assert.equal(reviewCandidateAuthorityWithDiagnostic(observation(related),objective).diagnostic.mechanisms[0].reason,'STRUCTURED_EXACT_ORIGIN_RELATED_IDENTITY');
    assert.equal(reviewCandidateAuthorityWithDiagnostic(observation(owned),objective).diagnostic.mechanisms[0].reason,'FIRST_PARTY_PRESENTATION');
});

test('typed diagnostics distinguish deterministic refusal classes without changing null outcomes',()=>{
    const mechanism=(body,name)=>reviewCandidateAuthorityWithDiagnostic(observation(body),objective).diagnostic.mechanisms.find(row=>row.mechanism===name),provider=(id,providerName='Aurora Holdings')=>({'@id':id,'@type':'Organization',name:providerName,url:'https://aurora.example'});
    const rows=[
        [`<link rel="canonical" href="https://other.example/membership">${structured}`,'STRUCTURED_DIRECT_IDENTITY','CANONICAL_HOST_CONFLICT'],
        ['<script type="application/ld+json">{"@type":"Organization",</script>','STRUCTURED_DIRECT_IDENTITY','STRUCTURED_DATA_MALFORMED_OR_BOUNDED'],
        [jsonLd({'@type':'Organization',name:'Other Provider',url:'https://aurora.example'}),'STRUCTURED_DIRECT_IDENTITY','REQUESTED_IDENTITY_MISMATCH'],
        [jsonLd({'@graph':[{'@type':'Service',name,provider:{'@id':'#missing'}}]}),'STRUCTURED_TYPED_RELATIONSHIP','DANGLING_RELATIONSHIP_TARGET'],
        [`${jsonLd({'@type':'Service',name,provider:{'@id':'#provider'}})}${jsonLd(provider('#provider'))}`,'STRUCTURED_TYPED_RELATIONSHIP','CROSS_SCRIPT_RELATIONSHIP_NOT_ADMISSIBLE'],
        [jsonLd({'@graph':[{'@type':'Service',name,provider:[{'@id':'#one'},{'@id':'#two'}]},provider('#one','One Holdings'),provider('#two','Two Holdings')]}),'STRUCTURED_TYPED_RELATIONSHIP','MULTIPLE_CONFLICTING_PROVIDER_IDENTITIES'],
    ];
    for(const [body,kind,reason]of rows){const result=reviewCandidateAuthorityWithDiagnostic(observation(body),objective);assert.equal(result.binding,null);assert.equal(mechanism(body,kind).reason,reason);}
    const nonAffiliated=`<main>We operate ${name} membership. We are not affiliated with ${name}.</main><footer>© ${name} 2026</footer>`,nonAffiliation=reviewCandidateAuthorityWithDiagnostic(observation(nonAffiliated),objective);assert.equal(nonAffiliation.binding,null);assert.equal(mechanism(nonAffiliated,'FIRST_PARTY_PROSE').reason,'NON_AFFILIATION_OR_THIRD_PARTY_EXCLUSION');
    const coLocated=jsonLd({'@graph':[{'@type':'Brand',name},{'@type':'Organization',name:'Marketplace',url:'https://aurora.example'}]}),retailer=jsonLd({'@type':'Product',name:'Listed item',brand:{'@type':'Brand',name}}),article=jsonLd({'@type':'Article',publisher:{'@type':'Organization',name,url:'https://aurora.example'}});
    for(const body of [coLocated,retailer,article]){const result=reviewCandidateAuthorityWithDiagnostic(observation(body),objective);assert.equal(result.binding,null);assert.equal(result.diagnostic.reason,'NO_ACCEPTED_PROVIDER_PROOF');}
    const precondition=reviewCandidateAuthorityWithDiagnostic(observation(owned,{truncated:true}),objective);assert.equal(precondition.binding,null);assert.equal(precondition.diagnostic.reason,'OBSERVATION_PRECONDITION_FAILED');
    const hostMismatch=reviewCandidateAuthorityWithDiagnostic(observation(owned,{url:'https://other.example/'}),objective);assert.equal(hostMismatch.binding,null);assert.equal(hostMismatch.diagnostic.reason,'CANDIDATE_HOST_MISMATCH');
});

test('policy, integrity, completeness and final exact-host prerequisites fail closed',()=>{
    for(const extra of [
        {outcome:'POLICY_BLOCKED'}, {body:'',sha256:digest('')}, {truncated:true},
        {completeness:'INCOMPLETE'}, {httpStatus:503}, {access:[{decision:'DISALLOWED'}]},
        {sha256:'wrong'}, {url:'https://sibling.aurora.example/membership'},
        {url:'https://redirect.example/membership'}, {context:{representation:'PROVIDER_PAGE'}},
    ])assert.equal(reviewCandidateAuthority(observation(owned,extra),objective),null);
});

test('model failure and positive suggestions do not override native source proof',()=>{
    assert.equal(reviewCandidateAuthority(observation(owned,{interpretation:{kind:'UNDERSTANDING_FAILED',status:429}}),objective)?.host,host);
    assert.equal(reviewCandidateAuthority(observation('<main>Aurora Club</main>',{interpretation:{kind:'EVIDENCE',verdict:'FIRST_PARTY',confidence:1}}),objective),null);
});

test('promotion keeps its source candidate and admits only later provider observations into Truth',async()=>{
    const input=fixture();
    const {knowledge,result}=await execute(input);
    assert.deepEqual(knowledge.objective.providerHosts,[host]);
    assert.deepEqual(knowledge.objective.candidateHosts,[]);
    assert.equal(knowledge.authorityBindings.length,1);
    assert.equal(knowledge.authorityBindings[0].kind,'AUTONOMOUS_FIRST_PARTY_PRESENTATION');
    assert.equal(knowledge.observations[0].kind,'CANDIDATE');
    assert.equal(knowledge.observations[0].authority,'UNREVIEWED_CANDIDATE');
    assert.equal(knowledge.observations[0].context.representation,'CANDIDATE_PAGE');
    assert.equal(knowledge.observations[1].kind,'PROVIDER');
    assert.equal(knowledge.observations[1].context.representation,'PROVIDER_PAGE');
    assert.equal(providerBound(knowledge.objective,url),true);
    assert.equal(providerBound(knowledge.objective,'https://sibling.aurora.example/'),false);
    assert.equal(evaluate({...knowledge,observations:knowledge.observations.slice(0,1)}).established,false);
    assert.equal(result.truth.service.SERVICE_IDENTITY.state,'ESTABLISHED');
});

test('checkpoint resume revalidates autonomous source, exact host and decision',async()=>{
    const input=fixture(owned,{actions:1,acquisitions:1,searches:0,modelCalls:0});
    const first=await execute(input),saved=checkpoint(first.knowledge);
    assert.equal((await execute(input,{snapshot:saved})).knowledge.objective.providerHosts[0],host);
    for(const mutate of [
        payload=>{payload.authorityBindings[0].locators.relation.quote='forged';},
        payload=>{payload.observations[0].body+=' forged';},
        payload=>{payload.authorityBindings[0].host='sibling.aurora.example';},
        payload=>{payload.objective.providerHosts=['sibling.aurora.example'];},
    ]){
        const altered=structuredClone(saved);mutate(altered.payload);altered.sha256=digest(altered.payload);
        await assert.rejects(()=>execute(input,{snapshot:altered}),/RESUME_(AUTHORITY|OBJECTIVE)_MISMATCH/);
    }
});

test('structured authority checkpoint revalidates the same proof and stays outside Truth',async()=>{
    const body=`<main>${name} membership</main>${structured}`,input=fixture(body,{actions:1,acquisitions:1,searches:0,modelCalls:0}),first=await execute(input),saved=checkpoint(first.knowledge),binding=first.knowledge.authorityBindings[0];
    assert.equal(binding.reason,'STRUCTURED_EXACT_ORIGIN_IDENTITY');assert.equal(first.knowledge.observations[0].kind,'CANDIDATE');assert.equal(first.result.truth.established,false);
    const resumed=await execute(input,{snapshot:saved});assert.deepEqual(resumed.knowledge.authorityBindings,[binding]);assert.deepEqual(resumed.knowledge.objective.providerHosts,[host]);
    const changed=structuredClone(saved);changed.payload.authorityBindings[0].locators.representation.normalizedUrl='https://other.example/';changed.sha256=digest(changed.payload);await assert.rejects(()=>execute(input,{snapshot:changed}),/RESUME_AUTHORITY_MISMATCH/);
});

test('a completed candidate checkpoint resumes with a provider-context acquisition',async()=>{
    const input=fixture();let saved;
    await assert.rejects(()=>execute(input,{save:snapshot=>{
        if(snapshot.payload.authorityBindings.length&&snapshot.payload.pending===null&&snapshot.payload.usage.actions===1){saved=snapshot;throw Error('SIMULATED_PROCESS_STOP');}
    }}),/SIMULATED_PROCESS_STOP/);
    assert.ok(saved);
    const resumed=await execute(input,{snapshot:saved});
    assert.deepEqual(resumed.knowledge.observations.map(o=>o.kind),['CANDIDATE','PROVIDER']);
    assert.equal(resumed.result.truth.service.SERVICE_IDENTITY.state,'ESTABLISHED');
});

test('reviewed provider routing remains its existing path',async()=>{
    const reviewed={...fixture(),objective:{...objective,providerHosts:[host],candidateHosts:[]},provider:{reviewed:true,serviceId:objective.serviceId,hosts:[host]}};
    const {knowledge}=await execute(reviewed);
    assert.equal(knowledge.observations[0].kind,'PROVIDER');
    assert.deepEqual(knowledge.authorityBindings,[]);
});
