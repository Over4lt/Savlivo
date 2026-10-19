// Persisted operator routes are acquisition hints, never source authority.
import {executableAction,resourceKey} from './execution-capabilities.mjs';
import {projectEstablishedV3Offerings} from '../inventory/v3-result-projection.mjs';
import {providerMarketSelectorRoute} from './retained-render-source.mjs';

export function nextResearchLink(target,executionContext=null){
 if(target?.operationsObjective!=='PRICE_RESEARCH'||(target.verified??[]).length>0||projectEstablishedV3Offerings(target).some(row=>row.market===target.market))return null;
 const attempted=new Set((target.researchLinkOutcomes??[]).map(row=>row.id));
 const links=(target.researchLinks??[]).slice(0,20),exact=target.service==='max'?links.filter(link=>link.marketScope==='MARKET_SPECIFIC'):links,global=target.service==='max'?links.filter(link=>link.marketScope==='GLOBAL'):[];
 for(const link of exact){
  if(!link?.enabled||link.truthAuthority!=='NONE'||attempted.has(link.id)||link.marketScope==='MARKET_SPECIFIC'&&link.marketCode!==target.market)continue;
  const directProbe=providerMarketSelectorRoute(link)&&target.capabilities?.direct===true&&target.capabilities?.browser===true&&executionContext?.available?.direct!==false&&executionContext?.available?.browser!==false&&!(target.reads??[]).some(row=>row.requestedUrl===link.url);
  return {route:directProbe?'DIRECT':'DECODO',reason:directProbe?'PROVIDER_MARKET_SELECTOR_PROBE':'PRICE_RESEARCH_VERIFICATION_REQUIRED',url:link.url,researchLinkId:link.id,researchLinkKind:link.kind,researchLinkScope:link.marketScope,researchLinkMarket:link.marketCode??null,targetMarket:target.market,truthAuthority:'NONE',directAppropriate:directProbe,discoveryRequired:false,decodoConditional:true,runnable:true,candidates:[{value:10}],decodoVerification:{status:'PENDING',url:link.url}};
 }
 for(const candidate of (target.derivedCountryCandidates??[]).slice(0,2)){
  if(target.service!=='max'||!candidate?.url||[...(target.acquisitionOutcomes??[]).map(row=>row.url),...(target.decisions??[]).filter(row=>row.acquisitionReserved).map(row=>row.url),...(target.derivedCountrySourceOutcomes??[]).map(row=>row.url)].some(url=>resourceKey(url)===resourceKey(candidate.url)))continue;
  return {route:'DECODO',reason:'PRICE_RESEARCH_VERIFICATION_REQUIRED',url:candidate.url,derivedCountrySource:true,targetMarket:target.market,truthAuthority:'NONE',directAppropriate:false,discoveryRequired:false,decodoConditional:true,runnable:true,candidates:[{value:10}],decodoVerification:{status:'PENDING',url:candidate.url}};
 }
 for(const link of global){
  if(!link?.enabled||link.truthAuthority!=='NONE'||attempted.has(link.id))continue;
  const directProbe=providerMarketSelectorRoute(link)&&target.capabilities?.direct===true&&target.capabilities?.browser===true&&executionContext?.available?.direct!==false&&executionContext?.available?.browser!==false&&!(target.reads??[]).some(row=>row.requestedUrl===link.url);
  return {route:directProbe?'DIRECT':'DECODO',reason:directProbe?'PROVIDER_MARKET_SELECTOR_PROBE':'PRICE_RESEARCH_VERIFICATION_REQUIRED',url:link.url,researchLinkId:link.id,researchLinkKind:link.kind,researchLinkScope:link.marketScope,researchLinkMarket:null,targetMarket:target.market,truthAuthority:'NONE',directAppropriate:directProbe,discoveryRequired:false,decodoConditional:true,runnable:true,candidates:[{value:10}],decodoVerification:{status:'PENDING',url:link.url}};
 }
 return null;
}

export function prepareResearchLinkPlan(target,executionContext){
 while(true){
  const plan=nextResearchLink(target,executionContext);if(!plan)return null;
  const gate=executableAction(target,plan,executionContext);
  if(gate.executable)return plan;
  if(plan.route==='DIRECT'){const fallback={...plan,route:'DECODO',reason:'PRICE_RESEARCH_VERIFICATION_REQUIRED',directAppropriate:false};if(executableAction(target,fallback,executionContext).executable)return fallback;}
  if(plan.derivedCountrySource){(target.derivedCountrySourceOutcomes??=[]).push({url:plan.url,reason:gate.reason});continue;}
  const link=target.researchLinks.find(row=>row.id===plan.researchLinkId);
  (target.researchLinkOutcomes??=[]).push(researchLinkOutcome({link,market:target.market,result:/ACCESS|POLICY|ROBOTS/.test(gate.reason)?'ACCESS_BLOCKED':'DECODO_UNAVAILABLE',reason:gate.reason}));
 }
}

export function researchLinkOutcome({link,market,decodoAttempted=false,result,sourceClassification=null,browserAttempted=false,reason=null,at=new Date().toISOString()}){
 return {id:link.id,kind:link.kind,scope:link.marketScope,market:link.marketCode??null,targetMarket:market,transport:'DECODO',decodoAttempted,browserAttempted,result,sourceClassification,reason,at};
}
