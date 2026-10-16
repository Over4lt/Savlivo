// Inert provider data only. The complete local record remains the authority;
// these summaries never execute embedded code or join neighbouring products.
import {structuredSources} from './structured-material.mjs';
import {parseDataLiteral,embeddedState} from './embedded-state.mjs';
import {digest,providerBound} from './model.mjs';
import {observationService} from './service-association.mjs';
import {bundledPresentation} from './offering-scope.mjs';

const currencies=new Set(Intl.supportedValuesOf('currency'));
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const path=(base,key)=>base+'/'+String(key).replaceAll('~','~0').replaceAll('/','~1');
const period=v=>/^(?:months?|subscription_unit_month)$/i.test(v??'')?'MONTHLY':/^(?:years?|subscription_unit_year)$/i.test(v??'')?'YEARLY':null;
const finite=v=>typeof v==='number'&&Number.isFinite(v)||typeof v==='string'&&/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(v);

function scaleMetadata(body,contentType){
 const maps=[];
 if(contentType==='text/html')for(const root of embeddedState(body).roots.filter(r=>r.complete))for(const node of root.nodes){
  if(!/(?:^|\/)(?:currenciesSubunit|currencyMinorUnits|currencyFractionDigits)$/i.test(node.path)||!object(node.value))continue;
  for(const [currency,digits] of Object.entries(node.value))if(currencies.has(currency)&&Number.isSafeInteger(digits)&&digits>=0&&digits<=4)
   maps.push({currency,digits,start:node.start,end:node.end,path:node.path});
 }
 return maps;
}
function money(v,at,scales){
 if(!object(v)||!finite(v.amount))return null;
 const currency=v.currencyCode??v.currency;if(!currencies.has(currency))return null;
 const raw=v.amount,decimal=String(raw).includes('.');
 let amount=decimal?Number(raw):null,scale=null;
 if(!decimal&&v.unit==='major')amount=Number(raw);
 else if(!decimal){
  const local=Number.isSafeInteger(v.scale)&&v.scale>=0&&v.scale<=4?{digits:v.scale,path:path(at,'scale')}:null;
  const matching=scales.filter(s=>s.currency===currency),unique=new Set(matching.map(s=>s.digits));
  scale=local??(unique.size===1?matching[0]:null);
  if(scale)amount=Number(raw)/10**scale.digits;
 }
 return {raw,amount,currency,scale,source:at};
}
function monetaryFields(record,base,scales){
 const rows=[];
 for(const [key,value] of Object.entries(record)){
  if(!/(?:amount|price|total|tax|base|subtotal|discount|credit|saving|equivalent)/i.test(key))continue;
  const m=money(value,path(base,key),scales);if(m)rows.push({kind:key,...m});
 }
 return rows;
}
function localRecord(value,region,scales,observation){
 const product=object(value.product)?value.product:object(value.item)?value.item:value;
 const id=product.sku??product.id??value.sku??value.id;
 const name=product.name??value.name;
 const subscription=object(product.subscription)?product.subscription:object(value.subscription)?value.subscription:null;
 const money=monetaryFields(value,region.pointer,scales);
 const identity={id:typeof id==='string'&&id.length<=256?id:null,name:typeof name==='string'&&name.length<=256?name:null,path:product===value?region.pointer:path(region.pointer,product===value.product?'product':'item')};
 const interval=subscription?{length:subscription.length??null,unit:subscription.unit??null,kind:period(subscription.unit),path:path(identity.path,'subscription')}:null;
 return {identity,interval,money,trial:object(value.incentive)?{value:structuredClone(value.incentive),path:path(region.pointer,'incentive')}:null,
  record:structuredClone(value),source:{observation:observation.id,sha256:observation.sha256,url:observation.url,start:region.start,end:region.end,recordHash:digest(observation.body.slice(region.start,region.end)),path:region.pointer,parent:region.parent,acquisition:structuredClone(observation.context)}};
}
function admission(fact){
 const v=fact.record,p=object(v.product)?v.product:object(v.item)?v.item:v;
 const offered=/(?:^|\/)(?:offers?|offered\w*|products?)(?:\/|$)/i.test(fact.source.path)||v.offered===true;
 const type=String(p.productType??p.type??v.productType??'');
 const relationship=/MEMBERSHIP/i.test(type)?'MEMBERSHIP':/SUBSCRIPTION/i.test(type)?'SUBSCRIPTION':null;
 const consumer=p.consumer===true||v.consumer===true||v.membershipProductDetails?.maxApplicableAccounts===1;
 const total=fact.money.find(m=>m.kind==='totalAmountWithTaxes')??fact.money.find(m=>m.kind==='consumerTotal')??fact.money.find(m=>m.kind==='totalAmount')??fact.money.find(m=>m.kind==='price');
 const discounted=fact.money.some(m=>/^discountAmount/i.test(m.kind)&&Number(m.raw)>0);
 // An offered subscription product with its own ordinary payable total binds
 // price to subscription period. An isolated interval or display equivalent does not.
 const ready=offered&&fact.identity.id&&relationship&&consumer&&fact.interval?.length===1&&fact.interval.kind&&total?.amount!==null&&total?.amount!==undefined&&
  !/(?:equivalent|normalized|effective|reference)/i.test(total.kind)&&!discounted&&v.prepaid!==true&&p.prepaid!==true&&v.accessOnly!==true&&p.accessOnly!==true;
 if(!ready)return null;
 return {id:fact.identity.id,name:fact.identity.name,relationship,consumer:true,role:'ORDINARY',monetaryKind:'SUBSCRIPTION_CHARGE',
  amount:total.amount,currency:total.currency,amountDerivation:'EXPLICIT',billingCadence:fact.interval.kind,cadence:'UNKNOWN',market:null,
  nativeStructured:{sourcePath:fact.source.path,interval:fact.interval,money:fact.money,trial:fact.trial,charge:total.source}};
}

export function projectNativeStructured(o,objective){
 const source={offers:[]},bindings={},facts=[];
 if(o.format!=='WEB'||!['text/html','application/xhtml+xml','application/json','application/ld+json'].includes(o.contentType)||
  o.kind!=='PROVIDER'||o.outcome!=='OK'||o.truncated||o.completeness==='INCOMPLETE'||o.httpStatus!==200||digest(o.body)!==o.sha256||!providerBound(objective,o.url))
  return {source,bindings,facts,limited:false,referenceKind:'NATIVE_STRUCTURED'};
 const structured=structuredSources(o.body,o.contentType),scales=scaleMetadata(o.body,o.contentType),service=observationService(o,objective);
 const regions=[...structured.regions];
 if(o.contentType==='text/html')for(const root of embeddedState(o.body).roots.filter(r=>r.complete))for(const node of root.nodes){
  if(!object(node.value)||!object(node.value.product)&&!object(node.value.item)||Buffer.byteLength(o.body.slice(node.start,node.end))>4096)continue;
  if(!regions.some(r=>r.start===node.start&&r.end===node.end))regions.push({start:node.start,end:node.end,pointer:'/embedded-'+root.root.start+node.path,parent:'/embedded-'+root.root.start+node.parent});
 }
 if(service){source.serviceId=objective.serviceId;bindings['/serviceId']=service.identity;}
 for(const region of regions.slice(0,64)){
  const raw=o.body.slice(region.start,region.end);let value;
  try{value=JSON.parse(raw);}catch{value=parseDataLiteral(raw);}
  if(!object(value))continue;
  const product=object(value.product)?value.product:object(value.item)?value.item:value;
  if(!object(product.subscription)&&!object(value.subscription)&&!Object.keys(value).some(k=>/(?:amount|price|total)/i.test(k)))continue;
  const fact=localRecord(value,region,scales,o);facts.push(fact);
  if(!service)continue;
  if(bundledPresentation(fact.identity.name,objective.serviceName))continue;
  const offer=admission(fact);if(!offer)continue;
  const pointer='/offers/'+source.offers.length;source.offers.push(offer);
  bindings[pointer]={start:region.start,end:region.end,sha256:fact.source.recordHash,structuralPath:region.pointer,parentPath:region.parent,observation:o.id,sourceHash:o.sha256,nativeStructured:true,admitted:true};
 }
 return {source,bindings,facts,limited:structured.limited,referenceKind:'NATIVE_STRUCTURED'};
}

// Projection may contain diagnostic facts. Only a source-checked offer gets a
// persisted candidate. Truth continues to consume observation.candidates.
export function admittedProjectionCandidates(projection){
 return projection.candidates.filter(c=>{
  if(c.kind!=='OFFER')return true;
  const offer=projection.source.offers[Number(c.pointer.split('/').at(-1))];
  return !offer?.nativeStructured||projection.bindings[c.pointer]?.nativeStructured===true&&projection.bindings[c.pointer].admitted===true;
 });
}
