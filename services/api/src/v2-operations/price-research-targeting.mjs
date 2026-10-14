import {createHash} from 'node:crypto';
import {countryCurrencyData} from '../../../../packages/contracts/src/markets.ts';
import {listResearchServiceIdentities} from '../research-v3/research-identity-store.mjs';
import {loadResearchServiceProjection} from '../research-v3/research-service-projection.mjs';

const fail=code=>{throw Object.assign(Error(code),{status:400});};
const canonicalMarkets=countryCurrencyData.map(([id,name,currency],order)=>({id,name,currency,order}));
const marketIds=canonicalMarkets.map(row=>row.id),marketSet=new Set(marketIds);
const unique=values=>[...new Set(values)];
export const maxPriceResearchBatchTargets=10;

function selection(input){
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(key=>!['services','markets'].includes(key)))fail('INVALID_PRICE_RESEARCH_TARGETING');
 const services=input.services??[],markets=input.markets??[];
 if(!Array.isArray(services)||services.some(value=>typeof value!=='string'||value.length<1||value.length>160)||new Set(services).size!==services.length)fail('INVALID_PRICE_RESEARCH_SERVICES');
 if(!Array.isArray(markets)||markets.length>marketIds.length||markets.some(value=>typeof value!=='string'||!marketSet.has(value))||new Set(markets).size!==markets.length)fail('INVALID_PRICE_RESEARCH_MARKETS');
 return {services,markets};
}

const serviceView=row=>({
 serviceId:row.serviceId,canonicalSlug:row.canonicalSlug,name:row.name,aliases:row.aliases,categories:row.categories,
 status:row.status,researchable:row.researchable,selectable:row.status==='RESEARCHABLE'&&row.researchable===true,
 frozenLifecycleMember:row.frozenLifecycleMember,productCatalogMember:row.productCatalogMember,
 researchScopeHints:row.researchScopeHints,
 sources:{baseline:!!row.sources.baseline,frozen:!!row.sources.frozen,productCatalog:!!row.sources.productCatalog,database:!!row.sources.database},
 reconciliation:row.reconciliation
});

function orderedMarkets(service,explicit){
 if(explicit.length)return explicit;
 const hinted=unique(service.researchScopeHints.map(hint=>hint.market)).filter(market=>marketSet.has(market));
 return [...hinted,...marketIds.filter(market=>!hinted.includes(market))];
}

export function projectPriceResearchTargeting(projection,input={}){
 if(!projection||!Array.isArray(projection.rows))fail('INVALID_RESEARCH_SERVICE_PROJECTION');
 const requested=selection(input),services=projection.rows.map(serviceView),byId=new Map(services.map(row=>[row.serviceId,row]));
 for(const id of requested.services){const row=byId.get(id);if(!row)fail('UNKNOWN_PRICE_RESEARCH_SERVICE');if(!row.selectable)fail('PRICE_RESEARCH_SERVICE_NOT_SELECTABLE');}
 const selected=services.filter(row=>requested.services.includes(row.serviceId)),targets=[];
 for(const service of selected)for(const market of orderedMarkets(service,requested.markets)){
  const details=canonicalMarkets.find(row=>row.id===market);
  targets.push({id:`price-research:${service.serviceId}:${market}`,serviceId:service.serviceId,serviceName:service.name,targetMarket:market,marketName:details.name,currency:details.currency,marketApplicabilityEstablished:false,researchScopeHints:service.researchScopeHints});
 }
 const selectable=services.filter(row=>row.selectable).length,revision=createHash('sha256').update(JSON.stringify({services:services.map(row=>[row.serviceId,row.status,row.researchable,row.researchScopeHints]),markets:canonicalMarkets})).digest('hex');
 return {
  version:'PRICE_RESEARCH_TARGETING_V1',readOnly:true,meaning:'INVESTIGATION_SCOPE_NOT_AVAILABILITY',revision,
  counts:{canonicalServices:projection.counts?.canonical??services.length,visibleServices:services.length,researchableServices:selectable,selectableServices:selectable,diagnosticServices:services.length-selectable,markets:canonicalMarkets.length,logicalServiceMarketCombinations:selectable*canonicalMarkets.length},
  services,markets:canonicalMarkets.map(({order,...row})=>row),
  selection:{explicitServiceSelection:requested.services.length>0,implicitAllServices:false,requestedServices:requested.services,effectiveServices:selected.map(row=>row.serviceId),requestedMarkets:requested.markets,effectiveMarkets:requested.services.length?(requested.markets.length?requested.markets:marketIds):[],marketMode:requested.services.length?(requested.markets.length?'EXPLICIT':'ALL_CANONICAL'):'NO_SERVICE_SELECTION',canStart:false},
  selectedServices:selected.length,selectedMarkets:requested.services.length?(requested.markets.length?requested.markets.length:canonicalMarkets.length):0,serviceMarketTargets:targets.length,targets
 };
}

const cursorBinding=(model,offset)=>({version:1,revision:model.revision,services:model.selection.effectiveServices,markets:model.selection.requestedMarkets,logicalTargetCount:model.targets.length,offset});
const cursorFor=(model,offset)=>`${offset}.${createHash('sha256').update(JSON.stringify(cursorBinding(model,offset))).digest('hex')}`;

export function selectPriceResearchTargetBatch(model,cursor=null){
 if(!model?.selection?.explicitServiceSelection||!Array.isArray(model.targets)||!model.targets.length)fail('PRICE_RESEARCH_SELECTION_REQUIRED');
 let offset=0;
 if(cursor!==null&&cursor!==undefined){
  if(typeof cursor!=='string'||!/^[1-9][0-9]*\.[a-f0-9]{64}$/.test(cursor))fail('INVALID_PRICE_RESEARCH_CURSOR');
  const split=cursor.indexOf('.');offset=Number(cursor.slice(0,split));
  if(!Number.isSafeInteger(offset)||offset%maxPriceResearchBatchTargets!==0||offset>=model.targets.length||cursor!==cursorFor(model,offset))fail('INVALID_PRICE_RESEARCH_CURSOR');
 }
 const targets=model.targets.slice(offset,offset+maxPriceResearchBatchTargets),nextOffset=offset+targets.length;
 return {offset,cursor:cursor??null,targets,continuationCursor:nextOffset<model.targets.length?cursorFor(model,nextOffset):null,logicalTargetCount:model.targets.length};
}

export async function loadPriceResearchTargeting(input={},options={}){
 const databaseIdentities=options.databaseIdentities??await listResearchServiceIdentities({client:options.client});
 const projection=loadResearchServiceProjection({repo:options.repo,...(options.lifecycleInput?{lifecycleInput:options.lifecycleInput}:{}),databaseIdentities});
 return projectPriceResearchTargeting(projection,input);
}
