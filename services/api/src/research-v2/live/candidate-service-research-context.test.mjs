import '../offline-replay/offline-guard.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {digest} from '../../research-v3/model.mjs';
import {providerOrBrandResearchTarget} from '../../research-v3/research-target.mjs';
import {establishProviderSeedCandidateServiceContext,evaluateProviderSourceTruth} from './provider-source-v3.mjs';
import {destinationInformation} from './information-routing.mjs';
import {planResearch,nextDiscoveryQuery} from './research-planner.mjs';
import {acceptV3TruthNeeds} from './market-proof-continuation.mjs';
import {targetMarketStateGap,marketStateContinuationValue} from './provider-resource-routing.mjs';
import {targetMarketAcquisition} from './provider-access-gap.mjs';
import {executableAction} from './execution-capabilities.mjs';

const market='DE',host='northstar.example',membership=`https://${host}/memberships`,terms=`https://${host}/terms`,researchTarget=providerOrBrandResearchTarget({seedName:'Northstar',targetMarket:market});
const binding={contractVersion:1,researchTarget,host,providerIdentity:{presentationName:'Northstar GmbH'},proof:{url:terms,scope:'EXACT_HOST_PROVIDER_SOURCING'}};
const service={'@type':'SoftwareApplication',name:'Northstar Plus',description:'Consumer subscription membership',offers:{'@type':'OfferCatalog',name:'Membership plans',itemListElement:[{'@type':'Offer',name:'Personal',priceSpecification:{'@type':'UnitPriceSpecification',price:12,priceCurrency:'EUR',billingDuration:'P1M'}}]}};
const membershipBody=`<title>Northstar Plus</title><main><h1>Northstar Plus</h1><script type="application/ld+json">${JSON.stringify(service)}</script></main>`;
const termsBody=`<title>Northstar GmbH terms</title><main><h1>Legal terms</h1><p>Northstar GmbH operates this provider website.</p></main>`;
const observation=(id,url,body)=>({id,kind:'PROVIDER',authority:'REVIEWED_PROVIDER',url,context:{transport:'DIRECT',networkGeography:'UNBOUND',representation:'PROVIDER_PAGE'},outcome:'OK',truncated:false,completeness:'COMPLETE',format:'WEB',contentType:'text/html',httpStatus:200,access:[{decision:'ALLOWED'}],body,sha256:digest(body)});
const membershipObservation=observation('membership-source',membership,membershipBody),termsObservation=observation('terms-source',terms,termsBody);
const candidateContext=()=>({contractVersion:1,kind:'CANDIDATE_SERVICE_RESEARCH_CONTEXT',serviceId:'candidate-northstar',candidateId:'candidate-northstar',serviceName:'Northstar GmbH',status:'SERVICE_UNRESOLVED',truthAuthority:'NONE',admitted:false,researchPermission:false,providerRelationship:{kind:'CANDIDATE_UNDER_REVIEWED_PROVIDER',host,bindingReference:binding},objective:{kind:'SUBSCRIPTION_PRICE',market,seedName:'Northstar'},objectiveResource:{url:membership,observation:membershipObservation.id,sha256:membershipObservation.sha256,selection:'PROVIDER_SEED_OBJECTIVE_RELEVANCE'},objectiveLeads:[{url:membership,title:'Membership plans',providerSeedObjectiveLead:true,objectiveProgressValue:16,objectiveScore:16,targetMarket:market,acquisitionStatus:'ACQUIRED',authorityStatus:'EXACT_HOST_ESTABLISHED',canContributeEvidence:true,evidenceStatus:'DISCOVERY_LEAD_ONLY',authoritative:false,truthAuthority:'NONE'}],sourceObservations:[membershipObservation,termsObservation].map(row=>({id:row.id,url:row.url,sha256:row.sha256}))});
const target=(extra={})=>({id:'candidate-northstar-DE',service:'candidate-northstar',serviceName:'Northstar GmbH',market,researchObjective:'SERVICE_COVERAGE',smartResearch:{version:2},providerSeedResearchTarget:researchTarget,providerSeedCandidateServiceContext:candidateContext(),urls:[membership,terms],knownCommercialUrls:[membership,terms],authorities:[{hostname:host,provider:'Northstar GmbH',sourceType:'OFFICIAL_PROVIDER',sourceUrl:terms,checkedAt:'2026-10-13T00:00:00.000Z'}],reads:[],queries:[],decisions:[],blockedOrigins:[],verified:[],gaps:['plan','amount','currency','cadence','priceRole','ownership','market'],capabilities:{direct:true,tavily:false,decodo:true,browser:false,groq:false},...extra});
const retained=row=>({url:row.url,requestedUrl:row.url,httpStatus:200,contentType:'text/html',bodyHash:row.sha256,sourceIntegrity:{sha256:row.sha256},rawSource:{text:row.body},accessDecisions:[{decision:'ALLOWED'}]});

test('A old Service fanout identity is reconstructed as non-authoritative research context',()=>{
 const value=target(),context=establishProviderSeedCandidateServiceContext({target:value,providerAuthorityBinding:binding,observations:[membershipObservation,termsObservation]});
 assert.equal(context.status,'CANDIDATE_SERVICE_UNDERSTOOD');assert.equal(context.serviceName,'Northstar Plus');assert.equal(context.sourceServiceId,'northstar-plus');assert.equal(context.serviceId,value.service);assert.equal(context.admitted,false);assert.equal(context.researchPermission,false);assert.equal(context.truthAuthority,'NONE');assert.equal(value.v3Truth,undefined);
});

test('B candidate Service can name the research objective without establishing Service Truth',()=>{
 const value=target();establishProviderSeedCandidateServiceContext({target:value,providerAuthorityBinding:binding,observations:[membershipObservation,termsObservation]});const result=evaluateProviderSourceTruth({target:value,retained:retained(termsObservation),acquisition:{route:'DIRECT'},observationId:'legal-evaluation'});
 assert.equal(value.providerSeedCandidateServiceContext.status,'CANDIDATE_SERVICE_UNDERSTOOD');assert.equal(value.providerSeedCandidateServiceContext.serviceName,'Northstar Plus');assert.equal(value.providerSeedCandidateServiceContext.truthAuthority,'NONE');assert.equal(result.v3Truth.service.SERVICE_IDENTITY.state,'UNRESOLVED');
});

test('C membership and legal observations compose under one stable candidate identity',()=>{
 const value=target(),before=value.providerSeedCandidateServiceContext.candidateId,context=establishProviderSeedCandidateServiceContext({target:value,providerAuthorityBinding:binding,observations:[membershipObservation,termsObservation]});
 assert.equal(context.candidateId,before);assert.deepEqual(context.sourceObservations.map(row=>row.url),[membership,terms]);assert.equal(context.sourceRelationship.sourceUrl,membership);assert.equal(context.providerRelationship.host,host);
});

test('D late legal authority does not replace the retained membership objective resource',()=>{
 const value=target();establishProviderSeedCandidateServiceContext({target:value,providerAuthorityBinding:binding,observations:[membershipObservation,termsObservation]});evaluateProviderSourceTruth({target:value,retained:retained(termsObservation),acquisition:{route:'DIRECT'},observationId:'late-authority'});
 assert.equal(value.providerSeedCandidateServiceContext.objectiveResource.url,membership);assert.equal(value.providerSeedCandidateServiceContext.objectiveResource.sha256,membershipObservation.sha256);
});

function unresolvedMarketTarget(){
 const value=target(),proposition=(state,value0)=>({state,value:value0,evidence:[],contradictions:[]}),truth={prices:{DE:{id:'personal',propositions:{SERVICE_IDENTITY:proposition('ESTABLISHED',true),PRICE_AMOUNT:proposition('ESTABLISHED',12),CURRENCY:proposition('ESTABLISHED','EUR'),MONTHLY_SUBSCRIPTION:proposition('ESTABLISHED',true),CONSUMER_SUBSCRIPTION:proposition('ESTABLISHED',true),TARGET_MARKET:proposition('UNRESOLVED',null)}}},needs:[{id:'DE:personal:TARGET_MARKET',proposition:'TARGET_MARKET',market:'DE',offerId:'personal',state:'UNRESOLVED'}]},v3Observation={id:'direct-membership',kind:'PROVIDER',url:membership,sha256:membershipObservation.sha256,context:{transport:'DIRECT',networkGeography:'UNBOUND',representation:'PROVIDER_PAGE'}};
 value.reads=[{requestedUrl:membership,url:membership,outcome:'OK',bodyHash:membershipObservation.sha256,sourceIntegrity:{sha256:membershipObservation.sha256},accessDecisions:[{decision:'ALLOWED'}]}];value.providerInterpretations=[{url:membership,v3Truth:truth,v3Observation}];acceptV3TruthNeeds(value,{v3Truth:truth,v3Observation,v3Catalog:{state:'CATALOG_UNRESOLVED',offeringState:'OFFERING_FOUND',scope:'UNRESOLVED'}});value.leads=[{url:terms,title:'Legal terms',navigationOnly:true},{url:membership,title:'Membership plans',navigationOnly:true}];return value;
}

test('E OFFERING_FOUND plus a DE gap retains an executable country action',()=>{
 const value=unresolvedMarketTarget();value.v3Catalog={state:'CATALOG_UNRESOLVED',offeringState:'OFFERING_FOUND',scope:'UNRESOLVED'};const plan=planResearch(value);assert.equal(plan.route,'DECODO');assert.equal(plan.url,membership);assert.equal(plan.reason,'TARGET_MARKET_OBSERVATION_REQUIRED');
});

test('F membership objective resource outranks legal terms for country acquisition',()=>{
 const value=unresolvedMarketTarget(),plan=planResearch(value);assert.equal(plan.url,membership);assert.equal(plan.evaluated.find(row=>row.url===membership).objectiveAnchor,true);assert.notEqual(plan.url,terms);
});

test('G an explicit foreign locale objective lead remains executable but ranks behind target locale',()=>{
 const foreign=`https://${host}/en/no/memberships`,local=`https://${host}/en/de/memberships`,leads=[{url:foreign,title:'Memberships Norway',providerSeedObjectiveLead:true,objectiveProgressValue:16,objectiveScore:16},{url:local,title:'Memberships Germany',providerSeedObjectiveLead:true,objectiveProgressValue:16,objectiveScore:16}],value=target({urls:[foreign,local],knownCommercialUrls:[foreign,local],leads});value.providerSeedCandidateServiceContext.objectiveResource={url:foreign};value.providerSeedCandidateServiceContext.objectiveLeads=leads;const information=destinationInformation(value,foreign),plan=planResearch(value,{unreadUrls:leads.map(row=>row.url)});assert.equal(information.eligible,true);assert.equal(information.localeCompatibility,'FOREIGN');assert.equal(plan.url,local);assert.equal(value.marketProof,undefined);
});

test('H SERVICE_UNRESOLVED remains a gap while useful offering and market work continues',()=>{
 const value=unresolvedMarketTarget();value.providerSeedCandidateServiceContext.status='SERVICE_UNRESOLVED';const plan=planResearch(value);assert.equal(plan.route,'DECODO');assert.equal(plan.url,membership);
});

test('I true exhaustion stops unresolved when no capability can reduce a gap',()=>{
 const value=target({urls:[],knownCommercialUrls:[],leads:[],capabilities:{direct:false,tavily:false,decodo:false,browser:false,groq:false}}),plan=planResearch(value);assert.equal(plan.route,'STOP');assert.match(plan.reason,/CAPABILITY_DISABLED_TAVILY|DISCOVERY_EXHAUSTED/);assert.equal(value.providerSeedCandidateServiceContext.status,'SERVICE_UNRESOLVED');
});

const foreignMembership=`https://${host}/en/no/memberships`,targetMembership=`https://${host}/en/de/memberships`,foreignMembershipHash=digest('foreign commercial'),targetMembershipHash=digest('target commercial');
const unresolvedTargetTruth={prices:{},needs:[{id:'DE:TARGET_MARKET',proposition:'TARGET_MARKET',market:'DE',offerId:'personal',state:'UNRESOLVED'}]};
const planningObservation=(id,url,sha256,transport,networkGeography)=>({id,kind:'PROVIDER',url,sha256,context:{transport,networkGeography,representation:'PROVIDER_PAGE'}});
const planningPage=(url,hash)=>({requestedUrl:url,url,outcome:'OK',bodyHash:hash,sourceIntegrity:{sha256:hash},accessDecisions:[{decision:'ALLOWED'}]});
function targetMarketMismatch({continuation=true,searched=false}={}){
 const direct=planningObservation('foreign-direct',foreignMembership,foreignMembershipHash,'DIRECT','UNBOUND'),country=planningObservation('foreign-country',foreignMembership,foreignMembershipHash,'DECODO','DE'),source={observation:country.id,bodySha256:country.sha256,start:10,end:30,sha256:digest('Germany memberships')},lead={url:targetMembership,title:'Germany memberships',sourceBoundCandidate:true,truthAuthority:'NONE',authoritative:false,continuationContext:'MARKET',continuationLocale:'de-DE',continuationState:{group:'market-state',variant:'DE',selected:false},from:{url:foreignMembership,bodyHash:country.sha256,locator:source,mechanism:'V3_SOURCE_BOUND_CONTINUATION'},source};
 return target({urls:continuation?[foreignMembership,targetMembership]:[foreignMembership],knownCommercialUrls:[foreignMembership],leads:continuation?[lead]:[],reads:[planningPage(foreignMembership,foreignMembershipHash)],queries:searched?[{query:`Northstar GmbH DE subscription pricing membership site:${host}`,route:'DISCOVERY',completed:true}]:[],decisions:[{url:foreignMembership,route:'DECODO',acquisitionReserved:true}],capabilities:{direct:true,tavily:true,decodo:true,browser:false,groq:false},v3Truth:structuredClone(unresolvedTargetTruth),providerInterpretations:[{url:foreignMembership,v3Truth:structuredClone(unresolvedTargetTruth),v3Observation:direct},{url:foreignMembership,v3Truth:structuredClone(unresolvedTargetTruth),v3Observation:country}],acquisitionOutcomes:[{url:foreignMembership,classification:'MARKET_UNRESOLVED',channel:'DIRECT_THEN_GEO',routingReason:'TARGET_MARKET_OBSERVATION_REQUIRED',sourceHash:foreignMembershipHash,transport:'DECODO'}]});
}

test('J target-country transport with a foreign provider state keeps MARKET unresolved',()=>{const value=targetMarketMismatch(),gap=targetMarketStateGap(value);assert.equal(gap.status,'PROVIDER_STATE_MISMATCH');assert.equal(gap.observedProviderRegion,'NO');assert.equal(gap.targetMarket,'DE');assert.equal(value.v3Truth.needs[0].state,'UNRESOLVED');});

test('K source-bound target-region continuation outranks generic discovery',()=>{const value=targetMarketMismatch(),lead=value.leads[0],eligibility=marketStateContinuationValue(value,lead),plan=planResearch(value);assert.equal(eligibility.eligible,true);assert.equal(plan.route,'DIRECT');assert.equal(plan.url,targetMembership);assert.equal(plan.reason,'TARGET_MARKET_STATE_CONTINUATION_AVAILABLE');});

test('L materially changed target-state resource permits a fresh country acquisition',()=>{const value=targetMarketMismatch();value.reads.push(planningPage(targetMembership,targetMembershipHash));value.providerInterpretations.push({url:targetMembership,v3Truth:structuredClone(unresolvedTargetTruth),v3Observation:planningObservation('target-direct',targetMembership,targetMembershipHash,'DIRECT','UNBOUND')});assert(targetMarketAcquisition(value,targetMembership));assert.equal(executableAction(value,{route:'DECODO',url:targetMembership}).executable,true);});

test('M no state continuation exposes one provider-market commercial refinement',()=>{const value=targetMarketMismatch({continuation:false}),query=nextDiscoveryQuery(value),plan=planResearch(value);assert.equal(query,`Northstar GmbH DE subscription pricing membership site:${host}`);assert.equal(plan.route,'DISCOVERY');assert.equal(plan.query,query);});

test('N unchanged resource and provider state cannot repeat country acquisition',()=>{const value=targetMarketMismatch();assert(targetMarketAcquisition(value,foreignMembership));assert.equal(executableAction(value,{route:'DECODO',url:foreignMembership}).reason,'EQUIVALENT_RESOURCE_ALREADY_ATTEMPTED');});

test('O exhausted market-state refinement stops cleanly unresolved',()=>{const value=targetMarketMismatch({continuation:false,searched:true}),plan=planResearch(value);assert.equal(targetMarketStateGap(value).status,'PROVIDER_STATE_MISMATCH');assert.equal(plan.route,'STOP');assert.equal(plan.reason,'DISCOVERY_EXHAUSTED');assert.equal(value.v3Truth.needs[0].state,'UNRESOLVED');});
