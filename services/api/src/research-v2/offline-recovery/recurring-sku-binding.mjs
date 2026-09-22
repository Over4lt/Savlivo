// Non-executing ID joins within a response-bound product/SKU/availability catalog.
const pathOf=n=>n.parent?pathOf(n.parent)+'/'+n.tag+'['+n.index+']':'$';
const hidden=x=>x?.hidden===true||x?.isHidden===true||x?.shouldDisplay===false||x?.isPreorder===true;
const visible=n=>{for(let a=n;a;a=a.parent)if(a.attrs?.['aria-hidden']==='true'||Object.hasOwn(a.attrs??{},'hidden')||/display\s*:\s*none|visibility\s*:\s*hidden/i.test(a.attrs?.style??''))return false;return true;};
const monthly=d=>d?.units===1&&d?.unitType==='Month';
export function bindRecurringSkus(tree,{monetary},bodyHash){
 const bindings=[];
 for(const script of tree.nodes.filter(n=>n.tag==='script'&&!n.attrs.src)){
  const raw=script.raw??'';if(!raw.includes('recurrencePolicySummary')||Buffer.byteLength(raw)>3500000)continue;
  // Only JSON literal assignment plus unrelated scalar initializations. No eval,
  // calls, mutations, computed properties or dynamic choice is interpreted.
  const assignments=[];let rest=raw.trim(),valid=true;
  while(rest){const m=/^window\.([A-Za-z_$][\w$]*)\s*=\s*/.exec(rest);if(!m){valid=false;break;}rest=rest.slice(m[0].length);let end=0;
   if(rest[0]==='{'){let depth=0,quoted=false,escape=false;for(;end<rest.length;end++){const ch=rest[end];if(quoted){if(escape)escape=false;else if(ch==='\\')escape=true;else if(ch==='"')quoted=false;}else if(ch==='"')quoted=true;else if(ch==='{')depth++;else if(ch==='}'&&!--depth){end++;break;}}}
   else end=/^(?:true|false|null)/.exec(rest)?.[0].length??0;
   if(!end){valid=false;break;}const literal=rest.slice(0,end);rest=rest.slice(end).trim();if(rest.startsWith(';'))rest=rest.slice(1).trim();else if(rest){valid=false;break;}
   let value;try{value=JSON.parse(literal);}catch{try{value=JSON.parse(literal.replace(/([,{]\s*)([A-Za-z_$][\w$]*)(\s*:)/g,'$1"$2"$3'));}catch{valid=false;break;}}
   if(assignments.some(a=>a.name===m[1])){valid=false;break;}assignments.push({name:m[1],value,literal});if(assignments.length>8){valid=false;break;}
  }
  if(!valid)continue;const candidates=assignments.filter(a=>a.literal.includes('recurrencePolicySummary'));if(candidates.length!==1)continue;
  // The commercial object itself must be strict JSON; ancillary scalar/object
  // initializations are validated but never consumed as commercial evidence.
  let root;try{root=JSON.parse(candidates[0].literal);}catch{continue;}
  const request=root.appContext?.requestInfo;let documentURL;try{documentURL=new URL(request.path,request.origin).href;if(new URL(documentURL).protocol!=='https:'||new URL(documentURL).origin!==request.origin)continue;}catch{continue;}
  const parts=new URL(documentURL).pathname.split('/').filter(Boolean),id=parts.at(-1),pp=pathOf(script)+'/literal';
  // Locate the one catalog carrying all three independently keyed relationship maps.
  const catalogs=[];let count=0;function visit(v,p,depth=0){if(++count>100000||depth>64)throw Error('SKU_BOUND');if(!v||typeof v!=='object')return;if(v.productSummaries&&v.skuSummaries&&v.availabilitySummaries)catalogs.push({v,p});for(const[k,x]of Object.entries(v))if(x&&typeof x==='object')visit(x,p+'/'+k,depth+1);}
  try{visit(root,pp);}catch{continue;}
  const owners=catalogs.filter(({v})=>v.productSummaries[id]);if(owners.length!==1)continue;const {v,p}=owners[0],product=v.productSummaries[id],sid=product.preferredSkuId,sku=v.skuSummaries[id]?.[sid];
  if(product.productId!==id||!sku||sku.productId!==id||sku.skuId!==sid||hidden(product)||hidden(sku)||typeof product.title!=='string'||product.title.length>100)continue;
  if(/\b(?:add.on|bundle|upgrade|trial|prepaid|from)\b/i.test(product.title)||product.bundledProductIds?.length)continue;
  // A visible product heading and response request path constrain the catalog to
  // this page's product; unrelated catalog entries cannot become observations.
  const heading=tree.nodes.filter(n=>n.tag==='h1'&&visible(n)&&(n.text===product.title||n.text.startsWith(product.title+' — ')));if(heading.length!==1)continue;
  const policy=sku.recurrencePolicySummary;if(policy?.isRecurring!==true||policy.hasTrial!==false||!monthly(policy.duration)||!monthly(policy.initialDuration))continue;
  const prices=product.specificPrices?.purchaseable?.filter(x=>x.skuId===sid);if(prices?.length!==1)continue;const price=prices[0],aid=sku.preferredAvailabilityId,availability=v.availabilitySummaries[id]?.[sid]?.[aid];
  if(!availability||availability.productId!==id||availability.skuId!==sid||availability.availabilityId!==aid||price.availabilityId!==aid||hidden(availability)||availability.subscriptionInitialOfferType!=='None'||availability.initialDurationsAtListPrice!==1)continue;
  if(!availability.actions?.includes('Purchase')||!price.availabilityActions?.includes('Purchase')||price.discountPercentage!==0||price.hasXPriceOffer!==false||price.eligibilityInfo?.eligibility!=='None'||!Number.isFinite(price.listPrice)||price.listPrice<=0||price.listPrice!==price.recurrencePrice||price.listPrice!==price.msrp||!/^[A-Z]{3}$/.test(price.currency))continue;
  const ap=availability.price;if(!ap||['skuId','availabilityId','listPrice','recurrencePrice','msrp','currency','discountPercentage','hasXPriceOffer'].some(k=>ap[k]!==price[k]))continue;
  const local=price.currency+' '+price.listPrice+'/month',ms=monetary(local);if(ms.length!==1)continue;
  const objectPath=p+'/productSummaries/'+id,pricePath=objectPath+'/specificPrices/purchaseable/'+product.specificPrices.purchaseable.indexOf(price),skuPath=p+'/skuSummaries/'+id+'/'+sid,availabilityPath=p+'/availabilitySummaries/'+id+'/'+sid+'/'+aid;
  const proof={bodyHash,relationship:'PAGE_PRODUCT_PREFERRED_SKU_RECURRING_AVAILABILITY',objectPath,namePath:objectPath+'/title',pricePath:pricePath+'/listPrice',currencyPath:pricePath+'/currency',cadencePath:skuPath+'/recurrencePolicySummary',availabilityPath,requestPath:pp+'/appContext/requestInfo',headingPath:pathOf(heading[0]),productId:id,skuId:sid,availabilityId:aid,price,policy,explicitPriceRole:'REGULAR_BASE'};
  bindings.push({name:product.title,monetary:ms[0],local,role:'REGULAR_BASE',path:proof.pricePath,proof,materialization:{version:1,kind:'PAGE_LINKED_RECURRING_SKU',bodyHash,documentURL,offerURL:documentURL,pageBound:true,documentPath:proof.requestPath,offerURLPath:proof.requestPath,relationship:proof.relationship}});
 }
 return {bindings,diagnostics:[]};
}
