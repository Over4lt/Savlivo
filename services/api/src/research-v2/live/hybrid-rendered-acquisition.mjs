// V2 owns scheduling, reservations and recovery. The injected V3 capability owns
// browser execution; the existing V3 adapter/projection owns evidence semantics.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {planResearch} from './research-planner.mjs';
import {providerRoutingAuthority} from './provider-routing-authority.mjs';
import {retainedProviderRenderingAuthority} from './retained-render-source.mjs';
import {authorityBinding} from '../../research-v3/discovery-authority.mjs';
import {canonical,digest,context,providerBound} from '../../research-v3/model.mjs';
import {adaptV2CurrentSource} from '../../research-v3/v2-current-source-adapter.mjs';
import {retainRenderedObservation} from '../../research-v3/rendered-research.mjs';
import {safeRenderedControl} from '../../research-v3/rendered-interactions.mjs';
import {evaluate} from '../../research-v3/truth.mjs';
import {refreshCatalog} from '../../research-v3/subscription-catalog.mjs';
import {sourceBoundContinuations} from './provider-source-v3.mjs';
import {projectV3SuggestedCandidates} from '../../research-v3/suggested-projection.mjs';
import {sourceBoundLineageBindings} from '../../research-v3/source-lineage.mjs';
import {interactiveNavigationDestination} from './interactive-research-route.mjs';

export const hybridRenderedLimits=Object.freeze({actions:1,browserActions:2,networkRequests:256,countryActions:1,retries:0,perAttemptNetworkRequests:256});
export const hybridRenderedContract=Object.freeze({version:1,scheduler:'RESEARCH_V2',executor:'RESEARCH_V3_PLAYWRIGHT',truth:'EXISTING_RESEARCH_V3',authority:'EXACT_HOST_OR_RETAINED_PROVIDER_SOURCE'});

const iso=value=>typeof value==='string'&&/^[A-Z]{2}$/.test(value);
const safeCode=error=>/^[A-Z0-9_]{3,96}$/.test(String(error?.message??''))?String(error.message):'BROWSER_ACQUISITION_FAILED';
const publish=(file,data)=>{const pending=file+'.pending';fs.writeFileSync(pending,data,{mode:0o600});fs.renameSync(pending,file);};
const artifactRef=(file,bytes)=>({file:path.basename(file),sha256:createHash('sha256').update(bytes).digest('hex'),bytes:Buffer.byteLength(bytes)});

function journalAt(directory,limits) {
 fs.mkdirSync(directory,{recursive:true});const file=path.join(directory,'journal.jsonl');let events=[];
 if(fs.existsSync(file)){const value=fs.readFileSync(file,'utf8');if(value&&!value.endsWith('\n'))throw Error('HYBRID_BROWSER_JOURNAL_INCOMPLETE');events=value.trim()?value.trim().split('\n').map(JSON.parse):[];}
 const append=(type,data={})=>{const row={sequence:events.length+1,type,...data},fd=fs.openSync(file,'a',0o600);try{fs.writeSync(fd,JSON.stringify(row)+'\n');fs.fsyncSync(fd);}finally{fs.closeSync(fd);}events.push(row);return row;};
 if(!events.length)append('LIMITS',{limits});
 else if(events[0].type!=='LIMITS'||canonical(events[0].limits)!==canonical(limits))throw Error('HYBRID_BROWSER_RESUME_LIMITS_CHANGED');
 const usage=()=>events.filter(row=>row.type==='RESERVE').reduce((all,row)=>({...all,[row.kind]:(all[row.kind]??0)+row.amount}),{actions:0,browserActions:0,networkRequests:0,countryActions:0});
 const reserve=(kind,amount=1)=>{const next=usage()[kind]+amount;if(!Number.isSafeInteger(amount)||amount<1||next>limits[kind]){append('BOUND_STOP',{kind,used:usage()[kind],requested:amount,limit:limits[kind]});throw Error('HYBRID_BROWSER_'+kind.toUpperCase()+'_BOUND');}append('RESERVE',{kind,amount});};
 return {events,append,usage,reserve};
}

function validateSession(result,mode,country,maxRequests) {
 const session=result?.networkSession,ledger=result?.browserLedger;
 if(!session||session.kind!=='V3_BROWSER_NETWORK_SESSION_V1'||session.scope!=='PLAYWRIGHT_BROWSER_CONTEXT'||!Array.isArray(ledger)||!ledger.length||ledger.length>maxRequests||session.requestCount!==ledger.length||session.ledgerSha256!==digest(ledger)||result.page?.responseMetadata?.networkSessionBinding!==session.sessionBinding)throw Error('BROWSER_NETWORK_SESSION_INVALID');
 const expected=mode==='DECODO'?'DECODO':'DIRECT',requested=mode==='DECODO'?country:null;
 if(session.transport!==expected||session.requestedCountry!==requested||session.proxyApplied!==(mode==='DECODO'))throw Error('BROWSER_NETWORK_SESSION_INVALID');
 for(const row of ledger)if(row.transport!==expected||row.requestedCountry!==requested||row.sessionBinding!==session.sessionBinding||!['PAGE','CONTEXT_REQUEST'].includes(row.channel))throw Error('BROWSER_NETWORK_ESCAPE');
 const transport=result.page?.transport;
 if(mode==='DIRECT'){
  if(transport?.kind!=='DIRECT'||transport.verification!=='UNBOUND')throw Error('BROWSER_DIRECT_PROVENANCE_INVALID');
  return {route:'DIRECT'};
 }
 if(!iso(country)||transport?.kind!=='DECODO'||transport.requestedCountry!==country||transport.verifiedCountry!==country||transport.verification!=='BRACKET_VERIFIED')throw Error('BROWSER_COUNTRY_PROVENANCE_INVALID');
 return {route:'DECODO',countryReceipt:{contractVersion:1,kind:'V3_VERIFIED_COUNTRY_RECEIPT',transport:'DECODO',verification:'BRACKET_VERIFIED',requestedCountry:country,verifiedCountry:country}};
}

function phase1Input({action,target,objective,result,acquisition}) {
 const body=result.page.body,sha256=digest(body),url=result.page.url;
 return {contractVersion:1,observationId:action.id,target:{service:target.service,serviceName:target.serviceName,market:target.market},page:{url,requestedUrl:result.page.requestedUrl,outcome:'OK',httpStatus:result.page.httpStatus,contentType:result.page.contentType?.split(';')[0]??'text/html',bodyHash:sha256,sourceIntegrity:{sha256},rawSource:{text:body},accessDecisions:(result.page.access??[]).filter(row=>row.decision==='ALLOWED').map(row=>({decision:'ALLOWED',reason:row.reason??null}))},providerAuthority:{status:'AUTHORITATIVE_PROVIDER',binding:authorityBinding(objective,url)},acquisition};
}

function persistArtifacts(directory,action,result,observation,retained) {
 const root=path.join(directory,'artifacts');fs.mkdirSync(root,{recursive:true});const prefix=action.id.replace(/[^A-Za-z0-9_-]/g,'_');
 const artifactMetadata={...retained.artifact,image:{...retained.artifact.image,bytesBase64:null}},overviewMetadata={...retained.overview,bytesBase64:null};
 const values=[['page.html',Buffer.from(result.page.body)],['screenshot.png',Buffer.from(result.pngBytes)],['overview.png',Buffer.from(retained.overview.bytesBase64,'base64')],['dom.json',Buffer.from(JSON.stringify(result.dom))],['request-ledger.json',Buffer.from(JSON.stringify(result.browserLedger))],['rendered-artifact-metadata.json',Buffer.from(JSON.stringify(artifactMetadata))],['rendered-overview-metadata.json',Buffer.from(JSON.stringify(overviewMetadata))]];
 const refs={};for(const [suffix,bytes] of values){const file=path.join(root,prefix+'-'+suffix);publish(file,bytes);refs[suffix]=artifactRef(file,bytes);}
 return {root,refs,observation:{id:observation.id,url:observation.url,sha256:observation.sha256,transport:observation.context.transport,networkGeography:observation.context.networkGeography??null,renderId:retained.artifact.id}};
}

function retainedProviderSourceForRendering(target,parent,url,transport){
 return !!parent&&parent.url===url&&typeof parent.body==='string'&&digest(parent.body)===parent.sha256&&retainedProviderRenderingAuthority(target,{url,transport,sourceHash:parent.sha256});
}

export function planHybridRenderedAcquisition(target,{url,transport='DIRECT',executionContext,parent=null}={}) {
 const planningTarget=target.renderingNeed?target:{...target,demonstratedRendering:true,renderingNeed:{kind:'RENDERED_REPRESENTATION',url,transport,market:target.market,sourceHash:target.v3Observation?.sha256??null,runDirectory:null,motivatingNeeds:structuredClone(target.v3Truth?.needs??[])}};
 const plan=planResearch(planningTarget,{renderingDemonstrated:true,unreadUrls:url?[url]:undefined,executionContext});
 if(plan.route!=='PARK_RENDERING'||plan.reason!=='RENDERING_REQUIRED')return {scheduled:false,reason:plan.reason,plan};
 if(target.capabilities?.browser!==true)return {scheduled:false,reason:'BROWSER_DISABLED',plan};
 if(!url||!providerRoutingAuthority(target,url)&&!retainedProviderSourceForRendering(target,parent,url,transport))return {scheduled:false,reason:'EXACT_HOST_AUTHORITY_REQUIRED',plan};
 if(!['DIRECT','DECODO'].includes(transport)||transport==='DECODO'&&(target.capabilities?.decodo!==true||!iso(target.market)))return {scheduled:false,reason:'BROWSER_TRANSPORT_UNAVAILABLE',plan};
 return {scheduled:true,reason:'RENDERING_REQUIRED',route:'BROWSER',url,transport,country:transport==='DECODO'?target.market:null,plan};
}

export async function runHybridRenderedAcquisition({directory,target,objective,parent,url=parent?.url,transport='DIRECT',browser,limits=hybridRenderedLimits,clock=()=>new Date().toISOString()}={}) {
 if(!directory||!browser||!objective||!parent)throw Error('HYBRID_BROWSER_INPUT_REQUIRED');
 const schedule=planHybridRenderedAcquisition(target,{url,transport,parent});
 if(!schedule.scheduled)return {outcome:'NOT_SCHEDULED',reason:schedule.reason,schedule};
 if(!providerBound(objective,url)||objective.serviceId!==target.service||objective.serviceName!==target.serviceName)throw Error('HYBRID_BROWSER_OBJECTIVE_INVALID');
 const journal=journalAt(directory,limits),started=new Set(journal.events.filter(row=>row.type==='ACTION_STARTED').map(row=>row.actionId)),finished=new Set(journal.events.filter(row=>row.type==='ACTION_RESULT').map(row=>row.actionId));
 if([...started].some(id=>!finished.has(id)))return {outcome:'ACQUISITION_FAILED',reason:'INTERRUPTED_ACTION_RECONCILIATION_REQUIRED',truthState:'UNRESOLVED'};
 if(journal.events.some(row=>row.type==='ACTION_RESULT'&&row.outcome==='OBSERVED'))return {outcome:'NOT_SCHEDULED',reason:'RENDERED_ACQUISITION_ALREADY_COMPLETED'};
 let last='BROWSER_ACQUISITION_FAILED';
 for(let attempt=0;attempt<=limits.retries;attempt++){
  const navigationUrl=target.renderingNeed?.navigationUrl??null;
  if(navigationUrl&&interactiveNavigationDestination(parent.body,parent.url)!==navigationUrl)throw Error('RENDERED_NAVIGATION_SOURCE_INVALID');
  const action={id:'hybrid-render-'+digest([target.id,url,transport,navigationUrl,clock(),attempt]).slice(0,24),kind:'RENDER',mode:'OVERVIEW',observation:parent.id,url,...(navigationUrl?{navigationUrl}:{})};
  try{
   journal.reserve('actions');journal.reserve('browserActions');journal.reserve('networkRequests',limits.perAttemptNetworkRequests);if(transport==='DECODO')journal.reserve('countryActions');
   journal.append('ACTION_STARTED',{actionId:action.id,attempt,urlHash:digest(url),transport,country:transport==='DECODO'?target.market:null,dispatched:true});
   const executionParent={...structuredClone(parent),context:transport==='DECODO'?context('DECODO',target.market):context('DIRECT')};
   let result=await browser(action,{parent:executionParent,objective});
   let acquisition=validateSession(result,transport,target.market,limits.perAttemptNetworkRequests);
   let observation=adaptV2CurrentSource(phase1Input({action,target,objective,result,acquisition}),objective);observation.action=action.id;
   let retained=retainRenderedObservation(observation,result);observation.renderedArtifacts=[retained.artifact];observation.renderedOverviews=[retained.overview];observation.domSnapshot=retained.dom;observation.renderedControlRegions=[retained.controlRegions];
   let completedAction=action,priorArtifacts=null,consent=null;
   const initialTruth=evaluate({objective,observations:[observation],attempts:[],policyBlocks:[],stop:null});
   const controls=retained.dom.filter(row=>safeRenderedControl(row,'COOKIE_REJECT')&&retained.controlRegions.regions.some(region=>region.id==='control-'+row.id&&canonical(region.bboxPx)===canonical(row.bboxPx)));
   const rank=row=>/\b(?:reject|decline)\s+all\b/i.test(row.text)?0:/\b(?:only necessary|necessary only|essential only)\b/i.test(row.text)?1:2;
   controls.sort((a,b)=>rank(a)-rank(b)||a.id.localeCompare(b.id));
   if(!initialTruth.established&&controls.length){
    const control=controls[0],stateAction={id:action.id+'-consent',kind:'RENDER',mode:'STATE',observation:observation.id,url:observation.url,interaction:{kind:'COOKIE_REJECT',controlId:control.id,selectedControlId:null,sourceRenderId:retained.artifact.id,sourceRegionId:'control-'+control.id}};
    priorArtifacts=persistArtifacts(directory,action,result,observation,retained);
    try{
     journal.reserve('browserActions');journal.append('CONSENT_ACTION_STARTED',{actionId:stateAction.id,parentRenderId:retained.artifact.id,controlId:control.id});
     const next=await browser(stateAction,{parent:observation,objective}),nextAcquisition=validateSession(next,transport,target.market,limits.perAttemptNetworkRequests);
     const nextObservation=adaptV2CurrentSource(phase1Input({action:stateAction,target,objective,result:next,acquisition:nextAcquisition}),objective);nextObservation.action=stateAction.id;
     const nextRetained=retainRenderedObservation(nextObservation,next);nextObservation.renderedArtifacts=[nextRetained.artifact];nextObservation.renderedOverviews=[nextRetained.overview];nextObservation.domSnapshot=nextRetained.dom;nextObservation.renderedControlRegions=[nextRetained.controlRegions];
     result=next;acquisition=nextAcquisition;observation=nextObservation;retained=nextRetained;completedAction=stateAction;consent={attempted:true,outcome:'COMPLETED',parentRenderId:priorArtifacts.observation.renderId,renderId:retained.artifact.id};journal.append('CONSENT_ACTION_RESULT',{actionId:stateAction.id,outcome:'COMPLETED',renderId:retained.artifact.id});
    }catch(error){consent={attempted:true,outcome:'FAILED',reason:safeCode(error)};journal.append('CONSENT_ACTION_RESULT',{actionId:stateAction.id,outcome:'FAILED',reason:consent.reason});}
   }
   const artifacts=persistArtifacts(directory,completedAction,result,observation,retained),compact={contractVersion:hybridRenderedContract.version,actionId:action.id,outcome:'OBSERVED',url:observation.url,bodySha256:observation.sha256,sourceHashes:{mainDocument:result.page.responseMetadata?.mainDocumentSha256??null,renderedDom:result.page.responseMetadata?.renderedDomSha256??null},acquisition,networkSession:{...result.networkSession,ledgerRef:artifacts.refs['request-ledger.json'],ledgerSha256:result.networkSession.ledgerSha256},artifacts:{...artifacts,...(priorArtifacts?{prior:{refs:priorArtifacts.refs,observation:priorArtifacts.observation}}:{})},consent,usage:{...journal.usage(),actualNetworkRequests:result.browserLedger.length},freshAt:result.page.acquiredAt};
   journal.append('NETWORK_SETTLED',{actionId:action.id,used:result.browserLedger.length,reserved:limits.perAttemptNetworkRequests});journal.append('ACTION_RESULT',{actionId:action.id,outcome:'OBSERVED',checkpoint:compact});
   const knowledge={objective,observations:[observation],attempts:[],policyBlocks:[],stop:null},v3Truth=evaluate(knowledge),v3Catalog=refreshCatalog(knowledge,v3Truth),v3Observation={id:observation.id,kind:observation.kind,url:observation.url,sha256:observation.sha256,context:observation.context,candidateCount:observation.candidates.length,nativeStructuredFacts:observation.nativeStructured?.facts?.length??0},{navigation,v3Continuations}=sourceBoundContinuations(observation,objective,v3Truth);v3Observation.continuationCount=v3Continuations.length;v3Observation.continuationLimited=navigation.limited;
   const providerAuthority={status:'AUTHORITATIVE_PROVIDER',binding:authorityBinding(objective,observation.url)},projected=projectV3SuggestedCandidates({observation,objective,targetMarket:target.market,providerAuthority,truth:v3Truth}),researchCandidateLineage=(target.researchCandidateLineage??[]).map(row=>!row.sourceHash&&row.sourceUrl===observation.url?{...row,sourceHash:observation.sha256}:row),v3ResearchLineage=sourceBoundLineageBindings({handoff:{adaptiveTargetPatch:{researchCandidateLineage}},observation,candidates:projected}),v3SuggestedCandidates=projectV3SuggestedCandidates({observation,objective,targetMarket:target.market,providerAuthority,truth:v3Truth,researchLineage:v3ResearchLineage.bindings});
   return {...compact,observation,v3Observation,v3Truth,v3Catalog,v3SuggestedCandidates,v3ResearchLineage,v3Continuations,renderingRequired:false,schedule};
  }catch(error){last=safeCode(error);journal.append('ACTION_RESULT',{actionId:action.id,outcome:'ACQUISITION_FAILED',reason:last});if(attempt===limits.retries||String(error?.message??'').includes('_BOUND'))break;}
  finally{await browser.close?.();}
 }
 return {outcome:'ACQUISITION_FAILED',reason:last,truthState:'UNRESOLVED',bounded:true,usage:journal.usage(),schedule};
}
