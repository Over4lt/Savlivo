// Bounded native discovery of consumer subscription Services from retained,
// exact-host provider observations. This is orchestration/admission, not Truth.
import {canonical,digest,normalizeUrl} from './model.mjs';
import {admitSubscriptionService,rehydrateSubscriptionService} from './subscription-service-admission.mjs';
import {createResearchTarget,knownServiceResearchTarget,providerSeedCampaignState,researchTargetKinds,serviceDiscoveryObjective,serviceObjectiveForResearchTarget} from './research-target.mjs';
import {interpretSubscriptionPage} from './subscription-page.mjs';

export const providerResearchByteCapacity=2*1024*1024;
export const subscriptionServiceDiscoveryBounds=Object.freeze({actions:16,acquisitions:8,navigationDepth:4,observations:8,candidates:32,bytes:providerResearchByteCapacity,nodes:4096,depth:24});
export const subscriptionServiceDiscoveryStates=Object.freeze(['SERVICE_FOUND_MORE_POSSIBLE','SERVICE_DISCOVERY_EXHAUSTED','SERVICE_DISCOVERY_UNRESOLVED']);
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const types=value=>(Array.isArray(value)?value:[value]).filter(row=>typeof row==='string').map(row=>row.split('/').at(-1));
const identityTypes=new Set(['Service','SoftwareApplication','WebApplication','MobileApplication','Product']);
const subscription=/\b(?:subscriptions?|memberships?)\b/iu;
const recurring=/\b(?:recurr(?:ing|ence)|billed|billing|charged|paid|payment)\b[^.\n<]{0,80}\b(?:monthly|annually|annual|yearly|per month|per year)\b|\b(?:monthly|annually|annual|yearly|per month|per year)\b[^.\n<]{0,80}\b(?:recurr(?:ing|ence)|billed|billing|charged|paid|payment)\b/iu;
const genericName=/^(?:plans?|pricing|subscriptions?|memberships?|premium|pro|plus|basic|free|monthly|annual|yearly|account|login)$/iu;
const peripheralName=/\b(?:support|help(?: center)?|login|account|authentication|billing portal|article|blog)\b/iu;
const hardwareKeys=new Set(['sku','gtin','gtin8','gtin12','gtin13','gtin14','mpn','weight','shippingDetails','itemCondition']);
const offerKeys=new Set(['offers','hasOfferCatalog','itemListElement','priceSpecification']);
const pointer=(base,key)=>base+'/'+String(key).replaceAll('~','~0').replaceAll('/','~1');
const source=(raw,start)=>({start,end:start+raw.length,sha256:digest(raw)});
const jsonLocator=(raw,start,path,value)=>({kind:'JSON_POINTER',pointer:path,source:source(raw,start),value:structuredClone(value)});
const spanLocator=(body,start,end)=>({kind:'SPAN',start,end,quote:body.slice(start,end),sha256:digest(body.slice(start,end))});

function boundedWalk(root,bounds){
 const rows=[],stack=[{value:root,path:'',depth:0,ancestors:[]}];let nodes=0,limited=false;
 while(stack.length){const current=stack.pop();if(++nodes>bounds.nodes||current.depth>bounds.depth){limited=true;break;}const value=current.value;if(!value||typeof value!=='object')continue;rows.push(current);
  const entries=Array.isArray(value)?value.map((child,index)=>[index,child]):Object.entries(value);
  for(let index=entries.length-1;index>=0;index--){const [key,child]=entries[index];if(child&&typeof child==='object')stack.push({value:child,path:pointer(current.path,key),depth:current.depth+1,ancestors:[...current.ancestors,{key:String(key),value}]});}
 }
 return {rows,nodes,limited};
}

function stringRows(value,path,rows=[],depth=0){
 if(depth>12)return rows;if(typeof value==='string'){rows.push({value,path});return rows;}if(!value||typeof value!=='object')return rows;
 for(const [key,child]of Object.entries(value)){if(offerKeys.has(key)||key==='category'||key==='additionalType'||key==='description'||key==='serviceType'||key==='name'||key==='billingDuration'||key==='billingPeriod'||key==='billingIncrement'||key==='unitText'||key==='unitCode')stringRows(child,pointer(path,key),rows,depth+1);}return rows;
}

function subscriptionEvidence(entity,path){
 const rows=stringRows(entity,path),explicit=rows.find(row=>subscription.test(row.value));
 if(explicit)return {kind:/membership/iu.test(explicit.value)?'EXPLICIT_MEMBERSHIP':'EXPLICIT_SUBSCRIPTION',row:explicit};
 const recurringRow=rows.find(row=>recurring.test(row.value)||/^(?:P\d+[MY]|MON(?:TH)?|YEAR|ANNUAL)$/iu.test(row.value));
 if(recurringRow)return {kind:'RECURRING_OFFER_SPACE',row:recurringRow};
 const catalog=rows.find(row=>/\b(?:subscription|membership)\b/iu.test(row.value)&&row.path.includes('OfferCatalog'));
 return catalog?{kind:'SUBSCRIPTION_OFFER_CATALOG',row:catalog}:null;
}

function candidateFromEntity(row,{raw,start,observation,mechanism}){
 const entity=row.value,kinds=types(entity['@type']??entity.type),type=kinds.find(kind=>identityTypes.has(kind));if(!type)return null;
 if(row.ancestors.some(a=>offerKeys.has(a.key)||types(a.value?.['@type']??a.value?.type).some(kind=>['Article','NewsArticle','BlogPosting','Offer','OfferCatalog'].includes(kind))))return null;
 if(type==='Product'&&Object.keys(entity).some(key=>hardwareKeys.has(key)))return null;
 const names=(Array.isArray(entity.name)?entity.name:[entity.name]).filter(value=>typeof value==='string'&&value.trim()),normalized=[...new Set(names.map(value=>value.normalize('NFKC').replace(/\s+/gu,' ').trim()))];
 if(!normalized.length)return null;if(normalized.every(name=>genericName.test(name)||peripheralName.test(name)))return {unresolved:{name:normalized[0],reason:'DISTINCT_SERVICE_IDENTITY_REQUIRED'}};const evidence=subscriptionEvidence(entity,row.path);if(!evidence)return {unresolved:{name:normalized[0],reason:'SUBSCRIPTION_RELATIONSHIP_REQUIRED'}};
 const provider=entity.provider,ambiguousProvider=type==='Product'&&object(provider)&&!provider['@id']&&!provider.url;
 return {candidate:{identity:{name:normalized[0],type,locator:jsonLocator(raw,start,pointer(row.path,'name'),entity.name)},subscription:{kind:evidence.kind,locator:jsonLocator(raw,start,evidence.row.path,evidence.row.value)},source:{mechanism,observation:observation.id,url:observation.url,sha256:observation.sha256,providerHost:new URL(observation.url).hostname},ambiguous:normalized.length!==1||ambiguousProvider}};
}

function structuredDocuments(body){
 const documents=[];for(const match of body.matchAll(/<script\b(?:[^>"']|"[^"]*"|'[^']*')*\btype\s*=\s*(?:"application\/ld\+json"|'application\/ld\+json'|application\/ld\+json)(?:[^>"']|"[^"]*"|'[^']*')*>([\s\S]*?)<\/script\s*>/giu)){
  const raw=match[1],start=match.index+match[0].indexOf(raw);let value;try{value=JSON.parse(raw);}catch{documents.push({malformed:true,raw,start});continue;}documents.push({value,raw,start,mechanism:'JSON_LD'});
 }return documents;
}

function catalogDeclaration(value,raw,start){
 for(const [key,row]of Object.entries(value??{})){if(!['subscriptionServiceCatalog','serviceDiscoveryCatalog'].includes(key)||!object(row))continue;
  if(row.scope!=='PROVIDER_SUBSCRIPTION_SERVICES'||row.coverage!=='COMPLETE'||!Array.isArray(row.serviceIds)||row.serviceIds.some(id=>typeof id!=='string'||!id))continue;
  return {serviceIds:[...row.serviceIds].sort(),locator:jsonLocator(raw,start,pointer('',key),row),mechanism:'PROVIDER_NATIVE_JSON'};
 }return null;
}

function extractJson(value,raw,start,mechanism,observation,bounds){
 const walked=boundedWalk(value,bounds),candidates=[],unresolved=[];
 for(const row of walked.rows){const found=candidateFromEntity(row,{raw,start,observation,mechanism});if(found?.candidate)candidates.push(found.candidate);else if(found?.unresolved)unresolved.push({...found.unresolved,observation:observation.id});}
 return {candidates,unresolved,coverage:catalogDeclaration(value,raw,start),limited:walked.limited,nodes:walked.nodes};
}

function extractHtml(body,observation,providerAuthorityBinding){
 const page=interpretSubscriptionPage({body,url:observation.url,providerName:providerAuthorityBinding.providerIdentity?.presentationName??null}),candidates=page.services.map(service=>({identity:{name:service.name,type:service.type,locator:service.identity},subscription:service.subscription,source:{mechanism:'NATIVE_HTML',observation:observation.id,url:observation.url,sha256:observation.sha256,providerHost:new URL(observation.url).hostname},ambiguous:false})),unresolved=[];
 const noSubscription=body.match(/\b(?:we|our (?:company|business|brand|organization))\s+(?:do not|don't|does not|doesn't)\s+(?:offer|provide|sell|operate)\s+(?:any\s+)?(?:subscriptions?|memberships?)\b/iu);
 return {candidates,unresolved,coverage:noSubscription?{serviceIds:[],locator:spanLocator(body,noSubscription.index,noSubscription.index+noSubscription[0].length),mechanism:'NATIVE_HTML_EXPLICIT_ZERO'}:null,limited:page.limited,nodes:page.offerings.length+page.services.length};
}

function extractObservation(observation,bounds,providerAuthorityBinding){
 const body=observation.body,documents=structuredDocuments(body),all={candidates:[],unresolved:[],coverage:[],limited:false,nodes:0};
 for(const document of documents){if(document.malformed){all.unresolved.push({name:null,reason:'MALFORMED_STRUCTURED_DATA',observation:observation.id});continue;}const found=extractJson(document.value,document.raw,document.start,document.mechanism,observation,bounds);all.candidates.push(...found.candidates);all.unresolved.push(...found.unresolved);if(found.coverage)all.coverage.push(found.coverage);all.limited||=found.limited;all.nodes+=found.nodes;}
 if(observation.format!=='WEB'){try{const value=JSON.parse(body),found=extractJson(value,body,0,'PROVIDER_NATIVE_JSON',observation,bounds);all.candidates.push(...found.candidates);all.unresolved.push(...found.unresolved);if(found.coverage)all.coverage.push(found.coverage);all.limited||=found.limited;all.nodes+=found.nodes;}catch{all.unresolved.push({name:null,reason:'MALFORMED_STRUCTURED_DATA',observation:observation.id});}}
 if(observation.format==='WEB'){const found=extractHtml(body,observation,providerAuthorityBinding);all.candidates.push(...found.candidates);all.unresolved.push(...found.unresolved);if(found.coverage)all.coverage.push(found.coverage);all.limited||=found.limited;all.nodes+=found.nodes;}
 return all;
}

function limits(bounds){const value={...subscriptionServiceDiscoveryBounds,...bounds};for(const [key,n]of Object.entries(value)){const minimum=key==='navigationDepth'?0:1;if(!(key in subscriptionServiceDiscoveryBounds)||!Number.isSafeInteger(n)||n<minimum||n>subscriptionServiceDiscoveryBounds[key])throw Error('SERVICE_DISCOVERY_BOUND_INVALID');}return value;}
function observationValid(observation,binding){const url=normalizeUrl(observation?.url);return observation?.kind==='PROVIDER'&&!observation.semantic&&observation.outcome==='OK'&&!observation.truncated&&observation.completeness==='COMPLETE'&&typeof observation.body==='string'&&digest(observation.body)===observation.sha256&&url===observation.url&&new URL(url).hostname===binding.host;}
function boundedAcquisitionUsage(state,observations){
 const fallback={actions:observations.length,acquisitions:observations.length,navigationDepth:0},usage={...fallback,...state};
 if(Object.keys(usage).some(key=>!['actions','acquisitions','navigationDepth'].includes(key))||Object.values(usage).some(value=>!Number.isSafeInteger(value)||value<0))throw Error('SERVICE_DISCOVERY_ACQUISITION_STATE_INVALID');return usage;
}

export function discoverSubscriptionServices({researchTarget,providerAuthorityBinding,observations,bounds={},acquisitionState=null}){
 const target=createResearchTarget(researchTarget);if(target.targetKind!==researchTargetKinds.PROVIDER_OR_BRAND_SEED)throw Error('PROVIDER_SEED_TARGET_REQUIRED');providerSeedCampaignState(target,{providerAuthorityBinding});
 if(!Array.isArray(observations))throw Error('PROVIDER_OBSERVATIONS_REQUIRED');const bound=limits(bounds),acquisition=boundedAcquisitionUsage(acquisitionState,observations),admissions=[],unresolved=[],coverage=[],used=[],seenCandidates=new Set();let bytes=0,limited=observations.length>bound.observations||acquisition.actions>bound.actions||acquisition.acquisitions>bound.acquisitions||acquisition.navigationDepth>bound.navigationDepth;
 for(const observation of observations.slice(0,bound.observations)){
  if(!observationValid(observation,providerAuthorityBinding)){unresolved.push({name:null,reason:'AUTHORITATIVE_PROVIDER_OBSERVATION_REQUIRED',observation:observation?.id??null});continue;}
  const size=Buffer.byteLength(observation.body);if(bytes+size>bound.bytes){limited=true;continue;}bytes+=size;used.push(observation.id);
  const found=extractObservation(observation,bound,providerAuthorityBinding);limited||=found.limited;coverage.push(...found.coverage.map(row=>({...row,observation:observation.id,url:observation.url,sha256:observation.sha256})));
  unresolved.push(...found.unresolved);
  for(const candidate of found.candidates){const key=canonical([candidate.identity.name,candidate.identity.type,candidate.identity.locator,candidate.subscription.locator,observation.id]);if(seenCandidates.has(key))continue;seenCandidates.add(key);if(seenCandidates.size>bound.candidates){limited=true;break;}const admission=admitSubscriptionService({candidate,observation,researchTarget:target,providerAuthorityBinding});if(admission.status==='ADMITTED')admissions.push(admission);else unresolved.push({name:candidate.identity.name,reason:admission.reason,observation:observation.id});}
 }
 const byId=new Map();for(const admission of admissions){const id=admission.service.serviceId,rows=byId.get(id)??[];rows.push(admission);byId.set(id,rows);}
 const services=[];for(const [id,rows]of byId){const names=new Set(rows.map(row=>row.service.serviceName.normalize('NFKC').toLocaleLowerCase('en')));if(names.size!==1){unresolved.push({name:rows.map(row=>row.service.serviceName).join(' / '),reason:'SERVICE_ID_COLLISION',observation:null});continue;}services.push(rows[0].service);}
 services.sort((a,b)=>a.serviceId.localeCompare(b.serviceId));const serviceIds=services.map(row=>row.serviceId).sort();
 const complete=coverage.filter(row=>canonical(row.serviceIds)===canonical(serviceIds));const conflicting=coverage.some(row=>canonical(row.serviceIds)!==canonical(serviceIds));
 const exhausted=!limited&&complete.length>0&&!conflicting,status=exhausted?'SERVICE_DISCOVERY_EXHAUSTED':limited?'SERVICE_DISCOVERY_UNRESOLVED':services.length?'SERVICE_FOUND_MORE_POSSIBLE':'SERVICE_DISCOVERY_UNRESOLVED';
 return {contractVersion:1,objective:serviceDiscoveryObjective,researchTarget:structuredClone(target),providerAuthorityBinding:structuredClone(providerAuthorityBinding),status,services,unresolved,coverageEvidence:exhausted?complete:[],usage:{...acquisition,observations:used.length,candidates:seenCandidates.size,bytes},bounds:bound,termination:{kind:exhausted?'SEMANTIC_EXHAUSTION':limited?'CAPACITY':'OPEN_RELEVANT_SPACE',reason:exhausted?'EXPLICIT_AUTHORITATIVE_SERVICE_SPACE_COMPLETE':limited?'SERVICE_DISCOVERY_CAPACITY_REACHED':services.length?'MORE_SERVICES_POSSIBLE':'INSUFFICIENT_POSITIVE_SERVICE_EVIDENCE'},marketEstablished:false,productionEligible:false};
}

export function fanOutSubscriptionServices(discovery){
 if(discovery?.objective!==serviceDiscoveryObjective||!subscriptionServiceDiscoveryStates.includes(discovery.status)||!Array.isArray(discovery.services))throw Error('SERVICE_DISCOVERY_RESULT_REQUIRED');
 const target=createResearchTarget(discovery.researchTarget),binding=discovery.providerAuthorityBinding;providerSeedCampaignState(target,{providerAuthorityBinding:binding});
 const children=discovery.services.map(service=>{const researchTarget=knownServiceResearchTarget({serviceId:service.serviceId,serviceName:service.serviceName,targetMarket:target.targetMarket}),objective=serviceObjectiveForResearchTarget(researchTarget,{providerHosts:[binding.host],seeds:[service.provenance.sourceUrl]});return {researchTarget,objective,providerAuthority:{provenance:'SOURCE_BOUND_SUBSCRIPTION_SERVICE_DISCOVERY',host:binding.host,bindingReference:structuredClone(service.providerBinding),serviceProvenance:structuredClone(service.provenance)},marketEstablished:false,productionEligible:false};});
 if(new Set(children.map(row=>row.objective.serviceId)).size!==children.length)throw Error('DISCOVERED_SERVICE_ID_COLLISION');return children;
}

export function providerSeedDiscoveryLifecycle(discovery){
 const children=fanOutSubscriptionServices(discovery);
 return {contractVersion:1,researchTarget:structuredClone(discovery.researchTarget),providerAuthority:{status:'ESTABLISHED',binding:structuredClone(discovery.providerAuthorityBinding)},serviceDiscovery:{objective:serviceDiscoveryObjective,status:discovery.status,usage:structuredClone(discovery.usage),bounds:structuredClone(discovery.bounds),termination:structuredClone(discovery.termination),coverageEvidence:structuredClone(discovery.coverageEvidence)},discoveredServices:structuredClone(discovery.services),childServices:children,termination:structuredClone(discovery.termination),productionEligible:false};
}

export function rehydrateDiscoveredService({service,observation,researchTarget,providerAuthorityBinding}){
 return rehydrateSubscriptionService({admission:{status:'ADMITTED',service},observation,researchTarget,providerAuthorityBinding});
}
