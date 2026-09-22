// Non-executing, bounded materialization of rendered JSON-LD in Flight state.
// No provider dispatch, global text decoding, URL fetching or currency defaults.
import {createHash} from 'node:crypto';
export const materializationBounds=Object.freeze({sourceBytes:4000000,payloadBytes:262144,decodeDepth:3,records:2048,values:30000,objectDepth:48,products:128,offers:512,diagnostics:256,evidenceLinks:16,outputBytes:2097152});
const digest=x=>createHash('sha256').update(x).digest('hex');
const canonical=x=>JSON.stringify(x&&typeof x==='object'?Array.isArray(x)?x.map(x=>JSON.parse(canonical(x))):Object.fromEntries(Object.keys(x).sort().map(k=>[k,JSON.parse(canonical(x[k]))])):x);
const pathOf=n=>n.parent?pathOf(n.parent)+'/'+n.tag+'['+n.index+']':'$';
const norm=x=>String(x??'').normalize('NFKC').replace(/\s+/g,' ').trim();
const primitiveFields=(v,keys)=>Object.fromEntries(keys.filter(k=>v[k]!==undefined&&(v[k]===null||['string','number','boolean'].includes(typeof v[k]))).map(k=>[k,v[k]]));
const scopeKeys=['country','country_code','market','addressCountry','eligibleRegion','areaServed'];
const scoped=(v,copy)=>{for(const k of scopeKeys)if(v[k]!==undefined){const clean=x=>x&&typeof x==='object'?primitiveFields(x,['identifier','name','addressCountry']):x;copy[k]=Array.isArray(v[k])?v[k].map(clean):clean(v[k]);}return copy;};
const offerKeys=['@type','name','price','priceCurrency','category','url','billingPeriod','billingInterval','billingDuration','unitText','recurring','autoRenew','isRecurringProduct','priceType','description','duration','duration_type','isAddOn','regularPrice','salePrice','old_price','original_price','price_for_month',...scopeKeys];
function offerProjection(o){const copy=scoped(o,primitiveFields(o,offerKeys));if(o.priceSpecification){const list=Array.isArray(o.priceSpecification)?o.priceSpecification:[o.priceSpecification];const specs=list.filter(v=>v&&typeof v==='object').map(v=>scoped(v,primitiveFields(v,offerKeys)));copy.priceSpecification=Array.isArray(o.priceSpecification)?specs:specs[0];}return copy;}
const type=(v,t)=>v?.['@type']===t||v?.['@type']==='https://schema.org/'+t;
const sameOrigin=(a,b)=>{try{return /^https?:$/.test(new URL(a).protocol)&&new URL(a).origin===new URL(b).origin;}catch{return false;}};
const sameURL=(a,b)=>{try{const x=new URL(a),y=new URL(b);return /^https?:$/.test(x.protocol)&&x.origin===y.origin&&x.pathname.replace(/\/$/,'')===y.pathname.replace(/\/$/,'')&&x.search===y.search;}catch{return false;}};
export function materializeStructured(tree,bodyHash,limits={}){
 const b={...materializationBounds,...limits},diagnostics=[],payloads=[],frames=new Map(),chunks=[];let visited=0,offerCount=0,productCount=0,outputBytes=0;
 let omittedDiagnostics=0;const hardStops=new Set();const reject=(reason,path)=>{if(/_BOUND$/.test(reason))hardStops.add(reason);if(diagnostics.length<b.diagnostics)diagnostics.push({reason,path});else omittedDiagnostics++;};
 function visit(v,path,fn,depth=0){if(depth>b.objectDepth){reject('OBJECT_DEPTH_BOUND',path);return;}if(++visited>b.values){if(visited===b.values+1)reject('VALUE_BOUND',path);return;}fn(v,path);if(v&&typeof v==='object')for(const [k,x]of Object.entries(v))visit(x,path+'/'+k.replaceAll('~','~0').replaceAll('/','~1'),fn,depth+1);}
 if(tree.root.end>b.sourceBytes){reject('SOURCE_BOUND','$');return {payloads,diagnostics,bounds:b};}
 for(const n of tree.nodes.filter(n=>n.tag==='script'&&!n.attrs.src)){
  if(chunks.length>=b.records){reject('CHUNK_BOUND',pathOf(n));break;}
  const m=/^\s*self\.__next_f\.push\((\[[\s\S]*\])\);?\s*$/.exec(n.raw??'');if(!m)continue;
  if(Buffer.byteLength(m[1])>b.payloadBytes){reject('PAYLOAD_SIZE_BOUND',pathOf(n));continue;}
  try{const a=JSON.parse(m[1]);if(a.length===2&&a[0]===1&&typeof a[1]==='string')chunks.push({text:a[1],path:pathOf(n),span:[n.openEnd,n.end],steps:['JSON_PARSE_FLIGHT_PUSH_ARGUMENT']});}catch{reject('MALFORMED_FLIGHT_ARGUMENT',pathOf(n));}
 }
 // Flight text frames have an explicit UTF-8 byte length. Resolve only complete
 // records; never guess delimiters inside a JSON string or execute JS expressions.
 const stream=Buffer.concat(chunks.map(c=>Buffer.from(c.text)));if(stream.length>b.sourceBytes){reject('SOURCE_BOUND','$');return {payloads,diagnostics,bounds:b};}let offset=0,position=0;const ranges=chunks.map(c=>{const start=position;position+=Buffer.byteLength(c.text);return {...c,start,end:position};});
 let recordAttempts=0;while(offset<stream.length&&recordAttempts++<b.records){const tail=stream.subarray(offset,offset+64).toString('utf8'),m=/^([\da-f]+):T([\da-f]+),/.exec(tail);let id,text,end;
  if(m){id=m[1];const size=parseInt(m[2],16),start=offset+Buffer.byteLength(m[0]);end=start+size;if(size>b.payloadBytes||end>stream.length){reject(size>b.payloadBytes?'PAYLOAD_SIZE_BOUND':'INCOMPLETE_TEXT_RECORD','flight:'+id);break;}text=stream.subarray(start,end).toString('utf8');}
  else {const e=stream.indexOf(10,offset);if(e<0)break;if(e-offset>b.payloadBytes){reject('PAYLOAD_SIZE_BOUND','flight-byte:'+offset);break;}end=e+1;const line=stream.subarray(offset,e).toString('utf8'),x=/^([\da-f]+):([\s\S]*)$/.exec(line);if(!x){reject('UNRECOGNIZED_RECORD','flight-byte:'+offset);offset=end;continue;}id=x[1];text=x[2];}
  const origins=ranges.filter(c=>c.start<end&&c.end>offset).map(({path,span,steps})=>({path,span,steps}));
  if(frames.has(id)){reject('DUPLICATE_RECORD_ID','flight:'+id);frames.set(id,null);}else if(Buffer.byteLength(text)>b.payloadBytes)reject('PAYLOAD_SIZE_BOUND','flight:'+id);else {let value;try{value=JSON.parse(text);}catch{}frames.set(id,{id,text,value,origins,textRecord:!!m});}offset=end;
 }
 if(offset<stream.length&&recordAttempts>=b.records)reject('RECORD_BOUND','$');
 const configs=[],rendered=[],refs=[];
 function render(v,path,origins,depth=0){if(depth>b.objectDepth)return;if(!Array.isArray(v))return;
  if(v[0]==='$'&&typeof v[1]==='string'&&v[3]&&typeof v[3]==='object'){
   if(v[1]==='script'&&v[3].type==='application/ld+json'&&!v[3].src&&typeof v[3].dangerouslySetInnerHTML?.__html==='string')refs.push({value:v[3].dangerouslySetInnerHTML.__html,path:path+'/3/dangerouslySetInnerHTML/__html',origins});
   if(['div','section','article'].includes(v[1]))rendered.push({value:v,path,origins});
   render(v[3].children,path+'/3/children',origins,depth+1);
  }else v.forEach((x,i)=>render(x,path+'/'+i,origins,depth+1));
 }

 for(const f of frames.values()){if(!f?.value||f.textRecord)continue;visit(f.value,'flight:'+f.id,(v,path)=>{
  if(v&&typeof v==='object'&&!Array.isArray(v)&&typeof v.productName==='string'&&Array.isArray(v.periodProductList))configs.push({value:v,path,origins:f.origins});
 });render(f.value,'flight:'+f.id,f.origins);}
 const documentURLs=tree.nodes.filter(n=>n.tag==='link'&&n.attrs.rel==='canonical').map(n=>n.attrs.href);const documentURL=documentURLs.length===1?documentURLs[0]:null;
 function renderedText(v){if(typeof v==='string')return v.startsWith('$')?'':v;if(!Array.isArray(v))return '';if(v[0]==='$'){if(['script','style'].includes(v[1]))return '';return renderedText(v[3]?.children);}return v.map(renderedText).join(' ');}
 function headings(v){if(!Array.isArray(v))return [];if(v[0]==='$')return /^h[1-6]$/.test(v[1])?[norm(renderedText(v[3]?.children))]:headings(v[3]?.children);return v.flatMap(headings);}
 const seen=new Set();
 // An already directly parseable Product is not new evidence when Flight embeds
 // the same JSON-LD again. Preserve its existing paths and conflict population.
 if(refs.length)for(const n of tree.nodes.filter(n=>n.tag==='script')){let value;try{value=JSON.parse(n.raw);}catch{continue;}visit(value,pathOf(n),(v)=>{if(type(v,'Product')&&v.offers){try{seen.add(digest(canonical(v)));}catch{reject('OBJECT_DEPTH_BOUND',pathOf(n));}}});}

 for(const ref of refs){let text=ref.value,origin=ref,depth=0;const ids=new Set();
  while(/^\$[\da-f]+$/.test(text)){if(++depth>b.decodeDepth){reject('DECODE_DEPTH_BOUND',ref.path);text=null;break;}const id=text.slice(1);if(ids.has(id)){reject('REFERENCE_CYCLE',ref.path);text=null;break;}ids.add(id);const f=frames.get(id);if(!f||!f.textRecord){reject('UNRESOLVED_TEXT_REFERENCE',ref.path);text=null;break;}text=f.text;origin={...f,path:'flight:'+id};}
  if(text===null)continue;let value;
  for(;;){if(Buffer.byteLength(text)>b.payloadBytes){reject('PAYLOAD_SIZE_BOUND',ref.path);break;}if(++depth>b.decodeDepth){reject('DECODE_DEPTH_BOUND',ref.path);break;}try{value=JSON.parse(text);}catch{reject('MALFORMED_RENDERED_JSON_LD',ref.path);break;}if(typeof value!=='string')break;text=value;value=undefined;}
  if(!value||typeof value!=='object')continue;
  const stack=[{v:value,depth:0}];let count=0,valid=true;
  while(stack.length){const x=stack.pop();if(++count>b.values||x.depth>b.objectDepth){reject(count>b.values?'VALUE_BOUND':'OBJECT_DEPTH_BOUND',ref.path);valid=false;break;}if(x.v&&typeof x.v==='object')for(const v of Object.values(x.v))stack.push({v,depth:x.depth+1});}
  if(!valid)continue;

  const candidates=[];visit(value,'$payload',(v,path)=>{if(type(v,'Product')&&typeof v.name==='string'&&v.offers)candidates.push({value:v,path});});
  for(const p of candidates){if(++productCount>b.products){reject('PRODUCT_BOUND',p.path);break;}const key=digest(canonical(p.value));if(seen.has(key)){reject('DUPLICATE_PRODUCT',p.path);continue;}seen.add(key);
   const original=structuredClone(p.value),projected=scoped(original,primitiveFields(original,['@context','@type','name','productName','planName','productId','sku',...scopeKeys])),offers=Array.isArray(original.offers)?original.offers:[original.offers],metadata={};
   const brand=typeof original.brand==='string'?original.brand:original.brand?.name;
   const short=brand&&norm(original.name).startsWith(norm(brand)+' ')?norm(original.name).slice(norm(brand).length+1):norm(original.name);
   const related=configs.filter(c=>[norm(original.name),short].includes(norm(c.value.productName)));
   const productPath=(origin.origins?.[0]?.path??ref.origins[0]?.path??'$')+'/materialized/'+key;
   const projectedOffers=[];
   for(const [i,o]of offers.entries()){if(++offerCount>b.offers){reject('OFFER_BOUND',p.path+'/offers/'+i);break;}if(!type(o,'Offer')||typeof o.price!=='number'&&typeof o.price!=='string'){reject('NOT_PRICED_OFFER',p.path+'/offers/'+i);continue;}
    if(!sameOrigin(o.url,documentURL)){reject('PROVIDER_DESTINATION_NOT_ESTABLISHED',p.path+'/offers/'+i);continue;}
    const copy=offerProjection(o),periods=related.flatMap(c=>c.value.periodProductList.map((v,j)=>({value:v,path:c.path+'/periodProductList/'+j,origins:c.origins}))).filter(c=>c.value.type===o.category&&String(c.value.recurPrice)===String(o.price));
    if(periods.length>b.evidenceLinks){reject('EVIDENCE_LINK_BOUND',p.path);continue;}
    const names=[norm(original.name),short];
    const terms=rendered.map(r=>({...r,text:norm(renderedText(r.value))})).filter(r=>names.some(n=>n&&headings(r.value).some(h=>h===n||h.startsWith(n+' ')))&&/(?:보유한 경우에만|기준 계정.{0,60}(?:해지|변경)|requires? (?:an? )?(?:existing|base) subscription)/iu.test(r.text));
    // Smallest rendered terms region naming this exact product, not page-wide prose.
    const boundedTerms=terms.filter(r=>!terms.some(t=>t.path.startsWith(r.path+'/')));
    if(boundedTerms.length>b.evidenceLinks){reject('EVIDENCE_LINK_BOUND',p.path);continue;}
    const addon=boundedTerms.length>0||o.isAddOn===true||original.isAddOn===true;
    const mode=['MONTH','YEAR'].includes(o.category)?o.category:null;
    const recurring=mode&&periods.length&&periods.every(c=>c.value.recurDcRate===0||mode==='YEAR');
    if(recurring){copy.billingPeriod=mode;copy.recurring=true;}
    // Exact recurring field is role evidence; never reinterpret an explicit sale.
    if(recurring&&!copy.priceType&&periods.every(c=>c.value.recurDcRate===0))copy.priceType='RegularPrice';
    if(addon)copy.description=[copy.description,'extra member add-on'].filter(Boolean).join(' ');
    if(!recurring&&mode==='YEAR')copy.billingPeriod='YEAR';
    const m={bodyHash,container:ref,origin:{path:origin.path,origins:origin.origins??ref.origins},productObjectPath:p.path,offerObjectPath:p.path+'/offers'+(Array.isArray(original.offers)?'/'+i:''),productPath,originalProduct:original.name,originalOffer:o,decodingDepth:depth,payloadHash:key,documentURL,offerURL:o.url??null,pageBound:!!documentURL&&sameURL(documentURL,o.url),recurrenceEvidence:periods,dependencyEvidence:boundedTerms.map(({path,text,origins})=>({path,text,origins})),addon,normalizations:{billingPeriod:copy.billingPeriod??null,priceType:copy.priceType??null,productNameOwnsOffer:true}};
    metadata[productPath+'/offers/'+projectedOffers.length+'/price']=m;projectedOffers.push(copy);
   }
   projected.offers=projectedOffers;outputBytes+=Buffer.byteLength(JSON.stringify({projected,original,metadata}));if(outputBytes>b.outputBytes){reject('OUTPUT_SIZE_BOUND',p.path);break;}payloads.push({path:productPath,value:projected,original,metadata});
  }
 }
 if(hardStops.size)payloads.length=0;
 return {payloads,diagnostics,bounds:b,hardStopReasons:[...hardStops].sort(),records:frames.size,recordAttempts:Math.min(recordAttempts,b.records),omittedDiagnostics,valuesInspected:Math.min(visited,b.values),recognizedJSONLD:refs.length,products:payloads.length,offers:Object.values(payloads).reduce((n,p)=>n+p.value.offers.length,0)};
}
export function isResponseBoundPayload(c,context){const m=c.materialization;return !!m?.pageBound&&m.bodyHash===context.bodyHash&&(context.sourceOccurrences??[]).some(o=>sameURL(String(o.url).split('?')[0],String(m.documentURL).split('?')[0])&&sameURL(m.documentURL,m.offerURL));}

export function isProviderBoundPayload(c,context){const m=c.materialization;return !m||m.bodyHash===context.bodyHash&&(context.sourceOccurrences??[]).some(o=>sameOrigin(o.url,m.documentURL)&&sameOrigin(o.url,m.offerURL));}
