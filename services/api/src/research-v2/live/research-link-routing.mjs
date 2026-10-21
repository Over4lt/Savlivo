// Persisted operator routes are acquisition hints, never source authority.
import {executableAction,resourceKey} from './execution-capabilities.mjs';
import {projectEstablishedV3Offerings} from '../inventory/v3-result-projection.mjs';
import {providerMarketSelectorRoute} from './retained-render-source.mjs';
import {providerRoutingAuthority} from './provider-routing-authority.mjs';

export function nextResearchLink(target,executionContext=null){
 if(target?.operationsObjective!=='PRICE_RESEARCH'||(target.verified??[]).length>0||projectEstablishedV3Offerings(target).some(row=>row.market===target.market))return null;
 const attempted=new Set((target.researchLinkOutcomes??[]).map(row=>row.id));
 const links=(target.researchLinks??[]).slice(0,20),exact=links.filter(link=>link.marketScope==='MARKET_SPECIFIC'),global=links.filter(link=>link.marketScope==='GLOBAL');
 for(const link of exact){
  if(!link?.enabled||link.truthAuthority!=='NONE'||attempted.has(link.id)||link.marketScope==='MARKET_SPECIFIC'&&link.marketCode!==target.market)continue;
  const directProbe=providerMarketSelectorRoute(link)&&target.capabilities?.direct===true&&target.capabilities?.browser===true&&executionContext?.available?.direct!==false&&executionContext?.available?.browser!==false&&!(target.reads??[]).some(row=>row.requestedUrl===link.url);
  return {route:directProbe?'DIRECT':'DECODO',reason:directProbe?'PROVIDER_MARKET_SELECTOR_PROBE':'PRICE_RESEARCH_VERIFICATION_REQUIRED',url:link.url,researchLinkId:link.id,researchLinkKind:link.kind,researchLinkScope:link.marketScope,researchLinkMarket:link.marketCode??null,targetMarket:target.market,truthAuthority:'NONE',directAppropriate:directProbe,discoveryRequired:false,decodoConditional:true,runnable:true,candidates:[{value:10}],decodoVerification:{status:'PENDING',url:link.url}};
 }
 for(const strategy of (target.learnedPricingStrategies??[]).slice(0,16)){
  if((target.learnedStrategyTrace?.rejected??[]).some(row=>row.id===strategy.id))continue;
  if((target.learnedStrategyTrace?.attempted??[]).some(row=>row.id===strategy.id))continue;
  if(strategy.method==='DECODO'&&(target.acquisitionOutcomes??[]).some(row=>row.url===strategy.url&&row.transport==='DECODO'))continue;
  if(strategy.method==='DIRECT'&&(target.reads??[]).some(row=>row.requestedUrl===strategy.url))continue;
  // Browser learning chooses only a fresh provider selector probe. The actual
  // Browser action still requires its own retained source and market proof.
  if(strategy.method==='BROWSER'){
   const link=(target.researchLinks??[]).find(row=>providerMarketSelectorRoute(row)&&row.url===strategy.url),trace=target.learnedStrategyTrace;
   if(link&&target.capabilities?.direct===true&&target.capabilities?.browser===true)return {route:'DIRECT',reason:'PROVIDER_MARKET_SELECTOR_PROBE',url:strategy.url,researchLinkId:link.id,learnedStrategyId:strategy.id,learnedStrategyMethod:'BROWSER',targetMarket:target.market,truthAuthority:'NONE',directAppropriate:true,discoveryRequired:false,decodoConditional:true,runnable:true,candidates:[{value:10}]};
   const countryLink=(target.researchLinks??[]).find(row=>row.enabled===true&&row.url===strategy.url&&row.truthAuthority==='NONE'&&(row.marketScope==='GLOBAL'||row.marketScope==='MARKET_SPECIFIC'&&row.marketCode===target.market));
   if(target.capabilities?.decodo===true&&target.capabilities?.browser===true&&providerRoutingAuthority(target,strategy.url))return {route:'DECODO',reason:'PRICE_RESEARCH_VERIFICATION_REQUIRED',url:strategy.url,...(countryLink?{researchLinkId:countryLink.id}:{}),learnedStrategyId:strategy.id,learnedStrategyMethod:'BROWSER',targetMarket:target.market,truthAuthority:'NONE',directAppropriate:false,discoveryRequired:false,decodoConditional:true,runnable:true,candidates:[{value:10}],decodoVerification:{status:'PENDING',url:strategy.url}};
   if(trace&&!trace.rejected.some(row=>row.id===strategy.id)&&trace.rejected.length<16)trace.rejected.push({id:strategy.id,method:'BROWSER',priorityTier:strategy.priorityTier,reason:target.capabilities?.browser===true?'BROWSER_TRANSPORT_UNAVAILABLE':'CURRENT_SELECTOR_RESEARCH_LINK_REQUIRED'});continue;
  }
  return {route:strategy.method,reason:strategy.method==='DECODO'?'PRICE_RESEARCH_VERIFICATION_REQUIRED':'LEARNED_PROVIDER_PRICING_METHOD',url:strategy.url,learnedStrategyId:strategy.id,targetMarket:target.market,truthAuthority:'NONE',directAppropriate:strategy.method==='DIRECT',discoveryRequired:false,decodoConditional:true,runnable:true,candidates:[{value:10}]};
 }
 if(target.learnedStrategyTrace?.relevant>0&&!target.learnedStrategyTrace.fallbackReason)target.learnedStrategyTrace.fallbackReason='LEARNED_STRATEGIES_ATTEMPTED_OR_INCOMPATIBLE';
 for(const candidate of (target.derivedCountryCandidates??[]).slice(0,2)){
  if(candidate?.service!==target.service||candidate?.market!==target.market||!candidate?.url||[...(target.acquisitionOutcomes??[]).map(row=>row.url),...(target.decisions??[]).filter(row=>row.acquisitionReserved).map(row=>row.url),...(target.derivedCountrySourceOutcomes??[]).map(row=>row.url)].some(url=>resourceKey(url)===resourceKey(candidate.url)))continue;
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
  if(plan.learnedStrategyId){const trace=target.learnedStrategyTrace??={loaded:0,relevant:0,attempted:[],rejected:[],fallbackReason:null,verifiedStrategyId:null},strategy=(target.learnedPricingStrategies??[]).find(row=>row.id===plan.learnedStrategyId);if(trace.rejected.length<16)trace.rejected.push({id:plan.learnedStrategyId,method:strategy?.method??plan.route,priorityTier:strategy?.priorityTier??null,reason:gate.reason});continue;}
  if(plan.route==='DIRECT'){const fallback={...plan,route:'DECODO',reason:'PRICE_RESEARCH_VERIFICATION_REQUIRED',directAppropriate:false};if(executableAction(target,fallback,executionContext).executable)return fallback;}
  if(plan.derivedCountrySource){(target.derivedCountrySourceOutcomes??=[]).push({url:plan.url,reason:gate.reason});continue;}
  const link=target.researchLinks.find(row=>row.id===plan.researchLinkId);
  (target.researchLinkOutcomes??=[]).push(researchLinkOutcome({link,market:target.market,result:/ACCESS|POLICY|ROBOTS/.test(gate.reason)?'ACCESS_BLOCKED':'DECODO_UNAVAILABLE',reason:gate.reason}));
 }
}

export function researchLinkOutcome({link,market,decodoAttempted=false,result,sourceClassification=null,browserAttempted=false,reason=null,at=new Date().toISOString()}){
 return {id:link.id,kind:link.kind,scope:link.marketScope,market:link.marketCode??null,targetMarket:market,transport:'DECODO',decodoAttempted,browserAttempted,result,sourceClassification,reason,at};
}
