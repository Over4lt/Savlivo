import {createHash} from 'node:crypto';
import {countryCurrencyData} from '../../../../packages/contracts/src/markets.ts';
import {listResearchServiceIdentities} from '../research-v3/research-identity-store.mjs';
import {loadResearchServiceProjection} from '../research-v3/research-service-projection.mjs';
import {listMarketExclusions} from './market-exclusions.mjs';
import {discoverOfficialMarketAvailability} from './market-availability.mjs';

const fail=code=>{throw Object.assign(Error(code),{status:400});};
const canonicalMarkets=countryCurrencyData.map(([id,name,currency],order)=>({id,name,currency,order}));
const marketIds=canonicalMarkets.map(row=>row.id),marketSet=new Set(marketIds);
const unique=values=>[...new Set(values)];

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
 const hinted=unique(service.researchScopeHints.map(hint=>hint.market)).filter(market=>marketSet.has(market)),hintedSet=new Set(hinted);
 return [...hinted,...marketIds.filter(market=>!hintedSet.has(market))];
}

export function projectPriceResearchTargeting(projection,input={},exclusions=[],availability=[]){
 if(!projection||!Array.isArray(projection.rows))fail('INVALID_RESEARCH_SERVICE_PROJECTION');
 const requested=selection(input),services=projection.rows.map(serviceView),byId=new Map(services.map(row=>[row.serviceId,row])),marketById=new Map(canonicalMarkets.map(row=>[row.id,row]));
 for(const id of requested.services){const row=byId.get(id);if(!row)fail('UNKNOWN_PRICE_RESEARCH_SERVICE');if(!row.selectable)fail('PRICE_RESEARCH_SERVICE_NOT_SELECTABLE');}
 const selectedIds=new Set(requested.services),selected=services.filter(row=>selectedIds.has(row.serviceId)),targets=[],excludedPairs=[],unavailablePairs=[];
 const blocked=new Set(exclusions.filter(row=>selectedIds.has(row.service_id)&&marketSet.has(row.market_code)).map(row=>row.service_id+'\u0000'+row.market_code));
 const proven=new Map(availability.filter(row=>selectedIds.has(row?.serviceId)&&row?.version===1&&/^[a-f0-9]{64}$/.test(row.sourceHash??'')&&
  Number.isFinite(Date.parse(row.checkedAt??''))&&Date.parse(row.checkedAt)<=Date.now()&&Date.now()-Date.parse(row.checkedAt)<6*60*60*1000&&
  Array.isArray(row.unavailableMarkets)).map(row=>[row.serviceId,row]));
 for(const service of selected)for(const market of orderedMarkets(service,requested.markets)){
  if(blocked.has(service.serviceId+'\u0000'+market)){excludedPairs.push({serviceId:service.serviceId,market});continue;}
  const proof=proven.get(service.serviceId);
  if(proof?.unavailableMarkets.includes(market)){unavailablePairs.push({serviceId:service.serviceId,market,sourceUrl:proof.sourceUrl,sourceHash:proof.sourceHash,checkedAt:proof.checkedAt});continue;}
  const details=marketById.get(market);
  targets.push({id:`price-research:${service.serviceId}:${market}`,serviceId:service.serviceId,serviceName:service.name,targetMarket:market,marketName:details.name,currency:details.currency,marketApplicabilityEstablished:false,researchScopeHints:service.researchScopeHints});
 }
 const selectable=services.filter(row=>row.selectable).length,revision=createHash('sha256').update(JSON.stringify({services:services.map(row=>[row.serviceId,row.status,row.researchable,row.researchScopeHints]),markets:canonicalMarkets,exclusions:[...blocked].sort(),availability:[...proven.values()].map(row=>[row.serviceId,row.sourceHash,row.checkedAt,row.unavailableMarkets]).sort((a,b)=>a[0].localeCompare(b[0]))})).digest('hex');
 return {
  version:'PRICE_RESEARCH_TARGETING_V1',readOnly:true,meaning:'INVESTIGATION_SCOPE_NOT_AVAILABILITY',revision,
  counts:{canonicalServices:projection.counts?.canonical??services.length,visibleServices:services.length,researchableServices:selectable,selectableServices:selectable,diagnosticServices:services.length-selectable,markets:canonicalMarkets.length,logicalServiceMarketCombinations:selectable*canonicalMarkets.length},
  services,markets:canonicalMarkets.map(({order,...row})=>row),
  selection:{explicitServiceSelection:requested.services.length>0,implicitAllServices:false,requestedServices:requested.services,effectiveServices:selected.map(row=>row.serviceId),requestedMarkets:requested.markets,effectiveMarkets:requested.services.length?(requested.markets.length?requested.markets:marketIds):[],marketMode:requested.services.length?(requested.markets.length?'EXPLICIT':'ALL_CANONICAL'):'NO_SERVICE_SELECTION',canStart:false},
  selectedServices:selected.length,selectedMarkets:requested.services.length?(requested.markets.length?requested.markets.length:canonicalMarkets.length):0,excludedTargetCount:excludedPairs.length,autoSkippedTargetCount:unavailablePairs.length,autoSkippedPairs:unavailablePairs,availabilityProofs:[...proven.values()],availabilityCheckedServices:proven.size,availabilityUnknownServices:selected.length-proven.size,serviceMarketTargets:targets.length,targets
 };
}

export function selectPriceResearchTargets(model){
 if(!model?.selection?.explicitServiceSelection||!Array.isArray(model.targets))fail('PRICE_RESEARCH_SELECTION_REQUIRED');
 if(!model.targets.length)fail(model.excludedTargetCount===1&&model.selectedServices===1&&model.selectedMarkets===1?'PRICE_RESEARCH_MARKET_EXCLUDED':model.autoSkippedTargetCount===1&&model.selectedServices===1&&model.selectedMarkets===1?'PRICE_RESEARCH_MARKET_UNAVAILABLE':'NO_ELIGIBLE_PRICE_RESEARCH_TARGETS');
 return {targets:model.targets,logicalTargetCount:model.targets.length};
}

export async function loadPriceResearchTargeting(input={},options={}){
 const requested=selection(input);
 const databaseIdentities=options.databaseIdentities??await listResearchServiceIdentities({client:options.client});
 const projection=loadResearchServiceProjection({repo:options.repo,...(options.lifecycleInput?{lifecycleInput:options.lifecycleInput}:{}),databaseIdentities});
 const exclusions=options.marketExclusions??(options.databaseIdentities!==undefined&&!options.client?[]:await listMarketExclusions(requested.services,{client:options.client}));
 const selected=projection.rows.filter(row=>requested.services.includes(row.serviceId));
 const availability=options.marketAvailability??[];
 if(options.marketAvailability===undefined&&options.availabilityDiscovery===true){
  const bounded=selected.slice(0,8);
  for(let index=0;index<bounded.length;index+=2){
   availability.push(...await Promise.all(bounded.slice(index,index+2).map(row=>discoverOfficialMarketAvailability({serviceId:row.serviceId,name:row.name},{...options.availabilityOptions,ledgerRoot:options.root,paidSearchEnabled:options.availabilityPaidSearch===true}).catch(()=>null))));
  }
 }
 return projectPriceResearchTargeting(projection,input,exclusions,availability.filter(Boolean));
}
