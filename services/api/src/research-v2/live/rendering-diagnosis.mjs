// Planning-only diagnosis for retained provider HTML that contains commercial
// values behind declarative visibility conditions. It grants no evidence,
// authority, market applicability, or browser transport by itself.
export function conditionalCommercialRenderingRequired(body){
 const text=String(body??''),conditions=text.match(/\b(?:x-show|v-if|ng-if|data-(?:show|visible|condition)|:[\w-]*(?:show|visible))\s*=/giu)??[];
 return conditions.length>0&&/(?:USD|EUR|GBP|NOK|SEK|DKK|CHF|CAD|AUD|JPY|\$|€|£)\s*\d|\d(?:[.,]\d{1,2})?\s*(?:USD|EUR|GBP|NOK|SEK|DKK|CHF|CAD|AUD|JPY|\$|€|£)/iu.test(text)&&/(?:\/\s*(?:month|mo\.?|monat|måned)|per\s+(?:month|monat|måned)|monthly|monatlich|månedsvis|\/\s*(?:year|yr\.?|jahr|år)|annual|yearly|jährlich)/iu.test(text);
}

// A provider can return an application bootstrap with no commercial text at
// all. This diagnoses a missing representation only; it supplies no Truth.
export function applicationShellRenderingRequired(body){
 const html=String(body??'');
 const bodyMarkup=/<body\b[^>]*>([\s\S]*?)<\/body>/iu.exec(html)?.[1]??html;
 const visible=bodyMarkup.replace(/<script\b[^>]*>[\s\S]*?<\/script>/giu,' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/giu,' ').replace(/<[^>]+>/gu,' ').replace(/&(?:nbsp|#160);/giu,' ').trim();
 const scripts=(html.match(/<script\b/giu)??[]).length;
 const appRoot=/<[a-z][a-z0-9]*-[a-z0-9-]+\b/iu.test(bodyMarkup)||/<(?:div|main)\b[^>]*\bid=["'](?:app|root|__next)["']/iu.test(bodyMarkup);
 const priceEvidence=/(?:[$£€]\s*\d|\b(?:USD|GBP|EUR|AUD|CAD|NOK|SEK|DKK|JPY)\s*\d|\b(?:amount|price)\s*["']?\s*:\s*["']?\d)/iu.test(html);
 return scripts>=2&&appRoot&&visible.length<=80&&!priceEvidence;
}

const renderingPropositions=new Set(['SERVICE_IDENTITY','PRICE_AMOUNT','CURRENCY','MONTHLY_CADENCE','MONTHLY_SUBSCRIPTION','CONSUMER_SUBSCRIPTION','TARGET_MARKET']);
const unresolvedRenderingNeeds=truth=>(truth?.needs??[]).filter(row=>row?.state==='UNRESOLVED'&&renderingPropositions.has(row.proposition));
const latestDiagnosis=t=>t.renderingNeed??[...(t.acquisitionOutcomes??[])].reverse().find(row=>row.renderingRequired===true)??(t.demonstratedRendering===true?{url:t.providerSeedCandidateServiceContext?.objectiveResource?.url??t.knownCommercialUrls?.[0]??t.urls?.[0]??null,transport:t.v3Observation?.context?.transport??'DIRECT'}:null);

// A representation diagnosis is planning state. Its actionability is derived
// from the latest V3 needs, never from the historical diagnosis alone.
export function activeRenderingNeed(target){
 if(target?.demonstratedRendering!==true)return null;
 const diagnosed=latestDiagnosis(target);if(!diagnosed?.url)return null;
 const truth=target.v3Truth,remaining=unresolvedRenderingNeeds(truth);
 if(truth&&remaining.length===0)return null;
 const transport=diagnosed.transport??(diagnosed.countryV3Evaluation?.status==='EVALUATED'?'DECODO':target.v3Observation?.context?.transport??'DIRECT');
 const routeOnly=diagnosed.kind==='DECODO_BROWSER_REACQUISITION';
 const need={kind:routeOnly?diagnosed.kind:'RENDERED_REPRESENTATION',url:diagnosed.url,transport,market:target.market,sourceHash:routeOnly?null:diagnosed.sourceHash??target.v3Observation?.sha256??null,runDirectory:diagnosed.runDirectory??null,...(routeOnly?{researchLinkId:diagnosed.researchLinkId}:{}),motivatingNeeds:remaining.map(row=>({id:row.id,offerId:row.offerId??null,proposition:row.proposition,market:row.market??null,state:row.state}))};
 const attempted=(target.renderingOutcomes??[]).some(row=>row.url===need.url&&row.transport===need.transport&&row.sourceHash===need.sourceHash);
 return attempted?null:need;
}

export function reconcileRenderingNeed(target,{required=false,url=null,runDirectory=null,transport=null,sourceHash=null,navigationUrl=null}={}){
 const before=target.demonstratedRendering===true,truth=target.v3Truth,remaining=unresolvedRenderingNeeds(truth),material=required===true&&(!truth||remaining.length>0);
 if(material){target.demonstratedRendering=true;target.renderingNeed={kind:'RENDERED_REPRESENTATION',url,runDirectory,transport:transport??target.v3Observation?.context?.transport??'DIRECT',market:target.market,sourceHash:sourceHash??target.v3Observation?.sha256??null,navigationUrl,motivatingNeeds:remaining.map(row=>({id:row.id,offerId:row.offerId??null,proposition:row.proposition,market:row.market??null,state:row.state}))};target.researchDiagnosis='RENDERING_REQUIRED';}
 else {target.demonstratedRendering=false;delete target.renderingNeed;if(target.researchDiagnosis==='RENDERING_REQUIRED')target.researchDiagnosis=truth?.established?'V3_TRUTH_ESTABLISHED':'V3_LATEST_NEEDS_RECONCILED';}
 target.capabilityReconciliation={kind:'RENDERED_REPRESENTATION',historicalDiagnosis:required===true||before,actionable:material,remainingNeeds:remaining.map(row=>row.id),basis:material?'LATEST_V3_UNRESOLVED_NEEDS':'LATEST_V3_NEEDS_SATISFIED'};
 return target.capabilityReconciliation;
}
