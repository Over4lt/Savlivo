import {digest,normalizeUrl} from '../../research-v3/model.mjs';

// Routing only. These signals schedule scarce pre-authority reads and never
// establish provider identity, ownership, exact-host authority, or Truth.
export const providerSeedAuthorityRoutingObjective='PROVIDER_SEED_AUTHORITY_ACQUISITION';

const words=value=>String(value??'').normalize('NFKD').replace(/\p{M}/gu,'').normalize('NFC').toLowerCase().match(/[\p{L}\p{N}]{3,}/gu)??[];
const safe=value=>{const normalized=normalizeUrl(value);if(!normalized)return null;try{return new URL(normalized);}catch{return null;}};
const identityPath=/(?:^|[\/_-])(?:about(?:-us)?|company|corporate|contact(?:-us)?|imprint|impressum|legal|privacy|terms(?:-of-service)?|who-we-are)(?:[\/_-]|$)/iu;
const weakPath=/(?:^|[\/_-])(?:auth|account|accounts|billing|checkout|login|pay|payment)(?:[\/_-]|$)/iu;
const genericLabel=/^(?:app-?store|community|directory|encyclopedia|forum|magazin(?:e)?|marketplace|news|social|wiki)/iu;
const positiveObjectiveRelevance=candidate=>Number.isFinite(candidate?.objectiveRelevance)&&candidate.objectiveRelevance>0?candidate.objectiveRelevance:0;

// A redirect or source-bound navigation is still pursuing the parent's
// unresolved research objective. This projects scheduling intent only; it
// deliberately cannot project provider authority, Truth, or factual claims.
export function providerSeedObjectiveContinuation(parent,candidate={}){
 const objectiveIntent=typeof parent?.objectiveIntent==='string'&&parent.objectiveIntent?parent.objectiveIntent:null,parentRelevance=positiveObjectiveRelevance(parent);
 if(!objectiveIntent||!parentRelevance)return {};
 return {objectiveIntent,objectiveRelevance:Math.max(parentRelevance,positiveObjectiveRelevance(candidate))};
}

export function providerSeedTokens(researchTarget){return [...new Set(words(researchTarget?.seedName))];}

export function providerSeedDestinationClass(candidate){
 const url=safe(candidate?.url);if(!url)return 'INVALID';
 const host=url.hostname.toLowerCase(),labels=host.split('.'),path=url.pathname.toLowerCase();
 if(/\.(?:gov|mil)(?:\.[a-z]{2})?$/u.test(host)||/\.[a-z]{2}\.us$/u.test(host))return 'PUBLIC_SECTOR_OR_LOCALITY';
 if(labels.some(label=>genericLabel.test(label))||/\/(?:r|forums?|community|store\/apps)(?:\/|$)/u.test(path)||host.endsWith('.news'))return 'GENERIC_THIRD_PARTY';
 if(labels.some(label=>/^(?:auth|accounts?|billing|checkout|login|pay|payment)$/u.test(label))||weakPath.test(path))return 'AUTH_OR_PAYMENT';
 return 'GENERAL';
}

export function providerSeedHostnameAffinity(researchTarget,candidate){
 const url=safe(candidate?.url),tokens=providerSeedTokens(researchTarget);if(!url||!tokens.length)return 0;
 const labels=url.hostname.toLowerCase().replace(/^www\./u,'').split('.'),registrable=labels.at(-2)??labels[0],all=labels.flatMap(words);
 let score=0;
 for(const token of tokens){
  if(registrable===token||all.includes(token))score=Math.max(score,3);
  else if(registrable.startsWith(token)||registrable.endsWith(token)||all.some(label=>label.startsWith(token)||label.endsWith(token)))score=Math.max(score,2);
  else if(registrable.includes(token))score=Math.max(score,1);
 }
 const kind=providerSeedDestinationClass(candidate);
 if(kind==='PUBLIC_SECTOR_OR_LOCALITY')score=Math.max(0,score-2);
 const exactObjectiveRoute=candidate?.originKind==='OBJECTIVE_SEARCH'||(['REDIRECT_DESTINATION','SOURCE_BOUND_CONTINUATION'].includes(candidate?.originKind)&&typeof candidate?.parentCandidateId==='string');
 const objectiveAccountRoute=kind==='AUTH_OR_PAYMENT'&&exactObjectiveRoute&&positiveObjectiveRelevance(candidate)>0&&['ACCOUNT_LOGIN','SUBSCRIPTION_MANAGEMENT','CANCELLATION'].includes(candidate?.objectiveIntent);
 if(kind==='GENERIC_THIRD_PARTY'||kind==='AUTH_OR_PAYMENT'&&!objectiveAccountRoute)score=0;
 return score;
}

function authorityResourceTier(candidate){
 const url=safe(candidate?.url);if(!url)return 3;
 if(providerSeedDestinationClass(candidate)==='AUTH_OR_PAYMENT')return 2;
 return url.pathname==='/'||identityPath.test(url.pathname)?0:1;
}

export function providerSeedCandidateRouting(researchTarget,candidate,candidates=[],index=0){
 const url=safe(candidate?.url),affinity=providerSeedHostnameAffinity(researchTarget,candidate),originKind=candidate?.originKind??'SEARCH',parent=candidates.find(row=>row.candidateId===candidate?.parentCandidateId),parentAffinity=parent?providerSeedHostnameAffinity(researchTarget,parent):0;
 const redirectStrong=originKind==='REDIRECT_DESTINATION'&&affinity>0&&affinity>=parentAffinity,semanticObjectiveRelevance=positiveObjectiveRelevance(candidate),legacyObjectiveScore=Number.isFinite(candidate?.score)?candidate.score:0;
 return {
  objective:providerSeedAuthorityRoutingObjective,
  executable:url!==null&&candidate?.executable!==false,
  hostnameAffinity:affinity,
  destinationClass:providerSeedDestinationClass(candidate),
  objectiveScore:Math.max(semanticObjectiveRelevance,legacyObjectiveScore),
  authorityResourceTier:authorityResourceTier(candidate),
  redirectStrength:originKind==='REDIRECT_DESTINATION'?(redirectStrong?'EQUAL_OR_STRONGER_PROVIDER_AFFINITY':'WEAKER_OR_GENERIC_REDIRECT'):'INDEPENDENT_DISCOVERY',
  originKind,
  searchIndex:Number.isSafeInteger(candidate?.searchIndex)?candidate.searchIndex:Number.MAX_SAFE_INTEGER,
  searchRank:Number.isSafeInteger(candidate?.searchRank)?candidate.searchRank:Number.isSafeInteger(candidate?.resultIndex)?candidate.resultIndex:Number.MAX_SAFE_INTEGER,
  insertionOrder:Number.isSafeInteger(candidate?.insertionOrder)?candidate.insertionOrder:index,
  url:url?.href??String(candidate?.url??'')
 };
}

export const compareProviderSeedAuthorityRows=(a,b)=>Number(b.executable)-Number(a.executable)||b.hostnameAffinity-a.hostnameAffinity||b.objectiveScore-a.objectiveScore||a.authorityResourceTier-b.authorityResourceTier||a.searchIndex-b.searchIndex||a.searchRank-b.searchRank||a.insertionOrder-b.insertionOrder||a.url.localeCompare(b.url);

export function orderProviderSeedAuthorityCandidates(researchTarget,candidates,{reviewedCandidateIds=[]}={}){
 const reviewed=new Set(reviewedCandidateIds);return candidates.map((candidate,index)=>({...candidate,routing:providerSeedCandidateRouting(researchTarget,candidate,candidates,index)})).filter(row=>!reviewed.has(row.candidateId)&&row.routing.executable).sort((a,b)=>compareProviderSeedAuthorityRows(a.routing,b.routing));
}

export function refreshProviderSeedAuthorityFrontier({researchTarget,candidates,activeCandidateIds,newCandidates=[],limit,ineligibleCandidateIds=[],deactivateCandidateIds=[]}){
 if(!Array.isArray(candidates)||!Array.isArray(newCandidates)||!Array.isArray(ineligibleCandidateIds)||!Array.isArray(deactivateCandidateIds)||!Number.isSafeInteger(limit)||limit<0||newCandidates.length>limit)throw Error('INVALID_PROVIDER_SEED_FRONTIER');
 const history=[...candidates],byId=new Map(),byUrl=new Map();
 for(const row of history){const url=normalizeUrl(row?.url);if(typeof row?.candidateId!=='string'||!url||byId.has(row.candidateId)||byUrl.has(url))throw Error('INVALID_PROVIDER_SEED_HISTORY');byId.set(row.candidateId,row);byUrl.set(url,row);}
 const rejectedCandidates=[],discoveredIds=[],updatedIds=[];
 for(const candidate of newCandidates){
  const url=normalizeUrl(candidate?.url),sameId=byId.get(candidate?.candidateId),sameUrl=url&&byUrl.get(url);if(typeof candidate?.candidateId!=='string'||!url)throw Error('INVALID_PROVIDER_SEED_CANDIDATE');
  const exactContinuation=sameId&&sameId===sameUrl&&['REDIRECT_DESTINATION','SOURCE_BOUND_CONTINUATION'].includes(candidate.originKind)&&typeof candidate.parentCandidateId==='string'&&positiveObjectiveRelevance(candidate)>positiveObjectiveRelevance(sameId);
  if(exactContinuation){const index=history.findIndex(row=>row.candidateId===sameId.candidateId);history[index]=candidate;byId.set(candidate.candidateId,candidate);byUrl.set(url,candidate);updatedIds.push(candidate.candidateId);continue;}
  if(sameId||sameUrl){rejectedCandidates.push({candidateId:candidate.candidateId,reason:'REDIRECT_DESTINATION_DUPLICATE',existingCandidateId:(sameId??sameUrl).candidateId});continue;}history.push(candidate);byId.set(candidate.candidateId,candidate);byUrl.set(url,candidate);discoveredIds.push(candidate.candidateId);
 }
 const reconstruct=activeCandidateIds===undefined;if(!reconstruct&&(!Array.isArray(activeCandidateIds)||new Set(activeCandidateIds).size!==activeCandidateIds.length||activeCandidateIds.some(id=>!byId.has(id))))throw Error('INVALID_PROVIDER_SEED_ACTIVE_FRONTIER');
 const ineligible=new Set(ineligibleCandidateIds),deactivate=new Set(deactivateCandidateIds),prior=reconstruct?history.map(row=>row.candidateId):[...activeCandidateIds],pool=[...new Set([...prior,...discoveredIds,...updatedIds])],rows=pool.map(id=>byId.get(id)).filter(row=>row&&!ineligible.has(row.candidateId)).map((candidate,index)=>({candidate,routing:providerSeedCandidateRouting(researchTarget,candidate,history,index)})).filter(row=>row.routing.executable).sort((a,b)=>compareProviderSeedAuthorityRows(a.routing,b.routing)),selected=rows.slice(0,limit).map(row=>row.candidate.candidateId),active=selected.filter(id=>!deactivate.has(id));
 const selectedSet=new Set(selected),activeSet=new Set(active),deactivatedIds=prior.filter(id=>!activeSet.has(id)&&(deactivate.has(id)||ineligible.has(id))),displacedIds=prior.filter(id=>!selectedSet.has(id)&&!ineligible.has(id)&&!deactivate.has(id)),admittedIds=discoveredIds.filter(id=>activeSet.has(id));
 for(const id of discoveredIds)if(!activeSet.has(id))rejectedCandidates.push({candidateId:id,reason:'PROVIDER_CANDIDATE_DESTINATION_BOUND'});
 return {candidates:history,activeCandidateIds:active,admittedIds,updatedIds,displacedIds,deactivatedIds,rejectedCandidates,reconstructed:reconstruct};
}

const normalizedChain=(parent,page,finalUrl)=>{
 const values=[...(parent?.redirectChain??[]),parent?.url,...(Array.isArray(page?.redirects)?page.redirects:[]),finalUrl].map(value=>normalizeUrl(value)).filter(Boolean),seen=new Set(),chain=[];
 for(const value of values)if(!seen.has(value)){seen.add(value);chain.push(value);}
 return chain;
};
const sameValues=(a,b)=>Array.isArray(a)&&Array.isArray(b)&&a.length===b.length&&a.every((value,index)=>value===b[index]);

export function providerSeedRedirectCandidate({researchTarget,parent,page,candidates,navigationDepthLimit,insertionOrder}){
 const requested=safe(parent?.url),final=safe(page?.url),stop=page?.redirectStop,stopped=page?.outcome==='ROUTING_ONLY'&&stop?.kind==='CROSS_HOST_REDIRECT_STOP';
 if(!requested||!final||requested.hostname===final.hostname||(!stopped&&page?.outcome!=='OK')||page?.truncated===true)return {candidate:null,reason:'NOT_ELIGIBLE_REDIRECT'};
 const stopChain=stop?.redirectChain,pageRedirects=page?.redirects;
 if(stopped&&(safe(stop.requestedUrl)?.href!==requested.href||stop.requestedHost!==requested.hostname||safe(stop.destinationUrl)?.href!==final.href||stop.destinationHost!==final.hostname||safe(stop.sourceUrl)?.href!==stopChain?.at(-2)||stop.sourceHost!==safe(stop.sourceUrl)?.hostname||stop.sourceHost===stop.destinationHost||![301,302,303,307,308].includes(stop.httpStatus)||stop.httpStatus!==page.httpStatus||!sameValues(stopChain,[requested.href,...pageRedirects??[]])||stop.navigationDepth!==pageRedirects?.length||page?.accessDecisions?.some(row=>safe(row.targetUrl)?.hostname===final.hostname)||page.rawSource!==undefined||page.body!==undefined||page.bodyHash!==undefined||page.sourceIntegrity!==undefined))return {candidate:null,reason:'INVALID_REDIRECT_STOP'};
 const access=page?.accessDecisions??[];if(!access.length||access.some(row=>row.decision!=='ALLOWED'))return {candidate:null,reason:'REDIRECT_ACCESS_NOT_ALLOWED'};
 const depth=(parent?.navigationDepth??0)+1;if(depth>navigationDepthLimit)return {candidate:null,reason:'REDIRECT_NAVIGATION_DEPTH_BOUND'};
 const ancestors=new Set([...(parent?.redirectChain??[]),parent.url].map(value=>normalizeUrl(value)).filter(Boolean));if(ancestors.has(final.href))return {candidate:null,reason:'REDIRECT_LOOP'};
 const existing=candidates.find(row=>normalizeUrl(row.url)===final.href),objective=providerSeedObjectiveContinuation(parent,existing);if(existing&&!objective.objectiveIntent)return {candidate:null,reason:'REDIRECT_DESTINATION_DUPLICATE'};
 const candidate={candidateId:existing?.candidateId??'provider-seed-redirect:'+digest([parent.candidateId,final.href,depth]),url:final.href,host:final.hostname,truthAuthority:'NONE',originKind:'REDIRECT_DESTINATION',parentCandidateId:parent.candidateId,parentRequestedUrl:requested.href,parentRequestedHost:requested.hostname,redirectChain:normalizedChain(parent,page,final.href),finalUrl:final.href,finalHost:final.hostname,...objective,discoveryProvenance:{searchIndex:parent.searchIndex,resultIndex:parent.resultIndex,searchRank:parent.searchRank},searchIndex:parent.searchIndex,resultIndex:parent.resultIndex,searchRank:parent.searchRank,navigationDepth:depth,insertionOrder};
 return {candidate,routing:providerSeedCandidateRouting(researchTarget,candidate,[...candidates,candidate],insertionOrder)};
}
