import test from 'node:test';
import assert from 'node:assert/strict';
import {priceIntent} from '../intelligence/price-entry-intent.mjs';
import {destinationInformation,actionableDestinations,chooseInformationAction} from './information-routing.mjs';
import {providerRoutingAuthority} from './provider-routing-authority.mjs';
import {providerRoutingObjectives,providerStageRoutingObjective,providerResourceRelevance,providerBranchPreference,targetMarketPathHint,providerRoutingSnapshot,summarizeProviderRoutingProgress,recordProviderRoutingProgress} from './provider-resource-routing.mjs';

const home='https://new-provider.example/',authority={hostname:'new-provider.example',provider:'New Provider',sourceType:'OFFICIAL_PROVIDER',sourceUrl:home,checkedAt:'2026-10-10T00:00:00.000Z'};
const target=(extra={})=>({id:'new-provider-DE',service:'new-provider',serviceName:'New Provider',market:'DE',researchObjective:'SERVICE_COVERAGE',smartResearch:{version:2},authorities:[authority],urls:[],leads:[],reads:[],queries:[],decisions:[],blockedOrigins:[],verified:[],capabilities:{direct:true,tavily:true,decodo:false,browser:false,groq:false},...extra});
const lead=(path,title,extra={})=>({url:new URL(path,home).href,title,label:title,rank:0,navigationOnly:true,...extra});
const knowledge={attempts:[],blockedOrigins:[],unresolvedFields:[]};
const candidates=t=>actionableDestinations(t,{knowledge,urls:t.leads.map(l=>l.url)}).candidates;

test('authority article leaves authority unchanged and exposes an explicit offering objective',()=>{
 const t=target(),before=structuredClone(t.authorities);t.leads=[lead('/articles/provider-story','Provider story'),lead('/choose','Choose subscription options',{priceEntryIntent:true})];
 assert.equal(providerStageRoutingObjective(t),providerRoutingObjectives.OFFERING_DISCOVERY);assert.deepEqual(t.authorities,before);assert.equal(candidates(t)[0].url,home+'choose');assert.equal(t.v3Truth,undefined);
});

test('first no-progress article branch cannot precede a stronger untried resource',()=>{
 const t=target(),parent=lead('/learn','Learn'),generic=lead('/learn/next','Next guide',{from:{url:parent.url,bodyHash:'a'.repeat(64),mechanism:'ANCHOR'},navigationDepth:2}),strong=lead('/choose','Compare options',{priceEntryIntent:true});t.leads=[generic,strong];recordProviderRoutingProgress(t,{version:1,meaning:'ROUTING_ONLY_NOT_EVIDENCE',objective:providerRoutingObjectives.OFFERING_DISCOVERY,attemptedResource:parent.url,parentUrl:parent.url,parentBodyHash:'a'.repeat(64),branchKey:'PROVIDER_BODY:'+'a'.repeat(64),depth:1,mechanism:'DIRECT',routingRole:'GENERAL_PROVIDER',outcome:'NO_PROGRESS',categories:[]});
 assert.equal(providerBranchPreference(t,generic),1);assert.equal(candidates(t)[0].url,strong.url);assert(candidates(t).some(row=>row.url===generic.url));
});

test('article with a real offer records deterministic progress and is not demoted',()=>{
 const t=target(),article=lead('/guides/current-offer','Current offer'),before=providerRoutingSnapshot(t);t.v3Truth={offers:[{id:'personal'}],prices:{DE:{id:'personal',propositions:{PRICE_AMOUNT:{state:'ESTABLISHED'}}}},needs:[{offerId:'personal',proposition:'TARGET_MARKET',state:'UNRESOLVED',market:'DE'}]};
 const summary=summarizeProviderRoutingProgress({target:t,before,page:{url:article.url,bodyHash:'b'.repeat(64),navigationDepth:1},lead:article});recordProviderRoutingProgress(t,summary);assert.equal(summary.outcome,'PROGRESS');assert(summary.categories.includes('OFFER_IDENTITY'));assert.equal(providerBranchPreference(t,lead('/guides/next','Next',{from:{bodyHash:'b'.repeat(64)}})),0);
});

test('empty membership-like resource is only a routing hint and can be no-progress',()=>{
 const t=target(),membership=lead('/membership','Membership options',{priceEntryIntent:true}),before=providerRoutingSnapshot(t),summary=summarizeProviderRoutingProgress({target:t,before,page:{url:membership.url,bodyHash:'c'.repeat(64)},lead:membership});assert.equal(providerResourceRelevance(t,membership).tier,0);assert.equal(summary.outcome,'NO_PROGRESS');assert.equal(t.v3Truth,undefined);assert.equal(t.marketProof,undefined);
});

test('search title and path can affect routing but cannot establish a proposition',()=>{
 const t=target(),searchLead=lead('/pricing','Subscription pricing',{from:{queryId:'q1'},snippetExcludedFromEvidence:true});t.leads=[searchLead];assert(providerResourceRelevance(t,searchLead).tier<2);destinationInformation(t,searchLead.url);assert.equal(t.v3Truth,undefined);assert.equal(t.priceEvidenceNeeds,undefined);
});

test('strong child overrides a no-progress parent branch demotion',()=>{
 const t=target(),child=lead('/choose','Choose',{priceEntryIntent:true,from:{bodyHash:'d'.repeat(64),mechanism:'PRICE_NAVIGATION'}});t.providerRoutingProgress=[{parentBodyHash:'d'.repeat(64),outcome:'NO_PROGRESS'}];const relevance=providerResourceRelevance(t,child);assert.equal(relevance.tier,0);assert.equal(providerBranchPreference(t,child,relevance),0);
});

test('generic descendants remain eligible without starving a strong objective resource',()=>{
 const t=target();t.providerRoutingProgress=[{parentBodyHash:'e'.repeat(64),outcome:'NO_PROGRESS'}];t.leads=Array.from({length:8},(_,i)=>lead('/learn/'+i,'Guide '+i,{from:{bodyHash:'e'.repeat(64)},navigationDepth:2}));t.leads.push(lead('/subscriptions','Subscriptions',{priceEntryIntent:true}));const rows=candidates(t);assert.equal(rows[0].url,home+'subscriptions');assert.equal(rows.length,9);
});

test('unresolved result with offer-specific need is progress',()=>{
 const t=target(),before=providerRoutingSnapshot(t);t.v3Truth={offers:[],prices:{},needs:[{offerId:'starter',proposition:'PRICE_AMOUNT',state:'UNRESOLVED',market:'DE'}]};const summary=summarizeProviderRoutingProgress({target:t,before,page:{url:home+'article',bodyHash:'f'.repeat(64)},lead:lead('/article','Article')});assert.equal(summary.outcome,'PROGRESS');assert(summary.categories.includes('OFFER_SPECIFIC_NEED'));
});

test('equivalent resources retain deterministic discovery and traversal ordering',()=>{
 const t=target();t.leads=[lead('/z','General',{rank:1}),lead('/a','General',{rank:0})];const first=candidates(t)[0];assert.equal(first.url,home+'a');const cloned=structuredClone(t);assert.equal(candidates(cloned)[0].url,first.url);
});

test('fixed direct bound remains exhausted without adding a read',()=>{
 const t=target({reads:Array.from({length:4},(_,i)=>({requestedUrl:home+'old-'+i,url:home+'old-'+i,outcome:'OK'}))});t.leads=[lead('/pricing','Pricing',{priceEntryIntent:true})];const action=chooseInformationAction(t,{knowledge,urls:t.leads.map(l=>l.url),discoveryAllowed:false,discoveryQuery:null,executionContext:{bounds:{managementReserveOnly:0,perServiceReads:4,perServiceSearches:2,perServiceAcquisitions:2,reads:80,searches:40,acquisitions:30},usage:{reads:4,searches:0,acquisitions:0}}});assert.equal(action.route,'STOP');assert.equal(action.budgetBlocked[0].capability.reason,'DIRECT_BUDGET_EXHAUSTED');assert.equal(t.reads.length,4);
});

test('routing metadata cannot grant authority to a sibling host',()=>{
 const t=target(),sibling={url:'https://shop.new-provider.example/pricing',title:'Pricing',priceEntryIntent:true};assert.equal(providerRoutingAuthority(t,sibling.url),null);assert.equal(providerResourceRelevance(t,sibling).tier,3);assert.equal(t.authorities.length,1);
});

test('educational study plan is not strong subscription intent while subscription plan remains strong',()=>{
 const authorities=[authority];assert.equal(priceIntent({url:home+'study-plan',label:'Study plan',context:'Learning course'},{base:home,authorities}).reason,'EDUCATIONAL_PLAN_NOT_COMMERCIAL');assert.equal(priceIntent({url:home+'plans',label:'Subscription plan',context:'Choose billing'},{base:home,authorities}).candidate,true);const t=target();assert.equal(providerResourceRelevance(t,lead('/study-plan','Study plan',{context:'Learning course'})).tier,2);assert.equal(providerResourceRelevance(t,lead('/plans','Subscription plan')).tier,0);
});

test('market path hint requires a locale segment and never creates market Truth',()=>{
 const t=target();assert.equal(targetMarketPathHint(t,home+'de/pricing'),true);assert.equal(targetMarketPathHint(t,home+'de-DE/pricing'),true);assert.equal(targetMarketPathHint(t,home+'plan-de-estudios'),false);assert.equal(t.marketProof,undefined);assert.equal(t.v3Truth,undefined);
});

test('unseen-provider native contextual control wins without membership vocabulary',()=>{
 const t=target(),generic=lead('/learn','Learn'),control=lead('/choose','Compare options',{accessibleName:'Choose',context:'subscription choices'});t.leads=[generic,control];assert.equal(priceIntent(control,{base:home,authorities:[authority]}).candidate,true);assert.equal(candidates(t)[0].url,control.url);
});

test('routing progress checkpoint restart preserves choice and contains no factual Truth',()=>{
 const t=target(),generic=lead('/learn/next','Next',{from:{bodyHash:'9'.repeat(64)}}),strong=lead('/choose','Choose',{priceEntryIntent:true});t.leads=[generic,strong];recordProviderRoutingProgress(t,{version:1,meaning:'ROUTING_ONLY_NOT_EVIDENCE',objective:providerRoutingObjectives.OFFERING_DISCOVERY,attemptedResource:home+'learn',parentUrl:home+'learn',parentBodyHash:'9'.repeat(64),branchKey:'PROVIDER_BODY:'+'9'.repeat(64),depth:1,mechanism:'DIRECT',routingRole:'GENERAL_PROVIDER',outcome:'NO_PROGRESS',categories:[]});const before=candidates(t)[0].url,restarted=JSON.parse(JSON.stringify(t));assert.equal(candidates(restarted)[0].url,before);assert.equal(restarted.providerRoutingProgress[0].meaning,'ROUTING_ONLY_NOT_EVIDENCE');for(const key of ['price','currency','cadence','marketTruth','offeringTruth'])assert.equal(Object.hasOwn(restarted.providerRoutingProgress[0],key),false);
});
